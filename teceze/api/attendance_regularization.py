import frappe
from frappe import _
from frappe.utils import (
    get_first_day,
    get_last_day,
    time_diff_in_hours,
    get_datetime
)
from datetime import timedelta


# ==========================================================
# Global Configuration
# ==========================================================

REGULARIZATION_MIN_WORKING_HOURS = 8
MAX_MONTHLY_REGULARIZATION = 2


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

    # ------------------------------------------------------
    # Get Shift Assignment for Employee
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

    # ------------------------------------------------------
    # If no shift assignment is found
    # ------------------------------------------------------

    if not shift_assignment:

        frappe.throw(
            _("No active Shift Assignment found for employee {0}.")
            .format(employee)
        )

    shift_type_name = shift_assignment[0].shift_type

    if not shift_type_name:

        frappe.throw(
            _("No Shift Type is assigned to employee {0}.")
            .format(employee)
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
    #
    # Example:
    # Start = 22:00
    # End   = 06:00
    #
    # End belongs to the next day.
    #
    # ------------------------------------------------------

    if shift_end <= shift_start:

        shift_end += timedelta(days=1)

    # ------------------------------------------------------
    # Apply Shift Buffers
    # ------------------------------------------------------

    begin_buffer = (
        shift.begin_check_in_before_shift_start_time or 0
    )

    end_buffer = (
        shift.allow_check_out_after_shift_end_time or 0
    )

    window_start = (
        shift_start -
        timedelta(minutes=begin_buffer)
    )

    window_end = (
        shift_end +
        timedelta(minutes=end_buffer)
    )

    # ------------------------------------------------------
    # Get Latest IN within Shift Window
    # ------------------------------------------------------

    check_in_logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "log_type": "IN",
            "time": ["between", [window_start, window_end]]
        },
        fields=[
            "name",
            "time"
        ],
        order_by="time desc",
        limit=1
    )

    check_in = ""
    check_in_doc = ""

    if check_in_logs:

        check_in = check_in_logs[0].time
        check_in_doc = check_in_logs[0].name

    # ------------------------------------------------------
    # Get First OUT after Latest IN
    # ------------------------------------------------------

    check_out = ""
    check_out_doc = ""

    if check_in:

        out_logs = frappe.get_all(
            "Employee Checkin",
            filters={
                "employee": employee,
                "log_type": "OUT",
                "time": [
                    "between",
                    [check_in, window_end]
                ]
            },
            fields=[
                "name",
                "time"
            ],
            order_by="time asc",
            limit=1
        )

        if out_logs:

            check_out = out_logs[0].time
            check_out_doc = out_logs[0].name

    # ------------------------------------------------------
    # Return Result
    # ------------------------------------------------------

    return {
        "check_in": check_in,
        "check_out": check_out,
        "check_in_doc": check_in_doc,
        "check_out_doc": check_out_doc
    }


# ==========================================================
# Attendance Regularization Limit
# ==========================================================

def validate_regularization_limit(doc, method=None):

    # ------------------------------------------------------
    # Only apply to Regularization
    # ------------------------------------------------------

    if doc.reason != "Regularization":
        return

    # ------------------------------------------------------
    # Employee and Date Required
    # ------------------------------------------------------

    if not doc.employee or not doc.from_date:
        return

    # ======================================================
    # Monthly Regularization Limit
    # ======================================================

    month_start = get_first_day(doc.from_date)
    month_end = get_last_day(doc.from_date)

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
            "name": ["!=", doc.name]
        }
    )

    if count >= MAX_MONTHLY_REGULARIZATION:

        frappe.throw(
            _(
                "You have already submitted {0} Attendance "
                "Regularization requests for this month. "
                "You cannot create another request."
            ).format(MAX_MONTHLY_REGULARIZATION)
        )

    # ======================================================
    # Working Hours / Half Day Calculation
    # ======================================================

    if doc.custom_check_in and doc.custom_check_out:

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
        # Half Day Calculation
        # --------------------------------------------------

        if hours < REGULARIZATION_MIN_WORKING_HOURS:

            doc.half_day = 1

        else:

            doc.half_day = 0