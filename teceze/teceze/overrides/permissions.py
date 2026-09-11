import frappe


def user_has_permission(doc, ptype, user=None, debug=False):
    user = user or frappe.session.user

    # Administrator always has access
    if user == "Administrator":
        return True

    # Only System Manager can access User
    if not any(role in frappe.get_roles(user) for role in ["System Manager", "HR Manager"]):
        frappe.throw(
            "You are not authorized to access the User page. "
            "Please contact the System Manager.",
            frappe.PermissionError
        )

    return True