import frappe


def user_has_permission(doc, ptype, user=None, debug=False):
    user = user or frappe.session.user

    # Administrator always has access
    if user == "Administrator":
        return True

    # Only System Manager can access User
    if "System Manager" not in frappe.get_roles(user):
        frappe.throw(
            "You do not have permission to access the User page.",
            frappe.PermissionError
        )

    return True