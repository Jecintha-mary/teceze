import datetime
import frappe
from frappe import _
from frappe.utils import (
    add_days,
    date_diff,
    get_time,
    getdate,
    nowdate,
)
def execute(filters=None):
    """Single Employee Attendance Report."""
    if not filters:
        filters = {}

    if not filters.get("from_date"):
        filters["from_date"] = nowdate()
    if not filters.get("to_date"):
        filters["to_date"] = nowdate()

    validate_filters(filters)

    columns = get_columns(filters)
    data = get_data(filters)

    return columns, data


def validate_filters(filters):
    """Validate date and employee filters."""
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    employee = filters.get("employee")

    if not from_date or not to_date:
        frappe.throw(_("Both From Date and To Date are required."))

    if getdate(from_date) > getdate(to_date):
        frappe.throw(_("From Date cannot be greater than To Date."))

    if not employee:
        frappe.throw(_("Employee filter is required."))

    emp_details = frappe.db.get_value(
        "Employee",
        employee,
        ["status", "employment_type"],
        as_dict=True,
    )

    if not emp_details:
        frappe.throw(_("Employee {0} not found.").format(employee))

    if emp_details.status != "Active":
        frappe.throw(_("Selected Employee must be Active."))

    emp_type = (emp_details.employment_type or "").lower()
    if "engineer" in emp_type:
        frappe.throw(
            _("Employee with Employment Type 'Engineer' is excluded from this report.")
        )


def get_columns(filters):
    """Generate dynamic columns with dates horizontally."""
    columns = [
        {
            "label": _("Attendance Details"),
            "fieldname": "detail_label",
            "fieldtype": "Data",
            "width": 180,
        }
    ]

    dates = get_date_range(filters.get("from_date"), filters.get("to_date"))
    for d in dates:
        columns.append(
            {
                "label": d.strftime("%d-%b"),  # e.g., 25-Sep
                "fieldname": str(d),
                "fieldtype": "Data",
                "width": 300,
            }
        )

    return columns


def get_data(filters):
    """Fetch and map vertical metric rows across horizontal dates."""
    emp_id = filters.get("employee")
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    dates = get_date_range(from_date, to_date)

    # 1. Bulk pre-fetch core datasets
    attendance_map = get_attendance_map(emp_id, from_date, to_date)
    leave_map = get_leave_map(emp_id, from_date, to_date)
    att_req_map = get_attendance_request_map(emp_id, from_date, to_date)

    # 2. Fetch holidays ONLY for dates missing Attendance
    attendance_dates = set(attendance_map.keys())
    missing_attendance_dates = [
        str(d) for d in dates if str(d) not in attendance_dates
    ]
    holidays_map = get_holidays_map(
        emp_id,
        from_date,
        to_date,
        missing_attendance_dates,
    )

    row_keys = [
        ("shift", _("Shift")),
        ("check_in", _("Check In")),
        ("check_out", _("Check Out")),
        ("early_exit", _("Early Exit")),
        ("late_entry", _("Late Entry")),
        ("attendance_status", _("Attendance Status")),
        ("other_half_status", _("Other Half Status")),
        ("details", _("Details")),
    ]

    rows_dict = {key: {"detail_label": label} for key, label in row_keys}

    for d in dates:
        date_str = str(d)

        att_info = attendance_map.get(date_str, {})
        leave_info = leave_map.get(date_str, {})
        att_req_info = att_req_map.get(date_str, {})
        holiday_type = holidays_map.get(date_str)

        # Lookup Shift Type timings directly from Attendance.shift
        shift_type_name = att_info.get("shift")
        shift_start_time = None
        shift_end_time = None

        if shift_type_name and frappe.db.exists("Shift Type", shift_type_name):
            shift_type_doc = frappe.get_cached_doc("Shift Type", shift_type_name)
            shift_start_time = shift_type_doc.start_time
            shift_end_time = shift_type_doc.end_time

        # 1. Shift
        shift_display = shift_type_name or "-"

        # 2. Check In
        check_in_raw = att_info.get("in_time")
        check_in_display = (
            format_time_display(check_in_raw) if check_in_raw else "-"
        )

        # 3. Check Out
        check_out_raw = att_info.get("out_time")
        check_out_display = (
            format_time_display(check_out_raw) if check_out_raw else "-"
        )

        # 4. Late Entry Calculation (Source of truth: Attendance.late_entry == 1)
        late_entry_display = "-"
        if att_info.get("late_entry") and check_in_raw and shift_start_time:
            late_secs = calculate_late_entry(check_in_raw, shift_start_time)
            if late_secs > 0:
                late_entry_display = format_duration(late_secs)

        # 5. Early Exit Calculation (Source of truth: Attendance.early_exit == 1)
        early_exit_display = "-"
        if att_info.get("early_exit") and check_out_raw and shift_end_time:
            early_secs = calculate_early_exit(
                check_out_raw, shift_end_time, shift_start_time
            )
            if early_secs > 0:
                early_exit_display = format_duration(early_secs)

        # 6. Attendance Status Resolution
        att_status = att_info.get("status")
        if att_status:
            pass  # Attendance record takes absolute priority
        elif leave_info and leave_info.get("status") in ["Approved", "Submitted", "Open"]:
            att_status = leave_info.get("leave_type") or "On Leave"
        elif holiday_type == "Weekly Off":
            att_status = "Weekly Off"
        elif holiday_type == "Holiday":
            att_status = "Holiday"
        else:
            att_status = "Absent"

        # 7. Other Half Status
        other_half_status = resolve_other_half_status(att_status, leave_info)

        # 8. Details Concatenation
        request_parts = []
        if leave_info:
            l_type = leave_info.get("leave_type") or "-"
            l_stat = leave_info.get("status") or "-"
            request_parts.append(f"On Leave / {l_type} / {l_stat}")

        if att_req_info:
            reason = att_req_info.get("reason") or "-"
            status = att_req_info.get("status") or "-"
            request_parts.append(f"{reason} / {status}")

        details_value = " | ".join(request_parts) if request_parts else "-"

        # Assign values to columns
        rows_dict["shift"][date_str] = shift_display
        rows_dict["check_in"][date_str] = check_in_display
        rows_dict["check_out"][date_str] = check_out_display
        rows_dict["late_entry"][date_str] = late_entry_display
        rows_dict["early_exit"][date_str] = early_exit_display
        rows_dict["attendance_status"][date_str] = att_status
        rows_dict["other_half_status"][date_str] = other_half_status
        rows_dict["details"][date_str] = details_value

    return [rows_dict[key] for key, _ in row_keys]


