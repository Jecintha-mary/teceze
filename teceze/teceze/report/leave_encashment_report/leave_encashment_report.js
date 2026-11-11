frappe.query_reports["Leave Encashment Report"] = {
    filters: [
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee",
            get_query: function () {
                return { filters: { status: "Active" } };
            },
            on_change: function () {
                let employee = frappe.query_report.get_filter_value("employee");

                if (employee) {
                    frappe.db.get_value("Employee", employee, "employee_name").then(r => {
                        frappe.query_report.set_filter_value("employee_name", r.message.employee_name);
                    });
                } else {
                    frappe.query_report.set_filter_value("employee_name", "");
                }
            }
        },
        {
            fieldname: "employee_name",
            label: __("Employee Name"),
            fieldtype: "Data",
            read_only: 1
        },
        {
            fieldname: "leave_period",
            label: __("Leave Period"),
            fieldtype: "Link",
            options: "Leave Period"
        }
    ]
};