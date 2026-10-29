import frappe
from datetime import timedelta
from frappe.utils import getdate
from erpnext.setup.doctype.employee.employee import get_holiday_list_for_employee
from hrms.api.roster import (_validate_employee_filters,)
from hrms.api.roster import (
    _validate_employee_filters,
    _validate_shift_filters,
    get_leaves,
    get_shifts,
)
def get_holidays(month_start: str, month_end: str, employee_filters: dict[str, str]) -> dict[str, list[dict]]:
    
    _validate_employee_filters(employee_filters)
 
    holidays = {}
    start_date = getdate(month_start)
    end_date = getdate(month_end)
 
    employees = frappe.get_list("Employee", filters=employee_filters, pluck="name")
 
    for employee in employees:
        assignments = frappe.get_all(
            "Shift Assignment",
            filters={
                "employee": employee,
                "docstatus": 1,
                "status": "Active",
                "start_date": ["<=", month_end],
            },
            or_filters=[
                ["Shift Assignment", "end_date", ">=", month_start],
                ["Shift Assignment", "end_date", "is", "not set"],
            ],
            fields=["shift_type", "start_date", "end_date"],
            order_by="start_date asc",
        )
 
        # Load each assigned Shift Type's Holiday List.
        shift_holiday_lists = {}
        for assignment in assignments:
            if assignment.shift_type not in shift_holiday_lists:
                shift_holiday_lists[assignment.shift_type] = frappe.db.get_value(
                    "Shift Type", assignment.shift_type, "holiday_list"
                )
 
        # Cache holiday records by Holiday List.
        holiday_cache = {}
        employee_holidays = []
 
        current_date = start_date
        while current_date <= end_date:
            # Find the Shift Assignment active on this date.
            active_assignment = next(
                (
                    a for a in reversed(assignments)
                    if getdate(a.start_date) <= current_date
                    and (
                        not a.end_date
                        or getdate(a.end_date) >= current_date
                    )
                ),
                None,
            )
 
            holiday_list = None
 
            if active_assignment:
                holiday_list = shift_holiday_lists.get(
                    active_assignment.shift_type
                )
 
            # If the assigned Shift Type has no Holiday List, use the
            # employee's applicable Holiday List for this date.
            if not holiday_list:
                holiday_list = get_holiday_list_for_employee(
                    employee,
                    raise_exception=False,
                    as_on=current_date,
                )
 
            if holiday_list:
                if holiday_list not in holiday_cache:
                    holiday_cache[holiday_list] = {
                        getdate(h.holiday_date): {
                            "holiday": h.name,
                            "holiday_date": h.holiday_date,
                            "description": h.description,
                            "weekly_off": h.weekly_off,
                        }
                        for h in frappe.get_all(
                            "Holiday",
                            filters={
                                "parent": holiday_list,
                                "holiday_date": [
                                    "between", [month_start, month_end]
                                ],
                            },
                            fields=[
                                "name",
                                "holiday_date",
                                "description",
                                "weekly_off",
                            ],
                        )
                    }
 
                holiday = holiday_cache[holiday_list].get(current_date)
                if holiday:
                    employee_holidays.append(holiday)
 
            current_date += timedelta(days=1)
 
        holidays[employee] = employee_holidays
 
    return holidays
@frappe.whitelist()
def get_events(
    month_start: str,
    month_end: str,
    employee_filters: dict,
    shift_filters: dict,
) -> dict:

    _validate_employee_filters(employee_filters)
    _validate_shift_filters(shift_filters)

    holidays = get_holidays(
        month_start,
        month_end,
        employee_filters,
    )

    leaves = get_leaves(
        month_start,
        month_end,
        employee_filters,
    )

    shifts = get_shifts(
        month_start,
        month_end,
        employee_filters,
        shift_filters,
    )

    events = {}

    for event_group in (holidays, leaves, shifts):
        for employee, employee_events in event_group.items():
            events.setdefault(employee, []).extend(employee_events)

    return events