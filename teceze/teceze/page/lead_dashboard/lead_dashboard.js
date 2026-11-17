frappe.pages["lead-dashboard"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Lead Dashboard",
        single_column: true
    });

    const css_path = "/assets/teceze/css/lead_dashboard.css";

    if (!$(`link[href="${css_path}"]`).length) {
        $("<link>", {
            rel: "stylesheet",
            type: "text/css",
            href: css_path
        }).appendTo("head");
    }

    frappe.require("https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js")
        .then(() => init_lead_dashboard(wrapper, page))
        .catch(error => {
            console.error("Lead Dashboard loading error:", error);
            frappe.msgprint("Unable to load Apache ECharts. Check browser console.");
        });
};


function init_lead_dashboard(wrapper, page) {

    const root = $(wrapper).find(".layout-main-section");

    root.empty().addClass("lead-dashboard-root");

    const state = {
        period: "daily",
        employee: "all",
        tab: "activity",
        data: null,
        charts: [],
        teamRows: [],
        teamSearch: "",
        teamPage: 1,
        teamPageSize: 10
    };


    // --------------------------------------------------
    // DASHBOARD HTML
    // --------------------------------------------------

    root.html(`
        <div class="ld-shell">

            <div class="ld-topbar">

                <div class="ld-tabs">

                    <button class="ld-tab active" data-tab="activity">
                        Activity
                    </button>

                    <button class="ld-tab" data-tab="pipeline">
                        Sales Pipeline
                    </button>

                </div>

                <div class="ld-filters"
                    style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">

                    <select
                        id="ld-employee-filter"
                        class="form-control"
                        style="min-width:220px;">

                        <option value="all">All Employees</option>

                    </select>

                    <div class="ld-periods">

                        <button class="active" data-period="daily">
                            Daily
                        </button>

                        <button data-period="weekly">
                            Weekly
                        </button>

                        <button data-period="monthly">
                            Monthly
                        </button>

                        <button data-period="quarterly">
                            Quarterly
                        </button>

                    </div>

                </div>

            </div>


            <div class="ld-heading">

                <div>
                    <h2 id="ld-title">Activity</h2>

                    <p id="ld-subtitle">
                        Activity and sales performance for the selected employee.
                    </p>
                </div>

                <span class="ld-date-range" id="ld-range"></span>

            </div>


            <!-- ACTIVITY VIEW -->

            <section id="ld-activity-view">

                <div class="ld-kpis" id="ld-kpis"></div>


                <div class="ld-panel ld-chart-panel">

                    <div class="ld-panel-heading">
                        <div>
                            <h3>Activity Performance vs Target</h3>
                            <p>Actual activity compared with assigned targets</p>
                        </div>
                    </div>

                    <div id="ld-target-chart" class="ld-chart"></div>

                </div>


                <div class="ld-grid-two">

                    <div class="ld-panel">

                        <div class="ld-panel-heading">
                            <div>
                                <h3>Activity Trend</h3>
                                <p>Recorded activities during the selected period</p>
                            </div>
                        </div>

                        <div id="ld-trend-chart" class="ld-chart"></div>

                    </div>


                    <div class="ld-panel">

                        <div class="ld-panel-heading">
                            <div>
                                <h3>Activity Breakdown</h3>
                                <p>Distribution by activity type</p>
                            </div>
                        </div>

                        <div id="ld-breakdown-chart" class="ld-chart"></div>

                    </div>

                </div>


                <div class="ld-panel ld-table-panel">

                    <div class="ld-panel-heading">
                        <div>
                            <h3>Activity Summary</h3>
                            <p>
                                Actual activity, assigned target and achievement
                            </p>
                        </div>
                    </div>

                    <div class="ld-table-wrap" id="ld-activity-table"></div>

                </div>


                <!-- SYSTEM MANAGER / ADMINISTRATOR TABLE -->

                <div
                    class="ld-panel ld-table-panel"
                    id="ld-team-performance-panel">

                    <div class="ld-panel-heading">

                        <div>
                            <h3>Employee Performance</h3>

                            <p>
                                Visible only to System Manager and Administrator
                            </p>
                        </div>

                    </div>


                    <!-- SEARCH AND PAGE SIZE -->

                    <div style="
                        display:flex;
                        gap:10px;
                        align-items:center;
                        justify-content:space-between;
                        flex-wrap:wrap;
                        padding:12px 16px;
                    ">

                        <input
                            type="search"
                            id="ld-team-search"
                            class="form-control"
                            placeholder="Search employee..."
                            style="max-width:320px;"
                        >

                        <div style="
                            display:flex;
                            gap:8px;
                            align-items:center;
                        ">

                            <label
                                for="ld-team-page-size"
                                style="margin:0;">

                                Rows

                            </label>

                            <select
                                id="ld-team-page-size"
                                class="form-control"
                                style="width:90px;">

                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>

                            </select>

                        </div>

                    </div>


                    <div
                        class="ld-table-wrap"
                        id="ld-team-table">
                    </div>


                    <div
                        id="ld-team-pagination"
                        style="
                            display:flex;
                            align-items:center;
                            justify-content:flex-end;
                            gap:10px;
                            padding:12px 16px;
                        ">
                    </div>

                </div>

            </section>


            <!-- SALES PIPELINE VIEW -->

            <section id="ld-pipeline-view" class="hidden">

                <div class="ld-kpis" id="ld-pipeline-kpis"></div>


                <div class="ld-grid-two">

                    <div class="ld-panel">

                        <div class="ld-panel-heading">
                            <div>
                                <h3>Opportunity Status</h3>
                                <p>Opportunities by current status</p>
                            </div>
                        </div>

                        <div
                            id="ld-opportunity-chart"
                            class="ld-chart">
                        </div>

                    </div>


                    <div class="ld-panel">

                        <div class="ld-panel-heading">
                            <div>
                                <h3>Quotation Status</h3>
                                <p>Quotations by current status</p>
                            </div>
                        </div>

                        <div
                            id="ld-quotation-chart"
                            class="ld-chart">
                        </div>

                    </div>

                </div>


                <div class="ld-panel ld-table-panel">

                    <div class="ld-panel-heading">
                        <div>
                            <h3>Recent Quotations</h3>
                            <p>
                                Quotations created during the selected period
                            </p>
                        </div>
                    </div>

                    <div
                        class="ld-table-wrap"
                        id="ld-quotation-table">
                    </div>

                </div>


                <div class="ld-panel ld-table-panel">

                    <div class="ld-panel-heading">
                        <div>
                            <h3>Pipeline by Currency</h3>
                            <p>
                                Opportunity values are kept separate by currency
                            </p>
                        </div>
                    </div>

                    <div
                        class="ld-table-wrap"
                        id="ld-currency-table">
                    </div>

                </div>

            </section>


            <div class="ld-error hidden" id="ld-error"></div>

        </div>
    `);


    // --------------------------------------------------
    // HELPERS
    // --------------------------------------------------

    const esc = value =>
        frappe.utils.escape_html(String(value ?? ""));


    const number = value =>
        Number(value || 0).toLocaleString(undefined, {
            maximumFractionDigits: 1
        });


    const money = (value, currency) => {

        const amount = Number(value || 0);

        try {

            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: currency || "INR",
                maximumFractionDigits: 0
            }).format(amount);

        } catch (e) {

            return `${currency || ""} ${number(amount)}`;

        }

    };


    // --------------------------------------------------
    // CHART MANAGEMENT
    // --------------------------------------------------

    function disposeCharts() {

        state.charts.forEach(instance => {

            if (instance && !instance.isDisposed()) {
                instance.dispose();
            }

        });

        state.charts = [];

    }


    function chart(id, option) {

        const element = document.getElementById(id);

        if (!element || !window.echarts) return;

        const instance = echarts.init(element);

        instance.setOption(option, true);

        state.charts.push(instance);

    }


    function baseAxis() {

        return {

            axisLine: {
                show: false
            },

            axisTick: {
                show: false
            },

            axisLabel: {
                color: "#718096",
                fontSize: 11
            },

            splitLine: {
                lineStyle: {
                    color: "#edf1f6",
                    type: "dashed"
                }
            }

        };

    }


    // --------------------------------------------------
    // TABLE BUILDER
    // --------------------------------------------------

    function table(headers, rows) {

        if (!rows.length) {

            return `
                <div class="ld-empty">
                    No records found for this selection and period.
                </div>
            `;

        }

        return `

            <table class="ld-table">

                <thead>

                    <tr>
                        ${headers.map(h => `<th>${h}</th>`).join("")}
                    </tr>

                </thead>

                <tbody>

                    ${rows.map(row => `

                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join("")}
                        </tr>

                    `).join("")}

                </tbody>

            </table>

        `;

    }


    // --------------------------------------------------
    // KPI RENDERING
    // --------------------------------------------------

    function renderKpis(data) {

        const k = data.kpis || {};

        const cards = [

            ["Total Activities", k.total_activities, "activity"],
            ["Calls Logged", k.calls, "phone"],
            ["Emails Sent", k.emails, "mail"],
            ["Messages", k.messages, "message-circle"],
            ["Meetings Logged", k.meetings, "users"],
            ["Visits", k.visits, "map-pin"],
            ["Proposals", k.proposals, "file-text"],
            ["Follow-ups Due", k.followups_due, "calendar-clock"]

        ];

        $("#ld-kpis").html(

            cards.map(([label, value, icon], index) => `

                <div class="ld-kpi ${index === 0 ? "ld-kpi-primary" : ""}">

                    <div class="ld-kpi-icon">
                        <i class="fa fa-${icon}"></i>
                    </div>

                    <div class="ld-kpi-label">
                        ${esc(label)}
                    </div>

                    <div class="ld-kpi-value">
                        ${number(value)}
                    </div>

                </div>

            `).join("")

        );

    }


    // --------------------------------------------------
    // ACTIVITY RENDERING
    // --------------------------------------------------

    function renderActivity(data) {

        const summary = data.activity_summary || [];

        const categories = summary.map(row => row.activity_type);


        // ACTUAL VS TARGET

        chart("ld-target-chart", {

            color: ["#16a6a1", "#4f70e8"],

            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "shadow"
                }
            },

            legend: {
                top: 0,
                right: 5,
                textStyle: {
                    color: "#718096",
                    fontSize: 11
                }
            },

            grid: {
                left: 42,
                right: 20,
                top: 38,
                bottom: 35
            },

            xAxis: {
                type: "category",
                data: categories,
                ...baseAxis(),

                axisLabel: {
                    color: "#718096",
                    fontSize: 11,
                    interval: 0
                }
            },

            yAxis: {
                type: "value",
                ...baseAxis()
            },

            series: [

                {
                    name: "Actual",
                    type: "bar",
                    barMaxWidth: 30,
                    data: summary.map(row => row.actual),

                    itemStyle: {
                        borderRadius: [6, 6, 0, 0]
                    }
                },

                {
                    name: "Target",
                    type: "bar",
                    barMaxWidth: 30,
                    data: summary.map(row => row.target),

                    itemStyle: {
                        borderRadius: [6, 6, 0, 0]
                    }
                }

            ]

        });


        // ACTIVITY TREND

        chart("ld-trend-chart", {

            color: ["#16a6a1"],

            tooltip: {
                trigger: "axis"
            },

            grid: {
                left: 40,
                right: 18,
                top: 18,
                bottom: 35
            },

            xAxis: {
                type: "category",
                data: data.trend?.categories || [],
                ...baseAxis(),

                axisLabel: {
                    color: "#718096",
                    fontSize: 10,
                    hideOverlap: true
                }
            },

            yAxis: {
                type: "value",
                ...baseAxis()
            },

            series: [

                {
                    type: "line",
                    smooth: true,
                    symbol: "circle",
                    symbolSize: 7,
                    data: data.trend?.values || [],

                    areaStyle: {
                        opacity: .08
                    },

                    lineStyle: {
                        width: 3
                    }
                }

            ]

        });


        // ACTIVITY BREAKDOWN

        chart("ld-breakdown-chart", {

            tooltip: {

                trigger: "item",

                formatter: params => `
                    ${esc(params.name)}
                    <br>
                    <b>${number(params.value)}</b>
                    (${params.percent}%)
                `

            },

            legend: {

                orient: "vertical",
                right: 8,
                top: "middle",

                textStyle: {
                    color: "#536277",
                    fontSize: 11
                },

                itemGap: 12

            },

            series: [

                {
                    type: "pie",
                    radius: ["54%", "76%"],
                    center: ["36%", "50%"],

                    itemStyle: {
                        borderColor: "#fff",
                        borderWidth: 3,
                        borderRadius: 6
                    },

                    label: {
                        show: false
                    },

                    data: summary.map(row => ({

                        name: row.activity_type,
                        value: row.actual

                    }))

                }

            ]

        });


        // ACTIVITY SUMMARY

        $("#ld-activity-table").html(

            table(

                [
                    "Activity Type",
                    "Actual",
                    "Target",
                    "Achievement"
                ],

                summary.map(row => [

                    esc(row.activity_type),

                    number(row.actual),

                    row.target
                        ? number(row.target)
                        : "—",

                    row.target
                        ? `<span class="ld-pill">${number(row.achievement)}%</span>`
                        : "Target not assigned"

                ])

            )

        );


        // EMPLOYEE PERFORMANCE

        renderTeamPerformance(data);

    }


    // --------------------------------------------------
    // SYSTEM MANAGER / ADMINISTRATOR TABLE
    // --------------------------------------------------

    function renderTeamPerformance(data) {

        const canView = Boolean(
            data.can_view_employee_performance
        );


        // Non-System Managers must not see this table.

        if (!canView) {

            $("#ld-team-performance-panel").hide();

            $("#ld-team-table").empty();

            $("#ld-team-pagination").empty();

            state.teamRows = [];

            return;

        }


        $("#ld-team-performance-panel").show();

        state.teamRows = data.team_performance || [];

        state.teamSearch = "";

        state.teamPage = 1;

        $("#ld-team-search").val("");

        $("#ld-team-page-size").val(
            String(state.teamPageSize)
        );

        drawTeamPerformancePage();

    }


    // --------------------------------------------------
    // TEAM TABLE SEARCH AND PAGINATION
    // --------------------------------------------------

    function drawTeamPerformancePage() {

        const query = (state.teamSearch || "")
            .trim()
            .toLowerCase();


        // SEARCH EMPLOYEES

        const filteredRows = state.teamRows.filter(row => {

            const employeeName = String(
                row.employee_name || row.employee || ""
            ).toLowerCase();

            const employeeId = String(
                row.employee || ""
            ).toLowerCase();

            return (
                employeeName.includes(query) ||
                employeeId.includes(query)
            );

        });


        // PAGINATION

        const totalRows = filteredRows.length;

        const totalPages = Math.max(
            1,
            Math.ceil(totalRows / state.teamPageSize)
        );


        state.teamPage = Math.min(
            Math.max(1, state.teamPage),
            totalPages
        );


        const startIndex =
            (state.teamPage - 1) * state.teamPageSize;


        const pageRows = filteredRows.slice(
            startIndex,
            startIndex + state.teamPageSize
        );


        // RENDER TABLE

        $("#ld-team-table").html(

            table(

                [
                    "Employee",
                    "Activities",
                    "Target",
                    "Achievement",
                    "Calls",
                    "Emails",
                    "Meetings"
                ],

                pageRows.map(row => [

                    esc(row.employee_name || row.employee),

                    number(row.actual),

                    row.target
                        ? number(row.target)
                        : "—",

                    row.target
                        ? `<span class="ld-pill">${number(row.achievement)}%</span>`
                        : "—",

                    number(row.activities?.Call),

                    number(row.activities?.Email),

                    number(row.activities?.Meeting)

                ])

            )

        );


        // PAGINATION INFORMATION

        const firstRow = totalRows
            ? startIndex + 1
            : 0;

        const lastRow = Math.min(
            startIndex + state.teamPageSize,
            totalRows
        );


        $("#ld-team-pagination").html(`

            <span style="
                color:#718096;
                font-size:12px;
                margin-right:8px;
            ">

                Showing ${firstRow}-${lastRow} of ${totalRows}

            </span>


            <button
                class="btn btn-default btn-sm"
                data-team-page="prev"
                ${state.teamPage <= 1 ? "disabled" : ""}>

                Previous

            </button>


            <span style="
                font-size:12px;
                color:#536277;
            ">

                Page ${state.teamPage} of ${totalPages}

            </span>


            <button
                class="btn btn-default btn-sm"
                data-team-page="next"
                ${state.teamPage >= totalPages ? "disabled" : ""}>

                Next

            </button>

        `);

    }


    // --------------------------------------------------
    // SALES PIPELINE RENDERING
    // --------------------------------------------------

    function renderPipeline(data) {

        const pipeline = data.pipeline || {};


        $("#ld-pipeline-kpis").html(

            [

                ["Opportunities", pipeline.opportunities || 0],

                ["Quotations", pipeline.quotations || 0],

                ["Open Follow-ups", data.kpis?.followups_due || 0]

            ].map(([label, value]) => `

                <div class="ld-kpi">

                    <div class="ld-kpi-label">
                        ${esc(label)}
                    </div>

                    <div class="ld-kpi-value">
                        ${number(value)}
                    </div>

                </div>

            `).join("")

        );


        const pieOption = rows => ({

            tooltip: {
                trigger: "item"
            },

            legend: {

                orient: "vertical",
                right: 10,
                top: "middle",

                textStyle: {
                    color: "#536277",
                    fontSize: 11
                },

                itemGap: 12

            },

            series: [

                {

                    type: "pie",
                    radius: ["48%", "72%"],
                    center: ["35%", "50%"],

                    itemStyle: {
                        borderColor: "#fff",
                        borderWidth: 3,
                        borderRadius: 6
                    },

                    label: {
                        show: false
                    },

                    data: (rows || []).map(row => ({

                        name: row.name,
                        value: row.value

                    }))

                }

            ]

        });


        chart(
            "ld-opportunity-chart",
            pieOption(pipeline.opportunity_status)
        );


        chart(
            "ld-quotation-chart",
            pieOption(pipeline.quotation_status)
        );


        // RECENT QUOTATIONS

        $("#ld-quotation-table").html(

            table(

                [
                    "Quotation",
                    "Customer",
                    "Amount",
                    "Created",
                    "Status"
                ],

                (pipeline.recent_quotations || []).map(row => [

                    `<a href="/app/quotation/${encodeURIComponent(row.name)}">
                        ${esc(row.name)}
                    </a>`,

                    esc(row.party_name || "—"),

                    row.grand_total != null
                        ? money(row.grand_total, row.currency)
                        : "—",

                    esc(row.creation || "—"),

                    `<span class="ld-pill">
                        ${esc(row.status || "—")}
                    </span>`

                ])

            )

        );


        // CURRENCY PIPELINE

        $("#ld-currency-table").html(

            table(

                [
                    "Currency",
                    "Opportunity Pipeline"
                ],

                Object.entries(
                    pipeline.by_currency || {}
                ).map(([currency, amount]) => [

                    esc(currency),

                    money(amount, currency)

                ])

            )

        );

    }


    // --------------------------------------------------
    // MAIN RENDER FUNCTION
    // --------------------------------------------------

    function render(data) {

        state.data = data;

        $("#ld-range").text(
            `${data.from_date} – ${data.to_date}`
        );

        renderKpis(data);

        renderActivity(data);

        renderPipeline(data);

        $("#ld-error")
            .addClass("hidden")
            .text("");


        setTimeout(() => {

            state.charts.forEach(instance => {

                if (instance && !instance.isDisposed()) {
                    instance.resize();
                }

            });

        }, 100);

    }


    // --------------------------------------------------
    // LOAD DASHBOARD
    // --------------------------------------------------

    function load() {

        $("#ld-error")
            .addClass("hidden")
            .text("");

        disposeCharts();


        return frappe.call({

            method: "teceze.teceze.page.lead_dashboard.lead_dashboard.get_lead_dashboard_data",

            args: {

                period: state.period,

                employee: state.employee

            },

            freeze: true,

            freeze_message: __("Loading dashboard...")

        }).then(response => {

            if (response.message) {

                render(response.message);

            } else {

                $("#ld-error")
                    .removeClass("hidden")
                    .text("The dashboard API returned no data.");

            }

        }).catch(error => {

            $("#ld-error")
                .removeClass("hidden")
                .text(
                    "Unable to load dashboard data. Check the server error log."
                );

            console.error(
                "Lead Dashboard API error:",
                error
            );

        });

    }


    // --------------------------------------------------
    // LOAD EMPLOYEE DROPDOWN
    // --------------------------------------------------

    function loadEmployees() {

        return frappe.call({

            method: "teceze.teceze.page.lead_dashboard.lead_dashboard.get_lead_dashboard_employees"

        }).then(response => {

let employees = response.message || [];

const isPrivileged = ["System Manager", "Administrator", "Sales Manager"]
    .some(role => frappe.user.has_role(role));

if (!isPrivileged) {
    employees = employees.filter(e => e.user_id === frappe.session.user);
        $("#ld-employee-filter").hide();

}


            const options = [

                '<option value="all">All Employees</option>'

            ].concat(

                employees.map(employee => `

                    <option value="${esc(employee.name)}">

                        ${esc(employee.employee_name)}

                        ${employee.department
                            ? ` — ${esc(employee.department)}`
                            : ""}

                    </option>

                `)

            );


            $("#ld-employee-filter").html(
                options.join("")
            );


            // DEFAULT: ALL EMPLOYEES

            $("#ld-employee-filter").val("all");

            state.employee = "all";

        }).catch(error => {

            console.error(
                "Unable to load employee selector:",
                error
            );

            $("#ld-error")
                .removeClass("hidden")
                .text("Unable to load employees for the selector.");

            throw error;

        });

    }


    // --------------------------------------------------
    // EMPLOYEE TABLE SEARCH EVENT
    // --------------------------------------------------

    root.on(
        "input",
        "#ld-team-search",
        function () {

            state.teamSearch = $(this).val() || "";

            state.teamPage = 1;

            drawTeamPerformancePage();

        }
    );


    // --------------------------------------------------
    // EMPLOYEE TABLE PAGE SIZE EVENT
    // --------------------------------------------------

    root.on(
        "change",
        "#ld-team-page-size",
        function () {

            state.teamPageSize = Number(
                $(this).val()
            ) || 10;

            state.teamPage = 1;

            drawTeamPerformancePage();

        }
    );


    // --------------------------------------------------
    // EMPLOYEE TABLE PAGINATION EVENT
    // --------------------------------------------------

    root.on(
        "click",
        "[data-team-page]",
        function () {

            const action = $(this).attr("data-team-page");

            if (action === "prev") {
                state.teamPage -= 1;
            }

            if (action === "next") {
                state.teamPage += 1;
            }

            drawTeamPerformancePage();

        }
    );


    // --------------------------------------------------
    // EMPLOYEE FILTER EVENT
    // --------------------------------------------------

    root.on(
        "change",
        "#ld-employee-filter",
        function () {

            state.employee = $(this).val() || "all";

            load();

        }
    );


    // --------------------------------------------------
    // PERIOD FILTER EVENT
    // --------------------------------------------------

    root.on(
        "click",
        ".ld-periods button",
        function () {

            state.period = $(this).data("period");

            $(".ld-periods button").removeClass("active");

            $(this).addClass("active");

            load();

        }
    );


    // --------------------------------------------------
    // TAB SWITCHING
    // --------------------------------------------------

    root.on(
        "click",
        ".ld-tabs button",
        function () {

            state.tab = $(this).data("tab");

            $(".ld-tabs button").removeClass("active");

            $(this).addClass("active");


            $("#ld-activity-view").toggleClass(
                "hidden",
                state.tab !== "activity"
            );


            $("#ld-pipeline-view").toggleClass(
                "hidden",
                state.tab !== "pipeline"
            );


            $("#ld-title").text(

                state.tab === "activity"
                    ? "Activity"
                    : "Sales Pipeline"

            );


            $("#ld-subtitle").text(

                state.tab === "activity"

                    ? "Activity and target performance for the selected employee."

                    : "Opportunities and quotations for the selected employee."

            );


            setTimeout(() => {

                state.charts.forEach(instance => {

                    if (instance && !instance.isDisposed()) {
                        instance.resize();
                    }

                });

            }, 100);

        }
    );


    // --------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------

    loadEmployees().then(load).catch(() => {});

}