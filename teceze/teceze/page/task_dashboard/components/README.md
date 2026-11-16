# teceze.ui components

Reusable dashboard building blocks for Frappe pages in the `teceze` app.

## Use them in a page

Add one line at the top of the page's `.js` file:

```js
{% include "teceze/teceze/page/task_dashboard/components/components.js" %}
```

Frappe pastes the component files in when the page loads (`render_include`),
registers their `.html` templates and the components add their own CSS.
After adding or changing a component: `bench build`, `bench clear-cache`,
then hard-refresh the browser.

## Components

| Component | Call | Looks like |
|---|---|---|
| Number cards | `teceze.ui.number_cards([...])` | Row of cards with a big number, icon and badge |
| Donut card | `teceze.ui.donut_card({...})` | Pie chart card with a legend and footer |
| Stat tiles | `teceze.ui.stat_tiles({...})` | Small boxes with a number and coloured label |
| Progress list | `teceze.ui.progress_list({...})` | Card of rows with progress bars and tags |
| Filter chips | `teceze.ui.filter_chips({...})` | Pill buttons, one active |
| Pagination | `teceze.ui.pagination(page_info, { sizes: [5, 20, 50, 100] })` | "Showing 1–20 of 87", a "Rows per page" select and page buttons |
| Data table | `teceze.ui.data_table({...})` | Card with title, filters, table, footer, pager; `scroll_rows: 10` scrolls inside after 10 rows (call `teceze.ui.data_table.fit_height($el)` once it is on the page) |
| Profile header | `teceze.ui.profile_header({...})` | Avatar, name, meta pill, facts |
| Employee picker | `new teceze.ui.EmployeePicker({...})` | People dropdown for the page header (entries can carry `group`, `is_me`, `initials`) |

Each component's `.js` file starts with a usage example.

## Rules

- Components return HTML strings. Put them on the page with jQuery: `$el.html(...)`.
- Plain-text options are escaped for you. Options ending in `_html` are inserted
  as they are, so build those with the helpers (`teceze.ui.icon`, `teceze.ui.indicator`, ...).
- Colours are names: `primary, blue, orange, green, red, purple, gray`.
- Helpers: `esc, plural, percent, initials, icon, add_icon, indicator, dash, color_class`.
- CSS classes start with `tc-`. The brand colour is `--tc-brand` in `base/base.css`.

## Example: a new page

```js
{% include "teceze/teceze/page/task_dashboard/components/components.js" %}

frappe.pages['my-page'].on_page_load = function (wrapper) {
    var page = frappe.ui.make_app_page({ parent: wrapper, title: 'My page', single_column: true });
    var ui = teceze.ui;

    $(page.main).html(
        ui.number_cards([
            { label: 'Open', value: 12, color: 'blue', icon: 'open', note: 'Need attention' },
            { label: 'Done', value: 30, color: 'green', icon: 'done', note: 'This month' }
        ]) +
        ui.donut_card({
            title: 'Status', caption: 'Items',
            segments: [ { label: 'Open', value: 12, color: 'blue' },
                        { label: 'Done', value: 30, color: 'green' } ]
        })
    );
};
```

## Add a new component

1. Create `components/<name>/` with `tc_<name>.html`, `<name>.css`, `<name>.js`.
2. In `<name>.js`, include the template and the CSS like the others do,
   and add a function to `teceze.ui`.
3. Add an include line for `<name>.js` to `components.js`.

Template file names must be unique across the app (they become
`frappe.templates["tc_<name>"]`), which is why they start with `tc_`.

## Two Frappe rules that will break the page if ignored

1. **No single quote (') anywhere in a template `.html` file.** Frappe puts each
   template inside a '...' JavaScript string without escaping quotes, so one
   apostrophe breaks the whole page script. Use double quotes in HTML, and
   write text with apostrophes in the `.js` file instead.
2. **Never write the include tag in a comment of a `.js` file.** Frappe reads
   comments too and would try to include that file (or fail with
   "Invalid include path").
