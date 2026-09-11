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
    frappe.log_error("After Insert Triggered", "Employee After Insert")
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
    frappe.log_error('ssssssssssssssssssssssss')
    # # Run only on 1st of the month
    # if current_date.day != 1:
    #     return {
    #         "success": False,
    #         "message": "PL credit runs only on the 1st of the month."
    #     }

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
    # PROCESS EMPLOYEES
    # ---------------------------------------------------------

    for emp in employees:

        if not emp.date_of_joining:
            continue

        joining_date = getdate(emp.date_of_joining)

        # -----------------------------------------------------
        # ONE YEAR COMPLETION
        # -----------------------------------------------------

        completion_date = add_years(
            joining_date,
            1
        )

        # Employee should complete one year first
        if current_date <= completion_date:
            continue
   
        # continue
        if completion_date.month == 12:

            first_credit_date = getdate(
                f"{completion_date.year + 1}-01-01"
            )

        else:

            first_credit_date = getdate(
                f"{completion_date.year}-"
                f"{completion_date.month + 1:02d}-01"
            )
        

        # Not yet reached first credit month
        if current_date < first_credit_date:
            continue
        is_first_month = (
                    current_date.year == first_credit_date.year
                    and current_date.month == first_credit_date.month
                )
        if is_first_month:
            create_first_pl(emp, leave_type, current_date, results)
            continue
        # -----------------------------------------------------
        # FIND EXISTING PL ALLOCATION
        # -----------------------------------------------------

        allocation_name = frappe.db.get_value(
            "Leave Allocation",
            {
                "employee": emp.name,
                "leave_type": leave_type,
                "docstatus": 1
            },
            "name",
            order_by="creation desc"
        )

        # -----------------------------------------------------
        # GET CURRENT LEAVE PERIOD
        # -----------------------------------------------------

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

        # =====================================================
        # EXISTING ALLOCATION
        # =====================================================

        if allocation_name:

            allocation = frappe.get_doc(
                "Leave Allocation",
                allocation_name
            )

            # Existing PL value
            old_value = float(
                allocation.total_leaves_allocated or 0
            )

            # -------------------------------------------------
            # ADD ONLY 0.5
            # -------------------------------------------------

            new_value = round(
                old_value + 0.5,
                2
            )

            frappe.db.set_value(
                "Leave Allocation",
                allocation.name,
                "total_leaves_allocated",
                new_value
            )

            frappe.db.set_value(
                "Leave Allocation",
                allocation.name,
                "new_leaves_allocated",
                new_value
            )

            results.append({
                "employee": emp.name,
                "action": "Updated",
                "old_value": old_value,
                "added": 0.5,
                "new_value": new_value
            })

        # =====================================================
        # NO ALLOCATION
        # =====================================================

        else:

            # -------------------------------------------------
            # CREATE WITH 0.5
            # -------------------------------------------------

            allocation = frappe.new_doc(
                "Leave Allocation"
            )

            allocation.employee = emp.name
            allocation.leave_type = leave_type
            allocation.leave_period = leave_period.name

            allocation.from_date = leave_period.from_date
            allocation.to_date = leave_period.to_date

            allocation.new_leaves_allocated = 0.5

            allocation.insert(
                ignore_permissions=True
            )

            allocation.submit()

            results.append({
                "employee": emp.name,
                "action": "Created",
                "old_value": 0,
                "added": 0.5,
                "new_value": 0.5
            })

    # ---------------------------------------------------------
    # COMMIT
    # ---------------------------------------------------------

    frappe.db.commit()

    return {
        "success": True,
        "run_date": str(current_date),
        "employees_processed": len(results),
        "data": results
    }


def annual_leave_allocation():
    frappe.log_error("Annual Leave Allocation Cron Job Triggered", "Annual Leave Allocation")

def allocate_eligible_leaves():

    frappe.log_error(
        "Annual Leave Allocation Cron Job Triggered",
        "Annual Leave Allocation"
    )

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

        rule = frappe.get_doc("Leave Rule", rule_data.name)

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



        for employee in employees:

            try:

                # -----------------------------------
                # Expire previous leave allocations
                # -----------------------------------

                for row in rule.table_hyic or []:

                    if not row.leave_types:
                        continue

                    allocation = frappe.get_all(
                        "Leave Allocation",
                        filters={
                            "employee": employee.name,
                            "leave_type": row.leave_types,
                        },
                        fields=["name"],
                        order_by="creation desc",
                        limit_page_length=1,
                    )

                    if allocation:

                        frappe.db.set_value(
                            "Leave Allocation",
                            allocation[0].name,
                            "to_date",
                            expiry_date,
                        )


                joining_month = getdate(
                    employee.date_of_joining
                ).month

                days = 0

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
                        days = float(row.days or 0)
                        break

                if not days:
                    continue


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


                allocation = frappe.get_doc({
                    "doctype": "Leave Allocation",
                    "employee": employee.name,
                    "leave_type": rule.leave_type,
                    "from_date": joining_date,
                    "to_date": year_end,
                    "new_leaves_allocated": days,
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