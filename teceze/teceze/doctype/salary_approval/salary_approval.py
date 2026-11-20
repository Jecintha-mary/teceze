# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import flt


class SalaryApproval(Document):

    def validate(self):

        ctc = flt(self.ctc)
        variable_percent = flt(self.variable_percent)
        employer_pf_yearly = 21600
        medical_yearly = 15000
        yearly_variable = round(
            (ctc * variable_percent) / 100
        )
        gross_salary = round(
            ctc
            - yearly_variable
            - employer_pf_yearly
            - medical_yearly
        )
        monthly_ctc = round(ctc / 12)
        monthly_gross = round(gross_salary / 12)
        monthly_variable = round(yearly_variable / 12)
        employer_pf = round(employer_pf_yearly / 12)
        medical_insurance = round(medical_yearly / 12)

        basic = round(monthly_gross * 0.50)
        hra = round(basic * 0.50)

        travelling_allowance = 1500
        food_allowance = 1200

        fixed_allowance = round(
            monthly_gross
            - (
                basic
                + hra
                + travelling_allowance
                + food_allowance
            )
        )

        employee_pf = 1800

        net_pay = round(
            monthly_gross - employee_pf
        )
 
        self.gross_salary = gross_salary
        self.employer_pf_yearly = employer_pf_yearly
        self.medical_yearly = medical_yearly
        self.yearly_variable = yearly_variable

        self.monthly_ctc = monthly_ctc
        self.monthly_gross = monthly_gross
        self.monthly_variable = monthly_variable
        self.employer_pf = employer_pf
        self.medical_insurance = medical_insurance

        self.basic = basic
        self.hra = hra
        self.travelling_allowance = travelling_allowance
        self.food_allowance = food_allowance
        self.fixed_allowance = fixed_allowance
        self.employee_pf = employee_pf
        self.net_pay = net_pay