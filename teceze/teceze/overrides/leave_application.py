import frappe
from frappe.model.document import Document

def validate(doc,method):
    if doc.workflow_state == "Approved":
        doc.status = "Approved"

    elif doc.workflow_state == "Rejected":
        doc.status = "Rejected"
