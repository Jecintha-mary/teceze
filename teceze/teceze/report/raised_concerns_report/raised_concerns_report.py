import json
from collections import Counter

import frappe
from frappe import _
from frappe.utils import add_months, getdate, today

FILTER_FIELDS = ("status", "priority", "issue_type", "customer", "raised_by")

STATUS_COLORS = {
    "Open": "#FF8A65",
    "Replied": "#35C9B0",
    "On Hold": "#C9CDE0",
    "Resolved": "#7C6CF2",
    "Closed": "#5B8DEF",
}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    data = get_data(filters)
    return get_columns(), data, None, get_chart(data), get_report_summary(data)


def get_columns():
    return [
        {"label": _("Issue"), "fieldname": "name", "fieldtype": "Link", "options": "Issue", "width": 200},
        {"label": _("Subject"), "fieldname": "subject", "fieldtype": "Data", "width": 260},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
        {"label": _("Priority"), "fieldname": "priority", "fieldtype": "Link", "options": "Issue Priority", "width": 100},
        {"label": _("Raised By"), "fieldname": "raised_by", "fieldtype": "Data", "width": 200},
        {"label": _("Opening Date"), "fieldname": "opening_date", "fieldtype": "Date", "width": 160},
        {"label": _("Resolution Date"), "fieldname": "resolution_date", "fieldtype": "Date", "width": 150},
    ]


def get_data(filters):
    from_date = filters.get("from_date") or add_months(today(), -1)
    to_date = filters.get("to_date") or today()

    if getdate(from_date) > getdate(to_date):
        frappe.throw(_("From Date cannot be greater than To Date"))

    conditions = {"opening_date": ["between", [from_date, to_date]]}
    conditions.update({f: filters[f] for f in FILTER_FIELDS if filters.get(f)})

    rows = frappe.get_list(
        "Issue",
        filters=conditions,
        fields=[
            "name", "subject", "status", "priority", "raised_by",
            "opening_date", "custom_resolution_date", "modified",
        ],
        order_by="opening_date desc, creation desc",
    )

    closed_names = [row.name for row in rows if row.status == "Closed"]
    closed_on = get_closed_on(closed_names)

    for row in rows:
        if row.status == "Closed":
            resolved = (
                closed_on.get(row.name)
                or row.custom_resolution_date
                or row.modified
            )
            row.resolution_date = getdate(resolved) if resolved else None
        else:
            row.resolution_date = None

    return rows


def get_closed_on(issue_names):
    """Latest time each Issue was moved to 'Closed', from its change history."""
    if not issue_names:
        return {}

    versions = frappe.get_all(
        "Version",
        filters={
            "ref_doctype": "Issue",
            "docname": ["in", issue_names],
            "data": ["like", "%Closed%"],  # skip versions that cannot contain it
        },
        fields=["docname", "data", "creation"],
        order_by="creation asc",  # oldest first, so the latest close overwrites
    )

    closed_on = {}
    for v in versions:
        try:
            changes = json.loads(v.data or "{}").get("changed", [])
        except ValueError:
            continue

        for change in changes:
            field, new = change[0], change[2]
            if field == "status" and new == "Closed":
                closed_on[v.docname] = v.creation

    return closed_on


def get_report_summary(data):
    status = Counter(row.status for row in data)
    high_priority = sum(1 for row in data if row.priority == "High")

    return [
        {"value": len(data), "label": _("Total Concerns"), "datatype": "Int", "indicator": "Blue"},
        {"value": status["Open"], "label": _("Open"), "datatype": "Int", "indicator": "Red"},
        {
            "value": status["Resolved"] + status["Closed"],
            "label": _("Resolved / Closed"),
            "datatype": "Int",
            "indicator": "Green",
        },
        {"value": high_priority, "label": _("High Priority"), "datatype": "Int", "indicator": "Orange"},
    ]


def get_chart(data):
    if not data:
        return None

    counts = Counter(row.status for row in data)
    labels = list(counts)

    return {
        "data": {
            "labels": labels,
            "datasets": [{"name": _("Concerns"), "values": list(counts.values())}],
        },
        "type": "donut",
        "colors": [STATUS_COLORS.get(label, "#7C6CF2") for label in labels],
    }