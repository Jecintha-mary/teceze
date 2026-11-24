import frappe
from datetime import datetime, timedelta
from html import escape
def opportunity_query_conditions(user=None, doctype=None):
    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))

    if "System Manager" in roles:
        return ""

    user_sql = frappe.db.escape(user)

    # Presales access
    if roles.intersection({"Presales Manager", "Presales User"}):
        department = frappe.db.get_value(
            "Employee",
            {"user_id": user, "status": "Active"},
            "department"
        )

        if not department:
            return "1=0"

        department_sql = frappe.db.escape(department)

        return f"""
            EXISTS (
                SELECT 1
                FROM `tabService Vertical` sv
                INNER JOIN `tabEmployee` e
                    ON e.department = sv.department
                WHERE sv.name = `tabOpportunity`.`custom_service_vertical`
                  AND e.user_id = {user_sql}
                  AND e.status = 'Active'
            )
        """

    # Sales Manager access
    if "Sales Manager" in roles:
        employee = frappe.db.get_value(
            "Employee",
            {"user_id": user, "status": "Active"},
            "name"
        )

        if not employee:
            return "1=0"

        reportees = frappe.get_all(
            "Employee",
            filters={
                "reports_to": employee,
                "status": "Active",
                "user_id": ["is", "set"]
            },
            pluck="user_id"
        )

        team_users = list(set(reportees + [user]))
        team_users_sql = ", ".join(
            frappe.db.escape(u) for u in team_users
        )

        return f"""
            (
                `tabOpportunity`.`owner` IN ({team_users_sql})
                OR
                `tabOpportunity`.`opportunity_owner` IN ({team_users_sql})
            )
        """

    # Other users, including Sales User
    return f"""
        (
            `tabOpportunity`.`owner` = {user_sql}
            OR
            `tabOpportunity`.`opportunity_owner` = {user_sql}
        )
    """
def quotation_query_conditions(user=None):
    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))

    # System Manager can access all quotations
    if "System Manager" in roles:
        return ""

    user_sql = frappe.db.escape(user)

    # Presales Manager and Presales User:
    # Access quotations linked to opportunities
    # belonging to their department.
    if roles.intersection({"Presales Manager", "Presales User"}):

        department = frappe.db.get_value(
            "Employee",
            {
                "user_id": user,
                "status": "Active"
            },
            "department"
        )

        if not department:
            return "1=0"

        department_sql = frappe.db.escape(department)

        return f"""
            EXISTS (
                SELECT 1
                FROM `tabOpportunity` opp
                INNER JOIN `tabService Vertical` sv
                    ON sv.name = opp.custom_service_vertical
                WHERE opp.name = `tabQuotation`.opportunity
                  AND sv.department = {department_sql}
            )
        """

    # Sales User:
    # Access quotations linked to opportunities
    # they own or are assigned to.
    if "Sales User" in roles:
        return f"""
            EXISTS (
                SELECT 1
                FROM `tabOpportunity` opp
                WHERE opp.name = `tabQuotation`.opportunity
                  AND (
                      opp.owner = {user_sql}
                      OR opp.opportunity_owner = {user_sql}
                  )
            )
        """

    return "1=0"


def _get_user_department(user):
    return frappe.db.get_value(
        "Employee",
        {"user_id": user, "status": "Active"},
        "department"
    )

def _lead_access_condition(user):
    roles = set(frappe.get_roles(user))

    if "System Manager" in roles:
        return ""

    # Presales Manager and Presales User
    if roles.intersection({"Presales Manager", "Presales User"}):

        department = frappe.db.get_value(
            "Employee",
            {"user_id": user, "status": "Active"},
            "department"
        )

        if not department:
            return "1=0"

        department_sql = frappe.db.escape(department)

        return f"""
            EXISTS (
                SELECT 1
                FROM `tabOpportunity` opp
                INNER JOIN `tabService Vertical` sv
                    ON sv.name = opp.custom_service_vertical
                WHERE opp.opportunity_from = 'Lead'
                  AND opp.party_name = `tabLead`.name
                  AND sv.department = {department_sql}
            )
        """

    return "1=0"


