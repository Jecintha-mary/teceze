import frappe
from frappe import _
from frappe.utils import (
    now_datetime,
    get_datetime,
    time_diff_in_seconds,
    add_to_date
)
from datetime import datetime, timedelta
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
from zoneinfo import ZoneInfo
from math import (
    radians,
    sin,
    cos,
    sqrt,
    atan2
)
from frappe import _dict
from hrms.hr.doctype.employee_checkin.employee_checkin import calculate_working_hours
import uuid


tf = TimezoneFinder()


# ==========================================================
# Teceze Settings - Attendance Session Configuration
# ==========================================================

def get_attendance_session_settings():

    settings = frappe.get_single("Teceze Settings")

    expire_hours = (
        settings.custom_session_expire_hours
        or 15
    )

    reset_hours = (
        settings.custom_session_reset_hours
        or 24
    )

    return {
        "session_expire_seconds": int(
            float(expire_hours) * 60 * 60
        ),
        "session_reset_seconds": int(
            float(reset_hours) * 60 * 60
        )
    }

session_settings = get_attendance_session_settings()
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

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a)
    )

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

    allowed_radius = float(
        location.custom_attendance_radius or 500
    )

    if location.custom_attendance_radius_uom == "KM":
        allowed_radius = allowed_radius * 1000

    if distance > allowed_radius:

        return {
            "success": False,
            "message": _(
                "You are outside of the geolocation."
            )
        }

    return {
        "success": True,
        "location": location.name,
        "distance": round(
            distance,
            2
        )
    }


# ==========================================================
# Get Employee Shift for a Given Date
# ==========================================================

def get_employee_shift_for_date(
    employee,
    for_date
):

    rows = frappe.db.sql(
        """
        SELECT shift_type
        FROM `tabShift Assignment`
        WHERE employee = %(employee)s
          AND docstatus = 1
          AND start_date <= %(for_date)s
          AND (
              end_date IS NULL
              OR end_date = ''
              OR end_date >= %(for_date)s
          )
        ORDER BY start_date DESC
        LIMIT 1
        """,
        {
            "employee": employee,
            "for_date": for_date
        },
    )

    if rows:
        return rows[0][0]

    # Fallback:
    # Employee master's Default Shift field

    return frappe.db.get_value(
        "Employee",
        employee,
        "default_shift"
    )


# ==========================================================
# Shift Time Helper
# ==========================================================

def get_shift_datetime(
    date,
    time_delta
):

    """
    Convert a Shift Type's Time field
    (stored as timedelta) into a datetime
    on the given date.
    """

    return (
        datetime.combine(
            date,
            datetime.min.time()
        )
        + time_delta
    )


# ==========================================================
# Weekly Off Shift Calculations
# ==========================================================

def _shiftwise_calculations(
    employee,
    from_date
):

    # ------------------------------------------------------
    # Get Employee Shift Assignment
    # ------------------------------------------------------

    shift_assignment = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": employee,
            "start_date": ["<=", from_date],
            "docstatus": 1
        },
        fields=[
            "shift_type",
            "start_date"
        ],
        order_by="start_date desc",
        limit=1
    )

    if not shift_assignment:

        return None

    shift_type_name = shift_assignment[0].shift_type

    if not shift_type_name:

        return None

    # ------------------------------------------------------
    # Get Shift Type
    # ------------------------------------------------------

    shift = frappe.get_doc(
        "Shift Type",
        shift_type_name
    )

    # ------------------------------------------------------
    # Shift Start / End
    # ------------------------------------------------------

    shift_start = get_datetime(
        f"{from_date} {shift.start_time}"
    )

    shift_end = get_datetime(
        f"{from_date} {shift.end_time}"
    )

    # ------------------------------------------------------
    # Handle Night Shift
    # ------------------------------------------------------

    if shift_end <= shift_start:

        shift_end += timedelta(
            days=1
        )

    # ------------------------------------------------------
    # Shift Buffers
    # ------------------------------------------------------

    begin_buffer = (
        shift.begin_check_in_before_shift_start_time
        or 0
    )

    end_buffer = (
        shift.allow_check_out_after_shift_end_time
        or 0
    )

    # ------------------------------------------------------
    # Attendance Window
    # ------------------------------------------------------

    window_start = (
        shift_start
        - timedelta(
            minutes=begin_buffer
        )
    )

    window_end = (
        shift_end
        + timedelta(
            minutes=end_buffer
        )
    )

    return {
        "shift_type": shift_type_name,
        "shift_start": shift_start,
        "shift_end": shift_end,
        "window_start": window_start,
        "window_end": window_end
    }


