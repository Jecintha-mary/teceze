import frappe
from hrms.payroll.doctype.salary_slip.salary_slip import SalarySlip
from frappe.utils import flt
from frappe.utils import flt, getdate

class CustomSalarySlip(SalarySlip):

    def validate(self):
        super().validate()
        self.validate_tax_values()
        # self.update_manual_income_tax()

    def validate_tax_values(self):
        assignment = frappe.get_all(
        "Salary Structure Assignment",
        filters={
            "employee": self.employee,
            "docstatus": 1
        },
        fields=[
            "ctc",
            "income_tax_slab",
            "custom_ctc_value",
            "custom_year_variable"
        ],
        order_by="from_date desc",
        limit_page_length=1
        )

        assignment = assignment[0] if assignment else None

        if assignment:
            self.ctc = flt(assignment["custom_ctc_value"])

        taxable_earnings = 0

        for row in self.earnings:
            component = frappe.db.get_value(
                "Salary Component",
                row.salary_component,
                ["exempted_from_income_tax"],
                as_dict=True
            )

            if component and not component.exempted_from_income_tax:
                taxable_earnings += flt(row.amount)

        self.total_earnings = taxable_earnings

        if assignment and assignment.get("income_tax_slab"):
            slab = frappe.db.get_value(
                "Income Tax Slab",
                assignment["income_tax_slab"],
                "standard_tax_exemption_amount"
            )

            self.standard_tax_exemption_amount = flt(slab)

        tax = frappe.db.get_value(
            "Additional Salary",
            {
                "employee": self.employee,
                "salary_component": "Income Tax",
                "payroll_date": ["between", [self.start_date, self.end_date]],
                "docstatus": 1
            },
            ["amount"],
            as_dict=True
        )

        self.current_month_income_tax = flt(tax.amount) if tax else 0

        previous_tax = frappe.db.sql("""
            SELECT COALESCE(SUM(amount),0)
            FROM `tabAdditional Salary`
            WHERE employee=%s
            AND salary_component='Income Tax'
            AND payroll_date < %s
            AND docstatus=1
        """, (
            self.employee,
            self.start_date
        ))[0][0]

        self.income_tax_deducted_till_date = flt(previous_tax)

        future_tax = frappe.db.sql("""
            SELECT COALESCE(SUM(amount),0)
            FROM `tabAdditional Salary`
            WHERE employee=%s
            AND salary_component='Income Tax'
            AND payroll_date > %s
            AND docstatus=1
        """, (
            self.employee,
            self.end_date
        ))[0][0]

        self.future_income_tax = flt(future_tax)


        self.total_income_tax = (
            self.income_tax_deducted_till_date
            + self.current_month_income_tax
            + self.future_income_tax
        )
       
        annual_taxable_earnings = self.total_earnings * 12
        annual_non_taxable = self.non_taxable_earnings * 12
        ctc = assignment.get("ctc")
        tax = frappe.db.get_value(
        "Additional Salary",
        {
            "employee": self.employee,
            "salary_component": "Income Tax",
            "payroll_date": ["between", [self.start_date, self.end_date]],
            "docstatus": 1
        },
        [
            "amount",
            "custom_previous_tax",
            "custom_future_tax",
            "custom_income_from_other_sources",
            "custom_variable",
            "custom_standard_deduction",
            # "custom_pre_tax_deduction"
        ],
        as_dict=True
        )
        custom_variable = flt(getattr(tax, "custom_variable", 0) or 0)
        self.annual_taxable_amount = (
            ctc
            - self.standard_tax_exemption_amount
            - flt(assignment["custom_year_variable"])
            + custom_variable
        )
    def update_manual_income_tax(self):



        # --------------------------------------------------------
        # Current Month Income Tax from Additional Salary
        # --------------------------------------------------------
        # tax = frappe.db.sql("""
        #     SELECT amount
        #     FROM `tabAdditional Salary`
        #     WHERE
        #         employee=%s
        #         AND salary_component='Income Tax'
        #         AND payroll_date BETWEEN %s AND %s
        #         AND docstatus=1
        #     ORDER BY payroll_date DESC
        #     LIMIT 1
        # """, (
        #     self.employee,
        #     self.start_date,
        #     self.end_date
        # ), as_dict=True)
        tax = frappe.db.get_value(
        "Additional Salary",
        {
            "employee": self.employee,
            "salary_component": "Income Tax",
            "payroll_date": ["between", [self.start_date, self.end_date]],
            "docstatus": 1
        },
        [
            "amount",
            "custom_previous_tax",
            "custom_future_tax",
            "custom_income_from_other_sources",
            "custom_variable",
            "custom_standard_deduction",
            # "custom_pre_tax_deduction"
        ],
        as_dict=True
        )
        if tax:
            self.current_month_income_tax = flt(tax.amount)
            self.income_tax_deducted_till_date = flt(tax.custom_previous_tax)
            self.future_income_tax = flt(tax.custom_future_tax)
            self.income_from_other_sources = flt(tax.custom_income_from_other_sources)
            # self.tax_exemption_declaration = flt(tax.custom_tax_exemption)
            self.standard_tax_exemption_amount = flt(tax.custom_standard_deduction)
            # self.deductions_before_tax_calculation = flt(tax.custom_pre_tax_deduction)

            # self.total_income_tax = (
            #     self.income_tax_deducted_till_date
            #     + self.current_month_income_tax
            #     # + self.future_income_tax
            # )

        # current_tax = flt(tax[0].amount) if tax else 0

        # self.current_month_income_tax = current_tax

        # # --------------------------------------------------------
        # # Income Tax Deducted Till Date
        # # --------------------------------------------------------

        # previous_tax = frappe.db.sql("""
        #     SELECT SUM(sd.amount)
        #     FROM `tabSalary Detail` sd
        #     INNER JOIN `tabSalary Slip` ss
        #         ON ss.name = sd.parent
        #     WHERE
        #         ss.employee=%s
        #         AND ss.docstatus=1
        #         AND ss.end_date < %s
        #         AND sd.salary_component='Income Tax'
        # """, (
        #     self.employee,
        #     self.start_date
        # ))

        # previous_tax = flt(previous_tax[0][0]) if previous_tax and previous_tax[0][0] else 0

        # self.income_tax_deducted_till_date = previous_tax

        # # --------------------------------------------------------
        # # Salary Structure Assignment
        # # --------------------------------------------------------

        # assignment = frappe.db.get_value(
        #     "Salary Structure Assignment",
        #     {
        #         "employee": self.employee,
        #         "docstatus": 1
        #     },
        #     [
        #         "ctc",
        #         "annual_gross_earning",
        #         "income_tax_slab"
        #     ],
        #     as_dict=True
        # )

        # annual_gross = 0

        # if assignment:
        #     self.ctc = flt(assignment.ctc)
        #     annual_gross = flt(assignment.annual_gross_earning)

        #     if assignment.income_tax_slab:

        #         standard = frappe.db.get_value(
        #             "Income Tax Slab",
        #             assignment.income_tax_slab,
        #             "standard_tax_exemption_amount"
        #         ) or 0

        #         self.standard_tax_exemption_amount = flt(standard)

        # # --------------------------------------------------------
        # # Total Earnings
        # # --------------------------------------------------------

        # self.total_earnings = annual_gross

        # # --------------------------------------------------------
        # # Annual Taxable Amount
        # # --------------------------------------------------------

        # self.annual_taxable_amount = max(
        #     0,
        #     annual_gross
        #     - flt(self.standard_tax_exemption_amount)
        #     - flt(self.non_taxable_earnings)
        #     - flt(self.tax_exemption_declaration)
        #     - flt(self.deductions_before_tax_calculation)
        # )

        # # --------------------------------------------------------
        # # Total Income Tax
        # # --------------------------------------------------------
        # #
        # # Since tax is maintained manually,
        # # use Current + Previous as Total till date.
        # #
        # # If you maintain annual expected tax,
        # # replace this with that value.
        # #
        # # --------------------------------------------------------

        # self.total_income_tax = previous_tax + current_tax

        # # --------------------------------------------------------
        # # Future Income Tax
        # # --------------------------------------------------------

        # # remaining_months = max(0, 12 - self.end_date.month)
        # end_date = getdate(self.end_date)
        # remaining_months = max(0, 12 - end_date.month)

        # self.future_income_tax = current_tax * remaining_months