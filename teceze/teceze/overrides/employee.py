# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from dateutil.relativedelta import relativedelta
from datetime import datetime
from frappe.model.naming import make_autoname
from frappe.utils import getdate, date_diff, today, add_years, add_days
import math
from datetime import timedelta
from frappe.utils import add_to_date, getdate, today



def autoname(doc, method):
    settings = frappe.get_single("Teceze Settings")

    prefix = (settings.employee_prefix or "").upper()
    series = (settings.employee_series or "")

    country_code = frappe.db.get_value(
        "Country",
        doc.custom_country,
        "code"
    )

    country_code = (country_code or "").upper()

    if doc.employment_type == "Engineer":
        prefix = (settings.engineer_prefix or "").upper()

    series = f"{prefix}-{country_code}-.{series}"
    doc.name = make_autoname(series)



def get_current_year_dates():
    year = getdate(today()).year
    return f"{year}-01-01", f"{year}-12-31"


def get_shift_holiday_list(shift_type):
    holiday_list = frappe.db.get_value(
        "Shift Type",
        shift_type,
        "holiday_list"
    )

    if not holiday_list:
        frappe.throw(
            f"Holiday List is not set for Shift Type <b>{shift_type}</b>"
        )

    return holiday_list

def create_shift_and_holiday_assignment(doc):
    if not doc.default_shift:
        return

    start_date, end_date = get_current_year_dates()
    holiday_list = get_shift_holiday_list(doc.default_shift)

    # Shift Assignment
    shift_assignment = frappe.get_doc({
        "doctype": "Shift Assignment",
        "employee": doc.name,
        "shift_type": doc.default_shift,
        "start_date": start_date,
        "end_date": end_date
    })

    shift_assignment.insert(ignore_permissions=True)
    shift_assignment.submit()

    # Holiday List Assignment
    holiday_assignment = frappe.get_doc({
        "doctype": "Holiday List Assignment",
        "assigned_to": doc.name,
        "holiday_list": holiday_list,
        "from_date": start_date
    })

    holiday_assignment.insert(ignore_permissions=True)
    holiday_assignment.submit()
def update_shift_and_holiday_assignment(doc):
    if not doc.default_shift:
        return

    start_date, end_date = get_current_year_dates()
    holiday_list = get_shift_holiday_list(doc.default_shift)

    # Shift Assignment
    shift_assignment_name = frappe.db.get_value(
        "Shift Assignment",
        {
            "employee": doc.name,
            "docstatus": 1
        },
        "name"
    )

    if shift_assignment_name:
        frappe.db.set_value(
            "Shift Assignment",
            shift_assignment_name,
            "shift_type",
            doc.default_shift
        )
    else:
        shift_assignment = frappe.get_doc({
            "doctype": "Shift Assignment",
            "employee": doc.name,
            "shift_type": doc.default_shift,
            "start_date": start_date,
            "end_date": end_date
        })
        shift_assignment.insert(ignore_permissions=True)
        shift_assignment.submit()

    # Holiday List Assignment
    holiday_assignment_name = frappe.db.get_value(
        "Holiday List Assignment",
        {
            "assigned_to": doc.name,
            "docstatus": 1
        },
        "name"
    )

    if holiday_assignment_name:
        frappe.db.set_value(
            "Holiday List Assignment",
            holiday_assignment_name,
            "holiday_list",
            holiday_list
        )
    else:
        holiday_assignment = frappe.get_doc({
            "doctype": "Holiday List Assignment",
            "assigned_to": doc.name,
            "holiday_list": holiday_list,
            "from_date": start_date
        })
        holiday_assignment.insert(ignore_permissions=True)
        holiday_assignment.submit()
def after_insert(doc, method):
    create_leave_allocations(doc)
    create_shift_and_holiday_assignment(doc)


