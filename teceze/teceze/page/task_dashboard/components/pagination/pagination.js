// =====================================================================
// Pagination — "Showing 21–40 of 87", a "Rows per page" select, and
// Previous / page numbers / Next.
//
//   teceze.ui.pagination({ page: 2, pages: 5, page_size: 20, total: 87 },
//                        { noun: 'Task', sizes: [5, 20, 50, 100] })
//   (the same shape the backend's paged endpoints return)
//   sizes: choices for "Rows per page" (leave out to hide the select)
//
//   teceze.ui.pagination.on_change($container, function (page, button) { ... });
//   teceze.ui.pagination.on_page_size($container, function (size, select) { ... });
//   Bind once on a container that stays on the page.
//
//   teceze.ui.pagination.page_for_size(page, old_size, new_size)
//   -> the page that still shows the first row you were looking at
//
// Hidden when there are no rows. Long lists show 1 … 4 5 6 … 12.
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/pagination/tc_pagination.html" %}
teceze.ui.add_style('tc-pagination', `{% include "teceze/teceze/page/task_dashboard/components/pagination/pagination.css" %}`);

teceze.ui.pagination = function (pg, opts) {
	var ui = teceze.ui;
	opts = opts || {};
	var from = pg.total ? (pg.page - 1) * pg.page_size + 1 : 0;
	var to = Math.min(pg.page * pg.page_size, pg.total);

	// "Rows per page" choices; the current size is always one of them
	var sizes = (opts.sizes || []).slice();
	if (sizes.length && sizes.indexOf(pg.page_size) === -1) sizes.push(pg.page_size);
	sizes.sort(function (a, b) { return a - b; });

	return ui.render('tc_pagination', {
		total: pg.total,
		sizes: sizes.map(function (z) {
			return { value: z, selected: z === pg.page_size ? 'selected' : '' };
		}),
		aria: ui.esc((opts.noun || 'Table') + ' pages'),
		info: 'Showing ' + from + '–' + to + ' of ' + pg.total,
		prev_icon: ui.icon('prev'),
		next_icon: ui.icon('next'),
		prev: pg.page - 1,
		next: pg.page + 1,
		prev_disabled: pg.page <= 1 ? 'disabled' : '',
		next_disabled: pg.page >= pg.pages ? 'disabled' : '',
		items: teceze.ui.pagination.page_numbers(pg.page, pg.pages).map(function (it) {
			if (it.gap) return it;
			var current = it.page === pg.page;
			return {
				page: it.page,
				cls: current ? ' active' : '',
				current: current ? 'aria-current="page"' : ''
			};
		})
	});
};

// Pages to show: always the first and last, plus the pages around the
// current one, with a gap (…) where pages are skipped: 1 … 4 5 6 … 12
teceze.ui.pagination.page_numbers = function (current, pages) {
	var out = [], last = 0;
	for (var p = 1; p <= pages; p++) {
		if (p === 1 || p === pages || Math.abs(p - current) <= 1) {
			if (last && p - last > 1) out.push({ gap: true });
			out.push({ page: p });
			last = p;
		}
	}
	return out;
};

teceze.ui.pagination.on_change = function ($container, callback) {
	$container.on('click', '.tc-page-btn', function () {
		var page = Number($(this).attr('data-page'));
		if (!page || $(this).prop('disabled')) return;
		callback(page, this);
	});
};

teceze.ui.pagination.on_page_size = function ($container, callback) {
	$container.on('change', '.tc-page-size', function () {
		var size = Number($(this).val());
		if (size > 0) callback(size, this);
	});
};

// After changing the page size, stay on the page that shows the same first row:
// rows 41-60 at 20 per page -> page 1 at 50 per page (rows 1-50 include row 41)
teceze.ui.pagination.page_for_size = function (page, old_size, new_size) {
	var first_row = (page - 1) * old_size;  // 0-based index of the first visible row
	return Math.floor(first_row / new_size) + 1;
};
