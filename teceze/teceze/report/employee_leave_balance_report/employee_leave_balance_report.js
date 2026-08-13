// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Employee Leave Balance Report"] = {

    filters: [

        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee",

            get_query: function () {
                return {
                    filters: {
                        status: "Active",
                        employment_type: ["!=", "Engineer"]
                    }
                };
            }
        },

        {
            fieldname: "department",
            label: __("Department"),
            fieldtype: "Link",
            options: "Department"
        },

        {
            fieldname: "leave_type",
            label: __("Leave Type"),
            fieldtype: "Link",
            options: "Leave Type"
        },

        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date"
        },

        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {

        value = default_formatter(
            value,
            row,
            column,
            data
        );

        if (!data) {
            return value;
        }

        const leave_fields = [
            "total_allocated",
            "expired_leaves",
            "used_leaves",
            "pending_leaves",
            "available_leaves"
        ];

        if (leave_fields.includes(column.fieldname)) {

            const number = parseFloat(
                data[column.fieldname]
            );

            if (isNaN(number)) {
                return "";
            }

            // Available Leaves = Green
            if (column.fieldname === "available_leaves") {

                return `
                    <span style="
                        color: #16a34a;
                        font-weight: 600;
                    ">
                        ${number}
                    </span>
                `;
            }

            return number.toString();
        }

        return value;
    }
};