import frappe
from frappe import _
from frappe.utils import (now_datetime, get_datetime, time_diff_in_seconds, add_to_date)
from datetime import datetime, timedelta
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
from zoneinfo import ZoneInfo
from math import (radians, sin, cos, sqrt, atan2)
from frappe import _dict
from hrms.hr.doctype.employee_checkin.employee_checkin import calculate_working_hours
import uuid

tf = TimezoneFinder()

SESSION_EXPIRE_SECONDS = 18 * 60 * 60     # Resume allowed only within 18 hours
SESSION_RESET_SECONDS = 24 * 60 * 60      # 24 hour hard cap for continuous open sessions


# ==========================================================
# Distance Calculation
# ==========================================================

def calculate_distance(lat1, lon1, lat2, lon2):

    R = 6371000

    lat1 = radians(float(lat1))
    lon1 = radians(float(lon1))
    lat2 = radians(float(lat2))
    lon2 = radians(float(lon2))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        sin(dlat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c


# ==========================================================
# Timezone Details
# ==========================================================

def get_timezone_details(latitude, longitude):

    employee_timezone = tf.timezone_at(
        lat=float(latitude),
        lng=float(longitude)
    )

    if not employee_timezone:
        employee_timezone = "UTC"

    utc_time = (
        now_datetime()
        .astimezone(ZoneInfo("UTC"))
        .replace(tzinfo=None)
    )

    employee_local_time = (
        now_datetime()
        .astimezone(ZoneInfo(employee_timezone))
        .replace(tzinfo=None)
    )

    company_timezone = (
        frappe.db.get_single_value(
            "System Settings",
            "time_zone"
        )
        or "Asia/Kolkata"
    )

    company_local_time = (
        now_datetime()
        .astimezone(ZoneInfo(company_timezone))
        .replace(tzinfo=None)
    )

    return {
        "utc_time": utc_time,
        "employee_timezone": employee_timezone,
        "employee_local_time": employee_local_time,
        "company_timezone": company_timezone,
        "company_local_time": company_local_time
    }


# ==========================================================
# Reverse Geocoding
# ==========================================================

def get_checkin_address(latitude, longitude):

    try:
        geolocator = Nominatim(
            user_agent="employee_attendance"
        )

        location = geolocator.reverse(
            (latitude, longitude),
            language="en"
        )

        if location:
            return location.address

    except Exception:
        pass

    return "Address not available"


# ==========================================================
# Validate Employee Location
# ==========================================================

def validate_employee_location(
    employee,
    latitude,
    longitude
):

    employee_doc = frappe.get_doc(
        "Employee",
        employee
    )

    if not employee_doc.custom_work_location:

        frappe.throw(
            _("Work Location is not assigned.")
        )

    location = frappe.get_doc(
        "Location",
        employee_doc.custom_work_location
    )

    if not location.latitude or not location.longitude:

        frappe.throw(
            _("Latitude and Longitude are not configured for this Work Location.")
        )

    office_lat = float(location.latitude)
    office_lon = float(location.longitude)

    user_lat = float(latitude)
    user_lon = float(longitude)
    distance = calculate_distance(
        office_lat,
        office_lon,
        user_lat,
        user_lon
    )

    allowed_radius = float(location.custom_attendance_radius or 500)
    if location.custom_attendance_radius_uom == "KM":
        allowed_radius = allowed_radius * 1000
    if distance > allowed_radius:
        frappe.throw(_("You are outside of the geolocation."))
    return distance


# ==========================================================
# Get Employee Shift for a Given Date
# ==========================================================

def get_employee_shift_for_date(employee, for_date):

    rows = frappe.db.sql(
        """
        SELECT shift_type
        FROM `tabShift Assignment`
        WHERE employee = %(employee)s
          AND docstatus = 1
          AND start_date <= %(for_date)s
          AND (end_date IS NULL OR end_date = '' OR end_date >= %(for_date)s)
        ORDER BY start_date DESC
        LIMIT 1
        """,
        {"employee": employee, "for_date": for_date},
    )
    if rows:
        return rows[0][0]

    # Fallback: Employee master's Default Shift field
    return frappe.db.get_value("Employee", employee, "default_shift")


# ==========================================================
# Shift Time Helper
# ==========================================================

def get_shift_datetime(date, time_delta):
    """Convert a Shift Type's Time field (stored as timedelta) into a datetime on the given date."""
    return datetime.combine(date, datetime.min.time()) + time_delta


# ==========================================================
# Convert Shift Time to Datetime
# ==========================================================

def get_session_logs(employee, session_start_time, session_end_time):

    log_names = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": ["between", [session_start_time, session_end_time]]
        },
        order_by="time asc, creation asc",
        pluck="name"
    )

    return [
        frappe.get_doc("Employee Checkin", name)
        for name in log_names
    ]


