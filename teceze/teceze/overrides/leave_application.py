import frappe
from frappe.model.document import Document
from frappe.utils import getdate, add_days

def validate(doc,method):
    if doc.workflow_state == "Approved":
        doc.status = "Approved"

    elif doc.workflow_state == "Rejected":
        doc.status = "Rejected"


    # Only validate Restricted Leave
    if doc.leave_type != "Restricted Leave":
        return

    if not doc.employee:
        return

    if not doc.from_date:
        return

    # ---------------------------------------------------------
    # Get Employee Shift Type
    # ---------------------------------------------------------

    shift_type = frappe.db.get_value(
        "Employee",
        doc.employee,
        "default_shift"
    )

    if not shift_type:
        frappe.throw(
            "No Shift Type is assigned to this employee."
        )

    # ---------------------------------------------------------
    # Get Holiday List from Shift Type
    # ---------------------------------------------------------

    holiday_list = frappe.db.get_value(
        "Shift Type",
        shift_type,
        "holiday_list"
    )

    if not holiday_list:
        frappe.throw(
            f"No Holiday List is configured for Shift Type "
            f"{shift_type}."
        )

    # ---------------------------------------------------------
    # Validate each leave date
    # ---------------------------------------------------------

    from_date = getdate(doc.from_date)
    to_date = getdate(doc.to_date or doc.from_date)

    current_date = from_date
    current_date_str = current_date.strftime("%Y-%m-%d")

    holiday = frappe.db.sql("""
        SELECT name
        FROM `tabHoliday`
        WHERE parent = %s
        AND holiday_date = %s
        AND custom_status = 'RH'
        LIMIT 1
    """, (
        holiday_list,
        current_date_str
    ), as_dict=True)
    if not holiday:
        frappe.throw(
            f"{current_date.strftime('%d-%m-%Y')} is not a "
            f"Restricted Holiday for you."
        )

        current_date = add_days(current_date, 1)