def on_update(doc, method):

    if doc.has_value_changed("default_shift"):
        update_shift_and_holiday_assignment(doc)

    if not doc.resignation_letter_date:
        return

    if frappe.db.exists(
        "Exit Clearance Form",
        {"employee_id": doc.name}
    ):
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

    # Leave types
    leave_types = [
        "Casual Leave",
        "Sick Leave",
        "Restricted Leave"
    ]

    for leave_type in leave_types:

        # Check if allocation already exists
        if frappe.db.exists(
            "Leave Allocation",
            {
                "employee": doc.name,
                "leave_type": leave_type,
                "leave_period": leave_period.name
            }
        ):
            continue

        # ---------------------------------------
        # Restricted Leave Logic
        # ---------------------------------------
        if leave_type == "Restricted Leave":

            # January to June = 5 RL
            # July to December = 3 RL
            if joining_date.month <= 6:
                allocated_leaves = 5
            else:
                allocated_leaves = 3

        # ---------------------------------------
        # CL / SL Logic
        # ---------------------------------------
        else:

            # Get annual leave count from Leave Type
            annual_leaves = frappe.db.get_value(
                "Leave Type",
                leave_type,
                "max_leaves_allowed"
            )

            if not annual_leaves:
                frappe.log_error(
                    f"Max Leaves Allowed not set for {leave_type}",
                    "Leave Allocation Error"
                )
                continue

            # Prorated leave calculation
            calculated_leaves = (
                annual_leaves * remaining_days
            ) / total_days

            # Round to nearest 0.5
            allocated_leaves = round(
                calculated_leaves * 2
            ) / 2

        # ---------------------------------------
        # Create Leave Allocation
        # ---------------------------------------
        allocation = frappe.new_doc("Leave Allocation")

        allocation.employee = doc.name
        allocation.leave_type = leave_type
        allocation.leave_period = leave_period.name
        allocation.from_date = joining_date
        allocation.to_date = leave_period.to_date
        allocation.new_leaves_allocated = allocated_leaves

        allocation.insert(ignore_permissions=True)
        allocation.submit()
def create_first_pl(emp, leave_type, current_date, results):

    leave_period = frappe.get_value(
        "Leave Period",
        {
            "from_date": ["<=", current_date],
            "to_date": [">=", current_date]
        },
        ["name", "from_date", "to_date"],
        as_dict=True
    )
    leave_type_maximum_allowed=frappe.get_value(
        "Leave Type",
        {
            "name": leave_type
        },
        "max_leaves_allowed"
    )
    
    if not leave_period:
        return

    allocation = frappe.new_doc("Leave Allocation")

    allocation.employee = emp.name
    allocation.leave_type = leave_type
    allocation.leave_period = leave_period.name
    allocation.from_date = leave_period.from_date
    allocation.to_date = leave_period.to_date
    allocation.new_leaves_allocated = leave_type_maximum_allowed

    allocation.insert(ignore_permissions=True)
    allocation.submit()

    results.append({
        "employee": emp.name,
        "action": "Created",
        "old_value": 0,
        "added": leave_type_maximum_allowed,
        "new_value": leave_type_maximum_allowed
    })



