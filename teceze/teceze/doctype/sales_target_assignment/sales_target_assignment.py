# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import frappe
from frappe import _
from frappe.model.document import Document

class SalesTargetAssignment(Document):
	
    def validate(self):
        self.validate_assignment_period()

    def validate_assignment_period(self):

        if not self.sales_person:
            return

        if not self.start_date or not self.to_date:
            return

        if self.start_date > self.to_date:
            frappe.throw(_("To Date cannot be earlier than Start Date."))

        overlapping = frappe.db.sql("""
            SELECT name, start_date, to_date
            FROM `tabSales Target Assignment`
            WHERE sales_person = %(sales_person)s
              AND name != %(name)s
              AND docstatus < 2
              AND start_date <= %(to_date)s
              AND COALESCE(to_date, '9999-12-31') >= %(start_date)s
            LIMIT 1
        """, {
            "sales_person": self.sales_person,
            "name": self.name or "",
            "start_date": self.start_date,
            "to_date": self.to_date
        }, as_dict=True)

        if overlapping:

            existing = overlapping[0]

            frappe.throw(
                _("""Sales Person already has a Sales Target Assignment
                during this period.

                Existing Assignment: {0}
                Existing Start Date: {1}
                Existing To Date: {2}

                Please select a different date range.""").format(
                    existing.name,
                    existing.start_date,
                    existing.to_date
                ),
                title=_("Overlapping Assignment")
            )