# -------------------------------------------------------------------------
# DATA FETCHING & MAPPING HELPERS
# -------------------------------------------------------------------------

def get_date_range(from_date, to_date):
    start = getdate(from_date)
    end = getdate(to_date)
    total_days = date_diff(end, start) + 1
    return [add_days(start, i) for i in range(total_days)]


def get_attendance_map(employee, from_date, to_date):
    records = frappe.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [from_date, to_date]],
            "docstatus": 1,
        },
        fields=[
            "attendance_date",
            "status",
            "shift",
            "in_time",
            "out_time",
            "late_entry",
            "early_exit",
        ],
    )
    return {str(rec.attendance_date): rec for rec in records}


def get_leave_map(employee, from_date, to_date):
    leaves = frappe.get_all(
        "Leave Application",
        filters={
            "employee": employee,
            "from_date": ["<=", to_date],
            "to_date": [">=", from_date],
            "docstatus": ["<", 2],
        },
        fields=[
            "from_date",
            "to_date",
            "leave_type",
            "status",
            "docstatus",
            "half_day",
            "half_day_date",
        ],
    )

    leave_map = {}
    for lve in leaves:
        start = getdate(lve.from_date)
        end = getdate(lve.to_date)
        status = "Draft" if lve.docstatus == 0 else lve.status

        curr = start
        while curr <= end:
            curr_str = str(curr)
            if str(from_date) <= curr_str <= str(to_date):
                leave_map[curr_str] = {
                    "leave_type": lve.leave_type,
                    "status": status,
                    "half_day": lve.half_day,
                    "half_day_date": str(lve.half_day_date) if lve.half_day_date else None,
                    "curr_date": curr_str,
                }
            curr = add_days(curr, 1)

    return leave_map


