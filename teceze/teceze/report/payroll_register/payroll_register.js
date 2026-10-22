// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt
frappe.query_reports["Payroll Register"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
			width: "100px",
		},
		{
			fieldname: "to_date",
			label: __("To"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
			width: "100px",
		},
		{
			fieldname: "currency",
			fieldtype: "Link",
			options: "Currency",
			label: __("Currency"),
			default: erpnext.get_currency(frappe.defaults.get_default("Company")),
			width: "50px",
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
			width: "100px",
		},
		// {
		// 	fieldname: "company",
		// 	label: __("Company"),
		// 	fieldtype: "Link",
		// 	options: "Company",
		// 	default: frappe.defaults.get_user_default("Company"),
		// 	width: "100px",
		// },
		{
			fieldname: "docstatus",
			label: __("Document Status"),
			fieldtype: "Select",
			options: ["Draft", "Submitted", "Cancelled"],
			default: "Submitted",
			width: "100px",
		},
		{
			fieldname: "department",
			label: __("Department"),
			fieldtype: "Link",
			options: "Department",
			width: "100px",
			get_query: function () {
				return {
					filters: {
						company: frappe.query_report.get_filter_value("company"),
					},
				};
			},
		},
		{
			fieldname: "designation",
			label: __("Designation"),
			fieldtype: "Link",
			options: "Designation",
			width: "100px",
		},
		// {
		// 	fieldname: "branch",
		// 	label: __("Branch"),
		// 	fieldtype: "Link",
		// 	options: "Branch",
		// 	width: "100px",
		// },
	],
formatter: function (value, row, column, data, default_formatter) {
    value = default_formatter(value, row, column, data);

    if (column.fieldname === "status" && data) {
        let background = "";
        let color = "";

        if (data.status === "Submitted") {
            background = "#DDF5E7";
            color = "#087F5B";
        } else if (data.status === "Draft") {
            background = "#FFF0D6";
            color = "#A65B00";
        } else if (data.status === "Cancelled") {
            background = "#FDEBEC";
            color = "#D93036";
        }

        if (background) {
            value = `<span style="
                display: inline-block;
                background-color: ${background};
                color: ${color};
                padding: 3px 10px;
                border-radius: 15px;
                font-weight: 500;
                line-height: 1.3;
            ">${value}</span>`;
        }
    }

    return value;
},

};