# ==========================================================
# Generate a Unique Session ID
# ==========================================================

def generate_session_id():
    return str(uuid.uuid4())

# Calculate Session Age

def get_session_age(session_start):
    """Real calendar seconds elapsed since the session's true start."""
    if not session_start:
        return 0
    return max(
        0,
        int(time_diff_in_seconds(now_datetime(), session_start)),
    )

# Start a New Attendance Session

def start_new_session():
    return {
        "session_id": generate_session_id(),
        "session_start": now_datetime(),
        "previous_seconds": 0,
        "reset_done": 0,
    }

# Resume an Existing Attendance Session

def resume_session(last_log):
    """
    Resume an existing session.

    This is called ONLY when the employee checks in again
    within 18 hours of the session start.

    After 18 hours, employee_checkin() starts a new session,
    so no reset logic is required here.
    """

    return {
        "session_id": last_log.custom_session_id or generate_session_id(),
        "session_start": last_log.custom_session_start or last_log.time,
        "previous_seconds": int(last_log.custom_previous_seconds or 0),
        "reset_done": 0,
    }


# ==========================================================
# Auto Check Out Expired Sessions
# ==========================================================

def auto_checkout(last_log):

    employee = last_log.employee
    employee_doc = frappe.get_doc("Employee", employee)

    session_start = last_log.custom_session_start or last_log.time

    # Cap the forced checkout at exactly the 24h mark from the
    # session's TRUE start - never later, even if this runs well
    # after that point (e.g. the hourly job catching up, or a
    # reactive call that happens hours after the cap was crossed).
    checkout_time = add_to_date(session_start, seconds=SESSION_RESET_SECONDS)

    elapsed_since_in = int(
        time_diff_in_seconds(checkout_time, last_log.time)
    )
    if elapsed_since_in < 0:
        elapsed_since_in = 0

    previous_seconds = last_log.custom_previous_seconds or 0
    total_seconds = previous_seconds + elapsed_since_in
    if total_seconds > SESSION_RESET_SECONDS:
        total_seconds = SESSION_RESET_SECONDS

    timezone_data = get_timezone_details(
        last_log.latitude,
        last_log.longitude
    )

    checkout = frappe.new_doc("Employee Checkin")

    checkout.employee = employee
    checkout.employee_name = employee_doc.employee_name
    checkout.log_type = "OUT"
    checkout.custom_auto_checkout = 1
    checkout.time = checkout_time
    checkout.latitude = last_log.latitude
    checkout.longitude = last_log.longitude
    checkout.custom_distance = 0

    checkout.custom_checkin_address = (
        last_log.get("custom_checkin_address")
        or "Auto Checkout - 24h session limit reached"
    )

    checkout.custom_previous_seconds = total_seconds
    checkout.custom_session_start = session_start
    checkout.custom_session_id = last_log.custom_session_id
    checkout.custom_utc_time = timezone_data["utc_time"]
    checkout.custom_employee_timezone = timezone_data["employee_timezone"]
    checkout.custom_employee_local_time = timezone_data["employee_local_time"]
    checkout.custom_company_timezone = timezone_data["company_timezone"]
    checkout.custom_company_local_time = timezone_data["company_local_time"]

    # Inherit the shift from the check-in being closed, rather than
    # relying on HRMS's time-window auto-detection. Fall back to a
    # fresh lookup only if that also comes up empty.
    resolved_shift = last_log.shift or get_employee_shift_for_date(
        employee, checkout.time.date()
    )

    checkout.insert(ignore_permissions=True)

    # HRMS's own controller clears `shift` back to empty during
    # validate/save if the checkout's timestamp falls outside the
    # Shift Type's start/end + buffer window - it runs after whatever
    # we set on the doc and overwrites it. db_set() writes directly to
    # the DB (bypassing that controller) AND keeps this in-memory
    # doc's modified timestamp in sync.
    if resolved_shift:
        checkout.db_set("shift", resolved_shift, update_modified=False)
        checkout.shift = resolved_shift

    working_seconds = total_seconds
    if working_seconds > SESSION_RESET_SECONDS:
        working_seconds = SESSION_RESET_SECONDS
    checkout.custom_working_hours = round(working_seconds / 3600,2)
    checkout.save(ignore_permissions=True)
    frappe.db.commit()

    return checkout


