import frappe
from frappe import _
from frappe.utils import flt, today, getdate
from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on
DAYS_PER_MONTH = 30

def execute(filters=None):
    filters = filters or {}
    data = get_data(filters)
    return get_columns(), data


def get_columns():
    return [
        {"label": _("Employee"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 160},
        {"label": _("Employee Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 160},
        {"label": _("Department"), "fieldname": "department", "fieldtype": "Link", "options": "Department", "width": 160},
        {"label": _("Designation"), "fieldname": "designation", "fieldtype": "Link", "options": "Designation", "width": 160},
        {"label": _("Date of Joining"), "fieldname": "date_of_joining", "fieldtype": "Date", "width": 160},
        {"label": _("Leave Type"), "fieldname": "leave_type", "fieldtype": "Link", "options": "Leave Type", "width": 160},
        {"label": _("Leave Balance"), "fieldname": "leave_balance", "fieldtype": "Float", "width": 160},
        {"label": _("Annual CTC"), "fieldname": "custom_ctc_value", "fieldtype": "Currency", "width": 160},
        {"label": _("Monthly Salary"), "fieldname": "base", "fieldtype": "Currency", "width": 160},
        {"label": _("Encashment Per Day"), "fieldname": "one_day_salary", "fieldtype": "Currency", "width": 200},
        {"label": _("Encashable Days"), "fieldname": "encashable_days", "fieldtype": "Float", "width": 160},
        {"label": _("Total Encashment Amount"), "fieldname": "encashment_amount", "fieldtype": "Currency", "width": 200},
    ]


def get_encashable_leave_types(filters):
    filters_dict = {"allow_encashment": 1}

    if leave_type := filters.get("leave_type"):
        filters_dict["name"] = leave_type

    return frappe.get_all(
        "Leave Type",
        filters=filters_dict,
        fields=["name", "max_encashable_leaves"]
    )


def get_allocations(leave_period, leave_types, as_on, employee=None):
    if not leave_types:
        return []
    filters = {
        "leave_type": ["in", leave_types],
    }
    if employee:
        filters["employee"] = employee
    if leave_period:
        period = frappe.db.get_value(
            "Leave Period",
            leave_period,
            ["from_date", "to_date"],
            as_dict=True,
        )

        if not period:
            return []

        filters.update({"from_date": ["<=", period.to_date],"to_date": [">=", period.from_date],})
    else:
        filters.update({"from_date": ["<=", as_on],"to_date": [">=", as_on],
        })

    return frappe.get_all(
        "Leave Allocation",
        filters=filters,
        fields=["employee", "leave_type", "from_date", "to_date"],
    )

def get_employees(filters):
    emp_filters = {"status": "Active"}

    if employee := filters.get("employee"):
        emp_filters["name"] = employee

    return frappe.get_all(
        "Employee",
        filters=emp_filters,
        fields=[
            "name",
            "employee_name",
            "department",
            "designation",
            "date_of_joining",
        ],
        order_by="employee_name asc",
    )

def get_salary_map(employees, as_on):
    employees = tuple(set(employees or []))
    if not employees:
        return {}

    rows = frappe.db.sql(
        """
        SELECT employee, base, custom_ctc_value
        FROM (
            SELECT
                employee, base, custom_ctc_value,
                ROW_NUMBER() OVER (
                    PARTITION BY employee
                    ORDER BY from_date DESC, creation DESC
                ) AS rn
            FROM `tabSalary Structure Assignment`
            WHERE docstatus = 1
              AND from_date <= %(as_on)s
              AND employee IN %(employees)s
        ) latest
        WHERE rn = 1
        """,
        {"as_on": as_on, "employees": employees},
        as_dict=True,
    )

    return {
        r.employee: {
            "monthly": flt(r.base),
            "yearly": flt(r.custom_ctc_value),
        }
        for r in rows
    }


def get_data(filters):
    filters = frappe._dict(filters or {})
    as_on = get_as_on_date(filters)

    leave_types = {lt.name: lt for lt in get_encashable_leave_types(filters)}
    if not leave_types:
        return []
    allocations = get_allocations(
        filters.leave_period, list(leave_types), as_on, filters.employee
    )
    employees = {e.name: e for e in get_employees(filters)}
    if not allocations or not employees:
        return []
    pairs = list(
        dict.fromkeys(
            (a.employee, a.leave_type) for a in allocations if a.employee in employees
        )
    )
    salary_map = get_salary_map({employee for employee, _ in pairs}, as_on)
    show_zero = bool(int(filters.show_zero_balance or 0))

    data = []
    for employee, leave_type in pairs:
        balance = flt(
            get_leave_balance_on(
                employee,
                leave_type,
                as_on,
                consider_all_leaves_in_the_allocation_period=True,
            )
        )
        if (balance <= 0) != show_zero:
            continue

        data.append(
            build_row(
                employees[employee],
                leave_types[leave_type],
                balance,
                salary_map.get(employee, {}),
            )
        )

    return data


def get_as_on_date(filters):
    as_on = getdate(filters.as_on_date or today())

    if filters.leave_period:
        period = frappe.db.get_value(
            "Leave Period", filters.leave_period, ["from_date", "to_date"], as_dict=True
        )
        if period:
            as_on = min(max(as_on, getdate(period.from_date)), getdate(period.to_date))

    return as_on


def build_row(emp, leave_type, balance, salary):
    monthly = flt(salary.get("monthly"))
    one_day_salary = max(monthly, 0) / DAYS_PER_MONTH

    encashable_days = max(balance - flt(leave_type.non_encashable_leaves), 0)
    max_encashable = flt(leave_type.max_encashable_leaves)
    if max_encashable:
        encashable_days = min(encashable_days, max_encashable)

    return {
        "employee": emp.name,
        "employee_name": emp.employee_name,
        "department": emp.department,
        "designation": emp.designation,
        "date_of_joining": emp.date_of_joining,
        "leave_type": leave_type.name,
        "leave_balance": balance,
        "custom_ctc_value": flt(salary.get("yearly")),
        "base": monthly,
        "one_day_salary": one_day_salary,
        "encashable_days": encashable_days,
        "encashment_amount": encashable_days * one_day_salary,
    }
