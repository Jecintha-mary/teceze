import frappe
from frappe import _
from frappe.utils import add_days, date_diff, getdate, nowdate


def execute(filters=None):
    """Employee Attendance Overview Report."""
    if not filters:
        filters = {}

    if not filters.get("from_date"):
        filters["from_date"] = nowdate()
    if not filters.get("to_date"):
        filters["to_date"] = nowdate()

    validate_filters(filters)

    columns = get_columns()
    employees = get_employees(filters)

    # Return columns early if no employees match filters
    if not employees:
        return columns, []

    employee_ids = [e.name for e in employees]
    dates = get_date_range(filters.get("from_date"), filters.get("to_date"))

    # Pre-fetch lookup maps
    attendance_map = get_attendance_map(filters, employee_ids)
    leave_map = get_leave_map(filters, employee_ids)
    att_req_map = get_attendance_request_map(filters, employee_ids)

    data = []

    for emp in employees:
        for d in dates:
            date_str = str(d)
            emp_id = emp.name

            att_info = attendance_map.get((emp_id, date_str), {})
            leave_info = leave_map.get((emp_id, date_str), {})
            att_req_info = att_req_map.get((emp_id, date_str), {})

            active_shift = att_info.get("shift") or "-"
            attendance_status = att_info.get("status") or "-"

            # Dynamic Request / Leave Details
            request_details = "-"
            if leave_info:
                l_type = leave_info.get("leave_type") or "-"
                l_stat = leave_info.get("status") or "-"
                request_details = f"On Leave / {l_type} / {l_stat}"
            elif att_req_info:
                reason = att_req_info.get("reason") or "-"
                status = att_req_info.get("status") or "-"
                request_details = f"{reason} / {status}"

            if (
                filters.get("attendance_status")
                and attendance_status != filters.get("attendance_status")
            ):
                continue

            row = {
                "date": date_str,
                "employee": emp_id,
                "employee_name": emp.employee_name,
                "department": emp.department,
                "employment_type": emp.get("employment_type") or "-",
                "shift": active_shift,
                "check_in": att_info.get("in_time") or "-",
                "check_out": att_info.get("out_time") or "-",
                "working_hours": att_info.get("working_hours") or "-",
                "late_entry": att_info.get("late_entry") or "-",
                "early_exit": att_info.get("early_exit") or "-",
                "attendance_status": attendance_status,
                "request_details": request_details,
            }
            data.append(row)

    return columns, data


def validate_filters(filters):
    """Validate date filters."""
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")

    if not from_date or not to_date:
        frappe.throw(_("Both From Date and To Date are required."))

    if getdate(from_date) > getdate(to_date):
        frappe.throw(_("From Date cannot be greater than To Date."))


def get_employees(filters):
    """Fetch active employees, excluding Engineer using case-insensitive check."""
    conditions = {"status": "Active"}

    if filters.get("employee"):
        conditions["name"] = filters.get("employee")

    if filters.get("department"):
        conditions["department"] = filters.get("department")

    if filters.get("country"):
        conditions["custom_country"] = filters.get("country")

    if filters.get("employment_type"):
        conditions["employment_type"] = filters.get("employment_type")
    else:
        # Safely exclude 'Engineer' or 'engineer' using NOT LIKE
        conditions["employment_type"] = ["not like", "%engineer%"]

    return frappe.get_all(
        "Employee",
        filters=conditions,
        fields=["name", "employee_name", "department", "employment_type"],
        order_by="employee_name asc",
    )


def get_date_range(from_date, to_date):
    """Generate list of dates between from_date and to_date."""
    start = getdate(from_date)
    end = getdate(to_date)
    total_days = date_diff(end, start) + 1
    return [add_days(start, i) for i in range(total_days)]


def get_attendance_map(filters, employee_ids):
    """Fetch Attendance records for target employees."""
    att_filters = {
        "attendance_date": [
            "between",
            [filters.get("from_date"), filters.get("to_date")],
        ],
        "docstatus": 1,
        "employee": ["in", employee_ids],
    }

    records = frappe.get_all(
        "Attendance",
        filters=att_filters,
        fields=[
            "employee",
            "attendance_date",
            "status",
            "shift",
            "in_time",
            "out_time",
            "working_hours",
            "late_entry",
            "early_exit",
        ],
    )

    att_map = {}
    for rec in records:
        key = (rec.employee, str(rec.attendance_date))
        att_map[key] = {
            "status": rec.status,
            "shift": rec.shift,
            "in_time": rec.in_time,
            "out_time": rec.out_time,
            "working_hours": rec.working_hours,
            "late_entry": _("Yes") if rec.late_entry else _("No"),
            "early_exit": _("Yes") if rec.early_exit else _("No"),
        }
    return att_map


