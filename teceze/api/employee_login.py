import frappe
from frappe import _
from frappe.auth import LoginManager
from frappe.utils import now_datetime, time_diff_in_seconds, add_to_date, cint

# Import the 24-hour session timeout constant from employee_attendance.py
# so both login and attendance modules use the same session expiry value.
from teceze.api.employee_attendance import SESSION_RESET_SECONDS


# ==========================================================
# Helper: Check if User is System Manager
# ==========================================================

def is_system_manager(user):
    return "System Manager" in frappe.get_roles(user)


# ==========================================================
# Employee Login
# ==========================================================

@frappe.whitelist(allow_guest=True)
def employee_login(username, password):

    try:

        login_manager = LoginManager()
        login_manager.authenticate(username, password)
        login_manager.post_login()

        employee = frappe.get_value(
            "Employee",
            {"user_id": username},
            [
                "name",
                "employee_name",
                "custom_work_location",
                "status",
                "employment_type",
                "designation",
            ],
            as_dict=True
        )

        # System Manager does not require Employee mapping
        if not employee:

            if is_system_manager(username):
                return {
                    "success": True,
                    "message": "Login Successful",
                    "employee": None,
                    "is_system_manager": True
                }

            frappe.throw(_("No Employee is mapped to this user."))

        # Normal employee must be Active
        if employee.status != "Active":
            frappe.throw(_("Employee is not active."))

        return {
            "success": True,
            "message": "Login Successful",
            "employee": employee,
            "is_system_manager": False
        }

    except Exception as e:

        frappe.local.login_manager.logout()

        return {
            "success": False,
            "message": str(e)
        }


# ==========================================================
# Get Logged Employee
# ==========================================================

@frappe.whitelist()
def get_logged_employee():

    user = frappe.session.user

    employee = frappe.get_value(
        "Employee",
        {"user_id": user},
        [
            "name",
            "employee_name",
            "custom_work_location",
            "status",
            "employment_type",
            "designation",
        ],
        as_dict=True
    )

    # System Manager does not require Employee mapping
    if not employee:

        if is_system_manager(user):
            return {
                "name": None,
                "employee_name": None,
                "employee_location": None,
                "designation": None,
                "status": None,
                "employment_type": None,
                "is_system_manager": True
            }

        frappe.throw(_("Employee is not mapped to this user."))

    return {
        "name": employee.name,
        "employee_name": employee.employee_name,
        "employee_location": employee.custom_work_location,
        "designation": employee.designation,
        "status": employee.status,
        "employment_type": employee.employment_type,
        "is_system_manager": False
    }


# ==========================================================
# Today's Status
# ==========================================================

@frappe.whitelist()
def get_today_status(employee=None):

    if not employee:

        logged_employee = get_logged_employee()

        # System Manager has no Employee record
        if logged_employee.get("is_system_manager"):
            return {
                "status": "ADMIN",
                "checkin_time": "--",
                "checkin_datetime": None,
                "checkout_time": "--",
                "working_hours": 0,
                "previous_seconds": 0,
                "button": None,
                "is_system_manager": True
            }

        employee = logged_employee["name"]

    logs = frappe.get_all(
        "Employee Checkin",
        filters={"employee": employee},
        fields=[
            "log_type",
            "time",
            "custom_working_hours",
            "custom_previous_seconds",
            "custom_auto_checkout",

            # Session start is required to calculate
            # the actual 24-hour session age.
            "custom_session_start",
        ],
        order_by="time asc, creation asc",
    )

    if not logs:

        return {
            "status": "NOT CHECKED IN",
            "checkin_time": "--",
            "checkin_datetime": None,
            "checkout_time": "--",
            "working_hours": 0,
            "previous_seconds": 0,
            "button": "Check In",
            "is_system_manager": False
        }

    current_in = None
    last_completed = None

    for log in logs:

        if log.log_type == "IN":

            current_in = log

        elif log.log_type == "OUT" and current_in:

            last_completed = {
                "in": current_in,
                "out": log
            }

            current_in = None

    # ======================================================
    # Employee is currently Checked In
    # ======================================================

    if current_in:

        session_start = (
            current_in.custom_session_start
            or current_in.time
        )

        session_age = max(
            0,
            int(
                time_diff_in_seconds(
                    now_datetime(),
                    session_start
                )
            ),
        )

        session_expires_at = add_to_date(
            session_start,
            seconds=SESSION_RESET_SECONDS
        )

        previous_seconds = int(
            current_in.custom_previous_seconds or 0
        )

        stint_seconds = max(
            0,
            int(
                time_diff_in_seconds(
                    now_datetime(),
                    current_in.time
                )
            ),
        )

        worked_seconds = (
            previous_seconds +
            stint_seconds
        )

        if worked_seconds > SESSION_RESET_SECONDS:
            worked_seconds = SESSION_RESET_SECONDS

        # ==================================================
        # 24-Hour Session Expired
        # ==================================================

        if session_age >= SESSION_RESET_SECONDS:

            return {
                "status": "MISSED CHECK OUT",
                "checkin_time": current_in.time.strftime("%I:%M %p"),
                "checkin_datetime": current_in.time.isoformat(),
                "session_start": session_start.isoformat(),
                "checkout_time": "--",
                "working_hours": "24:00:00",
                "previous_seconds": SESSION_RESET_SECONDS,
                "session_expires_at": session_expires_at.isoformat(),
                "button": "Check In",
                "is_system_manager": False
            }

        # ==================================================
        # Calculate Working Time
        # ==================================================

        hrs = worked_seconds // 3600
        mins = (worked_seconds % 3600) // 60
        secs = worked_seconds % 60

        return {

            "status": "CHECKED IN",

            "checkin_time":
                current_in.time.strftime("%I:%M %p"),

            "session_expires_at":
                session_expires_at.isoformat(),

            "checkin_datetime":
                current_in.time.isoformat(),

            "session_start":
                current_in.custom_session_start.isoformat()
                if current_in.custom_session_start
                else current_in.time.isoformat(),

            "checkout_time": "--",

            "previous_seconds":
                previous_seconds,

            "working_hours":
                f"{hrs:02d}:{mins:02d}:{secs:02d}",

            "button": "Check Out",

            "is_system_manager": False
        }

    # ======================================================
    # Employee already Checked Out
    # ======================================================

    if last_completed:

        is_auto_checkout = cint(
            last_completed["out"].custom_auto_checkout or 0
        )

        if is_auto_checkout:

            working_hours = "00:00:00"
            previous_seconds = 0

        else:

            working_hours = (
                last_completed["out"].custom_working_hours
                or 0
            )

            previous_seconds = (
                last_completed["out"].custom_previous_seconds
                or 0
            )

        return {

            "status": "CHECKED OUT",

            "checkin_time":
                last_completed["in"].time.strftime("%I:%M %p"),

            "checkin_datetime":
                last_completed["in"].time.isoformat(),

            "checkout_time":
                last_completed["out"].time.strftime("%I:%M %p"),

            "working_hours":
                working_hours,

            "previous_seconds":
                previous_seconds,

            "button":
                "Check In",

            "is_system_manager": False
        }

    # ======================================================
    # Default
    # ======================================================

    return {

        "status": "NOT CHECKED IN",

        "checkin_time": "--",

        "checkin_datetime": None,

        "checkout_time": "--",

        "working_hours": 0,

        "previous_seconds": 0,

        "button": "Check In",

        "is_system_manager": False
    }