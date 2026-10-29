/* Shared CRM dashboard visual components. Keep chart/table rendering here for reuse. */
window.CRMCharts = (() => {
    const esc = value => frappe.utils.escape_html(String(value ?? ""));
    const empty = (message = "No data available for this period") => `<div class="crm-viz-empty"><span class="crm-viz-empty-mark">—</span><span>${esc(message)}</span></div>`;
    const palette = ["#3157D5", "#159A8C", "#8B73D6", "#D99536", "#D45E70", "#4D91B8", "#7B8798"];

    function barChart(items, options = {}) {
        const rows = (items || []).filter(item => Number.isFinite(Number(item.value)));
        if (!rows.length) return empty(options.emptyMessage);
        const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
        return `<div class="crm-chart crm-bar-chart ${options.compact ? "is-compact" : ""}">${rows.map((row, i) => {
            const value = Math.max(0, Number(row.value) || 0);
            const width = value ? Math.max(1.5, value / max * 100) : 0;
            return `<div class="crm-chart-bar-row"><div class="crm-chart-bar-meta"><span class="crm-chart-label" title="${esc(row.name)}">${esc(row.name)}</span><strong>${esc(options.format ? options.format(value) : value.toLocaleString())}</strong></div><div class="crm-chart-track"><span style="width:${width}%;background:${palette[i % palette.length]}"></span></div></div>`;
        }).join("")}</div>`;
    }

    function lineChart(items, options = {}) {
        const rows = (items || []).filter(item => Number.isFinite(Number(item.value)));
        if (!rows.length) return empty(options.emptyMessage);
        const width = 760, height = 230, left = 42, right = 18, top = 18, bottom = 36;
        const plotW = width - left - right, plotH = height - top - bottom;
        const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
        const min = Math.min(0, ...rows.map(row => Number(row.value) || 0));
        const span = Math.max(1, max - min);
        const x = i => left + (rows.length === 1 ? plotW / 2 : i * plotW / (rows.length - 1));
        const y = v => top + plotH - ((Number(v) - min) / span) * plotH;
        const points = rows.map((row, i) => `${x(i)},${y(row.value)}`).join(" ");
        const grid = [0, .25, .5, .75, 1].map(p => {
            const yy = top + plotH * p;
            const value = max - (max - min) * p;
            return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="crm-chart-grid"/><text x="${left-9}" y="${yy+4}" text-anchor="end" class="crm-chart-axis">${esc(options.compact ? value.toLocaleString(undefined,{notation:"compact",maximumFractionDigits:1}) : Math.round(value).toLocaleString())}</text>`;
        }).join("");
        const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
        const labels = rows.map((row, i) => (i % labelEvery === 0 || i === rows.length - 1) ? `<text x="${x(i)}" y="${height-10}" text-anchor="middle" class="crm-chart-axis">${esc(row.label)}</text>` : "").join("");
        const valueText = value => options.format ? options.format(Number(value)) : Number(value).toLocaleString();
        const dots = rows.map((row, i) => `<circle cx="${x(i)}" cy="${y(row.value)}" r="4" class="crm-chart-dot"><title>${esc(row.label)} · ${esc(valueText(row.value))}</title></circle>`).join("");
        return `<div class="crm-chart crm-line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.ariaLabel || "Trend chart")}" preserveAspectRatio="xMidYMid meet">${grid}<polyline points="${points}" class="crm-chart-line"/>${dots}${labels}</svg></div>`;
    }


    function multiLineChart(items, series, options = {}) {
        const rows = items || [];
        if (!rows.length || !series.length) return empty(options.emptyMessage);
        const width=760,height=250,left=42,right=18,top=20,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
        const values=rows.flatMap(r=>series.map(s=>Number(r[s.key]||0)));
        const max=Math.max(1,...values), x=i=>left+(rows.length===1?plotW/2:i*plotW/(rows.length-1)), y=v=>top+plotH-(Number(v)/max)*plotH;
        const grid=[0,.25,.5,.75,1].map(p=>{const yy=top+plotH*p;return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="crm-chart-grid"/><text x="${left-9}" y="${yy+4}" text-anchor="end" class="crm-chart-axis">${Math.round(max*(1-p)).toLocaleString()}</text>`}).join("");
        const labelEvery=Math.max(1,Math.ceil(rows.length/7));
        const labels=rows.map((r,i)=>(i%labelEvery===0||i===rows.length-1)?`<text x="${x(i)}" y="${height-10}" text-anchor="middle" class="crm-chart-axis">${esc(r.label)}</text>`:"").join("");
        const lines=series.map((ser,j)=>{const points=rows.map((r,i)=>`${x(i)},${y(r[ser.key]||0)}`).join(" ");const dots=rows.map((r,i)=>{const value=Number(r[ser.key]||0);const moneyKey=ser.key==="leads"?"leadValue":(ser.key==="opportunities"?"opportunityValue":"quotationValue");const money=r[moneyKey];const moneyText=money===null||money===undefined?"Value unavailable":(options.currencyFormat?options.currencyFormat(money):Number(money).toLocaleString());return `<circle cx="${x(i)}" cy="${y(value)}" r="3.6" fill="${palette[j%palette.length]}" tabindex="0"><title>${esc(r.label)} · ${esc(ser.label)}: ${value.toLocaleString()} records · ${esc(moneyText)}</title></circle>`}).join("");return `<polyline points="${points}" fill="none" stroke="${palette[j%palette.length]}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>${dots}`}).join("");
        const legend=series.map((ser,j)=>`<span class="crm-multi-legend-item"><i style="background:${palette[j%palette.length]}"></i>${esc(ser.label)}</span>`).join("");
        return `<div class="crm-chart crm-line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.ariaLabel||'Multi-series trend chart')}" preserveAspectRatio="xMidYMid meet">${grid}${lines}${labels}</svg><div class="crm-multi-legend">${legend}</div></div>`;
    }
    function pieChart(items, options = {}) {
        const rows=(items||[]).filter(r=>Number(r.value)>0); if(!rows.length)return empty(options.emptyMessage);
        const total=rows.reduce((sum,r)=>sum+Number(r.value),0);let angle=-Math.PI/2;
        const slices=rows.map((r,i)=>{const value=Number(r.value),next=angle+value/total*Math.PI*2;const x1=100+78*Math.cos(angle),y1=100+78*Math.sin(angle),x2=100+78*Math.cos(next),y2=100+78*Math.sin(next),large=next-angle>Math.PI?1:0;const path=value===total?`<circle cx="100" cy="100" r="78" fill="${palette[i%palette.length]}"/>`:`<path d="M 100 100 L ${x1} ${y1} A 78 78 0 ${large} 1 ${x2} ${y2} Z" fill="${palette[i%palette.length]}"/>`;angle=next;return path}).join("");
        const legend=rows.map((r,i)=>`<div class="crm-pie-legend-row"><i style="background:${palette[i%palette.length]}"></i><span>${esc(r.name)}</span><strong>${Number(r.value).toLocaleString()}</strong><small>${(Number(r.value)/total*100).toFixed(1)}%</small></div>`).join("");
        return `<div class="crm-pie-layout"><svg viewBox="0 0 200 200" role="img" aria-label="${esc(options.ariaLabel||'Distribution pie chart')}">${slices}</svg><div class="crm-pie-legend">${legend}</div></div>`;
    }


    function dualMetricBarChart(items, options = {}) {
        const rows = (items || []).filter(row => row && row.name);
        if (!rows.length) return empty(options.emptyMessage);
        const maxCount = Math.max(1, ...rows.map(row => Number(row.count || 0)));
        const currencyFormat = (amounts) => {
            if (amounts && typeof amounts === "object") {
                const entries = Object.entries(amounts).filter(([,v]) => Number.isFinite(Number(v)));
                return entries.length ? entries.map(([currency,value]) => {
                    try { return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:0}).format(Number(value)); }
                    catch(e) { return `${currency} ${Number(value).toLocaleString()}`; }
                }).join(" · ") : "Value not available";
            }
            if (amounts === null || amounts === undefined || !Number.isFinite(Number(amounts))) return "Value not available";
            const currency = options.currency || "USD";
            try { return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:0}).format(Number(amounts)); }
            catch(e) { return `${currency} ${Number(amounts).toLocaleString()}`; }
        };
        return `<div class="crm-dual-chart">${rows.map((row,index)=>{
            const count = Math.max(0,Number(row.count||0));
            const amounts = row.amounts !== undefined ? row.amounts : row.value;
            const amountText = currencyFormat(amounts);
            const amountKnown = row.amounts ? Object.keys(row.amounts).length>0 : (row.value !== null && row.value !== undefined && Number.isFinite(Number(row.value)));
            const width = count ? Math.max(1.5,count/maxCount*100) : 0;
            const tooltip = `${row.name}: ${count} ${options.countLabel||"records"}; ${options.valueLabel||"Value"}: ${amountText}`;
            return `<div class="crm-dual-row" style="--row-delay:${index*45}ms" title="${esc(tooltip)}"><div class="crm-dual-top"><span class="crm-dual-name">${esc(row.name)}</span><span class="crm-dual-count">${count.toLocaleString()} <small>${esc(options.countLabel||"records")}</small></span></div><div class="crm-dual-track"><span style="width:${width}%;--bar-color:${palette[index%palette.length]}"></span></div><div class="crm-dual-value"><span>${esc(options.valueLabel||row.valueLabel||"Commercial value")}</span><strong>${esc(amountText)}</strong></div></div>`;
        }).join("")}</div>`;
    }

    function dataTable(headers, rows, options = {}) {
        const body = (rows || []).length ? rows.join("") : `<tr><td colspan="${headers.length}" class="crm-empty">${esc(options.emptyMessage || "No records found for this date range.")}</td></tr>`;
        return `<div class="crm-table-scroll"><table class="crm-data-table ${options.dense ? "is-dense" : ""}"><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function metricCard(label, value, note, icon = "") {
        return `<article class="crm-metric-card"><div class="crm-metric-heading"><span>${label}</span><span class="crm-metric-icon" aria-hidden="true">${icon}</span></div><div class="crm-metric-value">${value}</div><div class="crm-metric-note">${note}</div></article>`;
    }

    return { barChart, lineChart, multiLineChart, pieChart, dualMetricBarChart, dataTable, metricCard, empty };
})();
