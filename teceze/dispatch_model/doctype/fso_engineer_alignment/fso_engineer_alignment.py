# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FSOEngineerAlignment(Document):
	def validate(self):
		if self.ticket and self.workflow_state in ["FSO Process", "To SDC"]:
			ticket = frappe.get_doc("Ticket", self.ticket)

			old_state = ticket.workflow_state
			new_state = self.workflow_state

			if old_state != new_state:

				frappe.db.set_value(
					"Ticket",
					self.ticket,
					"workflow_state",
					self.workflow_state
				)
					# Update the in-memory Ticket state
				ticket.workflow_state = new_state

				# Record the activity in Ticket
				ticket.add_activity(previous_state=old_state)