def lead_query_conditions(user=None):
    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))

    # Do not override predefined Sales User filtering
    if "Sales User" in roles:
        return None
    
    if "System Manager" in roles:
        return ""

    department = frappe.db.get_value(
        "Employee",
        {"user_id": user, "status": "Active"},
        "department"
    )

    if not department:
        return "1=0"

    department_sql = frappe.db.escape(department)

    return f"""
        EXISTS (
            SELECT 1
            FROM `tabOpportunity` opp
            INNER JOIN `tabService Vertical` sv
                ON sv.name = opp.custom_service_vertical
            WHERE opp.opportunity_from = 'Lead'
              AND opp.party_name = `tabLead`.name
              AND sv.department = {department_sql}
        )
    """
def lead_has_permission(doc, user=None, permission_type=None):
    user = user or frappe.session.user
    roles = set(frappe.get_roles(user))

    if permission_type != "read":
        return True

    # Let predefined permissions handle Sales Users
    if "Sales User" in roles:
        return True
    

    if "System Manager" in roles:
        return True

    department = frappe.db.get_value(
        "Employee",
        {"user_id": user, "status": "Active"},
        "department"
    )

    if not department:
        return False

    return bool(
        frappe.db.exists(
            "Opportunity",
            {
                "opportunity_from": "Lead",
                "party_name": doc.name,
                "custom_service_vertical": [
                    "in",
                    frappe.get_all(
                        "Service Vertical",
                        filters={"department": department},
                        pluck="name"
                    )
                ]
            }
        )
    )



