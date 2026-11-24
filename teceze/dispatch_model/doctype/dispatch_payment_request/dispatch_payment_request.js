
 // Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
 // For license information, please see license.txt

frappe.ui.form.on("Dispatch Payment Request", {

    billing_cost(frm) {
        calculate_billing_total(frm);
    },

    tot_cost(frm) {
        calculate_billing_total(frm);
    },

    ot_cost(frm) {
        calculate_billing_total(frm);
    },


});

function calculate_billing_total(frm) {

    // 1. Get input values
    let bill_cost = flt(frm.doc.billing_cost);
    let travel_cost = flt(frm.doc.tot_cost);
    let ot_cost = flt(frm.doc.ot_cost);
    let engineer_cost = flt(frm.doc.engineer_total);

    // 2. Calculate billing and margin
    let billing_total = bill_cost + travel_cost + ot_cost;
    let margin_value = billing_total - engineer_cost;

    // 3. Calculate margin percentage
    let margin_percentage = billing_total > 0
        ? (margin_value / billing_total) * 100
        : 0;

    // 4. Get currency
    let currency = frm.doc.billing_currency || "AED";

    // 5. Set margin color
    let margin_color = margin_value > 0 ? "#198754" :
                       margin_value < 0 ? "#dc3545" :
                       "#f0ad4e";

    // 6. Prepare margin message
    let margin_text = 
        `Margin ${format_currency(margin_value, currency)} ` +
        `${margin_percentage.toFixed(1)}% of billing. ` +
        `Engineer cost ${format_currency(engineer_cost, currency)}`;

    // 7. Update form fields
    frm.set_value("billing_total", billing_total);
    frm.set_value("margin", margin_text);

    // 8. Apply margin styling
    if (frm.fields_dict.margin && frm.fields_dict.margin.$input) {
        frm.fields_dict.margin.$input.css({
            "color": margin_color,
            "font-weight": "bold",
            "font-size": "15px"
        });
    }

}
