// apps/teceze/teceze/public/js/opportunity_list.js
console.log("TECEZE OPPORTUNITY LIST JS LOADED");

(function () {

    // ======================================================
    // CONFIG
    // ======================================================
    // Python API. Both module paths are tried, so it works either way.
    const METHODS = [
        "teceze.teceze.overrides.opportunity.get_opportunity_dashboard",
        "teceze.teceze.overrides.opportunity.get_opportunity_dashboard"
    ];

    const CLOSED = ["Converted", "Lost", "Closed"];

    // Known workflow states get fixed colours; any other state gets one from the palette.
    const STATE_COLORS = {
        "Draft": "#64748b",
        "Preparing Quotation": "#3b82f6",
        "Presales Assessment": "#8b5cf6"
    };
    const PALETTE = ["#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

    const ICONS = {
        layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
        wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        left: '<polyline points="15 18 9 12 15 6"/>',
        right: '<polyline points="9 18 15 12 9 6"/>'
    };
    const svg = n => `<svg viewBox="0 0 24 24">${ICONS[n] || ICONS.target}</svg>`;

    // ======================================================
    // HELPERS
    // ======================================================
    function currency_symbol() {
        const cur = (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "INR";
        try {
            if (typeof get_currency_symbol === "function") return get_currency_symbol(cur) || cur;
        } catch (e) { /* ignore */ }
        return cur === "INR" ? "₹" : cur + " ";
    }

    function compact(v) {
        const a = Math.abs(v);
        const f = (x, s) => x.toFixed(2).replace(/\.?0+$/, "") + s;
        if (a >= 1e7) return f(v / 1e7, " Cr");
        if (a >= 1e5) return f(v / 1e5, " L");
        if (a >= 1e3) return f(v / 1e3, " K");
        return String(Math.round(v));
    }

    const money = v => currency_symbol() + compact(v || 0);

    function color_for(state, i) {
        return STATE_COLORS[state] || PALETTE[i % PALETTE.length];
    }

    async function call_api() {
        let last_error;
        for (const method of METHODS) {
            try {
                return await frappe.xcall(method);
            } catch (e) {
                last_error = e;
            }
        }
        throw last_error;
    }

    // ======================================================
    // CSS (injected once)
    // ======================================================
    function inject_css() {
        if (document.getElementById("op-dashboard-styles")) return;
        const style = document.createElement("style");
        style.id = "op-dashboard-styles";
        style.textContent = `
            .op-dashboard { margin: 14px 11px 22px; }
            .op-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; }
            .op-header h4 { font-size: 17px; font-weight: 700; margin: 0 0 3px; color: var(--heading-color); letter-spacing: -0.01em; }
            .op-header p { font-size: 12px; color: var(--text-muted); margin: 0; }
            .op-actions { display: flex; align-items: center; gap: 8px; }
            .op-clear { font-size: 12px; font-weight: 600; color: var(--primary); cursor: pointer; display: none; margin-right: 4px; }
            .op-clear:hover { text-decoration: underline; }

            .op-nav {
                width: 28px; height: 28px; border-radius: 9px; cursor: pointer;
                display: grid; place-items: center; background: var(--card-bg);
                color: var(--text-muted); border: 1px solid var(--border-color); transition: all .2s ease;
            }
            .op-nav:hover { color: var(--primary); border-color: var(--primary); }
            .op-nav svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

            .op-grid {
                display: flex; flex-wrap: nowrap; gap: 12px;
                overflow-x: auto; overflow-y: hidden; padding: 8px 4px 16px;
                scroll-snap-type: x proximity; scroll-behavior: smooth; scrollbar-width: thin;
            }
            .op-grid::-webkit-scrollbar { height: 6px; }
            .op-grid::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

            .op-card {
                --c: #3b82f6;
                flex: 0 0 270px; min-height: 88px;
                display: flex; align-items: center; gap: 14px;
                position: relative; overflow: hidden; isolation: isolate;
                border-radius: 12px; padding: 14px 16px 14px 20px;
                cursor: pointer; scroll-snap-align: start;
                
                border: 1px solid color-mix(in srgb, var(--c) 24%, var(--border-color));
                box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
                transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease, border-color .25s ease;
                animation: op-rise .45s cubic-bezier(.2,.8,.2,1) both;
            }
            /* left accent strip */
            .op-card::before {
                content: ""; position: absolute; inset: 0 auto 0 0; width: 4px;
            }
            /* soft glow */
            .op-card::after {
                content: ""; position: absolute; z-index: -1; width: 120px; height: 120px; right: -40px; top: -50px;
                transition: transform .35s ease, opacity .35s ease; opacity: .8;
            }
            .op-card:hover { transform: translateY(-2px); border-color: var(--c); box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--c) 45%, transparent); }
            .op-card:hover::after { transform: scale(1.3); opacity: 1; }
            .op-card.active {
                border-color: var(--c);
                box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 35%, transparent), 0 10px 22px -10px color-mix(in srgb, var(--c) 50%, transparent);
            }

            .op-icon {
                flex: 0 0 42px; width: 42px; height: 42px; border-radius: 12px;
                display: grid; place-items: center;
                background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
            }
            .op-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

            .op-body { flex: 1 1 auto; min-width: 0; }
            .op-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .op-label {
                font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
                color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .op-tag {
                flex: none; font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
                padding: 2px 6px; border-radius: 999px; color: var(--c);
                background: color-mix(in srgb, var(--c) 14%, transparent);
            }
            .op-main { display: flex; align-items: baseline; gap: 10px; margin: 4px 0 2px; }
            .op-big {
                font-size: 24px; line-height: 1.1; font-weight: 800; color: var(--heading-color);
                font-variant-numeric: tabular-nums; letter-spacing: -0.02em; white-space: nowrap;
            }
            .op-value { font-size: 12px; font-weight: 700; color: var(--c); white-space: nowrap; }
            .op-bar { height: 4px; border-radius: 999px; margin-top: 6px; overflow: hidden; background: color-mix(in srgb, var(--c) 14%, transparent); }
            .op-bar > span {
                display: block; height: 100%; border-radius: 999px; width: 0;
                transition: width .9s cubic-bezier(.2,.8,.2,1);
            }
            .op-foot { font-size: 10px; color: var(--text-muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            @keyframes op-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
            .op-loading { opacity: .5; pointer-events: none; }
            .op-error { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
        `;
        document.head.appendChild(style);
    }

    // ======================================================
    // DASHBOARD
    // ======================================================
    function init(listview) {
        const page_main = listview.page.main;
        if (page_main.find(".op-dashboard").length) return;

        inject_css();

        const dashboard = $(`
            <div class="op-dashboard">
                <div class="op-header">
                    <div>
                        <h4>${__("Opportunity Overview")}</h4>
                        <p>${__("Pipeline value and status-wise breakdown")}</p>
                    </div>
                    <div class="op-actions">
                        <a class="op-clear">${__("Clear filter")}</a>
                        <div class="op-nav op-prev">${svg("left")}</div>
                        <div class="op-nav op-next">${svg("right")}</div>
                    </div>
                </div>
                <div class="op-grid"></div>
                <div class="op-error"></div>
            </div>
        `);

        page_main.prepend(dashboard);

        const grid = dashboard.find(".op-grid");

        dashboard.on("click", ".op-prev", () => grid[0].scrollBy({ left: -340, behavior: "smooth" }));
        dashboard.on("click", ".op-next", () => grid[0].scrollBy({ left: 340, behavior: "smooth" }));

        function card_html(c, i) {
            return `
                <div class="op-card" data-type="${c.type}" data-key="${frappe.utils.escape_html(c.key)}"
                     style="--c:${c.color}; animation-delay:${i * 45}ms">
                    <div class="op-icon">${svg(c.icon)}</div>
                    <div class="op-body">
                        <div class="op-row">
                            <span class="op-label">${frappe.utils.escape_html(__(c.label))}</span>
                            ${c.tag ? `<span class="op-tag">${frappe.utils.escape_html(__(c.tag))}</span>` : ""}
                        </div>
                        <div class="op-main">
                            <span class="op-big">${c.big}</span>
                            ${c.value ? `<span class="op-value">${c.value}</span>` : ""}
                        </div>
                        ${c.pct !== undefined ? `<div class="op-bar"><span data-w="${c.pct}"></span></div>` : ""}
                        <div class="op-foot">${c.foot || ""}</div>
                    </div>
                </div>`;
        }

        function render(data) {
            const total = data.total || 0;
            const states = data.states || {};
            const cards = [];

            // 1. Pipeline value (open opportunities only)
            cards.push({
                type: "pipeline", key: "PIPELINE", label: "Pipeline Value", tag: "Open",
                color: "#10b981", icon: "wallet",
                big: money(data.pipeline_value),
                foot: `${(data.open_count || 0).toLocaleString()} ${__("open opportunities")}`
            });

            // 2. Total opportunities
            if (total > 0) {
                cards.push({
                    type: "all", key: "ALL", label: "Total Opportunities",
                    color: "#6366f1", icon: "layers",
                    big: total.toLocaleString(),
                    foot: `${__("Total value")} ${money(data.total_value)}`
                });
            }

            // 3. One card per workflow state (only states that have records)
            Object.keys(states)
                .filter(s => states[s].count > 0)
                .sort((a, b) => states[b].count - states[a].count)
                .forEach((s, i) => {
                    const st = states[s];
                    const exact = total ? (st.count / total) * 100 : 0;
                    cards.push({
                        type: "state", key: s, label: s,
                        color: color_for(s, i), icon: "target",
                        big: st.count.toLocaleString(),
                        value: money(st.value),
                        pct: Math.max(exact, 3),
                        foot: `${exact > 0 && exact < 1 ? "<1" : Math.round(exact)}% ${__("of total")}`
                    });
                });

            grid.html(cards.map(card_html).join(""));

            requestAnimationFrame(() => {
                grid.find(".op-bar > span").each(function () {
                    $(this).css("width", $(this).attr("data-w") + "%");
                });
            });
        }

        async function load_dashboard() {
            dashboard.addClass("op-loading");
            dashboard.find(".op-error").text("");
            try {
                render(await call_api());
            } catch (e) {
                console.error("Opportunity dashboard failed", e);
                dashboard.find(".op-error").text(__("Failed to load dashboard. Check the browser console for details."));
            }
            dashboard.removeClass("op-loading");
        }

        load_dashboard();

        // ---------- filtering ----------
        function reset_filters() {
            listview.filter_area.remove("workflow_state");
            listview.filter_area.remove("status");
        }

        function clear_all() {
            grid.find(".op-card").removeClass("active");
            dashboard.find(".op-clear").hide();
            reset_filters();
            listview.refresh();
        }

        dashboard.on("click", ".op-clear", clear_all);

        dashboard.on("click", ".op-card", function () {
            const card = $(this);
            const type = card.attr("data-type");
            const key = card.attr("data-key");

            if (card.hasClass("active")) return clear_all();

            grid.find(".op-card").removeClass("active");
            card.addClass("active");
            dashboard.find(".op-clear").show();

            reset_filters();

            if (type === "state") {
                listview.filter_area.add([["Opportunity", "workflow_state", "=", key]]);
            } else if (type === "pipeline") {
                listview.filter_area.add([["Opportunity", "status", "not in", CLOSED.join(",")]]);
            } else {
                listview.refresh();
            }
        });

        listview.page.add_inner_button(__("Refresh Dashboard"), load_dashboard);
    }

    // ======================================================
    // HOOK INTO THE LIST VIEW
    // ======================================================
    // 1) Extend (not replace) ERPNext's own settings so its indicators keep working
    const base = frappe.listview_settings["Opportunity"] || {};

    if (!base.__teceze_patched) {
        const base_onload = base.onload;

        frappe.listview_settings["Opportunity"] = Object.assign(base, {
            __teceze_patched: true,
            onload: function (listview) {
                if (base_onload) base_onload.call(this, listview);
                init(listview);
            }
        });
    }

    // 2) Fallback: if onload didn't fire, start it as soon as the list is on screen
    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        if (window.cur_list && cur_list.doctype === "Opportunity" && cur_list.page && cur_list.page.main) {
            init(cur_list);
            clearInterval(timer);
        } else if (tries > 40) {
            clearInterval(timer);
        }
    }, 250);

})();