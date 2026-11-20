from collections import Counter

import frappe
from frappe.utils import get_datetime, getdate, now_datetime, today


@frappe.whitelist()
def get_lead_dashboard_counts():
    """Status counts + pending follow-up buckets (respects user permissions)."""

    # ---------- Status counts (no SQL functions) ----------
    leads = frappe.get_list(
        "Lead",
        fields=["status"],
        limit_page_length=0,
    )
    statuses = dict(Counter(l.status for l in leads if l.status))

    # ---------- Pending follow-ups (child table: Lead Activity) ----------
    activities = frappe.get_list(
        "Lead Activity",
        parent_doctype="Lead",
        fields=["parent", "follow_up_date"],
        filters={
            "parenttype": "Lead",
            "parentfield": "custom_activity_table",
            "is_followup": 1,
            "is_follow_completed": 0,
        },
        limit_page_length=0,
    )

    now = now_datetime()
    today_date = getdate(today())

    pending, overdue, due_today = set(), set(), set()

    for a in activities:
        due = get_datetime(a.follow_up_date) if a.follow_up_date else None

        if due and due < now:
            overdue.add(a.parent)        # date already passed
        else:
            pending.add(a.parent)        # upcoming or no date

        if due and due.date() == today_date:
            due_today.add(a.parent)

    # a lead that is already overdue shouldn't also count as pending
    pending -= overdue
    return {
        "total": sum(statuses.values()),
        "statuses": statuses,
        "followups": {
            "pending": sorted(pending),
            "overdue": sorted(overdue),
            "today": sorted(due_today),
        },
    }



import frappe


def get_service_vertical_meta():
    """Find the Service Vertical child table and its Link field."""

    table_field = frappe.get_meta("Lead").get_field(
        "custom_service_vertical"
    )

    if not table_field or not table_field.options:
        frappe.throw("Lead Service Vertical child table not found")

    child_doctype = table_field.options
    child_meta = frappe.get_meta(child_doctype)

    vertical_field = next(
        (
            df.fieldname
            for df in child_meta.fields
            if df.fieldname == "service_vertical"
            or (
                df.fieldtype == "Link"
                and df.options == "Service Vertical"
            )
        ),
        None
    )

    if not vertical_field:
        frappe.throw(
            f"Service Vertical field not found in {child_doctype}"
        )

    return child_doctype, vertical_field


@frappe.whitelist()
def get_children(
    doctype=None,
    parent=None,
    company=None,
    service_vertical=None,
    region=None
):
    """
    Lazy-loaded hierarchy:

    Company
        Service Vertical
            Lead
    """

    child_doctype, vertical_field = get_service_vertical_meta()

    lead_table = "`tabLead`"
    child_table = f"`tab{child_doctype}`"

    def make_node(node_type, value, title, expandable):
        return {
            "value": f"{node_type}::{value}",
            "title": title,
            "expandable": expandable
        }

    # Common Lead filters
    conditions = [
        "L.custom_client_company IS NOT NULL",
        "L.custom_client_company != ''"
    ]
    values = []

    if company:
        conditions.append("L.custom_client_company = %s")
        values.append(company)

    if region:
        conditions.append("L.custom_region_name = %s")
        values.append(region)

    where_clause = " AND ".join(conditions)

    # --------------------------------------------------
    # LEVEL 1: CLIENT COMPANY
    # --------------------------------------------------

    if not parent:

        sql = f"""
            SELECT DISTINCT
                L.custom_client_company AS node_value
            FROM {lead_table} L
            WHERE {where_clause}
        """

        if service_vertical:
            sql += f"""
                AND EXISTS (
                    SELECT 1
                    FROM {child_table} SV
                    WHERE SV.parent = L.name
                    AND SV.parenttype = 'Lead'
                    AND SV.parentfield = 'custom_service_vertical'
                    AND SV.`{vertical_field}` = %s
                )
            """
            values.append(service_vertical)

        sql += " ORDER BY node_value LIMIT 200"

        companies = frappe.db.sql(
            sql, values, as_dict=True
        )

        return [
            make_node("COMPANY", row.node_value, row.node_value, 1)
            for row in companies
        ]

    # --------------------------------------------------
    # LEVEL 2: SERVICE VERTICAL
    # --------------------------------------------------

    if parent.startswith("COMPANY::"):

        selected_company = parent.replace("COMPANY::", "", 1)

        sql = f"""
            SELECT DISTINCT
                SV.`{vertical_field}` AS node_value
            FROM {child_table} SV
            INNER JOIN {lead_table} L
                ON L.name = SV.parent
            WHERE
                SV.parenttype = 'Lead'
                AND SV.parentfield = 'custom_service_vertical'
                AND L.custom_client_company = %s
                AND L.custom_region_name = %s
                AND SV.`{vertical_field}` IS NOT NULL
                AND SV.`{vertical_field}` != ''
        """

        params = [selected_company, region or ""]

        if service_vertical:
            sql += f" AND SV.`{vertical_field}` = %s"
            params.append(service_vertical)

        sql += " ORDER BY node_value LIMIT 200"

        verticals = frappe.db.sql(
            sql, params, as_dict=True
        )

        return [
            make_node(
                "VERTICAL",
                f"{selected_company}::{row.node_value}",
                row.node_value,
                1
            )
            for row in verticals
        ]

    # --------------------------------------------------
    # LEVEL 3: LEADS
    # --------------------------------------------------

    if parent.startswith("VERTICAL::"):

        parts = parent.split("::", 2)

        if len(parts) != 3:
            return []

        selected_company = parts[1]
        selected_vertical = parts[2]

        sql = f"""
            SELECT DISTINCT
                L.name,
                L.lead_name
            FROM {lead_table} L
            INNER JOIN {child_table} SV
                ON SV.parent = L.name
            WHERE
                SV.parenttype = 'Lead'
                AND SV.parentfield = 'custom_service_vertical'
                AND L.custom_client_company = %s
                AND SV.`{vertical_field}` = %s
                AND L.custom_region_name = %s
            ORDER BY L.lead_name
            LIMIT 200
        """

        leads = frappe.db.sql(
            sql,
            [
                selected_company,
                selected_vertical,
                region or ""
            ],
            as_dict=True
        )

        return [
            make_node(
                "LEAD",
                row.name,
                f"{row.lead_name or row.name} ({row.name})",
                0
            )
            for row in leads
        ]

    return []
