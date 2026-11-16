 {% include "teceze/teceze/page/task_dashboard/components/components.js" %}

// =====================================================================
// Task dashboard page
// The building blocks (cards, charts, tables, pager, picker) live in
// components/. This file only loads the data, keeps it live, and turns
// it into options for those components.
// =====================================================================
frappe.pages['task-dashboard'].on_page_load = function (wrapper) {
	var ui = teceze.ui;
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Task and Project Details',
		single_column: true
	});

	var API = 'teceze.teceze.page.task_dashboard.task_dashboard.';

	// Tables this dashboard reads from. A change in any of them can refresh the page live.
	var WATCHED_DOCTYPES = ['Task', 'ToDo', 'Timesheet', 'Project', 'Employee'];
	var DEBOUNCE_MS = 1500;        // group a burst of changes into a single reload
	var FALLBACK_POLL_MS = 60000;  // safety net for changes that send no realtime event
	var PAGE_SIZES = [5, 20, 50, 100];  // "Rows per page" choices (the server allows up to 100)
	var DEFAULT_PAGE_SIZE = 20;          // used until someone picks a size
	var SCROLL_ROWS = 10;                // rows visible before a table scrolls inside itself

	// each table's rows-per-page is remembered in this browser
	function saved_size(key) {
		try {
			var size = Number(localStorage.getItem('task_dashboard:page_size:' + key));
			return PAGE_SIZES.indexOf(size) > -1 ? size : DEFAULT_PAGE_SIZE;
		} catch (e) {
			return DEFAULT_PAGE_SIZE;
		}
	}
	function save_size(key, size) {
		try { localStorage.setItem('task_dashboard:page_size:' + key, size); } catch (e) { /* private mode */ }
	}

	var state = {
		data: null,       // last payload from the server
		employee: null,   // employee that payload belongs to
		status: '',       // task table filters, kept across live reloads
		sprint: '',
		task_page: 1,     // current page of each table, kept across live reloads
		ts_page: 1,
		task_size: saved_size('tasks'),        // rows per page of each table
		ts_size: saved_size('timesheets'),
		loading: false,
		queued: false,
		stale: false,
		loaded_at: 0,
		timer: null
	};

	page.set_secondary_action(__('Refresh'), function () { load_data({ freeze: true }); }, 'refresh');

	// ---- Employee picker (components/employee_picker) ----
	var picker = new ui.EmployeePicker({
		page: page,
		on_change: function () { load_data({ freeze: true }); }
	});
	var $body = $('<div></div>').appendTo(page.main);

	// Step 1: load the employee list, select the logged-in user's own Employee
	frappe.call({
		method: API + 'get_dropdown_employees',
		callback: function (r) {
			if (!r.message) return;
			if (!r.message.employees.length) {
				$body.html('<div class="td-root"><div class="tc-empty">' +
					__('Your login is not linked to an active Employee record.') + '</div></div>');
				return;
			}
			picker.set_employees(r.message.employees);
			picker.set_value(r.message.default_employee);  // draws the picker and loads the data
		}
	});

	// Step 2: fetch the summary and the current page of both tables
	// opts.freeze: show the loading overlay (manual loads only; live reloads are silent)
	function load_data(opts) {
		opts = opts || {};
		var employee = picker.get_value();
		if (!employee) return;
		if (state.loading) { state.queued = true; return; }

		// a different employee starts with no filters, on page 1
		if (employee !== state.employee) {
			state.status = '';
			state.sprint = '';
			state.task_page = 1;
			state.ts_page = 1;
		}

		state.loading = true;
		state.stale = false;
		clearTimeout(state.timer);

		frappe.call({
			method: API + 'get_dashboard_data',
			args: {
				employee: employee,
				task_status: state.status,
				task_sprint: state.sprint,
				task_page: state.task_page,
				timesheet_page: state.ts_page,
				task_page_size: state.task_size,
				timesheet_page_size: state.ts_size
			},
			freeze: !!opts.freeze,
			callback: function (r) {
				// ignore the answer if the picker was switched while it was loading
				if (!r.message || r.message.employee_id !== picker.get_value()) return;
				table_req.tasks += 1;       // any table page still loading is now out of date
				table_req.timesheets += 1;
				state.employee = r.message.employee_id;
				state.data = r.message;
				state.task_page = r.message.tasks.page;      // the server may have moved us
				state.ts_page = r.message.timesheets.page;   // back if a page emptied
				state.loaded_at = Date.now();
				render(r.message);
				page.set_indicator(__('Live · updated {0}', [moment().format('HH:mm:ss')]), 'green');
			},
			error: function () {
				page.set_indicator(__('Update failed'), 'red');
			},
			always: function () {
				state.loading = false;
				if (state.queued) {
					state.queued = false;
					load_data();
				}
			}
		});
	}

	// ---- Loading one table page (pager and filter chips) ----
	// Only that table is fetched and redrawn; the cards and charts stay as they are.
	var table_req = { tasks: 0, timesheets: 0 };  // newest request per table; older answers are ignored

	function load_table(key) {
		if (!state.data) return;
		var token = ++table_req[key];
		var is_tasks = key === 'tasks';
		ui.data_table.loading(table_card(key), true);

		frappe.call({
			method: API + (is_tasks ? 'get_tasks_page' : 'get_timesheets_page'),
			args: is_tasks
				? { employee: state.employee, status: state.status, sprint: state.sprint,
					page: state.task_page, page_size: state.task_size }
				: { employee: state.employee, page: state.ts_page, page_size: state.ts_size },
			callback: function (r) {
				if (token !== table_req[key] || !r.message || r.message.employee_id !== state.employee) return;
				state.data[key] = r.message;
				if (is_tasks) state.task_page = r.message.page;
				else state.ts_page = r.message.page;
				redraw_table(key);
			},
			always: function () {
				if (token === table_req[key]) ui.data_table.loading(table_card(key), false);
			}
		});
	}

	// ---- Real-time updates ----
	// Frappe sends a 'list_update' socket event whenever a document is saved or
	// deleted. We listen for the tables above and reload when a change could
	// affect what this dashboard shows.
	function is_visible() {
		return !document.hidden && $(wrapper).is(':visible');
	}

	function is_relevant(msg) {
		var d = state.data;
		if (!msg || !d || WATCHED_DOCTYPES.indexOf(msg.doctype) === -1) return false;
		switch (msg.doctype) {
			case 'Task':      // any task change can move the counts, even one on another page
				return true;
			case 'Project':   // a project shown on the dashboard was renamed etc.
				return d.summary.projects.some(function (p) { return p.project === msg.name; });
			case 'Employee':  // the profile header changed (or, in the all view, any name shown)
				return d.scope === 'all' || !!(d.employee && d.employee.name === msg.name);
			default:          // ToDo (assignments) and Timesheet: may be new rows for this user
				return true;
		}
	}

	function schedule_reload() {
		if (!is_visible()) { state.stale = true; return; }
		clearTimeout(state.timer);
		state.timer = setTimeout(function () { load_data(); }, DEBOUNCE_MS);
	}

	function join_rooms() {
		// Newer Frappe sends list_update only to clients subscribed to the doctype
		var rt = (frappe.realtime && frappe.realtime.doctype_subscribe) ? frappe.realtime
			: (frappe.socketio && frappe.socketio.doctype_subscribe) ? frappe.socketio : null;
		if (!rt) return;
		WATCHED_DOCTYPES.forEach(function (dt) {
			try { rt.doctype_subscribe(dt); } catch (e) { /* no read access: polling still covers it */ }
		});
	}

	function refresh_if_stale() {
		if (!state.data || !is_visible()) return;
		join_rooms();  // list views can unsubscribe a doctype when you leave them
		if (state.stale || Date.now() - state.loaded_at > FALLBACK_POLL_MS / 2) load_data();
	}

	if (frappe.realtime && frappe.realtime.on) {
		frappe.realtime.on('list_update', function (msg) {
			if (is_relevant(msg)) schedule_reload();
		});
	}
	join_rooms();

	// Some updates never send a socket event (e.g. the nightly job that marks
	// tasks Overdue), so poll quietly while the page is on screen.
	setInterval(function () {
		if (is_visible() && state.data && !state.loading) load_data();
	}, FALLBACK_POLL_MS);

	// Catch up when the browser tab or this page comes back into view
	document.addEventListener('visibilitychange', refresh_if_stale);
	wrapper.td_refresh_if_stale = function () {
		ui.data_table.fit_height($body);  // the page may have been hidden while it was drawn
		refresh_if_stale();
	};

	// rows can wrap differently at another width, so measure the tables again
	var resize_timer = null;
	$(window).on('resize', function () {
		clearTimeout(resize_timer);
		resize_timer = setTimeout(function () { ui.data_table.fit_height($body); }, 150);
	});

	// =================================================================
	// Step 3: turn the data into component options
	// =================================================================
	var STATUS_COLOR = {
		'Open': 'blue', 'Working': 'orange', 'Pending Review': 'purple',
		'Overdue': 'red', 'Completed': 'green', 'Cancelled': 'gray', 'Template': 'gray'
	};
	var STATUS_LABEL = { 'Working': 'In Progress' };
	var PRIORITY_COLOR = { 'Low': 'gray', 'Medium': 'blue', 'High': 'orange', 'Urgent': 'red' };
	var TIMESHEET_COLOR = {
		'Draft': 'gray', 'Submitted': 'blue', 'Partially Billed': 'orange',
		'Billed': 'green', 'Payslip': 'purple', 'Completed': 'green', 'Cancelled': 'red'
	};
	var CORE_STATUSES = ['Open', 'Working', 'Completed', 'Overdue'];  // always in the legend
	var ROW_COLORS = ['blue', 'orange', 'green', 'purple', 'red'];
	var PRIORITY_ORDER = ['Urgent', 'High', 'Medium', 'Low'];
	var NO_SPRINT = 'No sprint';

	function label(status) { return STATUS_LABEL[status] || status; }
	function day(v) { return v ? String(v).split(' ')[0] : ''; }
	function show_date(v) { return v ? ui.esc(frappe.datetime.str_to_user(day(v))) : ui.dash(); }
	function hours(v) { return (Number(v) || 0).toFixed(2); }
	function is_overdue(t) {
		if (t.status === 'Completed' || t.status === 'Cancelled') return false;
		return t.status === 'Overdue' || (t.exp_end_date && day(t.exp_end_date) < frappe.datetime.get_today());
	}

	// ---- table columns (components/data_table) ----
	var TASK_COLUMNS = [
		{ label: 'Task', html: function (t) {
			return '<a href="/app/task/' + encodeURIComponent(t.name) + '">' + ui.esc(t.name) + '</a>';
		} },
		{ label: 'Subject', field: 'subject', cls: 'td-subject' },
		{ label: 'Project', html: function (t) { return ui.esc(t.project_name || t.project || '—'); } },
		{ label: 'Sprint', html: function (t) {
			return t.sprint ? '<span class="tc-pill tc-tag">' + ui.esc(t.sprint) + '</span>' : ui.dash();
		} },
		{ label: 'Priority', html: function (t) { return ui.indicator(t.priority, PRIORITY_COLOR[t.priority]); } },
		{ label: 'Status', html: function (t) { return ui.indicator(label(t.status), STATUS_COLOR[t.status]); } },
		{ label: 'Due', cls: 'tc-num', html: function (t) { return show_date(t.exp_end_date); },
			cell_cls: function (t) { return is_overdue(t) ? 'tc-text-danger' : ''; } }
	];

	var TIMESHEET_COLUMNS = [
		{ label: 'Timesheet', html: function (t) {
			return '<a href="/app/timesheet/' + encodeURIComponent(t.name) + '">' + ui.esc(t.name) + '</a>';
		} },
		{ label: 'Status', html: function (t) { return ui.indicator(t.status, TIMESHEET_COLOR[t.status]); } },
		{ label: 'Period', html: function (t) {
			var period = show_date(t.start_date);
			if (t.end_date && day(t.end_date) !== day(t.start_date)) period += ' → ' + show_date(t.end_date);
			return period;
		} },
		{ label: 'Hours', cls: 'tc-num', html: function (t) { return hours(t.total_hours); } }
	];

	// ---- extra "whose is it" columns for the admin's all-employees view ----
	var MAX_NAMES = 2;  // "Arjun Rao, Priya Ramesh +3"
	var ASSIGNED_TO_COLUMN = { label: 'Assigned to', html: function (t) {
		var people = t.assigned_to || [];
		if (!people.length) return '<span class="tc-dash">Unassigned</span>';
		var shown = ui.esc(people.slice(0, MAX_NAMES).join(', '));
		var more = people.length - MAX_NAMES;
		return more > 0 ? '<span title="' + ui.esc(people.join(', ')) + '">' + shown + ' +' + more + '</span>' : shown;
	} };
	var EMPLOYEE_COLUMN = { label: 'Employee', html: function (t) {
		return t.employee_name || t.employee ? ui.esc(t.employee_name || t.employee) : ui.dash();
	} };

	// the same columns, plus the owner column after the 2nd (Subject) / 1st (Timesheet)
	function with_column(columns, extra, after) {
		return columns.slice(0, after).concat([extra], columns.slice(after));
	}

	var TABLES = {
		tasks: { empty: 'No tasks assigned', noun: 'Task',
			columns: function (all) { return all ? with_column(TASK_COLUMNS, ASSIGNED_TO_COLUMN, 2) : TASK_COLUMNS; } },
		timesheets: { empty: 'No timesheets logged yet', noun: 'Timesheet',
			columns: function (all) { return all ? with_column(TIMESHEET_COLUMNS, EMPLOYEE_COLUMN, 1) : TIMESHEET_COLUMNS; } }
	};

	function is_all_view() {
		return !!(state.data && state.data.scope === 'all');
	}

	function table_card(key) {
		return $body.find('.tc-table-card[data-table="' + key + '"]');
	}

	// redraw one table's rows, count and pager from state.data
	function redraw_table(key) {
		var pg = state.data[key];
		var $card = table_card(key);
		var parts = {
			columns: TABLES[key].columns(is_all_view()),
			rows: pg.rows,
			empty_text: TABLES[key].empty,
			pager_html: ui.pagination(pg, { noun: TABLES[key].noun, sizes: PAGE_SIZES })
		};
		if (key === 'tasks') parts.count_label = ui.plural(pg.total, 'item');
		ui.data_table.update($card, parts);

		// after moving to another page, bring the top of the table back into view
		if ($card.length && $card[0].getBoundingClientRect().top < 0) $card[0].scrollIntoView({ block: 'start' });
	}

	// ---- table controls: bound once on $body, so they keep working after every redraw ----
	ui.pagination.on_change($body, function (page_no, button) {
		var key = $(button).closest('.tc-table-card').attr('data-table');
		if (key === 'tasks') state.task_page = page_no;
		else state.ts_page = page_no;
		load_table(key);
	});

	ui.pagination.on_page_size($body, function (size, select) {
		var key = $(select).closest('.tc-table-card').attr('data-table');
		var is_tasks = key === 'tasks';
		var old_size = is_tasks ? state.task_size : state.ts_size;
		var page = ui.pagination.page_for_size(is_tasks ? state.task_page : state.ts_page, old_size, size);
		if (is_tasks) { state.task_size = size; state.task_page = page; }
		else { state.ts_size = size; state.ts_page = page; }
		save_size(key, size);
		load_table(key);
	});

	ui.filter_chips.on_change($body, 'status', function (value) {
		state.status = value;
		state.task_page = 1;  // a new filter starts on its first page
		load_table('tasks');
	});

	ui.filter_chips.on_change($body, 'sprint', function (value) {
		state.sprint = value;
		state.task_page = 1;
		load_table('tasks');
	});

	// ---- admin workload cards (components/progress_list) ----
	function workload_html(sm, active) {
		var by_assignee = (sm.assignees || []).map(function (a, i) {
			var share = ui.percent(a.n, active);
			return {
				label: a.name,
				value_text: ui.plural(a.n, 'active task') + ' (' + share + '%)',
				percent: share,
				color: ROW_COLORS[i % ROW_COLORS.length]
			};
		});
		if (sm.unassigned_active) {
			var share = ui.percent(sm.unassigned_active, active);
			by_assignee.push({
				label: 'Unassigned',
				value_text: ui.plural(sm.unassigned_active, 'active task') + ' (' + share + '%)',
				percent: share,
				color: 'gray'
			});
		}

		var by_employee = (sm.hours_by_employee || []).map(function (h, i) {
			var share = ui.percent(h.hours, sm.total_hours);
			return {
				label: h.name,
				value_text: hours(h.hours) + ' hrs (' + ui.plural(h.n, 'timesheet') + ')',
				percent: share,
				color: ROW_COLORS[i % ROW_COLORS.length]
			};
		});

		function top_of(shown, count, noun) {
			return count > shown ? 'Top ' + shown + ' of ' + count + ' ' + noun : ui.plural(count, noun.replace(/s$/, ''));
		}

		return ui.progress_list({
			title: 'Active tasks by assignee',
			meta: top_of((sm.assignees || []).length, sm.assignee_count || 0, 'assignees'),
			items: by_assignee,
			empty_text: 'No active tasks'
		}) + ui.progress_list({
			title: 'Hours logged by employee',
			meta: top_of((sm.hours_by_employee || []).length, sm.employee_hours_count || 0, 'employees'),
			items: by_employee,
			empty_text: 'No timesheets logged yet'
		});
	}

	// ---- the whole dashboard ----
	// Cards and charts come from d.summary, which the server counts over ALL of the
	// employee's tasks. The tables only hold the current page (d.tasks, d.timesheets).
	function render(d) {
		var sm = d.summary;
		var emp = d.employee || {};
		var all = d.scope === 'all';  // admin: every task and timesheet

		var counts = {};
		sm.task_status_counts.forEach(function (s) { counts[s.status] = s.total; });
		var total = sm.total_tasks || 0;
		var active = total - (counts['Completed'] || 0) - (counts['Cancelled'] || 0);
		function pct(n) { return ui.percent(n, total); }

		// a filter whose status or sprint no longer exists (e.g. the last Overdue
		// task was completed) is dropped, and the table reloads without it
		var sprint_exists = sm.sprints.some(function (s) { return (s.sprint || NO_SPRINT) === state.sprint; });
		var reload_tasks = false;
		if (state.status && !counts[state.status]) { state.status = ''; reload_tasks = true; }
		if (state.sprint && !sprint_exists) { state.sprint = ''; reload_tasks = true; }

		// one colour per sprint, in sprint order
		var sprint_names = sm.sprints.filter(function (s) { return s.sprint; }).map(function (s) { return s.sprint; });
		function sprint_color(name) {
			var i = sprint_names.indexOf(name);
			return i < 0 ? 'gray' : ROW_COLORS[i % ROW_COLORS.length];
		}

		var other_statuses = Object.keys(counts).filter(function (s) { return CORE_STATUSES.indexOf(s) === -1; });

		$body.html(frappe.render_template('task_dashboard', {

			profile_html: all ? ui.profile_header({
				name: 'All employees',
				initials: 'All',
				meta: 'Company-wide view',
				subtitle: 'Every task and timesheet, across all employees',
				facts: [
					{ label: 'Active employees', value: String(sm.active_employees || 0) },
					{ label: 'Latest timesheet', value: sm.latest_timesheet_start
						? moment(day(sm.latest_timesheet_start)).format('MMM YYYY') : '—' }
				]
			}) : ui.profile_header({
				name: emp.employee_name || d.employee_id,
				online: emp.status === 'Active',
				meta: 'Employee (' + d.employee_id + ')' + (emp.department ? ' • ' + emp.department : ''),
				subtitle: 'Task progress and time logged at a glance',
				facts: [
					{ label: 'Active role', value: emp.designation },
					{ label: 'Timesheet period', value: sm.latest_timesheet_start
						? moment(day(sm.latest_timesheet_start)).format('MMM YYYY') : '—' }
				]
			}),

			cards_html: ui.number_cards([
				{ label: 'Total Tasks', value: total, color: 'primary', icon: 'list',
					note: all ? 'Across all employees' : d.user ? 'Assigned to this employee' : 'No login user linked' },
				{ label: 'Open', value: counts['Open'] || 0, color: 'blue', icon: 'open',
					badge: pct(counts['Open'] || 0) + '%', note: pct(counts['Open'] || 0) + '% of all tasks' },
				{ label: 'In Progress', value: counts['Working'] || 0, color: 'orange', icon: 'progress',
					badge: pct(counts['Working'] || 0) + '%', note: pct(counts['Working'] || 0) + '% of all tasks' },
				{ label: 'Completed', value: counts['Completed'] || 0, color: 'green', icon: 'done',
					badge: pct(counts['Completed'] || 0) + '%', note: pct(counts['Completed'] || 0) + '% completion rate' },
				{ label: 'Overdue', value: sm.overdue_count || 0, color: 'red', icon: 'alert',
					badge: pct(sm.overdue_count || 0) + '%', note: 'Past due or flagged' },
				{ label: 'Hours Logged', value: hours(sm.total_hours), color: 'purple', icon: 'clock',
					note: ui.plural(sm.timesheet_count, 'timesheet') + (all ? ' by everyone' : '') }
			]),

			status_html: ui.donut_card({
				title: 'Task status',
				info: 'Share of tasks by status',
				badge: ui.plural(active, 'active task'),
				badge_color: 'blue',
				caption: 'Tasks',
				segments: CORE_STATUSES.concat(other_statuses).map(function (s) {
					return { label: label(s), value: counts[s] || 0, color: STATUS_COLOR[s] || 'gray' };
				}),
				extra_html: ui.stat_tiles({
					title: 'Active tasks by priority',
					tiles: PRIORITY_ORDER.map(function (p) {
						return { value: (sm.priority_counts || {})[p] || 0, label: p, color: PRIORITY_COLOR[p] };
					})
				}),
				footer: { label: 'Resolution rate', value: pct(counts['Completed'] || 0) + '% Completed', color: 'green' },
				empty_text: 'No tasks assigned yet'
			}),

			projects_html: ui.progress_list({
				title: 'Tasks by project',
				meta: ui.plural(sm.projects.length, 'project'),
				empty_text: 'No projects to show',
				items: sm.projects.map(function (p, i) {
					var share = pct(p.n);
					return {
						label: p.project ? (p.project_name ? p.project + ' • ' + p.project_name : p.project) : 'No project',
						value_text: ui.plural(p.n, 'task') + ' (' + share + '%)',
						percent: share,
						color: p.project ? ROW_COLORS[i % ROW_COLORS.length] : 'gray',
						tags: p.sprints.map(function (n) { return { label: n, color: sprint_color(n) }; })
					};
				})
			}),

			sprints_html: ui.progress_list({
				title: 'Tasks by sprint',
				meta: ui.plural(sprint_names.length, 'sprint'),
				empty_text: 'No sprints to show',
				items: sm.sprints.map(function (s) {
					var done = ui.percent(s.done, s.n);
					return {
						label: s.sprint || NO_SPRINT,
						value_text: s.done + ' of ' + ui.plural(s.n, 'task') + ' done (' + done + '%)',
						percent: done,
						color: sprint_color(s.sprint)
					};
				})
			}),

			workload_html: all ? workload_html(sm, active) : '',

			tasks_html: ui.data_table({
				key: 'tasks',
				title: 'Tasks',
				count_label: ui.plural(d.tasks.total, 'item'),  // how many match the current filters
				actions_html: ui.filter_chips({
					name: 'status',
					all_label: 'All (' + total + ')',
					active: state.status,
					items: Object.keys(counts).map(function (s) {
						return { value: s, label: label(s) + ' (' + counts[s] + ')' };
					})
				}),
				toolbar_html: sprint_names.length ? ui.filter_chips({
					name: 'sprint',
					label: 'Sprint',
					all_label: 'All sprints',
					active: state.sprint,
					row: true,
					items: sm.sprints.map(function (s) {
						var name = s.sprint || NO_SPRINT;
						return { value: name, label: name + ' (' + s.n + ')' };
					})
				}) : '',
				columns: TABLES.tasks.columns(all),
				rows: d.tasks.rows,
				empty_text: TABLES.tasks.empty,
				pager_html: ui.pagination(d.tasks, { noun: 'Task', sizes: PAGE_SIZES }),
				scroll_rows: SCROLL_ROWS
			}),

			timesheets_html: ui.data_table({
				key: 'timesheets',
				title: 'Timesheets',
				count_label: ui.plural(sm.timesheet_count, 'record'),
				columns: TABLES.timesheets.columns(all),
				rows: d.timesheets.rows,
				empty_text: TABLES.timesheets.empty,
				footer: [
					// label spans every column except the last (Hours), however many there are
					{ text: 'Total hours (all timesheets)', colspan: TABLES.timesheets.columns(all).length - 1 },
					{ text: hours(sm.total_hours) + ' hrs', cls: 'tc-num' }
				],
				pager_html: ui.pagination(d.timesheets, { noun: 'Timesheet', sizes: PAGE_SIZES }),
				scroll_rows: SCROLL_ROWS
			})
		}));

		ui.data_table.fit_height($body);  // tables are on the page now: cap them at 10 rows

		if (reload_tasks) {
			state.task_page = 1;
			load_table('tasks');
		}
	}
};

frappe.pages['task-dashboard'].on_page_show = function (wrapper) {
	if (wrapper.td_refresh_if_stale) wrapper.td_refresh_if_stale();
};
