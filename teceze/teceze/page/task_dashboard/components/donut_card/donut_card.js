// =====================================================================
// Donut card — a pie (donut) chart with a legend, inside a card.
//
//   teceze.ui.donut_card({
//       title: 'Task status',
//       info: 'Share of tasks by status',      // tooltip on an (i) icon, optional
//       badge: '3 active tasks', badge_color: 'blue',   // optional
//       caption: 'Tasks',                      // under the total in the middle
//       segments: [ { label: 'Open', value: 2, color: 'blue' }, ... ],
//       extra_html: teceze.ui.stat_tiles({...}),         // optional, below the chart
//       footer: { label: 'Resolution rate', value: '25% Completed', color: 'green' },
//       empty_text: 'No tasks assigned yet'
//   })
//
// The total is the sum of all segments. Segments with value 0 stay in
// the legend but are not drawn in the ring.
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/donut_card/tc_donut_card.html" %}
teceze.ui.add_style('tc-donut-card', `{% include "teceze/teceze/page/task_dashboard/components/donut_card/donut_card.css" %}`);

teceze.ui.donut_card = function (opts) {
	var ui = teceze.ui;
	var segments = opts.segments || [];
	var total = segments.reduce(function (sum, s) { return sum + (Number(s.value) || 0); }, 0);

	// each slice starts where the previous one ended (the ring is 100 units long)
	var start = 0;
	var slices = segments.filter(function (s) { return s.value > 0; }).map(function (s) {
		var share = s.value / total * 100;
		var slice = {
			color_cls: ui.color_class(s.color).trim(),
			dash: share + ' ' + (100 - share),
			offset: -start,
			title: ui.esc(s.label) + ': ' + s.value + ' (' + ui.percent(s.value, total) + '%)'
		};
		start += share;
		return slice;
	});

	return ui.render('tc_donut_card', {
		title: ui.esc(opts.title),
		info: opts.info ? ui.esc(opts.info) : '',
		info_icon: ui.icon('info'),
		badge: opts.badge ? ui.esc(opts.badge) : '',
		badge_cls: ui.color_class(opts.badge_color),
		total: total,
		caption: ui.esc(opts.caption || ''),
		slices: slices,
		legend: segments.map(function (s) {
			return {
				label: ui.esc(s.label),
				value: s.value || 0,
				pct: ui.percent(s.value || 0, total).toFixed(1),
				color_cls: ui.color_class(s.color)
			};
		}),
		extra_html: opts.extra_html || '',
		footer: opts.footer ? {
			label: ui.esc(opts.footer.label),
			value: ui.esc(opts.footer.value),
			color_cls: ui.color_class(opts.footer.color).trim()
		} : null,
		empty_text: ui.esc(opts.empty_text || 'Nothing to show')
	});
};
