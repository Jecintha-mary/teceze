import frappe
from frappe.model.document import Document


MONTHS = {
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
}


class LeaveRule(Document):

    def validate(self):
        self.validate_leave_allocation()

    def validate_leave_allocation(self):
        covered_months = set()

        for row in self.leave_allocation:

            from_month = MONTHS[row.from_month]
            to_month = MONTHS[row.to_month]

            # From Month cannot be after To Month
            if from_month > to_month:
                frappe.throw(
                    f"From Month {row.from_month} cannot be after "
                    f"To Month {row.to_month}."
                )

            # Check overlapping months
            for month in range(from_month, to_month + 1):

                if month in covered_months:
                    month_name = self.get_month_name(month)

                    frappe.throw(
                        f"Month {month_name} is already covered "
                        f"by another allocation rule."
                    )

                covered_months.add(month)

        # Make sure all 12 months are covered
        if len(covered_months) != 12:

            missing_months = [
                self.get_month_name(month)
                for month in range(1, 13)
                if month not in covered_months
            ]

            frappe.throw(
                "All 12 months must be covered. "
                f"Missing: {', '.join(missing_months)}."
            )

    @staticmethod
    def get_month_name(month_number):
        for month_name, number in MONTHS.items():
            if number == month_number:
                return month_name