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