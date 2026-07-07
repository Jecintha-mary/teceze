# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from dateutil.relativedelta import relativedelta
from datetime import datetime
from frappe.model.naming import make_autoname
from frappe.utils import getdate, date_diff, today, add_years, add_days
import math

def autoname(doc,method):
    settings = frappe.get_single("Teceze Settings")
    
    prefix = (settings.employee_prefix or "").upper()
    series = (settings.employee_series or '')
    
    country_code = frappe.db.get_value(
        "Country",
        doc.custom_country,
        "code"
    )

    country_code = (country_code or "").upper()
    series = f"{prefix}-{country_code}-.{series}" 
    doc.name = make_autoname(series)

def validate(doc, method):
    date_calculation_for_employee(doc)

def onload(doc, method):
    if doc.custom_probation:
        result = frappe.db.sql("""
            SELECT probation_status as status
            FROM `tabProbation Review`
            WHERE name = %s
        """, (doc.custom_probation,), as_dict=True)
        if result:
            doc.custom_probation_status = result[0].status
        else:
            doc.custom_probation_status = ""
        frappe.db.commit()
    date_calculation_for_employee(doc)

def after_insert(doc,method):
    create_leave_allocations(doc) 

def date_calculation_for_employee(doc):
    #Calculate employee age from date of birth--dharshini
    today = frappe.utils.getdate()
    if doc.date_of_birth:
        dob = frappe.utils.getdate(doc.date_of_birth)
        diff = relativedelta(today, dob)
        doc.custom_age = f"{diff.years} years, {diff.months} months, {diff.days} days"

    # Calulate tenure from date of Joining 
    if doc.date_of_joining:
        doj = frappe.utils.getdate(doc.date_of_joining)
        val = relativedelta(today, doj)
        doc.custom_tenure = f"{val.years} years, {val.months} months, {val.days} days"
    frappe.db.commit()



def create_leave_allocations(doc):
    joining_date = getdate(doc.date_of_joining)

    # Find Leave Period
    leave_period = frappe.get_value(
        "Leave Period",
        {
            "from_date": ["<=", joining_date],
            "to_date": [">=", joining_date]
        },
        ["name", "from_date", "to_date"],
        as_dict=True
    )

    if not leave_period:
        frappe.log_error(
            f"No Leave Period found for joining date {joining_date}",
            "Leave Allocation Error"
        )
        return

    # Total days in leave period
    total_days = date_diff(
        leave_period.to_date,
        leave_period.from_date
    ) + 1

    # Remaining days from joining date till leave period end
    remaining_days = date_diff(
        leave_period.to_date,
        joining_date
    ) + 1

    leave_types = ["Casual Leave", "Sick Leave"]

    for leave_type in leave_types:

        # Get annual leave count from Leave Type
        annual_leaves = frappe.db.get_value(
            "Leave Type",
            leave_type,
            "max_leaves_allowed"
        )
        frappe.log_error('annual_leaves',str(annual_leaves))
        if not annual_leaves:
            frappe.log_error(
                f"Max Leaves Allowed not set for {leave_type}",
                "Leave Allocation Error"
            )
            continue

        # Prorated leave calculation
        calculated_leaves = (annual_leaves * remaining_days) / total_days
        allocated_leaves = round(calculated_leaves * 2) / 2

        # Skip if allocation already exists
        if frappe.db.exists(
            "Leave Allocation",
            {
                "employee": doc.name,
                "leave_type": leave_type,
                "leave_period": leave_period.name
            }
        ):
            continue

        allocation = frappe.new_doc("Leave Allocation")
        allocation.employee = doc.name
        allocation.leave_type = leave_type
        allocation.leave_period = leave_period.name
        allocation.from_date = joining_date
        allocation.to_date = leave_period.to_date
        allocation.new_leaves_allocated = allocated_leaves

        allocation.insert(ignore_permissions=True)
        allocation.submit()



