# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FSOEngineerAlignment(Document):
	def validate(self):
		if self.workflow_state == "Assign FSO" and not self.sign_off:
					self.create_sign_off()
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
	def create_sign_off(self):
		sign_off = frappe.new_doc("Activity And Sign-Off")
		#Details
		sign_off.ticket = self.ticket
		sign_off.category = self.category
		sign_off.activity = self.activity
		sign_off.activity_time = self.activity_time
		sign_off.activity_date = self.activity_date
		sign_off.activity_data_ = self.activity_time
		sign_off.service_level = self.service_level
		sign_off.duration = self.duration
		sign_off.spoc_contact = self.spoc_contact
		sign_off.spoc = self.spoc
		sign_off.location = self.location
		sign_off.tools = self.tools
		sign_off.scope_of_work = self.scope
		#Engineer Details
		sign_off.fso_engineer_alignment = self.name
		sign_off.engineer_name = self.engineer_name
		sign_off.engineer_email = self.engineer_email
		sign_off.engineer_contact = self.engineer_contact
		sign_off.country = self.country
		sign_off.recruiter_name = self.recruiter_name
		sign_off.fso_owner = self.fso_owner
		sign_off.region = self.region
		sign_off.rate_currency = self.rate_currency
		sign_off.full_day_rate = self.full_day_rate
		sign_off.hourly_rate = self.hourly_rate
		sign_off.half_day_rate = self.half_day_rate
		sign_off.fixed_visit_rate = self.fixed_rate
		sign_off.travel_cost = self.travel_cost
		sign_off.name_on_account = self.name_on_account
		sign_off.swift__bic__ifsc = self.swift_bic
		sign_off.account_number = self.account_number
		sign_off.sort_code = self.sort_code
		sign_off.bank_name = self.bank_name
		sign_off.iban = self.iban
		sign_off.bank_address = self.bank_address
		#Visit Schedule
		sign_off.scheduled_date = self.scheduled_date
		sign_off.arrival_timesite_local = self.arrival_time
		sign_off.notes_for_engineer = self.notes


		sign_off.insert(ignore_permissions=True)
		frappe.msgprint(
						f"""
						Activity And Sign-Off has been assigned successfully.
						""",
						title="Activity And Sign-Off Assigned",
						indicator="green"
						)
				
				
		# frappe.db.set_value(
		# 				"Ticket",
		# 				self.tickect,
		# 				"fso_engineer",
		# 				sign_off.name
		# 			)
		# self.fso_engineer = sign_off.name
		frappe.db.commit()
		