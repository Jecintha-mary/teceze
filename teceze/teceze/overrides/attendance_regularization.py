import frappe
from frappe import _
from frappe.utils import add_days, date_diff, format_date, getdate
from hrms.hr.doctype.attendance_request.attendance_request import AttendanceRequest

@frappe.whitelist()
def get_existing_checkins(employee, from_date):

    logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": [
                "between",
                [
                    from_date + " 00:00:00",
                    from_date + " 23:59:59"
                ]
            ]
        },
        fields=[
            "log_type",
            "time"
        ],
        order_by="time asc"
    )

    check_in = ""
    check_out = ""

    for log in logs:

        if log.log_type == "IN" and not check_in:
            check_in = log.time

        elif log.log_type == "OUT":
            check_out = log.time

    return {
        "existing_check_in": check_in,
        "existing_check_out": check_out
    }


# ==========================================================
# Attendance Request Validation
# ==========================================================

def validate(doc, method):

    if not doc.employee:
        frappe.throw(_("Employee is required."))

    if not doc.from_date:
        frappe.throw(_("From Date is required."))

    if doc.to_date and doc.from_date != doc.to_date:
        frappe.throw(_("Only one day can be regularized in a request."))

    if not doc.custom_correct_check_in and not doc.custom_correct_check_out:
        frappe.throw(_("Enter Correct Check In or Correct Check Out."))

    if not doc.reason:
        frappe.throw(_("Reason is mandatory."))

    # Correct IN should be after midnight of selected day
    if (
        doc.custom_correct_check_in
        and doc.custom_correct_check_in.date() != doc.from_date
    ):
        frappe.throw(_("Correct Check In must belong to the selected date."))

    # Correct OUT should be after Correct IN
    if (
        doc.custom_correct_check_in
        and doc.custom_correct_check_out
        and doc.custom_correct_check_out <= doc.custom_correct_check_in
    ):
        frappe.throw(_("Correct Check Out must be later than Correct Check In."))
def before_save(doc, method):

    if not doc.employee:
        return

    reporting_manager = frappe.db.get_value(
        "Employee",
        doc.employee,
        "custom_reporting_manager"
    )

    doc.custom_reporting_manager = reporting_manager
from erpnext.setup.doctype.holiday_list.holiday_list import (
    is_holiday as is_holiday_in_list,
)
from erpnext.setup.doctype.employee.employee import is_holiday

class CustomAttendanceRequest(AttendanceRequest):

    def get_shift_for_date(self, attendance_date):
        """Get the employee's Shift Type applicable on a specific date."""
        attendance_date = getdate(attendance_date)

        assignments = frappe.get_all(
            "Shift Assignment",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "start_date": ["<=", attendance_date],
            },
            fields=["shift_type", "start_date", "end_date"],
            order_by="start_date desc",
        )

        for assignment in assignments:
            start_date = (getdate(assignment.start_date)
            if assignment.start_date
            else None
            )
            end_date = (getdate(assignment.end_date)
            if assignment.end_date
            else None
            )
            if (start_date and start_date <= attendance_date and (not end_date or end_date >= attendance_date)):
                return assignment.shift_type

        # Fallback when no applicable Shift Assignment exists.
        return self.shift

    def is_shift_holiday(self, attendance_date):
        """Check the holiday list for the shift applicable on this date."""

        shift_type = self.get_shift_for_date(attendance_date)

        if shift_type:
            holiday_list = frappe.db.get_value("Shift Type",shift_type,"holiday_list",)

            if holiday_list:
                return is_holiday_in_list(holiday_list, attendance_date)

        return is_holiday(self.employee, attendance_date)

    def should_mark_attendance(self, attendance_date):
        if (
            not self.include_holidays
            and self.is_shift_holiday(attendance_date)
        ):
            frappe.msgprint(
                _("Attendance not submitted for {0} as it is a Holiday.").format(
                    frappe.bold(format_date(attendance_date))
                )
            )
            return False

        if self.has_leave_record(attendance_date):
            frappe.msgprint(
                _("Attendance not submitted for {0} as {1} is on leave.").format(
                    frappe.bold(format_date(attendance_date)),
                    frappe.bold(self.employee),
                )
            )
            return False

        return True

    @frappe.whitelist()
    def get_attendance_warnings(self):
        attendance_warnings = []
        request_days = date_diff(self.to_date, self.from_date) + 1

        for day in range(request_days):
            attendance_date = add_days(self.from_date, day)

            if (
                not self.include_holidays
                and self.is_shift_holiday(attendance_date)
            ):
                attendance_warnings.append({
                    "date": attendance_date,
                    "reason": "Holiday",
                    "action": "Skip",
                })

            elif self.has_leave_record(attendance_date):
                attendance_warnings.append({
                    "date": attendance_date,
                    "reason": "On Leave",
                    "action": "Skip",
                })

            elif self.status_unchanged(attendance_date):
                attendance_warnings.append({
                    "date": attendance_date,
                    "reason": "Attendance status unchanged",
                    "action": "Skip",
                })

            else:
                attendance = self.get_attendance_doc(attendance_date)

                if attendance:
                    attendance_warnings.append({
                        "date": attendance_date,
                        "reason": "Attendance already marked",
                        "record": attendance.name,
                        "action": "Overwrite",
                    })

        return attendance_warnings
