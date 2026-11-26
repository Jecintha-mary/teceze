
 // Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
 // For license information, please see license.txt

frappe.ui.form.on("Dispatch Payment Request", {

    setup(frm) {
        add_margin_styles();
    },

    refresh(frm) {
        apply_margin_style(frm);
    },

    billing_cost(frm) {
        calculate_billing_total(frm);
    },

    tot_cost(frm) {
        calculate_billing_total(frm);
    },

    ot_cost(frm) {
        calculate_billing_total(frm);
    },
    billing_currency(frm){
        calculate_billing_total(frm);
    },
});

// -----------------------------------------------------------------
// Calculation
// -----------------------------------------------------------------
function get_margin_data(frm) {
    const bill_cost = flt(frm.doc.billing_cost);
    const travel_cost = flt(frm.doc.tot_cost);
    const ot_cost = flt(frm.doc.ot_cost);
    const engineer_cost = flt(frm.doc.engineer_total);

    const billing_total = bill_cost + travel_cost + ot_cost;
    const margin_value = billing_total - engineer_cost;
    const margin_percentage = billing_total > 0
        ? (margin_value / billing_total) * 100
        : 0;

    const currency = frm.doc.billing_currency || "AED";

    const margin_text =
        `Margin ${format_currency(margin_value, currency)} ` +
        `(${margin_percentage.toFixed(1)}% of billing). ` +
        `Engineer cost ${format_currency(engineer_cost, currency)}`;

    return { billing_total, margin_value, margin_text };
}

function calculate_billing_total(frm) {
    const data = get_margin_data(frm);

    frm.set_value("billing_total", data.billing_total)
        .then(() => frm.set_value("margin", data.margin_text))
        .then(() => apply_margin_style(frm));
}

// -----------------------------------------------------------------
// Styling
// -----------------------------------------------------------------
function apply_margin_style(frm) {
    const field = frm.fields_dict.margin;
    if (!field || !field.$wrapper) return;

    const { margin_value } = get_margin_data(frm);

    const css_class = margin_value > 0 ? "margin-positive"
                    : margin_value < 0 ? "margin-negative"
                    : "margin-zero";

    field.$wrapper
        .removeClass("margin-positive margin-negative margin-zero")
        .addClass(`margin-field ${css_class}`);
}

function add_margin_styles() {
    if (document.getElementById("dispatch-margin-styles")) return;

    const style = document.createElement("style");
    style.id = "dispatch-margin-styles";
    style.textContent = `
        .margin-field textarea,
        .margin-field .control-value,
        .margin-field .like-disabled-input {
            font-weight: bold !important;
            font-size: 15px !important;
        }

        .margin-positive textarea,
        .margin-positive .control-value,
        .margin-positive .like-disabled-input {
            color: #198754 !important;
        }

        .margin-negative textarea,
        .margin-negative .control-value,
        .margin-negative .like-disabled-input {
            color: #dc3545 !important;
        }

        .margin-zero textarea,
        .margin-zero .control-value,
        .margin-zero .like-disabled-input {
            color: #f0ad4e !important;
        }
    `;
    document.head.appendChild(style);
}