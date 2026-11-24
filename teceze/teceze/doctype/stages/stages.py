# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe

class Stages(Document):
	def autoname(self):
		frappe.log_error("autoname called", "Stages")
		parent = self.parent1 or "Root"
		stage = self.stage_name

		self.name = f"{parent}-{stage}".replace(" ", "-")