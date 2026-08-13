# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate, time_diff_in_seconds


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
        },
        {
            "label": _("First Check In"),
            "fieldname": "first_checkin",
            "fieldtype": "Datetime",
            "width": 170,
        },
        {
            "label": _("Last Check Out"),
            "fieldname": "last_checkout",
            "fieldtype": "Datetime",
            "width": 170,
        },
        {
            "label": _("Total Working Hours"),
            "fieldname": "total_working_hours",
            "fieldtype": "Float",
            "width": 150,
        },
        {
            "label": _("Working Hours"),
            "fieldname": "working_hours",
            "fieldtype": "Data",
            "width": 120,
        },
        {
            "label": _("IN / OUT Pairs"),
            "fieldname": "checkin_pairs",
            "fieldtype": "Int",
            "width": 110,
        },
        {
            "label": _("Status"),
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 130,
        },
    ]


def get_data(filters):

    date = filters.get("date") or getdate()


    employee_conditions = [
        "e.status = 'Active'",
        "IFNULL(e.employment_type, '') != 'Engineer'"
    ]

    employee_values = {}

    # Employee
    if filters.get("employee"):
        employee_conditions.append(
            "e.name = %(employee)s"
        )
        employee_values["employee"] = filters["employee"]

    # Department
    if filters.get("department"):
        employee_conditions.append(
            "e.department = %(department)s"
        )
        employee_values["department"] = filters["department"]

    # Report Manager
    if filters.get("reports_to"):
        employee_conditions.append(
            "e.reports_to = %(reports_to)s"
        )
        employee_values["reports_to"] = filters["reports_to"]

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
        employee_values,
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


    employee_checkins = {}

    for checkin in checkins:

        if checkin.employee not in employee_checkins:
            employee_checkins[checkin.employee] = []

        employee_checkins[
            checkin.employee
        ].append(checkin)


    data = []

    for employee in employees:

        employee_id = employee.employee

        rows = employee_checkins.get(
            employee_id,
            []
        )

        first_checkin = None
        last_checkout = None

        total_seconds = 0
        checkin_pairs = 0

        current_in = None
        last_log_type = None


        for row in rows:

            log_type = row.log_type
            log_time = row.time

            last_log_type = log_type

            if log_type == "IN":

                if first_checkin is None:
                    first_checkin = log_time

                # Start IN
                current_in = log_time

            elif log_type == "OUT":

                last_checkout = log_time

                if current_in:

                    seconds = time_diff_in_seconds(
                        log_time,
                        current_in
                    )

                    if seconds > 0:

                        total_seconds += seconds
                        checkin_pairs += 1

                    current_in = None


        total_working_hours = round(
            total_seconds / 3600,
            2
        )

        hours = int(total_seconds // 3600)

        minutes = int(
            (total_seconds % 3600) // 60
        )

        working_hours = f"{hours}:{minutes:02d}"


        if not rows:

            status = "Not Checked In"

        elif last_log_type == "IN":

            status = "IN"

        elif last_log_type == "OUT":

            status = "OUT"

        else:

            status = "Not Checked In"


        data.append(
            {
                "employee": employee_id,
                "employee_name": employee.employee_name,
                "reports_to": employee.reports_to,
                "department": employee.department,
                "employment_type": employee.employment_type,

                "first_checkin": first_checkin,
                "last_checkout": last_checkout,

                "total_working_hours": total_working_hours,
                "working_hours": working_hours,

                "checkin_pairs": checkin_pairs,

                "status": status,
            }
        )

    return data


def get_chart(data):

    in_count = 0
    out_count = 0
    not_checked_in_count = 0

    for row in data:

        status = row.get("status")

        if status == "IN":
            in_count += 1

        elif status == "OUT":
            out_count += 1

        elif status == "Not Checked In":
            not_checked_in_count += 1

    return {
        "data": {
            "labels": [
                "IN",
                "OUT",
                "Not Checked In"
            ],
            "datasets": [
                {
                    "name": "Employees",
                    "values": [
                        in_count,
                        out_count,
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
            "#dc3545"
        ]
    }