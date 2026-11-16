// =====================================================================
// Stat tiles — a row of small boxes, each with a number and a coloured label.
//
//   teceze.ui.stat_tiles({
//       title: 'Active tasks by priority',     // optional
//       tiles: [ { value: 3, label: 'High', color: 'orange' }, ... ],
//       columns: 4                             // optional, default: one per tile
//   })
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/stat_tiles/tc_stat_tiles.html" %}
teceze.ui.add_style('tc-stat-tiles', `{% include "teceze/teceze/page/task_dashboard/components/stat_tiles/stat_tiles.css" %}`);

teceze.ui.stat_tiles = function (opts) {
	var ui = teceze.ui;
	var tiles = opts.tiles || [];
	return ui.render('tc_stat_tiles', {
		title: opts.title ? ui.esc(opts.title) : '',
		columns: Number(opts.columns) || tiles.length || 1,
		tiles: tiles.map(function (t) {
			return {
				value: ui.esc(t.value),
				label: ui.esc(t.label),
				color_cls: ui.color_class(t.color)
			};
		})
	});
};
