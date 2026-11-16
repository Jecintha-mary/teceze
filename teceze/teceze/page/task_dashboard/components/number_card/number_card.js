// =====================================================================
// Number cards — a responsive row of cards, each with a big number.
//
//   teceze.ui.number_cards([
//       { label: 'Open', value: 12, note: '40% of all tasks',
//         color: 'blue', icon: 'open', badge: '40%' },
//       ...
//   ])
//
//   label, value, note  text
//   color               colour name (top border, icon and badge)
//   icon                icon name from teceze.ui.icon (optional)
//   badge               small pill next to the number (optional)
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/number_card/tc_number_card.html" %}
teceze.ui.add_style('tc-number-card', `{% include "teceze/teceze/page/task_dashboard/components/number_card/number_card.css" %}`);

teceze.ui.number_cards = function (cards) {
	var ui = teceze.ui;
	return ui.render('tc_number_card', {
		cards: (cards || []).map(function (c) {
			return {
				label: ui.esc(c.label),
				value: ui.esc(c.value),
				note: ui.esc(c.note),
				badge: c.badge ? ui.esc(c.badge) : '',
				icon_html: ui.icon(c.icon),
				color_cls: ui.color_class(c.color)
			};
		})
	});
};
