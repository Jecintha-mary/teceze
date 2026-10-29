frappe.ui.form.on("Leave Encashment", {
    setup: function (frm) {
		frm.set_query("employee", function () {
			return {
				filters: {
					status: "Active",
					employment_type: "Full Time",
				},
			};
		});
	},
	
	encashment_date: function (frm) {
		if (!frm.doc.encashment_date) return;

		let d = moment(frm.doc.encashment_date);

		// moment months start from 0, so November = 10
		let is_valid = d.month() === 10 && d.date() >= 1 && d.date() <= 11;

		if (!is_valid) {
			frappe.throw(
				__("Leave Encashment can be applied only from 1st to 11th November.")
			);
		}
	},
});
