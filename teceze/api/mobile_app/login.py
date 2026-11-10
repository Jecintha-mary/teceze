# import frappe
# from frappe.auth import LoginManager
from frappe.rate_limiter import rate_limit

 
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


# ---------------------------------------------------------------------------
# Microsoft sign-in (SSO) for the Pottu mobile app
# ---------------------------------------------------------------------------
import frappe
import jwt
from jwt import PyJWKClient

def get_microsoft_settings():
    settings = frappe.get_single("Teceze Settings")

    tenant_id = settings.tenant_id
    client_id = settings.client_id

    if not tenant_id or not client_id:
        frappe.throw("Microsoft SSO configuration is incomplete.")

    return tenant_id, client_id

MS_TENANT_ID, MS_CLIENT_ID = get_microsoft_settings()
# MS_TENANT_ID = "c1ce82cc-f09a-4b91-ba9b-4d2211ee9511"
# MS_CLIENT_ID = "7a5d3322-9b3d-4db1-8058-71a9eeb43e6e"
MS_ISSUER = f"https://login.microsoftonline.com/{MS_TENANT_ID}/v2.0"

# One client per worker; it caches Microsoft's public keys and refetches
# them automatically when Microsoft rotates keys.
_ms_jwks = PyJWKClient(
    f"https://login.microsoftonline.com/{MS_TENANT_ID}/discovery/v2.0/keys"
)


def _ms_refuse(message):
    return {"success": False, "message": message}


def _ms_find_user(claims):
    """Map the Microsoft account to an enabled Frappe User."""
    candidates = {
        (claims.get(key) or "").strip().lower()
        for key in ("preferred_username", "email", "upn")
    } - {""}

    for email in candidates:
        # User.name is the login email in Frappe.
        user = frappe.db.get_value("User", {"name": email, "enabled": 1}, "name")
        if user:
            return user
        user = frappe.db.get_value("User", {"email": email, "enabled": 1}, "name")
        if user:
            return user
        # Fallback: the Employee's company email points at the User.
        user = frappe.db.get_value(
            "Employee", {"company_email": email, "status": "Active"}, "user_id"
        )
        if user and frappe.db.get_value("User", user, "enabled"):
            return user
    return None


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def microsoft_login(id_token=None):
    if not id_token:
        return _ms_refuse("Microsoft sign-in didn't finish. Please try again.")

    # 1) Verify the token really comes from Microsoft, for THIS app, in
    #    OUR tenant, and hasn't expired. Any failure → refuse.
    try:
        signing_key = _ms_jwks.get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(
            id_token,
            signing_key,
            algorithms=["RS256"],
            audience=MS_CLIENT_ID,
            issuer=MS_ISSUER,
            leeway=120,  # allow 2 minutes of clock difference
            options={"require": ["exp", "iat", "aud", "iss", "tid"]},
        )
    except jwt.ExpiredSignatureError:
        return _ms_refuse("Microsoft sign-in expired. Please try again.")
    except Exception:
        frappe.log_error(title="Microsoft sign-in: token rejected")
        return _ms_refuse("Microsoft sign-in couldn't be verified. Please try again.")

    if claims.get("tid") != MS_TENANT_ID:
        return _ms_refuse("Please sign in with your Teceze Microsoft account.")

    # 2) Find the employee.
    user = _ms_find_user(claims)
    employee = user and frappe.db.get_value(
        "Employee", {"user_id": user, "status": "Active"}, "name"
    )
    if not user or not employee:
        return _ms_refuse(
            "Your Microsoft account isn't linked to a Pottu employee profile."
        )

    # 3) Create the Frappe session — same as a password login, minus the
    #    password check (Microsoft already did it, with MFA if required).
    frappe.local.login_manager.login_as(user)

    # 4) Answer exactly like login.login. If login.login builds its response
    #    with a helper, call that helper here instead so the fields and the
    #    roles format can never drift apart.
    return {
        "success": True,
        "message": "Logged in",
        "data": {
            "user": user,
            "full_name": frappe.db.get_value("User", user, "full_name"),
            "employee_id": employee,
            "sid": frappe.session.sid,
            "roles": frappe.get_roles(user),
        },
    }