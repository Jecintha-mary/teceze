import frappe
from frappe.model.document import Document
from frappe.utils import getdate, add_days
from collections import defaultdict

def validate(doc,method):
    if doc.workflow_state == "Approved":
        doc.status = "Approved"

    elif doc.workflow_state == "Rejected":
        doc.status = "Rejected"

    employment_type = frappe.db.get_value("Employee",doc.employee,"employment_type")

    # Apply probation validation for probation employees
    if employment_type == "Probation":
        validate_probation_leave(doc)
    # Only validate Restricted Leave
    if doc.leave_type != "Restricted Leave":
        return

    if not doc.employee:
        return

    if not doc.from_date:
        return

    # ---------------------------------------------------------
    # Get Employee Shift Type
    # ---------------------------------------------------------

    shift_type = frappe.db.get_value(
        "Employee",
        doc.employee,
        "default_shift"
    )

    if not shift_type:
        frappe.throw(
            "No Shift Type is assigned to this employee."
        )

    # ---------------------------------------------------------
    # Get Holiday List from Shift Type
    # ---------------------------------------------------------

    holiday_list = frappe.db.get_value(
        "Shift Type",
        shift_type,
        "holiday_list"
    )

    if not holiday_list:
        frappe.throw(
            f"No Holiday List is configured for Shift Type "
            f"{shift_type}."
        )

    # ---------------------------------------------------------
    # Validate each leave date
    # ---------------------------------------------------------

    from_date = getdate(doc.from_date)
    to_date = getdate(doc.to_date or doc.from_date)

    current_date = from_date
    while current_date <= to_date:
        current_date_str = current_date.strftime("%Y-%m-%d")
        holiday = frappe.db.sql("""SELECT name FROM `tabHoliday`WHERE parent = %s AND holiday_date = %s AND custom_status = 'RH'LIMIT 1""", (holiday_list,current_date_str), as_dict=True)
        if not holiday:
            frappe.throw(
                f"{current_date.strftime('%d-%m-%Y')} is not a "
                f"Restricted Holiday for you.")

        current_date = add_days(current_date, 1)

def validate_probation_leave(doc):
    if not doc.from_date:
        return
    if (doc.total_leave_days or 0) > 1:
        frappe.throw("Probation employees can apply for only one leave day at a time.")
    # Read Leave Type records dynamically
    leave_types = frappe.get_all("Leave Type", pluck="name")

    restricted_types = [
        name for name in leave_types
        if "restricted" in name.lower()
    ]
    sick_types = [
        name for name in leave_types
        if "sick" in name.lower()
    ]
    casual_types = [
        name for name in leave_types
        if "casual" in name.lower()
    ]

    if doc.leave_type not in (
        restricted_types + sick_types + casual_types
    ):
        return

    from_date = getdate(doc.from_date)
    to_date = getdate(doc.to_date or doc.from_date)

    requested_days = defaultdict(float)
    current_date = from_date

    while current_date <= to_date:
        month = current_date.strftime("%Y-%m")
        requested_days[month] += 1
        current_date = add_days(current_date, 1)

    applications = frappe.get_all(
        "Leave Application",
        filters={
            "employee": doc.employee,
            "docstatus": ["<", 2],
        },
        fields=[
            "name",
            "leave_type",
            "from_date",
            "to_date",
            "status",
            "workflow_state",
        ],
    )

    monthly_totals = defaultdict(float)
    monthly_types = defaultdict(set)

    for application in applications:
        if not doc.is_new() and application.name == doc.name:
            continue

        status = (application.status or "").lower()
        workflow_state = (
            application.workflow_state or ""
        ).lower()

        if status in ("rejected", "cancelled"):
            continue

        if workflow_state in ("rejected", "cancelled"):
            continue

        leave_type = application.leave_type

        if leave_type not in (
            restricted_types + sick_types + casual_types
        ):
            continue

        current = getdate(application.from_date)
        end = getdate(
            application.to_date or application.from_date
        )

        while current <= end:
            month = current.strftime("%Y-%m")

            if leave_type in restricted_types:
                monthly_totals[("restricted", month)] += 1

            elif leave_type in sick_types + casual_types:
                monthly_totals[("sick_casual", month)] += 1
                monthly_types[month].add(leave_type)

            current = add_days(current, 1)

    for month, days in requested_days.items():

        if doc.leave_type in restricted_types:
            if (
                monthly_totals[("restricted", month)] + days > 1
            ):
                frappe.throw(
                    f"Probation employees can take only one day of "
                    f"Restricted Leave per month. You have already used "
                    f"your leave allowance for "
                    f"{getdate(month + '-01').strftime('%B %Y')}."
                )

        elif doc.leave_type in sick_types + casual_types:
            other_types = (
                casual_types
                if doc.leave_type in sick_types
                else sick_types
            )

            if any(
                leave_type in monthly_types[month]
                for leave_type in other_types
            ):
                frappe.throw(
                    f"As a probation employee, you can take only one day of "
                    f"either Sick Leave or Casual Leave per month. "
                    f"You cannot apply for both types of leave in the same month "
                    f"({getdate(month + '-01').strftime('%B %Y')})."
                )

            if (
                monthly_totals[("sick_casual", month)] + days > 1
            ):
                frappe.throw(
                    f"Probation employees can take only one day of Sick or "
                    f"Casual Leave per month. You have already used your "
                    f"leave allowance for "
                    f"{getdate(month + '-01').strftime('%B %Y')}."
                )
