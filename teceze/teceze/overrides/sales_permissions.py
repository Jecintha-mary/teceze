import frappe

def opportunity_query_conditions(user=None, doctype=None):
    user = user or frappe.session.user
    roles = frappe.get_roles(user)
    # System Managers can see all opportunities
    if any(role in roles for role in ["System Manager"]):
        return ""
    # Presales Manager can see only their department's
    # elif "Presales Manager" in roles:
    elif any(role in roles for role in ["Presales Manager","Presales User"]):
        user_sql = frappe.db.escape(user)
        department = frappe.db.get_value(
            "Employee",
            {"user_id": user, "status": "Active"},
            "department"
        )

        if not department:
            return "1=0"


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

    else:
        user_sql = frappe.db.escape(user)

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


import frappe


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
        return None

    # Let predefined permissions handle Sales Users
    if "Sales User" in roles:
        return None

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