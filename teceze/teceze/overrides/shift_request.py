
import frappe
from frappe.utils import add_days, getdate, today
from hrms.hr.doctype.shift_request.shift_request import ShiftRequest

def validate(doc, method=None):
    """Synchronize status with workflow state."""
    if doc.workflow_state == "Approved":
        doc.status = "Approved"
    elif doc.workflow_state == "Rejected":
        doc.status = "Rejected"
    if (doc.workflow_state == "Approved" or doc.workflow_state == "Rejected"):
        if doc.from_date and getdate(doc.from_date) < getdate(today()):
            frappe.throw("Approval, rejection, or cancellation is not allowed for records with past dates. Please review the record date before proceeding!")

def get_previous_shift_assignment(doc, previous_date):
    """Find the Shift Assignment covering the previous date."""

    shifts = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": doc.employee,
            "docstatus": 1,
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
            "shift_type",
        ],
        order_by="start_date desc",
    )

    if len(shifts) > 1:
        frappe.throw(
            f"Multiple submitted Shift Assignments cover "
            f"{previous_date} for employee {doc.employee}. "
            "Please resolve the duplicate assignments first."
        )

    return shifts[0] if shifts else None


def get_previous_holiday_assignment(doc, previous_date):
    """Find the Holiday List Assignment covering the previous date."""

    assignments = frappe.get_all(
        "Holiday List Assignment",
        filters={
            "applicable_for": "Employee",
            "assigned_to": doc.employee,
            "docstatus": 1,
            "from_date": ["<=", previous_date],
        },
        or_filters=[
            {"custom_to_date": [">=", previous_date]},
            {"custom_to_date": ["is", "not set"]},
        ],
        fields=[
            "name",
            "holiday_list",
            "from_date",
            "custom_to_date",
        ],
        order_by="from_date desc",
    )

    if len(assignments) > 1:
        frappe.throw(
            f"Multiple submitted Holiday List Assignments cover "
            f"{previous_date} for employee {doc.employee}. "
            "Please resolve the overlapping assignments first."
        )

    return assignments[0] if assignments else None


def validate_overlapping_shift_assignments(
    doc, exclude_assignment=None
):
    """Reject submitted Shift Assignments overlapping request dates."""

    request_start = getdate(doc.from_date)
    request_end = getdate(doc.to_date or doc.from_date)

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
        if assignment.name == exclude_assignment:
            continue

        existing_start = getdate(assignment.start_date)

        if assignment.end_date:
            existing_end = getdate(assignment.end_date)

            if (
                existing_start <= request_end
                and existing_end >= request_start
            ):
                overlapping.append(assignment)

        elif existing_start <= request_end:
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
            "existing Shift Assignment overlaps the requested dates:\n"
            f"{details}"
        )


def validate_overlapping_holiday_assignments(
    doc, exclude_assignment=None
):
    """Reject submitted Holiday List Assignments overlapping request dates."""

    request_start = getdate(doc.from_date)
    request_end = getdate(doc.to_date or doc.from_date)

    assignments = frappe.get_all(
        "Holiday List Assignment",
        filters={
            "applicable_for": "Employee",
            "assigned_to": doc.employee,
            "docstatus": 1,
            "from_date": ["<=", request_end],
        },
        or_filters=[
            {"custom_to_date": [">=", request_start]},
            {"custom_to_date": ["is", "not set"]},
        ],
        fields=[
            "name",
            "holiday_list",
            "from_date",
            "custom_to_date",
        ],
    )

    overlapping = [
        assignment
        for assignment in assignments
        if assignment.name != exclude_assignment
    ]

    if overlapping:
        details = "\n".join(
            f"{row.name} | {row.holiday_list} | "
            f"{row.from_date} to "
            f"{row.custom_to_date or 'No end date'}"
            for row in overlapping
        )

        frappe.throw(
            "Cannot approve this Shift Request because an "
            "existing Holiday List Assignment overlaps the "
            "requested dates:\n"
            f"{details}"
        )


def before_submit(doc, method=None):
    """Validate overlaps and close previous open-ended assignments."""

    try:
        if doc.status != "Approved":
            return

        previous_date = add_days(getdate(doc.from_date), -1)

        # Reset previous assignment backup fields.
        doc.custom_pre_shift_assignment = None
        doc.custom_pre_shift_end_date = None

        doc.custom_pre_holiday__assignment = None
        doc.custom_pre_holiday_list = None
        doc.custom_pre_holiday_end_date = None

        # Find the previous Shift Assignment.
        previous_shift = get_previous_shift_assignment(
            doc, previous_date
        )

        if previous_shift:
            doc.custom_pre_shift_assignment = previous_shift.name
            doc.custom_pre_shift_end_date = previous_shift.end_date

        # Find the previous Holiday List Assignment.
        previous_holiday = get_previous_holiday_assignment(
            doc, previous_date
        )

        exclude_shift = None
        exclude_holiday = None

        # Back up only an open-ended Shift Assignment.
        if previous_shift and not previous_shift.end_date:
            exclude_shift = previous_shift.name

        # Back up only an open-ended Holiday List Assignment.
        if previous_holiday and not previous_holiday.custom_to_date:
            exclude_holiday = previous_holiday.name

            doc.custom_pre_holiday__assignment = previous_holiday.name
            doc.custom_pre_holiday_list = previous_holiday.holiday_list
            doc.custom_pre_holiday_end_date = None

        # Validate both assignment types before changing existing records.
        validate_overlapping_shift_assignments(
            doc,
            exclude_assignment=exclude_shift,
        )

        validate_overlapping_holiday_assignments(
            doc,
            exclude_assignment=exclude_holiday,
        )

        # Close the previous Shift Assignment only when it is open-ended.
        if exclude_shift:
            frappe.db.set_value(
                "Shift Assignment",
                exclude_shift,
                "end_date",
                previous_date,
            )

        # Close the previous Holiday List Assignment only when open-ended.
        if exclude_holiday:
            frappe.db.set_value(
                "Holiday List Assignment",
                exclude_holiday,
                "custom_to_date",
                previous_date,
            )

        # No previous Holiday List Assignment is required.
        # Existing assignments with end dates remain unchanged.
        doc.custom_backup_completed = 1

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Backup or Validation Failed",
        )
        raise


