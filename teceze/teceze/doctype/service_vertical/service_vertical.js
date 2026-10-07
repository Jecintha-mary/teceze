const TABLE = "service_vertical_configuration"; // fieldname of the Table field in Service Vertical

frappe.ui.form.on("Service Vertical", {
    refresh(frm) {
        console.log("Service Vertical script loaded"); // debug, remove later
    },
});
frappe.ui.form.on("Service Vertical Configuration", {
    form_render(frm, cdt, cdn) {
        // find the table field that holds this child doctype
        const table_df = frm.meta.fields.find(
            df => df.fieldtype === "Table" && df.options === "Service Vertical Configuration"
        );
        if (!table_df) return;

        frappe.model.with_doctype("Opportunity Item", () => {
            const skip = [
                "Section Break", "Column Break", "Tab Break",
                "HTML", "Button", "Image", "Fold", "Heading"
            ];

            const options = [""]
                .concat(
                    frappe.get_meta("Opportunity Item").fields
                        .filter(df => !skip.includes(df.fieldtype))
                        .map(df => df.fieldname)
                )
                .join("\n");

            const grid_row = frm.fields_dict[table_df.fieldname].grid.grid_rows_by_docname[cdn];
            if (!grid_row || !grid_row.grid_form) return;

            ["field", "maping__column"].forEach(fn => {
                const control = grid_row.grid_form.fields_dict[fn];
                if (control) {
                    control.df.options = options;
                    control.refresh();
                }
            });
        });
    },
});