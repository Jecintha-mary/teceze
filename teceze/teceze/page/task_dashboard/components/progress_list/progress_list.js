// =====================================================================
// Progress list — a card of rows, each with a label, a value and a bar.
//
//   teceze.ui.progress_list({
//       title: 'Tasks by project',
//       meta: '2 projects',                       // small text on the right
//       items: [{
//           label: 'PROJ-0001 • Portal',
//           value_text: '5 tasks (62.5%)',
//           percent: 62.5,                        // bar width, 0-100
//           color: 'blue',                        // optional (brand colour if none)
//           tags: [ { label: 'Sprint 01', color: 'green' } ]   // optional pills
//       }],
//       empty_text: 'No projects to show'
//   })
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/progress_list/tc_progress_list.html" %}
teceze.ui.add_style('tc-progress-list', `{% include "teceze/teceze/page/task_dashboard/components/progress_list/progress_list.css" %}`);

teceze.ui.progress_list = function (opts) {
	var ui = teceze.ui;
	return ui.render('tc_progress_list', {
		title: ui.esc(opts.title),
		meta: ui.esc(opts.meta || ''),
		empty_text: ui.esc(opts.empty_text || 'Nothing to show'),
		items: (opts.items || []).map(function (it) {
			return {
				label: ui.esc(it.label),
				value_text: ui.esc(it.value_text),
				percent: Math.max(0, Math.min(100, Number(it.percent) || 0)),
				color_cls: ui.color_class(it.color),
				tags: (it.tags || []).map(function (tg) {
					return { label: ui.esc(tg.label), color_cls: ui.color_class(tg.color) };
				})
			};
		})
	});
};
