// =====================================================================
// Data table — a card with a title, an optional count pill, optional
// filters, the table itself and an optional pager underneath.
//
//   var columns = [
//       { label: 'Task', html: function (row) { return '<a ...>' + teceze.ui.esc(row.name) + '</a>'; } },
//       { label: 'Subject', field: 'subject', cls: 'my-wide-col' },
//       { label: 'Due', html: ..., cls: 'tc-num',            // tc-num = right aligned
//         cell_cls: function (row) { return row.late ? 'tc-text-danger' : ''; } }
//   ];
//
//   teceze.ui.data_table({
//       key: 'tasks',                     // set as data-table="tasks" on the card
//       title: 'Tasks', count_label: '12 items',
//       columns: columns, rows: rows, empty_text: 'No tasks assigned',
//       actions_html: '...',              // right side of the header (e.g. filter chips)
//       toolbar_html: '...',              // a row under the header (e.g. more chips)
//       footer: [ { text: 'Total', colspan: 3 }, { text: '29.50 hrs', cls: 'tc-num' } ],
//       pager_html: teceze.ui.pagination(page_info),
//       scroll_rows: 10                   // show 10 rows, scroll inside the table for more
//   })
//
//   With scroll_rows, call this once the card is on the page (it measures
//   the real row heights, so exactly N rows show whatever their height):
//   teceze.ui.data_table.fit_height($container)
//
//   A column shows either row[field] (escaped) or the HTML from html(row).
//
//   To change one part later without redrawing the card:
//   teceze.ui.data_table.update($card, { rows, columns, empty_text, count_label, pager_html })
//   teceze.ui.data_table.loading($card, true / false)
// =====================================================================
 {% include "teceze/teceze/page/task_dashboard/components/data_table/tc_data_table.html" %}
teceze.ui.add_style('tc-data-table', `{% include "teceze/teceze/page/task_dashboard/components/data_table/data_table.css" %}`);

teceze.ui.data_table = function (opts) {
	var ui = teceze.ui;
	var columns = opts.columns || [];
	return ui.render('tc_data_table', {
		key: ui.esc(opts.key || ''),
		title: ui.esc(opts.title),
		count_label: opts.count_label ? ui.esc(opts.count_label) : '',
		actions_html: opts.actions_html || '',
		toolbar_html: opts.toolbar_html || '',
		columns: columns.map(function (c) {
			return { label: ui.esc(c.label), cls: c.cls || '' };
		}),
		body_html: teceze.ui.data_table.body_html(columns, opts.rows || [], opts.empty_text),
		footer_html: teceze.ui.data_table.footer_html(opts.footer),
		pager_html: opts.pager_html || '',
		scroll_rows: Number(opts.scroll_rows) || 0,
		scroll_cls: opts.scroll_rows ? ' tc-table-scroll' : ''
	});
};

// <tr> rows for the table body
teceze.ui.data_table.body_html = function (columns, rows, empty_text) {
	var ui = teceze.ui;
	if (!rows.length) {
		return '<tr><td colspan="' + columns.length + '" class="tc-empty">' +
			ui.esc(empty_text || 'Nothing to show') + '</td></tr>';
	}
	return rows.map(function (row) {
		return '<tr>' + columns.map(function (c) {
			var cls = [c.cls, c.cell_cls ? c.cell_cls(row) : ''].filter(Boolean).join(' ');
			var content = c.html ? c.html(row) : ui.esc(row[c.field]);
			return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + content + '</td>';
		}).join('') + '</tr>';
	}).join('');
};

// one footer row: [{ text | html, colspan, cls }]
teceze.ui.data_table.footer_html = function (cells) {
	var ui = teceze.ui;
	if (!cells || !cells.length) return '';
	return '<tr>' + cells.map(function (c) {
		return '<td' + (c.colspan ? ' colspan="' + c.colspan + '"' : '') +
			(c.cls ? ' class="' + c.cls + '"' : '') + '>' +
			(c.html != null ? c.html : ui.esc(c.text)) + '</td>';
	}).join('') + '</tr>';
};

// redraw parts of an existing table card
teceze.ui.data_table.update = function ($card, parts) {
	if (parts.rows) {
		$card.find('.tc-table-body').html(teceze.ui.data_table.body_html(parts.columns, parts.rows, parts.empty_text));
	}
	if (parts.count_label != null) $card.find('.tc-table-count').text(parts.count_label);
	if (parts.pager_html != null) $card.find('.tc-table-pager').html(parts.pager_html);
	if (parts.rows) {
		$card.find('.tc-table-scroll').scrollTop(0);  // new rows start at the top
		teceze.ui.data_table.fit_height($card);
	}
};

// Cap each scrolling table at the height of its header + first N rows + footer.
// Rows are measured, not assumed, because they differ in height (pills, wrapped text).
teceze.ui.data_table.fit_height = function ($container) {
	$container.find('.tc-table-scroll').each(function () {
		var wrap = this;
		var max_rows = Number(wrap.getAttribute('data-scroll-rows')) || 0;
		var rows = wrap.querySelectorAll('tbody tr');
		if (!max_rows || rows.length <= max_rows) {
			wrap.style.maxHeight = '';  // short enough: no scrolling
			return;
		}
		if (!wrap.offsetParent) return;  // hidden right now: measure again when shown

		var head = wrap.querySelector('thead');
		var foot = wrap.querySelector('tfoot');
		var height = (head ? head.offsetHeight : 0) + (foot ? foot.offsetHeight : 0);
		for (var i = 0; i < max_rows; i++) height += rows[i].offsetHeight;
		wrap.style.maxHeight = height + 'px';
	});
};

teceze.ui.data_table.loading = function ($card, is_loading) {
	$card.toggleClass('is-loading', !!is_loading);
};