# ==========================================================
# Auto Check Out Open Sessions (Scheduler)
# ==========================================================

def auto_checkout_open_sessions():

    open_logs = frappe.db.sql(
        """
        SELECT ec.name
        FROM `tabEmployee Checkin` ec
        INNER JOIN (
            SELECT employee, MAX(time) AS max_time
            FROM `tabEmployee Checkin`
            GROUP BY employee
        ) latest
            ON latest.employee = ec.employee
           AND latest.max_time = ec.time
        WHERE ec.log_type = 'IN'
        """,
        as_dict=True,
    )

    for row in open_logs:

        rows = frappe.get_all(
            "Employee Checkin",
            filters={"name": row.name},
            fields=[
                "name",
                "employee",
                "log_type",
                "time",
                "shift",
                "custom_previous_seconds",
                "custom_session_start",
                "custom_session_id",
                "latitude",
                "longitude",
                "custom_checkin_address",
            ],
        )

        if not rows:
            continue

        last_log = rows[0]

        session_start = last_log.custom_session_start or last_log.time

        if get_session_age(session_start) >= SESSION_RESET_SECONDS:
            try:
                auto_checkout(last_log)
            except Exception:
                frappe.log_error(
                    title=f"Auto Checkout failed for {last_log.employee}",
                    message=frappe.get_traceback(),
                )


# ==========================================================
# Employee Check In / Check Out
# ==========================================================

