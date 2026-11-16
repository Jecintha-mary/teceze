frappe.pages["sales-team-dashboard"].on_page_load = function (wrapper) {
    frappe.require("https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js")
        .then(() => {
        init_sales_team_dashboard(wrapper);
    }).catch((error) => {
        console.error(error);
        frappe.msgprint(__("Unable to load Apache ECharts. Check the bundled library path."));
    });
};


function init_sales_team_dashboard(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Sales Team Dashboard",
        single_column: true
    });

    const $main = $(wrapper).find(".layout-main-section");
    const state = { period: "monthly", charts: [] };

    const esc = (value) => frappe.utils.escape_html(String(value ?? ""));
    const fmtNumber = (value) => Number(value || 0).toLocaleString();

    function formatCurrencyMap(values) {
        const entries = Object.entries(values || {})
            .filter(([, amount]) => Number(amount) !== 0);

        if (!entries.length) return "—";

        return entries.map(([currency, amount]) => {
            const number = Number(amount || 0);
            try {
                return new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0
                }).format(number);
            } catch (error) {
                return `${currency} ${number.toLocaleString()}`;
            }
        }).join(" · ");
    }

    function formatMoney(amount, currency) {
        const value = Number(amount || 0);
        if (!currency) return value.toLocaleString();

        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency,
                maximumFractionDigits: 0
            }).format(value);
        } catch (error) {
            return `${currency} ${value.toLocaleString()}`;
        }
    }

    function destroyCharts() {
        state.charts.forEach(chart => {
            if (chart && !chart.isDisposed()) chart.dispose();
        });
        state.charts = [];
    }

    function renderShell() {
        destroyCharts();

        $main.html(`
            <div class="sales-team-dashboard">
                <header class="std-header">
                    <div>
                        <h2>Sales Team Dashboard</h2>
                        <p>Team performance, pipeline health and key opportunities.</p>
                    </div>
                    <nav class="std-periods" aria-label="Dashboard period">
                        ${["daily", "weekly", "monthly", "quarterly"].map(period => `
                            <button type="button"
                                class="${state.period === period ? "active" : ""}"
                                data-period="${period}">
                                ${period[0].toUpperCase() + period.slice(1)}
                            </button>
                        `).join("")}
                    </nav>
                </header>
                <div class="std-content">
                    <div class="std-loading">Loading dashboard...</div>
                </div>
            </div>
        `);

        $main.find("[data-period]").on("click", function () {
            const period = $(this).data("period");
            if (period === state.period) return;
            state.period = period;
            loadDashboard();
        });
    }

    function metricCard(label, value, icon, extraClass = "") {
        return `
            <article class="std-kpi ${extraClass}">
                <div class="std-kpi-icon">${icon}</div>
                <div class="std-kpi-label">${esc(label)}</div>
                <div class="std-kpi-value">${esc(value)}</div>
            </article>
        `;
    }

    function firstKpi(data) {
        const rate = Math.max(0, Math.min(100, Number(data.kpis.win_rate || 0)));
        return `
            <article class="std-kpi std-kpi-primary">
                <div>
                    <div class="std-kpi-label">Total Opportunities</div>
                    <div class="std-kpi-value">${fmtNumber(data.kpis.total_opportunities)}</div>
                    <div class="std-kpi-caption">${rate}% Win Rate</div>
                </div>
                <div class="std-win-ring" style="--win-rate:${rate}%">
                    <strong>${rate}%</strong>
                    <span>Win Rate</span>
                </div>
            </article>
        `;
    }

    function renderKpis(data) {
        const pipeline = formatCurrencyMap(data.kpis.pipeline_by_currency);
        return `
            <section class="std-kpis">
                ${firstKpi(data)}
                ${metricCard("Total Pipeline Value", pipeline, '<i class="fa fa-briefcase"></i>')}
                ${metricCard("Won", fmtNumber(data.kpis.won), '<i class="fa fa-trophy"></i>')}
                ${metricCard("Pending Quotations", fmtNumber(data.kpis.pending_quotations), '<i class="fa fa-file-text-o"></i>')}
                ${metricCard("Sales Members", fmtNumber(data.kpis.sales_members), '<i class="fa fa-users"></i>')}
            </section>
        `;
    }

    function table(headers, rows, emptyText) {
        if (!rows.length) {
            return `<div class="std-empty">${esc(emptyText)}</div>`;
        }

        return `
            <div class="std-table-scroll">
                <table class="std-table">
                    <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
                    <tbody>${rows.join("")}</tbody>
                </table>
            </div>
        `;
    }

    function badge(value) {
        const text = value || "-";
        const normalized = String(text).toLowerCase();
        let cls = "neutral";
        if (normalized.includes("won") || normalized === "approved") cls = "success";
        else if (normalized.includes("lost") || normalized === "rejected" || normalized === "cancelled") cls = "danger";
        else if (normalized.includes("revision")) cls = "warning";
        return `<span class="std-badge ${cls}">${esc(text)}</span>`;
    }

    function renderTeamTable(rows) {
        const htmlRows = (rows || []).map(row => `
            <tr>
                <td class="std-person">
                    <span class="std-avatar">${esc(
                        (row.salesperson || "?").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase()
                    )}</span>
                    <strong>${esc(row.salesperson)}</strong>
                </td>
                <td>${fmtNumber(row.assigned)}</td>
                <td class="std-good">${fmtNumber(row.won)}</td>
                <td class="std-bad">${fmtNumber(row.lost)}</td>
                <td><span class="std-rate">${Number(row.win_rate || 0)}%</span></td>
                <td>${fmtNumber(row.open)}</td>
                <td>${esc(formatCurrencyMap(row.pipeline_by_currency))}</td>
            </tr>
        `);

        return table(
            ["Salesperson", "Assigned Opportunities", "Won", "Lost", "Win Rate", "Total Pipeline", "Pipeline Value"],
            htmlRows,
            "No assigned opportunities are visible for this period."
        );
    }

    function renderOpportunityTable(rows) {
        const htmlRows = (rows || []).map(row => `
            <tr>
                <td><a href="#" data-open-doctype="Opportunity" data-name="${esc(row.name)}">${esc(row.name)}</a></td>
                <td>${esc(row.customer)}</td>
                <td>${esc(row.salesperson)}</td>
                <td>${esc(formatMoney(row.amount, row.currency))}</td>
                <td>${esc(row.stage)}</td>
                <td>${esc(row.expected_closing)}</td>
                <td>${badge(row.status)}</td>
            </tr>
        `);

        return table(
            ["Opportunity ID", "Customer Name", "Assigned To", "Opportunity Value", "Current Stage", "Expected Closing Date", "Status"],
            htmlRows,
            "No opportunities found for this period."
        );
    }

    function renderQuotationTable(rows) {
        const htmlRows = (rows || []).map(row => `
            <tr>
                <td><a href="#" data-open-doctype="Quotation" data-name="${esc(row.name)}">${esc(row.name)}</a></td>
                <td>${esc(row.customer)}</td>
                <td>
                    ${row.opportunity !== "-" ?
                        `<a href="#" data-open-doctype="Opportunity" data-name="${esc(row.opportunity)}">${esc(row.opportunity)}</a>` :
                        "-"}
                </td>
                <td>${esc(formatMoney(row.amount, row.currency))}</td>
                <td>${esc(row.created)}</td>
                <td>${esc(row.salesperson)}</td>
                <td>${badge(row.status)}</td>
            </tr>
        `);

        return table(
            ["Quotation ID", "Customer Name", "Opportunity ID", "Quotation Amount", "Created Date", "Salesperson", "Status"],
            htmlRows,
            "No quotations found for this period."
        );
    }

    function renderLayout(data) {
        destroyCharts();

        const content = `
            ${renderKpis(data)}

            <section class="std-chart-grid">
                <article class="std-panel">
                    <div class="std-panel-heading">
                        <div>
                            <h3>Team Sales Performance Trend</h3>
                            <p>Won and lost opportunities over time</p>
                        </div>
                        <div class="std-legend">
                            <span><i class="won"></i>Won</span>
                            <span><i class="lost"></i>Lost</span>
                        </div>
                    </div>
                    <div id="std-sales-trend" class="std-chart"></div>
                </article>

                <article class="std-panel">
                    <div class="std-panel-heading">
                        <div>
                            <h3>Lead Status</h3>
                            <p>Distribution of leads by current status</p>
                        </div>
                    </div>
                    <div class="std-donut-wrap">
                        <div id="std-lead-status" class="std-chart std-donut-chart"></div>
                        <div class="std-donut-center">
                            <strong id="std-lead-total">0</strong>
                            <span>Leads</span>
                        </div>
                    </div>
                </article>
            </section>

            <section class="std-panel std-table-panel">
                <div class="std-panel-heading">
                    <div>
                        <h3>Team Member Performance</h3>
                        <p>Sales performance summary for each visible opportunity owner.</p>
                    </div>
                </div>
                ${renderTeamTable(data.team_performance || [])}
            </section>

            <section class="std-panel std-table-panel">
                <div class="std-panel-heading">
                    <div>
                        <h3>Top Opportunities</h3>
                        <p>Key opportunities with highest value in the visible pipeline.</p>
                    </div>
                    <button class="std-view-all" data-view-list="Opportunity">View all opportunities <span>→</span></button>
                </div>
                ${renderOpportunityTable(data.top_opportunities || [])}
            </section>

            <section class="std-panel std-table-panel">
                <div class="std-panel-heading">
                    <div>
                        <h3>Quotation Updates</h3>
                        <p>Recent quotations visible to your account.</p>
                    </div>
                    <button class="std-view-all" data-view-list="Quotation">View all quotations <span>→</span></button>
                </div>
                ${renderQuotationTable(data.quotation_updates || [])}
            </section>

            <div class="std-footnote">
                ${esc(data.from_date)} – ${esc(data.to_date)}
                · All figures reflect records available through your Frappe permissions.
            </div>
        `;

        $main.find(".std-content").html(content);
        renderCharts(data);

        $main.find("[data-open-doctype]").on("click", function (event) {
            event.preventDefault();
            frappe.set_route("Form", $(this).data("open-doctype"), $(this).data("name"));
        });

        $main.find("[data-view-list]").on("click", function () {
            frappe.set_route("List", $(this).data("view-list"));
        });
    }

    function renderCharts(data) {
        const trendElement = document.getElementById("std-sales-trend");
        const leadElement = document.getElementById("std-lead-status");

        if (!trendElement || !leadElement || !window.echarts) return;

        const trendChart = echarts.init(trendElement);
        state.charts.push(trendChart);

        trendChart.setOption({
            animationDuration: 650,
            color: ["#078b98", "#efa366"],
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow" }
            },
            grid: { left: 42, right: 18, top: 22, bottom: 35 },
            xAxis: {
                type: "category",
                data: data.trend.categories || [],
                axisTick: { show: false },
                axisLine: { lineStyle: { color: "#e5eaf0" } },
                axisLabel: { color: "#75849a", fontSize: 11, margin: 12 }
            },
            yAxis: {
                type: "value",
                minInterval: 1,
                splitLine: { lineStyle: { color: "#e9edf2", type: "dashed" } },
                axisLabel: { color: "#75849a", fontSize: 11, margin: 12 }
            },
            series: [
                {
                    name: "Won",
                    type: "bar",
                    data: data.trend.won || [],
                    barMaxWidth: 18,
                    itemStyle: { borderRadius: [3, 3, 0, 0] }
                },
                {
                    name: "Lost",
                    type: "bar",
                    data: data.trend.lost || [],
                    barMaxWidth: 18,
                    itemStyle: { borderRadius: [3, 3, 0, 0] }
                }
            ]
        });

        const leadChart = echarts.init(leadElement);
        state.charts.push(leadChart);

        const leadRows = data.lead_status || [];
        const totalLeads = leadRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
        $("#std-lead-total").text(fmtNumber(totalLeads));

        leadChart.setOption({
            animationDuration: 850,
            color: ["#3267e9", "#10b981", "#f59e0b", "#a855f7", "#0891b2", "#ec7185", "#64748b"],
            tooltip: {
                trigger: "item",
                backgroundColor: "#172338",
                borderWidth: 0,
                textStyle: { color: "#fff", fontSize: 12 },
                formatter: params => `${esc(params.name)}<br/><strong>${fmtNumber(params.value)}</strong> leads · ${params.percent}%`
            },
            legend: {
                orient: "vertical",
                right: 8,
                top: "middle",
                itemWidth: 9,
                itemHeight: 9,
                itemGap: 13,
                textStyle: { color: "#526174", fontSize: 11 },
                formatter: name => {
                    const row = leadRows.find(item => item.name === name);
                    return `${name}   ${row ? fmtNumber(row.value) : ""}`;
                }
            },
            series: [{
                type: "pie",
                radius: ["57%", "78%"],
                center: ["34%", "50%"],
                avoidLabelOverlap: true,
                itemStyle: { borderColor: "#fff", borderWidth: 4, borderRadius: 9 },
                label: { show: false },
                emphasis: {
                    scale: true,
                    scaleSize: 7,
                    itemStyle: { shadowBlur: 14, shadowColor: "rgba(24, 39, 75, .16)" }
                },
                data: leadRows
            }]
        });

        const resize = () => state.charts.forEach(chart => chart.resize());
        $(window).off("resize.sales_team_dashboard").on("resize.sales_team_dashboard", resize);
    }

    function loadDashboard() {
        destroyCharts();

        $main.find(".std-content").html(`
            <div class="std-loading">
                <span class="fa fa-circle-o-notch fa-spin"></span>
                Loading dashboard...
            </div>
        `);

        $main.find("[data-period]").removeClass("active");
        $main.find(`[data-period="${state.period}"]`).addClass("active");

        frappe.call({
            method: "teceze.teceze.page.sales_team_dashboard.sales_team_dashboard.get_sales_team_dashboard_data",
            args: { period: state.period }
        }).then(response => {
            if (!response.message) {
                throw new Error("Dashboard API returned no data.");
            }
            renderLayout(response.message);
        }).catch(error => {
            console.error("Sales Team Dashboard:", error);
            $main.find(".std-content").html(`
                <div class="std-error">
                    Unable to load dashboard data. Check the Frappe Error Log for details.
                </div>
            `);
        });
    }

    renderShell();
    loadDashboard();
}
