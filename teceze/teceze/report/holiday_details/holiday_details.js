// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Holiday Details"] = {
    filters: [
        {
            fieldname: "holiday_name",
            label: __("Holiday List"),
            fieldtype: "Link",
            options: "Holiday List",
            reqd: 1,
			default : "India-2026-2027"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "holiday_date") {
            return `<span style="
                background-color: #fff3cd;
                color: #856404;
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: 600;
            ">${value}</span>`;
        }

        if (column.fieldname === "description") {
            return `<span style="
                color: #1565c0;
                font-weight: 600;
            ">${value}</span>`;
        }

        if (column.fieldname === "custom_status") {
            return `<span style="
                color: #6a1b9a;
                font-weight: 600;
            ">${value}</span>`;
        }

        return value;
    }
};