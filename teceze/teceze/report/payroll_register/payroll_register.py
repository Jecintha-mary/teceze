# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt


import frappe
from frappe import _
from frappe.utils import flt

import erpnext

salary_slip = frappe.qb.DocType("Salary Slip")
salary_detail = frappe.qb.DocType("Salary Detail")
salary_component = frappe.qb.DocType("Salary Component")

EARNING_ORDER = [
	"Basic",
	"House Rent Allowance",
	"Travelling Allowance",
	"Food Allowance",
	"Fixed Allowance",
]


def execute(filters=None):
	if not filters:
		filters = {}

	company_currency = erpnext.get_company_currency(filters.get("company"))
	currency = filters.get("currency") or company_currency

	salary_slips = get_salary_slips(filters, company_currency)
	if not salary_slips:
		return get_columns([], []), []

	earning_types, ded_types = get_earning_and_deduction_types(salary_slips)
	columns = get_columns(earning_types, ded_types)

	ss_earning_map = get_salary_slip_details(salary_slips, currency, company_currency, "earnings")
	ss_ded_map = get_salary_slip_details(salary_slips, currency, company_currency, "deductions")

	doj_map = get_employee_doj_map()

	data = []
	for ss in salary_slips:
		row = {
			"salary_slip_id": ss.name,
			"employee": ss.employee,
			"employee_name": ss.employee_name,
			"date_of_joining": doj_map.get(ss.employee),
			"posting_date": ss.posting_date,
			"status":ss.status,
			# "branch": ss.branch,
			# "current_payroll_period":ss.current_payroll_period,
			"exchange_rate":ss.exchange_rate,
			"salary_structure":ss.salary_structure,
			"currency":ss.currency,
			"total_working_hours":ss.total_working_hours,
			"bank_name":ss.bank_name,
			# "leave_details":ss.leave_details,
			"bank_account_no":ss.bank_account_no,
			"department": ss.department,
			"designation": ss.designation,
			"company": ss.company,
			"start_date": ss.start_date,
			"end_date": ss.end_date,
			# "hour_rate":ss.hour_rate,
			# "base_hour_rate":ss.base_hour_rate,
			"leave_without_pay": ss.leave_without_pay,
			"absent_days": ss.absent_days,
			"payment_days": ss.payment_days,
			"currency": currency or company_currency,
			"total_working_days":ss.total_working_days,
			"total_loan_repayment": ss.total_loan_repayment,
			"custom_ifsc_code":ss.custom_ifsc_code,
			"custom_bank_holder_name":ss.custom_bank_holder_name,
		}

		# update_column_width(ss, columns)

		for e in earning_types:
			row.update({frappe.scrub(e): ss_earning_map.get(ss.name, {}).get(e)})

		for d in ded_types:
			row.update({frappe.scrub(d): ss_ded_map.get(ss.name, {}).get(d)})

		if currency == company_currency:
			row.update(
				{
					"gross_pay": flt(ss.gross_pay) * flt(ss.exchange_rate),
					"total_deduction": (flt(ss.total_deduction) + flt(ss.total_loan_repayment))
					* flt(ss.exchange_rate),
					"net_pay": flt(ss.net_pay) * flt(ss.exchange_rate),
				}
			)

		else:
			row.update(
				{
					"gross_pay": ss.gross_pay,
					"total_deduction": flt(ss.total_deduction) + flt(ss.total_loan_repayment),
					"net_pay": ss.net_pay,
				}
			)

		data.append(row)

	return columns, data


def sort_by_order(components, order):
	order_map = {name.lower(): idx for idx, name in enumerate(order)}
	# listed components come first in your order, any others follow alphabetically
	return sorted(components, key=lambda c: (order_map.get(c.lower(), len(order_map)), c))


def get_earning_and_deduction_types(salary_slips):
	salary_component_and_type = {_("Earning"): [], _("Deduction"): []}

	for salary_component in get_salary_components(salary_slips):
		component_type = get_salary_component_type(salary_component)
		salary_component_and_type[_(component_type)].append(salary_component)

	return (
		sort_by_order(salary_component_and_type[_("Earning")], EARNING_ORDER),
		sorted(salary_component_and_type[_("Deduction")]),
	)

def update_column_width(ss, columns):
	if ss.branch is not None:
		columns[3].update({"width": 120})
	if ss.department is not None:
		columns[4].update({"width": 120})
	if ss.designation is not None:
		columns[5].update({"width": 120})
	if ss.leave_without_pay is not None:
		columns[9].update({"width": 120})


