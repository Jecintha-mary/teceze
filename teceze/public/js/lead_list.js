// apps/teceze/teceze/public/js/list_view/lead_list.js
console.log("TECEZE LEAD LIST JS LOADED");

frappe.listview_settings["Lead"] = {

    add_fields: [
        "title",
        "status",
        "custom_region_name",
        "custom_client_company",
        "lead_owner"
    ],

    has_indicator_for_draft: 1,

    // ----------------------------------
    // STATUS INDICATORS
    // ----------------------------------
    get_indicator: function (doc) {
        const status_config = {
            "Lead": ["blue", "Lead"],
            "Open": ["blue", "Open"],
            "Replied": ["cyan", "Replied"],
            "Opportunity": ["purple", "Opportunity"],
            "Quotation": ["orange", "Quotation"],
            "Lost Quotation": ["red", "Lost Quotation"],
            "Interested": ["green", "Interested"],
            "Converted": ["green", "Converted"],
            "Do Not Contact": ["red", "Do Not Contact"]
        };

        const status = !doc.docstatus && doc.status === "Lead" ? "Draft" : doc.status;
        const config = status_config[status] || ["gray", status];

        return [__(config[1]), config[0], "status,=," + doc.status];
    },

    // ----------------------------------
    // ONLOAD
    // ----------------------------------
    onload: function (listview) {

        const page_main = listview.page.main;

        if (page_main.find(".ld-dashboard").length) return;

        // ======================================================
        // CONFIG
        // ======================================================
        const ICONS = {
            layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
            user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
            chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
            star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
            target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
            file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
            check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            xcircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
            ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
            clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
            alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
            left: '<polyline points="15 18 9 12 15 6"/>',
            right: '<polyline points="9 18 15 12 9 6"/>'
        };

        const STATUS_META = {
            "Lead":           { color: "#3b82f6", icon: "user" },
            "Open":           { color: "#0ea5e9", icon: "chat" },
            "Replied":        { color: "#06b6d4", icon: "chat" },
            "Interested":     { color: "#10b981", icon: "star" },
            "Opportunity":    { color: "#8b5cf6", icon: "target" },
            "Quotation":      { color: "#f59e0b", icon: "file" },
            "Converted":      { color: "#22c55e", icon: "check" },
            "Lost Quotation": { color: "#ef4444", icon: "xcircle" },
            "Do Not Contact": { color: "#64748b", icon: "ban" }
        };
        const STATUS_ORDER = Object.keys(STATUS_META);

        // ======================================================
        // CSS
        // ======================================================
        if (!document.getElementById("ld-dashboard-styles")) {
            const style = document.createElement("style");
            style.id = "ld-dashboard-styles";
            style.textContent = `
                .ld-dashboard { margin:14px 11px 22px}

                /* ---------- header ---------- */
                .ld-header {
                    display: flex; align-items: flex-end;
                    justify-content: space-between; margin-bottom: 12px;
                }
                .ld-header h4 {
                    font-size: 17px; font-weight: 700; margin: 0 0 3px;
                    color: var(--heading-color); letter-spacing: -0.01em;
                }
                .ld-header p { font-size: 12px; color: var(--text-muted); margin: 0; }
                .ld-actions { display: flex; align-items: center; gap: 8px; }
                .ld-clear {
                    font-size: 12px; font-weight: 600; color: var(--primary);
                    cursor: pointer; display: none; margin-right: 4px;
                }
                .ld-clear:hover { text-decoration: underline; }

                .ld-nav {
                    width: 28px; height: 28px; border-radius: 9px; cursor: pointer;
                    display: grid; place-items: center;
                    background: var(--card-bg); color: var(--text-muted);
                    border: 1px solid var(--border-color);
                    transition: all .2s ease;
                }
                .ld-nav:hover { color: var(--primary); border-color: var(--primary); }
                .ld-nav svg {
                    width: 14px; height: 14px; fill: none; stroke: currentColor;
                    stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
                }

                /* ---------- single row, horizontal scroll ---------- */
                .ld-grid {
                    display: flex; flex-wrap: nowrap; gap: 12px;
                    overflow-x: auto; overflow-y: hidden;
                    padding: 8px 4px 16px;
                    scroll-snap-type: x proximity;
                    scroll-behavior: smooth;
                    scrollbar-width: thin;
                    -webkit-overflow-scrolling: touch;
                }
                .ld-grid::-webkit-scrollbar { height: 6px; }
                .ld-grid::-webkit-scrollbar-thumb {
                    background: var(--border-color); border-radius: 999px;
                }

                /* ---------- card (wide rectangle) ----------
                   Same HTML as before: icon on the left, text on the right.
                   .ld-top uses display: contents so the icon and tag
                   become direct grid items of the card. */
                .ld-card {
                    --c: #3b82f6;
                    flex: 0 0 270px; min-height: 88px;
                    display: grid;
                    grid-template-columns: 42px minmax(0, 1fr);
                    column-gap: 14px; row-gap: 0;
                    align-items: center;
                    position: relative; overflow: hidden; isolation: isolate;
                    border-radius: 12px; padding: 14px 16px 14px 20px;
                    cursor: pointer; scroll-snap-align: start;
                    
                    border: 1px solid color-mix(in srgb, var(--c) 24%, var(--border-color));
                    box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
                    transition: transform .25s cubic-bezier(.2,.8,.2,1),
                                box-shadow .25s ease, border-color .25s ease;
                    animation: ld-rise .45s cubic-bezier(.2,.8,.2,1) both;
                }
                /* left accent strip */
                .ld-card::before {
                    content: ""; position: absolute; inset: 0 auto 0 0; width: 4px;
                    background: linear-gradient(180deg, var(--c),
                        color-mix(in srgb, var(--c) 35%, transparent));
                }
                /* soft glow */
                .ld-card::after {
                    content: ""; position: absolute; z-index: -1;
                    width: 120px; height: 120px; right: -40px; top: -50px;
                    background: radial-gradient(circle,
                        color-mix(in srgb, var(--c) 26%, transparent) 0%, transparent 70%);
                    transition: transform .35s ease, opacity .35s ease; opacity: .8;
                }
                .ld-card:hover {
                    transform: translateY(-2px);
                    border-color: var(--c);
                    box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--c) 45%, transparent);
                }
                .ld-card:hover::after { transform: scale(1.3); opacity: 1; }

                .ld-card.active {
                    border-color: var(--c);
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 35%, transparent),
                                0 10px 22px -10px color-mix(in srgb, var(--c) 50%, transparent);
                }

                /* wrapper disappears, children join the card grid */
                .ld-top { display: contents; }

                /* column 1: icon spans all rows */
                .ld-icon {
                    grid-column: 1; grid-row: 1 / span 4; align-self: center;
                    width: 42px; height: 42px; border-radius: 12px;
                    display: grid; place-items: center;
                    background: color-mix(in srgb, var(--c) 16%, transparent);
                    color: var(--c);
                }
                .ld-icon svg {
                    width: 20px; height: 20px; fill: none; stroke: currentColor;
                    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
                }

                /* column 2: label, count (+ tag on the right), bar, foot */
                .ld-label {
                    grid-column: 2; grid-row: 1;
                    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
                    letter-spacing: .06em; color: var(--text-muted);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .ld-count {
                    grid-column: 2; grid-row: 2; justify-self: start;
                    font-size: 24px; line-height: 1.1; font-weight: 800;
                    margin: 4px 0 2px; color: var(--heading-color);
                    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
                }
                .ld-tag {
                    grid-column: 2; grid-row: 2; justify-self: end; align-self: center;
                    font-size: 8px; font-weight: 700; letter-spacing: .08em;
                    text-transform: uppercase; padding: 2px 6px; border-radius: 999px;
                    color: var(--c);
                    background: color-mix(in srgb, var(--c) 14%, transparent);
                }
                .ld-bar {
                    grid-column: 2; grid-row: 3;
                    height: 4px; border-radius: 999px; margin-top: 6px; overflow: hidden;
                    background: color-mix(in srgb, var(--c) 14%, transparent);
                }
                .ld-bar > span {
                    display: block; height: 100%; border-radius: 999px; width: 0;
                    background: linear-gradient(90deg, var(--c),
                        color-mix(in srgb, var(--c) 60%, #fff));
                    transition: width .9s cubic-bezier(.2,.8,.2,1);
                }
                .ld-foot {
                    grid-column: 2; grid-row: 4;
                    font-size: 10px; color: var(--text-muted); margin-top: 4px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }

                /* urgent pulse on overdue */
                .ld-card.ld-urgent .ld-icon { animation: ld-pulse 1.8s infinite; }

                @keyframes ld-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
                @keyframes ld-pulse {
                    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent); }
                    70%  { box-shadow: 0 0 0 9px transparent; }
                    100% { box-shadow: 0 0 0 0 transparent; }
                }

                .ld-loading { opacity: .5; pointer-events: none; }
                .ld-error { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
            `;
            document.head.appendChild(style);
        }

        // ======================================================
        // SKELETON
        // ======================================================
        const svg = name => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

        const dashboard = $(`
            <div class="ld-dashboard">
                <div class="ld-header">
                    <div>
                        <h4>${__("Lead Overview")}</h4>
                        <p>${__("Monitor and track your lead pipeline")}</p>
                    </div>
                    <div class="ld-actions">
                        <a class="ld-clear">${__("Clear filter")}</a>
                        <div class="ld-nav ld-prev">${svg("left")}</div>
                        <div class="ld-nav ld-next">${svg("right")}</div>
                    </div>
                </div>
                <div class="ld-grid"></div>
                <div class="ld-error"></div>
            </div>
        `);

        page_main.prepend(dashboard);

        const grid = dashboard.find(".ld-grid");
        let followup_leads = {};   // key -> [lead names]

        // arrow buttons scroll the row
        dashboard.on("click", ".ld-prev", () => grid[0].scrollBy({ left: -340, behavior: "smooth" }));
        dashboard.on("click", ".ld-next", () => grid[0].scrollBy({ left: 340, behavior: "smooth" }));

        // ======================================================
        // HELPERS
        // ======================================================
        function animate_count(el, to) {
            const duration = 700, start = performance.now();
            function frame(now) {
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(to * eased).toLocaleString();
                if (p < 1) requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        function card_html(c, i) {
            return `
                <div class="ld-card ${c.urgent ? "ld-urgent" : ""}"
                     data-type="${c.type}" data-key="${frappe.utils.escape_html(c.key)}"
                     style="--c:${c.color}; animation-delay:${i * 45}ms">
                    <div class="ld-top">
                        <div class="ld-icon">${svg(c.icon)}</div>
                        ${c.tag ? `<span class="ld-tag">${c.tag}</span>` : ""}
                    </div>
                    <div class="ld-count" data-to="${c.count}">0</div>
                    <div class="ld-label">${frappe.utils.escape_html(__(c.label))}</div>
                    ${c.pct !== undefined
                        ? `<div class="ld-bar"><span data-w="${c.pct}"></span></div>
                           <div class="ld-foot">${c.pct}% ${__("of total")}</div>`
                        : `<div class="ld-foot">${__("Needs your attention")}</div>`}
                </div>`;
        }

        // ======================================================
        // RENDER (only cards with value > 0)
        // ======================================================
        function render(data) {
            const total = data.total || 0;
            const statuses = data.statuses || {};
            const fu = data.followups || {};
            followup_leads = fu;

            const cards = [];

            if (total > 0) {
                cards.push({ type: "all", key: "ALL", label: "Total Leads",
                    count: total, color: "#6366f1", icon: "layers", pct: 100 });
            }

            const fu_cards = [
                { k: "overdue", label: "Overdue Follow-ups", color: "#ef4444", icon: "alert", urgent: true },
                { k: "today",   label: "Due Today",          color: "#f59e0b", icon: "calendar" },
                { k: "pending", label: "Pending Follow-ups", color: "#0ea5e9", icon: "clock" }
            ];
            fu_cards.forEach(f => {
                const n = (fu[f.k] || []).length;
                if (n > 0) {
                    cards.push({ type: "followup", key: f.k, label: f.label, count: n,
                        color: f.color, icon: f.icon, urgent: f.urgent, tag: __("Follow-up") });
                }
            });

            // Known statuses in pipeline order, then any unknown ones
            const keys = STATUS_ORDER.filter(s => statuses[s] > 0)
                .concat(Object.keys(statuses).filter(s => !STATUS_ORDER.includes(s) && statuses[s] > 0));

            keys.forEach(s => {
                const meta = STATUS_META[s] || { color: "#64748b", icon: "user" };
                cards.push({
                    type: "status", key: s, label: s, count: statuses[s],
                    color: meta.color, icon: meta.icon,
                    pct: total ? Math.round((statuses[s] / total) * 100) : 0
                });
            });

            grid.html(cards.map(card_html).join(""));

            grid.find(".ld-count").each(function () {
                animate_count(this, parseInt($(this).attr("data-to"), 10));
            });
            requestAnimationFrame(() => {
                grid.find(".ld-bar > span").each(function () {
                    $(this).css("width", $(this).attr("data-w") + "%");
                });
            });
        }

        // ======================================================
        // LOAD DATA
        // ======================================================
        function load_dashboard() {
            dashboard.addClass("ld-loading");
            dashboard.find(".ld-error").text("");

            frappe.call({
                // use "teceze.overrides.lead..." if your file is at teceze/overrides/lead.py
                method: "teceze.teceze.overrides.lead.get_lead_dashboard_counts",
                callback: function (r) {
                    dashboard.removeClass("ld-loading");
                    if (!r.message) {
                        dashboard.find(".ld-error").text(__("Unable to load Lead dashboard."));
                        return;
                    }
                    render(r.message);
                },
                error: function () {
                    dashboard.removeClass("ld-loading");
                    dashboard.find(".ld-error").text(__("Failed to load Lead dashboard counts."));
                }
            });
        }

        load_dashboard();

        // ======================================================
        // FILTERING
        // ======================================================
        function reset_filters() {
            listview.filter_area.remove("status");
            listview.filter_area.remove("name");
        }

        function clear_all() {
            grid.find(".ld-card").removeClass("active");
            dashboard.find(".ld-clear").hide();
            reset_filters();
            listview.refresh();
        }

        dashboard.on("click", ".ld-clear", clear_all);

        dashboard.on("click", ".ld-card", function () {
            const card = $(this);
            const type = card.attr("data-type");
            const key = card.attr("data-key");

            // click the active card again to clear
            if (card.hasClass("active")) return clear_all();

            grid.find(".ld-card").removeClass("active");
            card.addClass("active");
            dashboard.find(".ld-clear").show();

            reset_filters();

            if (type === "status") {
                listview.filter_area.add([["Lead", "status", "=", key]]);
            } else if (type === "followup") {
                const names = followup_leads[key] || [];
                listview.filter_area.add([["Lead", "name", "in", names.join(",")]]);
            } else {
                listview.refresh();
            }
        });

        listview.page.add_inner_button(__("Refresh Dashboard"), load_dashboard);
    }
};