
frappe.pages["sale-pipeline"].on_page_load = function (wrapper) {

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Sales Pipeline",
        single_column: true
    });

    load_sale_pipeline_css();

    frappe.require(
        "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"
    ).then(() => {
        init_sale_pipeline(wrapper, page);
    }).catch(error => {
        console.error("ECharts loading error:", error);
        frappe.msgprint("Unable to load chart library.");
    });
};


// =====================================================
// PREMIUM CSS
// =====================================================

function load_sale_pipeline_css() {

    if ($("#sale-pipeline-styles").length) return;

    const css = `

    .layout-main-section:has(.sale-pipeline-root) {
        padding: 24px !important;
        background: #f5f7fb !important;
    }

    .sale-pipeline-root {
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172b4d;
        width: 100%;
    }

    .sale-pipeline-root * {
        box-sizing: border-box;
    }

    .sp-shell {
        width: 100%;
        max-width: 1600px;
        margin: auto;
    }

    /* TOP TOOLBAR */

    .sp-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 28px;
    }

    .sp-filters {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .sp-employee {
        height: 42px;
        min-width: 220px;
        padding: 0 14px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        font-size: 13px;
        outline: none;
    }

    .sp-periods {
        display: flex;
        gap: 4px;
        padding: 4px;
        border-radius: 10px;
        background: #e9eef5;
    }

    .sp-periods button {
        border: none;
        background: transparent;
        color: #64748b;
        padding: 9px 16px;
        border-radius: 7px;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
        transition: .2s;
    }

    .sp-periods button:hover {
        color: #2563eb;
    }

    .sp-periods button.active {
        background: #fff;
        color: #2563eb;
        box-shadow: 0 2px 6px rgba(15,23,42,.08);
    }

    /* HEADER */

    .sp-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 24px;
    }

    .sp-heading h2 {
        font-size: 27px;
        font-weight: 750;
        letter-spacing: -.8px;
        color: #172b4d;
        margin: 0 0 7px;
    }

    .sp-heading p {
        font-size: 13px;
        color: #8b98aa;
        margin: 0;
    }

    .sp-date {
        padding: 9px 14px;
        border-radius: 9px;
        background: #fff;
        border: 1px solid #e9edf4;
        color: #64748b;
        font-size: 12px;
        font-weight: 650;
    }

    /* KPI CARDS */

    .sp-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 22px;
    }

    .sp-kpi {
        position: relative;
        min-width: 0;
        background: #fff;
        border: 1px solid #edf0f5;
        border-radius: 15px;
        padding: 21px;
        overflow: hidden;
        box-shadow: 0 3px 12px rgba(15,23,42,.025);
        transition: transform .2s, box-shadow .2s;
    }

    .sp-kpi:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 22px rgba(15,23,42,.07);
    }

    .sp-kpi-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 19px;
    }

    .sp-kpi-label {
        color: #7b899c;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .35px;
        text-transform: uppercase;
    }

    .sp-kpi-icon {
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 11px;
        font-size: 17px;
        font-weight: 700;
    }

    .sp-blue {
        color: #2563eb;
        background: #eff6ff;
    }

    .sp-purple {
        color: #805ad5;
        background: #f4f0ff;
    }

    .sp-orange {
        color: #d97706;
        background: #fff7e8;
    }

    .sp-green {
        color: #059669;
        background: #eafaf3;
    }

    .sp-red {
        color: #dc2626;
        background: #fff0f0;
    }

    .sp-cyan {
        color: #0891b2;
        background: #e9faff;
    }

    .sp-kpi-value {
        color: #172b4d;
        font-size: 31px;
        font-weight: 760;
        letter-spacing: -.8px;
        line-height: 1.15;
    }

    .sp-kpi-amount {
        color: #8492a6;
        font-size: 12px;
        margin-top: 10px;
    }

    .sp-kpi-amount strong {
        color: #334155;
        font-size: 15px;
        font-weight: 750;
    }

    .sp-kpi-footer {
        margin-top: 15px;
        padding-top: 12px;
        border-top: 1px solid #f1f3f7;
        color: #94a3b8;
        font-size: 11px;
    }

    /* CHART GRID */

    .sp-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-bottom: 20px;
    }

    .sp-panel {
        background: #fff;
        border: 1px solid #edf0f5;
        border-radius: 15px;
        min-width: 0;
        overflow: hidden;
        box-shadow: 0 3px 12px rgba(15,23,42,.025);
    }

    .sp-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 22px 15px;
        border-bottom: 1px solid #f1f3f7;
    }

    .sp-panel-header h3 {
        font-size: 15px;
        font-weight: 750;
        color: #25364d;
        margin: 0 0 6px;
    }

    .sp-panel-header p {
        color: #94a0b2;
        font-size: 11px;
        margin: 0;
    }

    .sp-panel-tag {
        padding: 6px 10px;
        background: #f1f5f9;
        border-radius: 7px;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
    }

    .sp-chart {
        width: 100%;
        height: 320px;
        padding: 8px 12px;
    }

    .sp-full-panel {
        margin-bottom: 20px;
    }

    .sp-wide-chart {
        height: 330px;
        width: 100%;
        padding: 10px 15px;
    }

    /* TABLE */

    .sp-table-wrap {
        width: 100%;
        overflow-x: auto;
        padding: 10px 20px 18px;
    }

    .sp-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 600px;
    }

    .sp-table th {
        padding: 14px 12px;
        text-align: left;
        background: #f8fafc;
        color: #8794a7;
        font-size: 10px;
        font-weight: 750;
        text-transform: uppercase;
        letter-spacing: .5px;
        white-space: nowrap;
    }

    .sp-table td {
        padding: 15px 12px;
        color: #475569;
        font-size: 12px;
        border-bottom: 1px solid #f0f2f6;
        white-space: nowrap;
    }

    .sp-table tr:last-child td {
        border-bottom: none;
    }

    .sp-table a {
        color: #2563eb;
        font-weight: 700;
        text-decoration: none;
    }

    .sp-table a:hover {
        text-decoration: underline;
    }

    .sp-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 20px;
        font-size: 10px;
        font-weight: 750;
    }

    .sp-status:before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
    }

    .sp-status-submitted {
        color: #2563eb;
        background: #eff6ff;
    }

    .sp-status-ordered {
        color: #059669;
        background: #eafaf3;
    }

    .sp-status-draft {
        color: #d97706;
        background: #fff7e8;
    }

    .sp-status-lost {
        color: #dc2626;
        background: #fff0f0;
    }

    .sp-empty {
        text-align: center;
        padding: 35px;
        color: #94a3b8;
        font-size: 13px;
    }

    /* CURRENCY SUMMARY */

    .sp-currency-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        padding: 20px;
    }

    .sp-currency-card {
        border: 1px solid #edf0f5;
        border-radius: 12px;
        padding: 18px;
        background: #fff;
    }

    .sp-currency-name {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        margin-bottom: 10px;
    }

    .sp-currency-value {
        color: #172b4d;
        font-size: 21px;
        font-weight: 750;
    }

    .sp-currency-sub {
        color: #94a3b8;
        font-size: 11px;
        margin-top: 7px;
    }

    /* FOOTER */

    .sp-footer {
        text-align: center;
        color: #a0aaba;
        font-size: 11px;
        padding: 15px;
    }

    /* RESPONSIVE */

    @media(max-width: 1000px) {
        .sp-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .sp-grid {
            grid-template-columns: 1fr;
        }
    }

    @media(max-width: 600px) {
        .layout-main-section:has(.sale-pipeline-root) {
            padding: 12px !important;
        }

        .sp-kpis {
            grid-template-columns: 1fr;
        }

        .sp-toolbar {
            align-items: stretch;
        }

        .sp-filters {
            width: 100%;
        }

        .sp-employee {
            width: 100%;
        }

        .sp-periods {
            width: 100%;
            justify-content: space-between;
        }

        .sp-periods button {
            padding: 8px 9px;
            font-size: 11px;
        }

        .sp-heading h2 {
            font-size: 23px;
        }

        .sp-currency-grid {
            grid-template-columns: 1fr;
        }

        .sp-chart {
            height: 280px;
        }
    }

    `;

    $("<style>", {
        id: "sale-pipeline-styles",
        type: "text/css"
    }).text(css).appendTo("head");
}


