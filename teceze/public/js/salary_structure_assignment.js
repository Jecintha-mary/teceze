frappe.ui.form.on("Salary Structure Assignment Old File", {
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

    const pf_employer = 36000;
    const medical = 15000;
    const yearly_variable = round((ctc * variable_percent) / 100);


    // frm.set_value("custom_pf_employer_contribution", pf_employer);
    frm.set_value("custom_pf_employer_contribution", frm.doc.custom_employer_contribution*12);
    
    console.log("pf_employer",pf_employer)
    console.log(frm.doc.custom_pf_employer_contribution)
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
    const employee_pf = 3000;
    let monthly_pf = 0;


    // Gross Salary (Yearly)
    const gross = round(year_ctc - variable - pf_employer - medical);

    // Monthly Values
    const monthly_ctc = round(year_ctc / 12);
    const monthly_gross = round(gross / 12);
    const monthly_variable = round(variable / 12);
   

console.log("monthly_pf", monthly_pf);
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
//     if ((frm.doc.base - frm.doc.custom_hra) < 25000) {
//     console.log("if");
//     monthly_pf = (frm.doc.base - frm.doc.custom_hra) * 0.12;
// } else {
    console.log("else");
    monthly_pf = 3000;
// }
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



frappe.ui.form.on("Salary Structure Assignment Test File", {
    refresh(frm) {
        calculate_all(frm);
    },

    validate(frm) {
        calculate_all(frm);
    },

    custom_ctc_value(frm) {
        calculate_all(frm);
    },

    custom_variable_percent(frm) {
        calculate_all(frm);
    },

    custom_employer_contribution(frm) {
        calculate_all(frm);
    }
});

// Round helper
function round(value) {
    return Math.round(flt(value || 0));
}

// Main calculation
function calculate_all(frm) {

    const ctc = flt(frm.doc.custom_ctc_value || 0);
    const variable_percent = flt(frm.doc.custom_variable_percent || 0);

    // Fixed annual values
    const medical = 15000;

    // Annual variable
    const annual_variable = round(
        (ctc * variable_percent) / 100
    );

    // Monthly Employer PF
    const monthly_pf = 3000;

    // Annual Employer PF
    const annual_pf = round(monthly_pf * 12);

    // Annual Gross Salary
    const gross = round(
        ctc - annual_variable - annual_pf - medical
    );

    // Monthly calculations
    const monthly_ctc = round(ctc / 12);
    const monthly_variable = round(annual_variable / 12);
    const monthly_gross = round(gross / 12);
    const monthly_medical = round(medical / 12);

    // Allowances
    const travelling = 1500;
    const food = 1200;
    const employee_pf = 3000;

    // Basic and HRA
    const basic = round(monthly_gross * 0.50);
    const hra = round(basic * 0.50);

    // Fixed allowance
    const fixed = round(
        monthly_gross -
        basic -
        hra -
        travelling -
        food
    );

    // Net Pay
    const net_pay = round(monthly_gross - employee_pf);

    // Update Salary Structure Assignment fields

    // CTC
    frm.set_value("ctc", round(ctc));
    frm.set_value("custom_ctc_value", ctc);

    // Variable
    frm.set_value("custom_year_variable", annual_variable);
    frm.set_value("custom_mon_variable", monthly_variable);

    // Employer PF
    frm.set_value("custom_employer_contribution", monthly_pf);
    frm.set_value("custom_pf_employer_contribution", annual_pf);

    // Gross Salary
    frm.set_value("custom_gross_salary", gross);
    frm.set_value("base", monthly_gross);

    // Monthly CTC
    frm.set_value("custom_monthly_ctc", monthly_ctc);

    // Medical Insurance
    frm.set_value("custom_medical_insurance", medical);
    frm.set_value("custom_year_medical_insurance", monthly_medical);

    // Salary Components
    frm.set_value("custom_basic", basic);
    frm.set_value("custom_hra", hra);

    frm.set_value("custom_travelling_allowance", travelling);
    frm.set_value("custom_food_allowance", food);
    frm.set_value("custom_fixed_allowance", fixed);

    // Employee PF and Net Pay
    frm.set_value("custom_employee_pf", employee_pf);
    frm.set_value("custom_net_pay", net_pay);
}



frappe.ui.form.on("Salary Structure Assignment", {

    refresh(frm) {
        // calculate_all(frm);
    },

    custom_ctc_value(frm) {
        calculate_all(frm);
    },

    custom_variable_percent(frm) {
        calculate_all(frm);
    },

    custom_salary_calculation_type(frm) {
        calculate_all(frm);
    }

});

// ==================================
// ROUND FUNCTION
// ==================================

function round(value) {
    return Math.round(flt(value || 0));
}

// ==================================
// MAIN SALARY CALCULATION
// ==================================

function calculate_all(frm) {

    const ctc = flt(frm.doc.custom_ctc_value || 0);
    const variable_percent = flt(frm.doc.custom_variable_percent || 0);

    // Fixed Annual Values
    const medical = 15000;

    // Fixed Monthly Allowances
    const travelling = 1500;
    const food = 1200;

    // ==================================
    // ANNUAL VARIABLE
    // ==================================

    const annual_variable = round(
        (ctc * variable_percent) / 100
    );

    // Amount after variable and medical
    const annual_amount = ctc - annual_variable - medical;

    // Variables
    let gross = 0;
    let monthly_gross = 0;
    let monthly_pf = 0;
    let annual_pf = 0;
    let employee_pf = 0;

    const calculation_type =
        frm.doc.custom_salary_calculation_type || "Above 25K";

    // ==================================
    // BELOW 25K CALCULATION
    // ==================================

    if (calculation_type === "Below 25K") {

        // Basic = 50% of Gross
        // HRA = 50% of Basic
        // Employer PF = 12% of Basic + HRA

        // Gross includes Employer PF
        monthly_gross = round(
            (annual_amount / 1.09) / 12
        );

        // Annual Gross
        gross = monthly_gross * 12;

        // Basic
        const basic_temp = round(
            monthly_gross * 0.50
        );

        // HRA
        const hra_temp = round(
            basic_temp * 0.50
        );

        // Monthly Employer PF
        monthly_pf = Math.floor(
            (basic_temp + hra_temp) * 0.12
        );

        // Annual Employer PF
        annual_pf = monthly_pf * 12;

        // Employee PF
        employee_pf = monthly_pf;

    }

    // ==================================
    // ABOVE 25K CALCULATION
    // ==================================

    else {

        // Fixed Employer PF
        monthly_pf = 3000;

        // Annual Employer PF
        annual_pf = monthly_pf * 12;

        // Annual Gross
        gross = round(
            annual_amount - annual_pf
        );

        // Monthly Gross
        monthly_gross = round(
            gross / 12
        );

        // Fixed Employee PF
        employee_pf = 3000;

    }

    // ==================================
    // COMMON MONTHLY CALCULATIONS
    // ==================================

    const monthly_ctc = round(
        ctc / 12
    );

    const monthly_variable = round(
        annual_variable / 12
    );

    const monthly_medical = round(
        medical / 12
    );

    // ==================================
    // BASIC AND HRA
    // ==================================

    const basic = round(
        monthly_gross * 0.50
    );

    const hra = round(
        basic * 0.50
    );

    // ==================================
    // FIXED ALLOWANCE
    // ==================================

    const fixed = round(
        monthly_gross -
        basic -
        hra -
        travelling -
        food
    );

    // ==================================
    // NET PAY
    // ==================================

    const net_pay = round(
        monthly_gross - employee_pf
    );

    // ==================================
    // UPDATE CTC FIELDS
    // ==================================

    frm.set_value("ctc", round(ctc));

    frm.set_value(
        "custom_monthly_ctc",
        monthly_ctc
    );

    // ==================================
    // VARIABLE FIELDS
    // ==================================

    frm.set_value(
        "custom_year_variable",
        annual_variable
    );

    frm.set_value(
        "custom_mon_variable",
        monthly_variable
    );

    // ==================================
    // GROSS SALARY FIELDS
    // ==================================

    frm.set_value(
        "custom_gross_salary",
        gross
    );

    frm.set_value(
        "base",
        monthly_gross
    );

    // ==================================
    // EMPLOYER PF FIELDS
    // ==================================

    frm.set_value(
        "custom_employer_contribution",
        monthly_pf
    );

    frm.set_value(
        "custom_pf_employer_contribution",
        annual_pf
    );

    // ==================================
    // MEDICAL INSURANCE
    // ==================================

    frm.set_value(
        "custom_medical_insurance",
        medical
    );

    frm.set_value(
        "custom_year_medical_insurance",
        monthly_medical
    );

    // ==================================
    // SALARY COMPONENTS
    // ==================================

    frm.set_value(
        "custom_basic",
        basic
    );

    frm.set_value(
        "custom_hra",
        hra
    );

    frm.set_value(
        "custom_travelling_allowance",
        travelling
    );

    frm.set_value(
        "custom_food_allowance",
        food
    );

    frm.set_value(
        "custom_fixed_allowance",
        fixed
    );

    // ==================================
    // EMPLOYEE PF AND NET PAY
    // ==================================

    frm.set_value(
        "custom_employee_pf",
        employee_pf
    );

    frm.set_value(
        "custom_net_pay",
        net_pay
    );

}
