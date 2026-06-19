# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt


import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt, getdate,  add_days

from hrms.hr.utils import set_employee_name, validate_active_employee

class ProbationReview(Document):
	def validate(self):	
		if not self.status:
			self.status = "Draft"
		if not self.goals:
			frappe.throw(_("Goals cannot be empty"))
		if self.workflow_state == "Reporting Manager Review":
			if not self.remarks:
				frappe.throw("Remarks is Mandatory")
		if self.workflow_state == "HR Review":
			if not self.manager_reco:
				frappe.throw("Manager Reco is Mandatory")
		# Raji validate for duplicate record
		if self.employee:
		 	existing_probation = frappe.db.exists(
		 		"Probation Review",
		 		{
		 			"employee": self.employee,
		 			"name": ["!=", self.name]
		 		}
		 	)
		 	if existing_probation:
		 		frappe.throw(
		 			f"Probation Review already exists for Employee {self.employee} with ID {existing_probation}"
		 		)


		if self.workflow_state == "Completed":
			if not self.probation_status:
				frappe.throw("Probation Status is Mandatory")
			if self.probation_status == "Accomplished":
				# Update Employment Type in Employee
				frappe.db.set_value(
				"Employee",
				self.employee,
				{
					"employment_type": "Full-time",
					"custom_probation": self.name,
					"custom_probation_status": self.probation_status
				}
				)

				frappe.msgprint(
					"Please proceed with Employee Promotion to Full-time."
				)
				
			elif self.probation_status == "Extended":
				employee = frappe.get_doc("Employee", self.employee)

				if employee.probation_end_date:
			
					frappe.db.set_value(
						"Employee",
						self.employee,
						"probation_end_date",
						add_days(employee.probation_end_date, 30)
					)
				frappe.msgprint(
					"Probation Period extended for 30 days!"
				)

			elif self.probation_status == "Separate":
				frappe.msgprint(
					"Please proceed with Employee Separation SOP."
				)

			frappe.db.commit()
	def get_employee_name(self):
		self.employee_name = frappe.db.get_value("Employee", self.employee, "employee_name")
		return self.employee_name

	def validate_dates(self):
		if getdate(self.start_date) > getdate(self.end_date):
			frappe.throw(_("End Date can not be less than Start Date"))

	def validate_existing_appraisal(self):
		chk = frappe.db.sql("""select name from `tabProbation Review` where employee=%s
			and (status='Submitted' or status='Completed')
			and ((start_date>=%s and start_date<=%s)
			or (end_date>=%s and end_date<=%s))""",
			(self.employee,self.start_date,self.end_date,self.start_date,self.end_date))
		if chk:
			frappe.throw(_("Appraisal {0} created for Employee {1} in the given date range").format(chk[0][0], self.employee_name))

	def calculate_total(self):
		total, total_w  = 0, 0
		for d in self.get('goals'):
			if d.score:
				d.score_earned = flt(d.score) * flt(d.per_weightage) / 100
				total = total + d.score_earned
			total_w += flt(d.per_weightage)

		if int(total_w) != 100:
			frappe.throw(_("Total weightage assigned should be 100%.<br>It is {0}").format(str(total_w) + "%"))

		if frappe.db.get_value("Employee", self.employee, "user_id") != \
				frappe.session.user and total == 0:
			frappe.throw(_("Total cannot be zero"))

		self.total_score = total


	def on_cancel(self):
		frappe.db.set_value(
        self.doctype,
        self.name,
        "status",
        "Cancelled"
    	)
		self.db_set("status", "Cancelled")


@frappe.whitelist()
def get_rm_details(rm_id):
	rm_doc = frappe.get_doc("Employee", rm_id)
	return rm_doc

@frappe.whitelist()
def after_workflow_action(doc, method=None):
    if doc.workflow_state != "Completed":
        return

    if doc.probation_status == "Accomplished":
        # Update Employment Type in Employee
        frappe.db.set_value(
            "Employee",
            doc.employee,
            "employment_type",
            "Full-time"
        )

        frappe.msgprint(
            "Please proceed with Employee Promotion to Full-time."
        )

    elif doc.probation_status == "Extended":
        employee = frappe.get_doc("Employee", doc.employee)

        if employee.probation_end_date:
            employee.probation_end_date = add_days(
                employee.probation_end_date, 30
            )
            employee.save(ignore_permissions=True)

        frappe.msgprint(
            "Probation Period extended for 30 days!"
        )

    elif doc.probation_status == "Separate":
        frappe.msgprint(
            "Please proceed with Employee Separation SOP."
        )
