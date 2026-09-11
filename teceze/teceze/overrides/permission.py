import frappe
from datetime import datetime, date, timedelta
from frappe.utils import flt


scheduler_date = frappe.get_doc("Teceze Settings")

company = frappe.db.get_value("Global Defaults", None, "default_company")

# =========================================================
# Permission Auto Attendance
# =========================================================
@frappe.whitelist()
def attendance_for_permission(doc=None, method=None):

    try:
        if doc:
            # Process only this permission request
            end_date = doc.permission_on
            employee = doc.employee
        else:
            today = date.today()
            end_date = today - timedelta(days=1)
            employee = None


        # -------------------------------------------------
        # Process attendance from configured date
        # -------------------------------------------------

        if not doc and scheduler_date.process_auto_attendance_after:
            end_date = scheduler_date.process_auto_attendance_after

        # -------------------------------------------------
        # Get Approved Permission Requests + Checkins
        # -------------------------------------------------

        if doc:

            # -------------------------------------------------
            # Workflow Approval
            # ONLY this employee + this permission date
            # -------------------------------------------------

            perm_data = frappe.db.sql(
                """
                SELECT
                    p.name AS permission_request,
                    p.employee,
                    p.employee_name,
                    p.from_time,
                    p.to_time,
                    TIMEDIFF(p.to_time, p.from_time) AS hrs,
                    c.*
                FROM `tabEmployee Permission Request` p
                INNER JOIN `tabEmployee Checkin` c
                    ON c.employee = p.employee
                    AND DATE(p.permission_on) = DATE(c.time)
                WHERE p.permission_on = %s
                    AND p.employee = %s
                    AND p.name = %s
                    AND p.status = 'Approved'
                """,
                (
                    end_date,
                    employee,
                    doc.name
                ),
                as_dict=True
            )

        else:

            # -------------------------------------------------
            # Existing Scheduler / Batch Logic
            # -------------------------------------------------

            perm_data = frappe.db.sql(
                """
                SELECT
                    p.name AS permission_request,
                    p.employee,
                    p.employee_name,
                    p.from_time,
                    p.to_time,
                    TIMEDIFF(p.to_time, p.from_time) AS hrs,
                    c.*
                FROM `tabEmployee Permission Request` p
                INNER JOIN `tabEmployee Checkin` c
                    ON c.employee = p.employee
                    AND DATE(p.permission_on) = DATE(c.time)
                WHERE p.permission_on = %s
                    AND p.docstatus = 1
                    AND p.status = 'Approved'
                """,
                (end_date,),
                as_dict=True
            )

        if not perm_data:
            return

        # -------------------------------------------------
        # Group records employee-wise
        # -------------------------------------------------

        employee_checkins = {}

        for record in perm_data:

            employee_checkins.setdefault(
                record.employee,
                []
            ).append(record)

        # -------------------------------------------------
        # Process each employee
        # -------------------------------------------------

        for employee, checkins in employee_checkins.items():

            if not checkins:
                continue

            # -------------------------------------------------
            # Get Employee Shift Details
            # -------------------------------------------------

            shift_details = get_shift_timings(employee)

            if not shift_details:

                frappe.log_error(
                    title="Shift Not Found",
                    message=(
                        f"Default shift not found for Employee: "
                        f"{employee}"
                    )
                )

                continue

            (
                start_time,
                end_time,
                shift_name,
                check_in_out_type,
                work_hrs_cal,
                threshold_hrs,
                threshold_absent_hrs
            ) = shift_details

            # -------------------------------------------------
            # Filter Checkins Based On Employee Shift
            # -------------------------------------------------

            valid_checkins = []

            for checkin in checkins:

                checkin_time = checkin.time

                if isinstance(checkin_time, str):

                    try:
                        checkin_time = datetime.fromisoformat(
                            checkin_time
                        )

                    except Exception:

                        checkin_time = datetime.strptime(
                            checkin_time,
                            "%Y-%m-%d %H:%M:%S"
                        )

                checkin_only_time = checkin_time.time()

                if (
                    start_time.time()
                    <= checkin_only_time
                    <= end_time.time()
                ):

                    valid_checkins.append(checkin)

            if not valid_checkins:
                continue

            # -------------------------------------------------
            # Calculate Permission Hours
            # -------------------------------------------------

            permission_hours = calculate_working_hrs(
                checkins[0].from_time,
                checkins[0].to_time
            )

            # -------------------------------------------------
            # Calculate Employee Check-in Working Hours
            # -------------------------------------------------

            in_time = valid_checkins[0].time
            out_time = valid_checkins[-1].time

            working_hrs = calculate_working_hrs(
                str(in_time).split(" ")[1],
                str(out_time).split(" ")[1]
            )

            if not in_time or not out_time:
                continue

            # -------------------------------------------------
            # Get Attendance Date
            # -------------------------------------------------

            dateobj = str(in_time).split(" ")[0]

            working_hrs = flt(working_hrs)

            permission_hours = flt(permission_hours)

            # -------------------------------------------------
            # Calculate Total Hours
            # -------------------------------------------------

            total_value = working_hrs

            if threshold_hrs >= working_hrs:

                total_value += permission_hours

            total_value = flt(total_value)

            # -------------------------------------------------
            # Determine Attendance Status
            # -------------------------------------------------

            att_status = None

            if threshold_hrs:

                # ---------------------------------------------
                # Present
                # ---------------------------------------------

                if total_value >= threshold_hrs:

                    att_status = "Present"

                # ---------------------------------------------
                # Half Day
                # ---------------------------------------------

                elif (
                    total_value < threshold_hrs
                    and total_value > threshold_absent_hrs
                ):

                    att_status = "Half Day"

                # ---------------------------------------------
                # Absent
                # ---------------------------------------------

                elif (
                    threshold_absent_hrs
                    and total_value <= threshold_absent_hrs
                ):

                    att_status = "Absent"

            # -------------------------------------------------
            # Update Attendance
            # -------------------------------------------------

            if att_status:

                # Cancel existing Absent / Half Day
                cancel_old_attendance(
                    employee=employee,
                    attendance_date=dateobj
                )

                # Insert new Attendance
                insert_attendance(
                    employee=employee,
                    total_value=total_value,
                    company=company,
                    dateobj=dateobj,
                    emp_name=checkins[0].permission_request,
                    working_hrs=working_hrs,
                    permission_hours=permission_hours,
                    att_status=att_status,
                    shift_name=shift_name
                )

    except Exception:

        frappe.log_error(
            title="Error in Attendance for Permission",
            message=frappe.get_traceback()
        )
