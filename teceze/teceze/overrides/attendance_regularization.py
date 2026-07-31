import frappe
from frappe import _


@frappe.whitelist()
def get_existing_checkins(employee, from_date):

    logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": [
                "between",
                [
                    from_date + " 00:00:00",
                    from_date + " 23:59:59"
                ]
            ]
        },
        fields=[
            "log_type",
            "time"
        ],
        order_by="time asc"
    )

    check_in = ""
    check_out = ""

    for log in logs:

        if log.log_type == "IN" and not check_in:
            check_in = log.time

        elif log.log_type == "OUT":
            check_out = log.time

    return {
        "existing_check_in": check_in,
        "existing_check_out": check_out
    }


# ==========================================================
# Attendance Request Validation
# ==========================================================

def validate(doc, method):

    if not doc.employee:
        frappe.throw(_("Employee is required."))

    if not doc.from_date:
        frappe.throw(_("From Date is required."))

    if doc.to_date and doc.from_date != doc.to_date:
        frappe.throw(_("Only one day can be regularized in a request."))

    if not doc.custom_correct_check_in and not doc.custom_correct_check_out:
        frappe.throw(_("Enter Correct Check In or Correct Check Out."))

    if not doc.reason:
        frappe.throw(_("Reason is mandatory."))

    # Correct IN should be after midnight of selected day
    if (
        doc.custom_correct_check_in
        and doc.custom_correct_check_in.date() != doc.from_date
    ):
        frappe.throw(_("Correct Check In must belong to the selected date."))

    # Correct OUT should be after Correct IN
    if (
        doc.custom_correct_check_in
        and doc.custom_correct_check_out
        and doc.custom_correct_check_out <= doc.custom_correct_check_in
    ):
        frappe.throw(_("Correct Check Out must be later than Correct Check In."))def before_save(doc, method):

    if not doc.employee:
        return

    reporting_manager = frappe.db.get_value(
        "Employee",
        doc.employee,
        "custom_reporting_manager"
    )

    doc.custom_reporting_manager = reporting_manager