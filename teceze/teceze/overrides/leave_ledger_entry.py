import frappe
from frappe.utils import add_days

def after_insert(doc, method):
    if (
        doc.transaction_type == "Leave Allocation"
        and doc.leave_type == "Compensatory Off"
        and doc.from_date
    ):
        doc.to_date = add_days(doc.from_date, 60)
        frappe.db.commit()
