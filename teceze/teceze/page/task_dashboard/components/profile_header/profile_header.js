// =====================================================================
// Profile header — avatar with initials, name, a meta pill, a subtitle,
// and label/value facts on the right.
//
//   teceze.ui.profile_header({
//       name: 'Priya Ramesh',
//       online: true,                              // green dot on the avatar
//       meta: 'Employee (TCZ-IN-0351) • Delivery', // pill next to the name
//       subtitle: 'Task progress and time logged at a glance',
//       facts: [ { label: 'Active role', value: 'Project Manager' } ],
//       initials: 'All'                            // optional: avatar text instead of the name's initials
//   })
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/profile_header/tc_profile_header.html" %}
teceze.ui.add_style('tc-profile-header', `{% include "teceze/teceze/page/task_dashboard/components/profile_header/profile_header.css" %}`);

teceze.ui.profile_header = function (opts) {
	var ui = teceze.ui;
	return ui.render('tc_profile_header', {
		initials: ui.esc(opts.initials || ui.initials(opts.name)),
		online: !!opts.online,
		name: ui.esc(opts.name),
		meta: opts.meta ? ui.esc(opts.meta) : '',
		subtitle: opts.subtitle ? ui.esc(opts.subtitle) : '',
		facts: (opts.facts || []).filter(function (f) { return f.value; }).map(function (f) {
			return { label: ui.esc(f.label), value: ui.esc(f.value) };
		})
	});
};
