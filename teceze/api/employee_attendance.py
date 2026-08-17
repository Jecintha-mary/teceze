import frappe
from frappe import _
from frappe.utils import (now_datetime, get_datetime, time_diff_in_seconds, add_to_date)
from datetime import datetime
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
from zoneinfo import ZoneInfo
from math import (radians, sin, cos, sqrt, atan2)
import uuid

tf = TimezoneFinder()

SESSION_EXPIRE_SECONDS = 18 * 60 * 60     # Resume allowed only within 18 hours
SESSION_RESET_SECONDS = 24 * 60 * 60      # 24 hour hard cap for continuous open sessions


# ==========================================================
# Current Logged-in Employee
#
# SECURITY:
# The browser must never decide which Employee record is being
# operated on. Employee identity is always derived from the
# authenticated Frappe session.
# ==========================================================

def get_current_employee():
    user = frappe.session.user

    if not user or user == "Guest":
        frappe.throw(_("Authentication required."))

    employees = frappe.get_list(
        "Employee",
        filters={
            "user_id": user,
            "status": "Active",
        },
        fields=[
            "name",
            "employee_name",
            "user_id",
            "status",
            "custom_work_location",
            "designation",
            "department",
            "reports_to",
            "default_shift",
        ],
        limit_page_length=1,
    )

    if not employees:
        frappe.throw(_("No active Employee is mapped to the logged-in user."))

    return employees[0]


# ==========================================================
# GPS Input Validation
# ==========================================================

def validate_gps_input(latitude, longitude, accuracy):
    if latitude is None or longitude is None:
        frappe.throw(_("Latitude and Longitude are required."))

    if accuracy is None:
        frappe.throw(_("GPS accuracy is required."))

    try:
        latitude = float(latitude)
        longitude = float(longitude)
        accuracy = float(accuracy)
    except (TypeError, ValueError):
        frappe.throw(_("Invalid GPS values."))

    if not -90 <= latitude <= 90:
        frappe.throw(_("Invalid latitude."))

    if not -180 <= longitude <= 180:
        frappe.throw(_("Invalid longitude."))

    if accuracy < 0:
        frappe.throw(_("Invalid GPS accuracy."))

    return latitude, longitude, accuracy


def get_gps_accuracy_threshold(location):
    """
    Preferred configuration field:
        Location.custom_gps_accuracy_threshold

    If that custom field is not present or is empty, use 100 meters.
    """
    threshold = 100.0

    if location.meta.has_field("custom_gps_accuracy_threshold"):
        configured = location.get("custom_gps_accuracy_threshold")
        if configured not in (None, ""):
            try:
                threshold = float(configured)
            except (TypeError, ValueError):
                frappe.throw(_("Invalid GPS accuracy threshold configured."))

    if threshold <= 0:
        frappe.throw(_("GPS accuracy threshold must be greater than zero."))

    return threshold


def validate_gps_accuracy(location, accuracy):
    threshold = get_gps_accuracy_threshold(location)

    if accuracy > threshold:
        frappe.throw(
            _(
                "GPS accuracy is too low for attendance. "
                "Current accuracy: {0} meters. Required: {1} meters or better."
            ).format(round(accuracy, 2), round(threshold, 2))
        )

    return threshold


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

def get_timezone_details(latitude=None, longitude=None):

    employee_timezone = "UTC"

    if latitude is not None and longitude is not None:
        employee_timezone = tf.timezone_at(
            lat=float(latitude),
            lng=float(longitude)
        ) or "UTC"

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

        frappe.throw(_(f"You are outside your assigned Work Location.\n\n"
            f"Current Distance : {round(distance,2)} meters\n"
            f"Allowed Radius : {allowed_radius} meters"
        ))
    return distance


# ==========================================================
# Get Employee Shift for a Given Date
# ==========================================================

