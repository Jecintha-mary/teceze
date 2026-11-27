# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class EngineerOnboarding(Document):
	def validate(self):
		if not self.bank_details:
			frappe.throw(_("Bank Details are required to save this document."))
