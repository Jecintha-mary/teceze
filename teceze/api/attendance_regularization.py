import frappe

from frappe import _

from frappe.utils import (
    get_first_day,
    get_last_day,
    getdate,
    time_diff_in_hours,
    get_datetime
)

from datetime import timedelta


# ==========================================================
# Global Configuration
# ==========================================================

REGULARIZATION_MIN_ALLOWED_HOURS = 4
REGULARIZATION_MIN_WORKING_HOURS = 8


# ==========================================================
# Get Regularization Configuration
# ==========================================================

def get_max_monthly_regularization():

    max_monthly_regularization = frappe.db.get_single_value(
        "Teceze Settings",
        "max_monthly_regularization"
    )

    if max_monthly_regularization is None:
        return 2

    return int(max_monthly_regularization)


# ==========================================================
# Shiftwise Calculations
# ==========================================================

def _shiftwise_calculations(employee, from_date):

    # ------------------------------------------------------
    # Get Employee Shift Assignment
    # ------------------------------------------------------

    shift_assignment = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": employee,
            "start_date": ["<=", from_date],
            "docstatus": 1
        },
        fields=[
            "shift_type",
            "start_date"
        ],
        order_by="start_date desc",
        limit=1
    )

    if not shift_assignment:

        frappe.throw(
            _(
                "No active Shift Assignment found for employee {0}."
            ).format(employee)
        )

    shift_type_name = shift_assignment[0].shift_type

    if not shift_type_name:

        frappe.throw(
            _(
                "No Shift Type is assigned to employee {0}."
            ).format(employee)
        )

    # ------------------------------------------------------
    # Get Shift Type
    # ------------------------------------------------------

    shift = frappe.get_doc(
        "Shift Type",
        shift_type_name
    )

    # ------------------------------------------------------
    # Shift Start / End
    # ------------------------------------------------------

    shift_start = get_datetime(
        f"{from_date} {shift.start_time}"
    )

    shift_end = get_datetime(
        f"{from_date} {shift.end_time}"
    )

    # ------------------------------------------------------
    # Handle Night Shift
    # ------------------------------------------------------

    if shift_end <= shift_start:

        shift_end += timedelta(days=1)

    # ------------------------------------------------------
    # Shift Buffers
    # ------------------------------------------------------

    begin_buffer = (
        shift.begin_check_in_before_shift_start_time or 0
    )

    end_buffer = (
        shift.allow_check_out_after_shift_end_time or 0
    )

    # ------------------------------------------------------
    # Attendance Window
    # ------------------------------------------------------

    window_start = (
        shift_start -
        timedelta(minutes=begin_buffer)
    )

    window_end = (
        shift_end +
        timedelta(minutes=end_buffer)
    )

    return {
        "shift_type": shift_type_name,
        "shift_start": shift_start,
        "shift_end": shift_end,
        "window_start": window_start,
        "window_end": window_end
    }


# ==========================================================
# Get Existing Check In / Check Out
# ==========================================================

@frappe.whitelist()
def get_existing_checkins(employee, from_date):

    # ------------------------------------------------------
    # Validation
    # ------------------------------------------------------

    if not employee or not from_date:

        return {
            "check_in": "",
            "check_out": "",
            "check_in_doc": "",
            "check_out_doc": ""
        }

    # ======================================================
    # Get Shiftwise Attendance Window
    # ======================================================

    shift_data = _shiftwise_calculations(
        employee,
        from_date
    )

    window_start = shift_data["window_start"]
    window_end = shift_data["window_end"]

    # ======================================================
    # Get FIRST Check-in
    # ======================================================

    check_in_logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "log_type": "IN",
            "time": [
                "between",
                [window_start, window_end]
            ]
        },
        fields=[
            "name",
            "time"
        ],
        order_by="time asc",
        limit=1
    )

    check_in = ""
    check_in_doc = ""

    if check_in_logs:

        check_in = check_in_logs[0].time
        check_in_doc = check_in_logs[0].name

    # ======================================================
    # Get LAST Check-out
    # ======================================================

    out_logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "log_type": "OUT",
            "time": [
                "between",
                [window_start, window_end]
            ]
        },
        fields=[
            "name",
            "time"
        ],
        order_by="time desc",
        limit=1
    )

    check_out = ""
    check_out_doc = ""

    if out_logs:

        check_out = out_logs[0].time
        check_out_doc = out_logs[0].name

    # ======================================================
    # Return Result
    # ======================================================

    return {
        "check_in": check_in,
        "check_out": check_out,
        "check_in_doc": check_in_doc,
        "check_out_doc": check_out_doc
    }


