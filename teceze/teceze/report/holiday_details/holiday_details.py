# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
    filters = filters or {}

    columns = [
        {
            "label": "Holiday List",
            "fieldname": "holiday_list",
            "fieldtype": "Link",
            "options": "Holiday List",
            "width": 220,
			"hidden": 1
        },
        {
            "label": "Holiday Date",
            "fieldname": "holiday_date",
            "fieldtype": "Date",
            "width": 130,
        },
        {
            "label": "Holiday Name",
            "fieldname": "description",
            "fieldtype": "Data",
            "width": 300,
        },
		 {
            "label": "Status",
            "fieldname": "custom_status",
            "fieldtype": "Data",
            "width": 300,
        },
    ]

    conditions = [
        "hd.weekly_off = 0"
    ]

    values = {}

    if filters.get("holiday_name"):
        conditions.append("h.name = %(holiday_name)s")
        values["holiday_name"] = filters["holiday_name"]

    data = frappe.db.sql(
        f"""
        SELECT
            h.name AS holiday_list,
            hd.holiday_date,
            hd.description,
			hd.custom_status
        FROM `tabHoliday List` h
        INNER JOIN `tabHoliday` hd
            ON hd.parent = h.name
        WHERE {" AND ".join(conditions)}
        ORDER BY hd.holiday_date
        """,
        values,
        as_dict=True,
    )

    return columns, data