def get_leave_map(filters, employee_ids):
    """Index Leave Applications by (employee, date)."""
    leave_filters = {
        "from_date": ["<=", filters.get("to_date")],
        "to_date": [">=", filters.get("from_date")],
        "docstatus": ["<", 2],
        "employee": ["in", employee_ids],
    }

    leaves = frappe.get_all(
        "Leave Application",
        filters=leave_filters,
        fields=[
            "employee",
            "from_date",
            "to_date",
            "leave_type",
            "status",
            "docstatus",
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
            if str(filters.get("from_date")) <= curr_str <= str(filters.get("to_date")):
                leave_map[(lve.employee, curr_str)] = {
                    "leave_type": lve.leave_type,
                    "status": status,
                }
            curr = add_days(curr, 1)

    return leave_map


def get_attendance_request_map(filters, employee_ids):
    """Index Attendance Requests by (employee, date)."""
    doctype = "Attendance Request"
    if not frappe.db.exists("DocType", doctype):
        return {}

    req_filters = {
        "from_date": ["<=", filters.get("to_date")],
        "docstatus": ["<", 2],
        "employee": ["in", employee_ids],
    }

    fields = ["employee", "from_date", "to_date", "workflow_state", "docstatus"]
    has_reason = frappe.db.has_column(doctype, "reason")
    if has_reason:
        fields.append("reason")

    requests = frappe.get_all(
        doctype,
        filters=req_filters,
        fields=fields,
        ignore_permissions=True,
    )

    req_map = {}
    for req in requests:
        start = getdate(req.from_date)
        end = getdate(req.to_date) if req.to_date else start

        status = req.get("workflow_state") or (
            "Draft" if req.docstatus == 0 else "Submitted"
        )
        reason = req.get("reason", "") if has_reason else ""

        curr = start
        while curr <= end:
            curr_str = str(curr)
            if str(filters.get("from_date")) <= curr_str <= str(filters.get("to_date")):
                req_map[(req.employee, curr_str)] = {
                    "reason": reason,
                    "status": status,
                }
            curr = add_days(curr, 1)

    return req_map


def get_columns():
    """Columns definition matching report grid layout."""
    return [
       
        {
            "label": _("Employee ID"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 130,
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 170,
        },
        {
            "label": _("Department"),
            "fieldname": "department",
            "fieldtype": "Link",
            "options": "Department",
            "width": 140,
        },
        {
            "label": _("Employment Type"),
            "fieldname": "employment_type",
            "fieldtype": "Link",
            "options": "Employment Type",
            "width": 140,
        },
        {
            "label": _("Shift"),
            "fieldname": "shift",
            "fieldtype": "Link",
            "options": "Shift Type",
            "width": 120,
        },
        {
			"label": _("Date"),
			"fieldname": "date",
			"fieldtype": "Date",
			"width": 105,
		},
        {
            "label": _("Check In"),
            "fieldname": "check_in",
            "fieldtype": "Data",
            "width": 100,
        },
        {
            "label": _("Check Out"),
            "fieldname": "check_out",
            "fieldtype": "Data",
            "width": 100,
        },
        {
            "label": _("W.Hrs"),
            "fieldname": "working_hours",
            "fieldtype": "Data",
            "width": 90,
        },
        {
            "label": _("Late Entry"),
            "fieldname": "late_entry",
            "fieldtype": "Data",
            "width": 90,
        },
        {
            "label": _("Early Exit"),
            "fieldname": "early_exit",
            "fieldtype": "Data",
            "width": 90,
        },
        {
            "label": _("Att.Status"),
            "fieldname": "attendance_status",
            "fieldtype": "Data",
            "width": 120,
        },
        {
            "label": _("Request / Leave"),
            "fieldname": "request_details",
            "fieldtype": "Data",
            "width": 240,
        },
    ]