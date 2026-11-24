# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
allowed_states = [
    "Pending SDC Validation",
    "Rework Required",
    "Pending Sign-off",
    "Pending FSO Payment",
    "Pending SDM Billing",
    "Pending FSO Head Approval",
    "Pending Finance"
]

class ActivityAndSignOff(Document):
	def validate(self):
		if self.workflow_state == "Pending FSO Payment":
			self.update_visit_details()
		if self.workflow_state == "Rework Required":
			frappe.db.set_value(
									"FSO Engineer Alignment",
									self.fso_engineer_alignment,
									"note_sdc",
									self.add_discussion_note
								)
			frappe.db.commit()
		#if self.workflow_state == "Pending Sign-off":
		if self.workflow_state == "Pending FSO Payment":
			mandatory_fields = {
			"activity_date": "Activity Date",
			"time_in": "Time In",
			"time_out": "Time Out",
			"work_performed": "Work Performed",
			"outcome": "Outcome",
			"sign_off": "Signed Off By (Client)",
			#"sign_off_sheet": "Sign-off Sheet"
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
		

		if self.workflow_state == "Rework Required" and not self.add_discussion_note:
			frappe.throw("Add Discussion Notes for FSO – Required Corrections")

		if self.workflow_state == "Pending Sign-off":
			if not self.validate_engineer:
				frappe.throw("Work validated with the engineer is Mandatory!")
			if not self.document_review:
				frappe.throw("Documents and photos reviewed is Mandatory!")
		if self.workflow_state in allowed_states:
			new_state = self.workflow_state

			linked_docs = [
				("Ticket", self.ticket),
				("FSO Engineer Alignment", self.fso_engineer_alignment)
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
	def update_visit_details(self):
		frappe.db.set_value(
		"FSO Engineer Alignment",
			self.fso_engineer_alignment,
			{
				"time_in": self.time_in,
				"time_out": self.time_out,
				"sign_off_by_client": self.sign_off,
				"working_hours": self.working_hours,
				"work_performed": self.work_performed,
				"engineer_remarks": self.engineer_remarks,
				"sign_off_sheet": self.sign_off_sheet,
				"outcome": self.outcome
			},
			update_modified=True
			)
	def on_update(self):
		old_doc = self.get_doc_before_save()

		old_state = old_doc.workflow_state if old_doc else None
		new_state = self.workflow_state

		# Send email only when workflow changes to Send Back to FSO
		if new_state == "Send Back to FSO" and old_state != new_state:

			# Get linked FSO Engineer Alignment
			if not self.fso_engineer_alignment:
				return

			alignment = frappe.get_doc(
				"Rework Required",
				self.fso_engineer_alignment
			)

			# Get FSO recipients
			recipients = []

			# FSO Owner
			fso_owner = alignment.fso_owner
			if fso_owner and frappe.utils.validate_email_address(fso_owner):
				recipients.append(fso_owner)

			# FSO Assign Owner
			fso_assign_owner = alignment.fso_assign_owner
			if fso_assign_owner:
				assign_email = frappe.db.get_value(
					"FSO User",
					fso_assign_owner,
					"user_id"
				)

				if assign_email and frappe.utils.validate_email_address(assign_email):
					recipients.append(assign_email)

			# Remove duplicate email addresses
			recipients = list(set(recipients))

			if not recipients:
				frappe.log_error(
					"No valid FSO email addresses found",
					"Send Back to FSO Email"
				)
				return

			subject = f"Activity And Sign-Off Sent Back for Review - {self.name}"

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
							Activity And Sign-Off Sent Back for Review
						</h2>
					</div>

					<!-- Body -->
					<div style="padding: 25px; color: #334155;
								font-size: 14px; line-height: 1.6;">

						<p>Dear FSO Team,</p>

						<p>
							The following Activity And Sign-Off has been sent back
							to the FSO team for review and necessary action.
						</p>

						<div style="background-color: #eef6f8;
									border-left: 4px solid #168aad;
									padding: 10px 14px; margin: 22px 0 12px;">
							<strong style="color: #12344d; font-size: 15px;">
								Ticket Details
							</strong>
						</div>

						<table style="width: 100%; border-collapse: collapse;
									font-size: 14px; margin-bottom: 22px;">

							<tr>
								<td width="40%" style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Activity ID</strong>
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
									<strong>Ticket ID</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.ticket or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Category</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.category or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Activity</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.activity or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Service Level</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.service_level or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Activity Date</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.activity_date or ''}
								</td>
							</tr>

						</table>

						<div style="background-color: #eef6f8;
									border-left: 4px solid #168aad;
									padding: 10px 14px; margin: 22px 0 12px;">
							<strong style="color: #12344d; font-size: 15px;">
								Engineer Details
							</strong>
						</div>

						<table style="width: 100%; border-collapse: collapse;
									font-size: 14px; margin-bottom: 22px;">

							<tr>
								<td width="40%" style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Engineer Name</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{alignment.engineer_name or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Engineer Email</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{alignment.engineer_email or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Engineer Contact</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{alignment.engineer_contact or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Country</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{alignment.country or ''}
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
									{alignment.fso_owner or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Region</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{alignment.region or ''}
								</td>
							</tr>

						</table>

						<div style="background-color: #eef6f8;
									border-left: 4px solid #168aad;
									padding: 10px 14px; margin: 22px 0 12px;">
							<strong style="color: #12344d; font-size: 15px;">
								Visit Schedule
							</strong>
						</div>

						<table style="width: 100%; border-collapse: collapse;
									font-size: 14px; margin-bottom: 22px;">

							<tr>
								<td width="40%" style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Scheduled Date</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.scheduled_date or ''}
								</td>
							</tr>

							<tr>
								<td style="padding: 10px 12px;
									background-color: #f8fafc;
									border-bottom: 1px solid #e2e8f0;">
									<strong>Location</strong>
								</td>
								<td style="padding: 10px 12px;
									border-bottom: 1px solid #e2e8f0;">
									{self.location or ''}
								</td>
							</tr>

						</table>

						<p>
							Please review the ticket and engineer details,
							check the activity information, and take the necessary
							action before sending it back for review.
						</p>

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
								View Activity And Sign-Off
							</a>
						</div>

						<p style="margin-bottom: 0;">
							Regards,<br>
							<strong style="color: #12344d;">
								Teceze Dispatch Team
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
				recipients=recipients,
				subject=subject,
				message=message,
				reference_doctype=self.doctype,
				reference_name=self.name
			)
			
							
def get_sign_off_permission_query(user):

    if not user:
        user = frappe.session.user

    # System Manager can view all tickets
    if any(role in frappe.get_roles(user) for role in ["System Manager"]):
        return ""

    # Other users can view tickets owned by them
    return "`tabActivity And Sign-Off`.sdc_email = {}".format(
        frappe.db.escape(user)
    )