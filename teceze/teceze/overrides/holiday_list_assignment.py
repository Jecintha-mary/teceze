
import frappe
from frappe import _
from frappe.utils import getdate


def validate(doc, method=None):
    if not doc.from_date or not doc.custom_to_date:
        return

    start_date = getdate(doc.from_date)
    end_date = getdate(doc.custom_to_date)

    if end_date < start_date:
        frappe.throw(
            _("Assignment End Date cannot be earlier than Assignment Starts From Date.")
        )
