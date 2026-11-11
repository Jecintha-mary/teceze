frappe.query_reports["Raised Concerns Report"] = {

    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start(),
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_end(),
        },
        {
            fieldname: "status",
            label: __("Status"),
            fieldtype: "Select",
            options: "\nOpen\nReplied\nOn Hold\nResolved\nClosed",
            default:"Open",
        },
    ],

    /* Status pills inside the table */
    formatter: function (value, row, column, data, default_formatter) {
        if (column.fieldname === "status" && data && data.status) {
            const s = CONCERN_STATUS[data.status] || CONCERN_STATUS["Closed"];
            return `<span class="concern-pill" style="background:${s.pill_bg}; color:${s.pill_text};">
                        ${frappe.utils.escape_html(__(data.status))}
                    </span>`;
        }
        if (["resolution_date", "replied_date"].includes(column.fieldname) && !value) {
            return `<span style="color: var(--text-muted);">–</span>`;
        }
        return default_formatter(value, row, column, data);
    },

    after_datatable_render: function () {
        $(frappe.query_report.page.main).addClass("concern-report");
        inject_concern_styles();
        render_concern_cards();
        render_concern_donut();
    },
};

/* ------------------------------------------------------------------ */
/* One place for every status colour                                   */
/* ------------------------------------------------------------------ */
const CONCERN_STATUS = {
    "Open":    { accent: "#E5484D", donut: "#F0566A", pill_bg: "#FFE3E6", pill_text: "#C0182F" },
    "Replied": { accent: "#2F80ED", donut: "#4A9BF5", pill_bg: "#DCEBFF", pill_text: "#1F5FBF" },
    "On Hold": { accent: "#F28C28", donut: "#F5A04A", pill_bg: "#FFEBCF", pill_text: "#8A4B00" },
    "Resolved":{ accent: "#2EA66F", donut: "#34B57C", pill_bg: "#D9F5E6", pill_text: "#0B6B4D" },
    "Closed":  { accent: "#7E8CA8", donut: "#8E9BB5", pill_bg: "#ECEEF3", pill_text: "#4A5568" },
};
const CONCERN_ORDER = ["Open", "Replied", "On Hold", "Resolved", "Closed"];

