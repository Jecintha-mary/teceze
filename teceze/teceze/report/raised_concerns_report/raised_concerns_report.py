import frappe
import json
from collections import Counter
from frappe import _
from frappe.utils import getdate, today, add_months


def execute(filters=None):
    filters = frappe._dict(filters or {})
    data = get_data(filters)
    return( get_columns(),data,None,get_chart(data),get_report_summary(data))


def get_columns():
    return [
        {"label": _("Issue"), "fieldname": "name", "fieldtype": "Link", "options": "Issue", "width": 200},
        {"label": _("Subject"), "fieldname": "subject", "fieldtype": "Data", "width": 260},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
        {"label": _("Priority"), "fieldname": "priority", "fieldtype": "Link", "options": "Issue Priority", "width": 100},
        {"label": _("Raised By"), "fieldname": "raised_by", "fieldtype": "Data", "width": 200},
        {"label": _("Opening Date"), "fieldname": "opening_date", "fieldtype": "Date", "width": 160},
        {"label": _("Resolution Date"), "fieldname": "resolution_date", "fieldtype": "Datetime", "width": 150},
    ]


def get_data(filters):

    from_date = filters.get("from_date") or add_months(today(), -1)
    to_date = filters.get("to_date") or today()

    if getdate(from_date) > getdate(to_date):
        frappe.throw(_("From Date cannot be greater than To Date"))

    conditions = {
        "opening_date": ["between", [from_date, to_date]]
    }

    filter_fields = ["status", "priority", "issue_type", "customer", "raised_by"]

    for field in filter_fields:
        if filters.get(field):
            conditions[field] = filters[field]

    rows = frappe.get_list(
        "Issue",
        filters=conditions,
        fields=[
            "name",
            "subject",
            "status",
            "priority",
            "raised_by",
            "opening_date",
            "custom_resolution_date",
            "modified",
        ],
        order_by="opening_date desc, creation desc",
    )

    # Find when each Closed ticket was moved to Closed (from the change history)
    closed_names = [row.name for row in rows if row.status == "Closed"]
    closed_on = {}

    if closed_names:
        versions = frappe.get_all(
            "Version",
            filters={"ref_doctype": "Issue", "docname": ["in", closed_names]},
            fields=["docname", "data", "creation"],
            order_by="creation asc",
        )
        for v in versions:
            changes = json.loads(v.data or "{}").get("changed", [])
            for field, old, new in changes:
                if field == "status" and new == "Closed":
                    closed_on[v.docname] = v.creation  # latest close wins

    for row in rows:
        if row.status == "Closed":
            row.resolution_date = row.custom_resolution_date or closed_on.get(row.name)
        else:
            row.resolution_date = None

    return rows

def get_report_summary(data):

    return [
        {
            "value": len(data),
            "label": _("Total Concerns"),
            "datatype": "Int",
            "indicator": "Blue",
        },
        {
            "value": sum(row.status == "Open" for row in data),
            "label": _("Open"),
            "datatype": "Int",
            "indicator": "Red",
        },
        {
            "value": sum(
                row.status in ("Resolved", "Closed")
                for row in data
            ),
            "label": _("Resolved / Closed"),
            "datatype": "Int",
            "indicator": "Green",
        },
        {
            "value": sum(row.priority == "High" for row in data),
            "label": _("High Priority"),
            "datatype": "Int",
            "indicator": "Orange",
        },
    ]


def get_chart(data):

    if not data:
        return None

    status_colors = {
        "Open": "#FF8A65",
        "Replied": "#35C9B0",
        "On Hold": "#C9CDE0",
        "Resolved": "#7C6CF2",
        "Closed": "#5B8DEF",
    }

    counts = Counter(row.status for row in data)

    labels = list(counts.keys())

    return {
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": _("Concerns"),
                    "values": [
                        counts[label] for label in labels
                    ],
                }
            ],
        },
        "type": "donut",
        "colors": [
            status_colors.get(label, "#7C6CF2")
            for label in labels
        ],
    }