# ==========================================================
# Weekly Off Auto Checkout Time
# ==========================================================

def get_weekly_off_auto_checkout_time(
    employee,
    checkin_time
):

    """
    Returns the auto checkout details only when:

    1. Employee has an active Shift Assignment.
    2. The check-in date is marked as Weekly Off.
    3. The Weekly Off belongs to the Holiday List
       configured in the assigned Shift Type.

    The checkout time is the assigned shift's
    window_end, including the configured
    checkout buffer.

    Returns None for normal working days.
    """

    checkin_date = get_datetime(
        checkin_time
    ).date()

    # ------------------------------------------------------
    # Calculate Assigned Shift
    # ------------------------------------------------------

    shift_data = _shiftwise_calculations(
        employee,
        checkin_date
    )

    if not shift_data:
        return None

    shift_type_name = (
        shift_data["shift_type"]
    )

    # ------------------------------------------------------
    # Get Holiday List from Assigned Shift
    # ------------------------------------------------------

    holiday_list = frappe.db.get_value(
        "Shift Type",
        shift_type_name,
        "holiday_list"
    )

    if not holiday_list:
        return None

    # ------------------------------------------------------
    # Check Weekly Off
    # ------------------------------------------------------

    weekly_off = frappe.db.exists(
        "Holiday",
        {
            "parent": holiday_list,
            "holiday_date": checkin_date,
            "weekly_off": 1
        }
    )

    if not weekly_off:
        return None

    # ------------------------------------------------------
    # Weekly Off Found
    # ------------------------------------------------------

    return shift_data


# ==========================================================
# Convert Shift Time to Datetime
# ==========================================================

def get_session_logs(
    employee,
    session_start_time,
    session_end_time
):

    log_names = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": [
                "between",
                [
                    session_start_time,
                    session_end_time
                ]
            ]
        },
        order_by="time asc, creation desc",
        pluck="name"
    )

    return [
        frappe.get_doc(
            "Employee Checkin",
            name
        )
        for name in log_names
    ]


# ==========================================================
# Generate a Unique Session ID
# ==========================================================

def generate_session_id():

    return str(
        uuid.uuid4()
    )


# ==========================================================
# Calculate Session Age
# ==========================================================

def get_session_age(
    session_start
):

    """
    Real calendar seconds elapsed since
    the session's true start.
    """

    if not session_start:
        return 0

    return max(
        0,
        int(
            time_diff_in_seconds(
                now_datetime(),
                session_start
            )
        ),
    )


# ==========================================================
# Start a New Attendance Session
# ==========================================================

def start_new_session():

    return {
        "session_id": generate_session_id(),
        "session_start": now_datetime(),
        "previous_seconds": 0,
        "reset_done": 0,
    }


# ==========================================================
# Resume an Existing Attendance Session
# ==========================================================

def resume_session(
    last_log
):

    """
    Resume an existing session.

    This is called ONLY when the employee checks in again
    within 15 hours of the session start.

    After 15 hours, employee_checkin() starts a new session.
    """

    return {
        "session_id": (
            last_log.custom_session_id
            or generate_session_id()
        ),

        "session_start": (
            last_log.custom_session_start
            or last_log.time
        ),

        "previous_seconds": int(
            last_log.custom_previous_seconds
            or 0
        ),

        "reset_done": 0,
    }


# ==========================================================
# Auto Check Out Expired Sessions
# ==========================================================