/* ------------------------------------------------------------------ */
/* Styles (injected once)                                              */
/* ------------------------------------------------------------------ */
function inject_concern_styles() {
    if (document.getElementById("concern-ui-style-v8")) return;
    const style = document.createElement("style");
    style.id = "concern-ui-style-v8";
    style.innerHTML = `
        /* ---------- summary cards ---------- */
        .concern-report .concern-cards {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
            gap: 16px; margin: 16px 0;
        }
        .concern-report .concern-card {
            display: flex; align-items: center; gap: 16px; padding: 18px 20px;
            background: var(--card-bg); border: 1px solid var(--border-color);
            border-left: 4px solid var(--accent); border-radius: 12px;
            box-shadow: var(--shadow-sm); cursor: pointer;
            transition: transform .15s, box-shadow .15s;
        }
        .concern-report .concern-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .concern-report .concern-card.active { box-shadow: 0 0 0 2px var(--accent); }
        .concern-report .concern-card-icon {
            width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
            background: var(--icon-bg); color: var(--accent);
            display: flex; align-items: center; justify-content: center;
        }
        .concern-report .concern-card-value { font-size: 28px; font-weight: 700; line-height: 1.1; color: var(--heading-color, var(--text-color)); }
        .concern-report .concern-card-label { font-size: 14px; color: var(--text-muted); margin-top: 2px; }

        /* ---------- donut card ---------- */
        .concern-report .concern-donut {
            display: grid; grid-template-columns: 220px 1fr; gap: 12px 40px; align-items: center;
            width: 100%; background: var(--card-bg); border: 1px solid var(--border-color);
            border-radius: 14px; padding: 20px 28px 24px; margin: 0 0 20px; box-shadow: var(--shadow-sm);
        }
        .concern-report .concern-donut-title {
            grid-column: 1 / -1; font-size: 16px; font-weight: 700; color: var(--heading-color, var(--text-color));
            display: flex; align-items: center; gap: 10px;
        }
        .concern-report .concern-donut-title::before {
            content: ""; width: 4px; height: 18px; border-radius: 2px; background: #2F80ED;
        }
        .concern-report .concern-donut-chart { position: relative; width: 190px; height: 190px; margin: 0 auto; }
        .concern-report .concern-donut-chart svg { transform: rotate(-90deg); }
        .concern-report .concern-donut-center {
            position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center;
        }
        .concern-report .concern-donut-total { font-size: 30px; font-weight: 700; color: var(--heading-color, var(--text-color)); line-height: 1; }
        .concern-report .concern-donut-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .concern-report .concern-donut-legend { display: flex; flex-direction: column; gap: 16px; }
        .concern-report .concern-donut-legend-item {
            display: grid; grid-template-columns: 12px 80px 1fr 36px 44px;
            align-items: center; gap: 14px; font-size: 14px; color: var(--text-color);
        }
        .concern-report .concern-donut-dot { width: 10px; height: 10px; border-radius: 50%; }
        .concern-report .concern-donut-bar { height: 8px; border-radius: 4px; background: var(--control-bg); overflow: hidden; }
        .concern-report .concern-donut-bar > span { display: block; height: 100%; border-radius: 4px; }
        .concern-report .concern-donut-count { text-align: right; font-weight: 700; }
        .concern-report .concern-donut-pct { text-align: right; color: var(--text-muted); font-size: 13px; }
        @media (max-width: 720px) {
            .concern-report .concern-donut { grid-template-columns: 1fr; }
            .concern-report .concern-donut-legend-item { grid-template-columns: 12px 70px 1fr 30px 40px; gap: 8px; }
        }

        /* ---------- table ---------- */
        .concern-report .datatable {
            border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden;
            box-shadow: var(--shadow-sm);
        }
        .concern-report .datatable .dt-cell--header,
        .concern-report .datatable .dt-cell--header .dt-cell__content {
            background: var(--control-bg); font-weight: 600; color: var(--heading-color, var(--text-color));
        }
        .concern-report .concern-pill {
            display: inline-block; padding: 2px 12px; border-radius: 999px;
            font-size: 12px; font-weight: 600; line-height: 1.6; white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* Summary cards (clickable, filter by status)                         */
/* ------------------------------------------------------------------ */
function render_concern_cards() {
    const report = frappe.query_report;
    const rows = report.data || [];
    const status = report.get_filter_value("status") || "";

    const svg = (inner) =>
        `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

    const cards = [
        {
            label: __("Total Ticket"), accent: "#2F80ED", icon_bg: "#E3EEFC",
            icon: svg(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                       <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                       <line x1="16" y1="17" x2="8" y2="17"/>`),
            value: rows.length,
            set_status: "",
            active: !status,
        },
        {
            label: __("Open"), accent: CONCERN_STATUS["Open"].accent, icon_bg: "#FDE3E5",
            icon: svg(`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                       <line x1="12" y1="16" x2="12.01" y2="16"/>`),
            value: rows.filter(r => r.status === "Open").length,
            set_status: "Open",
            active: status === "Open",
        },
        {
            label: __("Resolved / Closed"), accent: CONCERN_STATUS["Resolved"].accent, icon_bg: "#DDF3E8",
            icon: svg(`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`),
            value: rows.filter(r => ["Resolved", "Closed"].includes(r.status)).length,
            set_status: "Resolved",
            active: status === "Resolved",
        },
        {
            label: __("On Hold"), accent: CONCERN_STATUS["On Hold"].accent, icon_bg: "#FDEBD3",
            icon: svg(`<circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/>
                       <line x1="14" y1="15" x2="14" y2="9"/>`),
            value: rows.filter(r => r.status === "On Hold").length,
            set_status: "On Hold",
            active: status === "On Hold",
        },
        {
            label: __("Replied"), accent: CONCERN_STATUS["Replied"].accent, icon_bg: "#E3EEFC",
            icon: svg(`<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`),
            value: rows.filter(r => r.status === "Replied").length,
            set_status: "Replied",
            active: status === "Replied",
        },
    ];

    const html = `<div class="concern-cards">` + cards.map((c, i) => `
        <div class="concern-card ${c.active ? "active" : ""}" data-idx="${i}"
             style="--accent:${c.accent}; --icon-bg:${c.icon_bg};">
            <div class="concern-card-icon">${c.icon}</div>
            <div>
                <div class="concern-card-value">${c.value}</div>
                <div class="concern-card-label">${c.label}</div>
            </div>
        </div>`).join("") + `</div>`;

    const $main = $(report.page.main);
    $main.find(".concern-cards").remove();

    const $summary = $main.find(".report-summary");
    $summary.hide();
    $summary.first().before(html);

    // Click a card to filter by its status
    $main.find(".concern-card").on("click", function () {
        const c = cards[$(this).data("idx")];
        report.set_filter_value("status", c.set_status).then(() => {
            report.refresh();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Concerns by Status: donut + legend bars                             */
/* ------------------------------------------------------------------ */
function render_concern_donut() {
    const report = frappe.query_report;
    const rows = report.data || [];
    const total = rows.length;

    const counts = {};
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

    const items = CONCERN_ORDER.filter(k => counts[k]).map(k => ({
        label: k,
        value: counts[k],
        pct: total ? Math.round((counts[k] / total) * 100) : 0,
        color: CONCERN_STATUS[k].donut,
    }));

    const SIZE = 190, SW = 22, R = (SIZE - SW) / 2, CIRC = 2 * Math.PI * R, GAP = 6;
    let offset = 0;

    const segments = items.map(it => {
        const seg = total ? (it.value / total) * CIRC : 0;
        const len = Math.max(seg - GAP - SW, 0.1);
        const start = offset + (GAP + SW) / 2;
        offset += seg;
        return `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${it.color}"
                    stroke-width="${SW}" stroke-linecap="round"
                    stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-start}"></circle>`;
    }).join("");

    const track = `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="var(--control-bg)" stroke-width="${SW}"></circle>`;

    const legend = items.map(it => `
        <div class="concern-donut-legend-item">
            <span class="concern-donut-dot" style="background:${it.color}"></span>
            <span>${__(it.label)}</span>
            <div class="concern-donut-bar"><span style="width:${it.pct}%; background:${it.color}"></span></div>
            <span class="concern-donut-count">${it.value}</span>
            <span class="concern-donut-pct">${it.pct}%</span>
        </div>`).join("");

    const html = `
        <div class="concern-donut">
            <div class="concern-donut-title">${__("Ticket by Status")}</div>
            <div class="concern-donut-chart">
                <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${track}${segments}</svg>
                <div class="concern-donut-center">
                    <div class="concern-donut-total">${total}</div>
                    <div class="concern-donut-sub">${__("Tickets")}</div>
                </div>
            </div>
            <div class="concern-donut-legend">${legend}</div>
        </div>`;

    const $main = $(report.page.main);
    $main.find(".concern-donut").remove();
    $main.find(".chart-wrapper").hide();
    $main.find(".concern-cards").after(html);
}