// =====================================================
// INITIALIZE DASHBOARD
// =====================================================

function init_sale_pipeline(wrapper, page) {

    const root = $(wrapper).find(".layout-main-section");

    root.empty().addClass("sale-pipeline-root");

    const state = {
        period: "daily",
        employee: "all",
        charts: []
    };


    // =================================================
    // HARDCODED DATA
    // =================================================

    const sampleData = {

        daily: {
            from_date: "2026-11-18",
            to_date: "2026-11-18",

            kpis: {
                opportunities: 24,
                quotations: 18,
                followups_due: 7,

                won: 8,
                won_amount: 125000,

                pending: 6,
                pending_amount: 87500,

                lost: 4,
                lost_amount: 42500
            },

            opportunity_status: [
                { name: "Open", value: 12 },
                { name: "Won", value: 8 },
                { name: "Lost", value: 4 }
            ],

            quotation_status: [
                { name: "Draft", value: 5 },
                { name: "Submitted", value: 7 },
                { name: "Ordered", value: 4 },
                { name: "Lost", value: 2 }
            ],

            currency_pipeline: [
                { name: "USD", value: 245000 },
                { name: "INR", value: 850000 },
                { name: "EUR", value: 32000 }
            ],

            recent_quotations: [
                {
                    name: "SAL-QTN-2026-001",
                    party_name: "ABC Technologies",
                    grand_total: 25000,
                    currency: "USD",
                    creation: "2026-11-18",
                    status: "Submitted"
                },
                {
                    name: "SAL-QTN-2026-002",
                    party_name: "Global Systems",
                    grand_total: 18500,
                    currency: "USD",
                    creation: "2026-11-18",
                    status: "Draft"
                },
                {
                    name: "SAL-QTN-2026-003",
                    party_name: "Tech Solutions",
                    grand_total: 42000,
                    currency: "USD",
                    creation: "2026-11-17",
                    status: "Ordered"
                },
                {
                    name: "SAL-QTN-2026-004",
                    party_name: "Prime Services",
                    grand_total: 12000,
                    currency: "USD",
                    creation: "2026-11-17",
                    status: "Lost"
                }
            ]
        },


        weekly: {
            from_date: "2026-11-12",
            to_date: "2026-11-18",

            kpis: {
                opportunities: 86,
                quotations: 54,
                followups_due: 19,

                won: 28,
                won_amount: 425000,

                pending: 18,
                pending_amount: 187500,

                lost: 12,
                lost_amount: 92500
            },

            opportunity_status: [
                { name: "Open", value: 46 },
                { name: "Won", value: 28 },
                { name: "Lost", value: 12 }
            ],

            quotation_status: [
                { name: "Draft", value: 12 },
                { name: "Submitted", value: 18 },
                { name: "Ordered", value: 16 },
                { name: "Lost", value: 8 }
            ],

            currency_pipeline: [
                { name: "USD", value: 725000 },
                { name: "INR", value: 2450000 },
                { name: "EUR", value: 85000 }
            ],

            recent_quotations: [
                {
                    name: "SAL-QTN-2026-005",
                    party_name: "ABC Technologies",
                    grand_total: 55000,
                    currency: "USD",
                    creation: "2026-11-18",
                    status: "Submitted"
                },
                {
                    name: "SAL-QTN-2026-006",
                    party_name: "Global Systems",
                    grand_total: 38000,
                    currency: "USD",
                    creation: "2026-11-17",
                    status: "Ordered"
                },
                {
                    name: "SAL-QTN-2026-007",
                    party_name: "Prime Services",
                    grand_total: 27000,
                    currency: "USD",
                    creation: "2026-11-16",
                    status: "Draft"
                }
            ]
        },


        monthly: {
            from_date: "2026-11-01",
            to_date: "2026-11-30",

            kpis: {
                opportunities: 320,
                quotations: 210,
                followups_due: 48,

                won: 95,
                won_amount: 1250000,

                pending: 72,
                pending_amount: 875000,

                lost: 38,
                lost_amount: 425000
            },

            opportunity_status: [
                { name: "Open", value: 187 },
                { name: "Won", value: 95 },
                { name: "Lost", value: 38 }
            ],

            quotation_status: [
                { name: "Draft", value: 42 },
                { name: "Submitted", value: 72 },
                { name: "Ordered", value: 68 },
                { name: "Lost", value: 28 }
            ],

            currency_pipeline: [
                { name: "USD", value: 2450000 },
                { name: "INR", value: 8500000 },
                { name: "EUR", value: 320000 }
            ],

            recent_quotations: [
                {
                    name: "SAL-QTN-2026-008",
                    party_name: "ABC Technologies",
                    grand_total: 125000,
                    currency: "USD",
                    creation: "2026-11-18",
                    status: "Submitted"
                },
                {
                    name: "SAL-QTN-2026-009",
                    party_name: "Global Systems",
                    grand_total: 85000,
                    currency: "USD",
                    creation: "2026-11-17",
                    status: "Ordered"
                },
                {
                    name: "SAL-QTN-2026-010",
                    party_name: "Tech Solutions",
                    grand_total: 65000,
                    currency: "USD",
                    creation: "2026-11-15",
                    status: "Draft"
                }
            ]
        },


        quarterly: {
            from_date: "2026-09-01",
            to_date: "2026-11-30",

            kpis: {
                opportunities: 920,
                quotations: 610,
                followups_due: 125,

                won: 285,
                won_amount: 3850000,

                pending: 195,
                pending_amount: 2450000,

                lost: 110,
                lost_amount: 1250000
            },

            opportunity_status: [
                { name: "Open", value: 525 },
                { name: "Won", value: 285 },
                { name: "Lost", value: 110 }
            ],

            quotation_status: [
                { name: "Draft", value: 125 },
                { name: "Submitted", value: 195 },
                { name: "Ordered", value: 210 },
                { name: "Lost", value: 80 }
            ],

            currency_pipeline: [
                { name: "USD", value: 7250000 },
                { name: "INR", value: 24500000 },
                { name: "EUR", value: 950000 }
            ],

            recent_quotations: [
                {
                    name: "SAL-QTN-2026-011",
                    party_name: "ABC Technologies",
                    grand_total: 250000,
                    currency: "USD",
                    creation: "2026-11-18",
                    status: "Submitted"
                },
                {
                    name: "SAL-QTN-2026-012",
                    party_name: "Global Systems",
                    grand_total: 185000,
                    currency: "USD",
                    creation: "2026-11-17",
                    status: "Ordered"
                },
                {
                    name: "SAL-QTN-2026-013",
                    party_name: "Prime Services",
                    grand_total: 125000,
                    currency: "USD",
                    creation: "2026-11-15",
                    status: "Draft"
                }
            ]
        }

    };


    // =================================================
    // PAGE HTML
    // =================================================

    root.html(`

        <div class="sp-shell">

            <div class="sp-toolbar">

                <div class="sp-filters">

                    <select class="sp-employee" id="sp-employee-filter">
                        <option value="all">All Employees</option>
                        <option value="EMP-001">Arun Kumar</option>
                        <option value="EMP-002">Dinesh Kumar</option>
                        <option value="EMP-003">Praveen Raj</option>
                        <option value="EMP-004">Suresh Kumar</option>
                    </select>

                    <div class="sp-periods">
                        <button class="active" data-period="daily">Daily</button>
                        <button data-period="weekly">Weekly</button>
                        <button data-period="monthly">Monthly</button>
                        <button data-period="quarterly">Quarterly</button>
                    </div>

                </div>

            </div>


            <div class="sp-heading">

                <div>
                    <h2>Sales Pipeline</h2>
                    <p>Monitor opportunities, quotations and sales performance</p>
                </div>

                <span class="sp-date" id="sp-date-range"></span>

            </div>


            <div class="sp-kpis" id="sp-kpis"></div>


            <div class="sp-grid">

                <div class="sp-panel">

                    <div class="sp-panel-header">
                        <div>
                            <h3>Opportunity Status</h3>
                            <p>Distribution of opportunity outcomes</p>
                        </div>
                        <span class="sp-panel-tag">OPPORTUNITIES</span>
                    </div>

                    <div id="sp-opportunity-chart" class="sp-chart"></div>

                </div>


                <div class="sp-panel">

                    <div class="sp-panel-header">
                        <div>
                            <h3>Quotation Status</h3>
                            <p>Distribution of quotation outcomes</p>
                        </div>
                        <span class="sp-panel-tag">QUOTATIONS</span>
                    </div>

                    <div id="sp-quotation-chart" class="sp-chart"></div>

                </div>

            </div>


            <div class="sp-panel sp-full-panel">

                <div class="sp-panel-header">
                    <div>
                        <h3>Pipeline by Currency</h3>
                        <p>Opportunity pipeline value across currencies</p>
                    </div>

                    <span class="sp-panel-tag">VALUE ANALYSIS</span>
                </div>

                <div id="sp-currency-chart" class="sp-wide-chart"></div>

                <div class="sp-currency-grid" id="sp-currency-summary"></div>

            </div>


            <div class="sp-panel sp-full-panel">

                <div class="sp-panel-header">
                    <div>
                        <h3>Recent Quotations</h3>
                        <p>Latest quotation activity in the selected period</p>
                    </div>

                    <span class="sp-panel-tag">RECENT ACTIVITY</span>
                </div>

                <div id="sp-quotation-table" class="sp-table-wrap"></div>

            </div>


            <div class="sp-footer">
                Sales Pipeline Dashboard · Sample Data for UI Preview
            </div>

        </div>

    `);


    // =================================================
    // HELPERS
    // =================================================

    function esc(value) {
        return $("<div>")
            .text(value == null ? "" : String(value))
            .html();
    }


    function number(value) {
        return Number(value || 0).toLocaleString("en-US");
    }


    function money(value, currency) {

        return `${esc(currency || "USD")} ${Number(value || 0).toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )}`;

    }


    function disposeCharts() {

        state.charts.forEach(instance => {

            if (instance && !instance.isDisposed()) {
                instance.dispose();
            }

        });

        state.charts = [];

    }


    function createChart(elementId, option) {

        const element = root.find("#" + elementId)[0];

        if (!element) return;

        const existing = echarts.getInstanceByDom(element);

        if (existing) {
            existing.dispose();
        }

        const instance = echarts.init(element);

        instance.setOption(option);

        state.charts.push(instance);

    }


    function buildTable(headers, rows) {

        if (!rows.length) {
            return `<div class="sp-empty">No records found.</div>`;
        }

        return `

            <table class="sp-table">

                <thead>
                    <tr>
                        ${headers.map(header => `
                            <th>${header}</th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>

                    ${rows.map(row => `

                        <tr>
                            ${row.map(cell => `
                                <td>${cell}</td>
                            `).join("")}
                        </tr>

                    `).join("")}

                </tbody>

            </table>

        `;

    }


    // =================================================
    // KPI CARDS
    // =================================================

    function renderKpis(data) {

        const k = data.kpis;

        const cards = [

            {
                label: "Total Opportunities",
                value: k.opportunities,
                icon: "↗",
                theme: "sp-blue",
                footer: "Opportunity records"
            },

            {
                label: "Total Quotations",
                value: k.quotations,
                icon: "▤",
                theme: "sp-purple",
                footer: "Quotation records"
            },

            {
                label: "Clarifications / Follow-ups",
                value: k.followups_due,
                icon: "◷",
                theme: "sp-orange",
                footer: "Follow-ups due"
            },

            {
                label: "Won Quotations",
                value: k.won,
                amount: k.won_amount,
                icon: "✓",
                theme: "sp-green",
                footer: "Successfully converted"
            },

            {
                label: "Pending Quotations",
                value: k.pending,
                amount: k.pending_amount,
                icon: "◷",
                theme: "sp-cyan",
                footer: "Awaiting decision"
            },

            {
                label: "Lost Quotations",
                value: k.lost,
                amount: k.lost_amount,
                icon: "✕",
                theme: "sp-red",
                footer: "Unsuccessful quotations"
            }

        ];


        root.find("#sp-kpis").html(

            cards.map(card => `

                <div class="sp-kpi">

                    <div class="sp-kpi-top">

                        <div class="sp-kpi-label">
                            ${esc(card.label)}
                        </div>

                        <div class="sp-kpi-icon ${card.theme}">
                            ${card.icon}
                        </div>

                    </div>

                    <div class="sp-kpi-value">
                        ${number(card.value)}
                    </div>

                    ${card.amount != null ? `

                        <div class="sp-kpi-amount">
                            Total Value:
                            <strong>${money(card.amount, "USD")}</strong>
                        </div>

                    ` : ""}

                    <div class="sp-kpi-footer">
                        ${esc(card.footer)}
                    </div>

                </div>

            `).join("")

        );

    }


    // =================================================
    // DONUT CHART
    // =================================================

    function pieOption(rows, centerTitle) {

        const chartData = rows.map(row => ({
            name: row.name,
            value: Number(row.value || 0)
        }));

        const total = chartData.reduce(
            (sum, row) => sum + row.value,
            0
        );


        return {

            color: [
                "#3978e8",
                "#18a999",
                "#f3a640",
                "#8b72d9",
                "#e56b82",
                "#55a6c7"
            ],

            tooltip: {
                trigger: "item",
                backgroundColor: "#172b4d",
                borderWidth: 0,
                textStyle: {
                    color: "#fff",
                    fontSize: 12
                },
                formatter: "{b}<br/><b>{c}</b> ({d}%)"
            },

            legend: {
                orient: "vertical",
                right: "3%",
                top: "middle",
                itemWidth: 9,
                itemHeight: 9,
                itemGap: 17,
                textStyle: {
                    color: "#64748b",
                    fontSize: 11
                }
            },

            graphic: [

                {
                    type: "text",
                    left: "31%",
                    top: "43%",
                    style: {
                        text: number(total),
                        textAlign: "center",
                        fill: "#172b4d",
                        fontSize: 25,
                        fontWeight: 750
                    }
                },

                {
                    type: "text",
                    left: "31%",
                    top: "54%",
                    style: {
                        text: centerTitle,
                        textAlign: "center",
                        fill: "#94a3b8",
                        fontSize: 10
                    }
                }

            ],

            series: [

                {
                    type: "pie",
                    radius: ["58%", "77%"],
                    center: ["33%", "50%"],

                    avoidLabelOverlap: true,

                    itemStyle: {
                        borderColor: "#fff",
                        borderWidth: 4,
                        borderRadius: 6
                    },

                    label: {
                        show: false
                    },

                    emphasis: {
                        scale: true,
                        scaleSize: 8
                    },

                    data: chartData

                }

            ]

        };

    }


    // =================================================
    // CURRENCY BAR CHART
    // =================================================

    function currencyOption(rows) {

        return {

            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "shadow"
                },
                formatter: function (params) {

                    const item = params[0];

                    return `
                        <b>${esc(item.name)}</b><br/>
                        ${money(item.value, item.name)}
                    `;

                }
            },

            grid: {
                left: "5%",
                right: "5%",
                top: "15%",
                bottom: "12%",
                containLabel: true
            },

            xAxis: {
                type: "category",
                data: rows.map(row => row.name),
                axisTick: {
                    show: false
                },
                axisLine: {
                    lineStyle: {
                        color: "#e8edf4"
                    }
                },
                axisLabel: {
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 600
                }
            },

            yAxis: {
                type: "value",
                axisLabel: {
                    color: "#94a3b8",
                    fontSize: 10,
                    formatter: function (value) {
                        return value >= 1000000
                            ? (value / 1000000).toFixed(1) + "M"
                            : value >= 1000
                                ? (value / 1000).toFixed(0) + "K"
                                : value;
                    }
                },
                splitLine: {
                    lineStyle: {
                        color: "#f0f2f6",
                        type: "dashed"
                    }
                }
            },

            series: [

                {
                    type: "bar",
                    data: rows.map(row => row.value),
                    barWidth: "38%",
                    showBackground: true,
                    backgroundStyle: {
                        color: "#f5f7fb",
                        borderRadius: [7, 7, 0, 0]
                    },
                    itemStyle: {
                        borderRadius: [7, 7, 0, 0],
                        color: function (params) {

                            const colors = [
                                "#3978e8",
                                "#18a999",
                                "#8b72d9"
                            ];

                            return colors[params.dataIndex % colors.length];

                        }
                    },

                    label: {
                        show: true,
                        position: "top",
                        color: "#475569",
                        fontSize: 11,
                        fontWeight: 700,
                        formatter: function (params) {
                            return Number(params.value).toLocaleString("en-US");
                        }
                    }

                }

            ]

        };

    }


    // =================================================
    // RENDER CURRENCY SUMMARY
    // =================================================

    function renderCurrencySummary(rows) {

        root.find("#sp-currency-summary").html(

            rows.map(row => `

                <div class="sp-currency-card">

                    <div class="sp-currency-name">
                        ${esc(row.name)} PIPELINE
                    </div>

                    <div class="sp-currency-value">
                        ${money(row.value, row.name)}
                    </div>

                    <div class="sp-currency-sub">
                        Sample opportunity value
                    </div>

                </div>

            `).join("")

        );

    }


    // =================================================
    // RENDER RECENT QUOTATIONS
    // =================================================

    function renderQuotations(rows) {

        const tableRows = rows.map(row => {

            const statusClass = {
                "Submitted": "sp-status-submitted",
                "Ordered": "sp-status-ordered",
                "Draft": "sp-status-draft",
                "Lost": "sp-status-lost"
            }[row.status] || "sp-status-draft";


            return [

                `<a href="/app/quotation/${encodeURIComponent(row.name)}">
                    ${esc(row.name)}
                </a>`,

                esc(row.party_name),

                `<strong>${money(row.grand_total, row.currency)}</strong>`,

                esc(row.creation),

                `<span class="sp-status ${statusClass}">
                    ${esc(row.status)}
                </span>`

            ];

        });


        root.find("#sp-quotation-table").html(

            buildTable(
                [
                    "Quotation ID",
                    "Customer",
                    "Quotation Value",
                    "Created On",
                    "Status"
                ],
                tableRows
            )

        );

    }


    // =================================================
    // RENDER DASHBOARD
    // =================================================

    function renderDashboard(data) {

        disposeCharts();

        renderKpis(data);

        createChart(
            "sp-opportunity-chart",
            pieOption(data.opportunity_status, "Opportunities")
        );

        createChart(
            "sp-quotation-chart",
            pieOption(data.quotation_status, "Quotations")
        );

        createChart(
            "sp-currency-chart",
            currencyOption(data.currency_pipeline)
        );

        renderCurrencySummary(data.currency_pipeline);

        renderQuotations(data.recent_quotations);

    }


    // =================================================
    // LOAD DATA
    // =================================================

    function load() {

        const data = sampleData[state.period];

        root.find("#sp-date-range").text(
            `${data.from_date} – ${data.to_date}`
        );

        renderDashboard(data);

        setTimeout(() => {

            state.charts.forEach(instance => {

                if (instance && !instance.isDisposed()) {
                    instance.resize();
                }

            });

        }, 100);

    }


    // =================================================
    // EVENTS
    // =================================================

    root.on("click", ".sp-periods button", function () {

        const period = $(this).data("period");

        if (!period || period === state.period) return;

        state.period = period;

        root.find(".sp-periods button").removeClass("active");

        $(this).addClass("active");

        load();

    });


    root.on("change", "#sp-employee-filter", function () {

        state.employee = $(this).val() || "all";

        // Sample data does not vary by employee.
        load();

    });


    // =================================================
    // WINDOW RESIZE
    // =================================================

    $(window).off("resize.sale_pipeline");

    $(window).on("resize.sale_pipeline", function () {

        state.charts.forEach(instance => {

            if (instance && !instance.isDisposed()) {
                instance.resize();
            }

        });

    });


    // =================================================
    // INITIAL LOAD
    // =================================================

    load();

}
