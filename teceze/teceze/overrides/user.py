
import frappe


def get_user_permission_query_conditions(user=None):
    user = user or frappe.session.user

    # Administrator and System Manager can view all users
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return ""

    # Other users can view only their own User record
    return f"`tabUser`.`name` = {frappe.db.escape(user)}"


def has_user_permission(doc, user=None, permission_type=None):
    user = user or frappe.session.user

    # Administrator and System Manager can access all User records
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return True

    # Other users can access only their own record
    return doc.name == user
