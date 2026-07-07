import frappe

@frappe.whitelist(allow_guest=True)
def login(usr, pwd):
    try:
        frappe.local.login_manager.authenticate(usr, pwd)
        frappe.local.login_manager.post_login()

        return {
            "success": True,
            "data": {
                "user": frappe.session.user,
                "fullName": frappe.get_value("User", frappe.session.user, "full_name")
            },
            "statusCode": 200,
            "message": "Login successful"
        }

    except frappe.AuthenticationError:
        frappe.clear_messages()
        return {
            "success": False,
            "data": None,
            "statusCode": 401,
            "message": "Invalid username or password"
        }