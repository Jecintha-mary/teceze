import frappe
from frappe import _
from frappe.utils import get_first_day, get_last_day, time_diff_in_hours


# ==========================================================
# Get Existing Check In / Check Out
# ==========================================================

@frappe.whitelist()
def get_existing_checkins(employee, from_date):

    if not employee or not from_date:
        return {
            "check_in": "",
            "check_out": "",
            "check_in_doc": "",
            "check_out_doc": ""
        }

    start = f"{from_date} 00:00:00"
    end = f"{from_date} 23:59:59"

    # Get all checkins on selected day
    day_logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": ["between", [start, end]]
        },
        fields=["name", "log_type", "time"],
        order_by="time asc"
    )

    check_in = ""
    check_in_doc = ""

    # Find the latest IN on that day
    for row in reversed(day_logs):
        if row.log_type == "IN":
            check_in = row.time
            check_in_doc = row.name
            break

    check_out = ""
    check_out_doc = ""

    if check_in:

        # Find the first OUT after this IN
        out_log = frappe.get_all(
            "Employee Checkin",
            filters={
                "employee": employee,
                "log_type": "OUT",
                "time": [">", check_in]
            },
            fields=["name", "time"],
            order_by="time asc",
            limit=1
        )

        if out_log:
            check_out = out_log[0].time
            check_out_doc = out_log[0].name

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

    if doc.reason != "Regularization":
        return

    if not doc.employee or not doc.from_date:
        return

    month_start = get_first_day(doc.from_date)
    month_end = get_last_day(doc.from_date)

    count = frappe.db.count(
        "Attendance Request",
        filters={
            "employee": doc.employee,
            "reason": "Regularization",
            "docstatus": ["!=", 2],
            "from_date": ["between", [month_start, month_end]],
            "name": ["!=", doc.name]
        }
    )
    if count >= 2:
        frappe.throw(
            _("You have already submitted 2 Attendance Regularization requests for this month. You cannot create another request.")
        )
    if doc.custom_check_in and doc.custom_check_out:

        hours = time_diff_in_hours(
            doc.custom_check_out,
            doc.custom_check_in
        )

        if hours < 4:
            frappe.throw(
                _("Regularization is not allowed because the working hours are less than 4 hours.")
            )