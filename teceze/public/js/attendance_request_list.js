frappe.listview_settings["Attendance Request"] = {
	add_fields: [
		"reason",
		"employee",
		"employee_name",
		"from_date",
		"to_date",
        "custom_status"
	],
	has_indicator_for_draft: 1,
	get_indicator: function (doc) {
		const status_color = {
			Approved: "green",
			Rejected: "red",
			Open: "orange",
			Draft: "red",
			Cancelled: "red",
			Submitted: "blue",
		};
		const custom_status =
			!doc.docstatus && ["Approved", "Rejected"].includes(doc.custom_status) ? "Draft" : doc.custom_status;
		return [__(custom_status), status_color[custom_status], "custom_status,=," + doc.custom_status];
	},
};
