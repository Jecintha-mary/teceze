# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

allowed_states = [
    "FSO Assigned",
    "In Progress",
    "Pending SDC Validation",
    "Rework Required",
    "FSO Rejection Closure",
    "Pending FSO Payment",
    "Pending SDM Billing"
]

class FSOEngineerAlignment(Document):
	def validate(self):
		if self.workflow_state == "In Progress":
			self.send_mail_for_assign_user()
		if self.workflow_state == "In Progress" and not self.fso_assign_owner:
			frappe.throw("FSO Assign Owner is Mandatory!")

		#mark fso work complete_feild updation to activity and sign off
		if self.workflow_state == "Pending SDC Validation" and self.note_sdc:	
			frappe.db.set_value(
			"Activity And Sign-Off",
			self.sign_off,
			{
				"progress_update":self.progress_update,
				"details": self.detail
			},
			update_modified=True
		)
		
		if self.workflow_state == "Pending SDC Validation" and not self.sign_off:
			self.create_sign_off()
		new_state = self.workflow_state
		#mandatory field validation when fso process
		if self.workflow_state == "Pending SDC Validation":
			mandatory_fields = {
				"engineer_name": "Engineer Name",
				"rate_currency": "Rate Currency",
				"bank_account": "Select Bank Account",
				"scheduled_date": "Scheduled Date"
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
		if self.workflow_state == "Pending SDC Validation" and self.note_sdc:
			mandatory_fields = {
							"progress_update": "Progress Update",
							"detail": "Details",}
			missing_fields = [
										label
										for field, label in mandatory_fields.items()
										if not self.get(field)
						]
			if missing_fields:
							frappe.throw(
						"Please fill in all mandatory fields:<br><br>• "
						+ "<br>• ".join(missing_fields))

		# UPDATE TICKET WORKFLOW STATE

		if self.ticket and new_state in allowed_states:

			ticket = frappe.get_doc("Ticket", self.ticket)

			old_state = ticket.workflow_state

			if old_state != new_state:

				frappe.db.set_value(
					"Ticket",
					self.ticket,
					"workflow_state",
					new_state
				)

				# Update in-memory state
				ticket.workflow_state = new_state

				# Record activity in Ticket
				#ticket.add_activity(previous_state=old_state)
		#Engineer Rate by fso
		if self.workflow_state=="Pending SDM Billing":
			mandatory_fields = {
							"eng_cost": "Engineer Cost",
							"total_cost": "Total Cost",
							"note": "Note",}
							
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
		if ((self.workflow_state == "Pending SDM Billing") and not self.payment_request):
			self.create_payment()
			
		

		# UPDATE ACTIVITY AND SIGN-OFF WORKFLOW STATE

		if self.name:

			sign_name = frappe.db.get_value(
				"Activity And Sign-Off",
				{"fso_engineer_alignment": self.name},
				"name"
			)

			if sign_name:

				old_sign_state = frappe.db.get_value(
					"Activity And Sign-Off",
					sign_name,
					"workflow_state"
				)

				if old_sign_state != new_state:

					frappe.db.set_value(
						"Activity And Sign-Off",
						sign_name,
						"workflow_state",
						new_state
					)
	def on_update(self):
		sync_ticket(self, self.workflow_state)

		
	def send_mail_for_assign_user(self):
		if not self.fso_assign_owner:
			return 
		else:
			fso_owner_name = frappe.db.get_value("User", self.fso_assign_owner, "full_name") or "User"
			subject = f" FSO - New Ticket Has Been Assigned - {self.name}"

			message = f"""
			<div style="font-family: Arial, Helvetica, sans-serif;
						background-color: #f5f7fa; padding: 30px 15px;">

				<div style="max-width: 650px; margin: 0 auto;
							background-color: #ffffff;
							border: 1px solid #e2e8f0;
							border-radius: 8px; overflow: hidden;">

					<!-- Header -->
					<div style="background-color: #12344d; padding: 20px 25px;">
						<h2 style="margin: 0; color: #ffffff; font-size: 20px;">
							New FSO Engineer Alignment Assigned
						</h2>
					</div>

					<!-- Body -->
					<div style="padding: 25px; color: #334155;
								font-size: 14px; line-height: 1.6;">

						<p>Dear {fso_owner_name},</p>

						<p>
							The ticket <strong>{self.name}</strong> has been assigned to you.
                            Please click the <strong>View Alignment</strong> button below
                            to open the record and begin working on it.
						</p>

						<!-- Details Heading -->
						<div style="background-color: #eef6f8;
									border-left: 4px solid #168aad;
									padding: 10px 14px; margin: 22px 0 12px;">
							<strong style="color: #12344d; font-size: 15px;">
								Assignment Details
							</strong>
						</div>

						<!-- Details Table -->
						<table style="width: 100%; border-collapse: collapse;
									font-size: 14px; margin-bottom: 22px;">

							<tr>
								<td width="40%" style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Alignment ID</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.name}
								</td>
							</tr>


							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>FSO Owner</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.fso_assign_owner or ''}
								</td>
							</tr>

							

						</table>

						<!-- View Alignment Button -->
						<div style="text-align: center; margin: 25px 0;">
							<a href="{frappe.utils.get_url_to_form(self.doctype, self.name)}"
							   style="display: inline-block;
									  background-color: #168aad;
									  color: #ffffff;
									  text-decoration: none;
									  padding: 12px 24px;
									  border-radius: 5px;
									  font-size: 14px;
									  font-weight: 600;">
								View Alignment
							</a>
						</div>

						<!-- Signature -->
						<p style="margin-bottom: 0;">
							Regards,<br>
							<strong style="color: #12344d;">
								Teceze Support Team
							</strong><br>
							<span style="color: #94a3b8; font-size: 12px;">
								TECEZE Portal
							</span>
						</p>

					</div>

					<!-- Footer -->
					<div style="background-color: #f8fafc;
								border-top: 1px solid #e2e8f0;
								padding: 12px 25px; text-align: center;">
						<span style="font-size: 11px; color: #94a3b8;">
							This is an automated notification from TECEZE Portal.
							Please do not reply to this email.
						</span>
					</div>

				</div>
			</div>
			"""

			frappe.sendmail(
				recipients=[self.fso_assign_owner],
				subject=subject,
				message=message,
				reference_doctype=self.doctype,
				reference_name=self.name
			)

	def create_payment(self):
		payment = frappe.new_doc("Dispatch Payment Request")
		#Engineer Details
		payment.engineer_name = self.engineer
		payment.activity_date = self.activity_date
		payment.fso_owner = self.fso_owner
		payment.recruiter_name = self.recruiter_name
		payment.region = self.region
		payment.country = self.country
		payment.currency = self.rate_currency 
		payment.account_name = self.name_on_account
		payment.acc_no = self.account_number
		payment.bank_name  = self.bank_name
		payment.swift_bic = self.swift_bic
		payment.sort_code = self.sort_code
		payment.iban = self.iban
		payment.bank_address = self.bank_address
		payment.ticket = self.ticket
		payment.client_name = frappe.db.get_value("Ticket", self.ticket, "client_name")
		payment.project_name = frappe.db.get_value("Ticket", self.ticket, "project_name")
		payment.engineer = self.name
		payment.sign_off = self.sign_off
		payment.engineer_cost = self.eng_cost
		payment.travel_cost = self.travel_cst
		payment.other_cost = self.other_cost
		payment.total_cost = self.total_cost
		payment.note = self.note
		payment.sdc = self.sdc
		payment.sdc_email = self.sdc_email
		payment.sdm = self.sdm
		payment.sdm_email = self.sdm_email
		payment.time_in= self.time_in
		payment.time_out= self.time_out
		payment.sign_off_by_client= self.sign_off_by_client
		payment.working_hours = self.working_hours
		payment.work_performed = self.work_performed
		payment.engineer_remarks = self.engineer_remarks
		payment.sign_off_sheet= self.sign_off_sheet
		payment.outcome = self.outcome
		payment.rescheduled_date=self.rescheduled_date
		payment.billing_currency=self.rate_currency
				
		payment.insert(ignore_permissions=True)
		frappe.msgprint(
						f"""
						Dispatch Payment Requestf has been initiated successfully.
						""",
						title="Dispatch Payment Request",
						indicator="green"
						)
		frappe.db.set_value(
				"FSO Engineer Alignment",
				self.name,
				"payment_request",
				payment.name
			)
		if self.sign_off:
			frappe.db.set_value(
						"Activity And Sign-Off",
						self.sign_off,
						"workflow_state",
						"Pending SDM Billing"
					)
		if self.ticket:
			frappe.db.set_value(
						"Ticket",
						self.ticket,
						"workflow_state",
						"Pending SDM Billing"
					)	
		frappe.db.set_value(
						"Activity And Sign-Off",
						self.sign_off,
						"workflow_state",
						"Pending SDM Billing"
					)
		frappe.db.set_value(
						"Ticket",
						self.ticket,
						"workflow_state",
						"Pending SDM Billing"
					)
		self.payment_request = payment.name
		frappe.db.commit()

	def create_sign_off(self):
		sign_off = frappe.new_doc("Activity And Sign-Off")
		#Details
		sign_off.ticket = self.ticket
		sign_off.category = self.category
		sign_off.activity = self.activity
		sign_off.activity_time = self.activity_time
		#sign_off.activity_date = self.activity_date
		sign_off.activity_data_ = self.activity_date
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
		sign_off.fso_assign_owner = self.fso_assign_owner
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
		sign_off.sdc=self.sdc
		sign_off.sdc_email=self.sdc_email
		sign_off.sdm=self.sdm
		sign_off.sdm_email=self.sdm_email
		#Visit Schedule
		sign_off.scheduled_date = self.scheduled_date
		sign_off.arrival_timesite_local = self.arrival_time
		sign_off.notes_for_engineer = self.notes


		sign_off.insert(ignore_permissions=True)
		frappe.msgprint(
						f"""
						Engineer has been assigned successfully.
						""",
						title="Engineer Assigned",
						indicator="green"
						)
				
				
		frappe.db.set_value(
						"FSO Engineer Alignment",
						self.name,
						"sign_off",
						sign_off.name
					)
		self.sign_off = sign_off.name
		frappe.db.commit()



def get_engineer_permission_query(user):

    if not user:
        user = frappe.session.user

    # System Manager can view all tickets
    if any(role in frappe.get_roles(user) for role in ["System Manager", "FSO Owner"]):
        return ""

    # Other users can view tickets owned by them
    return "`tabFSO Engineer Alignment`.fso_assign_owner = {}".format(
        frappe.db.escape(user)
    )
import json

def sync_ticket(doc, state):
	if not state:
		return

	ticket_name = (
		doc.get("ticket")
		or doc.get("ticket_id")
		or (
			frappe.db.get_value("FSO Engineer Alignment", doc.fso_engineer_alignment, "ticket")
			if doc.get("fso_engineer_alignment")
			else None
		)
	)
	if not ticket_name:
		return

	wf = frappe.db.get_value("Workflow", {"document_type": doc.doctype, "is_active": 1}, "name")
	allowed = frappe.get_all("Workflow Document State", filters={"parent": wf}, pluck="state") if wf else []
	if allowed and state not in allowed:
		return

	ticket = frappe.get_doc("Ticket", ticket_name)
	last_logged_state = None
	if ticket.activity_history:
		try:
			history = json.loads(ticket.activity_history)
			if history:
				last_logged_state = history[-1].get("new_state")
		except (ValueError, TypeError):
			pass

	previous_state = last_logged_state or ticket.workflow_state
	if previous_state != state:
		if ticket.workflow_state != state:
			frappe.db.set_value("Ticket", ticket_name, "workflow_state", state)
			ticket.workflow_state = state
		ticket.add_activity(previous_state=previous_state)