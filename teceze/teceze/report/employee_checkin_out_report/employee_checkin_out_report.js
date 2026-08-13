// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt


frappe.query_reports["Employee Checkin Out Report"] = {

    filters: [

        {
            fieldname: "date",
            label: __("Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        },

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
            fieldname: "reports_to",
            label: __("Report Manager"),
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
        }
    ],

    formatter: function (
        value,
        row,
        column,
        data,
        default_formatter
    ) {

        if (!data) {
            return default_formatter(
                value,
                row,
                column,
                data
            );
        }

        // -----------------------------------------------------
        // Employee ID
        // -----------------------------------------------------

        if (column.fieldname === "employee") {

            return `
                <a href="/app/employee/${encodeURIComponent(data.employee)}">
                    ${data.employee}
                </a>
            `;
        }

        // -----------------------------------------------------
        // Status colors
        // -----------------------------------------------------

        if (column.fieldname === "status") {

            if (data.status === "IN") {

                return `
                    <span style="
                        color: #16a34a;
                        font-weight: 600;
                    ">
                        IN
                    </span>
                `;
            }

            if (data.status === "OUT") {

                return `
                    <span style="
                        color: #f4a261;
                        font-weight: 600;
                    ">
                        OUT
                    </span>
                `;
            }

            if (data.status === "Not Checked In") {

                return `
                    <span style="
                        color: #dc3545;
                        font-weight: 600;
                    ">
                        Not Checked In
                    </span>
                `;
            }
        }

        // -----------------------------------------------------
        // Total Working Hours
        // Remove unnecessary decimal zeros
        // -----------------------------------------------------

        if (
            column.fieldname === "total_working_hours"
        ) {

            const number = parseFloat(
                data.total_working_hours
            );

            if (!isNaN(number)) {
                return number.toString();
            }
        }

        return default_formatter(
            value,
            row,
            column,
            data
        );
    }
};