
# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

import frappe
from frappe import _
from frappe.query_builder import Criterion
from frappe.query_builder.functions import Extract

from erpnext.accounts.utils import build_qb_match_conditions


def execute(filters=None):
	if not filters:
		filters = {}
	if not filters.get("company"):
		frappe.throw(_("{0} is mandatory").format(_("Company")))
	columns = get_columns()
	data = get_employees(filters)

	return columns, data


def get_columns():
	return [
		_("Employee") + ":Link/Employee:120",
		_("Name") + ":Data:200",
		_("Date of Joining") + ":Date:100",
		_("Branch") + ":Link/Branch:120",
		_("Department") + ":Link/Department:120",
		_("Designation") + ":Link/Designation:120",
		_("Company") + ":Link/Company:120",
	]


def get_employees(filters):
	month = get_filtered_month(filters)

	employee = frappe.qb.DocType("Employee")
	employees = (
		frappe.qb.from_(employee)
		.select(
			employee.name,
			employee.employee_name,
			employee.date_of_joining,
			employee.branch,
			employee.department,
			employee.designation,
			employee.company,
		)
		.where(employee.company == filters.get("company"))
		.where(employee.status == "Active")
		.where(employee.employment_type != "Engineer")
		.where(Extract("month", employee.date_of_joining) == month)
		.where(Criterion.all(build_qb_match_conditions("Employee")))
	).run()

	return employees


def get_filtered_month(filters):
	return [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	].index(filters["month"]) + 1