# =========================================================
# Cancel Existing Absent / Half Day Attendance
# =========================================================

def cancel_old_attendance(
    employee,
    attendance_date
):

    try:

        frappe.db.sql(
            """
            UPDATE `tabAttendance`
            SET docstatus = 2
            WHERE attendance_date = %s
                AND employee = %s
                AND status IN ('Absent', 'Half Day')
                AND docstatus != 2
                AND (
                    custom_permission_request IS NULL
                    OR custom_permission_request = ''
                )
            """,
            (
                attendance_date,
                employee
            )
        )

        frappe.db.commit()

    except Exception:

        frappe.log_error(
            title="Error Cancelling Old Attendance",
            message=frappe.get_traceback()
        )


# =========================================================
# Insert Attendance
# =========================================================

def insert_attendance(
    employee,
    total_value,
    company,
    dateobj,
    emp_name,
    working_hrs,
    permission_hours,
    att_status,
    shift_name
):

    try:

        # -------------------------------------------------
        # Check Existing Attendance
        # -------------------------------------------------

        existing_attendance = frappe.db.sql(
            """
            SELECT name
            FROM `tabAttendance`
            WHERE attendance_date = %s
                AND employee = %s
                AND docstatus != 2
                AND (
                    status IN (
                        'Present',
                        'Work From Home',
                        'On Leave'
                    )
                    OR (
                        custom_permission_request IS NOT NULL
                        AND custom_permission_request != ''
                    )
                )
            """,
            (
                dateobj,
                employee
            )
        )

        if existing_attendance:
            return

        # -------------------------------------------------
        # Create Attendance
        # -------------------------------------------------

        attendance = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee,
            "working_hours": flt(total_value),
            "company": company,
            "shift": shift_name,
            "attendance_date": dateobj,
            "status": att_status,
            "custom_permission_request": emp_name
        })

        attendance.flags.ignore_validate = True

        attendance.insert(
            ignore_permissions=True
        )

        attendance.submit()

        # -------------------------------------------------
        # Add Comment
        # -------------------------------------------------

        attendance.add_comment(
            text=(
                "AAS#: Checkin Working Hours: "
                + str(round(working_hrs, 2))
                + " and Permission Hours: "
                + str(round(permission_hours, 2))
                + " and Total Hours: "
                + str(round(total_value, 2))
            )
        )

        # -------------------------------------------------
        # Get Cancelled Old Attendance
        # -------------------------------------------------

        old_data = frappe.db.sql(
            """
            SELECT name
            FROM `tabAttendance`
            WHERE attendance_date = %s
                AND employee = %s
                AND docstatus = 2
                AND status IN ('Absent', 'Half Day')
                AND (
                    custom_permission_request IS NULL
                    OR custom_permission_request = ''
                )
            """,
            (
                dateobj,
                employee
            ),
            as_dict=True
        )

        # -------------------------------------------------
        # Add Cancellation Comment
        # -------------------------------------------------

        for old_attendance in old_data:

            old_doc = frappe.get_doc(
                "Attendance",
                old_attendance.name
            )

            old_doc.add_comment(
                text=(
                    "AAS#: Cancelled for considering "
                    "Permission Request."
                )
            )

    except Exception:

        frappe.log_error(
            title="Error in Auto Attendance",
            message=frappe.get_traceback()
        )


