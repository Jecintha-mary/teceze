
import frappe
from frappe.utils import getdate, add_days, today


def mark_absent_for_rh():

    # Previous date
    attendance_date = getdate(add_days(today(), -1))
    # attendance_date = frappe.utils.getdate("2026-09-14")
    # Active employees, excluding Engineer
    employees = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "employment_type": ["!=", "Engineer"]
        },
        fields=[
            "name",
            "employee_name",
            "default_shift",
            "date_of_joining"
        ]
    )

    for employee in employees:

        employee_id = employee.name

        # Employee must have Date of Joining
        if not employee.date_of_joining:
            continue

        # Skip dates before employee joining date
        if attendance_date < getdate(employee.date_of_joining):
            continue

        # Employee shift
        shift_type = employee.default_shift

        if not shift_type:
            continue

        # Holiday List from Shift Type
        holiday_list = frappe.db.get_value(
            "Shift Type",
            shift_type,
            "holiday_list"
        )

        if not holiday_list:
            continue

        # Check RH holiday
        rh_holiday = frappe.db.exists(
            "Holiday",
            {
                "parent": holiday_list,
                "holiday_date": attendance_date,
                "custom_status": "RH"
            }
        )

        if not rh_holiday:
            continue

        # Check approved Restricted Leave
        rh_leave = frappe.db.exists(
            "Leave Application",
            {
                "employee": employee_id,
                "from_date": ["<=", attendance_date],
                "to_date": [">=", attendance_date],
                "status": "Approved",
                "leave_type": "Restricted Leave"
            }
        )

        # Employee has approved RH Leave
        if rh_leave:
            continue

        # Check existing Attendance
        existing_attendance = frappe.db.exists(
            "Attendance",
            {
                "employee": employee_id,
                "attendance_date": attendance_date
            }
        )

        if existing_attendance:
            continue

        # Create Absent Attendance
        attendance = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee_id,
            "attendance_date": attendance_date,
            "status": "Absent"
        })

        attendance.insert(ignore_permissions=True)
        attendance.submit()

        frappe.logger().info(
            f"RH Absent created for {employee_id} on {attendance_date}"
        )

    frappe.db.commit()


def update_last_sync_of_checkin():
    settings = frappe.get_single("Teceze Settings")

    if not settings.shift:
        return

    sync_datetime = f"{today()} 01:00:00"
    frappe.log_error("settings.shift",str(settings.shift))
    for row in settings.shift:
        shift_type = row.shift

        if shift_type and frappe.db.exists("Shift Type", shift_type):
            frappe.db.set_value(
                "Shift Type",
                shift_type,
                "last_sync_of_checkin",
                sync_datetime
            )