frappe.ui.form.on("Salary Approval", {

    ctc: function(frm) {
        calculate_salary(frm);
    },

    variable_percent: function(frm) {
        calculate_salary(frm);
    }

});


function calculate_salary(frm) {

    const ctc = flt(frm.doc.ctc || 0);
    const variable_percent = flt(frm.doc.variable_percent || 0);

    if (!ctc || !variable_percent) {
        return;
    }

    const employer_pf_yearly = 21600;
    const medical_yearly = 15000;

    const yearly_variable = Math.round(
        (ctc * variable_percent) / 100
    );

    const gross_salary = Math.round(
        ctc - yearly_variable - employer_pf_yearly - medical_yearly
    );

    const monthly_ctc = Math.round(ctc / 12);
    const monthly_gross = Math.round(gross_salary / 12);
    const monthly_variable = Math.round(yearly_variable / 12);
    const employer_pf = Math.round(employer_pf_yearly / 12);
    const medical_insurance = Math.round(medical_yearly / 12);

    const basic = Math.round(monthly_gross * 0.50);
    const hra = Math.round(basic * 0.50);

    const travelling_allowance = 1500;
    const food_allowance = 1200;

    const fixed_allowance = Math.round(
        monthly_gross -
        (basic + hra + travelling_allowance + food_allowance)
    );

    const employee_pf = 1800;
    const net_pay = Math.round(monthly_gross - employee_pf);

    frm.set_value("gross_salary", gross_salary);
    frm.set_value("employer_pf_yearly", employer_pf_yearly);
    frm.set_value("medical_yearly", medical_yearly);
    frm.set_value("yearly_variable", yearly_variable);

    frm.set_value("monthly_ctc", monthly_ctc);
    frm.set_value("monthly_gross", monthly_gross);
    frm.set_value("monthly_variable", monthly_variable);
    frm.set_value("employer_pf", employer_pf);
    frm.set_value("medical_insurance", medical_insurance);

    frm.set_value("basic", basic);
    frm.set_value("hra", hra);
    frm.set_value("travelling_allowance", travelling_allowance);
    frm.set_value("food_allowance", food_allowance);
    frm.set_value("fixed_allowance", fixed_allowance);

    frm.set_value("employee_pf", employee_pf);
    frm.set_value("net_pay", net_pay);
}