

def validate(doc, method):
    encashment_date = getdate(doc.encashment_date)

    if encashment_date.month != 11 or encashment_date.day > 11:
        frappe.throw(
            _("Leave Encashment can be applied only between 1st and 11th November.")
        )

    if not doc.leave_period:
        frappe.throw(_("Please select a Leave Period."))

    from_date, to_date, is_active = frappe.db.get_value(
        "Leave Period", doc.leave_period, ["from_date", "to_date", "is_active"]
    )
    if not is_active:
        frappe.throw(_("Leave Period {0} is not active.").format(doc.leave_period))

    if not (getdate(from_date) <= encashment_date <= getdate(to_date)):
        frappe.throw(
            _("Encashment Date {0} does not fall within Leave Period {1} ({2} to {3}).").format(
                encashment_date, doc.leave_period, getdate(from_date), getdate(to_date)
            )
        )

    if doc.leave_allocation:
        alloc_period = frappe.db.get_value(
            "Leave Allocation", doc.leave_allocation, "leave_period"
        )

        if alloc_period != doc.leave_period:
            frappe.throw(
                _("Leave Allocation {0} belongs to Leave Period {1}, not {2}.").format(
                    doc.leave_allocation, alloc_period or "None", doc.leave_period
                )
            )
    if not doc.encashment_amount and doc.encashment_days:
        ssa = frappe.db.get_value(
            "Salary Structure Assignment",
            {
                "employee": doc.employee,
                "docstatus": 1,
                "from_date": ["<=", doc.encashment_date],
            },
            ["base"],
            order_by="from_date desc",
            as_dict=True,
        )
        if ssa and ssa.base:
            per_day = ssa.base / 30  
            doc.encashment_amount = doc.encashment_days * per_day