@frappe.whitelist()
def employee_checkin(employee, log_type, latitude=None, longitude=None):

    # ======================================================
    # VALIDATION
    # ======================================================

    if not employee:
        frappe.throw(_("Employee is required."))

    if not log_type:
        frappe.throw(_("Log Type is required."))

    if latitude is None or longitude is None:
        frappe.throw(_("Latitude and Longitude are required."))

    latitude = float(latitude)
    longitude = float(longitude)

    # ======================================================
    # EMPLOYEE
    # ======================================================

    employee_doc = frappe.get_doc(
        "Employee",
        employee
    )

    # ======================================================
    # LOCATION VALIDATION
    # ======================================================

    distance = validate_employee_location(
        employee,
        latitude,
        longitude
    )

    # ======================================================
    # TIMEZONE
    # ======================================================

    timezone_data = get_timezone_details(
        latitude,
        longitude
    )

    # ======================================================
    # ADDRESS
    # ======================================================

    checkin_address = get_checkin_address(
        latitude,
        longitude
    )

    # ======================================================
    # Fetch Latest Attendance Log
    # ======================================================

    last_log = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee
        },
        fields=[
            "name",
            "employee",
            "log_type",
            "time",
            "shift",
            "custom_previous_seconds",
            "custom_session_start",
            "custom_session_id",
            "latitude", "longitude",
            "custom_checkin_address",
        ],
        order_by="time desc, creation asc",
        limit=1
    )

    last_log = last_log[0] if last_log else None

    # ======================================================
    # CHECK IN
    # ======================================================

    if log_type == "IN":

        # ------------------------------------------
        # Employee is currently checked IN (no checkout yet)
        # ------------------------------------------

        if last_log and last_log.log_type == "IN":

            session_start = last_log.custom_session_start or last_log.time
            session_age = get_session_age(session_start)

            if session_age >= SESSION_RESET_SECONDS:

                
                auto_checkout(last_log)
                session = start_new_session()

            else:
                frappe.throw(_("Employee is already Checked In."))

        # ------------------------------------------
        # Employee last checked OUT - resume or start fresh
        # ------------------------------------------

        elif last_log and last_log.log_type == "OUT":

            session_start = last_log.custom_session_start or last_log.time
            session_age = get_session_age(session_start)

            if session_age < SESSION_EXPIRE_SECONDS:
                
                session = resume_session(last_log)
            else:
                session = start_new_session()

        # ------------------------------------------
        # No prior log at all
        # ------------------------------------------

        else:
            session = start_new_session()

        # ==================================================
        # CREATE CHECK IN
        # ==================================================

        checkin = frappe.new_doc(
            "Employee Checkin"
        )

        checkin.employee = employee

        checkin.employee_name = (
            employee_doc.employee_name
        )

        checkin.log_type = "IN"

        checkin.time = now_datetime()

        checkin.latitude = latitude

        checkin.longitude = longitude

        checkin.custom_distance = round(
            distance,
            2
        )

        checkin.custom_checkin_address = (
            checkin_address
        )

        checkin.custom_previous_seconds = session["previous_seconds"]
        checkin.custom_session_start = session["session_start"]
        checkin.custom_session_id = session["session_id"]
        checkin.custom_utc_time = (
            timezone_data["utc_time"]
        )

        checkin.custom_employee_timezone = (
            timezone_data["employee_timezone"]
        )

        checkin.custom_employee_local_time = (
            timezone_data["employee_local_time"]
        )

        checkin.custom_company_timezone = (
            timezone_data["company_timezone"]
        )

        checkin.custom_company_local_time = (
            timezone_data["company_local_time"]
        )

        
        resolved_shift = get_employee_shift_for_date(
            employee, checkin.time.date()
        )

        checkin.insert(
            ignore_permissions=True
        )

        
        if resolved_shift:
            checkin.db_set("shift", resolved_shift, update_modified=False)

        frappe.db.commit()

        return {
            "success": True,
            "message": _("Check In Successful")
        }

    # ======================================================
    # CHECK OUT
    # ======================================================

    elif log_type == "OUT":

        if not last_log:
            frappe.throw(_("Please Check In first."))

        if last_log.log_type != "IN":
            frappe.throw(_("Employee has already Checked Out."))

        session_start = last_log.custom_session_start or last_log.time
        current_time = now_datetime()

        
        max_time = add_to_date(session_start, seconds=SESSION_RESET_SECONDS)
        checkout_time = min(current_time, max_time)

        elapsed_since_in = int(
            time_diff_in_seconds(
                checkout_time,
                last_log.time
            )
        )

        if elapsed_since_in < 0:
            elapsed_since_in = 0

        previous_seconds = last_log.custom_previous_seconds or 0

        total_seconds = (
            previous_seconds + elapsed_since_in
        )

        if total_seconds > SESSION_RESET_SECONDS:
            total_seconds = SESSION_RESET_SECONDS

        # ==================================================
        # CREATE CHECK OUT
        # ==================================================

        checkout = frappe.new_doc(
            "Employee Checkin"
        )

        checkout.employee = employee

        checkout.employee_name = (
            employee_doc.employee_name
        )

        checkout.log_type = "OUT"
        checkout.custom_auto_checkout = 0
        checkout.time = checkout_time
        checkout.latitude = latitude

        checkout.longitude = longitude

        checkout.custom_distance = round(
            distance,
            2
        )

        checkout.custom_checkin_address = (
            checkin_address
        )

        checkout.custom_previous_seconds = (
            total_seconds
        )

        checkout.custom_session_start = session_start
        checkout.custom_session_id = last_log.custom_session_id

        checkout.custom_utc_time = (
            timezone_data["utc_time"]
        )

        checkout.custom_employee_timezone = (
            timezone_data["employee_timezone"]
        )

        checkout.custom_employee_local_time = (
            timezone_data["employee_local_time"]
        )

        checkout.custom_company_timezone = (
            timezone_data["company_timezone"]
        )

        checkout.custom_company_local_time = (
            timezone_data["company_local_time"]
        )

        
        resolved_shift = last_log.shift or get_employee_shift_for_date(
            employee, checkout.time.date()
        )

        checkout.insert(
            ignore_permissions=True
        )

        
        if resolved_shift:
            checkout.db_set("shift", resolved_shift, update_modified=False)
            checkout.shift = resolved_shift

        if not checkout.shift:
            frappe.throw(
                _("Shift not found. This employee has no Shift Assignment "
                  "covering today and no Default Shift set on their Employee "
                  "record - please assign one before checking out.")
            )

        # ==================================================
        # WORKING HOURS
        # ==================================================
        working_seconds = total_seconds
        working_hours = round(working_seconds / 3600,2)
        checkout.custom_working_hours = working_hours
        checkout.save(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "message": _("Check Out Successful"),
            "working_hours": working_hours
        }

    else:

        frappe.throw(_("Invalid Log Type."))