def Sent_Mail_notification():        
    RECIPIENTS = frappe.db.sql("""
        SELECT DISTINCT u.email
        FROM `tabUser` u
        INNER JOIN `tabHas Role` hr
            ON hr.parent = u.name
        WHERE
            hr.parenttype = 'User'
            AND hr.parentfield = 'roles'
            AND hr.role = %s
            AND u.enabled = 1
            AND u.user_type = %s
            AND IFNULL(u.email, '') != ''
    """, ("CRM Support", "System User"), as_list=True)

    RECIPIENTS = [row[0] for row in RECIPIENTS]

    if not RECIPIENTS:
        frappe.logger().warning(
            "Hourly Activity Dashboard: No CRM Support recipients found."
        )
        return

    DOCTYPES = {
        "Lead": "Leads",
        "Opportunity": "Opportunities",
        "Quotation": "Quotations",

        # Add future doctypes here
        # "Sales Order": "Sales Orders",
        # "Project": "Projects",
        # "Sales Invoice": "Sales Invoices",
    }

    COLORS = [
        "#3B82F6",
        "#10B981",
        "#A855F7",
        "#F59E0B",
        "#EF4444",
        "#06B6D4",
    ]

    # =====================================================
    # DATE RANGE (SITE LOCAL DATE)
    # =====================================================

    today = frappe.utils.getdate(frappe.utils.nowdate())

    start_date = datetime.combine(today, datetime.min.time())
    end_date = start_date + timedelta(days=1)

    # =====================================================
    # DATA COLLECTION
    # =====================================================

    hourly_data = {
        doctype: [0] * 24
        for doctype in DOCTYPES
    }

    owner_data = {}
    totals = {doctype: 0 for doctype in DOCTYPES}

    for doctype in DOCTYPES:

        if not frappe.db.exists("DocType", doctype):
            continue

        records = frappe.get_all(
            doctype,
            filters=[
                ["creation", ">=", start_date],
                ["creation", "<", end_date],
            ],
            fields=["owner", "creation"],
            ignore_permissions=True
        )

        for record in records:

            owner = record.owner or "Unknown"

            hour = record.creation.hour

            hourly_data[doctype][hour] += 1
            totals[doctype] += 1

            if owner not in owner_data:
                owner_data[owner] = {
                    dt: 0 for dt in DOCTYPES
                }

            owner_data[owner][doctype] += 1

    grand_total = sum(totals.values())

    # =====================================================
    # USER DISPLAY NAMES
    # =====================================================

    users = {
        row.name: row.full_name
        for row in frappe.get_all(
            "User",
            fields=["name", "full_name"]
        )
    }

    # =====================================================
    # KPI CARDS
    # =====================================================

    kpi_html = ""

    for index, (doctype, label) in enumerate(DOCTYPES.items()):

        color = COLORS[index % len(COLORS)]

        kpi_html += f"""
        <td width="{100 / len(DOCTYPES)}%"
            style="padding:8px;">

            <div style="
                background:#ffffff;
                border:1px solid #e5e7eb;
                border-radius:10px;
                padding:18px;">

                <div style="
                    color:#64748b;
                    font-size:13px;">
                    {escape(label)}
                </div>

                <div style="
                    font-size:28px;
                    font-weight:700;
                    color:{color};
                    margin-top:8px;">
                    {totals[doctype]}
                </div>

            </div>
        </td>
        """

    # =====================================================
    # SVG HOURLY LINE CHART
    # =====================================================

    width = 760
    height = 300

    left = 50
    right = 20
    top = 25
    bottom = 45

    plot_width = width - left - right
    plot_height = height - top - bottom

    max_value = max(
        1,
        max(
            max(values)
            for values in hourly_data.values()
        )
    )

    # Rounded Y-axis maximum
    y_max = max(5, ((max_value + 4) // 5) * 5)

    chart_svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg"
         width="100%"
         viewBox="0 0 {width} {height}"
         role="img">

    """

    # Grid lines and Y-axis labels
    for value in range(0, y_max + 1, max(1, y_max // 5)):

        y = top + plot_height - (
            value / y_max * plot_height
        )

        chart_svg += f"""
        <line x1="{left}" y1="{y}"
              x2="{width-right}" y2="{y}"
              stroke="#e5e7eb"
              stroke-dasharray="4,4"/>

        <text x="{left-10}" y="{y+4}"
              font-size="11"
              text-anchor="end"
              fill="#64748b">
            {value}
        </text>
        """

    # X-axis labels
    for hour in range(0, 24, 2):

        x = left + (hour / 23) * plot_width

        chart_svg += f"""
        <text x="{x}" y="{height-15}"
              font-size="11"
              text-anchor="middle"
              fill="#64748b">
            {hour:02d}:00
        </text>
        """

    # Lines for each DocType
    for index, (doctype, values) in enumerate(hourly_data.items()):

        color = COLORS[index % len(COLORS)]

        points = []

        for hour, value in enumerate(values):

            x = left + (hour / 23) * plot_width

            y = top + plot_height - (
                value / y_max * plot_height
            )

            points.append(f"{x},{y}")

        chart_svg += f"""
        <polyline
            points="{' '.join(points)}"
            fill="none"
            stroke="{color}"
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round"/>
        """

        for hour, value in enumerate(values):

            if value == 0:
                continue

            x = left + (hour / 23) * plot_width

            y = top + plot_height - (
                value / y_max * plot_height
            )

            chart_svg += f"""
            <circle cx="{x}" cy="{y}"
                    r="3.5"
                    fill="{color}"/>
            """

    chart_svg += "</svg>"

    # =====================================================
    # CHART LEGEND
    # =====================================================

    legend_html = ""

    for index, (doctype, label) in enumerate(DOCTYPES.items()):

        color = COLORS[index % len(COLORS)]

        legend_html += f"""
        <span style="
            display:inline-block;
            margin:6px 12px 6px 0;
            font-size:12px;
            color:#475569;">

            <span style="
                display:inline-block;
                width:9px;
                height:9px;
                border-radius:50%;
                background:{color};">
            </span>

            &nbsp;{escape(label)}
        </span>
        """

    # =====================================================
    # USER-WISE SUMMARY TABLE
    # =====================================================

    table_headers = ""

    for doctype, label in DOCTYPES.items():

        table_headers += f"""
        <th style="
            padding:12px;
            text-align:center;
            background:#f8fafc;
            border-bottom:1px solid #e5e7eb;">
            {escape(label)}
        </th>
        """

    table_rows = ""

    sorted_owners = sorted(
        owner_data.items(),
        key=lambda item: sum(item[1].values()),
        reverse=True
    )

    for owner, counts in sorted_owners:

        total = sum(counts.values())

        display_name = users.get(owner) or owner

        table_rows += f"""
        <tr>

            <td style="padding:12px;
                border-bottom:1px solid #e5e7eb;">
                {escape(display_name)}
            </td>
        """

        for doctype in DOCTYPES:

            table_rows += f"""
            <td style="
                padding:12px;
                text-align:center;
                border-bottom:1px solid #e5e7eb;">
                {counts[doctype]}
            </td>
            """

        table_rows += f"""
            <td style="
                padding:12px;
                text-align:center;
                font-weight:700;
                border-bottom:1px solid #e5e7eb;">
                {total}
            </td>

        </tr>
        """

    # Total row
    table_rows += """
    <tr style="background:#f8fafc;font-weight:700;">
        <td style="padding:12px;">Total</td>
    """

    for doctype in DOCTYPES:

        table_rows += f"""
        <td style="padding:12px;text-align:center;">
            {totals[doctype]}
        </td>
        """

    table_rows += f"""
        <td style="padding:12px;text-align:center;">
            {grand_total}
        </td>
    </tr>
    """

    # =====================================================
    # COMPLETE HTML EMAIL
    # =====================================================

    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="
        margin:0;
        padding:24px;
        background-color:#ffffff;
        font-family:Arial,Helvetica,sans-serif;
        color:#1e293b;">

        <div style="
            max-width:900px;
            margin:auto;">

            <h2 style="margin-bottom:5px;">
                Hourly Activity Dashboard
            </h2>

            <p style="color:#64748b;font-size:13px;">
                Record creation summary for
                {today.strftime('%d %B %Y')}
            </p>

            <h3>Overview</h3>

            <table width="100%" cellpadding="0"
                   cellspacing="0">
                <tr>
                    {kpi_html}
                </tr>
            </table>

            <h3 style="margin-top:30px;">
                Hourly Record Creation
            </h3>

            <div style="
                border:1px solid #e5e7eb;
                border-radius:10px;
                padding:15px;
                overflow:hidden;">

                {legend_html}

                {chart_svg}

            </div>

            <h3 style="margin-top:30px;">
                User-wise Creation Summary
            </h3>

            <table width="100%"
                   cellpadding="0"
                   cellspacing="0"
                   style="
                       border-collapse:collapse;
                       font-size:13px;">

                <thead>
                    <tr>
                        <th style="
                            padding:12px;
                            text-align:left;
                            background:#f8fafc;
                            border-bottom:1px solid #e5e7eb;">
                            Created By
                        </th>

                        {table_headers}

                        <th style="
                            padding:12px;
                            text-align:center;
                            background:#f8fafc;
                            border-bottom:1px solid #e5e7eb;">
                            Total
                        </th>
                    </tr>
                </thead>

                <tbody>
                    {table_rows}
                </tbody>

            </table>

            <p style="
                margin-top:30px;
                color:#94a3b8;
                font-size:11px;
                text-align:center;">

                Automatically generated by Pottu Team
                Hourly Activity Report.

            </p>

        </div>

    </body>
    </html>
    """

    # =====================================================
    # SEND EMAIL
    # =====================================================

    frappe.sendmail(
        recipients=RECIPIENTS,
        subject=f"Hourly Activity Dashboard - {today}",
        message=html,
        now=True
    )

    frappe.logger().info(
        f"Hourly Activity Dashboard sent. "
        f"Total records: {grand_total}"
    )