# =========================================================
# Get Employee Shift Timings
# =========================================================

@frappe.whitelist()
def get_shift_timings(employee):

    # Get employee default shift
    default_shift = frappe.db.get_value(
        "Employee",
        employee,
        "default_shift"
    )

    if not default_shift:
        return None

    # Get all required Shift Type values
    shift = frappe.db.get_value(
        "Shift Type",
        default_shift,
        [
            "name",
            "start_time",
            "end_time",
            "begin_check_in_before_shift_start_time",
            "allow_check_out_after_shift_end_time",
            "determine_check_in_and_check_out",
            "working_hours_calculation_based_on",
            "working_hours_threshold_for_half_day",
            "working_hours_threshold_for_absent"
        ],
        as_dict=True
    )

    if not shift:
        return None

    begin_check_in_before_shift_start_time = flt(
        shift.begin_check_in_before_shift_start_time
    )

    allow_check_out_after_shift_end_time = flt(
        shift.allow_check_out_after_shift_end_time
    )

    start_time = datetime.strptime(
        str(shift.start_time),
        "%H:%M:%S"
    )

    start_time -= timedelta(
        minutes=begin_check_in_before_shift_start_time
    )

    end_time = datetime.strptime(
        str(shift.end_time),
        "%H:%M:%S"
    )

    end_time += timedelta(
        minutes=allow_check_out_after_shift_end_time
    )

    return (
        start_time,
        end_time,
        shift.name,
        shift.determine_check_in_and_check_out,
        shift.working_hours_calculation_based_on,
        flt(shift.working_hours_threshold_for_half_day),
        flt(shift.working_hours_threshold_for_absent)
    )
# =========================================================
# Calculate Permission Working Hours
# =========================================================

@frappe.whitelist()
def calculate_working_hrs(
    start_time,
    end_time
):

    start_time = datetime.strptime(
        str(start_time),
        "%H:%M:%S"
    )

    end_time = datetime.strptime(
        str(end_time),
        "%H:%M:%S"
    )

    delta = end_time - start_time

    return delta.total_seconds() / 3600
