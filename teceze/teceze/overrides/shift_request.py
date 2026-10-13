
import frappe
from frappe.utils import add_days, getdate


def validate_overlapping_shift_assignments(doc):
    try:
        request_start = getdate(doc.from_date)
        request_end = (
            getdate(doc.to_date)
            if doc.to_date
            else request_start
        )

        assignments = frappe.get_all(
            "Shift Assignment",
            filters={
                "employee": doc.employee,
                "docstatus": 1,
                "start_date": ["<=", request_end],
            },
            or_filters=[
                {"end_date": [">=", request_start]},
                {"end_date": ["is", "not set"]},
            ],
            fields=[
                "name",
                "shift_type",
                "start_date",
                "end_date",
            ],
        )

        overlapping = []

        for assignment in assignments:
            existing_start = getdate(assignment.start_date)

            if assignment.end_date:
                existing_end = getdate(assignment.end_date)

                if (
                    request_start <= existing_end
                    and request_end >= existing_start
                ):
                    overlapping.append(assignment)

            elif request_start <= existing_start:
                overlapping.append(assignment)

        if overlapping:
            details = "\n".join(
                f"{row.name} | {row.shift_type} | "
                f"{row.start_date} to "
                f"{row.end_date or 'No end date'}"
                for row in overlapping
            )

            frappe.throw(
                "Cannot approve this Shift Request because an "
                "existing Shift Assignment overlaps:\n"
                f"{details}"
            )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Overlap Validation Failed",
        )
        raise

def before_submit(doc, method=None):
    try:
        if doc.status != "Approved":
            return

        # Check overlaps before changing any existing assignment.
        validate_overlapping_shift_assignments(doc)

        previous_date = add_days(getdate(doc.from_date), -1)

        shifts = frappe.get_all(
            "Shift Assignment",
            filters={
                "employee": doc.employee,
                "docstatus": 1,
                "status": "Active",
                "start_date": ["<=", previous_date],
            },
            or_filters=[
                {"end_date": [">=", previous_date]},
                {"end_date": ["is", "not set"]},
            ],
            fields=[
                "name",
                "start_date",
                "end_date",
            ],
            order_by="start_date desc",
            limit_page_length=2,
        )

        if not shifts:
            frappe.throw(
                f"No active Shift Assignment found for "
                f"{doc.employee} on {previous_date}."
            )

        if len(shifts) > 1:
            frappe.throw(
                f"Multiple active Shift Assignments found for "
                f"{doc.employee} on {previous_date}. "
                "Resolve the issue first."
            )

        shift = shifts[0]

        # Back up the old assignment and its end date.
        doc.custom_pre_shift_assignment = shift.name
        doc.custom_pre_shift_end_date = shift.end_date

        previous_default_shift = frappe.db.get_value(
            "Employee",
            doc.employee,
            "default_shift",
        )

        if not previous_default_shift:
            frappe.throw(
                f"No Default Shift configured for {doc.employee}."
            )

        doc.custom_pre_default_shift = previous_default_shift
        doc.custom_backup_completed = 1

        # Change the end date only if it is NULL.
        if not shift.end_date:
            frappe.db.set_value(
                "Shift Assignment",
                shift.name,
                "end_date",
                previous_date,
            )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Backup or Validation Failed",
        )
        raise

def on_submit(doc, method=None):
    try:
        if doc.status != "Approved":
            return

        if not doc.custom_backup_completed:
            frappe.throw(
                "Previous shift details were not backed up."
            )

        if not frappe.db.exists("Employee", doc.employee):
            frappe.throw(f"Employee {doc.employee} does not exist.")

        if not frappe.db.exists("Shift Type", doc.shift_type):
            frappe.throw(f"Shift Type {doc.shift_type} does not exist.")

        frappe.flags.shift_request_update = True

        frappe.db.set_value(
            "Employee",
            doc.employee,
            "default_shift",
            doc.shift_type,
        )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Approval Update Failed",
        )
        raise

    finally:
        frappe.flags.shift_request_update = False

def on_cancel(doc, method=None):
    try:
        if not doc.custom_backup_completed:
            frappe.throw(
                "Cannot cancel: previous details were not backed up."
            )

        previous_shift = doc.custom_pre_shift_assignment
        previous_default_shift = doc.custom_pre_default_shift

        if not previous_shift:
            frappe.throw("Previous Shift Assignment is missing.")

        if not frappe.db.exists("Shift Assignment", previous_shift):
            frappe.throw(
                f"Shift Assignment {previous_shift} does not exist."
            )

        if not previous_default_shift:
            frappe.throw("Previous Default Shift is missing.")

        if not frappe.db.exists("Shift Type", previous_default_shift):
            frappe.throw(
                f"Shift Type {previous_default_shift} does not exist."
            )

        frappe.flags.shift_request_update = True

        # Restore the original end date, including NULL.
        frappe.db.set_value(
            "Shift Assignment",
            previous_shift,
            "end_date",
            doc.custom_pre_shift_end_date,
        )

        frappe.db.set_value(
            "Employee",
            doc.employee,
            "default_shift",
            previous_default_shift,
        )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Cancellation Restore Failed",
        )
        raise

    finally:
        frappe.flags.shift_request_update = False
