frappe.ui.form.on("Salary Structure Assignment", {
    validate: function (frm) {
        if (frm.doc.custom_ctc_value) {
            frm.set_value("ctc", round(frm.doc.custom_ctc_value));
        }

        calculate_variable(frm);
        calculate_salary(frm);
    },

    custom_ctc_value: function (frm) {
        calculate_variable(frm);
        calculate_salary(frm);
    },

    custom_variable_percent: function (frm) {
        calculate_variable(frm);
        calculate_salary(frm);
    }
});

// Helper function to round values
function round(value) {
    return Math.round(flt(value || 0));
}

function calculate_variable(frm) {

    const ctc = flt(frm.doc.custom_ctc_value || 0);
    const variable_percent = flt(frm.doc.custom_variable_percent || 0);

    const pf_employer = 21600;
    const medical = 15000;
    const yearly_variable = round((ctc * variable_percent) / 100);

    frm.set_value("custom_pf_employer_contribution", pf_employer);
    frm.set_value("custom_medical_insurance", medical);
    frm.set_value("custom_year_variable", yearly_variable);
}

function calculate_salary(frm) {

    const year_ctc = flt(frm.doc.custom_ctc_value || 0);
    const variable = flt(frm.doc.custom_year_variable || 0);
    const pf_employer = flt(frm.doc.custom_pf_employer_contribution || 0);
    const medical = flt(frm.doc.custom_medical_insurance || 0);

    const travelling = 1500;
    const food = 1200;
    const employee_pf = 1800;

    // Gross Salary (Yearly)
    const gross = round(year_ctc - variable - pf_employer - medical);

    // Monthly Values
    const monthly_ctc = round(year_ctc / 12);
    const monthly_gross = round(gross / 12);
    const monthly_variable = round(variable / 12);
    const monthly_pf = round(pf_employer / 12);
    const monthly_medical = round(medical / 12);

    // Salary Components
    const basic = round(monthly_gross * 0.50);
    const hra = round(basic * 0.50);

    const fixed = round(
        monthly_gross -
        (basic + hra + travelling + food)
    );

    const net_pay = round(monthly_gross - employee_pf);

    // Set Values
    frm.set_value("custom_gross_salary", gross);

    frm.set_value("base", monthly_gross);
    frm.set_value("custom_monthly_ctc", monthly_ctc);

    frm.set_value("custom_mon_variable", monthly_variable);
    frm.set_value("custom_employer_contribution", monthly_pf);
    frm.set_value("custom_year_medical_insurance", monthly_medical);

    frm.set_value("custom_basic", basic);
    frm.set_value("custom_hra", hra);

    frm.set_value("custom_travelling_allowance", travelling);
    frm.set_value("custom_food_allowance", food);

    frm.set_value("custom_fixed_allowance", fixed);

    frm.set_value("custom_employee_pf", employee_pf);
    frm.set_value("custom_net_pay", net_pay);

    // Update CTC fields
    frm.set_value("ctc", round(year_ctc));
}