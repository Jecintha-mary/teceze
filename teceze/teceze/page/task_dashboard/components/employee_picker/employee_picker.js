// =====================================================================
// Employee picker — a people dropdown, sized for the page header.
// A search box appears once the list is long. Works with mouse and keyboard.
//
//   var picker = new teceze.ui.EmployeePicker({
//       page: page,                 // frappe page: placed next to its buttons
//       on_change: function (employee_id) { ... }
//   });
//   picker.set_employees([ { employee, employee_name, designation }, ... ]);
//
//   Each entry can also have (all optional):
//     is_me     true -> shows a "You" tag
//     group     heading shown above the first entry of each group, e.g. "Direct reports (3)"
//     initials  avatar text instead of the name's initials, e.g. "All"
//   Without is_me / group, the first entry is "You" and the rest are "Direct reports (n)".
//   picker.set_value('TCZ-IN-0351');   // selects and calls on_change
//   picker.get_value();
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/employee_picker/tc_employee_picker.html" %}
teceze.ui.add_style('tc-employee-picker', `{% include "teceze/teceze/page/task_dashboard/components/employee_picker/employee_picker.css" %}`);

teceze.ui.EmployeePicker = function (opts) {
	this.opts = $.extend({ search_from: 7 }, opts);
	this.employees = [];
	this.value = null;

	// in the page header next to the page's buttons, or above the content
	this.$bar = $('<div class="tc-picker-bar"></div>');
	var page = this.opts.page;
	if (page && page.page_actions && page.page_actions.length) this.$bar.prependTo(page.page_actions);
	else this.$bar.addClass('tc-picker-inline').prependTo(this.opts.parent || (page && page.main));

	this.bind_events();
};

$.extend(teceze.ui.EmployeePicker.prototype, {
	set_employees: function (employees) {
		this.employees = employees || [];
		this.draw();
	},

	get_value: function () {
		return this.value;
	},

	set_value: function (value) {
		if (!value || value === this.value) return;
		this.value = value;
		this.draw();
		if (this.opts.on_change) this.opts.on_change(value);
	},

	draw: function () {
		var ui = teceze.ui;
		var list = this.employees;
		if (!list.length) { this.$bar.empty(); return; }

		var value = this.value;
		var cur = list.find(function (e) { return e.employee === value; }) || list[0];
		// entries from the server say who is "me" and which group they are in;
		// otherwise: the first is "You", the rest are direct reports
		var described = list.some(function (e) { return 'is_me' in e || 'group' in e; });

		function initials(e) {
			return e.initials || ui.initials(e.employee_name);
		}

		function item(e, you) {
			var selected = e.employee === value;
			return {
				value: ui.esc(e.employee),
				name: ui.esc(e.employee_name),
				sub: ui.esc(e.designation || 'No designation'),
				initials: ui.esc(initials(e)),
				search: ui.esc([e.employee_name, e.designation, e.employee].join(' ').toLowerCase()),
				you: you,
				selected: selected ? 'true' : 'false',
				cls: selected ? ' is-selected' : ''
			};
		}

		var items = [], last_group = '';
		list.forEach(function (e, i) {
			var group = described ? (e.group || '') : (i ? 'Direct reports (' + (list.length - 1) + ')' : '');
			if (group && group !== last_group) items.push({ group: group });
			last_group = group;
			items.push(item(e, described ? !!e.is_me : i === 0));
		});

		this.$bar.html(ui.render('tc_employee_picker', {
			current: {
				name: ui.esc(cur.employee_name),
				initials: ui.esc(initials(cur)),
				aria: ui.esc(__('Employee: {0}. Change employee', [cur.employee_name]))
			},
			icons: { caret: ui.icon('caret'), check: ui.icon('check'), search: ui.icon('search') },
			show_search: list.length >= this.opts.search_from,
			items: items,
			has_team: list.length > 1
		}));
	},

	// ---- open / close ----
	is_open: function () {
		return !this.$bar.find('.tc-picker-menu').prop('hidden');
	},

	open: function () {
		var $bar = this.$bar;
		$bar.find('.tc-picker-menu').prop('hidden', false);
		this.fit_menu();
		$bar.find('.tc-picker-btn').attr('aria-expanded', 'true');
		var $search = $bar.find('.tc-picker-search input');
		if ($search.length) $search.val('').trigger('input').focus();
		else ($bar.find('.tc-picker-item.is-selected')[0] || $bar.find('.tc-picker-item')[0]).focus();
	},

	close: function (focus_button) {
		if (!this.is_open()) return;
		this.$bar.find('.tc-picker-menu').prop('hidden', true);
		this.$bar.find('.tc-picker-btn').attr('aria-expanded', 'false');
		if (focus_button) this.$bar.find('.tc-picker-btn').focus();
	},

	// keep the open menu inside the screen (it can spill off the left edge on phones)
	fit_menu: function () {
		var $menu = this.$bar.find('.tc-picker-menu').css({ left: '', right: '' });
		var gap = 8;
		if ($menu[0].getBoundingClientRect().left < gap) {
			var anchor = this.$bar.find('.tc-picker')[0].getBoundingClientRect();
			$menu.css({ right: 'auto', left: (gap - anchor.left) + 'px' });
		}
	},

	move_focus: function (step) {
		var $items = this.$bar.find('.tc-picker-item:not([hidden])');
		if (!$items.length) return;
		var i = $items.index(document.activeElement);
		i = i < 0 ? (step > 0 ? 0 : $items.length - 1) : (i + step + $items.length) % $items.length;
		$items[i].focus();
	},

	choose: function (el) {
		this.close(true);
		this.set_value($(el).attr('data-value'));
	},

	// search: hide rows that don't match, and a group heading when none of its rows match
	filter: function (query) {
		var $bar = this.$bar;
		var q = (query || '').trim().toLowerCase();
		var shown = 0;
		$bar.find('.tc-picker-item').each(function () {
			var hit = !q || $(this).attr('data-search').indexOf(q) !== -1;
			$(this).prop('hidden', !hit);
			if (hit) shown += 1;
		});
		$bar.find('.tc-picker-group').each(function () {
			var shown_in_group = $(this).nextUntil('.tc-picker-group', '.tc-picker-item:not([hidden])').length;
			$(this).prop('hidden', !shown_in_group);
		});
		$bar.find('.tc-picker-none').prop('hidden', shown > 0);
	},

	// events are bound once on the bar, so they survive every redraw
	bind_events: function () {
		var me = this;
		var $bar = this.$bar;

		$bar.on('click', '.tc-picker-btn', function () {
			me.is_open() ? me.close() : me.open();
		});
		$bar.on('click', '.tc-picker-item', function () { me.choose(this); });

		$bar.on('keydown', '.tc-picker-btn', function (e) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				me.open();
			}
		});

		$bar.on('keydown', '.tc-picker-menu', function (e) {
			if (e.key === 'Escape') { e.preventDefault(); me.close(true); }
			else if (e.key === 'Tab') { me.close(); }
			else if (e.key === 'ArrowDown') { e.preventDefault(); me.move_focus(1); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); me.move_focus(-1); }
			else if (e.key === 'Enter' && $(document.activeElement).hasClass('tc-picker-item')) {
				e.preventDefault();
				me.choose(document.activeElement);
			}
		});

		$bar.on('input', '.tc-picker-search input', function () { me.filter($(this).val()); });

		// close when clicking anywhere else on the page
		$(document).on('mousedown', function (e) {
			if (me.is_open() && !$.contains($bar[0], e.target)) me.close();
		});
	}
});
