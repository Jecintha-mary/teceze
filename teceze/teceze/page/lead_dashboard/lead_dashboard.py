import calendar
from collections import defaultdict
from datetime import date, timedelta

import frappe
from frappe.utils import add_days, getdate, nowdate


ACTIVITY_TYPES = (
    "Call",
    "Email",
    "Message",
    "Meeting",
    "Visit",
    "Proposal",
    "Lead Generation",
)


# ---------------------------------------------------------
# DATE RANGE
# ---------------------------------------------------------

def _date_window(period):
    today = getdate(nowdate())

    if period == "daily":
        return today, today
    if period == "weekly":
        return add_days(today, -6), today
    if period == "monthly":
        return today.replace(day=1), today
    if period == "quarterly":
        first_month = ((today.month - 1) // 3) * 3 + 1
        return date(today.year, first_month, 1), today

    frappe.throw("Invalid period")


def _has_field(doctype, fieldname):
    return frappe.get_meta(doctype).has_field(fieldname)


# ---------------------------------------------------------
# EMPLOYEE LIST
# ---------------------------------------------------------

def _get_employees():
    fields = ["name", "employee_name", "user_id"]

    if _has_field("Employee", "department"):
        fields.append("department")

    filters = {}
    if _has_field("Employee", "status"):
        filters["status"] = "Active"

    return frappe.get_all(
        "Employee",
        filters=filters,
        fields=fields,
        order_by="employee_name asc",
        limit_page_length=0,
    )


def _get_selected_employee(employee):
    if not employee or employee == "all":
        return None

    rows = frappe.get_all(
        "Employee",
        filters={
            "name": employee,
            "status": "Active",
        },
        fields=["name", "employee_name", "user_id", "department"],
        limit_page_length=1,
    )

    if not rows:
        frappe.throw("Selected employee does not exist or is inactive.")

    selected = rows[0]

    if not selected.get("user_id"):
        frappe.throw(
            "This Employee has no User ID. Please set Employee.user_id "
            "before loading this employee's Leads and Opportunities."
        )

    return selected


# ---------------------------------------------------------
# LEADS
# ---------------------------------------------------------
def _get_leads(user_id=None):

    # Never return all Leads when user_id is empty.
    if not user_id:
        return []

    return frappe.get_all(
        "Lead",
        filters={
            "owner": user_id
        },
        fields=[
            "name",
            "lead_owner",
            "creation",
            "status"
        ],
        order_by="creation desc",
        limit_page_length=0
    )

# ---------------------------------------------------------
# LEAD ACTIVITIES
# ---------------------------------------------------------

def _get_lead_activities(lead_names):
    if not lead_names:
        return []

    return frappe.get_all(
        "Lead Activity",
        filters={
            "parent": ["in", lead_names],
            "parenttype": "Lead",
            "parentfield": "custom_activity_table",
        },
        fields=[
            "name",
            "parent",
            "activity_type",
            "activity_date",
            "follow_up_date",
            "is_followup",
            "is_follow_completed",
        ],
        order_by="activity_date asc",
        limit_page_length=0,
    )


# ---------------------------------------------------------
# OPPORTUNITIES
# ---------------------------------------------------------

def _get_opportunities(user_id, start, end):
    filters = {
        "creation": ["between", [str(start), str(end)]]
    }

    # Opportunity Owner is a User field in the CRM setup.
    if user_id and _has_field("Opportunity", "opportunity_owner"):
        filters["opportunity_owner"] = user_id
    elif user_id:
        # Fallback only if this site's Opportunity has no opportunity_owner.
        filters["owner"] = user_id

    fields = ["name", "owner", "creation"]
    for field in (
        "status",
        "opportunity_amount",
        "currency",
        "workflow_state",
        "opportunity_owner",
    ):
        if _has_field("Opportunity", field):
            fields.append(field)

    return frappe.get_all(
        "Opportunity",
        filters=filters,
        fields=list(dict.fromkeys(fields)),
        order_by="creation desc",
        limit_page_length=0,
    )


# ---------------------------------------------------------
# QUOTATIONS
# ---------------------------------------------------------

def _get_quotations(employee, start, end):
    filters = {
        "creation": ["between", [str(start), str(end)]]
    }

    if employee:
        # Prefer an Employee link when the quotation has one.
        if _has_field("Quotation", "custom_sales_person"):
            filters["custom_sales_person"] = employee.name
        elif _has_field("Quotation", "sales_person"):
            filters["sales_person"] = employee.name
        else:
            # Standard document owner is the User who created the quotation.
            filters["owner"] = employee.user_id

    fields = ["name", "owner", "creation"]
    for field in (
        "status",
        "grand_total",
        "currency",
        "party_name",
        "customer_name",
        "custom_sales_person",
        "sales_person",
    ):
        if _has_field("Quotation", field):
            fields.append(field)

    return frappe.get_all(
        "Quotation",
        filters=filters,
        fields=list(dict.fromkeys(fields)),
        order_by="creation desc",
        limit_page_length=0,
    )


# ---------------------------------------------------------
# SALES TARGET ASSIGNMENT
# ---------------------------------------------------------

def _normalise_target_type(value):
    value = (value or "").strip().lower()

    mapping = {
        "call": "Call",
        "calls": "Call",
        "email": "Email",
        "emails": "Email",
        "message": "Message",
        "messages": "Message",
        "meeting": "Meeting",
        "meetings": "Meeting",
        "visit": "Visit",
        "visits": "Visit",
        "proposal": "Proposal",
        "proposals": "Proposal",
        "lead generation": "Lead Generation",
        "sales amount": "Sales Amount",
    }

    return mapping.get(value, value.title())


def _target_daily_value(target_value, period_type, day):
    period_type = (period_type or "").strip().lower()
    target_value = float(target_value or 0)

    if period_type == "daily":
        return target_value

    if period_type == "monthly":
        days = calendar.monthrange(day.year, day.month)[1]
        return target_value / days

    if period_type == "quarterly":
        first_month = ((day.month - 1) // 3) * 3 + 1
        quarter_start = date(day.year, first_month, 1)
        last_month = first_month + 2
        quarter_end = date(
            day.year,
            last_month,
            calendar.monthrange(day.year, last_month)[1],
        )
        days = (quarter_end - quarter_start).days + 1
        return target_value / days

    if period_type in ("half-yearly", "half yearly"):
        first_month = 1 if day.month <= 6 else 7
        half_start = date(day.year, first_month, 1)
        last_month = first_month + 5
        half_end = date(
            day.year,
            last_month,
            calendar.monthrange(day.year, last_month)[1],
        )
        days = (half_end - half_start).days + 1
        return target_value / days

    if period_type == "yearly":
        days = 366 if calendar.isleap(day.year) else 365
        return target_value / days

    return 0


def _get_targets(employee_id, start, end):
    """
    Sales Target Assignment.sales_person is a Link to Employee.
    Selected employee: filter by the Employee document name.
    All Employees: fetch assignments for all active employees.
    """
    filters = {
        "start_date": ["<=", end],
        "to_date": [">=", start],
    }

    if employee_id:
        filters["sales_person"] = employee_id

    assignments = frappe.get_all(
        "Sales Target Assignment",
        filters=filters,
        fields=[
            "name",
            "sales_person",
            "start_date",
            "to_date",
        ],
        limit_page_length=0,
    )

    if not assignments:
        return {}

    assignment_map = {row.name: row for row in assignments}

    details = frappe.get_all(
        "Sales Target Assignment Detail",
        filters={
            "parent": ["in", list(assignment_map.keys())],
            "parenttype": "Sales Target Assignment",
            "parentfield": "target_details",
        },
        fields=[
            "parent",
            "target_type",
            "period_type",
            "target_value",
        ],
        limit_page_length=0,
    )

    targets = defaultdict(float)

    for detail in details:
        assignment = assignment_map.get(detail.parent)
        if not assignment:
            continue

        active_start = max(getdate(assignment.start_date), start)
        active_end = min(getdate(assignment.to_date), end)

        if active_start > active_end:
            continue

        target_type = _normalise_target_type(detail.target_type)

        day = active_start
        while day <= active_end:
            targets[(assignment.sales_person, target_type)] += (
                _target_daily_value(
                    detail.target_value,
                    detail.period_type,
                    day,
                )
            )
            day += timedelta(days=1)

    return dict(targets)


# ---------------------------------------------------------
# EMPLOYEE DROPDOWN API
# ---------------------------------------------------------

@frappe.whitelist()
def get_lead_dashboard_employees():
    return [
        {
            "name": row.name,
            "employee_name": row.employee_name or row.name,
            "department": row.get("department"),
            "user_id": row.get("user_id"),
        }
        for row in _get_employees()
    ]



def _can_view_employee_performance():
    """
    Only Administrator and users with the System Manager role may see
    the all-employee Employee Performance table.
    Other dashboard data and employee selection remain unchanged.
    """
    user = frappe.session.user
    return (
        user == "Administrator"
        or "System Manager" in frappe.get_roles(user)
    )


def _is_dashboard_admin():
    user = frappe.session.user
    roles = frappe.get_roles(user)

    return (
        user == "Administrator"
        or "System Manager" in roles
        or "Sales Manager" in roles
         or "Presales Manager" in roles 
        
    )

def _get_logged_in_employee():
    user = frappe.session.user

    employees = frappe.get_all(
        "Employee",
        filters={
            "user_id": user,
            "status": "Active"
        },
        fields=["name", "employee_name", "user_id", "department"],
        limit_page_length=1
    )

    if not employees:
        frappe.throw(
            "Your user account is not linked to an active Employee. "
            "Please contact your Administrator."
        )

    return employees[0]
@frappe.whitelist()
def get_lead_dashboard_data(period="daily", employee="all"):
    if period not in ("daily", "weekly", "monthly", "quarterly"):
        frappe.throw("Invalid period")

    start, end = _date_window(period)
    # Employee selection based on logged-in user's permission
    if _is_dashboard_admin() and employee and employee != "all":
        # Admin / System Manager / Sales Manager can select an employee
        selected_employee = _get_selected_employee(employee)
    else:
        # Normal employees can ONLY see their own data
        selected_employee = _get_logged_in_employee()

    selected_user = selected_employee.user_id
    selected_employee_id = selected_employee.name

    # 1. Leads: selected employee's User ID -> Lead.lead_owner.
    leads = _get_leads(user_id=selected_user)

    lead_names = [row.name for row in leads]

    # 2. Activities: only child rows belonging to those Leads.
    activities = _get_lead_activities(lead_names)

    activity_counts = defaultdict(int)
    daily_counts = defaultdict(int)
    followups_due = 0

    for activity in activities:
        # Follow-ups are counted by their due date.
        if activity.is_followup and activity.follow_up_date:
            due_date = getdate(activity.follow_up_date)
            if (
                start <= due_date <= end
                and not activity.is_follow_completed
            ):
                followups_due += 1

        if not activity.activity_date:
            continue

        activity_date = getdate(activity.activity_date)
        if not (start <= activity_date <= end):
            continue

        activity_type = activity.activity_type or "Other"
        activity_counts[activity_type] += 1
        daily_counts[activity_date.isoformat()] += 1

    # 3. Lead Generation actual: Leads created during the period.
    # 3. Lead Generation actual: Count only leads created
    lead_generation_actual = sum(
        1
        for lead in leads
        if lead.creation
        and start <= getdate(lead.creation) <= end
    )

    # 4. Targets: Sales Target Assignment.sales_person -> Employee.name.
    target_map = _get_targets(
        employee_id=selected_employee_id,
        start=start,
        end=end,
    )

    activity_summary = []

    for activity_type in ACTIVITY_TYPES:
        if activity_type == "Lead Generation":
            actual = lead_generation_actual
        else:
            actual = activity_counts.get(activity_type, 0)

        # Always get target for the selected employee only
        target = target_map.get(
            (selected_employee_id, activity_type),
            0
        )

        activity_summary.append({
            "activity_type": activity_type,
            "actual": actual,
            "target": round(target, 2),
            "achievement": (
                round(actual / target * 100, 1)
                if target else 0
            ),
        })

    # 5. Opportunities: selected employee's User ID -> opportunity_owner.
    opportunities = _get_opportunities(
        user_id=selected_user,
        start=start,
        end=end,
    )

    # 6. Quotations for the selected employee.
    quotations = _get_quotations(
        employee=selected_employee,
        start=start,
        end=end,
    )

    opportunity_status = defaultdict(int)
    pipeline_by_currency = defaultdict(float)

    for opportunity in opportunities:
        opportunity_status[
            opportunity.get("status") or "Unspecified"
        ] += 1

        currency = opportunity.get("currency") or "INR"
        pipeline_by_currency[currency] += float(
            opportunity.get("opportunity_amount") or 0
        )

    quotation_status = defaultdict(int)

    for quotation in quotations:
        quotation_status[
            quotation.get("status") or "Unspecified"
        ] += 1

    # 7. Trend.
    trend_categories = []
    trend_values = []

    if period == "quarterly":
        monthly_totals = defaultdict(int)

        for day_string, count in daily_counts.items():
            monthly_totals[day_string[:7]] += count

        cursor = start.replace(day=1)
        while cursor <= end:
            key = cursor.strftime("%Y-%m")
            trend_categories.append(cursor.strftime("%b"))
            trend_values.append(monthly_totals.get(key, 0))

            cursor = date(
                cursor.year + (cursor.month // 12),
                (cursor.month % 12) + 1,
                1,
            )
    else:
        cursor = start
        while cursor <= end:
            key = cursor.isoformat()
            trend_categories.append(cursor.strftime("%d %b"))
            trend_values.append(daily_counts.get(key, 0))
            cursor += timedelta(days=1)

    # 8. Employee performance table: System Manager only.
    can_view_employee_performance = _can_view_employee_performance()
    team_summary = []

    if can_view_employee_performance:
        # 8. Employee performance table.
        if selected_employee:
            employees_for_summary = [selected_employee]
        else:
            employees_for_summary = _get_employees()

        # Map Lead Owner User IDs back to Employee IDs for the All Employees table.
        user_to_employee = {
            str(row.user_id).strip().lower(): row
            for row in employees_for_summary
            if row.get("user_id")
        }

        employee_activity_counts = defaultdict(lambda: defaultdict(int))

        # We already have Leads/activities in All Employees mode. Attribute
        # each parent Lead's activities using Lead.lead_owner.
        lead_user_by_name = {
            row.name: str(row.lead_owner or "").strip().lower()
            for row in leads
        }

        for activity in activities:
            parent_lead = activity.parent
            owner_user = lead_user_by_name.get(parent_lead)
            employee_row = user_to_employee.get(owner_user)

            if (
                employee_row
                and activity.activity_date
                and start <= getdate(activity.activity_date) <= end
            ):
                employee_activity_counts[employee_row.name][
                    activity.activity_type or "Other"
                ] += 1

        # Add Lead Generation actuals to each employee's team summary.
        for lead in leads:
            owner_user = str(lead.lead_owner or "").strip().lower()
            employee_row = user_to_employee.get(owner_user)

            if (
                employee_row
                and lead.creation
                and start <= getdate(lead.creation) <= end
            ):
                employee_activity_counts[employee_row.name]["Lead Generation"] += 1

        team_summary = []

        for employee_row in employees_for_summary:
            counts = employee_activity_counts.get(employee_row.name, {})
            actual = sum(counts.values())

            if selected_employee_id:
                employee_target = {
                    target_type: value
                    for (target_employee, target_type), value in target_map.items()
                    if target_employee == selected_employee_id
                }
            else:
                employee_target = {
                    target_type: value
                    for (target_employee, target_type), value in target_map.items()
                    if target_employee == employee_row.name
                }

            target_total = sum(
                value
                for target_type, value in employee_target.items()
                if target_type != "Sales Amount"
            )

            team_summary.append({
                "employee": employee_row.name,
                "employee_name": employee_row.employee_name,
                "actual": actual,
                "target": round(target_total, 2),
                "achievement": (
                    round(actual / target_total * 100, 1)
                    if target_total else 0
                ),
                "activities": {
                    kind: counts.get(kind, 0)
                    for kind in ACTIVITY_TYPES
                    if kind != "Lead Generation"
                },
            })

    sales_amount_target = target_map.get(
        (selected_employee_id, "Sales Amount"),
        0
    )
    

    return {
        "period": period,
        "employee": selected_employee_id or "all",
        "employee_name": (
            selected_employee.employee_name
            if selected_employee else "All Employees"
        ),
        "current_employee": selected_employee_id,
        "from_date": str(start),
        "to_date": str(end),

        "kpis": {
            "total_activities": sum(activity_counts.values()),
            "calls": activity_counts.get("Call", 0),
            "emails": activity_counts.get("Email", 0),
            "messages": activity_counts.get("Message", 0),
            "meetings": activity_counts.get("Meeting", 0),
            "visits": activity_counts.get("Visit", 0),
            "proposals": activity_counts.get("Proposal", 0),
            "followups_due": followups_due,
            "opportunities": len(opportunities),
            "quotations": len(quotations),
        },

        "activity_summary": activity_summary,
        "can_view_employee_performance": can_view_employee_performance,
        "team_performance": team_summary if can_view_employee_performance else [],

        "trend": {
            "categories": trend_categories,
            "values": trend_values,
        },

        "pipeline": {
            "opportunities": len(opportunities),
            "quotations": len(quotations),

            "opportunity_status": [
                {"name": key, "value": value}
                for key, value in opportunity_status.items()
            ],

            "quotation_status": [
                {"name": key, "value": value}
                for key, value in quotation_status.items()
            ],

            "by_currency": dict(pipeline_by_currency),

            "recent_quotations": [
                {
                    "name": row.name,
                    "status": row.get("status"),
                    "party_name": (
                        row.get("party_name")
                        or row.get("customer_name")
                    ),
                    "grand_total": row.get("grand_total"),
                    "currency": row.get("currency"),
                    "creation": (
                        str(row.creation)
                        if row.get("creation") else None
                    ),
                }
                for row in quotations[:8]
            ],
        },

        "targets": {
            "sales_amount": round(sales_amount_target, 2),
        },
    }
