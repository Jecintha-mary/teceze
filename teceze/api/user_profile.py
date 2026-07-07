import frappe
from frappe.utils.password import check_password, update_password


@frappe.whitelist()
def get_user_profile():
    try:
        # Check login
        if frappe.session.user == "Guest":
            return {
                "success": False,
                "data": None,
                "statusCode": 401,
                "message": "Unauthorized"
            }

        # Get logged-in user
        user = frappe.get_doc("User", frappe.session.user)

        # Get user's first role
        role = None
        if user.roles:
            role = user.roles[0].role

        return {
            "success": True,
            "data": {
                "id": user.name,
                "name": user.full_name,
                "role": role,
                "avatarUrl": user.user_image,
                "activeWorkspace": None,
                "email": user.email,
                "phone": user.phone,
                "department": None,
                "employeeId": None,
                "location": user.location,
                "timezone": user.time_zone,
                "bio": user.bio
            },
            "statusCode": 200,
            "message": "Request processed successfully"
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "User Profile API")

        return {
            "success": False,
            "data": None,
            "statusCode": 500,
            "message": str(e)
        }


@frappe.whitelist()
def change_password(currentPassword, newPassword):
    try:
        # Check login
        if frappe.session.user == "Guest":
            return {
                "success": False,
                "data": None,
                "statusCode": 401,
                "message": "Unauthorized"
            }

        user = frappe.session.user

        # Verify current password
        check_password(user, currentPassword)

        # Update password
        update_password(user, newPassword)

        frappe.db.commit()

        return {
            "success": True,
            "data": None,
            "statusCode": 200,
            "message": "Request processed successfully"
        }

    except frappe.AuthenticationError:
        return {
            "success": False,
            "data": None,
            "statusCode": 400,
            "message": "Current password is incorrect"
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Change Password API")

        return {
            "success": False,
            "data": None,
            "statusCode": 500,
            "message": str(e)
        }