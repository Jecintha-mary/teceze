import frappe
from frappe import _
from frappe.utils import getdate 
from frappe.utils import getdate, flt
from hrms.hr.doctype.leave_encashment.leave_encashment import LeaveEncashment

class CustomLeaveEncashment(LeaveEncashment):

    def set_actual_encashable_days(self):
        settings = self.get_encashment_settings()

        days = max(self.leave_balance - (settings.non_encashable_leaves or 0), 0)

        if settings.max_encashable_leaves:
            days = min(days, settings.max_encashable_leaves)

        self.actual_encashable_days = days
    def get_ssa(self):
        ssa = frappe.db.get_value(
            "Salary Structure Assignment",
            {
                "employee": self.employee,
                "docstatus": ["<", 2],
                "from_date": ["<=", getdate(self.encashment_date)],
            },
            ["name", "base", "salary_structure"],
            order_by="from_date desc, docstatus desc, creation desc",
            as_dict=True,
        )

        if not ssa:
            frappe.throw(
                _("No Salary Structure Assignment found for {0} on {1}.").format(
                    self.employee, getdate(self.encashment_date)
                )
            )
        return ssa

    def set_salary_structure(self):
        ssa = self.get_ssa()
        if not ssa:
            frappe.throw(
                _("No Salary Structure Assignment found for {0} on {1}.").format(
                    self.employee, getdate(self.encashment_date)
                )
            )
        self._salary_structure = ssa.salary_structure

    def set_encashment_amount(self):
        if flt(self.encashment_days) <= 0:
            self.encashment_amount = 0
            return

        ssa = self.get_ssa()
        if not ssa:
            frappe.throw(
                _("No Salary Structure Assignment found for {0} on {1}.").format(
                    self.employee, getdate(self.encashment_date)
                )
            )

        monthly_base = flt(ssa.base)
        if not monthly_base:
            frappe.throw(_("Base (Gross Salary) is 0 in {0}.").format(ssa.name))

        self.encashment_amount = round(flt(self.encashment_days) * monthly_base / 30, 0)

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