def on_submit(doc, method=None):
    """Create the Holiday List Assignment for the requested shift."""

    try:
        if doc.status != "Approved":
            return

        if not doc.custom_backup_completed:
            frappe.throw(
                "Assignment validation was not completed."
            )

        if not frappe.db.exists("Employee", doc.employee):
            frappe.throw(
                f"Employee {doc.employee} does not exist."
            )

        if not frappe.db.exists("Shift Type", doc.shift_type):
            frappe.throw(
                f"Shift Type {doc.shift_type} does not exist."
            )

        # Get the Holiday List configured in the requested Shift Type.
        holiday_list = frappe.db.get_value(
            "Shift Type",
            doc.shift_type,
            "holiday_list",
        )

        if not holiday_list:
            frappe.throw(
                f"No Holiday List is configured for Shift Type "
                f"{doc.shift_type}."
            )

        # Prevent duplicate creation if this hook is invoked again.
        existing_new_assignment = doc.get(
            "custom_new_holiday_assignment"
        )

        if existing_new_assignment and frappe.db.exists(
            "Holiday List Assignment",
            existing_new_assignment,
        ):
            return

        # Create the new Holiday List Assignment.
        new_holiday_assignment = frappe.get_doc({
            "doctype": "Holiday List Assignment",
            "applicable_for": "Employee",
            "assigned_to": doc.employee,
            "holiday_list": holiday_list,
            "from_date": doc.from_date,
            "custom_to_date": doc.to_date or None,
        })

        new_holiday_assignment.insert()
        new_holiday_assignment.submit()

        # Store the new assignment reference on the Shift Request.
        doc.db_set(
            "custom_new_holiday_assignment",
            new_holiday_assignment.name,
        )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Holiday List Assignment Creation Failed",
        )
        raise


def on_cancel(doc, method=None):
    """Cancel the new HLA and restore only assignments changed by this request."""

    try:
        if not doc.custom_backup_completed:
            frappe.throw(
                "Cannot cancel: assignment validation was not completed."
            )

        previous_shift = doc.custom_pre_shift_assignment
        previous_holiday_assignment = (
            doc.custom_pre_holiday__assignment
        )
        new_holiday_assignment = doc.custom_new_holiday_assignment

        # Restore the previous Shift Assignment if it was backed up.
        if previous_shift:
            if not frappe.db.exists(
                "Shift Assignment",
                previous_shift,
            ):
                frappe.throw(
                    f"Previous Shift Assignment {previous_shift} "
                    "does not exist."
                )

            frappe.db.set_value(
                "Shift Assignment",
                previous_shift,
                "end_date",
                doc.custom_pre_shift_end_date,
            )

        # Restore the previous HLA only if this request closed it.
        if previous_holiday_assignment:
            if not frappe.db.exists(
                "Holiday List Assignment",
                previous_holiday_assignment,
            ):
                frappe.throw(
                    f"Previous Holiday List Assignment "
                    f"{previous_holiday_assignment} does not exist."
                )

            frappe.db.set_value(
                "Holiday List Assignment",
                previous_holiday_assignment,
                {
                    "holiday_list": doc.custom_pre_holiday_list,
                    "custom_to_date": doc.custom_pre_holiday_end_date,
                },
            )

        # Cancel the new HLA created by this request.
        if new_holiday_assignment:
            if frappe.db.exists(
                "Holiday List Assignment",
                new_holiday_assignment,
            ):
                new_doc = frappe.get_doc(
                    "Holiday List Assignment",
                    new_holiday_assignment,
                )

                if new_doc.docstatus == 1:
                    new_doc.cancel()

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Shift Request: Cancellation Restore Failed",
        )
        raise


class CustomShiftRequest(ShiftRequest):
    """Exclude rejected and cancelled requests from overlap checking."""

    def get_overlapping_dates(self):
        if not self.name:
            self.name = "New Shift Request"

        shift = frappe.qb.DocType("Shift Request")

        query = (
            frappe.qb.from_(shift)
            .select(
                shift.name,
                shift.shift_type,
            )
            .where(
                (shift.employee == self.employee)
                & (shift.docstatus < 2)
                & (shift.name != self.name)
                & (
                    shift.workflow_state.isnull()
                    | (
                        (shift.workflow_state != "Rejected")
                        & (shift.workflow_state != "Cancelled")
                    )
                )
                & (
                    (shift.to_date >= self.from_date)
                    | (shift.to_date.isnull())
                )
            )
        )

        if self.to_date:
            query = query.where(
                shift.from_date <= self.to_date
            )

        return query.run(as_dict=True)
