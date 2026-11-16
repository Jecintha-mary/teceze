# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import now_datetime

class Ticket(Document):
	def validate(self):
		if self.workflow_state == "Assign FSO" and not self.fso_engineer:
			self.create_fso()
	def after_insert(self):
			frappe.msgprint(
			"Ticket created successfully. Kindly assign this ticket to the FSO Team.",
			title="Ticket Created",
			indicator="green"
			)
			#Create the FSO
			# Create the first activity when Ticket is created
			self.add_activity(previous_state=None)

	def on_update(self):
		# Get the previous saved document
		old_doc = self.get_doc_before_save()

		if not old_doc:
			return

		old_state = old_doc.workflow_state
		new_state = self.workflow_state

		# Continue only when workflow state changes
		if old_state == new_state:
			return


		self.add_activity(previous_state=old_state)

	def add_activity(self, previous_state=None):

		activities = []

		# Read existing activity history
		if self.activity_history:
			try:
				activities = json.loads(self.activity_history)
			except (ValueError, TypeError):
				activities = []

		user = frappe.session.user

		user_name = (
			frappe.db.get_value("User", user, "full_name")
			or user
		)

		
		activity = {
			"old_state": previous_state,
			"new_state": self.workflow_state,
			"user": user,
			"user_name": user_name,
			"creation": frappe.utils.now_datetime().strftime(
				"%Y-%m-%d %H:%M:%S"
			)
		}

		activities.append(activity)

		# Save JSON directly in the Ticket record
		self.activity_history = json.dumps(activities)

		self.db_set(
			"activity_history",
			self.activity_history,
			update_modified=False
		)

	def create_fso(self):
		# Create FSO Assignment document
		
		fso_assignment = frappe.new_doc("FSO Engineer Alignment")
		frappe.log_error("self.tools_required",str(self.tools_required))
		# Map Ticket fields to FSO Assignment fields
		fso_assignment.ticket = self.name
		fso_assignment.category = self.categroy
		fso_assignment.activity = self.activity__details
		fso_assignment.activity_date = self.activity_date
		fso_assignment.activity_time = self.activity_time
		fso_assignment.service_level = self.service_level
		fso_assignment.duration = self.activity_duration
		fso_assignment.spoc_contact = self.contact
		fso_assignment.spoc = self.spoc_name
		fso_assignment.location = self.location_address
		fso_assignment.scope = self.scope_of_work
		tools_list = []
		for row in self.get("tools_required", []):
			tools_list.append(row.tool_name)
		fso_assignment.tools_required = ", ".join(tools_list)
		
		# Save FSO Assignment
		fso_assignment.insert(ignore_permissions=True)
		frappe.msgprint(
				f"""
				FSO Assignment has been created successfully.
				""",
				title="FSO Assignment Created",
				indicator="green"
				)
		# frappe.msgprint(
		# f"""
		# FSO Assignment has been created successfully.<br>
		# <a href="/app/fso-engineer-alignment/{fso_assignment.name}" target="_blank">
		# 	Click here to view FSO Assignment: {fso_assignment.name}
		# </a>
		# """,
		# title="FSO Assignment Created",
		# indicator="green"
		# )
		frappe.db.set_value(
						"Ticket",
						self.name,
						"fso_engineer",
						fso_assignment.name
					)
		self.fso_engineer = fso_assignment.name
		frappe.db.commit()

@frappe.whitelist()
def get_ticket_activity_log(ticket_name):
    ticket = frappe.get_doc("Ticket", ticket_name)

    if not frappe.has_permission("Ticket", "read", doc=ticket):
        frappe.throw("Not permitted to view this Ticket.")

    # Get the active workflow for Ticket
    workflow_name = frappe.db.get_value(
        "Workflow",
        {
            "document_type": "Ticket",
            "is_active": 1
        },
        "name"
    )

    workflow_states = []

    if workflow_name:
        workflow = frappe.get_doc("Workflow", workflow_name)

        # Maintain the order configured in Workflow
        workflow_states = [
            row.state
            for row in workflow.states
        ]

    # Read activity history
    activities = []

    if ticket.activity_history:
        try:
            activities = json.loads(ticket.activity_history)
        except (ValueError, TypeError):
            activities = []

    return {
        "workflow_states": workflow_states,
        "current_state": ticket.workflow_state,
        "activities": activities
    }

