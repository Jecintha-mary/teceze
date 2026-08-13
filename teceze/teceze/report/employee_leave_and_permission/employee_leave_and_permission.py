# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = get_data(filters)
    chart = get_chart(data)

    return columns, data, None, chart


def get_columns():
    return [
        {
            "label": _("Employee ID"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 140,
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180,
        },
        {
            "label": _("Report Manager"),
            "fieldname": "reports_to",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 180,
        },
        {
            "label": _("Department"),
            "fieldname": "department",
            "fieldtype": "Link",
            "options": "Department",
            "width": 160,
        },
        {
            "label": _("Employment Type"),
            "fieldname": "employment_type",
            "fieldtype": "Link",
            "options": "Employment Type",
            "width": 140,
			"hidden":1
        },
        {
            "label": _("First Check In"),
            "fieldname": "first_checkin",
            "fieldtype": "Datetime",
            "width": 170,
			"hidden":1
        },
        {
            "label": _("Last Check Out"),
            "fieldname": "last_checkout",
            "fieldtype": "Datetime",
            "width": 170,
			"hidden":1
        },
        {
            "label": _("Status"),
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": _("Leave Type"),
            "fieldname": "leave_type",
            "fieldtype": "Link",
            "options": "Leave Type",
            "width": 130,
        },
        {
            "label": _("Leave Status"),
            "fieldname": "leave_status",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": _("Half Day"),
            "fieldname": "half_day",
            "fieldtype": "Check",
            "width": 90,
        },
    ]


def get_data(filters):

    date = filters.get("date") or getdate()


    employee_conditions = [
        "e.status = 'Active'",
        "IFNULL(e.employment_type, '') != 'Engineer'"
    ]

    values = {
        "date": date
    }

    # Employee filter
    if filters.get("employee"):
        employee_conditions.append(
            "e.name = %(employee)s"
        )
        values["employee"] = filters["employee"]

    # Department filter
    if filters.get("department"):
        employee_conditions.append(
            "e.department = %(department)s"
        )
        values["department"] = filters["department"]

    # Report Manager filter
    if filters.get("reports_to"):
        employee_conditions.append(
            "e.reports_to = %(reports_to)s"
        )
        values["reports_to"] = filters["reports_to"]

    condition_string = " AND ".join(employee_conditions)


    employees = frappe.db.sql(
        f"""
        SELECT
            e.name AS employee,
            e.employee_name,
            e.reports_to,
            e.department,
            e.employment_type

        FROM `tabEmployee` e

        WHERE {condition_string}

        ORDER BY e.employee_name
        """,
        values,
        as_dict=True,
    )


    checkins = frappe.db.sql(
        """
        SELECT
            employee,
            time,
            log_type

        FROM `tabEmployee Checkin`

        WHERE
            employee IS NOT NULL
            AND DATE(time) = %(date)s

        ORDER BY
            employee,
            time
        """,
        {
            "date": date
        },
        as_dict=True,
    )

    # Group checkins by employee

    employee_checkins = {}

    for checkin in checkins:

        if checkin.employee not in employee_checkins:
            employee_checkins[checkin.employee] = []

        employee_checkins[
            checkin.employee
        ].append(checkin)


    leaves = frappe.db.sql(
        """
        SELECT
            employee,
            leave_type,
            status,
            half_day

        FROM `tabLeave Application`

        WHERE
            docstatus != 2
            AND status NOT IN ('Cancelled', 'Rejected')
            AND from_date <= %(date)s
            AND to_date >= %(date)s

        ORDER BY
            from_date DESC
        """,
        {
            "date": date
        },
        as_dict=True,
    )

    # Group leave by employee

    employee_leaves = {}

    for leave in leaves:

        if leave.employee not in employee_leaves:
            employee_leaves[leave.employee] = []

        employee_leaves[
            leave.employee
        ].append(leave)


    data = []

    for employee in employees:

        employee_id = employee.employee

        employee_checkin_list = employee_checkins.get(
            employee_id,
            []
        )

        employee_leave_list = employee_leaves.get(
            employee_id,
            []
        )


        leave = None

        if employee_leave_list:
            leave = employee_leave_list[0]


        first_checkin = None
        last_checkout = None
        last_log_type = None

        if employee_checkin_list:

            first_checkin = employee_checkin_list[0].time

            last_record = employee_checkin_list[-1]

            last_log_type = last_record.log_type

            # Find last OUT
            for checkin in reversed(employee_checkin_list):

                if checkin.log_type == "OUT":
                    last_checkout = checkin.time
                    break


        if leave:

            status = "On Leave"

        elif last_log_type == "IN":

            status = "IN"

        elif last_log_type == "OUT":

            status = "OUT"

        else:

            status = "Not Checked In"


        if leave:

            leave_type = leave.leave_type
            leave_status = leave.status
            half_day = 1 if leave.half_day else 0

        else:

            leave_type = ""
            leave_status = ""
            half_day = 0


        data.append(
            {
                "employee": employee_id,
                "employee_name": employee.employee_name,
                "reports_to": employee.reports_to,
                "department": employee.department,
                "employment_type": employee.employment_type,

                "first_checkin": first_checkin,
                "last_checkout": last_checkout,

                "status": status,

                "leave_type": leave_type,
                "leave_status": leave_status,
                "half_day": half_day,
            }
        )

    return data


def get_chart(data):

    in_count = 0
    out_count = 0
    leave_count = 0
    not_checked_in_count = 0

    for row in data:

        status = row.get("status")

        if status == "IN":
            in_count += 1

        elif status == "OUT":
            out_count += 1

        elif status == "On Leave":
            leave_count += 1

        elif status == "Not Checked In":
            not_checked_in_count += 1

    return {
        "data": {
            "labels": [
                "IN",
                "OUT",
                "On Leave",
                "Not Checked In"
            ],
            "datasets": [
                {
                    "name": "Employees",
                    "values": [
                        in_count,
                        out_count,
                        leave_count,
                        not_checked_in_count
                    ]
                }
            ]
        },
        "type": "donut",
        "height": 300,
        "colors": [
            "#16a34a",
            "#f4a261",
            "#ff9800",
            "#dc3545"
        ]
    }