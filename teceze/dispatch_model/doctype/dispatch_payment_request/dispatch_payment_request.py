# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

allowed_states = [
    "Send to FSO Head",
    "FSO Head Review",
    "Finance",
    "Completed"
]
class DispatchPaymentRequest(Document):
	def validate(self):
		if self.workflow_state in allowed_states:
			frappe.log_error("call")
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
						frappe.log_error("new_state",str(new_state))
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
				if self.workflow_state == "FSO Head Review":
						mandatory_fields = {
						"billing_cost": "Billing Cost",
						"trvl_cost": "Travel Cost",
						"tot_cost": "Total Cost",
						"othr_cost": "Other Cost"
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
	