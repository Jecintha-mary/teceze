import frappe
from frappe import _
from frappe.utils import flt, today,getdate
from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on

def execute(filters=None):
    filters = filters or {}

    if not (filters.get("employee") or filters.get("employee_name")):
        return get_columns(), [], _("Select an Employee to see results.")

    return get_columns(), get_data(filters)


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
            {"label": _("Encashment Per Day"), "fieldname": "one_day_salary", "fieldtype": "Currency", "width": 160},
            {"label": _("Encashable Days"), "fieldname": "encashable_days", "fieldtype": "Float", "width": 160},
            {"label": _("Total Encashment Amount"), "fieldname": "encashment_amount", "fieldtype": "Currency", "width": 200},  
        ]


def get_encashable_leave_types(filters):
    lt_filters = {"allow_encashment": 1}
    if filters.get("leave_type"):
        lt_filters["name"] = filters["leave_type"]

    return frappe.get_all(
        "Leave Type",
        filters=lt_filters,
        fields=["name", "non_encashable_leaves", "max_encashable_leaves"],
    )


def get_employees(filters):
    emp_filters = {"status": "Active"}
    for key in ("company", "department"):
        if filters.get(key):
            emp_filters[key] = filters[key]

    employee = filters.get("employee") or filters.get("employee_name")
    if employee:
        emp_filters["name"] = employee
        
    return frappe.get_all(
        "Employee",
        filters=emp_filters,
        fields=["name", "employee_name", "department", "designation", "date_of_joining"],
        order_by="employee_name",
    )


def get_salary_map(employees, as_on):
    if not employees:
        return {}

    rows = frappe.get_all(
        "Salary Structure Assignment",
        filters={
            "docstatus": 1,
            "employee": ["in", employees],
            "from_date": ["<=", as_on],
        },
        fields=["employee", "base", "custom_ctc_value"],
        order_by="from_date desc, creation desc",
    )

    salary_map = {}
    for r in rows:
        if r.employee in salary_map:
            continue
        salary_map[r.employee] = {
            "monthly": flt(r.base),
            "yearly": flt(r.custom_ctc_value),
        }

    return salary_map

def get_allocation_leave_period(employee, leave_type, as_on):
    return frappe.db.get_value(
        "Leave Allocation",
        {
            "employee": employee,
            "leave_type": leave_type,
            "docstatus": 1,
            "from_date": ["<=", as_on],
            "to_date": [">=", as_on],
        },
        "leave_period",
    )


def get_data(filters):
    as_on = getdate(filters.get("as_on_date") or today())

    selected_period = filters.get("leave_period")
    if selected_period:
        period = frappe.db.get_value(
            "Leave Period", selected_period, ["from_date", "to_date"], as_dict=True
        )
        if period:
            as_on = min(max(as_on, getdate(period.from_date)), getdate(period.to_date))

    leave_types = get_encashable_leave_types(filters)
    if not leave_types:
        return []

    employees = get_employees(filters)
    salary_map = get_salary_map([e.name for e in employees], as_on)

    data = []
    for emp in employees:
        sal = salary_map.get(emp.name, {})
        annual = sal.get("yearly", 0)    # custom_ctc_value
        monthly = sal.get("monthly", 0)  # base
        one_day = monthly / 30           # base / 30

        for lt in leave_types:
            leave_period = get_allocation_leave_period(emp.name, lt.name, as_on)

            if selected_period and leave_period != selected_period:
                continue

            balance = flt(
                get_leave_balance_on(
                    emp.name,
                    lt.name,
                    as_on,
                    consider_all_leaves_in_the_allocation_period=True,
                )
            )

            non_encashable = flt(lt.non_encashable_leaves)
            max_encashable = flt(lt.max_encashable_leaves)

            encashable = max(balance - non_encashable, 0)
            if max_encashable:
                encashable = min(encashable, max_encashable)

            data.append({
                "employee": emp.name,
                "employee_name": emp.employee_name,
                "department": emp.department,
                "designation": emp.designation,
                "date_of_joining": emp.date_of_joining,
                "leave_type": lt.name,
                "leave_balance": balance,
                "custom_ctc_value": annual,
                "base": monthly,
                "one_day_salary": one_day,
                "encashable_days": encashable,
                "encashment_amount": encashable * one_day,
            })

    return data