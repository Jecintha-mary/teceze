# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.model.document import Document
from frappe.model.naming import getseries
from frappe.utils import now_datetime

class Ticket(Document):
	def validate(self):
		if self.workflow_state == "FSO Assigned" and not self.fso_engineer:
			self.create_fso()
			self.send_fso_email()

	def after_insert(self):
			frappe.msgprint(
			"Ticket created successfully. Kindly assign this ticket to the FSO Team.",
			title="Ticket Created",
			indicator="green"
			)

			# Create the first activity when Ticket is created
			self.add_activity(previous_state=None)

    # to send email to FSO team when ticket is assigned to them
	def send_fso_email(self):
		# Get FSO Team email from Dispatch Settings
		fso_email = frappe.db.get_single_value(
			"Dispatch Settings",
			"fso_team"
		)

		if not fso_email:
			frappe.log_error(
				"FSO Team email is not configured in Dispatch Settings",
				"FSO Assigned Email Notification"
			)
			return

		subject = f"Ticket Assigned to FSO - {self.name}"

		message = frappe.render_template("""
		{% set primary = "#12344d" %}
		{% set tint = "#eef6f8" %}
		{% set border = "#e2e8f0" %}
		{% set text = "#334155" %}
		{% set muted = "#64748b" %}
		{% set portal = "TECEZE Portal" %}

		{% set owner_name = frappe.db.get_value("User", doc.ticket_owner, "full_name") or doc.ticket_owner or "Not specified" %}

		{% set rows = [
			("Ticket ID", doc.name),
			("Subject", doc.get("subject")),
			("Ticket Owner", owner_name),
			("Customer", doc.get("customer") or doc.get("custom_customer")),
			("Site", doc.get("custom_site") or doc.get("custom_location")),
			("Priority", doc.get("priority")),
			("Current Stage", doc.get("workflow_state") or "Not specified"),
			("Raised On", frappe.utils.format_datetime(doc.creation, "dd MMM yyyy, hh:mm a") if doc.creation else None)
		] %}

		<div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fa; padding: 30px 15px;">
			<div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid {{ border }}; border-radius: 8px; overflow: hidden;">

				<div style="background-color: {{ primary }}; padding: 20px 25px;">
					<h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
						Ticket Assigned to FSO
					</h2>
				</div>

				<div style="padding: 25px; color: {{ text }}; font-size: 14px; line-height: 1.6;">

					<p style="margin-top: 0;">
						Dear <strong style="color: {{ primary }};">FSO Team</strong>,
					</p>

					<p>
						A new support ticket,
						<strong>{{ doc.name }}</strong>,
						has been assigned to the FSO team for further processing.
					</p>

					<p>
						Please review the ticket details below and take the necessary action.
					</p>

					<div style="background-color: {{ tint }}; border-left: 4px solid #168aad; padding: 10px 14px; margin-top: 22px; margin-bottom: 12px;">
						<strong style="color: {{ primary }}; font-size: 15px;">
							Ticket Details
						</strong>
					</div>

					<table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 22px;">
						{% for label, value in rows %}
							{% if value %}
							<tr>
								<td width="40%" valign="top" style="padding: 10px 12px; background-color: #f8fafc; border-bottom: 1px solid {{ border }}; color: {{ muted }};">
									<strong>{{ label }}</strong>
								</td>
								<td valign="top" style="padding: 10px 12px; border-bottom: 1px solid {{ border }}; color: {{ text }};">
									{{ value }}
								</td>
							</tr>
							{% endif %}
						{% endfor %}
					</table>

					{% if doc.get("description") %}
					<div style="background-color: #f8fafc; border: 1px solid {{ border }}; border-radius: 6px; padding: 14px 16px; margin-bottom: 22px;">
						<strong style="color: {{ primary }}; font-size: 14px;">
							Issue Description
						</strong>
						<div style="margin-top: 8px; color: {{ text }}; font-size: 13px; line-height: 1.6;">
							{{ doc.description }}
						</div>
					</div>
					{% endif %}

					<div style="text-align: center; margin: 25px 0;">
						<a href="{{ frappe.utils.get_url_to_form('Ticket', doc.name) }}"
						   style="display: inline-block; background-color: #168aad; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 5px; font-size: 14px; font-weight: 600;">
							View Ticket
						</a>
					</div>

					<p style="margin-bottom: 0;">
						Regards,<br>
						<strong style="color: {{ primary }};">Teceze Support Team</strong><br>
						<span style="color: #94a3b8; font-size: 12px;">
							{{ portal }}
						</span>
					</p>
				</div>

				<div style="background-color: #f8fafc; border-top: 1px solid {{ border }}; padding: 12px 25px; text-align: center;">
					<span style="font-size: 11px; color: #94a3b8;">
						This is an automated notification from {{ portal }}.
						Please do not reply to this email.
					</span>
				</div>

			</div>
		</div>
		""", {"doc": self})

		# Send email only to FSO Team
		frappe.sendmail(
			recipients=[fso_email],
			subject=subject,
			message=message,
			reference_doctype=self.doctype,
			reference_name=self.name
		)	

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
		# Map Ticket fields to FSO Assignment fields
		fso_assignment.ticket = self.name
		fso_assignment.category = self.category
		fso_assignment.activity = self.activity__details
		fso_assignment.activity_date = self.activity_date
		fso_assignment.activity_time = self.activity_time
		fso_assignment.service_level = self.service_level
		fso_assignment.duration = self.activity_duration
		fso_assignment.spoc_contact = self.contact
		fso_assignment.spoc = self.spoc_name
		fso_assignment.location = self.location_address
		fso_assignment.scope = self.scope_of_work
		fso_assignment.sdc=self.sdc
		fso_assignment.sdc_email=self.sdc_email
		fso_assignment.sdm=self.sdm
		fso_assignment.sdm_email=self.sdm_email
		tools_list = []
		for row in self.get("tools_required", []):
			if row.tool_name == "Others":
				if self.others:
					tools_list.append(self.others)
			else:
				tools_list.append(row.tool_name)

		fso_assignment.tools = ", ".join(tools_list)

		
		# Save FSO Assignment
		fso_assignment.insert(ignore_permissions=True)
		frappe.msgprint(
				f"""
				FSO Assignment has been created successfully.
				""",
				title="FSO Assignment Created",
				indicator="green"
				)
		
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


def get_ticket_permission_query(user):

    if not user:
        user = frappe.session.user

    # System Manager can view all tickets
    if "System Manager" in frappe.get_roles(user):
        return ""

    # Other users can view tickets owned by them
    return "`tabTicket`.owner = {}".format(
        frappe.db.escape(user)
    )