def get_columns(earning_types, ded_types):
	columns = [
		{
			"label": _("Salary Slip ID"),
			"fieldname": "salary_slip_id",
			"fieldtype": "Link",
			"options": "Salary Slip",
			"width": 150,
		},
		{
			"label": _("Employee"),
			"fieldname": "employee",
			"fieldtype": "Link",
			"options": "Employee",
			"width": 120,
		},
		{
			"label": _("Employee Name"),
			"fieldname": "employee_name",
			"fieldtype": "Data",
			"width": 140,
		},
		{
			"label": _("Date of Joining"),
			"fieldname": "date_of_joining", 
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Department"),
			"fieldname": "department",
			"fieldtype": "Link",
			"options": "Department",
			"width": 120,
		},
		{
			"label": _("Designation"),
			"fieldname": "designation",
			"fieldtype": "Link",
			"options": "Designation",
			"width": 120,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 120,
		},
		{
			"label": _("Start Date"),
			"fieldname": "start_date",
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("End Date"),
			"fieldname": "end_date",
			"fieldtype": "Date",
			"width": 120,
		},
		{
			"label": _("Transaction Date"),
			"fieldname": "posting_date", 
			"fieldtype": "Date",
			"width": 110,
		},
		{
			"label": _("Status"),
			"fieldname": "status", 
			"fieldtype": "select",
			"width": 110,
		},
		
		# {
		# 	"label": _("Current Payroll Period"),
		# 	"fieldname": "current_payroll_period", 
		# 	"fieldtype": "Link",
		# 	"options": "Payroll Period",
		# 	"width": 110,
		# },
		# {
		# 	"label": _("Salary Structure"),
		# 	"fieldname": "salary_structure", 
		# 	"fieldtype": "Link",
		# 	"options": "Salary Structure",
		# 	"width": 110,
		# },
		{
			"label": _("Working Days"),
			"fieldname": "total_working_days", 
			"fieldtype": "Float",
			"width": 110,
		},
		{
			"label": _("Leave Without Pay"),
			"fieldname": "leave_without_pay",
			"fieldtype": "Float",
			"width": 120,
		},
		{
			"label": _("Absent Days"),
			"fieldname": "absent_days",
			"fieldtype": "Float",
			"width": 120,
		},
		{
			"label": _("Payment Days"),
			"fieldname": "payment_days",
			"fieldtype": "Float",
			"width": 120,
		},
		{
			"label": _("Bank Holder Name"),
			"fieldname": "custom_bank_holder_name", 
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Bank Name"),
			"fieldname": "bank_name", 
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("Bank Account No"),
			"fieldname": "bank_account_no", 
			"fieldtype": "Data",
			"width": 110,
		},
		{
			"label": _("IFSC Code"),
			"fieldname": "custom_ifsc_code", 
			"fieldtype": "Data",
			"width": 110,
		},
		
	]

	for earning in earning_types:
		columns.append(
			{
				"label": earning,
				"fieldname": frappe.scrub(earning),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			}
		)

	for deduction in ded_types:
		columns.append(
			{
				"label": deduction,
				"fieldname": frappe.scrub(deduction),
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			}
		)

	if "lending" in frappe.get_installed_apps():
		columns.append(
			{
				"label": _("Loan Repayment"),
				"fieldname": "total_loan_repayment",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			}
		)

	columns.extend(
		[
			{
				"label": _("Total Deduction"),
				"fieldname": "total_deduction",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			},
			{
				"label": _("Gross Pay"),
				"fieldname": "gross_pay",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			},
			{
				"label": _("Net Pay"),
				"fieldname": "net_pay",
				"fieldtype": "Currency",
				"options": "currency",
				"width": 120,
			},
			{
				"label": _("Currency"),
				"fieldtype": "Data",
				"fieldname": "currency",
				"options": "Currency",
				"hidden": 1,
			},
		]
	)
	return columns


def get_salary_components(salary_slips):
	return (
		frappe.qb.from_(salary_detail)
		.where((salary_detail.amount != 0) & (salary_detail.parent.isin([d.name for d in salary_slips])))
		.select(salary_detail.salary_component)
		.distinct()
	).run(pluck=True)


def get_salary_component_type(salary_component):
	return frappe.db.get_value("Salary Component", salary_component, "type", cache=True)


def get_salary_slips(filters, company_currency):
	doc_status = {"Draft": 0, "Submitted": 1, "Cancelled": 2}

	query = frappe.qb.from_(salary_slip).select(salary_slip.star)

	if filters.get("docstatus"):
		query = query.where(salary_slip.docstatus == doc_status[filters.get("docstatus")])

	if filters.get("from_date"):
		query = query.where(salary_slip.start_date >= filters.get("from_date"))

	if filters.get("to_date"):
		query = query.where(salary_slip.end_date <= filters.get("to_date"))

	if filters.get("company"):
		query = query.where(salary_slip.company == filters.get("company"))

	if filters.get("employee"):
		query = query.where(salary_slip.employee == filters.get("employee"))

	if filters.get("currency") and filters.get("currency") != company_currency:
		query = query.where(salary_slip.currency == filters.get("currency"))

	if filters.get("department"):
		query = query.where(salary_slip.department == filters["department"])

	if filters.get("designation"):
		query = query.where(salary_slip.designation == filters["designation"])

	if filters.get("branch"):
		query = query.where(salary_slip.branch == filters["branch"])

	salary_slips = query.run(as_dict=1)

	return salary_slips or []


def get_employee_doj_map():
	employee = frappe.qb.DocType("Employee")

	result = (frappe.qb.from_(employee).select(employee.name, employee.date_of_joining)).run()

	return frappe._dict(result)


def get_salary_slip_details(salary_slips, currency, company_currency, component_type):
	salary_slips = [ss.name for ss in salary_slips]

	result = (
		frappe.qb.from_(salary_slip)
		.join(salary_detail)
		.on(salary_slip.name == salary_detail.parent)
		.where((salary_detail.parent.isin(salary_slips)) & (salary_detail.parentfield == component_type))
		.select(
			salary_detail.parent,
			salary_detail.salary_component,
			salary_detail.amount,
			salary_slip.exchange_rate,
		)
	).run(as_dict=1)

	ss_map = {}

	for d in result:
		ss_map.setdefault(d.parent, frappe._dict()).setdefault(d.salary_component, 0.0)
		if currency == company_currency:
			ss_map[d.parent][d.salary_component] += flt(d.amount) * flt(
				d.exchange_rate if d.exchange_rate else 1
			)
		else:
			ss_map[d.parent][d.salary_component] += flt(d.amount)

	return ss_map