def credit_privilege_leave():

    current_date = getdate(today())
    # current_date = getdate("2027-09-01")
    employees = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "employment_type": "Full Time"
        },
        fields=["name", "date_of_joining"]
    )

    for emp in employees:

        if not emp.date_of_joining:
            continue

        joining_date = getdate(emp.date_of_joining)
        completion_date = add_years(joining_date, 1)

        # Employee has not completed 1 year
        if current_date < completion_date:
            continue

        leave_type = "Privilege Leave"

        allocation_name = frappe.db.get_value(
            "Leave Allocation",
            {
                "employee": emp.name,
                "leave_type": leave_type,
                "docstatus": 1
            }
        )

        # --------------------------------------------------
        # FIRST TIME CREATE ALLOCATION
        # --------------------------------------------------
        if not allocation_name:

            log_key = f"PL_INITIAL_{emp.name}_{completion_date}"

            if not frappe.db.exists(
                "Error Log",
                {"error": ["like", f"%{log_key}%"]}
            ):

                leave_count = frappe.db.get_value(
                    "Leave Type",
                    leave_type,
                    "max_leaves_allowed"
                ) or 0

                leave_period = frappe.get_value(
                    "Leave Period",
                    {
                        "from_date": ["<=", current_date],
                        "to_date": [">=", current_date]
                    },
                    ["name", "to_date"],
                    as_dict=True
                )

                if not leave_period:
                    continue

                allocation = frappe.new_doc("Leave Allocation")
                allocation.employee = emp.name
                allocation.leave_type = leave_type
                allocation.leave_period = leave_period.name
                allocation.from_date = current_date
                allocation.to_date = leave_period.to_date
                allocation.new_leaves_allocated = 6

                allocation.insert(ignore_permissions=True)
                allocation.submit()

                frappe.log_error(
                    title="Privilege Leave Initial Allocation",
                    message=log_key
                )

            continue

        # --------------------------------------------------
        # ADD +1 EVERY 2 MONTHS
        # RUN ONLY ON 1ST OF MONTH
        # --------------------------------------------------
        if current_date.day != 1:
            continue

        months_since_completion = (
            (current_date.year - completion_date.year) * 12
            + (current_date.month - completion_date.month)
        )

        # Sep(3), Nov(5), Jan(7), Mar(9)...
        if months_since_completion < 3:
            continue

        if months_since_completion % 2 == 0:
            continue

        log_key = f"PL_INCREMENT_{emp.name}_{current_date}"

        if frappe.db.exists(
            "Error Log",
            {"error": ["like", f"%{log_key}%"]}
        ):
            continue

        allocation = frappe.get_doc(
            "Leave Allocation",
            allocation_name
        )

        current_leave = allocation.total_leaves_allocated or 0

        frappe.db.set_value(
            "Leave Allocation",
            allocation.name,
            "total_leaves_allocated",
            current_leave + 1
        )
        frappe.db.set_value(
            "Leave Allocation",
            allocation.name,
            "new_leaves_allocated",
            current_leave + 1
        )

        frappe.log_error(
            title="Privilege Leave Increment",
            message=log_key
        )

        frappe.db.commit()
 #dharshini        
def on_update(doc, method):
    if not doc.resignation_letter_date:
        return

    # Prevent duplicate Exit Clearance Forms
    if frappe.db.exists("Exit Clearance Form", {"employee_id": doc.name}):
        return

    exit_doc = frappe.new_doc("Exit Clearance Form")
    exit_doc.employee_id = doc.name
    exit_doc.employee_name = doc.employee_name
    exit_doc.date_of_resignation = doc.resignation_letter_date
    exit_doc.data_of_joined = doc.date_of_joining
    exit_doc.employee_phone = doc.cell_number
    exit_doc.employee_email = doc.personal_email
    exit_doc.department = doc.department
    exit_doc.insert(ignore_permissions=True)
