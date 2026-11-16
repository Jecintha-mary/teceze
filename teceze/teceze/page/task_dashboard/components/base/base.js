// =====================================================================
// teceze.ui — shared base for every component in this folder
//
// How the components work
//   * Each component is a function on teceze.ui that takes an options
//     object and returns an HTML string, e.g. teceze.ui.number_cards([...]).
//   * Plain-text options (titles, labels, values) are escaped by the
//     component. Options whose name ends in _html are inserted as they
//     are, so build those with the helpers below (ui.icon, ui.indicator ...).
//   * Each component injects its own CSS once, through ui.add_style().
//   * Colours are names: primary, blue, orange, green, red, purple, gray.
// =====================================================================
frappe.provide('teceze.ui');

(function (ui) {
	// Inject a component's CSS (calling it again simply replaces the same <style>)
	ui.add_style = function (id, css) {
		frappe.dom.set_style(css, id);
	};

	ui.esc = function (value) {
		return frappe.utils.escape_html(value == null ? '' : String(value));
	};

	ui.render = function (template, context) {
		return frappe.render_template(template, context);
	};

	ui.plural = function (n, word) {
		return n + ' ' + word + (n === 1 ? '' : 's');
	};

	// share of a whole, rounded to one decimal: percent(1, 3) -> 33.3
	ui.percent = function (part, whole) {
		return whole ? +(part / whole * 100).toFixed(1) : 0;
	};

	// "Priya Ramesh" -> "PR"
	ui.initials = function (name) {
		return (name || '').split(/\s+/).filter(Boolean).slice(0, 2)
			.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
	};

	// ' tc-c-blue' (sets the --c colour variables used by the components)
	ui.color_class = function (color) {
		return color ? ' tc-c-' + color : '';
	};

	// Frappe's own coloured status pill
	ui.indicator = function (text, color) {
		return '<span class="indicator-pill ' + (color || 'gray') + '">' + ui.esc(text) + '</span>';
	};

	// a muted "—" for empty cells
	ui.dash = function () {
		return '<span class="tc-dash">—</span>';
	};

	// ---- icons (24x24 line icons) ----
	var ICON_PATHS = {
		list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
		open: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
		progress: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M16 16h5v5"/>',
		done: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
		alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
		clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
		info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
		prev: '<path d="m15 18-6-6 6-6"/>',
		next: '<path d="m9 18 6-6-6-6"/>',
		caret: '<path d="m6 9 6 6 6-6"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'
	};

	ui.icon = function (name) {
		if (!ICON_PATHS[name]) return '';
		return '<svg class="tc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
			'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON_PATHS[name] + '</svg>';
	};

	// add more icons from a page: teceze.ui.add_icon('star', '<path d="..."/>')
	ui.add_icon = function (name, svg_paths) {
		ICON_PATHS[name] = svg_paths;
	};
})(teceze.ui);

teceze.ui.add_style('tc-base', `{% include "teceze/teceze/page/task_dashboard/components/base/base.css" %}`);
