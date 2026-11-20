frappe.pages['client-hierarchy'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Client Hierarchy',
        single_column: true
    });

    new ClientHierarchy(wrapper, page);
};

class ClientHierarchy {
    constructor(wrapper, page) {
        this.wrapper = wrapper;
        this.page = page;

        this.api = {
            filters: 'teceze.teceze.page.client_hierarchy.client_hierarchy.get_filter_options',
            hierarchy: 'teceze.teceze.page.client_hierarchy.client_hierarchy.get_hierarchy_data'
        };

        this.filters = { company: '', region: '', service_vertical: '' };

        this.leads = [];
        this.filterOptions = { companies: [], regions: [], service_verticals: [] };

        // Options of Lead > custom_lead_qualification (first = top of hierarchy)
        this.qualificationOptions = [];

        this.view = 'tree';
        this.search = '';
        this.expanded = true;
        this.loading = false;
        this.zoom = 100;
        this.theme = localStorage.getItem('client-hierarchy-theme') || 'light';

        this.init();
    }

    init() {
        this.$main = $(this.wrapper).find('.layout-main-section');

        this.$main.css({
            padding: '0',
            background: 'var(--control-bg)',
            minHeight: 'calc(100vh - 100px)'
        });

        this.addStyles();
        this.render();
        this.loadFilterOptions();
        this.loadQualificationOptions();
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    addStyles() {
        // Remove any older copy so edits always take effect
        $('#client-hierarchy-styles').remove();

        $('head').append(`
<style id="client-hierarchy-styles">

.ch-page {
    --ch-bg: #f5f6fa;
    --ch-card: #ffffff;
    --ch-text: #202124;
    --ch-muted: #85858d;
    --ch-border: #ececf0;
    --ch-blue: #0878ed;
    --ch-blue-light: #e6f1ff;
    --ch-orange: #ff9200;
    --ch-purple: #b64ce5;
    --ch-green: #22bd60;
    --ch-shadow: 0 5px 20px rgba(20,30,60,.035);

    color: var(--ch-text);
    background: var(--ch-bg);
    min-height: calc(100vh - 100px);
    font-family: inherit;
    padding-bottom: 40px;
}

.ch-page.dark {
    --ch-bg: #15171d;
    --ch-card: #20232c;
    --ch-text: #f0f1f5;
    --ch-muted: #a1a5b1;
    --ch-border: #353945;
    --ch-blue-light: #183453;
    --ch-shadow: 0 5px 20px rgba(0,0,0,.15);
}

.ch-topbar {
    background: var(--ch-card);
    padding: 20px 32px 16px;
    border-bottom: 1px solid var(--ch-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
}

.ch-breadcrumb { font-size: 11px; color: var(--ch-muted); margin-bottom: 7px; }
.ch-breadcrumb span { color: var(--ch-blue); }

.ch-title { font-size: 21px; font-weight: 700; margin: 0; color: var(--ch-text); }
.ch-subtitle { color: var(--ch-muted); font-size: 12px; margin-top: 4px; }

.ch-live {
    display: inline-flex; align-items: center; gap: 6px;
    color: #159b4c; background: #e9f9ef;
    padding: 4px 10px; border-radius: 20px;
    font-size: 10px; margin-left: 8px;
    vertical-align: middle; font-weight: 600;
}
.ch-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22bd60; }

.ch-actions { display: flex; gap: 9px; align-items: center; }

.ch-btn {
    border: 1px solid var(--ch-border);
    background: var(--ch-card);
    color: var(--ch-text);
    border-radius: 22px;
    padding: 9px 15px;
    font-size: 12px;
    cursor: pointer;
    transition: .2s;
    white-space: nowrap;
}
.ch-btn:hover { border-color: var(--ch-blue); color: var(--ch-blue); }
.ch-btn-primary { background: var(--ch-blue); color: white; border-color: var(--ch-blue); font-weight: 600; }
.ch-btn-primary:hover { background: #0066d3; color: white; }

.ch-content { padding: 30px 32px; max-width: 1800px; margin: auto; }

.ch-filter-card {
    background: var(--ch-card);
    border-radius: 18px;
    padding: 22px;
    box-shadow: var(--ch-shadow);
    margin-bottom: 23px;
}
.ch-filter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.ch-filter-label {
    display: block; font-size: 11px; font-weight: 700;
    color: var(--ch-muted); letter-spacing: .35px;
    margin-bottom: 8px; text-transform: uppercase;
}
.ch-filter-select {
    width: 100%; height: 39px;
    border: 1px solid var(--ch-border);
    background: var(--ch-bg); color: var(--ch-text);
    border-radius: 13px; padding: 0 12px;
    font-size: 12px; outline: none;
}
.ch-filter-select:focus { border-color: var(--ch-blue); }

.ch-filter-footer {
    border-top: 1px solid var(--ch-border);
    margin-top: 16px; padding-top: 14px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
}
.ch-filter-hint { font-size: 11px; color: var(--ch-muted); }
.ch-filter-actions { display: flex; align-items: center; gap: 12px; }
.ch-clear { background: none; border: none; color: var(--ch-muted); cursor: pointer; font-size: 12px; }
.ch-clear:hover { color: var(--ch-blue); }

.ch-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 15px; margin-bottom: 23px; }
.ch-kpi {
    background: var(--ch-card); border-radius: 18px;
    padding: 21px; box-shadow: var(--ch-shadow); min-height: 137px;
}
.ch-kpi-top {
    display: flex; justify-content: space-between; align-items: center;
    color: var(--ch-muted); font-size: 11px; font-weight: 700; letter-spacing: .4px;
}
.ch-kpi-icon {
    width: 33px; height: 33px; display: flex; align-items: center; justify-content: center;
    border-radius: 12px; font-size: 16px; background: var(--ch-blue-light);
}
.ch-kpi-value { font-size: 29px; font-weight: 700; margin-top: 9px; line-height: 1.2; }
.ch-kpi-desc { font-size: 11px; color: var(--ch-muted); margin-top: 5px; }

.ch-workspace {
    background: var(--ch-card);
    border: 1px solid var(--ch-border);
    border-radius: 18px; overflow: hidden;
    box-shadow: var(--ch-shadow);
}
.ch-workspace-header {
    padding: 17px 24px; display: flex; align-items: center;
    justify-content: space-between; flex-wrap: wrap; gap: 15px;
}
.ch-workspace-title { display: flex; align-items: center; gap: 12px; }
.ch-workspace-icon {
    width: 37px; height: 37px; border-radius: 12px;
    background: var(--ch-blue); color: white;
    display: flex; justify-content: center; align-items: center; font-size: 18px;
}
.ch-workspace-title strong { display: block; font-size: 14px; }
.ch-workspace-title small { display: block; font-size: 11px; color: var(--ch-muted); margin-top: 3px; }

.ch-toolbar { padding: 0 24px 15px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ch-tabs {
    display: flex; background: var(--ch-bg);
    border: 1px solid var(--ch-border);
    border-radius: 13px; padding: 3px; gap: 3px;
}
.ch-tab {
    border: 0; background: transparent; color: var(--ch-muted);
    border-radius: 10px; padding: 7px 12px; font-size: 11px; cursor: pointer;
}
.ch-tab.active {
    background: var(--ch-card); color: var(--ch-blue);
    font-weight: 700; box-shadow: 0 1px 5px rgba(0,0,0,.08);
}

.ch-search {
    width: 175px; height: 33px;
    border: 1px solid var(--ch-border); border-radius: 20px;
    padding: 0 12px; font-size: 11px;
    background: var(--ch-bg); color: var(--ch-text); outline: none;
}

.ch-zoom {
    display: flex; align-items: center; gap: 9px;
    border: 1px solid var(--ch-border); border-radius: 20px;
    padding: 5px 10px; font-size: 10px; color: var(--ch-muted);
}
.ch-zoom button { border: 0; background: none; color: var(--ch-text); cursor: pointer; font-size: 14px; }

.ch-small-btn {
    border: 1px solid var(--ch-border); border-radius: 20px;
    background: var(--ch-card); color: var(--ch-text);
    padding: 7px 12px; font-size: 11px; cursor: pointer;
}

.ch-legend {
    padding: 11px 24px;
    border-top: 1px solid var(--ch-border);
    border-bottom: 1px solid var(--ch-border);
    background: var(--ch-bg);
    display: flex; align-items: center; flex-wrap: wrap;
    gap: 17px; font-size: 10px; color: var(--ch-muted);
}
.ch-legend-item { display: flex; align-items: center; gap: 6px; }
.ch-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.ch-active-path {
    margin-left: auto; background: var(--ch-border);
    padding: 5px 9px; border-radius: 5px; font-size: 9px;
}

.ch-view { min-height: 350px; padding: 24px; background: var(--ch-bg); overflow: auto; }

.ch-empty {
    min-height: 280px; display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center; color: var(--ch-muted);
}
.ch-empty-icon { font-size: 35px; margin-bottom: 12px; }
.ch-empty strong { color: var(--ch-text); font-size: 14px; }
.ch-empty p { font-size: 11px; margin-top: 6px; }

/* ---------------- Interactive tree ---------------- */

.ch-tree-root {
    background: var(--ch-card);
    border: 1px solid var(--ch-border);
    border-radius: 16px; overflow: hidden;
    margin-bottom: 16px;
}
.ch-tree-company {
    padding: 17px; display: flex; align-items: center; gap: 12px;
    cursor: pointer; border-bottom: 1px solid var(--ch-border);
}
.ch-tree-company:hover,
.ch-region-card:hover,
.ch-lead-row:hover { background: var(--ch-bg); }

.ch-tree-toggle {
    border: none; border-radius: 7px; width: 24px; height: 24px;
    background: var(--ch-bg); color: var(--ch-text); cursor: pointer;
}
.ch-company-avatar {
    width: 34px; height: 34px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    color: white; background: #2689f5; font-size: 16px; font-weight: 700;
}
.ch-company-info { flex: 1; min-width: 0; }
.ch-company-info strong { font-size: 13px; }
.ch-company-info small { display: block; color: var(--ch-muted); font-size: 10px; margin-top: 3px; }
.ch-parent-tag {
    background: var(--ch-blue-light); color: var(--ch-blue);
    padding: 4px 8px; border-radius: 12px; font-size: 9px; margin-left: 7px;
}
.ch-status-tag {
    color: #168a43; background: #e8f8ee;
    padding: 6px 10px; border-radius: 20px; font-size: 10px; font-weight: 600;
}

.ch-tree-children { padding: 15px 15px 15px 55px; position: relative; }
.ch-tree-children:before {
    content: ''; position: absolute; left: 25px; top: 8px; bottom: 15px;
    width: 1px; background: #c7dcff;
}

.ch-region-card {
    border: 1px solid var(--ch-border);
    background: var(--ch-bg);
    border-radius: 14px; padding: 14px; margin-bottom: 15px;
}
.ch-region-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.ch-region-icon {
    width: 31px; height: 31px; display: flex; align-items: center; justify-content: center;
    border-radius: 9px; background: var(--ch-blue-light); font-size: 15px;
}
.ch-region-name { flex: 1; font-size: 12px; font-weight: 700; }
.ch-region-count {
    color: var(--ch-blue); background: var(--ch-card);
    padding: 5px 8px; border-radius: 8px; font-size: 9px;
}

.ch-vertical-block {
    margin-left: 18px; padding-left: 15px;
    border-left: 1px solid var(--ch-border); margin-bottom: 10px;
}
.ch-vertical-heading {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700; margin-bottom: 8px;
}
.ch-color-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

/* Qualification hierarchy: 1st = top, each next option nested inside */
.ch-qualification-level {
    --lvl: #0878ed;
    position: relative;
    margin: 10px 0 10px 12px;
    padding-left: 16px;
    border-left: 2px solid var(--lvl);
}
.ch-qualification-level.ch-nested-qualification { margin-left: 32px; }

.ch-qualification-heading {
    display: flex; align-items: center; gap: 9px;
    background: color-mix(in srgb, var(--lvl) 12%, var(--ch-card));
    border: 1px solid color-mix(in srgb, var(--lvl) 35%, var(--ch-border));
    border-left: 5px solid var(--lvl);
    border-radius: 9px; padding: 10px 12px;
    margin-bottom: 9px; font-size: 11px;
}
.ch-qualification-heading > span:first-child { font-weight: 700; color: var(--lvl); }
.ch-qualification-heading strong { color: var(--lvl); }
.ch-qualification-count {
    margin-left: auto; color: #fff; background: var(--lvl);
    border-radius: 10px; padding: 2px 9px; font-weight: 700; font-size: 10px;
}

/* Corporate colours for upper levels */
.ch-tree-company { border-left: 5px solid #0878ed; }
.ch-region-card { border-left: 5px solid #ff9200; }
.ch-vertical-heading {
    color: #b64ce5;
    background: color-mix(in srgb, #b64ce5 10%, var(--ch-card));
    border-left: 4px solid #b64ce5;
    border-radius: 8px; padding: 7px 10px;
}
.ch-qualification-empty { color: var(--ch-muted); font-size: 10px; padding: 5px 12px; }

.ch-lead-row {
    display: flex; align-items: center; gap: 10px;
    background: var(--ch-card);
    border: 1px solid var(--ch-border);
    border-radius: 10px; padding: 10px 12px;
    margin: 6px 0 6px 13px; cursor: pointer;
}
.ch-lead-avatar {
    width: 27px; height: 27px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: #f0e8fb; color: #9b42d0; font-weight: 700; font-size: 11px;
}
.ch-lead-name { font-size: 11px; font-weight: 700; }
.ch-lead-meta { color: var(--ch-muted); font-size: 10px; flex: 1; }
.ch-lead-open { color: var(--ch-blue); font-size: 10px; }

/* ---------------- Mind map ---------------- */

.ch-mindmap {
    min-width: 850px; min-height: 420px;
    position: relative; padding: 25px;
    background-image: radial-gradient(var(--ch-border) .8px, transparent .8px);
    background-size: 20px 20px;
    overflow: auto;
}
.ch-mindmap-layout {
    display: flex; flex-direction: column; align-items: flex-start;
    gap: 30px; min-height: 360px; width: max-content;
    transform-origin: top left;
}

.ch-mm-wrap { display: flex; align-items: center; position: relative; }

.ch-mm-node {
    position: relative; min-width: 170px; max-width: 240px;
    background: var(--ch-card); border: 1px solid var(--ch-border);
    border-radius: 12px; padding: 10px 14px; font-size: 11px;
    box-shadow: var(--ch-shadow);
}
.ch-mm-node small { display: block; color: var(--ch-muted); font-size: 10px; margin-top: 4px; }
.ch-mm-node.company  { border: 2px solid #2689f5; font-size: 13px; }
.ch-mm-node.region   { border-left: 4px solid #ff9200; }
.ch-mm-node.vertical { border-left: 4px solid #b64ce5; }
.ch-mm-node.qual     { border-left: 4px solid var(--lvl, #0878ed); background: color-mix(in srgb, var(--lvl, #0878ed) 12%, var(--ch-card)); }
.ch-mm-node.qual strong { color: var(--lvl, #0878ed); }
.ch-mm-node.lead     { border-left: 4px solid #22bd60; cursor: pointer; }
.ch-mm-node.lead:hover { background: var(--ch-bg); }

.ch-mm-children { display: flex; flex-direction: column; gap: 12px; margin-left: 40px; }

/* horizontal connector into each child */
.ch-mm-children > .ch-mm-wrap::before {
    content: ''; position: absolute; left: -20px; top: 50%; width: 20px;
    border-top: 2px solid var(--ch-border);
}
/* vertical connector joining siblings */
.ch-mm-children > .ch-mm-wrap::after {
    content: ''; position: absolute; left: -20px; top: -6px; bottom: -6px;
    border-left: 2px solid var(--ch-border);
}
.ch-mm-children > .ch-mm-wrap:first-child::after { top: 50%; }
.ch-mm-children > .ch-mm-wrap:last-child::after  { bottom: 50%; }
.ch-mm-children > .ch-mm-wrap:only-child::after  { display: none; }
/* parent to children connector */
.ch-mm-wrap > .ch-mm-node:not(:only-child)::after {
    content: ''; position: absolute; left: 100%; top: 50%; width: 20px;
    border-top: 2px solid var(--ch-border);
}

/* ---------------- Table ---------------- */

.ch-table-wrap {
    background: var(--ch-card);
    border: 1px solid var(--ch-border);
    border-radius: 16px; overflow: hidden;
}
.ch-table-heading {
    padding: 17px; border-bottom: 1px solid var(--ch-border);
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.ch-table-heading strong { font-size: 12px; display: block; }
.ch-table-heading small { display: block; font-size: 10px; color: var(--ch-muted); margin-top: 3px; }
.ch-table-scroll { overflow-x: auto; }
.ch-table { width: 100%; border-collapse: collapse; min-width: 850px; font-size: 11px; }
.ch-table th {
    color: var(--ch-muted); background: var(--ch-bg);
    text-transform: uppercase; font-size: 10px; font-weight: 700;
    padding: 13px 16px; text-align: left; white-space: nowrap;
}
.ch-table td { padding: 14px 16px; border-top: 1px solid var(--ch-border); color: var(--ch-text); }
.ch-table tr:hover td { background: var(--ch-bg); }
.ch-region-pill {
    display: inline-block; padding: 4px 9px; border-radius: 15px;
    background: #fff2e3; color: #d77c13; font-size: 9px;
}
.ch-inspect { border: 0; background: none; color: var(--ch-blue); cursor: pointer; font-size: 11px; }

.ch-loading { opacity: .55; pointer-events: none; }
.ch-hidden { display: none !important; }

@media (max-width: 1000px) {
    .ch-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ch-content { padding: 20px; }
}
@media (max-width: 650px) {
    .ch-filter-grid { grid-template-columns: 1fr; }
    .ch-kpis { grid-template-columns: 1fr 1fr; }
    .ch-topbar { padding: 16px; }
    .ch-content { padding: 12px; }
    .ch-workspace-header { padding: 15px; }
    .ch-toolbar { padding: 0 15px 15px; }
    .ch-view { padding: 12px; }
    .ch-search { width: 100%; }
}

</style>
        `);
    }

    /* ------------------------------------------------------------------ */
    /* Layout                                                              */
    /* ------------------------------------------------------------------ */

    render() {
        this.$main.html(`
            <div class="ch-page ${this.theme === 'dark' ? 'dark' : ''}">
                <div class="ch-topbar">
                    <div>
                        <div class="ch-breadcrumb">
                            Home &nbsp;/&nbsp; Sales Pipeline &nbsp;/&nbsp;
                            <span>Client Hierarchy</span>
                        </div>
                        <h2 class="ch-title">
                            Client Hierarchy
                            <span class="ch-live"><span class="ch-live-dot"></span>Live Sync</span>
                        </h2>
                        <div class="ch-subtitle">
                            Explore client companies, global regions, service verticals and lead relationships.
                        </div>
                    </div>

                    <div class="ch-actions">
                        <button class="ch-btn" id="ch-export">⇧ Export Structure</button>
                        <button class="ch-btn ch-btn-primary" id="ch-add-lead">＋ Add New Lead</button>
                    </div>
                </div>

                <div class="ch-content">
                    <div class="ch-filter-card">
                        <div class="ch-filter-grid">
                            <div>
                                <label class="ch-filter-label">Client Company</label>
                                <select class="ch-filter-select" id="ch-company">
                                    <option value="">Select Company</option>
                                </select>
                            </div>
                            <div>
                                <label class="ch-filter-label">Region</label>
                                <select class="ch-filter-select" id="ch-region">
                                    <option value="">All Regions</option>
                                </select>
                            </div>
                            <div>
                                <label class="ch-filter-label">Service Vertical</label>
                                <select class="ch-filter-select" id="ch-vertical">
                                    <option value="">All Service Verticals</option>
                                </select>
                            </div>
                        </div>

                        <div class="ch-filter-footer">
                            <div class="ch-filter-hint">
                                Select at least one filter to explore the complete client hierarchy
                            </div>
                            <div class="ch-filter-actions">
                                <button class="ch-clear" id="ch-clear">Clear Filters</button>
                                <button class="ch-btn ch-btn-primary" id="ch-apply">Apply Filters</button>
                            </div>
                        </div>
                    </div>

                    <div class="ch-kpis">
                        <div class="ch-kpi">
                            <div class="ch-kpi-top">COMPANIES <span class="ch-kpi-icon">🏢</span></div>
                            <div class="ch-kpi-value" id="ch-kpi-companies">0</div>
                            <div class="ch-kpi-desc">Selected corporate entities</div>
                        </div>
                        <div class="ch-kpi">
                            <div class="ch-kpi-top">TOTAL LEADS <span class="ch-kpi-icon">👥</span></div>
                            <div class="ch-kpi-value" id="ch-kpi-leads">0</div>
                            <div class="ch-kpi-desc">Active relationship pipeline</div>
                        </div>
                        <div class="ch-kpi">
                            <div class="ch-kpi-top">REGIONS <span class="ch-kpi-icon">🌐</span></div>
                            <div class="ch-kpi-value" id="ch-kpi-regions">0</div>
                            <div class="ch-kpi-desc">Regional divisions</div>
                        </div>
                        <div class="ch-kpi">
                            <div class="ch-kpi-top">SERVICE VERTICALS <span class="ch-kpi-icon">📦</span></div>
                            <div class="ch-kpi-value" id="ch-kpi-verticals">0</div>
                            <div class="ch-kpi-desc">Service categories</div>
                        </div>
                    </div>

                    <div class="ch-workspace">
                        <div class="ch-workspace-header">
                            <div class="ch-workspace-title">
                                <div class="ch-workspace-icon">▣</div>
                                <div>
                                    <strong>Client Relationship Structure</strong>
                                    <small>Visual mapping of corporate hierarchy, regional divisions & key lead stakeholders</small>
                                </div>
                            </div>
                        </div>

                        <div class="ch-toolbar">
                            <div class="ch-tabs">
                                <button class="ch-tab active" data-view="tree">♙ Interactive Tree</button>
                                <button class="ch-tab" data-view="mindmap">▧ Mind Map Flow</button>
                                <button class="ch-tab" data-view="table">☰ Table List</button>
                            </div>

                            <input type="text" class="ch-search" id="ch-search" placeholder="⌕  Search nodes...">

                            <div class="ch-zoom">
                                <button id="ch-zoom-out">−</button>
                                <span id="ch-zoom-value">100%</span>
                                <button id="ch-zoom-in">＋</button>
                            </div>

                            <button class="ch-small-btn" id="ch-expand">Expand All</button>
                            <button class="ch-small-btn" id="ch-collapse">Collapse All</button>
                        </div>

                        <div class="ch-legend">
                            <strong>Hierarchy Levels:</strong>
                            <span class="ch-legend-item"><i class="ch-legend-dot" style="background:#0878ed"></i>Corporate Parent</span>
                            <span class="ch-legend-item"><i class="ch-legend-dot" style="background:#ff9200"></i>Region Hub</span>
                            <span class="ch-legend-item"><i class="ch-legend-dot" style="background:#b64ce5"></i>Service Division</span>
                            <span class="ch-legend-item"><i class="ch-legend-dot" style="background:#22bd60"></i>Lead Stakeholder</span>
                            <span class="ch-active-path" id="ch-active-path">Awaiting filters</span>
                        </div>

                        <div class="ch-view" id="ch-view">
                            <div class="ch-empty">
                                <div class="ch-empty-icon">🌐</div>
                                <strong>Explore your client hierarchy</strong>
                                <p>Select a company, region or service vertical and click Apply Filters.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.bindEvents();
    }

    bindEvents() {
        const self = this;

        this.$main.off('.clientHierarchy');

        this.$main.on('click.clientHierarchy', '#ch-apply', () => this.applyFilters());
        this.$main.on('click.clientHierarchy', '#ch-clear', () => this.clearFilters());

        this.$main.on('click.clientHierarchy', '#ch-theme', () => {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('client-hierarchy-theme', this.theme);
            this.$main.find('.ch-page').toggleClass('dark', this.theme === 'dark');
        });

        this.$main.on('click.clientHierarchy', '#ch-add-lead', () => frappe.new_doc('Lead'));
        this.$main.on('click.clientHierarchy', '#ch-export', () => this.exportCSV());

        this.$main.on('click.clientHierarchy', '.ch-tab', function () {
            self.view = $(this).data('view');
            self.$main.find('.ch-tab').removeClass('active');
            $(this).addClass('active');
            self.renderView();
        });

        this.$main.on('input.clientHierarchy', '#ch-search', function () {
            self.search = $(this).val().toLowerCase().trim();
            self.renderView();
        });

        this.$main.on('click.clientHierarchy', '#ch-expand', () => {
            this.expanded = true;
            this.renderView();
        });

        this.$main.on('click.clientHierarchy', '#ch-collapse', () => {
            this.expanded = false;
            this.renderView();
        });

        this.$main.on('click.clientHierarchy', '#ch-zoom-in', () => {
            this.zoom = Math.min(150, this.zoom + 10);
            this.updateZoom();
        });

        this.$main.on('click.clientHierarchy', '#ch-zoom-out', () => {
            this.zoom = Math.max(50, this.zoom - 10);
            this.updateZoom();
        });

        this.$main.on('click.clientHierarchy', '.ch-tree-toggle', function (e) {
            e.stopPropagation();
            const target = $(this).data('target');
            const $target = self.$main.find(`[data-container="${target}"]`);
            $target.toggleClass('ch-hidden');
            $(this).text($target.hasClass('ch-hidden') ? '＋' : '−');
        });

        // Tree rows, table buttons and mind map lead nodes all open the Lead
        this.$main.on('click.clientHierarchy', '.ch-lead-row, .ch-inspect, .ch-mm-node.lead', function (e) {
            e.stopPropagation();
            const name = $(this).data('name');
            if (name) {
                frappe.set_route('Form', 'Lead', name);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Data                                                                */
    /* ------------------------------------------------------------------ */

    loadFilterOptions() {
        frappe.call({
            method: this.api.filters,
            freeze: false,
            callback: (r) => {
                if (!r.message) return;

                this.filterOptions = {
                    companies: r.message.companies || [],
                    regions: r.message.regions || [],
                    service_verticals: r.message.service_verticals || []
                };

                this.fillFilterOptions();
            },
            error: () => {
                frappe.msgprint('Unable to load Client Hierarchy filter options.');
            }
        });
    }

    // Reads the options of Lead > custom_lead_qualification.
    // Option order = hierarchy order (first option is the top level).
    loadQualificationOptions() {
        frappe.model.with_doctype('Lead', () => {
            const field = frappe.meta.get_docfield('Lead', 'custom_lead_qualification');

            this.qualificationOptions = (field && field.options ? field.options : '')
                .split('\n')
                .map(option => option.trim())
                .filter(Boolean);

            // Re-render once the options are available
            if (this.leads.length) {
                this.renderView();
            }
        });
    }

    fillFilterOptions() {
        this.fillSelect('#ch-company', this.filterOptions.companies, 'Select Company');
        this.fillSelect('#ch-region', this.filterOptions.regions, 'All Regions');
        this.fillSelect('#ch-vertical', this.filterOptions.service_verticals, 'All Service Verticals');
    }

    fillSelect(selector, values, placeholder) {
        const $select = this.$main.find(selector);
        const current = $select.val();

        $select.empty().append($('<option>').val('').text(placeholder));

        (values || []).forEach(value => {
            const label = typeof value === 'object'
                ? (value.label || value.name || value.value || '')
                : value;

            const val = typeof value === 'object'
                ? (value.value || value.name || value.label || '')
                : value;

            if (!val) return;

            $select.append($('<option>').val(val).text(label));
        });

        if (current && $select.find(`option[value="${this.escapeSelector(current)}"]`).length) {
            $select.val(current);
        }
    }

    escapeSelector(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    applyFilters() {
        this.filters = {
            company: this.$main.find('#ch-company').val() || '',
            region: this.$main.find('#ch-region').val() || '',
            service_vertical: this.$main.find('#ch-vertical').val() || ''
        };

        if (!this.filters.company && !this.filters.region && !this.filters.service_vertical) {
            frappe.msgprint('Please select at least one filter.');
            return;
        }

        this.loadHierarchy();
    }

    clearFilters() {
        this.filters = { company: '', region: '', service_vertical: '' };

        this.$main.find('#ch-company, #ch-region, #ch-vertical').val('');
        this.leads = [];
        this.updateKPIs();
        this.$main.find('#ch-active-path').text('Awaiting filters');

        this.$main.find('#ch-view').html(`
            <div class="ch-empty">
                <div class="ch-empty-icon">🌐</div>
                <strong>Explore your client hierarchy</strong>
                <p>Select a company, region or service vertical and click Apply Filters.</p>
            </div>
        `);
    }

    loadHierarchy() {
        if (this.loading) return;

        this.loading = true;
        this.$main.find('#ch-view').addClass('ch-loading').html(`
            <div class="ch-empty">
                <div class="ch-empty-icon">⏳</div>
                <strong>Loading client hierarchy...</strong>
                <p>Please wait while we prepare your hierarchy.</p>
            </div>
        `);

        frappe.call({
            method: this.api.hierarchy,
            args: {
                company: this.filters.company || null,
                region: this.filters.region || null,
                service_vertical: this.filters.service_vertical || null
            },
            freeze: false,
            callback: (r) => {
                this.loading = false;
                this.$main.find('#ch-view').removeClass('ch-loading');

                if (!r.message) {
                    this.leads = [];
                    this.updateKPIs();
                    this.showEmpty('No data returned', 'The server returned an empty response.');
                    return;
                }

                this.leads = r.message.leads || [];
                this.updateKPIs();

                this.$main.find('#ch-active-path').text(
                    [this.filters.company, this.filters.region, this.filters.service_vertical]
                        .filter(Boolean).join('  >  ') || 'Filtered hierarchy'
                );

                this.renderView();
            },
            error: () => {
                this.loading = false;
                this.$main.find('#ch-view').removeClass('ch-loading');
                this.showEmpty('Unable to load hierarchy', 'Please check the server response and try again.');
            }
        });
    }

    updateKPIs() {
        const companies = new Set();
        const regions = new Set();
        const verticals = new Set();

        this.leads.forEach(lead => {
            if (lead.custom_client_company) companies.add(lead.custom_client_company);
            if (lead.custom_region_name) regions.add(lead.custom_region_name);
            this.getLeadVerticals(lead).forEach(v => verticals.add(v));
        });

        this.$main.find('#ch-kpi-companies').text(companies.size);
        this.$main.find('#ch-kpi-leads').text(this.leads.length);
        this.$main.find('#ch-kpi-regions').text(regions.size);
        this.$main.find('#ch-kpi-verticals').text(verticals.size);
    }

    getLeadVerticals(lead) {
        let values = lead.service_verticals || lead.custom_service_verticals || [];

        if (!Array.isArray(values)) {
            values = [values];
        }

        return values.map(item => {
            if (typeof item === 'object' && item !== null) {
                return item.service_vertical ||
                    item.service_vertical_item ||
                    item.vertical ||
                    item.name ||
                    '';
            }
            return item;
        }).filter(Boolean);
    }

    // Company > Region > Vertical > Qualification > [leads]
    getGroups() {
        const companies = new Map();
        const search = this.search;

        this.leads.forEach(lead => {
            const company = lead.custom_client_company || 'Unassigned Company';
            const region = lead.custom_region_name || 'Unassigned Region';
            const qualification = lead.custom_lead_qualification || 'Unqualified';
            const verticals = this.getLeadVerticals(lead);

            const searchable = [
                company, region, qualification,
                lead.lead_name, lead.name, lead.job_title, lead.lead_owner,
                ...verticals
            ].join(' ').toLowerCase();

            if (search && !searchable.includes(search)) return;

            if (!companies.has(company)) companies.set(company, new Map());
            const regions = companies.get(company);

            if (!regions.has(region)) regions.set(region, new Map());
            const verticalMap = regions.get(region);

            const leadVerticals = verticals.length ? verticals : ['Unassigned Vertical'];

            leadVerticals.forEach(vertical => {
                if (!verticalMap.has(vertical)) verticalMap.set(vertical, new Map());
                const qualifications = verticalMap.get(vertical);

                if (!qualifications.has(qualification)) qualifications.set(qualification, []);
                qualifications.get(qualification).push(lead);
            });
        });

        return companies;
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    renderView() {
        if (!this.leads.length) {
            this.showEmpty('No matching leads', 'No leads were found for the selected filters.');
            return;
        }

        const groups = this.getGroups();

        if (this.search && !groups.size) {
            this.showEmpty('No matching nodes', 'Try another search term.');
            return;
        }

        if (this.view === 'tree') {
            this.renderTree(groups);
        } else if (this.view === 'mindmap') {
            this.renderMindMap(groups);
        } else {
            this.renderTable();
        }
    }

    // One corporate colour per qualification position (same option = same colour)
    getLevelColor(index) {
        const palette = ['#0878ed', '#b64ce5', '#22bd60', '#ff9200', '#00a3a3', '#e5486b'];
        return palette[index % palette.length];
    }

    normalizeQualification(value) {
        return String(value || '').trim().toLowerCase();
    }

    /* ---------------- Interactive tree ---------------- */

    renderTree(groups) {
        let html = '';
        const qualificationOptions = this.qualificationOptions || [];
        const normalize = v => this.normalizeQualification(v);

        groups.forEach((regions, company) => {
            const companyId = this.safeId(company);
            const companyLeadCount = this.countCompanyLeads(regions);

            html += `
                <div class="ch-tree-root">
                    <div class="ch-tree-company">
                        <button class="ch-tree-toggle" data-target="company-${companyId}">
                            ${this.expanded ? '−' : '+'}
                        </button>
                        <div class="ch-company-avatar">${this.escape(company.charAt(0).toUpperCase())}</div>
                        <div class="ch-company-info">
                            <strong>${this.escape(company)}</strong>
                            <span class="ch-parent-tag">HQ Parent</span>
                            <small>${regions.size} Regions · ${companyLeadCount} Leads</small>
                        </div>
                        <span class="ch-status-tag">Global Active</span>
                    </div>

                    <div class="ch-tree-children ${this.expanded ? '' : 'ch-hidden'}"
                         data-container="company-${companyId}">
            `;

            regions.forEach((verticalMap, region) => {
                const regionCount = this.countRegionLeads(verticalMap);

                html += `
                    <div class="ch-region-card">
                        <div class="ch-region-header">
                            <div class="ch-region-icon">📍</div>
                            <div class="ch-region-name">${this.escape(region)}</div>
                            <span class="ch-region-count">${regionCount} Active Leads</span>
                        </div>
                `;

                verticalMap.forEach((qualifications, vertical) => {
                    html += `
                        <div class="ch-vertical-block">
                            <div class="ch-vertical-heading">
                                <i class="ch-color-dot" style="background:#b64ce5"></i>
                                ${this.escape(vertical)}
                            </div>
                    `;

                    // Case-insensitive lookup of leads by qualification
                    const qualificationMap = new Map();
                    qualifications.forEach((leads, qualification) => {
                        qualificationMap.set(normalize(qualification), { label: qualification, leads });
                    });

                    const renderedQualifications = new Set();

                    // Option order defines depth: first option on top,
                    // every next option is nested inside the previous one.
                    // Only levels that actually have leads are shown.
                    // The number keeps its original position in the options.
                    const activeIndexes = [];
                    qualificationOptions.forEach((qualification, index) => {
                        const key = normalize(qualification);
                        const group = qualificationMap.get(key);
                        renderedQualifications.add(key);
                        if (group && group.leads.length) activeIndexes.push(index);
                    });

                    const renderLevel = (pos, nested = false) => {
                        if (pos >= activeIndexes.length) return '';

                        const index = activeIndexes[pos];
                        const qualification = qualificationOptions[index];
                        const leads = qualificationMap.get(normalize(qualification)).leads;

                        let levelHtml = `
                            <div class="ch-qualification-level ${nested ? 'ch-nested-qualification' : ''}"
                                 style="--lvl:${this.getLevelColor(index)}">
                                <div class="ch-qualification-heading">
                                    <span>${index + 1}.</span>
                                    <strong>${this.escape(qualification)}</strong>
                                    <span class="ch-qualification-count">${leads.length}</span>
                                </div>
                        `;

                        leads.forEach(lead => {
                            levelHtml += this.renderLeadRow(lead);
                        });

                        levelHtml += renderLevel(pos + 1, true);
                        levelHtml += `</div>`;

                        return levelHtml;
                    };

                    if (activeIndexes.length) {
                        html += renderLevel(0);
                    }

                    // Leads whose qualification is not in the field options
                    qualifications.forEach((leads, qualification) => {
                        if (renderedQualifications.has(normalize(qualification))) return;

                        html += `
                            <div class="ch-qualification-level" style="--lvl:#6b7280">
                                <div class="ch-qualification-heading">
                                    <strong>${this.escape(qualification)}</strong>
                                    <span class="ch-qualification-count">${leads.length}</span>
                                </div>
                        `;

                        leads.forEach(lead => {
                            html += this.renderLeadRow(lead);
                        });

                        html += `</div>`;
                    });

                    html += `</div>`;
                });

                html += `</div>`;
            });

            html += `</div></div>`;
        });

        this.$main.find('#ch-view').html(html);
        this.updateZoom();
    }

    renderLeadRow(lead) {
        const name = lead.lead_name ||
            [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
            lead.name;

        const role = lead.job_title || lead.lead_owner || 'Lead';

        return `
            <div class="ch-lead-row" data-name="${this.escape(lead.name)}">
                <div class="ch-lead-avatar">${this.escape((name || 'L').charAt(0).toUpperCase())}</div>
                <div class="ch-lead-name">${this.escape(name)}</div>
                <div class="ch-lead-meta">${this.escape(role)}</div>
                <span class="ch-lead-open">Inspect →</span>
            </div>
        `;
    }

    /* ---------------- Mind map ---------------- */

    // Company > Region > Service Vertical > Qualification 1 > Qualification 2 > ... > Leads
    renderMindMap(groups) {
        const opts = this.qualificationOptions || [];
        const norm = v => this.normalizeQualification(v);

        // children are passed in as already-built HTML
        const node = (cls, label, sub = '', children = '', name = '', lvl = '') => `
            <div class="ch-mm-wrap">
                <div class="ch-mm-node ${cls}" ${lvl ? `style="--lvl:${lvl}"` : ''} ${name ? `data-name="${this.escape(name)}"` : ''}>
                    <strong>${label}</strong>${sub ? `<small>${sub}</small>` : ''}
                </div>
                ${children ? `<div class="ch-mm-children">${children}</div>` : ''}
            </div>`;

        const leadNodes = leads => leads.map(l =>
            node(
                'lead',
                this.escape(l.lead_name || l.name),
                this.escape(l.job_title || ''),
                '',
                l.name
            )
        ).join('');

        // First option = top, each next option nested inside the previous
        // Levels with no leads are skipped; numbers keep their original position
        const qualChain = (qmap, pos, active) => {
            if (pos >= active.length) return '';

            const index = active[pos];
            const q = opts[index];
            const leads = qmap.get(norm(q)).leads;
            const kids = leadNodes(leads) + qualChain(qmap, pos + 1, active);

            return node('qual', `${index + 1}. ${this.escape(q)}`, `${leads.length} lead(s)`, kids, '', this.getLevelColor(index));
        };

        const known = new Set(opts.map(norm));
        let companiesHtml = '';

        groups.forEach((regions, company) => {
            let regionsHtml = '';

            regions.forEach((verticalMap, region) => {
                let verticalsHtml = '';

                verticalMap.forEach((qualifications, vertical) => {
                    const qmap = new Map();
                    qualifications.forEach((leads, q) => qmap.set(norm(q), { label: q, leads }));

                    const active = [];
                    opts.forEach((q, i) => {
                        const g = qmap.get(norm(q));
                        if (g && g.leads.length) active.push(i);
                    });

                    let kids = qualChain(qmap, 0, active);

                    // Qualifications that are not in the field options
                    qualifications.forEach((leads, q) => {
                        if (known.has(norm(q))) return;
                        kids += node('qual', this.escape(q), `${leads.length} lead(s)`, leadNodes(leads));
                    });

                    verticalsHtml += node('vertical', this.escape(vertical), '', kids);
                });

                regionsHtml += node(
                    'region',
                    `🌍 ${this.escape(region)}`,
                    `${this.countRegionLeads(verticalMap)} Leads`,
                    verticalsHtml
                );
            });

            companiesHtml += node(
                'company',
                `🏢 ${this.escape(company)}`,
                `${this.countCompanyLeads(regions)} Leads`,
                regionsHtml
            );
        });

        this.$main.find('#ch-view').html(`
            <div class="ch-mindmap">
                <div class="ch-mindmap-layout" id="ch-mindmap-layout">
                    ${companiesHtml}
                </div>
            </div>
        `);

        this.updateZoom();
    }

    /* ---------------- Table ---------------- */

    renderTable() {
        const rows = this.leads.filter(lead => {
            if (!this.search) return true;

            const text = [
                lead.name, lead.lead_name,
                lead.custom_client_company, lead.custom_region_name,
                lead.job_title, lead.custom_lead_qualification, lead.lead_owner,
                ...this.getLeadVerticals(lead)
            ].join(' ').toLowerCase();

            return text.includes(this.search);
        });

        // Sort by qualification option order so the top level comes first
        const opts = (this.qualificationOptions || []).map(o => this.normalizeQualification(o));
        const rank = lead => {
            const i = opts.indexOf(this.normalizeQualification(lead.custom_lead_qualification));
            return i === -1 ? opts.length : i;
        };
        rows.sort((a, b) => rank(a) - rank(b));

        let html = `
            <div class="ch-table-wrap">
                <div class="ch-table-heading">
                    <div>
                        <strong>HIERARCHY REGISTRY DATA</strong>
                        <small>Tabular inventory of company entities, regional territories and stakeholders</small>
                    </div>
                    <small style="color:var(--ch-muted)">Showing ${rows.length} lead records</small>
                </div>

                <div class="ch-table-scroll">
                    <table class="ch-table">
                        <thead>
                            <tr>
                                <th>Entity</th>
                                <th>Region Hub</th>
                                <th>Vertical</th>
                                <th>Stakeholder</th>
                                <th>Role</th>
                                <th>Qualification</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        rows.forEach(lead => {
            const verticals = this.getLeadVerticals(lead);
            const name = lead.lead_name ||
                [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
                lead.name;

            html += `
                <tr>
                    <td><strong>${this.escape(lead.custom_client_company || '—')}</strong></td>
                    <td><span class="ch-region-pill">${this.escape(lead.custom_region_name || '—')}</span></td>
                    <td>${this.escape(verticals.join(', ') || '—')}</td>
                    <td>${this.escape(name)}</td>
                    <td>${this.escape(lead.job_title || '—')}</td>
                    <td>${this.escape(lead.custom_lead_qualification || '—')}</td>
                    <td>
                        <button class="ch-inspect" data-name="${this.escape(lead.name)}">Inspect</button>
                    </td>
                </tr>
            `;
        });

        if (!rows.length) {
            html += `<tr><td colspan="7" style="text-align:center;color:var(--ch-muted)">No matching leads</td></tr>`;
        }

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.$main.find('#ch-view').html(html);
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    countCompanyLeads(regions) {
        let count = 0;
        regions.forEach(verticalMap => {
            count += this.countRegionLeads(verticalMap);
        });
        return count;
    }

    countRegionLeads(verticalMap) {
        let count = 0;
        verticalMap.forEach(qualifications => {
            qualifications.forEach(leads => {
                count += leads.length;
            });
        });
        return count;
    }

    updateZoom() {
        this.$main.find('#ch-zoom-value').text(this.zoom + '%');

        this.$main.find('.ch-mindmap-layout').css('transform', `scale(${this.zoom / 100})`);
        this.$main.find('.ch-tree-root').css('zoom', this.zoom / 100);
    }

    showEmpty(title, description) {
        this.$main.find('#ch-view').html(`
            <div class="ch-empty">
                <div class="ch-empty-icon">🌐</div>
                <strong>${this.escape(title)}</strong>
                <p>${this.escape(description)}</p>
            </div>
        `);
    }

    exportCSV() {
        if (!this.leads.length) {
            frappe.msgprint('There is no hierarchy data to export. Apply filters first.');
            return;
        }

        const headers = [
            'Lead ID', 'Lead Name', 'Company', 'Region', 'Service Verticals',
            'Qualification', 'Lead Stage', 'Job Title', 'Lead Owner', 'Email', 'Mobile'
        ];

        const rows = this.leads.map(lead => [
            lead.name,
            lead.lead_name || '',
            lead.custom_client_company || '',
            lead.custom_region_name || '',
            this.getLeadVerticals(lead).join(', '),
            lead.custom_lead_qualification || '',
            lead.custom_lead_stage || '',
            lead.job_title || '',
            lead.lead_owner || '',
            lead.email_id || '',
            lead.mobile_no || ''
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(value =>
                `"${String(value ?? '').replace(/"/g, '""')}"`
            ).join(','))
            .join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = 'client-hierarchy.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    safeId(value) {
        return btoa(unescape(encodeURIComponent(String(value))))
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    escape(value) {
        return frappe.utils.escape_html(String(value ?? ''));
    }
}