def auto_checkout(
    last_log
):
    session_settings = get_attendance_session_settings()
    employee = last_log.employee

    employee_doc = frappe.get_doc(
        "Employee",
        employee
    )

    session_start = (
        last_log.custom_session_start
        or last_log.time
    )

    # ------------------------------------------------------
    # Determine Auto Checkout Time
    #
    # Weekly Off:
    #     Assigned Shift window_end
    #
    # Normal Day:
    #     Existing 24-hour session limit
    # ------------------------------------------------------

    weekly_off_data = (
        get_weekly_off_auto_checkout_time(
            employee,
            session_start
        )
    )

    if weekly_off_data:

        checkout_time = (
            weekly_off_data["window_end"]
        )

        auto_checkout_limit = int(
            time_diff_in_seconds(
                checkout_time,
                session_start
            )
        )

    else:

        checkout_time = add_to_date(
            session_start,
            seconds=session_settings["session_reset_seconds"]
        )

        auto_checkout_limit = (
            session_settings["session_reset_seconds"]
        )

    # ------------------------------------------------------
    # Calculate elapsed time
    # ------------------------------------------------------

    elapsed_since_in = int(
        time_diff_in_seconds(
            checkout_time,
            last_log.time
        )
    )

    if elapsed_since_in < 0:
        elapsed_since_in = 0

    previous_seconds = (
        last_log.custom_previous_seconds
        or 0
    )

    total_seconds = (
        previous_seconds
        + elapsed_since_in
    )

    if total_seconds > auto_checkout_limit:

        total_seconds = (
            auto_checkout_limit
        )

    # ------------------------------------------------------
    # Timezone
    # ------------------------------------------------------

    timezone_data = get_timezone_details(
        last_log.latitude,
        last_log.longitude
    )

    # ------------------------------------------------------
    # Create Auto Checkout
    # ------------------------------------------------------

    checkout = frappe.new_doc(
        "Employee Checkin"
    )

    checkout.employee = employee

    checkout.employee_name = (
        employee_doc.employee_name
    )

    checkout.log_type = "OUT"

    checkout.custom_auto_checkout = 1
    checkout.time = checkout_time

    checkout.latitude = last_log.latitude

    checkout.longitude = last_log.longitude

    checkout.custom_distance = 0

    # ------------------------------------------------------
    # Preserve the location from the original IN
    # ------------------------------------------------------

    checkout.custom_work_location = (
        last_log.custom_work_location
    )

    # ------------------------------------------------------
    # Auto Checkout Message
    # ------------------------------------------------------

    if weekly_off_data:

        auto_checkout_message = (
            "Auto Checkout - Weekly Off shift end reached"
        )

    else:

        auto_checkout_message = (
            "Auto Checkout - 24h session limit reached"
        )

    checkout.custom_checkin_address = (
        last_log.get(
            "custom_checkin_address"
        )
        or
        auto_checkout_message
    )

    checkout.custom_previous_seconds = (
        total_seconds
    )

    checkout.custom_session_start = (
        session_start
    )

    checkout.custom_session_id = (
        last_log.custom_session_id
    )

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

    # ------------------------------------------------------
    # Resolve Shift
    # ------------------------------------------------------

    resolved_shift = (
        last_log.shift
        or
        get_employee_shift_for_date(
            employee,
            checkout.time.date()
        )
    )

    checkout.insert(
        ignore_permissions=True
    )

    # ------------------------------------------------------
    # Force Shift value after HRMS validation
    # ------------------------------------------------------

    if resolved_shift:

        checkout.db_set(
            "shift",
            resolved_shift,
            update_modified=False
        )

        checkout.shift = resolved_shift

    # ------------------------------------------------------
    # Working Hours
    # ------------------------------------------------------

    working_seconds = total_seconds

    if working_seconds > auto_checkout_limit:

        working_seconds = (
            auto_checkout_limit
        )

    checkout.custom_working_hours = round(
        working_seconds / 3600,
        2
    )

    checkout.save(
        ignore_permissions=True
    )

    frappe.db.commit()

    return checkout


# ==========================================================
# Auto Check Out Open Sessions (Scheduler)
# ==========================================================

