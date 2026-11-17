/* =========================================================================
   OPPORTUNITY SCRIPT  (/assets/teceze/js/oppurtunity.js)

     1. Shared helpers      -> window.teceze (Quotation uses them too)
     2. Service Vertical    -> item columns + automatic Item on every row
     3. Opportunity UI      -> pipeline, quotation items, clarifications
     4. Form events         -> ONE handler block for the Opportunity doctype
   ========================================================================= */

window.teceze = window.teceze || {};

(function (ns) {
    "use strict";

    // Loaded twice (Quotation requires it too) -> register everything only once
    if (ns.loaded) return;
    ns.loaded = true;

    /* =====================================================================
       1. SHARED HELPERS
       ===================================================================== */

    const ITEM_TABLE = "items";
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    const esc = v => frappe.utils.escape_html(String(v ?? ""));
    const is_blank = v => v === null || v === undefined || v === "";

    // "Hours Worked" / "hours_worked" / "hours-worked" -> "hoursworked"
    const norm = v => String(v ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    // Fields that hold a value (no Section Break, Column Break, ...)
    const value_fields = doctype =>
        frappe.get_meta(doctype).fields.filter(df => !frappe.model.no_value_type.includes(df.fieldtype));

    // Find a field by fieldname OR label
    const match_field = (fields, name) => {
        const key = norm(name);
        return key ? fields.find(df => norm(df.fieldname) === key || norm(df.label) === key) : null;
    };

    const set_values = (doctype, name, values) =>
        frappe.call({ method: "frappe.client.set_value", args: { doctype, name, fieldname: values } });

    // Fetch a document and reuse it for a few minutes
    const doc_cache = {};
    const get_cached_doc = async (doctype, name) => {
        const key = `${doctype}::${name}`;
        const hit = doc_cache[key];
        if (hit && Date.now() - hit.time < CACHE_TTL) return hit.doc;

        const doc = await frappe.db.get_doc(doctype, name);
        doc_cache[key] = { doc, time: Date.now() };
        return doc;
    };

    Object.assign(ns, { norm, match_field, value_fields, set_values, get_cached_doc });

    /* =====================================================================
       2. SERVICE VERTICAL -> ITEMS   (any form with an "items" table)
       ===================================================================== */

    const original_reqd = {};              // field -> original "mandatory" flag
    const mappings_registered = new Set(); // "Doctype.fieldname" already wired
    const item_requests = {};              // item code -> pending lookup (no duplicate inserts)

    async function get_or_create_item(item_code) {
        const { message } = await frappe.db.get_value("Item", item_code, [
            "name", "item_code", "item_name", "stock_uom",
        ]);
        if (message?.name) return message;

        return frappe.db.insert({
            doctype: "Item",
            item_code,
            item_name: item_code,
            item_group: "All Item Groups",
            stock_uom: "Nos",
            is_stock_item: 0,
            is_sales_item: 1,
            is_purchase_item: 0,
        });
    }

    // Same code asked twice at once -> one request only
    function get_item(item_code) {
        if (!item_requests[item_code]) {
            item_requests[item_code] = get_or_create_item(item_code).catch(error => {
                delete item_requests[item_code]; // allow a retry
                throw error;
            });
        }
        return item_requests[item_code];
    }

    // Fill one row with the Service Vertical's Item (uses the item loaded by ensure_items)
    ns.fill_row = function (frm, row) {
        const cached = frm.sv_item;
        if (!row || !cached || cached.vertical !== frm.doc.custom_service_vertical) return;

        const { item } = cached;
        const set = (field, value, force = false) => {
            if (value && frappe.meta.has_field(row.doctype, field) && (force || !row[field])) row[field] = value;
        };

        set("item_code", item.item_code, true);
        set("item_name", item.item_name, true);
        set("uom", item.stock_uom);
        set("stock_uom", item.stock_uom);
        set("conversion_factor", 1);
    };

    // Load the Item for the current Service Vertical and put it on every row
    ns.ensure_items = async function (frm, table = ITEM_TABLE) {
        const vertical = frm.doc.custom_service_vertical;
        frm.sv_item = null;
        if (!vertical) return null;

        const service = await get_cached_doc("Service Vertical", vertical);
        if (!service.item_name) return null;

        const item = await get_item(service.item_name);
        frm.sv_item = { vertical, item };

        (frm.doc[table] || []).forEach(row => ns.fill_row(frm, row));
        frm.refresh_field(table);
        return item;
    };

    // Call from "validate": rows get an Item BEFORE the server checks them
    //   strict = true -> also block saving if any row is still without an Item
    ns.validate_items = async function (frm, strict = false, table = ITEM_TABLE) {
        if (!(frm.doc[table] || []).length) return;

        try {
            await ns.ensure_items(frm, table);
        } catch (error) {
            console.error("Item setup failed:", error);
            frappe.throw(__("Could not set the Item for Service Vertical {0}. Check that the Item can be created.",
                [frm.doc.custom_service_vertical]));
        }

        if (strict && (frm.doc[table] || []).some(row => !row.item_code)) {
            frappe.throw(frm.doc.custom_service_vertical
                ? __("Item is not set. Add an Item to the Service Vertical {0}.", [frm.doc.custom_service_vertical])
                : __("Item is not set. Please select a Service Vertical."));
        }
    };

    // config = Service Vertical "required_fields" rows, or null to show everything
    function apply_grid_columns(grid, fields, config) {
        const chosen = {}; // fieldname -> config row

        (config || []).forEach(row => {
            const df = match_field(fields, row.field || row.label);
            if (df) chosen[df.fieldname] = row;
            else console.warn("Service Vertical field not found:", row.field || row.label);
        });

        const count = config ? Object.keys(chosen).length : fields.length;
        const columns = Math.max(1, Math.floor(20 / (count || 1)));
        const is_opportunity = grid.frm?.doctype === "Opportunity";

        fields.forEach(df => {
            const row = chosen[df.fieldname];
            const show = !config || !!row;
            const set = (prop, value) => grid.update_docfield_property(df.fieldname, prop, value);

            // Amount is never shown in the Opportunity item grid
            if (is_opportunity && df.fieldname === "amount") {
                set("hidden", 1);
                set("in_list_view", 0);
                return;
            }

            if (!(df.fieldname in original_reqd)) original_reqd[df.fieldname] = df.reqd;

            set("hidden", show ? 0 : 1);
            set("in_list_view", show ? 1 : 0);
            set("reqd", row?.mandatory ? 1 : original_reqd[df.fieldname]);
            if (show) set("columns", columns);
        });

        grid.visible_columns = undefined;
        grid.reset_grid ? grid.reset_grid() : grid.refresh();
    }

    // Config can map one column onto another (e.g. Hours -> Qty)
    function register_mappings(fields, child_doctype) {
        fields.forEach(df => {
            const key = `${child_doctype}.${df.fieldname}`;
            if (mappings_registered.has(key)) return;
            mappings_registered.add(key);

            frappe.ui.form.on(child_doctype, df.fieldname, (frm, cdt, cdn) => {
                const row = locals[cdt][cdn];

                (frm.sv_config || []).forEach(cfg => {
                    const from = match_field(fields, cfg.field);
                    const to = match_field(fields, cfg.maping__column);

                    if (from && to && from.fieldname === df.fieldname && from.fieldname !== to.fieldname) {
                        frappe.model.set_value(cdt, cdn, to.fieldname, row[from.fieldname]);
                    }
                });
            });
        });
    }

    // Main entry: columns first (instant), then the Item on every row
    ns.apply_service_vertical = async function (frm, table = ITEM_TABLE) {
        const grid = frm.fields_dict[table]?.grid;
        if (!grid) return;

        const run = (frm.__sv_run = (frm.__sv_run || 0) + 1); // newer call wins
        const fields = value_fields(grid.doctype);
        frm.sv_config = [];

        if (!frm.doc.custom_service_vertical) {
            frm.sv_item = null;
            return apply_grid_columns(grid, fields, null);
        }

        try {
            const service = await get_cached_doc("Service Vertical", frm.doc.custom_service_vertical);
            if (run !== frm.__sv_run) return;

            frm.sv_config = service.required_fields || [];
            apply_grid_columns(grid, fields, frm.sv_config);
            register_mappings(fields, grid.doctype);
        } catch (error) {
            console.error("Failed to load Service Vertical:", error);
            return frappe.show_alert({ message: __("Could not load Service Vertical settings."), indicator: "red" });
        }

        try {
            await ns.ensure_items(frm, table);
        } catch (error) {
            console.error("Failed to set Item:", error);
            frappe.show_alert({ message: __("Could not set the Item for this Service Vertical."), indicator: "red" });
        }
    };

    /* =====================================================================
       3. OPPORTUNITY UI
       ===================================================================== */

    /* ---------- Styles (injected once) ---------- */
    frappe.dom.set_style(`
        [data-fieldname="${ITEM_TABLE}"] .row-index { display: none; }
        [data-fieldname="${ITEM_TABLE}"] .grid-heading-row .static-area { width: 100%; text-align: left; justify-content: center; }

        .opp-pro { padding: 14px 20px 13px; background: #fff; border: 1px solid #e8eaed; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.02), 0 4px 12px rgba(0,0,0,.025); }
        .opp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
        .opp-title { color: #16181c; font-size: 13px; font-weight: 650; }
        .opp-subtitle { margin-top: 1px; color: #9aa1aa; font-size: 9px; }
        .opp-status { display: flex; align-items: center; gap: 6px; padding: 4px 9px; border: 1px solid #e3ebf7; border-radius: 20px; background: #f8fbff; color: #3474c9; font-size: 9px; font-weight: 650; }
        .opp-status span { width: 5px; height: 5px; border-radius: 50%; background: #3474c9; }
        .opp-track { display: flex; align-items: flex-start; width: 100%; }
        .opp-stage { flex: 1; min-width: 0; text-align: center; color: #b2b8c0; }
        .opp-node { position: relative; width: 32px; height: 32px; margin: auto; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #fafbfc; border: 1px solid #e5e8eb; color: #b4bac2; }
        .opp-node svg { width: 15px; height: 15px; stroke-width: 1.7; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
        .opp-stage.completed .opp-node { background: #20242a; border-color: #20242a; color: #fff; }
        .opp-stage.active .opp-node { background: #fff; border: 2px solid #2563eb; color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.06); }
        .opp-name { margin-top: 6px; color: #b0b6be; font-size: 10px; font-weight: 550; white-space: nowrap; }
        .opp-stage.completed .opp-name { color: #25292e; font-weight: 600; }
        .opp-stage.active .opp-name { color: #16191d; font-weight: 650; }
        .opp-label { min-height: 10px; margin-top: 2px; color: #c1c6cc; font-size: 6.5px; font-weight: 700; letter-spacing: .45px; }
        .opp-stage.completed .opp-label { color: #8c949d; }
        .opp-stage.active .opp-label { color: #3474c9; }
        .opp-check { position: absolute; right: -3px; bottom: -2px; width: 11px; height: 11px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #fff; color: #1f9d69; border: 1px solid #dcefe6; font-size: 7px; font-weight: 800; }
        .opp-line { flex: 1; min-width: 22px; height: 1px; margin-top: 16px; background: #e8eaed; }
        .opp-line.completed { background: #4b83d8; }
        .opp-line.active { background: #2563eb; }
    `, "opportunity-custom-css");

    /* ---------- Pipeline ---------- */
    const CIRCLE = '<circle cx="12" cy="12" r="9"/>';
    const CHECK = '<path d="m8 12 2.5 2.5L16 9"/>';
    const ICONS = {
        Open: '<path d="M12 5v14M5 12h14"/>',
        "Presales Assessment": '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5M8.5 11h5"/>',
        Quotation: '<path d="M6 3h12v18l-6-3-6 3z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
        Converted: CIRCLE + CHECK,
        Closed: CIRCLE + CHECK,
        Lost: CIRCLE + '<path d="m9 9 6 6M15 9l-6 6"/>',
    };
    const icon = status => `<svg viewBox="0 0 24 24">${ICONS[status] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;

    // Must match the Status options exactly
    const PIPELINE_STAGES = ["Open", "Presales Assessment", "Quotation", "negotiation", "Converted"];
    const STATE_LABEL = { completed: "COMPLETED", active: "CURRENT" };

    function render_pipeline(frm) {
        const $wrapper = frm.get_field("custom_custom_opportunity_tracking")?.$wrapper;
        if (!$wrapper) return;
        if (frm.is_new()) return $wrapper.html("");

        const current = frm.doc.status || "Open";
        const cur = PIPELINE_STAGES.indexOf(current);
        const terminal = ["Lost", "Closed"].includes(current);

        const stage = (name, state) => `
            <div class="opp-stage ${state}">
                <div class="opp-node">
                    ${icon(name)}
                    ${state === "completed" ? '<span class="opp-check">✓</span>' : ""}
                </div>
                <div class="opp-name">${esc(name)}</div>
                <div class="opp-label">${STATE_LABEL[state] || "UPCOMING"}</div>
            </div>`;
        const line = state => `<div class="opp-line ${state}"></div>`;

        let html = PIPELINE_STAGES.map((name, i) => {
            const state = cur > i ? "completed" : cur === i ? "active" : "";
            const line_state = i < cur - 1 ? "completed" : i === cur - 1 || (cur === 0 && i === 0) ? "active" : "";
            return stage(name, state) + (i < PIPELINE_STAGES.length - 1 ? line(line_state) : "");
        }).join("");

        if (terminal) html += line("completed") + stage(current, "active");

        $wrapper.html(`
            <div class="opp-pro">
                <div class="opp-header">
                    <div>
                        <div class="opp-title">Opportunity Progress</div>
                        <div class="opp-subtitle">Track the opportunity through each stage</div>
                    </div>
                    <div class="opp-status"><span></span>${esc(current)}</div>
                </div>
                <div class="opp-track">${html}</div>
            </div>`);
    }

    /* ---------- Quotation items table (read-only HTML) ---------- */
    const TH = "padding:12px;text-align:left;white-space:nowrap;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:600;";
    const TD = "padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;";
    const TF = "padding:14px;font-weight:700;border-top:1px solid #e2e8f0;";

    async function render_quotation_items(frm) {
        const $wrapper = frm.fields_dict.custom_quotation_items?.$wrapper;
        if (!$wrapper) return;

        const box = (msg, color = "#64748b", border = "#e2e8f0") =>
            $wrapper.html(`<div style="padding:16px;color:${color};border:1px solid ${border};border-radius:10px;">${msg}</div>`);

        const { custom_quotation_number: quotation_name, custom_service_vertical: vertical } = frm.doc;
        if (!quotation_name) return box(__("No quotation linked to this Opportunity."));
        if (!vertical) return box(__("Please select a Service Vertical."));

        box(__("Loading quotation items..."));

        try {
            const [quotation, service] = await Promise.all([
                frappe.db.get_doc("Quotation", quotation_name),
                get_cached_doc("Service Vertical", vertical),
            ]);

            // Ignore outdated async responses
            if (frm.doc.custom_quotation_number !== quotation_name || frm.doc.custom_service_vertical !== vertical) return;

            await frappe.model.with_doctype("Quotation Item");
            const meta = frappe.get_meta("Quotation Item").fields;
            const items = quotation.items || [];
            const currency = quotation.currency || "INR";

            if (!items.length) return box(__("No quotation items found."));

            // Columns: configured fields first, Amount always last
            const columns = [];
            (service.required_fields || []).forEach(cfg => {
                const df = match_field(meta, cfg.field || cfg.label);
                if (df && df.fieldname !== "amount" && !columns.includes(df)) columns.push(df);
            });
            const amount = meta.find(f => f.fieldname === "amount");
            if (amount) columns.push(amount);

            if (!columns.length) {
                return box(__("No matching configured fields or Amount field found. Please check the Service Vertical configuration."),
                    "#b45309", "#fde68a");
            }

            const cell = (df, row) => {
                const value = row[df.fieldname];
                if (is_blank(value)) return "—";
                return df.fieldtype === "Currency" ? format_currency(flt(value), row.currency || currency) : esc(value);
            };

            const head = columns.map(df => `<th style="${TH}">${esc(df.label)}</th>`).join("");
            const body = items
                .map(row => `<tr>${columns.map(df => `<td style="${TD}">${cell(df, row)}</td>`).join("")}</tr>`)
                .join("");

            $wrapper.html(`
                <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;">
                    <div style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
                        <div style="font-size:16px;font-weight:700;color:#0f172a;">Quotation Items</div>
                        <div style="font-size:12px;color:#64748b;margin-top:4px;">${esc(quotation.name)} · ${items.length} item(s)</div>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:max-content;">
                            <thead><tr>${head}</tr></thead>
                            <tbody>${body}</tbody>
                            <tfoot>
                                <tr style="background:#f8fafc;">
                                    <td colspan="${Math.max(columns.length - 1, 1)}" style="${TF}text-align:right;">Grand Total</td>
                                    <td style="${TF}text-align:right;white-space:nowrap;">${format_currency(flt(quotation.grand_total), currency)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`);
        } catch (error) {
            console.error("Quotation HTML rendering failed:", error);
            box(__("Unable to load quotation items. Check the browser console for details."), "#b91c1c", "#fecaca");
        }
    }

    /* ---------- Amounts ---------- */
    function calculate_base_amount(frm) {
        frm.set_value("base_opportunity_amount", flt(frm.doc.opportunity_amount) * (flt(frm.doc.custom_exchange_rates) || 1));
    }

    function calculate_opportunity_amount(frm) {
        const total = (frm.doc.items || []).reduce((sum, row) => sum + flt(row.amount), 0);
        frm.set_value("opportunity_amount", total);
    }

    /* ---------- Buttons ---------- */
    function toggle_create_menu(frm) {
        setTimeout(() => {
            frm.page.wrapper.find('.inner-group-button[data-label="Create"]').toggle(frm.doc.status === "Quotation");
        }, 100);
    }

    function toggle_lost_button(frm) {
        frm.remove_custom_button(__("Lost"));

        const status = (frm.doc.status || "").trim().toLowerCase();
        if (frm.is_new() || !["closed", "not feasible"].includes(status)) return;

        frm.add_custom_button(__("Lost"), () => {
            frm.set_df_property("status", "hidden", 0);
            frm.set_value("status", "Closed").then(() => frm.save());
        });
    }

    /* ---------- Quotation / revision workflow ---------- */
    async function create_quotation_from_workflow(frm) {
        if (frm.is_new()) return;

        try {
            // Prevent duplicate quotation
            const existing = await frappe.db.get_list("Quotation", {
                filters: { opportunity: frm.doc.name, docstatus: ["<", 2] },
                fields: ["name"],
                limit: 1,
            });
            if (existing.length) return;

            const mapped = await frappe.call({
                method: "erpnext.crm.doctype.opportunity.opportunity.make_quotation",
                args: { source_name: frm.doc.name },
            });
            if (!mapped.message) throw new Error("Quotation mapping returned no document");

            const result = await frappe.call({ method: "frappe.client.insert", args: { doc: mapped.message } });
            if (result.message) {
                frappe.show_alert({
                    message: __("Quotation {0} created successfully", [result.message.name]),
                    indicator: "green",
                });
            }
        } catch (error) {
            console.error("Quotation creation failed:", error);
            frappe.msgprint({ title: __("Quotation Creation Failed"), message: __("Unable to create the Quotation."), indicator: "red" });
        }
    }

    // Ask for a reason, save it on Opportunity + Quotation, then allow the workflow action
    function ask_revision_reason(frm) {
        return new Promise((resolve, reject) => {
            let done = false;

            const dialog = new frappe.ui.Dialog({
                title: __("Revised Quotation"),
                fields: [{ label: __("Revise Reason"), fieldname: "revise_reason", fieldtype: "Small Text", reqd: 1 }],
                primary_action_label: __("Submit"),

                async primary_action({ revise_reason }) {
                    const reason = (revise_reason || "").trim();
                    if (!reason) return frappe.msgprint(__("Please enter the revision reason."));

                    try {
                        await set_values("Opportunity", frm.doc.name, { custom_revise_reason: reason });
                        await frm.set_value("custom_revise_reason", reason);

                        if (frm.doc.custom_quotation_number) {
                            await set_values("Quotation", frm.doc.custom_quotation_number, {
                                custom_revision_reason: reason,
                                workflow_state: "Revision",
                            });
                        }

                        done = true;
                        dialog.hide();
                        resolve();
                    } catch (error) {
                        console.error(error);
                        frappe.msgprint(__("Failed to save the revision reason."));
                    }
                },
            });

            // Closed without submitting -> cancel the workflow action
            dialog.$wrapper.on("hidden.bs.modal", () => { if (!done) reject(new Error("Revision cancelled")); });

            dialog.show();
            $("#freeze").hide();
        });
    }

    /* ---------- Presales owner (users of the Service Vertical's department) ---------- */
    async function load_presales_owners(frm) {
        frm.presales_owner_users = [];

        try {
            const service = await get_cached_doc("Service Vertical", frm.doc.custom_service_vertical);

            if (service.department) {
                const employees = await frappe.db.get_list("Employee", {
                    filters: { department: service.department, status: "Active", user_id: ["is", "set"] },
                    fields: ["user_id"],
                    limit_page_length: 5000,
                });
                const user_ids = [...new Set(employees.map(e => e.user_id).filter(Boolean))];

                if (user_ids.length) {
                    const users = await frappe.db.get_list("User", {
                        filters: { name: ["in", user_ids], enabled: 1 },
                        fields: ["name"],
                        limit_page_length: 5000,
                    });
                    frm.presales_owner_users = users.map(u => u.name);
                }
            }
        } catch (error) {
            console.error("Presales Owner loading error:", error);
        }

        frm.refresh_field("custom_presales_owner");
    }

    /* ---------- Field input rules ---------- */
    function lock_past_closing_date(frm) {
        const field = frm.fields_dict.expected_closing;
        if (!field?.$input) return;

        const lock = () => {
            const dp = field.datepicker;
            if (!dp || dp._past_locked) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            dp.update({
                minDate: today,
                onRenderCell: (date, type) => (type === "day" && date < today ? { disabled: true } : {}),
            });
            dp._past_locked = true;
        };

        lock();
        setTimeout(lock, 500);
        field.$input.off("focus.mindate").on("focus.mindate", lock);
    }

    function restrict_inputs(frm) {
        // Probability: digits only, 0-100
        frm.fields_dict.probability?.$input?.off("input.probcheck").on("input.probcheck", function () {
            let val = $(this).val().replace(/\D/g, "").slice(0, 3);
            if (parseInt(val, 10) > 100) val = val.slice(0, -1);
            $(this).val(val);
        });

        // Amount: digits and one dot, max 2 decimals
        frm.fields_dict.opportunity_amount?.$input?.off("input.amtcheck").on("input.amtcheck", function () {
            const [whole, ...rest] = $(this).val().replace(/[^0-9.]/g, "").split(".");
            $(this).val(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
        });
    }

    /* ---------- Clarification center (Python APIs: teceze.api.clarification) ---------- */
    const CLARIFICATION_API = "teceze.api.clarification.";

    function render_clarification_center(frm) {
        const field = frm.fields_dict.custom_clarification_html;
        if (!field) return;

        const $wrapper = field.$wrapper;
        if (frm.is_new()) return $wrapper.empty();

        const roles = frappe.user_roles || [];
        const needed = frm.doc.workflow_state === "Clarification Needed";
        const can_raise = roles.includes("Clarification Raiser") && needed;
        const can_respond = roles.includes("Responder") && needed;
        let threads = {};

        const fmt_date = v => (v ? esc(frappe.datetime.str_to_user(v)) : "");

        // One dialog for raise / edit / respond
        function message_dialog({ title, label, button, method, args = {}, value = "" }) {
            const dialog = new frappe.ui.Dialog({
                title: __(title),
                fields: [{ fieldname: "message", label: __(label), fieldtype: "Small Text", reqd: 1, default: value }],
                primary_action_label: __(button),
                primary_action({ message }) {
                    message = (message || "").trim();
                    if (!message) return frappe.msgprint(__("Please enter a value."));

                    dialog.disable_primary_action();
                    frappe.call({
                        method: CLARIFICATION_API + method,
                        args: { opportunity: frm.doc.name, message, ...args },
                        freeze: true,
                        callback(r) {
                            if (!r.exc) {
                                dialog.hide();
                                render_clarification_center(frm);
                            }
                        },
                        always: () => dialog.enable_primary_action(),
                    });
                },
            });
            dialog.show();
        }

        const thread_of = el => threads[$(el).attr("data-name")];

        $wrapper.html(`
            <div class="clarification-center">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                    <div>
                        <h3 style="margin:0 0 5px 0">Clarifications</h3>
                        <div class="text-muted">Clarification history and responses</div>
                    </div>
                    ${can_raise ? `<button type="button" class="btn btn-primary btn-sm add-clarification">
                        <span class="fa fa-plus"></span> Raise clarification</button>` : ""}
                </div>
                <div class="clarification-summary" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px"></div>
                <div class="clarification-list">
                    <div class="text-muted" style="padding:20px;text-align:center">Loading clarifications...</div>
                </div>
            </div>`);

        // Handlers are namespaced so a re-render never doubles them
        $wrapper.off(".clarification")
            .on("click.clarification", ".add-clarification", () =>
                message_dialog({ title: "Raise Clarification", label: "Clarification", button: "Submit", method: "create_clarification" }))
            .on("click.clarification", ".edit-clarification", function () {
                const item = thread_of(this);
                if (item) message_dialog({
                    title: "Edit Clarification", label: "Clarification", button: "Save",
                    method: "update_clarification", args: { clarification_name: item.name }, value: item.message || "",
                });
            })
            .on("click.clarification", ".reply-clarification", function () {
                const item = thread_of(this);
                if (item) message_dialog({
                    title: "Respond to Clarification", label: "Response", button: "Submit Response",
                    method: "submit_response", args: { clarification_name: item.name },
                });
            });

        const summary_card = (label, count) => `
            <div style="flex:1;min-width:100px;padding:12px 14px;border:1px solid var(--border-color);border-radius:10px;">
                <div class="text-muted" style="font-size:12px">${label}</div>
                <div style="font-size:22px;font-weight:600;margin-top:4px">${count}</div>
            </div>`;

        const thread_card = item => {
            const answered = !!item.response;
            const breached = !answered && item.status === "SLA Breach";
            const [status, color] = answered ? ["Answered", "var(--green-600)"]
                : breached ? ["SLA Breach", "var(--red-600)"]
                : ["Waiting", "var(--orange-600)"];
            const name = esc(item.name);

            const edit_button = can_raise && !answered
                ? `<div style="display:flex;justify-content:flex-end;margin-top:12px;">
                       <button type="button" class="btn btn-default btn-xs edit-clarification" data-name="${name}">${__("Edit Clarification")}</button>
                   </div>` : "";

            const reply_button = can_respond && !answered
                ? `<div style="margin-top:10px">
                       <button type="button" class="btn btn-primary btn-xs reply-clarification" data-name="${name}">${__("Respond")}</button>
                   </div>` : "";

            const response_html = answered
                ? `<div style="margin:16px 0 0 18px;padding:14px 16px;border-left:3px solid var(--green-500);border-radius:0 9px 9px 0;background:var(--subtle-fg);">
                       <div style="font-weight:600;margin-bottom:8px"><span class="fa fa-reply"></span> ${__("Response")}</div>
                       <div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(item.response.message)}</div>
                       <div class="text-muted" style="font-size:12px;margin-top:10px">${esc(item.response.owner)} · ${fmt_date(item.response.creation)}</div>
                   </div>`
                : `<div style="margin:14px 0 0 18px;padding:12px;border:1px dashed var(--border-color);border-radius:8px;">
                       <div class="text-muted">${__("Awaiting response")}</div>
                       ${reply_button}
                   </div>`;

            return `
                <article style="border:1px solid var(--border-color);border-radius:12px;padding:18px;margin-bottom:14px;background:var(--card-bg);">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                        <div style="font-weight:650;font-size:14px"><span class="fa fa-commenting-o"></span> ${__("Clarification")}</div>
                        <span style="color:${color};font-size:12px;font-weight:600;">${status}</span>
                    </div>
                    <div class="text-muted" style="font-size:12px;margin:8px 0 12px">
                        ${__("Raised by")} ${esc(item.owner)} · ${fmt_date(item.creation)}
                    </div>
                    <div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;">${esc(item.message)}</div>
                    ${edit_button}
                    ${response_html}
                </article>`;
        };

        frappe.call({
            method: CLARIFICATION_API + "get_threads",
            args: { opportunity: frm.doc.name },
            callback(r) {
                if (r.exc) return;

                const list = r.message || [];
                threads = Object.fromEntries(list.map(item => [item.name, item]));

                const answered = list.filter(i => i.response).length;
                const breached = list.filter(i => !i.response && i.status === "SLA Breach").length;

                $wrapper.find(".clarification-summary").html(
                    summary_card(__("Total"), list.length) +
                    summary_card(__("Waiting"), list.length - answered - breached) +
                    summary_card(__("SLA Breach"), breached) +
                    summary_card(__("Answered"), answered)
                );

                $wrapper.find(".clarification-list").html(list.length
                    ? list.map(thread_card).join("")
                    : `<div style="padding:32px 16px;text-align:center;border:1px dashed var(--border-color);border-radius:12px;">
                           <div style="font-size:24px;margin-bottom:8px"><span class="fa fa-comments-o"></span></div>
                           <div style="font-weight:600">${__("No clarifications yet")}</div>
                           <div class="text-muted" style="margin-top:5px">${__("Clarifications and responses will appear here.")}</div>
                       </div>`);
            },
        });
    }

    /* =====================================================================
       4. FORM EVENTS  (one block for the Opportunity doctype)
       ===================================================================== */

    // shipping field : billing field
    const SHIPPING_FROM_BILLING = {
        custom_ship_street: "custom_street",
        custom_ship_zip_code: "custom_zip_code",
        custom_ship_city: "custom_bill_city",
        custom_ship_stateprovince: "custom_stateprovince",
        custom_ship_location: "custom_location",
        custom_ship_country: "custom_bill_country",
    };

    // Remove ERPNext's own handler so our exchange rate logic is used instead
    frappe.ui.form.off("Opportunity", "currency");

    frappe.ui.form.on("Opportunity", {
        setup(frm) {
            frm.presales_owner_users = [];

            frm.set_query("custom_sub_service_vertical", () => ({ filters: { service_vertical: frm.doc.custom_service_vertical } }));
            frm.set_query("opportunity_from", () => ({ filters: { name: ["in", ["Customer", "Lead"]] } }));
            frm.set_query("custom_presales_owner", () => ({
                filters: { name: ["in", frm.presales_owner_users.length ? frm.presales_owner_users : ["__no_matching_user__"]] },
            }));

            frm.custom_make_buttons = { Quotation: "Quotation", "Supplier Quotation": "Supplier Quotation" };
            frm.email_field = "contact_email";
        },

        refresh(frm) {
            frm.remove_custom_button(__("Fetch Latest Exchange Rate"));

            // Hide ERPNext exchange rate, keep our custom one
            frm.set_df_property("conversion_rate", "hidden", 1);
            frm.set_df_property("base_opportunity_amount", "hidden", 1);
            frm.set_df_property("custom_exchange_rates", "hidden", 0);

            toggle_create_menu(frm);
            toggle_lost_button(frm);
            render_pipeline(frm);
            render_quotation_items(frm);
            render_clarification_center(frm);
            ns.apply_service_vertical(frm);
            calculate_opportunity_amount(frm);
            lock_past_closing_date(frm);
            restrict_inputs(frm);

            if (frm.doc.custom_service_vertical) load_presales_owners(frm);
        },

        // Make sure every row has its Item before the server validates it
        validate: frm => ns.validate_items(frm),

        items_add(frm, cdt, cdn) {
            ns.fill_row(frm, locals[cdt][cdn]);
            calculate_opportunity_amount(frm);
        },
        items_remove: frm => calculate_opportunity_amount(frm),

        status: frm => toggle_create_menu(frm),

        currency(frm) {
            frm.set_value({ conversion_rate: 1, custom_exchange_rates: 1 });
            calculate_base_amount(frm);
            frm.trigger("set_dynamic_field_label");
        },
        opportunity_amount: frm => calculate_base_amount(frm),
        custom_exchange_rates: frm => calculate_base_amount(frm),
        custom_quotation_number: frm => render_quotation_items(frm),

        custom_region: frm => frm.set_value("custom_client_country", ""),

        custom_zip_code(frm) {
            const val = String(frm.doc.custom_zip_code || "").replace(/[^0-9]/g, "").slice(0, 6);
            if (val !== frm.doc.custom_zip_code) frm.set_value("custom_zip_code", val);
        },

        async custom_client_country(frm) {
            const country = frm.doc.custom_client_country;
            frm.set_value("custom_bill_country", country);
            if (!country) return;

            const { message } = await frappe.db.get_value("Country", country, "custom_currency");
            if (message?.custom_currency) {
                await frm.set_value("currency", message.custom_currency);
                await frm.set_value({ conversion_rate: 1, custom_exchange_rates: 1 });
                calculate_base_amount(frm);
            }
        },

        async custom_service_vertical(frm) {
            const vertical = frm.doc.custom_service_vertical;

            frm.set_value("custom_sub_service_vertical", null);
            frm.set_value("custom_presales_owner", "");
            frm.sv_item = null;
            frm.presales_owner_users = [];

            ["custom_item", ITEM_TABLE].forEach(table => {
                frm.clear_table(table);
                frm.refresh_field(table);
            });

            ns.apply_service_vertical(frm);

            if (!vertical) return frm.refresh_field("custom_presales_owner");
            load_presales_owners(frm);

            // Naming series follows the vertical's abbreviation
            const service = await get_cached_doc("Service Vertical", vertical);
            if (!service.abbrevation) return;

            const series = `CRM-${String(service.abbrevation).toUpperCase()}-.YYYY.-`;
            frm.set_df_property("naming_series", "options", series);
            frm.set_value("naming_series", series);
            frm.refresh_field("naming_series");
        },

        async party_name(frm) {
            let owner = "";
            if (frm.doc.opportunity_from === "Lead" && frm.doc.party_name) {
                const { message } = await frappe.db.get_value("Lead", frm.doc.party_name, "lead_owner");
                owner = message?.lead_owner || "";
            }
            frm.set_value("custom_lead_owner", owner);
        },

        custom_use_billing_address(frm) {
            frm.set_value(Object.fromEntries(
                Object.entries(SHIPPING_FROM_BILLING).map(([to, from]) => [to, frm.doc[from]])
            ));
        },

        custom_assessment_date(frm) {
            const date = frm.doc.custom_assessment_date;
            if (date && date < frappe.datetime.get_today()) {
                frappe.msgprint({
                    title: __("Invalid Date"),
                    message: __("Previous date is not allowed. Please select today or a future date."),
                    indicator: "red",
                });
                frm.set_value("custom_assessment_date", "");
            }
        },

        after_workflow_action(frm) {
            if (frm.doc.workflow_state === "Preparing Quotation") create_quotation_from_workflow(frm);
        },

        before_workflow_action(frm) {
            if (frm.selected_workflow_action === "Sent Revision Request") return ask_revision_reason(frm);
        },
    });

    // Item rows -> Opportunity amount
    frappe.ui.form.on("Opportunity Item", Object.fromEntries(
        ["amount", "rate", "qty"].map(field => [field, frm => calculate_opportunity_amount(frm)])
    ));

})(window.teceze);