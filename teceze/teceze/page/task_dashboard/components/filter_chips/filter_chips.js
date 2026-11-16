// =====================================================================
// Filter chips — pill buttons where one is active, with an "All" chip first.
//
//   teceze.ui.filter_chips({
//       name: 'status',                         // used to listen for clicks
//       label: 'Sprint',                        // optional text before the chips
//       all_label: 'All (12)',                  // first chip, value ''
//       items: [ { value: 'Open', label: 'Open (3)' }, ... ],
//       active: 'Open',                         // value of the active chip ('' = All)
//       row: true                               // full-width row style (optional)
//   })
//
//   teceze.ui.filter_chips.on_change($container, 'status', function (value) { ... });
//   Bind once on a container that stays on the page; it keeps working
//   after the chips are redrawn.
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/filter_chips/tc_filter_chips.html" %}
teceze.ui.add_style('tc-filter-chips', `{% include "teceze/teceze/page/task_dashboard/components/filter_chips/filter_chips.css" %}`);

teceze.ui.filter_chips = function (opts) {
	var ui = teceze.ui;
	var active = opts.active || '';
	var chips = [{ value: '', label: opts.all_label || __('All') }].concat(opts.items || []);
	return ui.render('tc_filter_chips', {
		name: ui.esc(opts.name),
		label: opts.label ? ui.esc(opts.label) : '',
		row_cls: opts.row ? ' tc-chips-row' : '',
		chips: chips.map(function (c) {
			return {
				value: ui.esc(c.value),
				label: ui.esc(c.label),
				active_cls: (c.value || '') === active ? ' active' : ''
			};
		})
	});
};

teceze.ui.filter_chips.on_change = function ($container, name, callback) {
	$container.on('click', '[data-chips="' + name + '"] .tc-chip', function () {
		$(this).siblings('.tc-chip').removeClass('active');
		$(this).addClass('active');
		callback($(this).attr('data-value') || '');
	});
};
