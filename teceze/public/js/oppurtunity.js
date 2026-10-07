const ITEM_TABLE = "items";
const esc = frappe.utils.escape_html;
const blank = v => v === null || v === undefined || v === "";
const num = (v, d = 0) => (isNaN(parseFloat(v)) ? d : parseFloat(v));
const norm = v => String(v ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

/* ---------- Icons (inner SVG paths) ---------- */
const CIRCLE = '<circle cx="12" cy="12" r="9"/>';
const ICONS = {
    Open: '<path d="M12 5v14M5 12h14"/>',
    "Presales Assessment": '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5M8.5 11h5"/>',
    Quotation: '<path d="M6 3h12v18l-6-3-6 3z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    Converted: CIRCLE + '<path d="m8 12 2.5 2.5L16 9"/>',
    Closed: CIRCLE + '<path d="m8 12 2.5 2.5L16 9"/>',
    Lost: CIRCLE + '<path d="m9 9 6 6M15 9l-6 6"/>',
    Replied: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 3v-6.5A7.5 7.5 0 0 1 10.5 8H13"/><path d="M15 4h5v5M20 4l-6 6"/>',
};
const svg = status => `<svg viewBox="0 0 24 24">${ICONS[status] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;
const slug = s => String(s).toLowerCase().replace(/\s+/g, "-");

/* ---------- Styles (injected once) ---------- */
frappe.dom.set_style(`
/* Sales item grid */
[data-fieldname="${ITEM_TABLE}"] .row-index { display: none; }
[data-fieldname="${ITEM_TABLE}"] .grid-heading-row .static-area { width: 100%; text-align: left; justify-content: center; }

/* Status tracker */
.status-tracker { padding: 24px 12px 30px; background: linear-gradient(180deg,#fff,#fafbfc); border: 1px solid #e9edf2; border-radius: 14px; }
.status-track { display: flex; align-items: flex-start; overflow-x: auto; padding: 5px 10px 12px; scrollbar-width: none; }
.status-track::-webkit-scrollbar { display: none; }
.status-step { min-width: 145px; text-align: center; flex-shrink: 0; }
.status-icon { width: 46px; height: 46px; margin: auto; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: var(--bg,#f7f8fa); color: var(--c,#64748b); border: 1px solid var(--bd,#e2e7ed); box-shadow: 0 4px 12px rgba(0,0,0,.06); }
.status-icon svg, .opp-node svg { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
.status-icon svg { width: 21px; height: 21px; stroke-width: 1.8; }
.status-step.open { --c:#2490ef; --bg:#eef7ff; --bd:#c8e3ff; }
.status-step.presales-assessment { --c:#7c5cff; --bg:#f4f0ff; --bd:#ddd3ff; }
.status-step.quotation { --c:#e6a11a; --bg:#fff7e8; --bd:#f5dfad; }
.status-step.converted { --c:#20a464; --bg:#edfaf3; --bd:#c7ecd9; }
.status-step.lost { --c:#e05252; --bg:#fff1f1; --bd:#f2cccc; }
.status-step.replied { --c:#149c94; --bg:#eef9f8; --bd:#c6e9e6; }
.status-step.closed { --c:#475569; --bg:#f0f3f6; --bd:#d9dee5; }
.status-step.current .status-icon { box-shadow: 0 0 0 4px rgba(36,144,239,.1), 0 8px 22px rgba(36,144,239,.18); transform: translateY(-2px); }
.status-name { margin-top: 11px; font-size: 13px; font-weight: 650; color: #25282d; white-space: nowrap; }
.status-date, .status-user { font-size: 10px; color: #8b95a1; white-space: nowrap; margin-top: 4px; }
.status-user { color: #a4acb5; max-width: 145px; margin-inline: auto; overflow: hidden; text-overflow: ellipsis; }
.current-label { display: inline-block; margin-top: 7px; padding: 4px 10px; border-radius: 20px; background: #eaf5ff; color: #2490ef; font-size: 9px; font-weight: 700; letter-spacing: .7px; }
.status-connector { width: 55px; height: 2px; margin-top: 22px; flex-shrink: 0; background: linear-gradient(90deg,#dfe4e9,#cfd5dc); border-radius: 10px; }
.status-empty { padding: 20px; text-align: center; color: #999; }

/* Opportunity pipeline */
.opp-pro { padding: 14px 20px 13px; background: #fff; border: 1px solid #e8eaed; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.02), 0 4px 12px rgba(0,0,0,.025); }
.opp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
.opp-title { color: #16181c; font-size: 13px; font-weight: 650; }
.opp-subtitle { margin-top: 1px; color: #9aa1aa; font-size: 9px; }
.opp-status { display: flex; align-items: center; gap: 6px; padding: 4px 9px; border: 1px solid #e3ebf7; border-radius: 20px; background: #f8fbff; color: #3474c9; font-size: 9px; font-weight: 650; }
.opp-status span { width: 5px; height: 5px; border-radius: 50%; background: #3474c9; }
.opp-track { display: flex; align-items: flex-start; width: 100%; }
.opp-stage { flex: 1; min-width: 0; text-align: center; color: #b2b8c0; }
.opp-node { position: relative; width: 32px; height: 32px; margin: auto; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #fafbfc; border: 1px solid #e5e8eb; color: #b4bac2; }
.opp-node svg { width: 15px; height: 15px; stroke-width: 1.7; }
.opp-stage.completed .opp-node { background: #20242a; border-color: #20242a; color: #fff; }
.opp-stage.active .opp-node { background: #fff; border: 2px solid #2563eb; color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.06); }
.opp-name { margin-top: 6px; color: #b0b6be; font-size: 10px; font-weight: 550; white-space: nowrap; }
.opp-stage.completed .opp-name { color: #25292e; font-weight: 600; }
.opp-stage.active .opp-name { color: #16191d; font-weight: 650; }
.opp-label { min-height: 10px; margin-top: 2px; color: #c1c6cc; font-size: 6.5px; font-weight: 700; letter-spacing: .45px; }
.opp-stage.completed .opp-label { color: #8c949d; }
.opp-stage.active .opp-label { color: #3474c9; }
.opp-check { position: absolute; right: -3px; bottom: -2px; width: 11px; height: 11px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: #fff; color: #1f9d69; border: 1px solid #dcefe6; font-size: 7px; font-weight: 800; }
.opp-line { flex: 1; min-width: 22px; height: 1px; margin-top: 16px; background: #e8eaed; }
.opp-line.completed { background: #4b83d8; }
.opp-line.active { background: #2563eb; }
`, "opportunity-custom-css");


frappe.ui.form.on("Opportunity", {
    setup(frm) {
        frm.set_query("custom_sub_service_vertical", () => ({
            filters: { service_vertical: frm.doc.custom_service_vertical },
        }));
        frm.set_query("opportunity_from", () => ({
            filters: { name: ["in", ["Customer", "Lead"]] },
        }));

        frm.custom_make_buttons = {
            Quotation: "Quotation",
            "Supplier Quotation": "Supplier Quotation",
        };
        frm.email_field = "contact_email";
    },

    refresh(frm) {
        load_status_tracking(frm);
        toggle_create_menu(frm);
        load_opportunity_pipeline(frm);
        load_service_vertical_items(frm);
    },

    status: toggle_create_menu,

    custom_service_vertical(frm) {
        // Clear Sub Service Vertical
        frm.clear_table("custom_sub_service_vertical");
        frm.refresh_field("custom_sub_service_vertical");

        // Clear Custom Item table completely
        frm.clear_table("custom_item");
        frm.refresh_field("custom_item");

        // Clear standard Items table completely
        frm.clear_table("items");
        frm.refresh_field("items");

        // Reload fields/items based on the new Service Vertical
        load_service_vertical_items(frm);
    },

    custom_use_billing_address(frm) {
        // shipping field : billing field
        const map = {
            custom_ship_street: "custom_street",
            custom_ship_zip_code: "custom_zip_code",
            custom_ship_city: "custom_bill_city",
            custom_ship_stateprovince: "custom_stateprovince",
            custom_ship_location: "custom_location",
            custom_ship_country: "custom_bill_country",
        };
        frm.set_value(
            Object.fromEntries(Object.entries(map).map(([to, from]) => [to, frm.doc[from]]))
        );
    },
});


function toggle_create_menu(frm) {
        setTimeout(() => {
        frm.page.wrapper
            .find('.inner-group-button[data-label="Create"]')
            .toggle(frm.doc.status === "Quotation");
    }, 100);
}


async function load_status_tracking(frm) {
    const $wrapper = frm.get_field("custom_dashboard")?.$wrapper;
    if (!$wrapper) return;
    if (frm.is_new()) return $wrapper.html("");

    try {
        const versions = await frappe.db.get_list("Version", {
            filters: { ref_doctype: "Opportunity", docname: frm.doc.name },
            fields: ["creation", "owner", "data"],
            order_by: "creation asc",
            limit: 100,
        });

        const history = versions.flatMap(v => {
            try {
                return (JSON.parse(v.data).changed || [])
                    .filter(change => change[0] === "status")
                    .map(change => ({ status: change[1], date: v.creation, user: v.owner }));
            } catch {
                return [];
            }
        });
        history.push({ status: frm.doc.status, current: true });

        const steps = history
            .map((s, i) => `
                <div class="status-step ${slug(s.status)} ${s.current ? "current" : ""}">
                    <div class="status-icon">${svg(s.status)}</div>
                    <div class="status-name">${esc(s.status)}</div>
                    ${s.current
                        ? '<div class="current-label">CURRENT</div>'
                        : `<div class="status-date">${frappe.datetime.str_to_user(s.date)}</div>
                           <div class="status-user">${esc(s.user || "")}</div>`}
                </div>
                ${i < history.length - 1 ? '<div class="status-connector"></div>' : ""}`)
            .join("");

        $wrapper.html(`<div class="status-tracker"><div class="status-track">${steps}</div></div>`);

        requestAnimationFrame(() => {
            const track = $wrapper.find(".status-track")[0];
            if (track) track.scrollLeft = track.scrollWidth;
        });
    } catch (error) {
        console.error("Status tracking error:", error);
        $wrapper.html('<div class="status-empty">Unable to load status history.</div>');
    }
}


function load_opportunity_pipeline(frm) {
    const $wrapper = frm.get_field("custom_custom_opportunity_tracking")?.$wrapper;
    if (!$wrapper) return;
    if (frm.is_new()) return $wrapper.html("");

    const current = frm.doc.status || "Open";
    const stages = ["Open", "Presales Assessment", "Quotation","Negotitation", "Converted"];
    const cur = stages.indexOf(current);
    const terminal = current === "Lost" || current === "Closed";

    const stage = (name, state) => `
        <div class="opp-stage ${state}">
            <div class="opp-node">
                ${svg(name)}
                ${state === "completed" ? '<span class="opp-check">✓</span>' : ""}
            </div>
            <div class="opp-name">${esc(name)}</div>
            <div class="opp-label">${{ completed: "COMPLETED", active: "CURRENT" }[state] || "UPCOMING"}</div>
        </div>`;

    const line = state => `<div class="opp-line ${state}"></div>`;

    let html = stages
        .map((name, i) => {
            const state = cur > i ? "completed" : cur === i ? "active" : "";
            const lineState =
                i < cur - 1 ? "completed" : i === cur - 1 || (cur === 0 && i === 0) ? "active" : "";
            return stage(name, state) + (i < stages.length - 1 ? line(lineState) : "");
        })
        .join("");

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


/* =========================================================
   SERVICE VERTICAL -> ITEMS GRID
   ========================================================= */

function sales_item_fields(grid) {
    return frappe
        .get_meta(grid.doctype)
        .fields.filter(df => !frappe.model.no_value_type.includes(df.fieldtype));
}

// Cache Service Vertical docs so repeat refreshes apply instantly (cleared on hard reload)
const _sv_cache = {};
async function get_service_vertical(name) {
    if (!_sv_cache[name]) {
        _sv_cache[name] = await frappe.db.get_doc("Service Vertical", name);
    }
    return _sv_cache[name];
}
/* ---------- helpers ---------- */
const _orig_reqd = {};          // remembers each field's original "mandatory" setting
const _mapping_registered = {}; // makes sure each change handler is registered only once

// config value may be a fieldname or a label -> return the matching Opportunity Item field
function resolve_field(fields, value) {
    const v = norm(value);
    return v ? fields.find(df => norm(df.fieldname) === v || norm(df.label) === v) : null;
}

async function load_service_vertical_items(frm) {
    const grid = frm.fields_dict[ITEM_TABLE]?.grid;
    if (!grid) return;

    const fields = sales_item_fields(grid);
    frm.sv_config = [];

    // No Service Vertical -> show everything as normal
    if (!frm.doc.custom_service_vertical) {
        apply_item_grid_columns(grid, fields, null);
        return;
    }

    try {
        const service = await get_service_vertical(frm.doc.custom_service_vertical);
        frm.sv_config = service.required_fields || [];

        // Service Vertical -> Item
        if (service.item_name) {
            const item = await get_or_create_item(service.item_name);
            (frm.doc[ITEM_TABLE] || []).forEach(row => {
                row.item_code = item.item_code || service.item_name;
                row.item_name = item.item_name || service.item_name;
                if (item.stock_uom) row.uom = item.stock_uom;
            });
        }

        apply_item_grid_columns(grid, fields, frm.sv_config);
        register_mappings(fields, grid.doctype);
    } catch (error) {
        console.error("Failed to load Service Vertical:", error);
    }
}

async function get_or_create_item(item_code) {
    // CHECK EXISTING ERPNext ITEM
    const existing = await frappe.db.get_value("Item", item_code, [
        "name",
        "item_code",
        "item_name",
        "stock_uom",
        "item_group",
        "brand",
        "image",
    ]);

    if (existing.message?.name) {
        return existing.message;
    }

    // CREATE ERPNext ITEM
    const item = await frappe.db.insert({
        doctype: "Item",
        item_code: item_code,
        item_name: item_code,
        item_group: "All Item Groups",
        stock_uom: "Nos",
        is_stock_item: 0,
        is_sales_item: 1,
        is_purchase_item: 0,
    });

    return {
        name: item.name,
        item_code: item.item_code,
        item_name: item.item_name,
        stock_uom: item.stock_uom,
        item_group: item.item_group,
    };
}
function apply_item_grid_columns(grid, fields, config) {
    console.log("NEW LOGIC", config);
    const show_all = !config;
    const chosen = {}; // fieldname -> config row
    (config || []).forEach(r => {
        const df = resolve_field(fields, r.field);
        if (df) chosen[df.fieldname] = r;
        else console.warn("Service Vertical field not found in Opportunity Item:", r.field);
    });

    const count = show_all ? fields.length : Object.keys(chosen).length;
    const columns = Math.max(1, Math.floor(10 / (count || 1)));

    fields.forEach(df => {
        const row = chosen[df.fieldname];
        const show = show_all || !!row;

        if (!(df.fieldname in _orig_reqd)) _orig_reqd[df.fieldname] = df.reqd;

        grid.update_docfield_property(df.fieldname, "hidden", show ? 0 : 1);
        grid.update_docfield_property(df.fieldname, "in_list_view", show ? 1 : 0);
        // mandatory ticked -> required, otherwise leave the original setting
        grid.update_docfield_property(
            df.fieldname, "reqd",
            row && row.mandatory ? 1 : _orig_reqd[df.fieldname]
        );
        if (show) grid.update_docfield_property(df.fieldname, "columns", columns);
    });

    // Rebuild header AND rows
    if (typeof grid.reset_grid === "function") {
        grid.reset_grid();
    } else {
        grid.visible_columns = undefined;
        grid.header_row?.wrapper.remove();
        delete grid.header_row;
        grid.grid_rows = [];
        grid.wrapper.find(".grid-body .rows").empty();
        grid.setup_visible_columns();
        grid.make_head();
        grid.refresh();
    }
}

/* ---------- Field -> Maping Column (e.g. Hours -> Qty) ---------- */
function register_mappings(fields, child_doctype) {
    fields.forEach(df => {
        if (_mapping_registered[df.fieldname]) return;
        _mapping_registered[df.fieldname] = true;

        frappe.ui.form.on(child_doctype, df.fieldname, (frm, cdt, cdn) => {
            const row = locals[cdt][cdn];
            (frm.sv_config || []).forEach(cfg => {
                const from = resolve_field(fields, cfg.field);
                const to = resolve_field(fields, cfg.maping__column);
                if (from && to && from.fieldname === df.fieldname && from.fieldname !== to.fieldname) {
                    frappe.model.set_value(cdt, cdn, to.fieldname, row[from.fieldname]);
                }
            });
        });
    });
}