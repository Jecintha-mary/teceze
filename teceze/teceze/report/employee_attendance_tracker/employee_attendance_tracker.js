frappe.query_reports["Employee Attendance Tracker"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start(),
            reqd: 1,
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_end(),
            reqd: 1,
        },
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee",
            reqd: 1,
            get_query: function () {
                return {
                    filters: {
                        status: "Active",
                        employment_type: ["not like", "%engineer%"],
                    },
                };
            },
        },
    ],

    formatter: function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (!data || !value) return value;

        // 1. Color Palette for Attendance Statuses
        if (data.detail_label === __("Attendance Status")) {
            const statusColors = {
                "Present": "#28a745",        // Green
                "Work From Home": "#17a2b8", // Cyan / Teal
                "Absent": "#dc3545",         // Red
                "Half Day": "#fd7e14",       // Orange
                "On Leave": "#e83e8c",       // Pink / Magenta
                "Weekly Off": "#6c757d",     // Muted Gray
                "Holiday": "#6c757d",        // Muted Gray
            };

            const color = statusColors[value] || "#333333";
            value = `<span style="color: ${color}; font-weight: bold;">${value}</span>`;
        }

        // 2. Formatting Late Entry, Early Exit, and Time Duration
        if (
            (data.detail_label === __("Late Entry") || data.detail_label === __("Early Exit")) &&
            value !== "-"
        ) {
            value = `<span style="color: #dc3545; font-weight: 600;">${value}</span>`;
        } else if (data.detail_label === __("Shift") || data.detail_label === __("Working Hours")) {
            value = `<span style="color: #495057;">${value}</span>`;
        }

        return value;
    },
};