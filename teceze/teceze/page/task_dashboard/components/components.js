// =====================================================================
// teceze.ui components — loads every component in this folder.
//
// To use them in any Frappe page of this app, put ONE include line at the top
// of the page's .js file (see README.md in this folder for the exact line).
// Frappe pastes the files in when the page loads.
//
// NOTE: never write the include tag itself in a comment in any .js file:
// Frappe reads comments too, and would try to include that file.
//
// base.js must stay first: the other components build on it.
// =====================================================================
{% include "teceze/teceze/page/task_dashboard/components/base/base.js" %}
{% include "teceze/teceze/page/task_dashboard/components/number_card/number_card.js" %}
{% include "teceze/teceze/page/task_dashboard/components/stat_tiles/stat_tiles.js" %}
{% include "teceze/teceze/page/task_dashboard/components/donut_card/donut_card.js" %}
{% include "teceze/teceze/page/task_dashboard/components/progress_list/progress_list.js" %}
{% include "teceze/teceze/page/task_dashboard/components/filter_chips/filter_chips.js" %}
{% include "teceze/teceze/page/task_dashboard/components/pagination/pagination.js" %}
{% include "teceze/teceze/page/task_dashboard/components/data_table/data_table.js" %}
{% include "teceze/teceze/page/task_dashboard/components/profile_header/profile_header.js" %}
{% include "teceze/teceze/page/task_dashboard/components/employee_picker/employee_picker.js" %}
