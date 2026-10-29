frappe.pages["crm-dashboards"].on_page_load = function (wrapper) {
    frappe.require("/assets/teceze/js/component/charts.js").then(() => init_crm_dashboard(wrapper)).catch(() => {
        frappe.msgprint(__("Unable to load the shared CRM chart components. Run bench build and clear cache."));
    });
};

function init_crm_dashboard(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("CRM Dashboard"),
        single_column: true
    });

    page.main.addClass("crm-dashboards-page");
    page.main.html(`
      <div class="crm-dash-shell">
        <div class="crm-dash-head">
          <div><div class="crm-dash-eyebrow">COMMERCIAL PERFORMANCE</div><h1>Revenue intelligence</h1>
          <p>Pipeline health, service vertical performance, and next actions.</p></div>
          <div class="crm-dash-head-actions"><span class="crm-demo-chip">LIVE CRM DATA</span><button class="btn btn-default btn-sm" id="crm-refresh">↻ Refresh</button></div>
        </div>
        <div class="crm-filterbar">
          <div class="crm-date-presets"><button data-days="30">30 days</button><button data-days="90" class="active">90 days</button><button data-days="180">6 months</button><button data-days="365">12 months</button><button data-days="all">All time</button></div>
          <label>From <input type="date" id="crm-from"></label><label>To <input type="date" id="crm-to"></label>
          <label>Report currency <select id="crm-currency"><option>USD</option><option>INR</option><option>EUR</option><option>GBP</option><option>AED</option><option>SGD</option></select></label>
          <button class="btn btn-primary btn-sm" id="crm-apply">Apply</button>
        </div>
        <div class="crm-rates-panel" id="crm-rates-panel"><div><strong>Reporting currency</strong><small>All monetary values are displayed in the selected currency. USD is the default; changing the selector recalculates dashboard totals only.</small></div></div>
        <div class="crm-tabs" id="crm-main-tabs">
          <button class="active" data-tab="overview">Executive overview</button>
          <button data-tab="pipeline">Pipeline & conversion</button>
          <button data-tab="verticals">Service verticals</button>
          <button data-tab="team">Team & action center</button>
        </div>
        <div class="crm-dash-loading" id="crm-loading"><span class="spinner"></span> Loading CRM metrics…</div>
        <div id="crm-dash-content" style="display:none">
          <section class="crm-tab-panel active" data-panel="overview">
            <div class="crm-kpis" id="crm-overview-kpis"></div>
            <div class="crm-card"><div class="crm-card-head"><div><h3>Commercial activity trend</h3><p>Daily lead creation, opportunity movement and quotation activity. Use the table below for exact counts and values.</p></div><span class="crm-card-period" id="crm-trend-period"></span></div><div id="crm-activity-chart"></div></div><div class="crm-card"><div class="crm-card-head"><div><h3>Daily commercial value</h3><p>Daily amount trend in the selected reporting currency. Exact counts and values remain available in the table below.</p></div></div><div id="crm-daily-value-chart"></div></div><div class="crm-card"><div class="crm-card-head"><div><h3>Daily activity & commercial value</h3><p>Counts and amounts are shown together for each record type.</p></div></div><div class="crm-table-wrap" id="crm-daily-trend"></div></div>
            <div class="crm-two-col"><div class="crm-card"><div class="crm-card-head"><div><h3>Pipeline by workflow state</h3><p>Opportunity count and pipeline value in one interactive chart</p></div></div><div id="crm-stage-chart"></div></div>
            <div class="crm-card"><div class="crm-card-head"><div><h3>Sales conversion health</h3><p>Outcome rate and quotation coverage for the selected period</p></div></div><div id="crm-conversion-health"></div></div></div>
            <div class="crm-card"><div class="crm-card-head"><div><h3>Priority opportunities</h3><p>Recent opportunity records in the selected date range</p></div></div><div class="crm-table-wrap" id="crm-priority-table"></div></div>
          </section>
          <section class="crm-tab-panel" data-panel="pipeline">
            <div class="crm-kpis" id="crm-pipeline-kpis"></div>
            <div class="crm-subtabs"><button class="active" data-sub="funnel">Funnel</button><button data-sub="aging">Record aging</button><button data-sub="deals">Deal register</button></div>
            <div class="crm-subpanel active" data-subpanel="funnel"><div class="crm-two-col"><div class="crm-card"><h3>Lead-to-quotation movement</h3><p>Counts are based on each DocType's selected business date.</p><div id="crm-funnel"></div></div><div class="crm-card"><h3>Opportunity outcomes</h3><p>Won and lost status from matching opportunity records.</p><div id="crm-outcomes"></div><div id="crm-outcome-pie"></div></div></div></div>
            <div class="crm-subpanel" data-subpanel="aging"><div class="crm-card"><h3>Opportunity record age</h3><p>Uses transaction date as a proxy; this is not time spent in a workflow stage.</p><div id="crm-aging"></div></div></div>
            <div class="crm-subpanel" data-subpanel="deals"><div class="crm-card"><div class="crm-card-head"><h3>Opportunity register</h3><input id="crm-deal-search" placeholder="Search opportunities…"></div><div class="crm-table-wrap" id="crm-deal-table"></div></div></div>
          </section>
          <section class="crm-tab-panel" data-panel="verticals">
            <div class="crm-kpis" id="crm-vertical-kpis"></div>
            <div class="crm-subtabs"><button class="active" data-sub="performance">Performance</button><button data-sub="commercial">Commercial mix</button><button data-sub="detail">Detail</button></div>
            <div class="crm-subpanel active" data-subpanel="performance"><div class="crm-two-col"><div class="crm-card"><div class="crm-card-head"><div><h3>Opportunities by service vertical</h3><p>Opportunity count and pipeline value in the selected currency</p></div></div><div id="crm-vertical-chart"></div></div><div class="crm-card"><h3>Vertical scorecard</h3><div id="crm-vertical-score"></div></div></div><div class="crm-card crm-country-card"><div class="crm-card-head"><div><h3>Commercial performance by billing country</h3><p>Billing-address country · opportunity count and converted pipeline value</p></div></div><div id="crm-country-chart"></div></div></div>
            <div class="crm-subpanel" data-subpanel="commercial"><div class="crm-card"><h3>Quotation-linked opportunities by service vertical</h3><div id="crm-vertical-commercial"></div></div></div>
            <div class="crm-subpanel" data-subpanel="detail"><div class="crm-card"><h3>Service vertical detail</h3><div class="crm-table-wrap" id="crm-vertical-table"></div></div></div>
          </section>
          <section class="crm-tab-panel" data-panel="team">
            <div class="crm-kpis" id="crm-team-kpis"></div>
            <div class="crm-subtabs"><button class="active" data-sub="actions">Action center</button><button data-sub="owners">Ownership</button><button data-sub="followups">Follow-ups</button></div>
            <div class="crm-subpanel active" data-subpanel="actions"><div class="crm-card"><h3>Follow-up action queue</h3><p>Open follow-ups from Lead → custom_activity_table.</p><div class="crm-table-wrap" id="crm-action-table"></div></div></div>
            <div class="crm-subpanel" data-subpanel="owners"><div class="crm-card"><h3>Opportunity ownership</h3><div class="crm-table-wrap" id="crm-owner-table"></div></div></div>
            <div class="crm-subpanel" data-subpanel="followups"><div class="crm-card"><div class="crm-card-head"><h3>Follow-up schedule</h3><select id="crm-followup-filter"><option value="all">All</option><option value="Overdue">Overdue</option><option value="Due today">Due today</option><option value="Upcoming">Upcoming</option></select></div><div class="crm-table-wrap" id="crm-followup-table"></div></div></div>
          </section>
        </div>
        <div class="crm-dash-foot">TECEZE · CRM REVENUE INTELLIGENCE · Dashboard-only exchange rates never modify transaction records.</div>
      </div>
    `);

    const $ = (selector) => page.main.find(selector);
    const state = { from: null, to: null, currency: "USD", rates: {}, data: null, activeTab: "overview" };
    const sources = ["INR", "EUR", "GBP", "AED", "SGD", "CAD", "AUD", "JPY", "CHF", "NZD", "MYR", "THB"];
    const fmt = (n, currency) => {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return "Rate required";
        try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(n)); }
        catch (e) { return `${currency || "USD"} ${Number(n).toFixed(2)}`; }
    };
    const esc = (s) => frappe.utils.escape_html(String(s ?? ""));
    const fullDate = (value) => { const parts=String(value||"").slice(0,10).split("-"); return parts.length===3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(value||""); };
    const moneyByCurrency = (obj) => {
        const entries = Object.entries(obj || {});
        return entries.length ? `<div class="crm-currency-list">${entries.map(([c,v]) => `<div><span>${esc(c)}</span><strong>${fmt(v,c)}</strong></div>`).join("")}</div>` : `<div class="crm-empty">No records in this period</div>`;
    };
    const kpi = (label, value, note, icon) => CRMCharts.metricCard(label, value, note, icon);
    const table = (headers, rows) => CRMCharts.dataTable(headers, rows);
    const link = (doctype, name, label) => `<a href="/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}">${esc(label || name)}</a>`;

    function renderRateInputs() {
        const list = [...new Set([...sources, state.currency])].filter(c => c !== state.currency);
        $("#crm-rate-inputs").html(list.map(c => `<label>1 ${c} = <input type="number" min="0" step="0.000001" data-rate="${c}" placeholder="Rate in ${state.currency}" value="${state.rates[`${c}_${state.currency}`] || ""}"> ${state.currency}</label>`).join(""));
        $("#crm-rate-inputs input").on("change", function () {
            const source = $(this).attr("data-rate");
            state.rates[`${source}_${state.currency}`] = Number($(this).val());
        });
    }

    function setupDates() {
        const end = frappe.datetime.get_today();
        const start = frappe.datetime.add_days(end, -89);
        state.from = start; state.to = end;
        $("#crm-from").val(start); $("#crm-to").val(end);
        $("[data-days]").on("click", function () {
            const days = $(this).attr("data-days");
            const to = $("#crm-to").val() || frappe.datetime.get_today();
            const from = days === "all" ? "2000-01-01" : frappe.datetime.add_days(to, 1 - Number(days));
            $("#crm-from").val(from);
            $(".crm-date-presets button").removeClass("active");
            $(this).addClass("active");
            loadData();
        });
        $("#crm-currency").on("change", function () {
            state.currency = $(this).val();
            renderRateInputs();
            loadData();
        });
        $("#crm-apply, #crm-refresh").on("click", loadData);
    }

    function render() {
        const d = state.data;
        if (!d) return;
        const leads = d.leads, opp = d.opportunities, q = d.quotations;
        const fxEntries = Object.entries(d.meta?.fx_rates || {});
        const fxLabel = fxEntries.length ? fxEntries.map(([pair,meta]) => `${pair}: ${meta.source}${meta.date ? ` (${meta.date})` : ""}`).join(" · ") : "Same-currency totals or no foreign-currency records";
        $(".crm-dash-foot").text(`TECEZE · CRM REVENUE INTELLIGENCE · FX: ${fxLabel}. Dashboard-only rates never modify transaction records.`);
        const convertedL = leads.conversion_complete ? fmt(leads.converted_amount, state.currency) : "Rate unavailable";
        const convertedQ = q.conversion_complete ? fmt(q.converted_amount, state.currency) : "Rate unavailable";
        const convertedO = opp.conversion_complete ? fmt(opp.converted_amount, state.currency) : "Rate unavailable";
        $("#crm-overview-kpis").html([
            kpi("Leads generated", `${leads.count} · ${convertedL}`, `Lead value · ${state.currency}`, "↗"),
            kpi("Active opportunities", `${opp.open_count} · ${convertedO}`, `Pipeline value · ${state.currency}`, "◎"),
            kpi("Quotations", `${q.count} · ${convertedQ}`, `Quotation value · ${state.currency}`, "$"),
            kpi("Won opportunities", `${opp.won_count} · ${opp.won_conversion_complete === false ? "Rate unavailable" : fmt(opp.won_converted_total, state.currency)}`, `Won value · ${opp.won_conversion_complete === false ? "some rates unavailable" : state.currency} · of ${opp.count} opportunities`, "◈")
        ].join(""));
        $("#crm-pipeline-kpis").html([
            kpi("Opportunity records", opp.count, "Transaction date", "◎"),
            kpi("Quotation coverage", `${q.count ? Math.round(q.count / Math.max(1,opp.count)*100) : 0}%`, "Quotation records / opportunities (not unique conversion)", "↗"),
            kpi("Won opportunities", `${opp.won_count} · ${opp.won_conversion_complete === false ? "Rate unavailable" : fmt(opp.won_converted_total, state.currency)}`, "Count · converted won value", "✓"),
            kpi("Decided win rate", `${opp.win_rate}%`, "Won ÷ (Won + Lost)", "◈")
        ].join(""));
        const verticals = Object.entries(opp.verticals || {});
        $("#crm-vertical-kpis").html([
            kpi("Service verticals", verticals.length, "Represented in opportunity records", "▦"),
            kpi("Opportunity value", convertedO, `Reporting currency · ${state.currency}`, "$"),
            kpi("Quotation value", convertedQ, `Reporting currency · ${state.currency}`, "↗"),
            kpi("Open opportunities", opp.open_count, "Across service verticals", "◎")
        ].join(""));
        const overdue = d.followups.filter(f=>f.status==="Overdue").length;
        $("#crm-team-kpis").html([
            kpi("Open follow-ups", d.followups.length, "Uncompleted Lead Activity follow-ups", "◷"),
            kpi("Overdue follow-ups", overdue, "Past due date", "!"),
            kpi("Sales owners", new Set(opp.records.map(o=>o.opportunity_owner_name||o.opportunity_owner).filter(Boolean)).size, "In current opportunity records", "♙"),
            kpi("Open pipeline", convertedO, `Reporting currency · ${state.currency}`, "$")
        ].join(""));

        const stageSummary = opp.stage_summary || {};
        $("#crm-stage-chart").html(CRMCharts.dualMetricBarChart(Object.entries(stageSummary).map(([name,v])=>({name,count:v.count,value:v.value_complete?v.value:null})), {currency:state.currency, countLabel:"Opportunities", valueLabel:"Pipeline value"}));
        const quotationCoverage = opp.count ? (Number(q.count || 0) / Number(opp.count) * 100) : 0;
        $("#crm-conversion-health").html(`<div class="crm-health-metrics"><div class="crm-health-metric"><span>Win rate</span><strong>${Number(opp.win_rate || 0).toFixed(1)}%</strong><small>${Number(opp.won_count || 0)} won · ${Number(opp.lost_count || 0)} lost</small></div><div class="crm-health-metric"><span>Quotation coverage</span><strong>${quotationCoverage.toFixed(1)}%</strong><small>${Number(q.count || 0)} quotations · ${Number(opp.count || 0)} opportunities</small></div><div class="crm-health-meter"><span style="width:${Math.max(0,Math.min(100,Number(opp.win_rate||0)))}%"></span></div><p class="crm-chart-footnote">Win rate is calculated from won and lost opportunities. Quotation coverage compares quotation records with opportunity records in the selected date range.</p></div>`);
        const trend = (d.daily_trend || []).slice().reverse();
        $("#crm-trend-period").text(`${fullDate(d.period.from_date)} – ${fullDate(d.period.to_date)}`);
        $("#crm-activity-chart").html(CRMCharts.multiLineChart(trend.map(day => ({label:fullDate(day.date), leads:Number(day.lead_count||0), opportunities:Number(day.opportunity_count||0), quotations:Number(day.quotation_count||0), leadValue:day.lead_amount, opportunityValue:day.opportunity_amount, quotationValue:day.quotation_amount})), [{key:"leads",label:"Leads"},{key:"opportunities",label:"Opportunities"},{key:"quotations",label:"Quotations"}], {ariaLabel:"Daily CRM activity by record type", dateFormat:true, currencyFormat:v=>fmt(v,state.currency)}));
        const dailyValueRows = trend.filter(day => day.lead_amount_complete && day.opportunity_amount_complete && day.quotation_amount_complete).map(day => ({label:fullDate(day.date), value:Number(day.lead_amount||0)+Number(day.opportunity_amount||0)+Number(day.quotation_amount||0)}));
        $("#crm-daily-value-chart").html(CRMCharts.lineChart(dailyValueRows.map(day=>({label:day.label,value:day.value})), {format:v=>fmt(v,state.currency), currency:state.currency, ariaLabel:"Daily commercial value in selected reporting currency", dateFormat:true}));
        const trendRows = trend.map(day => {
            const amount = (key, completeKey) => day[completeKey] ? fmt(day[key], state.currency) : "Rate unavailable";
            return `<tr><td>${esc(fullDate(day.date))}</td><td>${day.lead_count}</td><td>${amount("lead_amount","lead_amount_complete")}</td><td>${day.opportunity_count}</td><td>${amount("opportunity_amount","opportunity_amount_complete")}</td><td>${day.quotation_count}</td><td>${amount("quotation_amount","quotation_amount_complete")}</td></tr>`;
        });
        $("#crm-daily-trend").html(table(["Date","Leads #","Lead value","Opportunities #","Opportunity value","Quotations #","Quotation value"], trendRows));
        const priority = [...opp.records].sort((a,b)=>Number(b.opportunity_amount||0)-Number(a.opportunity_amount||0)).slice(0,8);
        $("#crm-priority-table").html(table(["Opportunity","Customer","Stage","Owner",`Amount (${state.currency})`],priority.map(o=>`<tr><td>${link("Opportunity",o.name,o.name)}</td><td>${esc(o.customer_name||o.party_name||"—")}</td><td><span class="crm-state">${esc(o.workflow_state||o.status||"—")}</span></td><td>${esc(o.opportunity_owner_name||o.opportunity_owner||"—")}</td><td>${o.converted_opportunity_amount !== null && o.converted_opportunity_amount !== undefined ? fmt(o.converted_opportunity_amount,state.currency) : "Rate unavailable"}</td></tr>`)));
        $("#crm-funnel").html(CRMCharts.dualMetricBarChart([
            {name:"Leads",count:leads.count,value:leads.conversion_complete?leads.converted_amount:null,valueLabel:"Lead value"},
            {name:"Opportunities",count:opp.count,value:opp.conversion_complete?opp.converted_amount:null,valueLabel:"Pipeline value"},
            {name:"Quotations",count:q.count,value:q.conversion_complete?q.converted_amount:null,valueLabel:"Quotation value"},
            {name:"Won opportunities",count:opp.won_count,value:opp.won_converted_total,valueLabel:"Won value"}
        ], {currency:state.currency, countLabel:"Records", valueLabel:"Commercial value"}));
        const outcomeGroups = {Won:[],Open:[],Lost:[]};
        (opp.records||[]).forEach(o=>{const st=String(o.workflow_state||o.status||"").toLowerCase(); const group=(st==="won")?"Won":(st==="lost")?"Lost":"Open"; outcomeGroups[group].push(o);});
        const outcomeMarkup = Object.entries(outcomeGroups).map(([label,rows])=>{let total=0,complete=true;rows.forEach(o=>{const converted=Number(o.converted_opportunity_amount); if(Number.isFinite(converted)) total+=converted; else complete=false;});return `<div class="crm-outcome-tile"><span class="crm-outcome-label">${label}</span><strong>${rows.length.toLocaleString()}</strong><small>opportunities</small><div class="crm-outcome-values"><span>${complete?fmt(total,state.currency):"Rate unavailable"}</span></div></div>`;}).join("");
        $("#crm-outcomes").html(`<div class="crm-outcome-grid">${outcomeMarkup}</div><small class="crm-chart-footnote">Counts and values use the selected reporting currency.</small>`);
        $("#crm-outcome-pie").html(CRMCharts.pieChart([{name:"Won",value:opp.won_count},{name:"Open",value:opp.open_count},{name:"Lost",value:opp.lost_count}], {ariaLabel:"Opportunity outcome distribution by count"}));
        const aging = opp.records.map(o=>({name:o.name, age: Math.max(0, Math.floor((new Date(d.period.to_date)-new Date(o.transaction_date||o.creation.slice(0,10)))/86400000)), stage:o.workflow_state||o.status||"—", owner:o.opportunity_owner||"—"})).sort((a,b)=>b.age-a.age).slice(0,12);
        $("#crm-aging").html(table(["Opportunity","Current state","Record age","Owner"],aging.map(o=>`<tr><td>${link("Opportunity",o.name)}</td><td>${esc(o.stage)}</td><td>${o.age} days</td><td>${esc(o.owner)}</td></tr>`)));
        renderDealTable();
        $("#crm-vertical-chart").html(CRMCharts.dualMetricBarChart(verticals.map(([name,v])=>({name,count:v.opportunities,value:v.value_complete?v.pipeline_value:null})), {currency:state.currency,countLabel:"Opportunities",valueLabel:"Pipeline value"}));
        const countryRows = Object.entries(opp.billing_country_summary || {}).map(([name,v])=>({name,count:v.count,value:v.value_complete?v.value:null})).sort((a,b)=>b.value-a.value);
        $("#crm-country-chart").html(CRMCharts.dualMetricBarChart(countryRows, {currency:state.currency,countLabel:"Opportunities",valueLabel:"Pipeline value"}));
        $("#crm-vertical-score").html(verticals.map(([name,v])=>`<div class="crm-vertical-score"><div><strong>${esc(name)}</strong><span>${v.opportunities} opportunities</span></div>${v.value_complete?fmt(v.pipeline_value,state.currency):"Rate unavailable"}</div>`).join("")||`<div class="crm-empty">No service vertical data</div>`);
        $("#crm-vertical-commercial").html(verticals.map(([name,v])=>`<div class="crm-vertical-score"><div><strong>${esc(name)}</strong><span>${v.quoted_opportunities} linked quotation opportunities</span></div></div>`).join(""));
        $("#crm-vertical-table").html(table(["Service vertical","Opportunities","Won","Quoted opportunities",`Pipeline value (${state.currency})`],verticals.map(([name,v])=>`<tr><td>${esc(name)}</td><td>${v.opportunities}</td><td>${v.won}</td><td>${v.quoted_opportunities}</td><td>${v.value_complete?fmt(v.pipeline_value,state.currency):"Rate unavailable"}</td></tr>`)));
        const followRows = d.followups.map(f=>`<tr><td>${link("Lead",f.lead,f.lead_name)}</td><td>${esc(f.subject)}</td><td>${esc(f.owner||"—")}</td><td>${esc(f.follow_up_date)}</td><td><span class="crm-state ${f.status==="Overdue"?"crm-state-danger":""}">${esc(f.status)}</span></td></tr>`);
        $("#crm-action-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],followRows));
        $("#crm-followup-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],followRows));
        $("#crm-owner-table").html(table(["Owner","Open opportunities",`Pipeline value (${state.currency})`],ownerRows(opp.records)));
        $("#crm-followup-filter").on("change", function () {
            const value=$(this).val();
            const rows=d.followups.filter(f=>value==="all"||f.status===value);
            $("#crm-followup-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],rows.map(f=>`<tr><td>${link("Lead",f.lead,f.lead_name)}</td><td>${esc(f.subject)}</td><td>${esc(f.owner||"—")}</td><td>${esc(f.follow_up_date)}</td><td>${esc(f.status)}</td></tr>`)));
        });
    }

    function barList(items) {
        return CRMCharts.barChart(items);
    }
    function ownerRows(records) {
        const map={};
        records.forEach(o=>{
            const owner=o.opportunity_owner_name||o.opportunity_owner||"Unassigned";
            if(!map[owner])map[owner]={count:0,value:0,complete:true};
            if(!["won","lost","closed"].includes(String(o.status||"").toLowerCase()))map[owner].count++;
            if(o.converted_opportunity_amount===null || o.converted_opportunity_amount===undefined) map[owner].complete=false;
            else map[owner].value+=Number(o.converted_opportunity_amount||0);
        });
        return Object.entries(map).map(([owner,v])=>`<tr><td>${esc(owner)}</td><td>${v.count}</td><td>${v.complete?fmt(v.value,state.currency):"Rate unavailable"}</td></tr>`);
    }
    function renderDealTable() {
        const records=(state.data?.opportunities.records||[]);
        const query=String($("#crm-deal-search").val()||"").toLowerCase();
        const rows=records.filter(o=>[o.name,o.customer_name,o.party_name,o.workflow_state,o.opportunity_owner,o.custom_service_vertical].join(" ").toLowerCase().includes(query));
        $("#crm-deal-table").html(table(["Opportunity","Customer","Service vertical","Workflow state","Owner","Amount"],rows.map(o=>`<tr><td>${link("Opportunity",o.name)}</td><td>${esc(o.customer_name||o.party_name||"—")}</td><td>${esc(o.custom_service_vertical||"—")}</td><td>${esc(o.workflow_state||o.status||"—")}</td><td>${esc(o.opportunity_owner_name||o.opportunity_owner||"—")}</td><td>${o.converted_opportunity_amount !== null && o.converted_opportunity_amount !== undefined ? fmt(o.converted_opportunity_amount,state.currency) : "Rate unavailable"}</td></tr>`)));
    }

    function loadData() {
        const from=$("#crm-from").val(), to=$("#crm-to").val();
        if(!from||!to||from>to){frappe.msgprint(__("Please choose a valid date range."));return;}
        state.from=from;state.to=to;
        $("#crm-loading").show();$("#crm-dash-content").hide();
        frappe.call({
            method:"teceze.teceze.page.crm_dashboards.crm_dashboards.get_dashboard_data",
            args:{from_date:from,to_date:to,reporting_currency:state.currency,rates:JSON.stringify(state.rates)},
            callback:r=>{
                if(r.message){state.data=r.message;render();$("#crm-loading").hide();$("#crm-dash-content").show();}
            },
            error:()=>{$("#crm-loading").html(`<div class="crm-error">Unable to load dashboard data. Check DocType permissions and browser/server logs.</div>`);}
        });
    }

    $("#crm-main-tabs button").on("click",function(){
        const tab=$(this).attr("data-tab");$("#crm-main-tabs button").removeClass("active");$(this).addClass("active");
        $(".crm-tab-panel").removeClass("active");$(`.crm-tab-panel[data-panel="${tab}"]`).addClass("active");
        state.activeTab=tab;
    });
    $(".crm-subtabs button").on("click",function(){
        const btn=$(this), value=btn.attr("data-sub"), parent=btn.closest(".crm-tab-panel");
        parent.find(".crm-subtabs button").removeClass("active");btn.addClass("active");
        parent.find(".crm-subpanel").removeClass("active");parent.find(`.crm-subpanel[data-subpanel="${value}"]`).addClass("active");
    });
    $("#crm-deal-search").on("input",renderDealTable);
    renderRateInputs();setupDates();loadData();
}