# ==========================================================
# Recent Attendance
# ==========================================================

@frappe.whitelist()
def get_recent_attendance(employee=None):

    filters = {}

    if employee:
        filters["employee"] = employee

    logs = frappe.get_all(
        "Employee Checkin",
        filters=filters,
        fields=[
            "log_type",
            "time",
            "custom_working_hours"
        ],
        order_by="time asc, creation asc"
    )

    attendance = []
    current_in = None

    for log in logs:

        # -------------------------
        # Check In
        # -------------------------

        if log.log_type == "IN":
            current_in = log

        # -------------------------
        # Check Out
        # -------------------------

        elif log.log_type == "OUT" and current_in:

            attendance.append({
                "date": current_in.time.strftime("%d %b %Y"),
                "check_in": current_in.time.strftime("%I:%M %p"),
                "check_out": log.time.strftime("%I:%M %p"),
                "working_hours": log.custom_working_hours or 0
            })

            current_in = None

    # ------------------------------------
    # Employee Still Checked In
    # ------------------------------------

    if current_in:

        attendance.append({
            "date": current_in.time.strftime("%d %b %Y"),
            "check_in": current_in.time.strftime("%I:%M %p"),
            "check_out": "--",
            "working_hours": "--"
        })

    attendance.reverse()

    return attendance[:7]


# ==========================================================
# Simple Checkin Status Helper (display-only)
#
# NOT the same as get_today_status() in employee_login.py -
# that one drives the live session timer and 24h-cap logic
# for the CURRENTLY LOGGED-IN user. This helper just looks
# at each employee's most recent Employee Checkin log to show
# a quick In/Out badge for OTHER employees (Reporting Manager
# card, Associate Members list), and deliberately doesn't
# duplicate the session/resume/cap logic above.
# ==========================================================

def _get_simple_checkin_status(employee):

    last_log = frappe.get_all(
        "Employee Checkin",
        filters={"employee": employee},
        fields=["log_type"],
        order_by="time desc, creation desc",
        limit=1,
    )

    if not last_log:
        return {"status": "NOT_CHECKED_IN", "label": "Not Checked In"}

    if last_log[0].log_type == "IN":
        return {"status": "IN", "label": "In"}

    return {"status": "OUT", "label": "Out"}


# ==========================================================
# Reporting Manager Status
#
# Powers the "Reporting Manager" card on the Employee
# Attendance page. Returns None (not an error) when the
# employee has no reports_to set, so the frontend can just
# hide the card.
# ==========================================================

@frappe.whitelist()
def get_reporting_manager_status(employee=None):

    if not employee:
        frappe.throw(_("Employee is required."))

    reports_to = frappe.db.get_value("Employee", employee, "reports_to")

    if not reports_to:
        return None

    manager = frappe.db.get_value(
        "Employee",
        reports_to,
        ["name", "employee_name", "designation"],
        as_dict=True,
    )

    if not manager:
        return None

    status = _get_simple_checkin_status(manager.name)

    return {
        "name": manager.name,
        "employee_name": manager.employee_name,
        "designation": manager.designation,
        "status": status["status"],
        "status_label": status["label"],
    }


# ==========================================================
# Associate Members
#
# Powers the "Associate Members" card - colleagues in the
# same department as `employee`, excluding the employee
# themself. Each entry includes a quick IN/OUT status; the
# frontend routes clicks to the Employee Leave and Permission
# report filtered to that employee.
# ==========================================================

@frappe.whitelist()
def get_associate_members(employee=None):

    if not employee:
        frappe.throw(_("Employee is required."))

    department = frappe.db.get_value("Employee", employee, "department")

    filters = {"status": "Active"}

    if department:
        filters["department"] = department

    members = frappe.get_list(
        "Employee",
        filters=filters,
        fields=["name", "employee_name", "designation"],
        order_by="employee_name asc",
        limit_page_length=20,
    )

    result = []

    for m in members:

        if m.name == employee:
            continue

        status = _get_simple_checkin_status(m.name)

        result.append({
            "name": m.name,
            "employee_name": m.employee_name,
            "designation": m.designation,
            "status": status["status"],
            "status_label": status["label"],
        })

    return result