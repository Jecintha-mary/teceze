# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

allowed_states = [
    "Pending SDM Billing",
    "Pending FSO Head Approval",
    "Pending Finance",
    "Completed"
]
class DispatchPaymentRequest(Document):
	def validate(self):
		if self.workflow_state in allowed_states:
			if self.workflow_state in allowed_states:
			
				new_state = self.workflow_state
	
				linked_docs = [
					("Ticket", self.ticket),
					("FSO Engineer Alignment", self.engineer),
					("Activity And Sign-Off", self.sign_off)
				]
	
				for doctype, docname in linked_docs:
	
					if not docname:
						continue
	
					old_state = frappe.db.get_value(
						doctype,
						docname,
						"workflow_state"
					)
	
					if old_state != new_state:
						frappe.db.set_value(
							doctype,
							docname,
							"workflow_state",
							new_state,
							update_modified=True
						)
						frappe.db.sql("""
						UPDATE `tab{doctype}`
						SET workflow_state = %s,
							modified = NOW(),
							modified_by = %s
						WHERE name = %s
						""".format(doctype=doctype), (new_state, frappe.session.user, docname))
						frappe.db.commit()
		#billing Cost
		if self.workflow_state == "Pending FSO Head Approval":
			mandatory_fields = {
			"billing_cost": "Billing Cost",
			"billing_currency": "Billing Currency",
			"sdm_note":"SDM Note"

			}

			missing_fields = [
				label
				for field, label in mandatory_fields.items()
				if not self.get(field)
			]

			if missing_fields:
				frappe.throw(
					"Please fill in all mandatory fields:<br><br>• "
					+ "<br>• ".join(missing_fields)
				)
	

def get_payment_permission_query(user):

    if not user:
        user = frappe.session.user

    # System Manager can view all tickets
    if any(role in frappe.get_roles(user) for role in ["System Manager","FSO Head"]):
        return ""

    # Other users can view tickets owned by them
    return "`tabDispatch Payment Request`.sdm_email = {}".format(
        frappe.db.escape(user)
    )