# ==========================================================
# Attendance Regularization Validation
# ==========================================================

def validate_regularization_limit(doc, method=None):

    # ------------------------------------------------------
    # Only apply to Regularization
    # ------------------------------------------------------

    if doc.reason != "Regularization":
        return

    # ------------------------------------------------------
    # Employee and Date
    # ------------------------------------------------------

    if not doc.employee or not doc.from_date:
        return

    # ======================================================
    # Regularization Date Handling
    # ======================================================

    from_date = getdate(doc.from_date)

    # ------------------------------------------------------
    # Regularization is a single-day request
    # ------------------------------------------------------

    if doc.to_date:

        to_date = getdate(doc.to_date)

        if to_date != from_date:

            frappe.throw(
                _(
                    "For Regularization, To Date must be the same as From Date."
                )
            )

    # ------------------------------------------------------
    # Half Day Date = From Date
    # ------------------------------------------------------

    if doc.half_day_date:

        half_day_date = getdate(
            doc.half_day_date
        )

        if half_day_date != from_date:

            frappe.throw(
                _(
                    "For Regularization, Half Day Date must be the same as From Date."
                )
            )

    # ======================================================
    # Monthly Regularization Limit
    # ======================================================

    month_start = get_first_day(
        from_date
    )

    month_end = get_last_day(
        from_date
    )

    count = frappe.db.count(
        "Attendance Request",
        filters={
            "employee": doc.employee,
            "reason": "Regularization",
            "docstatus": ["!=", 2],
            "from_date": [
                "between",
                [month_start, month_end]
            ],
            "name": [
                "!=",
                doc.name
            ]
        }
    )

    # ------------------------------------------------------
    # Maximum Regularization Requests Per Month
    # ------------------------------------------------------

    max_monthly_regularization = get_max_monthly_regularization()

    if count >= max_monthly_regularization:

        frappe.throw(
            _(
                "You have already submitted {0} Attendance "
                "Regularization requests for this month. "
                "You cannot create another request."
            ).format(
                max_monthly_regularization
            )
        )

    # ======================================================
    # Working Hours Calculation
    # ======================================================

    if (
        doc.custom_check_in and
        doc.custom_check_out
    ):

        # --------------------------------------------------
        # Calculate Working Hours
        # --------------------------------------------------

        hours = time_diff_in_hours(
            doc.custom_check_out,
            doc.custom_check_in
        )

        # --------------------------------------------------
        # Invalid Time
        # --------------------------------------------------

        if hours < 0:

            frappe.throw(
                _(
                    "Check Out time cannot be earlier than "
                    "Check In time."
                )
            )

        # --------------------------------------------------
        # Store Working Hours
        # --------------------------------------------------

        doc.custom_working_hours = hours

        # ==================================================
        # Less than 4 Hours
        # ==================================================

        if hours < REGULARIZATION_MIN_ALLOWED_HOURS:

            frappe.throw(
                _(
                    "Regularization is not allowed when "
                    "working hours are less than {0} hours."
                ).format(
                    REGULARIZATION_MIN_ALLOWED_HOURS
                )
            )

        # ==================================================
        # Half Day Calculation
        # ==================================================

        if hours < REGULARIZATION_MIN_WORKING_HOURS:

            doc.half_day = 1

        else:

            doc.half_day = 0

    else:

        # --------------------------------------------------
        # No complete Check In / Check Out
        # --------------------------------------------------

        doc.custom_working_hours = 0
        doc.half_day = 0


# ==========================================================
# Update Attendance Working Hours
# ==========================================================

def update_attendance_working_hours(doc, method=None):

    # ------------------------------------------------------
    # Only Regularization
    # ------------------------------------------------------

    if doc.reason != "Regularization":
        return

    # ------------------------------------------------------
    # Only after submission / approval
    # ------------------------------------------------------

    if doc.docstatus != 1:
        return

    # ------------------------------------------------------
    # Find the existing Attendance linked to
    # this Attendance Request
    # ------------------------------------------------------

    frappe.db.sql("""
        UPDATE `tabAttendance` a
        INNER JOIN `tabAttendance Request` ar
            ON a.attendance_request = ar.name
        SET a.working_hours = ar.custom_working_hours
        WHERE ar.name = %s
          AND ar.docstatus = 1
    """, (doc.name,))

    # ------------------------------------------------------
    # Commit Attendance update
    # ------------------------------------------------------

    frappe.db.commit()