frappe.ui.form.on("Opportunity", {
    setup(frm) {
        frm.set_query("custom_sub_service_vertical", function() {
            return {
                filters: {
                    service_vertical: frm.doc.custom_service_vertical
                }
            };
        });
    },

    
    
    refresh(frm) {
        
        apply_grid_column_visibility(frm);
        
        load_status_tracking(frm);
        toggle_create_menu(frm);

    },

    status(frm) {

        toggle_create_menu(frm);

    },
    custom_service_vertical(frm) {
        apply_grid_column_visibility(frm);
    },

    items_add(frm) {
        setTimeout(() => apply_grid_column_visibility(frm), 100);
    },

    custom_service_vertical: function(frm) {
        // Clear Sub Service Vertical whenever Service Vertical changes
        frm.clear_table("custom_sub_service_vertical");
        frm.refresh_field("custom_sub_service_vertical");
    },
     custom_use_billing_address: function(frm) {
        frm.set_value("custom_ship_street", frm.doc.custom_street);
        frm.set_value("custom_ship_zip_code", frm.doc.custom_zip_code);
        frm.set_value("custom_ship_city", frm.doc.custom_bill_city);
        frm.set_value("custom_ship_stateprovince", frm.doc.custom_stateprovince);
        frm.set_value("custom_ship_location", frm.doc.custom_location);
        frm.set_value("custom_ship_country", frm.doc.custom_bill_country);
    }
});
function toggle_create_menu(frm) {

    setTimeout(() => {

        const create_btn = frm.page.wrapper.find(
            '.inner-group-button[data-label="Create"]'
        );

        create_btn.toggle(frm.doc.status === "Quotation");

    }, 100);

}
function apply_grid_column_visibility(frm) {
    const vertical = frm.doc.custom_service_vertical;
    const grid = frm.fields_dict.items?.grid;

    if (!grid || !grid.docfields) return;

    const is_procurement = (vertical === "Global Procurement Services");
    const is_field_eng = (vertical === "Field Engineering Services");
    const is_standard = [
        "Cloud & Infrastructure Services",
        "Cybersecurity",
        "Digital Workplace Services",
        "Software Development"
    ].includes(vertical);

    const visibility = {
        "item_name": is_procurement || !vertical ? 1 : 0,
        "custom_descriptions": (is_procurement || is_standard || !vertical) ? 1 : 0,
        "qty": is_procurement ? 1 : 0,
        "custom_tax": is_procurement ? 1 : 0,
        "custom_taxable_value": is_procurement ? 1 : 0,
        "custom_resource": is_field_eng ? 1 : 0,
        "custom_scope": is_field_eng ? 1 : 0,
        "rate": is_field_eng ? 1 : 0,
        "amount": (is_procurement || is_standard || !vertical) ? 1 : 0
    };

    grid.docfields.forEach(df => {
        if (visibility.hasOwnProperty(df.fieldname)) {
            df.in_list_view = visibility[df.fieldname];
        }
    });

    grid.visible_columns = [];
    grid.setup_visible_columns();

    const wrapper = frm.fields_dict.items?.wrapper;
    if (wrapper) {
        const $wrapper = $(wrapper);
        Object.entries(visibility).forEach(([field, show]) => {
            $wrapper.find(`.grid-row [data-fieldname="${field}"], .grid-heading-row [data-fieldname="${field}"]`)
                .toggle(Boolean(show));
        });
    }

    if (grid.header_row) grid.header_row.refresh();
}
frappe.ui.form.on("Opportunity", {
    refresh(frm) {
        load_status_tracking(frm);
    }
});
async function load_status_tracking(frm) {

    const wrapper = frm.get_field("custom_dashboard").$wrapper;

    if (frm.is_new()) {
        wrapper.html("");
        return;
    }

    try {

        const response = await frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Version",
                filters: {
                    ref_doctype: "Opportunity",
                    docname: frm.doc.name
                },
                fields: ["name", "creation", "owner", "data"],
                order_by: "creation asc",
                limit_page_length: 100
            }
        });

        const versions = response.message || [];
        const statuses = [];

        // Get EVERY status change from Version
        for (const version of versions) {

            if (!version.data) continue;

            let data;

            try {
                data = JSON.parse(version.data);
            } catch (e) {
                continue;
            }

            for (const change of data.changed || []) {

                if (change[0] !== "status") continue;

                statuses.push({
                    status: change[1],
                    date: version.creation,
                    user: version.owner
                });
            }
        }

        // Finally append CURRENT status separately
        statuses.push({
            status: frm.doc.status,
            date: null,
            user: null,
            current: true
        });

        if (!statuses.length) {
            wrapper.html(`
                <div class="status-empty">
                    No status history available.
                </div>
            `);
            return;
        }

        const icons = {
            "Open": `
                <svg viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
            `,

            "Presales Assessment": `
                <svg viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="6.5"/>
                    <path d="m16 16 5 5M8.5 11h5"/>
                </svg>
            `,

            "Quotation": `
                <svg viewBox="0 0 24 24">
                    <path d="M6 3h12v18l-6-3-6 3z"/>
                    <path d="M9 8h6M9 12h6M9 16h4"/>
                </svg>
            `,

            "Converted": `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="m8 12 2.5 2.5L16 9"/>
                </svg>
            `,

            "Lost": `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="m9 9 6 6M15 9l-6 6"/>
                </svg>
            `,

            "Replied": `
                <svg viewBox="0 0 24 24">
                    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 3v-6.5A7.5 7.5 0 0 1 10.5 8H13"/>
                    <path d="M15 4h5v5M20 4l-6 6"/>
                </svg>
            `,

            "Closed": `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="m8 12 2.5 2.5L16 9"/>
                </svg>
            `
        };

        let html = `
            <div class="status-tracker">
                <div class="status-track">
        `;

        statuses.forEach((item, index) => {

            const key = item.status
                .toLowerCase()
                .replace(/\s+/g, "-");

            const icon = icons[item.status] || `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8"/>
                </svg>
            `;

            html += `
                <div class="status-step ${key} ${item.current ? "current" : ""}">

                    <div class="status-icon">
                        ${icon}
                    </div>

                    <div class="status-name">
                        ${item.status}
                    </div>

                    ${
                        item.current
                        ? `<div class="current-label">CURRENT</div>`
                        : `
                            <div class="status-date">
                                ${frappe.datetime.str_to_user(item.date)}
                            </div>

                            <div class="status-user">
                                ${item.user || ""}
                            </div>
                        `
                    }

                </div>
            `;

            if (index < statuses.length - 1) {
                html += `<div class="status-connector"></div>`;
            }
        });

        html += `
                </div>
            </div>

            <style>

                .status-tracker {
                    width: 100%;
                    padding: 24px 12px 30px;
                    background: linear-gradient(180deg,#fff,#fafbfc);
                    border: 1px solid #e9edf2;
                    border-radius: 14px;
                    box-sizing: border-box;
                }

                .status-track {
                    display: flex;
                    align-items: flex-start;
                    overflow-x: auto;
                    padding: 5px 10px 12px;
                    scrollbar-width: 0.2px;
                }

                .status-track::-webkit-scrollbar {
                    display: none;
                }

                .status-step {
                    min-width: 145px;
                    text-align: center;
                    flex-shrink: 0;
                }

                .status-icon {
                    width: 46px;
                    height: 46px;
                    margin: auto;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f7f8fa;
                    color: #64748b;
                    border: 1px solid #e2e7ed;
                    box-shadow: 0 4px 12px rgba(0,0,0,.06);
                    transition: .2s ease;
                }

                .status-icon svg {
                    width: 21px;
                    height: 21px;
                    fill: none;
                    stroke: currentColor;
                    stroke-width: 1.8;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                }

                .status-step:hover .status-icon {
                    transform: translateY(-3px);
                    box-shadow: 0 8px 20px rgba(0,0,0,.10);
                }

                .open .status-icon {
                    background:#eef7ff;
                    color:#2490ef;
                    border-color:#c8e3ff;
                }

                .presales-assessment .status-icon {
                    background:#f4f0ff;
                    color:#7c5cff;
                    border-color:#ddd3ff;
                }

                .quotation .status-icon {
                    background:#fff7e8;
                    color:#e6a11a;
                    border-color:#f5dfad;
                }

                .converted .status-icon {
                    background:#edfaf3;
                    color:#20a464;
                    border-color:#c7ecd9;
                }

                .lost .status-icon {
                    background:#fff1f1;
                    color:#e05252;
                    border-color:#f2cccc;
                }

                .replied .status-icon {
                    background:#eef9f8;
                    color:#149c94;
                    border-color:#c6e9e6;
                }

                .closed .status-icon {
                    background:#f0f3f6;
                    color:#475569;
                    border-color:#d9dee5;
                }

                .status-step.current .status-icon {
                    box-shadow:
                        0 0 0 4px rgba(36,144,239,.10),
                        0 8px 22px rgba(36,144,239,.18);
                    transform: translateY(-2px);
                }

                .status-name {
                    margin-top: 11px;
                    font-size: 13px;
                    font-weight: 650;
                    color: #25282d;
                    white-space: nowrap;
                }

                .status-date {
                    margin-top: 5px;
                    font-size: 10px;
                    color: #8b95a1;
                    white-space: nowrap;
                }

                .status-user {
                    margin-top: 3px;
                    font-size: 10px;
                    color: #a4acb5;
                    max-width: 145px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    margin-left: auto;
                    margin-right: auto;
                }

                .current-label {
                    display: inline-block;
                    margin-top: 7px;
                    padding: 4px 10px;
                    border-radius: 20px;
                    background: #eaf5ff;
                    color: #2490ef;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: .7px;
                }

                .status-connector {
                    width: 55px;
                    height: 2px;
                    margin-top: 22px;
                    flex-shrink: 0;
                    background: linear-gradient(
                        90deg,#dfe4e9,#cfd5dc
                    );
                    border-radius: 10px;
                }

                .status-empty {
                    padding: 20px;
                    text-align: center;
                    color: #999;
                }

            </style>
        `;

wrapper.html(html);

requestAnimationFrame(() => {

    const status_track = wrapper.find(".status-track")[0];

    if (status_track) {
        status_track.scrollLeft = status_track.scrollWidth;
    }

});
    } catch (error) {

        console.error("Status tracking error:", error);

        wrapper.html(`
            <div class="status-empty">
                Unable to load status history.
            </div>
        `);
    }
}