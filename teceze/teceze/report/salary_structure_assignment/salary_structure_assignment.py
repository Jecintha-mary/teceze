import frappe
from frappe import _


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    return [
        {
            "label": _("Employee"),
            "fieldname": "employee",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "label": _("Department"),
            "fieldname": "department",
            "fieldtype": "Link",
            "options": "Department",
            "width": 180,
        },
        {
            "label": _("Designation"),
            "fieldname": "designation",
            "fieldtype": "Link",
            "options": "Designation",
            "width": 180,
        },
        {
            "label": _("Salary Structure"),
            "fieldname": "salary_structure",
            "fieldtype": "Link",
            "options": "Salary Structure",
            "width": 180,
        },
        {
            "label": _("Employee Status"),
            "fieldname": "employee_status",
            "fieldtype": "Data",
            "width": 120,
        },
        {
            "label": _("From Date"),
            "fieldname": "from_date",
            "fieldtype": "Date",
            "width": 110,
        },
        {
            "label": _("CTC Components Yearly"),
            "fieldname": "ctc",
            "fieldtype": "Currency",
            "width": 150,
        },
        {
            "label": _("Gross Salary"),
            "fieldname": "gross_salary",
            "fieldtype": "Currency",
            "width": 140,
        },
        {
            "label": _("PF Employer Contribution"),
            "fieldname": "pf_employer_contribution",
            "fieldtype": "Currency",
            "width": 170,
        },
        {
            "label": _("Variable"),
            "fieldname": "variable",
            "fieldtype": "Currency",
            "width": 120,
        },
        {
            "label": _("Total Monthly CTC"),
            "fieldname": "monthly_ctc",
            "fieldtype": "Currency",
            "width": 150,
        },
        {
            "label": _("Basic Salary"),
            "fieldname": "basic",
            "fieldtype": "Currency",
            "width": 130,
        },
        {
            "label": _("Travelling Allowance"),
            "fieldname": "travelling_allowance",
            "fieldtype": "Currency",
            "width": 160,
        },
        {
            "label": _("House Rent Allowance"),
            "fieldname": "hra",
            "fieldtype": "Currency",
            "width": 170,
        },
        {
            "label": _("Food Allowance"),
            "fieldname": "food_allowance",
            "fieldtype": "Currency",
            "width": 140,
        },
        {
            "label": _("Fixed Allowance"),
            "fieldname": "fixed_allowance",
            "fieldtype": "Currency",
            "width": 140,
        },
        {
            "label": _("Employee PF"),
            "fieldname": "employee_pf",
            "fieldtype": "Currency",
            "width": 130,
        },
        {
            "label": _("Net Pay"),
            "fieldname": "net_pay",
            "fieldtype": "Currency",
            "width": 140,
        },
    ]


def get_data(filters):
    conditions = []
    values = {}

    if filters.get("employee"):
        conditions.append("""
            ssa.employee = %(employee)s
        """)
        values["employee"] = filters.get("employee")

    if filters.get("employee_name"):
        conditions.append("""
            ssa.employee_name LIKE %(employee_name)s
        """)
        values["employee_name"] = f"%{filters.get('employee_name')}%"

    if filters.get("department"):
        conditions.append("""
            ssa.department = %(department)s
        """)
        values["department"] = filters.get("department")

    if filters.get("designation"):
        conditions.append("""
            ssa.designation = %(designation)s
        """)
        values["designation"] = filters.get("designation")

    if (
        filters.get("employee_status")
        and filters.get("employee_status") != "All"
    ):
        conditions.append("""
            e.status = %(employee_status)s
        """)
        values["employee_status"] = filters.get("employee_status")

    if filters.get("from_date"):
        conditions.append("""
            ssa.from_date = %(from_date)s
        """)
        values["from_date"] = filters.get("from_date")

    condition_string = " AND ".join(conditions)

    if not condition_string:
        condition_string = "1=1"

    query = f"""
        SELECT

            -- Employee ID only
            ssa.employee AS employee,

            -- Employee Name
            ssa.employee_name AS employee_name,

            -- Employee Details
            ssa.department AS department,
            ssa.designation AS designation,
            ssa.salary_structure AS salary_structure,

            -- Employee Status
            e.status AS employee_status,

            -- Assignment Date
            ssa.from_date AS from_date,

            -- Yearly CTC
            ssa.custom_ctc_value AS ctc,

            -- Gross Salary
            ssa.custom_gross_salary AS gross_salary,

            -- Employer PF
            ssa.custom_pf_employer_contribution
                AS pf_employer_contribution,

            -- Variable
            ssa.custom_mon_variable AS variable,

            -- Monthly CTC
            ssa.custom_monthly_ctc AS monthly_ctc,

            -- Salary Components
            ssa.custom_basic AS basic,

            ssa.custom_travelling_allowance
                AS travelling_allowance,

            ssa.custom_hra AS hra,

            ssa.custom_food_allowance AS food_allowance,

            ssa.custom_fixed_allowance AS fixed_allowance,

            -- Employee PF
            ssa.custom_employee_pf AS employee_pf,

            -- Net Pay
            ssa.custom_net_pay AS net_pay

        FROM
            `tabSalary Structure Assignment` ssa

        INNER JOIN
            `tabEmployee` e
                ON e.name = ssa.employee

        WHERE
            {condition_string}

        ORDER BY
            ssa.from_date DESC,
            ssa.employee_name ASC
    """

    return frappe.db.sql(
        query,
        values,
        as_dict=True
    )