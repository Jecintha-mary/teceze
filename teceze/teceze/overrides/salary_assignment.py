import frappe
@frappe.whitelist()
def validate(doc,method):
        frappe.db.set_value(
            "Employee",
            doc.employee,
            {
                "custom_basic": doc.custom_basic,
                "custom_variable": doc.custom_mon_variable,
                "custom_food_allowance": doc.custom_food_allowance,
                "custom_travel_allowance": doc.custom_travelling_allowance,
                "custom_fixed_allowance": doc.custom_fixed_allowance,
                "custom_pf": doc.custom_employer_contribution,
                "custom_variable_pay": doc.custom_mon_variable,
                
            }
        )