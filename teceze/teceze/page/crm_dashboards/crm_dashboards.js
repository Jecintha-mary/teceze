frappe.pages["crm-dashboards"].on_page_load = function (wrapper) {
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
        <div class="crm-rates-panel" id="crm-rates-panel">
          <div><strong>Manual exchange rates</strong><small>Enter how much reporting currency equals one unit of each source currency. These rates only affect this dashboard.</small></div>
          <div class="crm-rate-inputs" id="crm-rate-inputs"></div>
        </div>
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
            <div class="crm-two-col"><div class="crm-card"><div class="crm-card-head"><div><h3>Pipeline by workflow state</h3><p>Opportunity count by current workflow state</p></div></div><div id="crm-stage-chart"></div></div>
            <div class="crm-card"><div class="crm-card-head"><div><h3>Quotation totals by currency</h3><p>Original totals and selected reporting currency</p></div></div><div id="crm-quote-currency"></div></div></div>
            <div class="crm-card"><div class="crm-card-head"><div><h3>Priority opportunities</h3><p>Recent opportunity records in the selected date range</p></div></div><div class="crm-table-wrap" id="crm-priority-table"></div></div>
          </section>
          <section class="crm-tab-panel" data-panel="pipeline">
            <div class="crm-kpis" id="crm-pipeline-kpis"></div>
            <div class="crm-subtabs"><button class="active" data-sub="funnel">Funnel</button><button data-sub="aging">Record aging</button><button data-sub="deals">Deal register</button></div>
            <div class="crm-subpanel active" data-subpanel="funnel"><div class="crm-two-col"><div class="crm-card"><h3>Lead-to-quotation movement</h3><p>Counts are based on each DocType's selected business date.</p><div id="crm-funnel"></div></div><div class="crm-card"><h3>Opportunity outcomes</h3><p>Won and lost status from matching opportunity records.</p><div id="crm-outcomes"></div></div></div></div>
            <div class="crm-subpanel" data-subpanel="aging"><div class="crm-card"><h3>Opportunity record age</h3><p>Uses transaction date as a proxy; this is not time spent in a workflow stage.</p><div id="crm-aging"></div></div></div>
            <div class="crm-subpanel" data-subpanel="deals"><div class="crm-card"><div class="crm-card-head"><h3>Opportunity register</h3><input id="crm-deal-search" placeholder="Search opportunities…"></div><div class="crm-table-wrap" id="crm-deal-table"></div></div></div>
          </section>
          <section class="crm-tab-panel" data-panel="verticals">
            <div class="crm-kpis" id="crm-vertical-kpis"></div>
            <div class="crm-subtabs"><button class="active" data-sub="performance">Performance</button><button data-sub="commercial">Commercial mix</button><button data-sub="detail">Detail</button></div>
            <div class="crm-subpanel active" data-subpanel="performance"><div class="crm-two-col"><div class="crm-card"><h3>Opportunities by service vertical</h3><div id="crm-vertical-chart"></div></div><div class="crm-card"><h3>Vertical scorecard</h3><div id="crm-vertical-score"></div></div></div></div>
            <div class="crm-subpanel" data-subpanel="commercial"><div class="crm-card"><h3>Quotation totals by vertical and currency</h3><div id="crm-vertical-commercial"></div></div></div>
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
    const sources = ["INR", "EUR", "GBP", "AED", "SGD"];
    const fmt = (n, currency) => {
        if (n === null || n === undefined || Number.isNaN(Number(n))) return "Rate required";
        try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(n)); }
        catch (e) { return `${currency || "USD"} ${Number(n).toFixed(2)}`; }
    };
    const esc = (s) => frappe.utils.escape_html(String(s ?? ""));
    const moneyByCurrency = (obj) => {
        const entries = Object.entries(obj || {});
        return entries.length ? `<div class="crm-currency-list">${entries.map(([c,v]) => `<div><span>${esc(c)}</span><strong>${fmt(v,c)}</strong></div>`).join("")}</div>` : `<div class="crm-empty">No records in this period</div>`;
    };
    const kpi = (label, value, note, icon) => `<div class="crm-kpi"><div class="crm-kpi-top"><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${note}</small></div>`;
    const table = (headers, rows) => `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="crm-empty">No records found for this date range.</td></tr>`}</tbody></table>`;
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
        const convertedQ = q.conversion_complete ? fmt(q.converted_amount, state.currency) : "Add missing rates";
        const convertedO = opp.conversion_complete ? fmt(opp.converted_amount, state.currency) : "Add missing rates";
        $("#crm-overview-kpis").html([
            kpi("Leads generated", leads.count, "Lead creation date", "↗"),
            kpi("Active opportunities", opp.open_count, "Open workflow records", "◎"),
            kpi("Quotation value", convertedQ, `${q.count} quotations · ${state.currency}`, "$"),
            kpi("Weighted pipeline", convertedO, `Opportunity amount · ${state.currency}`, "◈")
        ].join(""));
        $("#crm-pipeline-kpis").html([
            kpi("Opportunity records", opp.count, "Transaction date", "◎"),
            kpi("Quotation coverage", `${q.count ? Math.round(q.count / Math.max(1,opp.count)*100) : 0}%`, "Quotation records / opportunities (not unique conversion)", "↗"),
            kpi("Won opportunities", opp.won_count, "Current workflow/status value", "✓"),
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

        const stages = Object.entries(opp.stage_counts || {}).sort((a,b)=>b[1]-a[1]);
        $("#crm-stage-chart").html(barList(stages.map(([name,value])=>({name,value}))));
        $("#crm-quote-currency").html(`<div class="crm-subtle-label">Original quotation totals</div>${moneyByCurrency(q.amount_by_currency)}<div class="crm-divider"></div><div class="crm-subtle-label">Converted to ${esc(state.currency)}</div><strong class="crm-large-value">${convertedQ}</strong>${!q.conversion_complete ? `<p class="crm-warning">One or more currency rates are missing. The converted total is intentionally withheld.</p>` : ""}`);
        const priority = [...opp.records].sort((a,b)=>Number(b.opportunity_amount||0)-Number(a.opportunity_amount||0)).slice(0,8);
        $("#crm-priority-table").html(table(["Opportunity","Customer","Stage","Owner","Original amount"],priority.map(o=>`<tr><td>${link("Opportunity",o.name,o.name)}</td><td>${esc(o.customer_name||o.party_name||"—")}</td><td><span class="crm-state">${esc(o.workflow_state||o.status||"—")}</span></td><td>${esc(o.opportunity_owner_name||o.opportunity_owner||"—")}</td><td>${fmt(o.opportunity_amount,o.currency)}</td></tr>`)));
        $("#crm-funnel").html(barList([{name:"Leads",value:leads.count},{name:"Opportunities",value:opp.count},{name:"Quotations",value:q.count},{name:"Won",value:opp.won_count}]));
        $("#crm-outcomes").html(`<div class="crm-outcome-grid"><div><strong>${opp.won_count}</strong><span>Won</span></div><div><strong>${opp.open_count}</strong><span>Open</span></div><div><strong>${opp.lost_count}</strong><span>Lost</span></div></div>`);
        const aging = opp.records.map(o=>({name:o.name, age: Math.max(0, Math.floor((new Date(d.period.to_date)-new Date(o.transaction_date||o.creation.slice(0,10)))/86400000)), stage:o.workflow_state||o.status||"—", owner:o.opportunity_owner||"—"})).sort((a,b)=>b.age-a.age).slice(0,12);
        $("#crm-aging").html(table(["Opportunity","Current state","Record age","Owner"],aging.map(o=>`<tr><td>${link("Opportunity",o.name)}</td><td>${esc(o.stage)}</td><td>${o.age} days</td><td>${esc(o.owner)}</td></tr>`)));
        renderDealTable();
        $("#crm-vertical-chart").html(barList(verticals.map(([name,v])=>({name,value:v.opportunities}))));
        $("#crm-vertical-score").html(verticals.map(([name,v])=>`<div class="crm-vertical-score"><div><strong>${esc(name)}</strong><span>${v.opportunities} opportunities</span></div>${moneyByCurrency(v.pipeline_value_by_currency)}</div>`).join("")||`<div class="crm-empty">No service vertical data</div>`);
        $("#crm-vertical-commercial").html(verticals.map(([name,v])=>`<div class="crm-vertical-score"><div><strong>${esc(name)}</strong><span>${v.quoted_opportunities} linked quotation opportunities</span></div></div>`).join(""));
        $("#crm-vertical-table").html(table(["Service vertical","Opportunities","Won","Quoted opportunities","Pipeline by currency"],verticals.map(([name,v])=>`<tr><td>${esc(name)}</td><td>${v.opportunities}</td><td>${v.won}</td><td>${v.quoted_opportunities}</td><td>${Object.entries(v.pipeline_value_by_currency||{}).map(([c,n])=>`${fmt(n,c)}`).join(" · ")}</td></tr>`)));
        const followRows = d.followups.map(f=>`<tr><td>${link("Lead",f.lead,f.lead_name)}</td><td>${esc(f.subject)}</td><td>${esc(f.owner||"—")}</td><td>${esc(f.follow_up_date)}</td><td><span class="crm-state ${f.status==="Overdue"?"crm-state-danger":""}">${esc(f.status)}</span></td></tr>`);
        $("#crm-action-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],followRows));
        $("#crm-followup-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],followRows));
        $("#crm-owner-table").html(table(["Owner","Open opportunities","Pipeline by original currency"],ownerRows(opp.records)));
        $("#crm-followup-filter").on("change", function () {
            const value=$(this).val();
            const rows=d.followups.filter(f=>value==="all"||f.status===value);
            $("#crm-followup-table").html(table(["Lead","Follow-up","Owner","Due date","Status"],rows.map(f=>`<tr><td>${link("Lead",f.lead,f.lead_name)}</td><td>${esc(f.subject)}</td><td>${esc(f.owner||"—")}</td><td>${esc(f.follow_up_date)}</td><td>${esc(f.status)}</td></tr>`)));
        });
    }

    function barList(items) {
        if (!items.length) return `<div class="crm-empty">No data for this period.</div>`;
        const max=Math.max(1,...items.map(x=>Number(x.value)||0));
        return `<div class="crm-bars">${items.map((x,i)=>`<div class="crm-bar-row"><span title="${esc(x.name)}">${esc(x.name)}</span><div class="crm-bar-track"><i style="width:${Math.max(2,(Number(x.value)||0)/max*100)}%;background:${["#5572f4","#21b7a8","#9273f5","#f3a64a","#ec6c79"][i%5]}"></i></div><b>${x.value}</b></div>`).join("")}</div>`;
    }
    function ownerRows(records) {
        const map={};
        records.forEach(o=>{
            const owner=o.opportunity_owner_name||o.opportunity_owner||"Unassigned";
            if(!map[owner])map[owner]={count:0,currencies:{}};
            if(!["won","lost","closed"].includes(String(o.status||"").toLowerCase()))map[owner].count++;
            const c=o.currency||"UNKNOWN";
            map[owner].currencies[c]=(map[owner].currencies[c]||0)+Number(o.opportunity_amount||0);
        });
        return Object.entries(map).map(([owner,v])=>`<tr><td>${esc(owner)}</td><td>${v.count}</td><td>${Object.entries(v.currencies).map(([c,n])=>fmt(n,c)).join(" · ")}</td></tr>`);
    }
    function renderDealTable() {
        const records=(state.data?.opportunities.records||[]);
        const query=String($("#crm-deal-search").val()||"").toLowerCase();
        const rows=records.filter(o=>[o.name,o.customer_name,o.party_name,o.workflow_state,o.opportunity_owner,o.custom_service_vertical].join(" ").toLowerCase().includes(query));
        $("#crm-deal-table").html(table(["Opportunity","Customer","Service vertical","Workflow state","Owner","Amount"],rows.map(o=>`<tr><td>${link("Opportunity",o.name)}</td><td>${esc(o.customer_name||o.party_name||"—")}</td><td>${esc(o.custom_service_vertical||"—")}</td><td>${esc(o.workflow_state||o.status||"—")}</td><td>${esc(o.opportunity_owner_name||o.opportunity_owner||"—")}</td><td>${fmt(o.opportunity_amount,o.currency)}</td></tr>`)));
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
};
