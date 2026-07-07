frappe.ui.form.on("Procurement Request", {

    refresh(frm) {

        update_procurement_status(frm);
        calculate_total(frm);

        // Recalculate total after deleting a row
        frm.fields_dict.items.grid.wrapper.on("grid-row-remove", function () {
            calculate_total(frm);
        });

    },

    validate(frm) {

        update_procurement_status(frm);
        calculate_total(frm);

    }

});


frappe.ui.form.on("Procurement Request Item", {

    qty(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    },

    unit_price(frm, cdt, cdn) {
        calculate_amount(frm, cdt, cdn);
    }

});


function calculate_amount(frm, cdt, cdn) {

    let row = locals[cdt][cdn];

    let amount = flt(row.qty) * flt(row.unit_price);

    frappe.model.set_value(cdt, cdn, "amount", amount);

    setTimeout(() => {
        calculate_total(frm);
    }, 100);

}


function calculate_total(frm) {

    let total = 0;

    (frm.doc.items || []).forEach(function (row) {
        total += flt(row.amount);
    });

    frm.set_value("total_amount", total);

}


function update_procurement_status(frm) {

    let statuses = [];

    (frm.doc.items || []).forEach(function (row) {

        if (row.status) {
            statuses.push(row.status);
        }

    });

    if (statuses.length === 0) {
        return;
    }

    if (statuses.every(status => status === "Submitted")) {

        frm.set_value("status", "Closed");

    }

    else if (statuses.every(status => status === "Approved")) {

        frm.set_value("status", "Approved");

    }

    else if (statuses.includes("Open")) {

        frm.set_value("status", "Open");

    }

    else if (
        statuses.includes("Submitted") ||
        statuses.includes("Quoted") ||
        statuses.includes("Approved")
    ) {

        frm.set_value("status", "Pending");

    }

}