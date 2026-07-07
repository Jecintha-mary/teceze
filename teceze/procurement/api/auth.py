import frappe
import jwt
import uuid
import datetime

from frappe.auth import LoginManager
from frappe import AuthenticationError
from frappe.utils import now_datetime


# =====================================================================
# CONFIGURATION
# =====================================================================

JWT_SECRET = "Procurement@2026#SecretKey"
JWT_EXPIRY_HOURS = 8


# =====================================================================
# CREATE JWT TOKEN
# =====================================================================

def create_token(user):

    expiry = now_datetime() + datetime.timedelta(hours=JWT_EXPIRY_HOURS)

    token_id = str(uuid.uuid4())

    payload = {
        "token_id": token_id,
        "user": user.name,
        "email": user.email,
        "exp": expiry
    }

    token = jwt.encode(
        payload,
        JWT_SECRET,
        algorithm="HS256"
    )

    return token, token_id, expiry


# =====================================================================
# VERIFY JWT TOKEN
# =====================================================================

def verify_token(token):

    return jwt.decode(
        token,
        JWT_SECRET,
        algorithms=["HS256"]
    )


def api_response(status_code, success, message, data=None):
    frappe.local.response["http_status_code"] = status_code

    # Remove Frappe default response fields
    frappe.response.pop("message", None)
    frappe.response.pop("home_page", None)
    frappe.response.pop("full_name", None)

    frappe.response["success"] = success
    frappe.response["statusCode"] = status_code
    frappe.response["message"] = message
    frappe.response["data"] = data

# =====================================================================
# LOGIN API
# =====================================================================

@frappe.whitelist(allow_guest=True)
def login():

    try:

        email = frappe.form_dict.get("email")
        password = frappe.form_dict.get("password")

        if not email or not password:
            api_response(
                400,
                False,
                "Email and Password are required"
            )
            return

        login_manager = LoginManager()

        login_manager.authenticate(
            user=email,
            pwd=password
        )

        login_manager.post_login()

        user = frappe.get_doc("User", email)

        token, token_id, expiry = create_token(user)

        settings = frappe.db.exists(
            "Procurement Settings",
            {"user": user.name}
        )

        if settings:
            doc = frappe.get_doc(
                "Procurement Settings",
                settings
            )
        else:
            doc = frappe.new_doc(
                "Procurement Settings"
            )
            doc.user = email

        doc.jwt_token = token
        doc.token_id = token_id
        doc.expiry_time = expiry
        doc.is_active = 1

        doc.save(ignore_permissions=True)

        frappe.db.commit()

        api_response(
            200,
            True,
            "Login successful",
            {
                "token": token,
                "token_type": "Bearer",
                "expires_in": JWT_EXPIRY_HOURS * 3600,
                "name": user.full_name,
                "email": user.email,
                "username": user.name
            }
        )
        return

    except AuthenticationError:

        api_response(
            401,
            False,
            "Invalid username or password"
        )
        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "JWT Login API"
        )

        api_response(
            500,
            False,
            "Internal Server Error"
        )
        return
# =====================================================================
# AUTHENTICATE JWT
# =====================================================================

def authenticate():

    auth = frappe.get_request_header("Authorization")

    if not auth:
        frappe.throw("Authorization header missing")

    if not auth.startswith("Bearer "):
        frappe.throw("Invalid Authorization header")

    token = auth.replace("Bearer ", "")

    payload = verify_token(token)

    settings = frappe.db.get_value(
        "Procurement Settings",
        {
            "user": payload["user"],
            "token_id": payload["token_id"],
            "is_active": 1
        },
        [
            "name",
            "expiry_time"
        ],
        as_dict=True
    )

    if not settings:
        frappe.throw("Invalid or expired token")

    user = frappe.get_doc("User", payload["user"])

    if not user.enabled:
        frappe.throw("User is disabled")

    return user
# =====================================================================
# LOGOUT API
# =====================================================================

@frappe.whitelist(allow_guest=True)
def logout():

    frappe.local.login_manager.logout()

    frappe.local.response["http_status_code"] = 200

    frappe.response.update({
        "success": True,
        "data": None,
        "statusCode": 200,
        "message": "Logout successful"
    })


@frappe.whitelist(allow_guest=True)
def logout_test():

    # user = authenticate()

    frappe.db.set_value(
        "Procurement Settings",
        {
            "user": user.name,
            "is_active": 1
        },
        {
            "is_active": 0
        }
    )

    frappe.db.commit()

    api_response(
        200,
        True,
        "Logout successful"
    )
    return