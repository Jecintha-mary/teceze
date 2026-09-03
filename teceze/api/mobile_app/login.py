# import frappe
# from frappe.auth import LoginManager
 
 
# @frappe.whitelist(allow_guest=True, methods=["POST"])
# def login():
 
#     data = frappe.request.get_json() or {}
 
#     username = data.get("username")
#     password = data.get("password")
 
#     if not username or not password:
#         frappe.local.response.http_status_code = 400
 
#         return {
#             "success": False,
#             "message": "Username and password are required"
#         }
 
#     try:
#         login_manager = LoginManager()
 
#         login_manager.authenticate(
#             user=username,
#             pwd=password
#         )
 
#         login_manager.post_login()
 
#         return {
#             "success": True,
#             "message": "Login successful",
#             "data": {
#                 "user": frappe.session.user,
#                 "full_name": frappe.db.get_value(
#                     "User",
#                     frappe.session.user,
#                     "full_name"
#                 ),
#                 "employee_id": frappe.db.get_value(
#                     "Employee",
#                     {"user_id": frappe.session.user},
#                     "name"
#                 ),
#                "roles": [
#                         role
#                         for role in frappe.get_roles(frappe.session.user)
#                         if role not in {"All", "Guest", "Desk User"}
#                     ],

#                 "sid": frappe.session.sid
#             }
#         }
 
#     except frappe.AuthenticationError:
 
#         frappe.local.response.http_status_code = 401
 
#         return {
#             "success": False,
#             "message": "Invalid username or password"
#         }
 
 
import frappe
 
@frappe.whitelist(methods=["POST"])
def logout():
 
    if frappe.session.user == "Guest":
        frappe.throw(
            "You are already logged out",
            frappe.AuthenticationError
        )
 
    frappe.local.login_manager.logout()
 
    return {
        "success": True,
        "message": "Logout successful"
    }

import frappe
from frappe.auth import LoginManager


@frappe.whitelist(allow_guest=True, methods=["POST"])
def login():

    data = frappe.request.get_json() or {}

    username = data.get("username")
    password = data.get("password")

    if not username or not password:

        frappe.local.response.http_status_code = 400

        return {
            "success": False,
            "message": "Username and password are required"
        }

    try:

        login_manager = LoginManager()

        login_manager.authenticate(
            user=username,
            pwd=password
        )

        login_manager.post_login()

        sid = frappe.session.sid

        return {
            "success": True,
            "message": "Login successful",
            "data": {
                "user": frappe.session.user,

                "full_name": frappe.db.get_value(
                    "User",
                    frappe.session.user,
                    "full_name"
                ),

                "employee_id": frappe.db.get_value(
                    "Employee",
                    {"user_id": frappe.session.user},
                    "name"
                ),

                "roles": [
                    role
                    for role in frappe.get_roles(
                        frappe.session.user
                    )
                    if role not in {
                        "All",
                        "Guest",
                        "Desk User"
                    }
                ],

                "sid": sid
            }
        }

    except frappe.AuthenticationError:

        frappe.local.response.http_status_code = 401

        return {
            "success": False,
            "message": "Invalid username or password"
        }