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