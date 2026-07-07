frappe.ui.form.on("Supplier Item", {
    custom_quantity: function(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        set_quotation_supplier_items(frm,cdt, cdn);
    },

    custom_price: function(frm, cdt, cdn) {
        calculate_amount(cdt, cdn);
        set_quotation_supplier_items(frm,cdt, cdn);
    },

    custom_is_selected: function(frm, cdt, cdn) {
        set_quotation_supplier_items(frm,cdt, cdn);

        let row = locals[cdt][cdn];

        if (!row.custom_is_selected) return;

        // Uncheck other suppliers for the same item
        frm.doc.custom_supplier.forEach(function(d) {
            if (
                d.name !== row.name &&
                d.custom_item === row.custom_item &&
                d.custom_is_selected
            ) {
                frappe.model.set_value(
                    d.doctype,
                    d.name,
                    "custom_is_selected",
                    0
                );
            }
        });
    }
});

function calculate_amount(cdt, cdn) {
    let row = locals[cdt][cdn];

    row.custom_amount = (flt(row.custom_quantity) || 0) * (flt(row.custom_price) || 0);

    refresh_field("custom_supplier");
}

function set_quotation_supplier_items(frm,cdt,cdn){
    let row = locals[cdt][cdn];

    if (!row.custom_is_selected) return;

    let item = frm.doc.items.find(d => d.item_code === row.custom_item);

    if (item) {

        frappe.model.set_value(item.doctype, item.name, "qty", row.custom_quantity);
        frappe.model.set_value(item.doctype, item.name, "rate", row.custom_price);
        frappe.model.set_value(item.doctype, item.name, "amount", row.custom_amount);

        set_uom(row.custom_item, item.doctype, item.name);

    } else {

        let empty_row = frm.doc.items.find(d => !d.item_code);

        if (empty_row) {

            frappe.model.set_value(empty_row.doctype, empty_row.name, "item_code", row.custom_item);
            frappe.model.set_value(empty_row.doctype, empty_row.name, "qty", row.custom_quantity);
            frappe.model.set_value(empty_row.doctype, empty_row.name, "rate", row.custom_price);
            frappe.model.set_value(empty_row.doctype, empty_row.name, "amount", row.custom_amount);

            set_uom(row.custom_item, empty_row.doctype, empty_row.name);

        } else {

            let new_row = frm.add_child("items");

            frappe.model.set_value(new_row.doctype, new_row.name, "item_code", row.custom_item);
            frappe.model.set_value(new_row.doctype, new_row.name, "qty", row.custom_quantity);
            frappe.model.set_value(new_row.doctype, new_row.name, "rate", row.custom_price);
            frappe.model.set_value(new_row.doctype, new_row.name, "amount", row.custom_amount);

            set_uom(row.custom_item, new_row.doctype, new_row.name);
        }
    }

    frm.refresh_field("items");

}

function set_uom(item_code, doctype, docname) {
    frappe.db.get_value("Item", item_code, "stock_uom")
        .then(r => {
            if (r.message) {
                frappe.model.set_value(
                    doctype,
                    docname,
                    "uom",
                    r.message.stock_uom
                );
            }
        });
}