def auto_checkout_open_sessions():
    session_settings = get_attendance_session_settings()

    open_logs = frappe.db.sql(
        """
        SELECT ec.name
        FROM `tabEmployee Checkin` ec

        INNER JOIN (
            SELECT
                employee,
                MAX(time) AS max_time
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
            filters={
                "name": row.name
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
                "latitude",
                "longitude",
                "custom_checkin_address",
                "custom_work_location",
            ],
        )

        if not rows:
            continue

        last_log = rows[0]

        session_start = (
            last_log.custom_session_start
            or last_log.time
        )

        # --------------------------------------------------
        # Check Weekly Off Shift End
        # --------------------------------------------------

        weekly_off_data = (
            get_weekly_off_auto_checkout_time(
                last_log.employee,
                session_start
            )
        )

        if weekly_off_data:

            # Weekly Off:
            # Auto checkout at assigned shift window_end

            should_auto_checkout = (
                now_datetime()
                >= weekly_off_data["window_end"]
            )

        else:

            # Normal working day:
            # Existing 24-hour session limit

            should_auto_checkout = (
                get_session_age(session_start)
                >= session_settings["session_reset_seconds"]
            )

        # --------------------------------------------------
        # Perform Auto Checkout
        # --------------------------------------------------

        if should_auto_checkout:

            try:

                auto_checkout(
                    last_log
                )

            except Exception:

                frappe.log_error(
                    title=(
                        f"Auto Checkout failed "
                        f"for {last_log.employee}"
                    ),
                    message=frappe.get_traceback(),
                )


# ==========================================================
# Employee Check In / Check Out
# ==========================================================

@frappe.whitelist()
def employee_checkin(
    employee,
    log_type,
    latitude=None,
    longitude=None
):
    session_settings = get_attendance_session_settings()
    # ======================================================
    # VALIDATION
    # ======================================================

    if not employee:

        frappe.throw(
            _("Employee is required.")
        )

    if not log_type:

        frappe.throw(
            _("Log Type is required.")
        )

    if latitude is None or longitude is None:

        frappe.throw(
            _("Latitude and Longitude are required.")
        )

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
    # Checks the employee's current GPS against
    # the Work Location assigned in Employee.
    # This is performed before both IN and OUT.
    # ======================================================

    location_validation = (
        validate_employee_location(
            employee,
            latitude,
            longitude
        )
    )

    if not location_validation.get(
        "success"
    ):

        frappe.throw(
            location_validation.get(
                "message",
                _("You are outside of the geolocation.")
            )
        )

    distance = (
        location_validation["distance"]
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
            "latitude",
            "longitude",
            "custom_checkin_address",
        ],
        order_by="time desc, creation desc",
        limit=1
    )

    last_log = (
        last_log[0]
        if last_log
        else None
    )

    # ======================================================
    # CHECK IN
    # ======================================================

    if log_type == "IN":

        # --------------------------------------------------
        # Employee is currently checked IN
        # --------------------------------------------------

        if (
            last_log
            and last_log.log_type == "IN"
        ):

            session_start = (
                last_log.custom_session_start
                or last_log.time
            )

            session_age = (
                get_session_age(
                    session_start
                )
            )

            if (
                session_age
                >= session_settings["session_reset_seconds"]
            ):

                auto_checkout(
                    last_log
                )

                session = (
                    start_new_session()
                )

            else:

                frappe.throw(
                    _("Employee is already Checked In.")
                )

        # --------------------------------------------------
        # Employee last checked OUT
        # --------------------------------------------------

        elif (
            last_log
            and last_log.log_type == "OUT"
        ):

            session_start = (
                last_log.custom_session_start
                or last_log.time
            )

            session_age = (
                get_session_age(
                    session_start
                )
            )

            if (
                session_age
                < session_settings["session_expire_seconds"]
            ):

                session = (
                    resume_session(
                        last_log
                    )
                )

            else:

                session = (
                    start_new_session()
                )

        # --------------------------------------------------
        # No previous attendance log
        # --------------------------------------------------

        else:

            session = (
                start_new_session()
            )

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

        # --------------------------------------------------
        # Store the location
        # --------------------------------------------------

        checkin.custom_work_location = (
            employee_doc.custom_work_location
        )

        checkin.custom_checkin_address = (
            checkin_address
        )

        checkin.custom_previous_seconds = (
            session["previous_seconds"]
        )

        checkin.custom_session_start = (
            session["session_start"]
        )

        checkin.custom_session_id = (
            session["session_id"]
        )

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

        # --------------------------------------------------
        # Resolve Shift
        # --------------------------------------------------

        resolved_shift = (
            get_employee_shift_for_date(
                employee,
                checkin.time.date()
            )
        )

        checkin.insert(
            ignore_permissions=True
        )

        # --------------------------------------------------
        # Preserve Shift
        # --------------------------------------------------

        if resolved_shift:

            checkin.db_set(
                "shift",
                resolved_shift,
                update_modified=False
            )

        frappe.db.commit()

        return {
            "success": True,
            "message": _(
                "Check In Successful"
            )
        }

    # ======================================================
    # CHECK OUT
    # ======================================================

    elif log_type == "OUT":

        # --------------------------------------------------
        # No previous log
        # --------------------------------------------------

        if not last_log:

            frappe.throw(
                _("Please Check In first.")
            )

        # --------------------------------------------------
        # Already checked out
        # --------------------------------------------------

        if last_log.log_type != "IN":

            frappe.throw(
                _("Employee has already Checked Out.")
            )

        # --------------------------------------------------
        # Session
        # --------------------------------------------------

        session_start = (
            last_log.custom_session_start
            or last_log.time
        )

        current_time = now_datetime()

        max_time = add_to_date(
            session_start,
            seconds=session_settings["session_reset_seconds"]
        )

        checkout_time = min(
            current_time,
            max_time
        )

        elapsed_since_in = int(
            time_diff_in_seconds(
                checkout_time,
                last_log.time
            )
        )

        if elapsed_since_in < 0:
            elapsed_since_in = 0

        previous_seconds = (
            last_log.custom_previous_seconds
            or 0
        )

        total_seconds = (
            previous_seconds
            + elapsed_since_in
        )

        if total_seconds > session_settings["session_reset_seconds"]:

            total_seconds = (
                session_settings["session_reset_seconds"]
            )

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

        # --------------------------------------------------
        # IMPORTANT:
        #
        # This is the location matched against the CURRENT
        # checkout GPS.
        #
        # It does NOT have to equal the IN location.
        # --------------------------------------------------

        checkout.custom_work_location = (
            employee_doc.custom_work_location
        )

        checkout.custom_checkin_address = (
            checkin_address
        )

        checkout.custom_previous_seconds = (
            total_seconds
        )

        checkout.custom_session_start = (
            session_start
        )

        checkout.custom_session_id = (
            last_log.custom_session_id
        )

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

        # --------------------------------------------------
        # Resolve Shift
        # --------------------------------------------------

        resolved_shift = (
            last_log.shift
            or
            get_employee_shift_for_date(
                employee,
                checkout.time.date()
            )
        )

        checkout.insert(
            ignore_permissions=True
        )

        # --------------------------------------------------
        # Preserve Shift
        # --------------------------------------------------

        if resolved_shift:

            checkout.db_set(
                "shift",
                resolved_shift,
                update_modified=False
            )

            checkout.shift = (
                resolved_shift
            )

        # --------------------------------------------------
        # Shift validation
        # --------------------------------------------------

        if not checkout.shift:

            frappe.throw(
                _(
                    "Shift not found. This employee "
                    "has no Shift Assignment covering "
                    "today and no Default Shift set on "
                    "their Employee record - please "
                    "assign one before checking out."
                )
            )

        # ==================================================
        # WORKING HOURS
        # ==================================================

        working_seconds = total_seconds

        working_hours = round(
            working_seconds / 3600,
            2
        )

        checkout.custom_working_hours = (
            working_hours
        )

        checkout.save(
            ignore_permissions=True
        )

        frappe.db.commit()

        return {
            "success": True,
            "message": _(
                "Check Out Successful"
            ),
            "working_hours": working_hours
        }

    # ======================================================
    # INVALID LOG TYPE
    # ======================================================

    else:

        frappe.throw(
            _("Invalid Log Type.")
        )


# ==========================================================
# Recent Attendance
# ==========================================================

@frappe.whitelist()
def get_recent_attendance(
    employee=None
):

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

        # --------------------------------------------------
        # Check In
        # --------------------------------------------------

        if log.log_type == "IN":

            current_in = log

        # --------------------------------------------------
        # Check Out
        # --------------------------------------------------

        elif (
            log.log_type == "OUT"
            and current_in
        ):

            attendance.append({

                "date": (
                    current_in.time.strftime(
                        "%d %b %Y"
                    )
                ),

                "check_in": (
                    current_in.time.strftime(
                        "%I:%M %p"
                    )
                ),

                "check_out": (
                    log.time.strftime(
                        "%I:%M %p"
                    )
                ),

                "working_hours": (
                    log.custom_working_hours
                    or 0
                )

            })

            current_in = None

    # ------------------------------------------------------
    # Employee Still Checked In
    # ------------------------------------------------------

    if current_in:

        attendance.append({

            "date": (
                current_in.time.strftime(
                    "%d %b %Y"
                )
            ),

            "check_in": (
                current_in.time.strftime(
                    "%I:%M %p"
                )
            ),

            "check_out": "--",

            "working_hours": "--"

        })

    attendance.reverse()

    return attendance[:7]


# ==========================================================
# NEW: Leave / Attendance Status Override
#
# The raw Employee Checkin log only tells us IN/OUT - it says
# nothing about leave, half day, or WFH, and it can go stale
# (e.g. an employee's last log stays "IN" for days if an auto
# checkout hasn't run yet). This is why the Associate Members
# dot used to show green for people who were actually on leave
# or simply hadn't checked in that day.
#
# This checks, for "today", in priority order:
#
#   1. An Approved Leave Application covering today
#      (half_day -> "Half Day", otherwise -> "On Leave")
#
#   2. A submitted Attendance record for today whose status is
#      On Leave / Half Day / Work From Home
#
# and returns a status/label override when either is found.
# Returns None when there's no override, so the caller falls
# back to the raw checkin log (normal present/checked-in flow).
# ==========================================================

def _get_employee_leave_override(
    employee,
    for_date=None
):

    for_date = (
        for_date
        or now_datetime().date()
    )

    # ------------------------------------------------------
    # 1. Approved Leave Application covering today
    # ------------------------------------------------------

    leave = frappe.get_all(
        "Leave Application",
        filters={
            "employee": employee,
            "status": "Approved",
            "docstatus": 1,
            "from_date": ["<=", for_date],
            "to_date": [">=", for_date]
        },
        fields=[
            "half_day",
            "leave_type"
        ],
        order_by="modified desc",
        limit=1
    )

    if leave:

        if leave[0].half_day:

            return {
                "status": "HALF_DAY",
                "label": "Half Day"
            }

        return {
            "status": "ON_LEAVE",
            "label": "On Leave"
        }

    # ------------------------------------------------------
    # 2. Submitted Attendance record for today
    # ------------------------------------------------------

    attendance_status = frappe.db.get_value(
        "Attendance",
        {
            "employee": employee,
            "attendance_date": for_date,
            "docstatus": 1
        },
        "status"
    )

    if attendance_status in (
        "On Leave",
        "Half Day",
        "Work From Home"
    ):

        return {
            "status": (
                attendance_status
                .upper()
                .replace(" ", "_")
            ),
            "label": attendance_status
        }

    # ------------------------------------------------------
    # No override - caller falls back to the checkin log
    # ------------------------------------------------------

    return None


# ==========================================================
# Simple Checkin Status Helper
#
# NOT the same as get_today_status() in employee_login.py.
#
# This is display-only and is used for:
#
#     Reporting Manager
#     Associate Members
#
# CHANGED: now checks for an approved leave / today's
# Attendance record FIRST via _get_employee_leave_override(),
# so someone on leave or half day shows correctly instead of
# whatever their last (possibly stale) checkin log happens to
# say. Only falls back to the raw checkin log when there's no
# leave/attendance override for today.
# ==========================================================

def _get_simple_checkin_status(
    employee
):

    today = now_datetime().date()

    # ------------------------------------------------------
    # 1. Check Leave / Attendance Override for TODAY
    # ------------------------------------------------------

    override = _get_employee_leave_override(
        employee,
        today
    )

    if override:

        return {
            "status": override["status"],
            "label": override["label"]
        }

    # ------------------------------------------------------
    # 2. Get ONLY today's latest Employee Checkin
    # ------------------------------------------------------

    today_logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": [
                "between",
                [
                    f"{today} 00:00:00",
                    f"{today} 23:59:59"
                ]
            ]
        },
        fields=[
            "log_type"
        ],
        order_by="time desc, creation desc",
        limit=1,
    )

    # ------------------------------------------------------
    # 3. No check-in today
    # ------------------------------------------------------

    if not today_logs:

        return {
            "status": "NOT_CHECKED_IN",
            "label": "Not Checked In"
        }

    # ------------------------------------------------------
    # 4. Latest check-in today
    # ------------------------------------------------------

    if today_logs[0].log_type == "IN":

        return {
            "status": "IN",
            "label": "In"
        }

    # ------------------------------------------------------
    # 5. Latest check-in today is OUT
    # ------------------------------------------------------

    return {
        "status": "OUT",
        "label": "Out"
    }

# ==========================================================
# Reporting Manager Status
# ==========================================================

@frappe.whitelist()
def get_reporting_manager_status(
    employee=None
):

    if not employee:

        frappe.throw(
            _("Employee is required.")
        )

    reports_to = frappe.db.get_value(
        "Employee",
        employee,
        "reports_to"
    )

    if not reports_to:
        return None

    manager = frappe.db.get_value(
        "Employee",
        reports_to,
        [
            "name",
            "employee_name",
            "designation"
        ],
        as_dict=True,
    )

    if not manager:
        return None

    status = _get_simple_checkin_status(
        manager.name
    )

    return {

        "name": manager.name,

        "employee_name": (
            manager.employee_name
        ),

        "designation": (
            manager.designation
        ),

        "status": (
            status["status"]
        ),

        "status_label": (
            status["label"]
        ),

    }


# ==========================================================
# Associate Members
# ==========================================================

@frappe.whitelist()
def get_associate_members(employee=None):

    if not employee:
        frappe.throw(
            _("Employee is required.")
        )

    # ------------------------------------------------------
    # Get the logged-in employee's Reporting Manager
    # ------------------------------------------------------

    reports_to = frappe.db.get_value(
        "Employee",
        employee,
        "reports_to"
    )

    # ------------------------------------------------------
    # No Reporting Manager
    # ------------------------------------------------------

    if not reports_to:
        return []

    # ------------------------------------------------------
    # Get all active employees who report to the same manager
    # ------------------------------------------------------

    members = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "reports_to": reports_to
        },
        fields=[
            "name",
            "employee_name",
            "designation"
        ],
        order_by="employee_name asc",
        limit_page_length=20
    )

    result = []

    for member in members:

        # --------------------------------------------------
        # Do not show the logged-in employee
        # --------------------------------------------------

        if member.name == employee:
            continue

        # --------------------------------------------------
        # Get today's status
        # --------------------------------------------------

        status = _get_simple_checkin_status(
            member.name
        )

        result.append({
            "name": member.name,
            "employee_name": member.employee_name,
            "designation": member.designation,
            "status": status.get("status"),
            "status_label": status.get("label")
        })

    return result
# ==========================================================
# Employee Holiday Details
# ==========================================================

@frappe.whitelist()
def get_employee_holiday_details(
    employee=None
):

    if not employee:

        frappe.throw(
            _("Employee is required.")
        )

    # ------------------------------------------------------
    # Employee -> Default Shift
    # ------------------------------------------------------

    default_shift = frappe.db.get_value(
        "Employee",
        employee,
        "default_shift"
    )

    if not default_shift:

        return {
            "default_shift": None,
            "holiday_list": None,
            "holidays": []
        }

    # ------------------------------------------------------
    # Default Shift -> Shift Type -> Holiday List
    # ------------------------------------------------------

    holiday_list = frappe.db.get_value(
        "Shift Type",
        default_shift,
        "holiday_list"
    )

    if not holiday_list:

        return {
            "default_shift": default_shift,
            "holiday_list": None,
            "holidays": []
        }

    # ------------------------------------------------------
    # Holiday List -> Holiday
    #
    # ORM only - NO SQL
    # ------------------------------------------------------

    holidays = frappe.get_all(
        "Holiday",
        filters={
            "parent": holiday_list,
            "weekly_off": 0
        },
        fields=[
            "parent as holiday_list",
            "holiday_date",
            "description",
            "custom_status"
        ],
        order_by="holiday_date asc"
    )

    return {
        "default_shift": default_shift,
        "holiday_list": holiday_list,
        "holidays": holidays
    }