def get_attendance_request_map(employee, from_date, to_date):
    doctype = "Attendance Request"
    if not frappe.db.exists("DocType", doctype):
        return {}

    fields = ["from_date", "to_date", "workflow_state", "docstatus"]
    has_reason = frappe.db.has_column(doctype, "reason")
    if has_reason:
        fields.append("reason")

    requests = frappe.get_all(
        doctype,
        filters={
            "employee": employee,
            "from_date": ["<=", to_date],
            "to_date": [">=", from_date],
            "docstatus": ["<", 2],
        },
        fields=fields,
        ignore_permissions=True,
    )

    req_map = {}
    for req in requests:
        start = getdate(req.from_date)
        end = getdate(req.to_date) if req.to_date else start
        status = req.get("workflow_state") or ("Draft" if req.docstatus == 0 else "Submitted")
        reason = req.get("reason", "") if has_reason else ""

        curr = start
        while curr <= end:
            curr_str = str(curr)
            if str(from_date) <= curr_str <= str(to_date):
                req_map[curr_str] = {
                    "reason": reason,
                    "status": status,
                }
            curr = add_days(curr, 1)

    return req_map


def get_holidays_map(employee, from_date, to_date, required_dates=None):
    if not required_dates:
        return {}

    holiday_list = frappe.db.get_value("Employee", employee, "holiday_list")

    if not holiday_list:
        company = frappe.db.get_value("Employee", employee, "company")
        if company:
            holiday_list = frappe.db.get_value("Company", company, "default_holiday_list")

    if not holiday_list:
        return {}

    holidays = frappe.get_all(
        "Holiday",
        filters={
            "parent": holiday_list,
            "holiday_date": ["in", required_dates],
        },
        fields=["holiday_date", "weekly_off"],
    )

    holidays_map = {}
    for h in holidays:
        date_str = str(h.holiday_date)
        holidays_map[date_str] = "Weekly Off" if h.weekly_off else "Holiday"

    return holidays_map


# -------------------------------------------------------------------------
# TIME & DURATION CALCULATION HELPERS
# -------------------------------------------------------------------------

def resolve_other_half_status(attendance_status, leave_info):
    if attendance_status == "Half Day":
        if leave_info:
            return leave_info.get("leave_type") or "On Leave"
        return "Absent"

    if leave_info and leave_info.get("half_day"):
        hd_date = leave_info.get("half_day_date")
        if not hd_date or hd_date == leave_info.get("curr_date"):
            return leave_info.get("leave_type") or "On Leave"

    return "-"


def time_to_seconds(time_val):
    """Safely converts timedelta, time, datetime, or string to seconds from midnight."""
    if not time_val:
        return 0

    if isinstance(time_val, datetime.timedelta):
        return int(time_val.total_seconds())

    if isinstance(time_val, datetime.datetime):
        return time_val.hour * 3600 + time_val.minute * 60 + time_val.second

    t = get_time(time_val)
    return t.hour * 3600 + t.minute * 60 + t.second


def calculate_late_entry(check_in_raw, shift_start_raw):
    """Calculates late entry duration in seconds."""
    in_sec = time_to_seconds(check_in_raw)
    start_sec = time_to_seconds(shift_start_raw)
    diff = in_sec - start_sec
    return diff if diff > 0 else 0


def calculate_early_exit(check_out_raw, shift_end_raw, shift_start_raw=None):
    """Calculates early exit duration in seconds, handling overnight shift boundaries."""
    out_sec = time_to_seconds(check_out_raw)
    end_sec = time_to_seconds(shift_end_raw)

    # Overnight shift handling (e.g., end_time < start_time)
    if shift_start_raw:
        start_sec = time_to_seconds(shift_start_raw)
        if end_sec < start_sec:
            end_sec += 86400  # Add 24 hours
            if out_sec < start_sec:
                out_sec += 86400

    diff = end_sec - out_sec
    return diff if diff > 0 else 0


def format_duration(seconds):
    """Formats total seconds into an human-readable string (e.g., '1 hr 30 min')."""
    if not seconds or seconds <= 0:
        return "-"

    total_minutes = int(seconds // 60)
    hours = total_minutes // 60
    minutes = total_minutes % 60

    if hours > 0 and minutes > 0:
        return f"{hours} hr {minutes} min"
    elif hours > 0:
        return f"{hours} hr"
    elif minutes > 0:
        return f"{minutes} min"

    return "-"


def format_time_display(time_val):
    """Formats raw time/timedelta into 12-hour AM/PM format."""
    if not time_val:
        return "-"

    if isinstance(time_val, datetime.timedelta):
        total_seconds = int(time_val.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        t = datetime.time(hour=hours, minute=minutes)
    else:
        t = get_time(time_val)

    return t.strftime("%I:%M %p")