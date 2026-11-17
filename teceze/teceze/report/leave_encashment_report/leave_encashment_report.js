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
                let report = frappe.query_report;
                let employee = report.get_filter_value("employee");

                if (!employee) {
                    report.set_filter_value("employee_name", "");
                    report.refresh();
                    return;
                }

                frappe.db.get_value("Employee", employee, "employee_name").then(r => {
                    if (report.get_filter_value("employee") !== employee) {
                        return;
                    }

                    let name = (r.message && r.message.employee_name) || "";
                    report.set_filter_value("employee_name", name);
                    report.refresh();
                });
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
            options: "Leave Period",
            on_change: function () {
                frappe.query_report.refresh();
            }
        },
        {
            fieldname: "show_zero_balance",
            label: __("Show Employees with Nil Leave Balance"),
            fieldtype: "Check",
            default: 0,
            on_change: function () {
                frappe.query_report.refresh();
            }
        }
    ],

    onload: function (report) {
        let emp_filter = report.get_filter("employee");

        emp_filter.$input.off("input.clearname").on("input.clearname", function () {
            if (!$(this).val()) {
                report.set_filter_value("employee_name", "");
            }
        });
    }
};
