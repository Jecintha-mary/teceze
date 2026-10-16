/* =========================================================================
   QUOTATION SCRIPT

   Depends on /assets/teceze/js/oppurtunity.js (shared helpers: window.teceze)

   Sections
     1. Config
     2. Loading the shared script
     3. Supplier grid        -> which columns show, dropdown options, order
     4. Supplier <-> Item    -> matching rows and syncing the chosen supplier
     5. Form events          -> Quotation, Quotation Item, Quotation Supplier
   ========================================================================= */

(function () {
    "use strict";

    /* =====================================================================
       1. CONFIG
       ===================================================================== */

    const SHARED_SCRIPT = "/assets/teceze/js/oppurtunity.js";
    const SUPPLIER_DOCTYPE = "Quotation Supplier";
    const SUPPLIER_TABLE_DEFAULT = "custom_supplier_item";

    // Quotation Item field -> Quotation Supplier field
    const ITEM_TO_SUPPLIER = {
        custom_items: "items",
        custom_descriptions: "descriptions",
        qty: "qty",
        rate: "rate",
        custom_budget_value: "budget_value",
        hours: "hours",
        scope: "scope",
        resource: "resource",
    };

    // Supplier fields wiped when the Service Vertical changes (if no longer shown)
    const CLEARABLE = [...Object.values(ITEM_TO_SUPPLIER), "amount"];

    // [supplier field, quotation item field] copied when a supplier is selected (qty is handled separately)
    const SYNCED = [
        ["rate", "rate"],
        ["budget_value", "custom_budget_value"],
    ];

    // Quotation Item fields that change the supplier "items" dropdown
    const WATCHED_ITEM_FIELDS = [
        "custom_items", "custom_descriptions", "description",
        "scope", "resource", "item_code", "item_name",
    ];

    const trim = v => String(v ?? "").trim();

    // Name of the Quotation Supplier child table on this form
    function supplier_table(frm) {
        const field = Object.values(frm.fields_dict || {}).find(
            f => f.df.fieldtype === "Table" && f.df.options === SUPPLIER_DOCTYPE
        );
        return field ? field.df.fieldname : SUPPLIER_TABLE_DEFAULT;
    }

    const supplier_rows = frm => frm.doc[supplier_table(frm)] || [];

    /* =====================================================================
       2. LOADING THE SHARED SCRIPT
       ===================================================================== */

    let shared_ready = null;

    // Resolves once window.teceze helpers exist (loads the file only once)
    function load_shared() {
        if (window.teceze?.apply_service_vertical) return Promise.resolve();
        if (!shared_ready) shared_ready = new Promise(resolve => frappe.require(SHARED_SCRIPT, resolve));
        return shared_ready;
    }

    /* =====================================================================
       3. SUPPLIER GRID
       ===================================================================== */

    // Supplier columns to show: supplier, fields from Service Vertical, is_selected
    async function visible_fields(frm) {
        const visible = ["supplier"];

        if (frm.doc.custom_service_vertical) {
            const service = await teceze.get_cached_doc("Service Vertical", frm.doc.custom_service_vertical);
            const item_fields = frappe.get_meta("Quotation Item").fields;

            (service.required_fields || []).forEach(row => {
                const df = teceze.match_field(item_fields, row.field || row.label);
                const target = df && ITEM_TO_SUPPLIER[df.fieldname];
                if (target && !visible.includes(target)) visible.push(target);
            });
        }

        visible.push("is_selected"); // always last
        return visible;
    }

    // Unique, non-empty "custom_items" values -> dropdown options for supplier "items"
    function item_values(frm) {
        return [...new Set((frm.doc.items || []).map(row => trim(row.custom_items)).filter(Boolean))];
    }

    function clear_hidden_values(frm, table, shown) {
        (frm.doc[table] || []).forEach(row => {
            CLEARABLE.forEach(field => {
                if (!shown.includes(field) && field in row) row[field] = null;
            });
            row.item_row_reference = "";
        });
    }

    // Persist the column order so the grid keeps it
    async function save_grid_order(frm, order, columns) {
        const current = frappe.get_user_settings(frm.doctype, "GridView") || {};
        const old_order = (current[SUPPLIER_DOCTYPE] || []).map(x => x.fieldname);
        if (old_order.join(",") === order.join(",")) return;

        const settings = {
            ...current,
            [SUPPLIER_DOCTYPE]: order.map(fieldname => ({ fieldname, columns })),
        };

        try {
            const result = await frappe.model.user_settings.save(frm.doctype, "GridView", settings);
            frappe.model.user_settings[frm.doctype] = result.message || result;
        } catch (error) {
            console.warn("Could not save grid settings:", error);
        }
    }

    async function apply_supplier_grid(frm, clear_hidden = false) {
        const table = supplier_table(frm);
        const grid = frm.fields_dict[table]?.grid;
        if (!grid) return;

        // Newer call wins if two run at once
        const run = (frm.__qs_run = (frm.__qs_run || 0) + 1);

        const fields = teceze.value_fields(SUPPLIER_DOCTYPE);
        const visible = await visible_fields(frm);
        if (run !== frm.__qs_run) return;

        const order = visible.filter(name => fields.some(df => df.fieldname === name));
        const columns = Math.max(1, Math.floor(12 / order.length));
        const set = (field, prop, value) => grid.update_docfield_property(field, prop, value);

        // "items" is a dropdown of Quotation Item values, "descriptions" is plain text
        set("items", "fieldtype", "Select");
        set("items", "options", "\n" + item_values(frm).join("\n"));
        set("descriptions", "fieldtype", "Data");

        // Show / hide columns
        fields.forEach(df => {
            const show = order.includes(df.fieldname);
            set(df.fieldname, "hidden", show ? 0 : 1);
            set(df.fieldname, "in_list_view", show ? 1 : 0);
            if (show) set(df.fieldname, "columns", columns);
        });

        if (frappe.meta.has_field(SUPPLIER_DOCTYPE, "amount")) set("amount", "read_only", 1);

        if (clear_hidden) clear_hidden_values(frm, table, order);

        await save_grid_order(frm, order, columns);
        if (run !== frm.__qs_run) return;

        grid.visible_columns = undefined;
        grid.user_defined_columns = [];
        grid.reset_grid ? grid.reset_grid() : grid.refresh();
    }

    /* =====================================================================
       4. SUPPLIER <-> QUOTATION ITEM
       ===================================================================== */

    // Quotation Item whose "custom_items" matches the supplier row's "items"
    function find_item(frm, supplier_row) {
        const key = trim(supplier_row?.items);
        if (!key) return null;
        return (frm.doc.items || []).find(item => trim(item.custom_items) === key) || null;
    }

    // Link a supplier row to its item and copy the description (clears both if no match)
    function link_to_item(cdt, cdn, item) {
        frappe.model.set_value(cdt, cdn, "item_row_reference", item ? item.name : "");
        frappe.model.set_value(cdt, cdn, "descriptions", item ? item.custom_descriptions || "" : "");
    }

    // Copy qty / rate / budget of the SELECTED supplier onto the Quotation Item
    function sync_to_quotation(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row.is_selected || !row.items) return;

        const item = find_item(frm, row);
        if (!item) return;

        const set_item = (field, value) => frappe.model.set_value(item.doctype, item.name, field, value);

        if (row.item_row_reference !== item.name) {
            frappe.model.set_value(cdt, cdn, "item_row_reference", item.name);
        }

        // Quantity defaults to 1 when empty or zero
        const qty = flt(row.qty) > 0 ? flt(row.qty) : 1;
        row.qty = qty;
        set_item("qty", qty);

        SYNCED.forEach(([supplier_field, item_field]) => {
            const value = row[supplier_field];
            if (value !== undefined && value !== null) set_item(item_field, flt(value));
        });

        frm.refresh_field("items");
        frm.refresh_field(supplier_table(frm));
    }

    // Undo a selection and tell the user why
    function reject_selection(cdt, cdn, message) {
        frappe.msgprint(__(message));
        frappe.model.set_value(cdt, cdn, "is_selected", 0);
    }

    /* =====================================================================
       5. FORM EVENTS
       ===================================================================== */

    // Full refresh: Quotation Item columns + Item on rows + supplier grid
    const run_full_refresh = frappe.utils.debounce(async frm => {
        // Read the flag NOW: several events can fire within the debounce window,
        // and only the last call's arguments survive (a "clear" request must not be lost)
        const clear_hidden = !!frm.__qs_clear_hidden;
        frm.__qs_clear_hidden = false;

        try {
            await load_shared();
            await teceze.apply_service_vertical(frm);
            await apply_supplier_grid(frm, clear_hidden);
        } catch (error) {
            console.error("Quotation refresh failed:", error);
        }
    }, 200);

    function refresh_all(frm, clear_hidden = false) {
        if (clear_hidden) frm.__qs_clear_hidden = true;
        run_full_refresh(frm);
    }

    // Light refresh: only the supplier grid (used while typing in item fields)
    const run_supplier_refresh = frappe.utils.debounce(async frm => {
        try {
            await load_shared();
            await apply_supplier_grid(frm);
        } catch (error) {
            console.error("Supplier grid refresh failed:", error);
        }
    }, 300);

    // NOTE: Frappe calls handlers as (frm, cdt, cdn). Always wrap them like
    // `frm => refresh_all(frm)` so cdt is never mistaken for an extra argument.
    frappe.ui.form.on("Quotation", {
        refresh: frm => refresh_all(frm),
        onload_post_render: frm => refresh_all(frm),
        after_save: frm => refresh_all(frm),
        items_remove: frm => run_supplier_refresh(frm),

        // New row -> give it the Item straight away, then refresh the grids
        items_add(frm, cdt, cdn) {
            window.teceze?.fill_row?.(frm, locals[cdt][cdn]);
            refresh_all(frm);
        },

        custom_service_vertical(frm) {
            frm.sv_item = null;
            refresh_all(frm, true);
        },

        // Set the Item and a default qty BEFORE the server checks the rows
        async validate(frm) {
            await load_shared();

            (frm.doc.items || []).forEach(item => {
                if (flt(item.qty) <= 0) item.qty = 1;
            });

            await teceze.validate_items(frm, true);
        },

        // "Sent To Sales" -> move the linked Opportunity to "Quotation Submitted" first
        async before_workflow_action(frm) {
            if (frm.selected_workflow_action !== "Sent To Sales") return;

            await load_shared();

            if (!frm.doc.opportunity) {
                frappe.throw(__("Opportunity is not linked to this Quotation."));
            }

            try {
                const r = await teceze.set_values("Opportunity", frm.doc.opportunity, {
                    workflow_state: "Quotation Submitted",
                    status: "Quotation",
                    custom_quotation_number: frm.doc.name,
                });
                if (!r.message) throw new Error("No response");

                frappe.show_alert({ message: __("Opportunity updated successfully."), indicator: "green" });
            } catch (error) {
                console.error(error);
                frappe.throw(
                    __("Could not update the Opportunity. The Quotation workflow transition was not completed.")
                );
            }
        },
    });

    frappe.ui.form.on(
        "Quotation Item",
        Object.fromEntries(WATCHED_ITEM_FIELDS.map(field => [field, frm => run_supplier_refresh(frm)]))
    );

    frappe.ui.form.on(SUPPLIER_DOCTYPE, {
        items(frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            const item = find_item(frm, row);

            link_to_item(cdt, cdn, item);
            if (item && row.is_selected) sync_to_quotation(frm, cdt, cdn);
        },

        qty: sync_to_quotation,
        rate: sync_to_quotation,
        budget_value: sync_to_quotation,

        is_selected(frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (!row.is_selected) return;

            if (!row.items) return reject_selection(cdt, cdn, "Select the item first.");

            const item = find_item(frm, row);
            if (!item) return reject_selection(cdt, cdn, "Selected item was not found in Quotation Items.");

            link_to_item(cdt, cdn, item);

            // Only one selected supplier per item
            supplier_rows(frm).forEach(other => {
                if (other.name !== row.name && other.is_selected && other.item_row_reference === item.name) {
                    frappe.model.set_value(other.doctype, other.name, "is_selected", 0);
                }
            });

            sync_to_quotation(frm, cdt, cdn);
        },
    });
})();