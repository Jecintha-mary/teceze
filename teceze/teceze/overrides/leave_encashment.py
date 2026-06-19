import frappe
from frappe.model.document import Document
from frappe.utils import getdate, today

def validate(doc,method):
    encashment_date = getdate(self.encashment_date)

    # Allow only in November
    if encashment_date.month != 11:
        frappe.throw(
            "Leave Encashment can be applied only during November."
        )

    leave_period = frappe.get_doc(
        "Leave Period",
        self.leave_period
    )

    # Check whether current date falls within selected leave period
    if not (
        leave_period.from_date <= current_date <= leave_period.to_date
    ):
        frappe.throw(
            f"Leave Period {self.leave_period} is not active."
        )