def get_employee_shift_for_date(employee, for_date):
    assignments = frappe.get_list(
        "Shift Assignment",
        filters={
            "employee": employee,
            "docstatus": 1,
            "start_date": ["<=", for_date],
        },
        or_filters=[
            {"end_date": ["is", "not set"]},
            {"end_date": ""},
            {"end_date": [">=", for_date]},
        ],
        fields=["shift_type", "start_date", "end_date"],
        order_by="start_date desc",
        limit_page_length=1,
    )

    if assignments and assignments[0].shift_type:
        return assignments[0].shift_type

    fallback = frappe.get_list(
        "Employee",
        filters={"name": employee},
        fields=["default_shift"],
        limit_page_length=1,
    )

    if fallback:
        return fallback[0].default_shift

    return None


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
    logs = frappe.get_list(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": ["between", [session_start_time, session_end_time]],
        },
        fields=["name"],
        order_by="time asc, creation asc",
        limit_page_length=0,
    )

    return [
        frappe.get_doc("Employee Checkin", row.name)
        for row in logs
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
    """
    Scheduler-safe ORM implementation.

    For each active employee, inspect only that employee's latest
    Employee Checkin record. If the latest record is an IN and the
    session has crossed the 24-hour cap, create the automatic OUT.
    """
    employees = frappe.get_list(
        "Employee",
        filters={"status": "Active"},
        fields=["name"],
        order_by="name asc",
        limit_page_length=0,
    )

    for employee_row in employees:
        latest = frappe.get_list(
            "Employee Checkin",
            filters={"employee": employee_row.name},
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
            order_by="time desc, creation desc",
            limit_page_length=1,
        )

        if not latest:
            continue

        last_log = latest[0]

        if last_log.log_type != "IN":
            continue

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
def employee_checkin(log_type, latitude=None, longitude=None, accuracy=None):
    """
    Employee self-service attendance endpoint.

    IMPORTANT:
    - No employee ID is accepted from the browser.
    - Employee identity comes from frappe.session.user.
    - GPS accuracy is mandatory and validated server-side.
    - Geofence validation is performed server-side.
    - Reverse geocoding is deliberately NOT part of this critical path.
    """

    if log_type not in ("IN", "OUT"):
        frappe.throw(_("Invalid Log Type."))

    employee_doc = get_current_employee()
    employee = employee_doc.name

    latitude, longitude, accuracy = validate_gps_input(
        latitude,
        longitude,
        accuracy,
    )

    # Resolve the employee's work location through the authenticated
    # employee record, never through a frontend employee parameter.
    if not employee_doc.custom_work_location:
        frappe.throw(_("Work Location is not assigned."))

    location_rows = frappe.get_list(
        "Location",
        filters={"name": employee_doc.custom_work_location},
        fields=[
            "name",
            "latitude",
            "longitude",
            "custom_attendance_radius",
            "custom_attendance_radius_uom",
        ],
        limit_page_length=1,
    )

    if not location_rows:
        frappe.throw(_("Assigned Work Location was not found."))

    location = frappe.get_doc("Location", location_rows[0].name)

    validate_gps_accuracy(location, accuracy)

    distance = validate_employee_location(
        employee,
        latitude,
        longitude,
    )

    timezone_data = get_timezone_details(latitude, longitude)

    # Latest attendance record for the authenticated employee only.
    latest_logs = frappe.get_list(
        "Employee Checkin",
        filters={"employee": employee},
        fields=[
            "name",
            "employee",
            "employee_name",
            "log_type",
            "time",
            "shift",
            "custom_previous_seconds",
            "custom_session_start",
            "custom_session_id",
            "latitude",
            "longitude",
            "custom_checkin_address",
            "custom_gps_accuracy",
        ],
        order_by="time desc, creation desc",
        limit_page_length=1,
    )

    last_log = latest_logs[0] if latest_logs else None

    # ======================================================
    # CHECK IN
    # ======================================================

    if log_type == "IN":

        if last_log and last_log.log_type == "IN":
            session_start = last_log.custom_session_start or last_log.time
            session_age = get_session_age(session_start)

            if session_age >= SESSION_RESET_SECONDS:
                auto_checkout(last_log)
                session = start_new_session()
            else:
                frappe.throw(_("Employee is already Checked In."))

        elif last_log and last_log.log_type == "OUT":
            session_start = last_log.custom_session_start or last_log.time
            session_age = get_session_age(session_start)

            if session_age < SESSION_EXPIRE_SECONDS:
                session = resume_session(last_log)
            else:
                session = start_new_session()

        else:
            session = start_new_session()

        checkin = frappe.new_doc("Employee Checkin")

        checkin.employee = employee
        checkin.employee_name = employee_doc.employee_name
        checkin.log_type = "IN"
        checkin.time = now_datetime()
        checkin.latitude = latitude
        checkin.longitude = longitude
        checkin.custom_distance = round(distance, 2)

        if checkin.meta.has_field("custom_gps_accuracy"):
            checkin.custom_gps_accuracy = accuracy

        # Reverse geocoding is optional. We do not call Nominatim here.
        if checkin.meta.has_field("custom_checkin_address"):
            checkin.custom_checkin_address = "Address pending"

        checkin.custom_previous_seconds = session["previous_seconds"]
        checkin.custom_session_start = session["session_start"]
        checkin.custom_session_id = session["session_id"]
        checkin.custom_utc_time = timezone_data["utc_time"]
        checkin.custom_employee_timezone = timezone_data["employee_timezone"]
        checkin.custom_employee_local_time = timezone_data["employee_local_time"]
        checkin.custom_company_timezone = timezone_data["company_timezone"]
        checkin.custom_company_local_time = timezone_data["company_local_time"]

        resolved_shift = get_employee_shift_for_date(
            employee,
            checkin.time.date(),
        )

        if resolved_shift:
            checkin.shift = resolved_shift

        # This is an authenticated, server-authorized self-service
        # operation. Keep permission bypass only here if the Employee
        # role is not granted direct Employee Checkin create permission.
        checkin.insert(ignore_permissions=True)

        frappe.db.commit()

        return {
            "success": True,
            "message": _("Check In Successful"),
            "distance": round(distance, 2),
            "accuracy": round(accuracy, 2),
        }

    # ======================================================
    # CHECK OUT
    # ======================================================

    if not last_log:
        frappe.throw(_("Please Check In first."))

    if last_log.log_type != "IN":
        frappe.throw(_("Employee has already Checked Out."))

    session_start = last_log.custom_session_start or last_log.time
    current_time = now_datetime()

    max_time = add_to_date(
        session_start,
        seconds=SESSION_RESET_SECONDS,
    )
    checkout_time = min(current_time, max_time)

    elapsed_since_in = int(
        time_diff_in_seconds(
            checkout_time,
            last_log.time,
        )
    )

    if elapsed_since_in < 0:
        elapsed_since_in = 0

    previous_seconds = int(last_log.custom_previous_seconds or 0)

    total_seconds = previous_seconds + elapsed_since_in

    if total_seconds > SESSION_RESET_SECONDS:
        total_seconds = SESSION_RESET_SECONDS

    checkout = frappe.new_doc("Employee Checkin")

    checkout.employee = employee
    checkout.employee_name = employee_doc.employee_name
    checkout.log_type = "OUT"
    checkout.custom_auto_checkout = 0
    checkout.time = checkout_time
    checkout.latitude = latitude
    checkout.longitude = longitude
    checkout.custom_distance = round(distance, 2)

    if checkout.meta.has_field("custom_gps_accuracy"):
        checkout.custom_gps_accuracy = accuracy

    if checkout.meta.has_field("custom_checkin_address"):
        checkout.custom_checkin_address = "Address pending"

    checkout.custom_previous_seconds = total_seconds
    checkout.custom_session_start = session_start
    checkout.custom_session_id = last_log.custom_session_id
    checkout.custom_utc_time = timezone_data["utc_time"]
    checkout.custom_employee_timezone = timezone_data["employee_timezone"]
    checkout.custom_employee_local_time = timezone_data["employee_local_time"]
    checkout.custom_company_timezone = timezone_data["company_timezone"]
    checkout.custom_company_local_time = timezone_data["company_local_time"]

    resolved_shift = last_log.shift or get_employee_shift_for_date(
        employee,
        checkout.time.date(),
    )

    if resolved_shift:
        checkout.shift = resolved_shift

    if not checkout.shift:
        frappe.throw(
            _(
                "Shift not found. This employee has no Shift Assignment "
                "covering today and no Default Shift set on their Employee "
                "record - please assign one before checking out."
            )
        )

    working_hours = round(
        min(total_seconds, SESSION_RESET_SECONDS) / 3600,
        2,
    )

    checkout.custom_working_hours = working_hours

    checkout.insert(ignore_permissions=True)

    # HRMS may clear the shift during controller validation.
    # Re-apply the already-authorized resolved shift through ORM.
    if resolved_shift:
        checkout.db_set(
            "shift",
            resolved_shift,
            update_modified=False,
        )
        checkout.shift = resolved_shift

    frappe.db.commit()

    return {
        "success": True,
        "message": _("Check Out Successful"),
        "working_hours": working_hours,
        "distance": round(distance, 2),
        "accuracy": round(accuracy, 2),
    }


# ==========================================================
# Recent Attendance
# ==========================================================

@frappe.whitelist()
@frappe.whitelist()
def get_recent_attendance():
    employee_doc = get_current_employee()
    employee = employee_doc.name

    # Keep the query bounded. We need only a recent window for the
    # dashboard, not the employee's entire attendance history.
    logs = frappe.get_list(
        "Employee Checkin",
        filters={"employee": employee},
        fields=[
            "log_type",
            "time",
            "custom_working_hours",
        ],
        order_by="time desc, creation desc",
        limit_page_length=100,
    )

    # Restore chronological order for IN/OUT pairing.
    logs.reverse()

    attendance = []
    current_in = None

    for log in logs:
        if log.log_type == "IN":
            current_in = log

        elif log.log_type == "OUT" and current_in:
            attendance.append({
                "date": current_in.time.strftime("%d %b %Y"),
                "check_in": current_in.time.strftime("%I:%M %p"),
                "check_out": log.time.strftime("%I:%M %p"),
                "working_hours": log.custom_working_hours or 0,
            })
            current_in = None

    if current_in:
        attendance.append({
            "date": current_in.time.strftime("%d %b %Y"),
            "check_in": current_in.time.strftime("%I:%M %p"),
            "check_out": "--",
            "working_hours": "--",
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
@frappe.whitelist()
def get_reporting_manager_status():
    employee_doc = get_current_employee()

    if not employee_doc.reports_to:
        return None

    managers = frappe.get_list(
        "Employee",
        filters={
            "name": employee_doc.reports_to,
        },
        fields=["name", "employee_name", "designation"],
        limit_page_length=1,
    )

    if not managers:
        return None

    manager = managers[0]
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
@frappe.whitelist()
def get_associate_members():
    employee_doc = get_current_employee()
    employee = employee_doc.name

    filters = {"status": "Active"}

    if employee_doc.department:
        filters["department"] = employee_doc.department

    members = frappe.get_list(
        "Employee",
        filters=filters,
        fields=["name", "employee_name", "designation"],
        order_by="employee_name asc",
        limit_page_length=20,
    )

    result = []

    for member in members:
        if member.name == employee:
            continue

        status = _get_simple_checkin_status(member.name)

        result.append({
            "name": member.name,
            "employee_name": member.employee_name,
            "designation": member.designation,
            "status": status["status"],
            "status_label": status["label"],
        })

    return result
