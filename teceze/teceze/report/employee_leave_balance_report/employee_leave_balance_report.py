# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)
    chart = get_chart(data, filters)

    return columns, data, None, chart


def get_columns():
    return [
        {
            "label": _("Employee ID"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 150,
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "label": _("Email"),
            "fieldname": "email",
            "fieldtype": "Data",
            "width": 220,
        },
        {
            "label": _("Department"),
            "fieldname": "department",
            "fieldtype": "Link",
            "options": "Department",
            "width": 150,
        },
        {
            "label": _("Leave Type"),
            "fieldname": "leave_type",
            "fieldtype": "Link",
            "options": "Leave Type",
            "width": 150,
        },
        {
            "label": _("Total Allocated Leaves"),
            "fieldname": "total_allocated",
            "fieldtype": "Float",
            "width": 150,
        },
        {
            "label": _("Expired Leaves"),
            "fieldname": "expired_leaves",
            "fieldtype": "Float",
            "width": 120,
        },
        {
            "label": _("Used Leaves"),
            "fieldname": "used_leaves",
            "fieldtype": "Float",
            "width": 120,
        },
        {
            "label": _("Leaves Pending Approval"),
            "fieldname": "pending_leaves",
            "fieldtype": "Float",
            "width": 160,
        },
        {
            "label": _("Available Leaves"),
            "fieldname": "available_leaves",
            "fieldtype": "Float",
            "width": 150,
        },
    ]


def get_data(filters):

    conditions = [
        "e.status = 'Active'",
        "IFNULL(e.employment_type, '') != 'Engineer'",
        "la.docstatus = 1",
    ]

    values = {}

    # Employee
    if filters.get("employee"):
        conditions.append("e.name = %(employee)s")
        values["employee"] = filters["employee"]

    # Department
    if filters.get("department"):
        conditions.append("e.department = %(department)s")
        values["department"] = filters["department"]

    # Leave Type
    if filters.get("leave_type"):
        conditions.append("la.leave_type = %(leave_type)s")
        values["leave_type"] = filters["leave_type"]

    # From Date
    if filters.get("from_date"):
        conditions.append("la.from_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    # To Date
    if filters.get("to_date"):
        conditions.append("la.to_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    condition_string = " AND ".join(conditions)

    data = frappe.db.sql(
        f"""
        SELECT
            e.name AS employee,
            e.employee_name,

            COALESCE(
                e.company_email,
                e.personal_email
            ) AS email,

            e.department,

            la.leave_type,

            SUM(
                la.new_leaves_allocated
            ) AS total_allocated,

            0 AS expired_leaves,

            COALESCE(
                used.used_leaves,
                0
            ) AS used_leaves,

            COALESCE(
                pending.pending_leaves,
                0
            ) AS pending_leaves,

            (
                SUM(la.new_leaves_allocated)
                - COALESCE(used.used_leaves, 0)
                - COALESCE(pending.pending_leaves, 0)
            ) AS available_leaves

        FROM `tabEmployee` e

        INNER JOIN `tabLeave Allocation` la
            ON la.employee = e.name

        LEFT JOIN (
            SELECT
                employee,
                leave_type,
                SUM(total_leave_days) AS used_leaves

            FROM `tabLeave Application`

            WHERE
                docstatus = 1
                AND status = 'Approved'

            GROUP BY
                employee,
                leave_type

        ) used
            ON used.employee = la.employee
            AND used.leave_type = la.leave_type

        LEFT JOIN (
            SELECT
                employee,
                leave_type,
                SUM(total_leave_days) AS pending_leaves

            FROM `tabLeave Application`

            WHERE
                docstatus = 1
                AND status NOT IN (
                    'Approved',
                    'Rejected',
                    'Cancelled'
                )

            GROUP BY
                employee,
                leave_type

        ) pending
            ON pending.employee = la.employee
            AND pending.leave_type = la.leave_type

        WHERE {condition_string}

        GROUP BY
            e.name,
            e.employee_name,
            e.company_email,
            e.personal_email,
            e.department,
            la.leave_type,
            used.used_leaves,
            pending.pending_leaves

        ORDER BY
            e.employee_name,
            la.leave_type
        """,
        values,
        as_dict=True,
    )

    return data


def get_chart(data, filters):

    # Show chart only when an employee is selected
    if not filters.get("employee"):
        return None

    labels = []
    values = []

    for row in data:

        leave_type = row.get("leave_type")
        available = row.get("available_leaves") or 0

        if leave_type:
            labels.append(leave_type)
            values.append(float(available))

    if not labels:
        return None

    return {
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": "Available Leaves",
                    "values": values,
                }
            ],
        },
        "type": "bar",
        "height": 350,
        "colors": ["#16a34a"],
    }