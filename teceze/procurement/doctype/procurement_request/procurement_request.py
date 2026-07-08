# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ProcurementRequest(Document):

	def validate(self):
		for row in self.items:

			lead = frappe.new_doc("Lead")

			# Basic Details
			lead.organization_name = self.client_name
			lead.first_name = self.contact_person
			# lead.email_id = self.email
			lead.mobile_no = self.phone_number

			# Address
			lead.country = self.country
			lead.city = self.location

			# Custom Fields
			lead.custom_required_item = row.item_code
			lead.custom_no_of_items = row.qty
			lead.custom_amount = row.amount
			lead.custom_procurement_id = self.name
			

			lead.insert(ignore_permissions=True)
			row.lead = lead.name
			frappe.db.set_value(row.doctype,row.name,"lead",lead.name)
			
		# self.save(ignore_permissions=True)
	
	def after_insert(self):
		pass
		# ticket = frappe.new_doc("HD Ticket")

		# ticket.subject = f"Procurement Request - {self.client_name} - {self.request_type}"
		# ticket.custom_client_name = self.client_name
		# ticket.custom_contact_person_name_ = self.contact_person
		# ticket.custom_phone = self.phone_number
		# ticket.priority = self.priority
		# ticket.custom_site_location = self.location
		# ticket.custom_country = self.country
		# ticket.raised_by = self.email
		# ticket.custom_number_of_engineers_required = self.number_of_items_required
		# ticket.custom_postal_code = self.postal_code
		# ticket.custom_address = self.address
		# ticket.custom_spoc_name = self.spoc_name
		# ticket.custom_phone_number = self.spoc_phone_number
		# ticket.custom_spoc_email = self.spoc_email
		# ticket.custom_sme_name = self.sme_name
		# ticket.custom_sme_phone_number = self.sme_phone_number
		# ticket.custom_sme_email = self.sme_email
		#ticket.insert(ignore_permissions=True)

#dharshini(to trigger sales order id in Pr Form )
def update_sales_order(doc, method):
    lead = frappe.db.get_value(
        "Quotation",
        doc.custom_quotation,
        "party_name"
    )
    if lead:
        frappe.db.set_value(
            "Procurement Request Item",
            {"lead": lead},
            "sales_order",
            doc.name
        )
#Updating Both lead status and so status
def onload(doc, method):

    lead_names = list({row.lead for row in doc.items if row.lead})

    so_names = list({row.sales_order for row in doc.items if row.sales_order})

    lead_status_map = {
        d.name: d.status
        for d in frappe.get_all(
            "Lead",
            filters={"name": ["in", lead_names]},
            fields=["name", "status"]
        )
    }

    so_status_map = {
        d.name: d.status
        for d in frappe.get_all(
            "Sales Order",
            filters={"name": ["in", so_names]},
            fields=["name", "status"]
        )
    }

    # Update UI
    for row in doc.items:

        if row.lead:
            row.lead_status = lead_status_map.get(row.lead)

        if row.sales_order:
            row.so_status = so_status_map.get(row.sales_order)