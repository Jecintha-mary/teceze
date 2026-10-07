(function () {

    // =========================================================
    // CONFIG
    // =========================================================

    const SUPPLIER_DOCTYPE = "Quotation Supplier";
    const SUPPLIER_TABLE_DEFAULT = "custom_supplier_item";


    // Quotation Item field -> Quotation Supplier field
    const QUOTATION_ITEM_TO_SUPPLIER = {

        custom_items: "items",

        custom_descriptions: "descriptions",

        qty: "qty",

        rate: "rate",

        custom_budget_value: "budget_value",

        hours: "hours",

        scope: "scope",

        resource: "resource"

    };


    // =========================================================
    // GET SUPPLIER TABLE
    // =========================================================

    function qs_table(frm) {

        const field = Object.values(
            frm.fields_dict || {}
        ).find(
            df =>
                df.df.fieldtype === "Table" &&
                df.df.options === SUPPLIER_DOCTYPE
        );

        return field
            ? field.df.fieldname
            : SUPPLIER_TABLE_DEFAULT;
    }


    // =========================================================
    // HELPERS
    // =========================================================

    const clean = value =>
        String(value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");


    const refresh_options =
        frappe.utils.debounce(
            frm => qs_apply(frm),
            300
        );


    // =========================================================
    // FULL REFRESH
    // =========================================================

    const refresh_all =
        frappe.utils.debounce(
            (frm, clear_hidden = false) => {

                frappe.require(
                    "/assets/teceze/js/oppurtunity.js",
                    function () {

                        console.log(
                            "oppurtunity.js loaded"
                        );


                        // Existing Opportunity Item logic
                        if (
                            typeof load_service_vertical_items ===
                            "function"
                        ) {

                            load_service_vertical_items(
                                frm
                            );

                        }


                        // Supplier grid
                        qs_apply(
                            frm,
                            !!clear_hidden,
                            true
                        );

                    }
                );

            },
            200
        );


    // =========================================================
    // QUOTATION EVENTS
    // =========================================================

    frappe.ui.form.on("Quotation", {

        refresh(frm) {

            refresh_all(frm);

            load_quotation_service_vertical_items(
                frm
            );

        },


        onload_post_render(frm) {

            refresh_all(frm);

            load_quotation_service_vertical_items(
                frm
            );

        },


        after_save(frm) {

            refresh_all(frm);

            load_quotation_service_vertical_items(
                frm
            );

        },


        custom_service_vertical(frm) {

            refresh_all(
                frm,
                true
            );

            load_quotation_service_vertical_items(
                frm
            );

        },


        items_add(frm) {

            refresh_options(frm);

            load_quotation_service_vertical_items(
                frm
            );

        },


        items_remove(frm) {

            refresh_options(frm);

        }

    });


    // =========================================================
    // QUOTATION ITEM EVENTS
    // =========================================================

    frappe.ui.form.on(
        "Quotation Item",
        {

            custom_items(frm) {

                refresh_options(frm);

            },


            custom_descriptions(frm) {

                refresh_options(frm);

            },


            description(frm) {

                refresh_options(frm);

            },


            scope(frm) {

                refresh_options(frm);

            },


            resource(frm) {

                refresh_options(frm);

            },


            item_code(frm) {

                refresh_options(frm);

            },


            item_name(frm) {

                refresh_options(frm);

            }

        }
    );


    // =========================================================
    // SERVICE VERTICAL CACHE
    // =========================================================

    const sv_cache = {};


    async function qs_get_vertical(name) {

        if (!sv_cache[name]) {

            sv_cache[name] =
                await frappe.db.get_doc(
                    "Service Vertical",
                    name
                );

        }

        return sv_cache[name];
    }


    // =========================================================
    // GET VISIBLE SUPPLIER FIELDS
    // =========================================================

    async function qs_visible_fields(frm) {

        const visible = [
            "supplier"
        ];


        // No Service Vertical
        if (!frm.doc.custom_service_vertical) {

            visible.push(
                "is_selected"
            );

            return visible;
        }


        const service =
            await qs_get_vertical(
                frm.doc.custom_service_vertical
            );


        const quotation_item_fields =
            frappe.get_meta(
                "Quotation Item"
            ).fields;


        // -----------------------------------------------------
        // Read Service Vertical required fields
        // -----------------------------------------------------

        (service.required_fields || [])
            .forEach(row => {

                const raw =
                    row.field ||
                    row.label;


                if (!raw) {
                    return;
                }


                const key =
                    clean(raw);


                // Find field in Quotation Item
                const quotation_item_field =
                    quotation_item_fields.find(
                        df =>
                            clean(
                                df.fieldname
                            ) === key ||

                            clean(
                                df.label
                            ) === key
                    );


                if (!quotation_item_field) {

                    console.warn(
                        "Service Vertical field not found in Quotation Item:",
                        raw
                    );

                    return;
                }


                // Map Quotation Item field
                // to Supplier field
                const supplier_field =
                    QUOTATION_ITEM_TO_SUPPLIER[
                        quotation_item_field.fieldname
                    ];


                if (!supplier_field) {

                    console.warn(
                        "No Supplier mapping for Quotation Item field:",
                        quotation_item_field.fieldname
                    );

                    return;
                }


                if (
                    !visible.includes(
                        supplier_field
                    )
                ) {

                    visible.push(
                        supplier_field
                    );

                }

            });


        // -----------------------------------------------------
        // is_selected ALWAYS LAST
        // -----------------------------------------------------

        visible.push(
            "is_selected"
        );


        console.log(
            "Quotation Supplier visible fields:",
            visible
        );


        return visible;
    }


    // =========================================================
    // GET QUOTATION ITEM ROWS
    // =========================================================

    function qs_get_item_rows(frm) {

        return frm.doc.items || [];

    }


    // =========================================================
    // GET ITEM DROPDOWN VALUES
    // =========================================================

    function qs_get_item_values(frm) {

        const rows =
            qs_get_item_rows(frm);


        return [
            ...new Set(

                rows
                    .map(
                        row =>
                            row.custom_items
                    )
                    .filter(Boolean)
                    .map(
                        value =>
                            String(value).trim()
                    )
                    .filter(Boolean)

            )
        ];

    }


    // =========================================================
    // FIND QUOTATION ITEM
    // =========================================================

    function qs_find_quotation_item(
        frm,
        supplier_row
    ) {

        if (
            !supplier_row ||
            !supplier_row.items
        ) {

            return null;

        }


        return (
            frm.doc.items || []
        ).find(
            item =>
                String(
                    item.custom_items || ""
                ).trim() ===
                String(
                    supplier_row.items || ""
                ).trim()
        ) || null;

    }


    // =========================================================
    // APPLY SUPPLIER GRID
    // =========================================================

    async function qs_apply(
        frm,
        clear_hidden = false,
        force = false
    ) {

        const table =
            qs_table(frm);


        const grid =
            frm.fields_dict[
                table
            ]?.grid;


        if (!grid) {
            return;
        }


        // -----------------------------------------------------
        // GET VISIBLE FIELDS
        // -----------------------------------------------------

        const visible =
            await qs_visible_fields(
                frm
            );


        frm.__qs_visible =
            visible;


        // -----------------------------------------------------
        // SUPPLIER META
        // -----------------------------------------------------

        const fields =
            frappe
                .get_meta(
                    SUPPLIER_DOCTYPE
                )
                .fields
                .filter(
                    df =>
                        !frappe.model
                            .no_value_type
                            .includes(
                                df.fieldtype
                            )
                );


        // -----------------------------------------------------
        // ITEMS = DROPDOWN
        // -----------------------------------------------------

        grid.update_docfield_property(
            "items",
            "fieldtype",
            "Select"
        );


        // -----------------------------------------------------
        // DESCRIPTIONS = NORMAL DATA
        // -----------------------------------------------------

        grid.update_docfield_property(
            "descriptions",
            "fieldtype",
            "Data"
        );


        // -----------------------------------------------------
        // ITEM DROPDOWN OPTIONS
        // -----------------------------------------------------

        const item_values =
            qs_get_item_values(
                frm
            );


        console.log(
            "Quotation Item custom_items:",
            item_values
        );


        grid.update_docfield_property(
            "items",
            "options",
            "\n" +
            item_values.join("\n")
        );


        // -----------------------------------------------------
        // GRID ORDER
        //
        // Supplier
        // Dynamic fields
        // is_selected
        // -----------------------------------------------------

        const order = [

            "supplier",

            ...visible.filter(
                field =>
                    ![
                        "supplier",
                        "is_selected"
                    ].includes(field)
            ),

            "is_selected"

        ];


        const valid_order =
            order.filter(
                field =>
                    fields.some(
                        df =>
                            df.fieldname === field
                    )
            );


        console.log(
            "Quotation Supplier Grid Order:",
            valid_order
        );


        // -----------------------------------------------------
        // COLUMN WIDTH
        // -----------------------------------------------------

        const columns =
            Math.max(
                1,
                Math.floor(
                    12 /
                    Math.max(
                        valid_order.length,
                        1
                    )
                )
            );


        // -----------------------------------------------------
        // SHOW / HIDE FIELDS
        // -----------------------------------------------------

        fields.forEach(df => {

            const show =
                valid_order.includes(
                    df.fieldname
                );


            grid.update_docfield_property(
                df.fieldname,
                "hidden",
                show ? 0 : 1
            );


            grid.update_docfield_property(
                df.fieldname,
                "in_list_view",
                show ? 1 : 0
            );


            if (show) {

                grid.update_docfield_property(
                    df.fieldname,
                    "columns",
                    columns
                );

            }

        });


        // -----------------------------------------------------
        // AMOUNT READ ONLY
        // -----------------------------------------------------

        if (
            frappe.meta.has_field(
                SUPPLIER_DOCTYPE,
                "amount"
            )
        ) {

            grid.update_docfield_property(
                "amount",
                "read_only",
                1
            );

        }


        // -----------------------------------------------------
        // CLEAR FIELDS WHEN SERVICE VERTICAL CHANGES
        // -----------------------------------------------------

        if (clear_hidden) {

            (
                frm.doc[table] || []
            ).forEach(row => {

                [
                    "items",
                    "descriptions",
                    "rate",
                    "qty",
                    "hours",
                    "scope",
                    "resource",
                    "budget_value",
                    "amount"
                ].forEach(
                    fieldname => {

                        if (
                            !valid_order.includes(
                                fieldname
                            )
                        ) {

                            if (
                                Object.prototype
                                    .hasOwnProperty
                                    .call(
                                        row,
                                        fieldname
                                    )
                            ) {

                                row[fieldname] =
                                    null;

                            }

                        }

                    }
                );


                row.item_row_reference =
                    "";

            });

        }


        // -----------------------------------------------------
        // SAVE GRID ORDER
        // -----------------------------------------------------

        const current =
            frappe.get_user_settings(
                frm.doctype,
                "GridView"
            ) || {};


        const old =
            current[
                SUPPLIER_DOCTYPE
            ] || [];


        const old_order =
            old.map(
                x =>
                    x.fieldname
            );


        if (
            old_order.join(",") !==
            valid_order.join(",")
        ) {

            const settings = {

                ...current,

                [SUPPLIER_DOCTYPE]:
                    valid_order.map(
                        fieldname => ({
                            fieldname,
                            columns
                        })
                    )

            };


            try {

                const result =
                    await frappe.model
                        .user_settings
                        .save(
                            frm.doctype,
                            "GridView",
                            settings
                        );


                frappe.model
                    .user_settings[
                        frm.doctype
                    ] =
                    result.message ||
                    result;

            }
            catch (error) {

                console.warn(
                    "Could not save grid settings:",
                    error
                );

            }

        }


        // -----------------------------------------------------
        // REBUILD GRID
        // -----------------------------------------------------

        grid.visible_columns =
            undefined;


        grid.user_defined_columns =
            [];


        if (
            typeof grid.reset_grid ===
            "function"
        ) {

            grid.reset_grid();

        }
        else {

            grid.refresh();

        }


        frm.__qs_signature =
            valid_order.join(",");

    }


    // =========================================================
    // QUOTATION SUPPLIER EVENTS
    // =========================================================

    frappe.ui.form.on(
        SUPPLIER_DOCTYPE,
        {

            // -------------------------------------------------
            // ITEM SELECTED
            // -------------------------------------------------

            items(frm, cdt, cdn) {

                const row =
                    locals[cdt][cdn];


                const item =
                    qs_find_quotation_item(
                        frm,
                        row
                    );


                // No matching item
                if (!item) {

                    frappe.model.set_value(
                        cdt,
                        cdn,
                        "item_row_reference",
                        ""
                    );


                    frappe.model.set_value(
                        cdt,
                        cdn,
                        "descriptions",
                        ""
                    );


                    return;
                }


                // -------------------------------------------------
                // SAVE ITEM REFERENCE
                // -------------------------------------------------

                frappe.model.set_value(
                    cdt,
                    cdn,
                    "item_row_reference",
                    item.name
                );


                // -------------------------------------------------
                // AUTO FILL DESCRIPTION
                //
                // Quotation Item:
                // custom_descriptions
                //
                // Supplier:
                // descriptions
                // -------------------------------------------------

                frappe.model.set_value(
                    cdt,
                    cdn,
                    "descriptions",
                    item.custom_descriptions || ""
                );


                // -------------------------------------------------
                // IF ALREADY SELECTED
                // SYNC QTY / RATE
                // -------------------------------------------------

                if (row.is_selected) {

                    qs_sync_to_quotation(
                        frm,
                        cdt,
                        cdn
                    );

                }

            },


            // -------------------------------------------------
            // QTY
            // -------------------------------------------------

            qty(frm, cdt, cdn) {

                qs_sync_to_quotation(
                    frm,
                    cdt,
                    cdn
                );

            },


            // -------------------------------------------------
            // RATE
            // -------------------------------------------------

            rate(frm, cdt, cdn) {

                qs_sync_to_quotation(
                    frm,
                    cdt,
                    cdn
                );

            },


            // -------------------------------------------------
            // DESCRIPTION
            //
            // Normal Data field.
            // User can manually edit it.
            // -------------------------------------------------

            descriptions(frm, cdt, cdn) {

                const row =
                    locals[cdt][cdn];


                console.log(
                    "Supplier Description changed:",
                    row.descriptions
                );

            },


            // -------------------------------------------------
            // IS SELECTED
            // -------------------------------------------------

            is_selected(frm, cdt, cdn) {

                const row =
                    locals[cdt][cdn];


                // Unselected
                if (!row.is_selected) {
                    return;
                }


                // No item selected
                if (!row.items) {

                    frappe.msgprint(
                        __(
                            "Select the item first."
                        )
                    );


                    frappe.model.set_value(
                        cdt,
                        cdn,
                        "is_selected",
                        0
                    );


                    return;
                }


                // Find matching Quotation Item
                const item =
                    qs_find_quotation_item(
                        frm,
                        row
                    );


                if (!item) {

                    frappe.msgprint(
                        __(
                            "Selected item was not found in Quotation Items."
                        )
                    );


                    frappe.model.set_value(
                        cdt,
                        cdn,
                        "is_selected",
                        0
                    );


                    return;
                }


                // -------------------------------------------------
                // SAVE REFERENCE
                // -------------------------------------------------

                frappe.model.set_value(
                    cdt,
                    cdn,
                    "item_row_reference",
                    item.name
                );


                // -------------------------------------------------
                // AUTO FILL DESCRIPTION
                // -------------------------------------------------

                frappe.model.set_value(
                    cdt,
                    cdn,
                    "descriptions",
                    item.custom_descriptions || ""
                );


                // -------------------------------------------------
                // ONLY ONE SUPPLIER
                // FOR SAME ITEM
                // -------------------------------------------------

                (
                    frm.doc[
                        qs_table(frm)
                    ] || []
                ).forEach(
                    supplier_row => {

                        if (
                            supplier_row.name !==
                                row.name &&

                            supplier_row.is_selected &&

                            supplier_row.item_row_reference ===
                                item.name
                        ) {

                            frappe.model.set_value(
                                supplier_row.doctype,
                                supplier_row.name,
                                "is_selected",
                                0
                            );

                        }

                    }
                );


                // -------------------------------------------------
                // SYNC TO QUOTATION ITEM
                // -------------------------------------------------

                qs_sync_to_quotation(
                    frm,
                    cdt,
                    cdn
                );

            }

        }
    );


   function qs_sync_to_quotation(
    frm,
    cdt,
    cdn
) {

    const row = locals[cdt][cdn];

    // Only selected supplier
    if (!row.is_selected) {
        return;
    }

    // No item selected
    if (!row.items) {
        return;
    }

    // Find matching Quotation Item
    const item =
        qs_find_quotation_item(
            frm,
            row
        );

    if (!item) {
        return;
    }


    // -----------------------------------------------------
    // SAVE ITEM REFERENCE
    // -----------------------------------------------------

    if (
        row.item_row_reference !==
        item.name
    ) {

        frappe.model.set_value(
            cdt,
            cdn,
            "item_row_reference",
            item.name
        );

    }


    // -----------------------------------------------------
    // QTY → QUOTATION ITEM QTY
    // -----------------------------------------------------

    if (
        row.qty !== undefined &&
        row.qty !== null
    ) {

        frappe.model.set_value(
            item.doctype,
            item.name,
            "qty",
            flt(row.qty)
        );

    }


    // -----------------------------------------------------
    // RATE → QUOTATION ITEM RATE
    // -----------------------------------------------------

    if (
        row.rate !== undefined &&
        row.rate !== null
    ) {

        frappe.model.set_value(
            item.doctype,
            item.name,
            "rate",
            flt(row.rate)
        );

    }



    if (
        row.budget_value !== undefined &&
        row.budget_value !== null
    ) {

        frappe.model.set_value(
            item.doctype,
            item.name,
            "custom_budget_value",
            flt(row.budget_value)
        );

    }


    frm.refresh_field(
        "items"
    );

}


async function load_quotation_service_vertical_items(
        frm
    ) {

        const grid =
            frm.fields_dict.items?.grid;


        if (!grid) {
            return;
        }


        if (
            !frm.doc.custom_service_vertical
        ) {

            return;
        }


        try {

            const service =
                await frappe.db.get_doc(
                    "Service Vertical",
                    frm.doc.custom_service_vertical
                );


            const config =
                service.required_fields || [];


            console.log(
                service.name,
                "required_fields:",
                config
            );

            if (service.item_name) {

                let item =
                    await frappe.db.get_value(
                        "Item",
                        service.item_name,
                        [
                            "name",
                            "item_code",
                            "item_name",
                            "stock_uom"
                        ]
                    );


                if (
                    !item.message?.name
                ) {

                    item =
                        await frappe.db.insert({

                            doctype: "Item",

                            item_code:
                                service.item_name,

                            item_name:
                                service.item_name,

                            item_group:
                                "All Item Groups",

                            stock_uom:
                                "Nos",

                            is_stock_item: 0,

                            is_sales_item: 1,

                            is_purchase_item: 0

                        });

                }
                else {

                    item =
                        item.message;

                }


                // -------------------------------------------------
                // APPLY ITEM TO QUOTATION ITEMS
                // -------------------------------------------------

                (
                    frm.doc.items || []
                ).forEach(row => {

                    row.item_code =
                        item.item_code ||
                        service.item_name;


                    row.item_name =
                        item.item_name ||
                        service.item_name;


                    if (
                        item.stock_uom
                    ) {

                        row.uom =
                            item.stock_uom;

                    }

                });


                frm.refresh_field(
                    "items"
                );

            }


            // -------------------------------------------------
            // QUOTATION ITEM META
            // -------------------------------------------------

            const fields =
                frappe
                    .get_meta(
                        "Quotation Item"
                    )
                    .fields
                    .filter(
                        df =>
                            !frappe.model
                                .no_value_type
                                .includes(
                                    df.fieldtype
                                )
                    );


            const chosen = {};


            // -------------------------------------------------
            // FIND CONFIGURED FIELDS
            // -------------------------------------------------

            config.forEach(row => {

                const value =
                    row.field;


                if (!value) {
                    return;
                }


                const normalized =
                    String(value)
                        .trim()
                        .toLowerCase()
                        .replace(
                            /[\s_-]+/g,
                            ""
                        );


                const df =
                    fields.find(
                        field => {

                            const fieldname =
                                String(
                                    field.fieldname
                                )
                                    .trim()
                                    .toLowerCase()
                                    .replace(
                                        /[\s_-]+/g,
                                        ""
                                    );


                            const label =
                                String(
                                    field.label || ""
                                )
                                    .trim()
                                    .toLowerCase()
                                    .replace(
                                        /[\s_-]+/g,
                                        ""
                                    );


                            return (
                                fieldname ===
                                    normalized ||

                                label ===
                                    normalized
                            );

                        }
                    );


                if (df) {

                    chosen[
                        df.fieldname
                    ] = row;

                }

            });


            console.log(
                "Quotation Item - Visible Fields:",
                Object.keys(chosen)
            );


            console.log(
                "Service Vertical Config Fields:",
                config
                    .map(
                        row =>
                            row.field
                    )
                    .filter(Boolean)
            );


            // -------------------------------------------------
            // APPLY VISIBILITY
            // -------------------------------------------------

            fields.forEach(df => {

                const cfg =
                    chosen[
                        df.fieldname
                    ];


                const show =
                    !!cfg;


                grid.update_docfield_property(
                    df.fieldname,
                    "hidden",
                    show ? 0 : 1
                );


                grid.update_docfield_property(
                    df.fieldname,
                    "in_list_view",
                    show ? 1 : 0
                );


                if (cfg) {

                    grid.update_docfield_property(
                        df.fieldname,
                        "reqd",
                        cfg.mandatory
                            ? 1
                            : 0
                    );

                }

            });


            // -------------------------------------------------
            // REBUILD QUOTATION ITEM GRID
            // -------------------------------------------------

            grid.visible_columns =
                undefined;


            if (
                typeof grid.reset_grid ===
                "function"
            ) {

                grid.reset_grid();

            }
            else {

                grid.refresh();

            }

        }
        catch (error) {

            console.error(
                "Quotation Service Vertical Item Error:",
                error
            );

        }

    }

})();









// frappe.ui.form.on("Supplier Item", {
//     custom_quantity: function(frm, cdt, cdn) {
//         calculate_amount(cdt, cdn);
//         set_quotation_supplier_items(frm,cdt, cdn);
//     },

//     custom_price: function(frm, cdt, cdn) {
//         calculate_amount(cdt, cdn);
//         set_quotation_supplier_items(frm,cdt, cdn);
//     },

//     custom_is_selected: function(frm, cdt, cdn) {
//         set_quotation_supplier_items(frm,cdt, cdn);

//         let row = locals[cdt][cdn];

//         if (!row.custom_is_selected) return;

//         // Uncheck other suppliers for the same item
//         frm.doc.custom_supplier.forEach(function(d) {
//             if (
//                 d.name !== row.name &&
//                 d.custom_item === row.custom_item &&
//                 d.custom_is_selected
//             ) {
//                 frappe.model.set_value(
//                     d.doctype,
//                     d.name,
//                     "custom_is_selected",
//                     0
//                 );
//             }
//         });
//     }
// });

// function calculate_amount(cdt, cdn) {
//     let row = locals[cdt][cdn];

//     row.custom_amount = (flt(row.custom_quantity) || 0) * (flt(row.custom_price) || 0);

//     refresh_field("custom_supplier");
// }

// function set_quotation_supplier_items(frm,cdt,cdn){
//     let row = locals[cdt][cdn];

//     if (!row.custom_is_selected) return;

//     let item = frm.doc.items.find(d => d.item_code === row.custom_item);

//     if (item) {

//         frappe.model.set_value(item.doctype, item.name, "qty", row.custom_quantity);
//         frappe.model.set_value(item.doctype, item.name, "rate", row.custom_price);
//         frappe.model.set_value(item.doctype, item.name, "amount", row.custom_amount);

//         set_uom(row.custom_item, item.doctype, item.name);

//     } else {

//         let empty_row = frm.doc.items.find(d => !d.item_code);

//         if (empty_row) {

//             frappe.model.set_value(empty_row.doctype, empty_row.name, "item_code", row.custom_item);
//             frappe.model.set_value(empty_row.doctype, empty_row.name, "qty", row.custom_quantity);
//             frappe.model.set_value(empty_row.doctype, empty_row.name, "rate", row.custom_price);
//             frappe.model.set_value(empty_row.doctype, empty_row.name, "amount", row.custom_amount);

//             set_uom(row.custom_item, empty_row.doctype, empty_row.name);

//         } else {

//             let new_row = frm.add_child("items");

//             frappe.model.set_value(new_row.doctype, new_row.name, "item_code", row.custom_item);
//             frappe.model.set_value(new_row.doctype, new_row.name, "qty", row.custom_quantity);
//             frappe.model.set_value(new_row.doctype, new_row.name, "rate", row.custom_price);
//             frappe.model.set_value(new_row.doctype, new_row.name, "amount", row.custom_amount);

//             set_uom(row.custom_item, new_row.doctype, new_row.name);
//         }
//     }

//     frm.refresh_field("items");

// }

// function set_uom(item_code, doctype, docname) {
//     frappe.db.get_value("Item", item_code, "stock_uom")
//         .then(r => {
//             if (r.message) {
//                 frappe.model.set_value(
//                     doctype,
//                     docname,
//                     "uom",
//                     r.message.stock_uom
//                 );
//             }
//         });
// }