def credit_privilege_leave():
    current_date = getdate(today())
    leave_type = "Privilege Leave"

    results = []

    # ---------------------------------------------------------
    # GET ACTIVE FULL TIME EMPLOYEES
    # ---------------------------------------------------------

    employees = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "employment_type": "Full Time",
            "custom_country": ["!=", "Sri Lanka"]
        },
        fields=[
            "name",
            "date_of_joining"
        ]
    )

    # ---------------------------------------------------------
    # PROCESS EACH EMPLOYEE
    # ---------------------------------------------------------

    for emp in employees:

        try:

            if not emp.date_of_joining:
                continue

            joining_date = getdate(emp.date_of_joining)

            # -------------------------------------------------
            # ONE YEAR COMPLETION DATE
            # -------------------------------------------------

            completion_date = add_years(
                joining_date,
                1
            )

            # -------------------------------------------------
            # BEFORE ONE YEAR
            # -------------------------------------------------

            if current_date < completion_date:
                continue

            # =================================================
            # GET CURRENT LEAVE PERIOD
            # =================================================

            leave_period = frappe.get_value(
                "Leave Period",
                {
                    "from_date": ["<=", current_date],
                    "to_date": [">=", current_date]
                },
                [
                    "name",
                    "from_date",
                    "to_date"
                ],
                as_dict=True
            )

            if not leave_period:
                continue

            # =================================================
            # FIRST CREDIT - 6 PL
            # =================================================
            #
            # Example:
            #
            # Joining Date     : 02-Sep-2025
            # Completion Date  : 02-Sep-2026
            #
            # 02-Sep-2026 -> 6 PL
            #
            # =================================================

            if current_date == completion_date:

                # -------------------------------------------------
                # CHECK ALLOCATION FOR THIS EMPLOYEE + PERIOD
                # -------------------------------------------------

                allocation_name = frappe.db.get_value(
                    "Leave Allocation",
                    {
                        "employee": emp.name,
                        "leave_type": leave_type,
                        "leave_period": leave_period.name,
                        "docstatus": 1
                    },
                    "name",
                    order_by="creation desc"
                )

                # Already created
                if allocation_name:

                    results.append({
                        "employee": emp.name,
                        "action": "Already Exists",
                        "credit_date": str(current_date),
                        "allocation": allocation_name
                    })

                    continue

                # -------------------------------------------------
                # CREATE 6 PL ALLOCATION
                # -------------------------------------------------

                allocation = frappe.new_doc(
                    "Leave Allocation"
                )

                allocation.employee = emp.name
                allocation.leave_type = leave_type
                allocation.leave_period = leave_period.name

                allocation.from_date = leave_period.from_date
                allocation.to_date = leave_period.to_date

                allocation.new_leaves_allocated = 6

                allocation.insert(
                    ignore_permissions=True
                )

                allocation.submit()

                results.append({
                    "employee": emp.name,
                    "action": "First PL Credit",
                    "credit_date": str(current_date),
                    "added": 6,
                    "new_value": 6,
                    "allocation": allocation.name
                })

                continue

            # =================================================
            # MONTHLY 0.5 CREDIT
            # =================================================
            #
            # Only in the SAME YEAR as completion.
            #
            # Example:
            #
            # Completion = 02-Sep-2026
            #
            # 01-Oct-2026 -> +0.5
            # 01-Nov-2026 -> +0.5
            # 01-Dec-2026 -> +0.5
            #
            # 01-Jan-2027 -> NO CREDIT
            #
            # =================================================

            if current_date.year != completion_date.year:
                continue

            # -------------------------------------------------
            # ONLY RUN ON FIRST DAY OF MONTH
            # -------------------------------------------------

            if current_date.day != 1:
                continue

            # -------------------------------------------------
            # MONTHLY CREDIT MUST BE AFTER COMPLETION MONTH
            # -------------------------------------------------

            if (
                current_date.year == completion_date.year
                and current_date.month <= completion_date.month
            ):
                continue

            # =================================================
            # FIND PL ALLOCATION FOR THIS EMPLOYEE
            # =================================================

            allocation_name = frappe.db.get_value(
                "Leave Allocation",
                {
                    "employee": emp.name,
                    "leave_type": leave_type,
                    "leave_period": leave_period.name,
                    "docstatus": 1
                },
                "name",
                order_by="creation desc"
            )

            # -------------------------------------------------
            # IF 6 PL ALLOCATION DOES NOT EXIST
            # -------------------------------------------------

            if not allocation_name:

                results.append({
                    "employee": emp.name,
                    "action": "Skipped - First Allocation Not Found",
                    "credit_date": str(current_date)
                })

                continue

            # =================================================
            # GET ALLOCATION
            # =================================================

            allocation = frappe.get_doc(
                "Leave Allocation",
                allocation_name
            )

            # -------------------------------------------------
            # CURRENT PL
            # -------------------------------------------------

            old_value = float(
                allocation.total_leaves_allocated or 0
            )

            # -------------------------------------------------
            # ADD 0.5
            # -------------------------------------------------

            new_value = round(
                old_value + 0.5,
                2
            )

            # -------------------------------------------------
            # UPDATE ALLOCATION
            # -------------------------------------------------

            frappe.db.set_value(
                "Leave Allocation",
                allocation.name,
                {
                    "total_leaves_allocated": new_value,
                    "new_leaves_allocated": new_value
                }
            )

            results.append({
                "employee": emp.name,
                "action": "Monthly PL Credit",
                "credit_date": str(current_date),
                "old_value": old_value,
                "added": 0.5,
                "new_value": new_value,
                "allocation": allocation.name
            })

        except Exception as e:

            # -------------------------------------------------
            # DON'T STOP OTHER EMPLOYEES
            # -------------------------------------------------
            #
            # If one employee has an error, continue processing
            # the remaining employees.
            #
            # -------------------------------------------------

            frappe.log_error(
                title="Privilege Leave Credit Error",
                message=frappe.get_traceback()
            )

            results.append({
                "employee": emp.name,
                "action": "Error",
                "error": str(e)
            })

            continue

    # ---------------------------------------------------------
    # COMMIT
    # ---------------------------------------------------------

    frappe.db.commit()

    # ---------------------------------------------------------
    # RETURN RESULT
    # ---------------------------------------------------------

    return {
        "success": True,
        "run_date": str(current_date),
        "employees_processed": len(results),
        "data": results
    }



