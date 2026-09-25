// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.query_reports["Employee Attendance Overveiw"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1,
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1,
        },
        {
            fieldname: "country",
            label: __("Country"),
            fieldtype: "Link",
            options: "Country",
        },
        {
            fieldname: "department",
            label: __("Department"),
            fieldtype: "Link",
            options: "Department",
        },
        {
            fieldname: "employment_type",
            label: __("Employment Type"),
            fieldtype: "Link",
            options: "Employment Type",
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
            fieldname: "attendance_status",
            label: __("Attendance Status"),
            fieldtype: "Select",
            options: "\nPresent\nAbsent\nHalf Day\nOn Leave\nWork From Home",
        },
    ],

    formatter: function (value, row, column, data, default_formatter) {
        if (!data) {
            return value;
        }

        // 1. Employee ID formatting: Strip out everything after the colon (e.g. ": Aadhira D")
        if (column.fieldname === "employee") {
            let raw_val = value || data.employee || "";
            if (!raw_val || raw_val === "-") return "-";

            // Extract ONLY the ID portion before the colon
            let emp_id = String(raw_val).split(":")[0].trim();

            return `
                <a href="/app/employee/${encodeURIComponent(emp_id)}"
                   data-doctype="Employee"
                   data-name="${emp_id}">
                    ${emp_id}
                </a>
            `;
        }

        // 2. Default formatter for all other fields
        value = default_formatter(value, row, column, data);

        if (!value || value === "-") {
            return value;
        }

        // Check In / Check Out formatting
        if (
            column.fieldname === "check_in" ||
            column.fieldname === "check_out"
        ) {
            return `<span class="indicator-pill darkgrey" style="font-weight: 500;">${data[column.fieldname]}</span>`;
        }

        // Working Hours formatting
        if (column.fieldname === "working_hours") {
            return `<span class="indicator-pill grey" style="font-weight: 600;">${data.working_hours}</span>`;
        }

        // Late Entry formatting
        if (column.fieldname === "late_entry") {
            let is_late = data.late_entry === "Yes";
            let color_class = is_late ? "red" : "gray";
            return `<span class="indicator-pill ${color_class}" style="font-weight: 500;">${data.late_entry}</span>`;
        }

        // Early Exit formatting
        if (column.fieldname === "early_exit") {
            let is_early = data.early_exit === "Yes";
            let color_class = is_early ? "orange" : "gray";
            return `<span class="indicator-pill ${color_class}" style="font-weight: 500;">${data.early_exit}</span>`;
        }

        // Attendance Status formatting
        if (column.fieldname === "attendance_status") {
            let status = data.attendance_status;
            let color_class = "grey";

            if (status === "Present") {
                color_class = "green";
            } else if (status === "Absent") {
                color_class = "red";
            } else if (status === "Half Day" || status === "On Leave") {
                color_class = "orange";
            } else if (status === "Work From Home") {
                color_class = "blue";
            }

            return `<span class="indicator-pill ${color_class}" style="font-weight: 600;">${status}</span>`;
        }

        // Request / Leave Details formatting
        if (column.fieldname === "request_details") {
            let val = data.request_details || "-";
            let color_class = "grey";

            if (val.includes("Approved")) {
                color_class = "green";
            } else if (
                val.includes("Pending") ||
                val.includes("Draft") ||
                val.includes("Open")
            ) {
                color_class = "yellow";
            } else if (
                val.includes("Rejected") ||
                val.includes("Cancelled")
            ) {
                color_class = "red";
            }

            return `<span class="indicator-pill ${color_class}" style="font-weight: 500;">${val}</span>`;
        }

        return value;
    }
};