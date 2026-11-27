# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from teceze.dispatch_model.doctype.fso_engineer_alignment.fso_engineer_alignment import sync_ticket

allowed_states = [
    "Pending SDM Billing",
    "Pending FSO Head Approval",
    "Pending Finance",
    "Completed"
]
class DispatchPaymentRequest(Document):
	def validate(self):
		if self.workflow_state == "Pending FSO Head Approval":
			self.send_fso_head_approval()

		if self.workflow_state == "Completed":
			if not self.status:
				frappe.throw("Status is Mandatory!")
			if not self. transaction:
				frappe.throw("Transaction ID is Mandatory!")
			
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
	def send_fso_head_approval(self):
					subject = f" FSO Head Approval Required  - {self.name}"
		            
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
									FSO Head Approval Required
								</h2>
							</div>
		
							<!-- Body -->
							<div style="padding: 25px; color: #334155;
										font-size: 14px; line-height: 1.6;">
		
								<p>Dear FSO Head,</p>
		
								<p>
									The payment of <strong>{frappe.utils.fmt_money(self.billing_total or 0, currency=self.billing_currency or "INR")}</strong>
									for ticket <strong>{self.name}</strong> has been processed by
                                    SDM <strong>{self.sdm or ''}</strong>.
                                    Please click the <strong>Review &amp; Approve Payment</strong> button below
                                    to verify the details and approve the payment.
								</p>
		
								<!-- Details Heading -->
								<div style="background-color: #eef6f8;
											border-left: 4px solid #168aad;
											padding: 10px 14px; margin: 22px 0 12px;">
									<strong style="color: #12344d; font-size: 15px;">
										Approval Details
									</strong>
								</div>
		
								<!-- Details Table -->
								<table style="width: 100%; border-collapse: collapse;
											font-size: 14px; margin-bottom: 22px;">
		                            <tr>
									    <td width="40%" style="padding: 10px 12px;
										   background-color: #f8fafc;
										   border-bottom: 1px solid #e2e8f0;">
										   <strong>Ticket ID</strong>
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
											<strong>SDM</strong>
										</td>
										<td style="padding: 10px 12px;
											border-bottom: 1px solid #e2e8f0;">
											{self.sdm or ''}
										</td>
									</tr>
		
		
									<tr>
										<td style="padding: 10px 12px;
											background-color: #f8fafc;
											border-bottom: 1px solid #e2e8f0;">
											<strong>Total Bill</strong>
										</td>
										<td style="padding: 10px 12px;
											border-bottom: 1px solid #e2e8f0;">
											<strong style="font-weight: 700; color: #12344d;">
                                                {frappe.utils.fmt_money(self.billing_total or 0, currency=self.billing_currency or "INR")}
											</strong>
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
										View Payment Request
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
					recipient = frappe.db.get_single_value("Dispatch Settings", "fso_head")
					frappe.sendmail(
						recipients=[recipient],
						subject=subject,
						message=message,
						reference_doctype=self.doctype,
						reference_name=self.name
					)
	def on_update(self):
		sync_ticket(self, self.workflow_state)
	

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