from datetime import timedelta

from frappe.utils import getdate, today, add_to_date
from hrms.hr.doctype.leave_application.leave_application import (
    get_leave_balance_on,
)


def allocate_eligible_leaves():

    current_date = getdate(today())
    expiry_date = current_date - timedelta(days=1)
    year_end = getdate(f"{current_date.year}-12-31")

    rules = frappe.get_all(
        "Leave Rule",
        filters={"enabled": 1},
        fields=[
            "name",
            "country",
            "leave_type",
            "eligibility_period",
            "uom",
        ],
    )

    for rule_data in rules:

        rule = frappe.get_doc(
            "Leave Rule",
            rule_data.name
        )

        # -----------------------------------
        # Calculate eligibility date
        # -----------------------------------

        if rule.uom == "Year":

            joining_date = getdate(
                add_to_date(
                    current_date,
                    years=-rule.eligibility_period,
                )
            )

        elif rule.uom == "Month":

            joining_date = getdate(
                add_to_date(
                    current_date,
                    months=-rule.eligibility_period,
                )
            )

        elif rule.uom == "Day":

            joining_date = getdate(
                add_to_date(
                    current_date,
                    days=-rule.eligibility_period,
                )
            )

        else:

            frappe.log_error(
                f"Invalid UOM: {rule.uom}",
                f"Leave Allocation - {rule.name}",
            )

            continue

        # -----------------------------------
        # Get eligible employees
        # -----------------------------------

        employees = frappe.get_all(
            "Employee",
            filters={
                "custom_country": rule.country,
                "status": "Active",
                "date_of_joining": joining_date,
            },
            fields=[
                "name",
                "date_of_joining",
            ],
        )

        # -----------------------------------
        # Leap year handling
        # -----------------------------------

        if (
            current_date.month == 2
            and current_date.day == 28
            and not (
                current_date.year % 4 == 0
                and (
                    current_date.year % 100 != 0
                    or current_date.year % 400 == 0
                )
            )
        ):

            leap_joining_date = joining_date.replace(day=29)

            leap_employees = frappe.get_all(
                "Employee",
                filters={
                    "custom_country": rule.country,
                    "status": "Active",
                    "date_of_joining": leap_joining_date,
                },
                fields=[
                    "name",
                    "date_of_joining",
                ],
            )

            employees.extend(leap_employees)

        # -----------------------------------
        # Process employees
        # -----------------------------------

        for employee in employees:

            try:

                # ===================================
                # GET PREVIOUS LEAVE BALANCE
                # ===================================

                balance_leave = 0

                for row in rule.table_hyic or []:

                    if not row.leave_types:
                        continue

                    # Get latest submitted allocation
                    allocation = frappe.get_all(
                        "Leave Allocation",
                        filters={
                            "employee": employee.name,
                            "leave_type": row.leave_types,
                            "docstatus": 1,
                        },
                        fields=[
                            "name",
                            "from_date",
                            "to_date",
                        ],
                        order_by="creation desc",
                        limit_page_length=1,
                    )

                    if not allocation:
                        continue

                    old_allocation = allocation[0]

                    # ===================================
                    # GET ACTUAL CURRENT BALANCE
                    # BEFORE EXPIRING OLD ALLOCATION
                    # ===================================

                    leave_balance = get_leave_balance_on(
                        employee.name,
                        row.leave_types,
                        old_allocation.from_date,
                        old_allocation.to_date,
                        consider_all_leaves_in_the_allocation_period=True,
                        for_consumption=True,
                    )

                    balance_leave = float(
                        leave_balance.get(
                            "leave_balance_for_consumption"
                        ) or 0
                    )

                    if balance_leave < 0:
                        balance_leave = 0

                    # -----------------------------------
                    # Debug
                    # -----------------------------------

                    frappe.log_error(
                        f"""
Employee: {employee.name}
Leave Type: {row.leave_types}

Old Allocation: {old_allocation.name}

From Date: {old_allocation.from_date}
To Date: {old_allocation.to_date}

Current Leave Balance: {balance_leave}
""",
                        "LEAVE BALANCE BEFORE EXPIRY",
                    )

                    # ===================================
                    # EXPIRE OLD ALLOCATION
                    # ===================================

                    frappe.db.set_value(
                        "Leave Allocation",
                        old_allocation.name,
                        "to_date",
                        expiry_date,
                    )

                # ===================================
                # CALCULATE NEW LEAVE
                # ===================================

                joining_month = getdate(
                    employee.date_of_joining
                ).month

                new_leave_days = 0

                for row in rule.leave_allocation or []:

                    from_month = get_month_number(
                        row.from_month
                    )

                    to_month = get_month_number(
                        row.to_month
                    )

                    if (
                        from_month
                        <= joining_month
                        <= to_month
                    ):

                        new_leave_days = float(
                            row.days or 0
                        )

                        break

                # -----------------------------------
                # No leave configured
                # -----------------------------------

                if not new_leave_days:
                    continue

                # ===================================
                # ADD PREVIOUS BALANCE
                # ===================================

                total_leave_days = (
                    new_leave_days
                    + balance_leave
                )

                # -----------------------------------
                # Debug
                # -----------------------------------

                frappe.log_error(
                    f"""
Employee: {employee.name}
Rule: {rule.name}

New Leave: {new_leave_days}
Carry Forward: {balance_leave}

Total New Allocation: {total_leave_days}
""",
                    "NEW LEAVE ALLOCATION",
                )

                # ===================================
                # CHECK DUPLICATE
                # ===================================

                if frappe.db.exists(
                    "Leave Allocation",
                    {
                        "employee": employee.name,
                        "leave_type": rule.leave_type,
                        "from_date": joining_date,
                        "to_date": year_end,
                        "docstatus": ["!=", 2],
                    },
                ):

                    continue

                # ===================================
                # CREATE NEW ALLOCATION
                # ===================================

                allocation = frappe.get_doc({
                    "doctype": "Leave Allocation",
                    "employee": employee.name,
                    "leave_type": rule.leave_type,
                    "from_date": joining_date,
                    "to_date": year_end,
                    "new_leaves_allocated": total_leave_days,
                })

                allocation.insert(
                    ignore_permissions=True
                )

                allocation.submit()

            except Exception:

                frappe.log_error(
                    frappe.get_traceback(),
                    (
                        f"Leave Allocation Failed\n"
                        f"Employee: {employee.name}\n"
                        f"Rule: {rule.name}"
                    ),
                )

                continue

    frappe.db.commit()


def get_month_number(month):

    return {
        "January": 1,
        "February": 2,
        "March": 3,
        "April": 4,
        "May": 5,
        "June": 6,
        "July": 7,
        "August": 8,
        "September": 9,
        "October": 10,
        "November": 11,
        "December": 12,
    }.get(month)