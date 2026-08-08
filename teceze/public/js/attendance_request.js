frappe.ui.form.on("Attendance Request", {

	refresh(frm) {
		frm.trigger("show_attendance_warnings");
		frm.trigger("set_request_type_options");
		frm.trigger("toggle_regularization_fields");

		if (frm.doc.reason === "Regularization" && frm.doc.from_date) {
			frm.set_value("to_date", frm.doc.from_date);
		}
	},

	show_attendance_warnings(frm) {

		if (!frm.is_new() && frm.doc.docstatus === 0) {

			frm.dashboard.clear_headline();

			frm.call("get_attendance_warnings").then((r) => {

				if (r.message?.length) {

					frm.dashboard.reset();

					frm.dashboard.add_section(
						frappe.render_template("attendance_warnings", {
							warnings: r.message || [],
						}),
						__("Attendance Warnings"),
					);

					frm.dashboard.show();
				}
			});
		}
	},

	employee(frm) {

		if (frm.doc.employee && frm.doc.from_date && !frm.doc.shift) {
			frm.trigger("set_employee_shift");
		}

		if (
			frm.doc.reason === "Regularization" &&
			frm.doc.from_date
		) {
			frm.trigger("fetch_existing_checkins");
		}
	},

	from_date(frm) {

		if (frm.doc.reason === "Regularization") {
			frm.set_value("to_date", frm.doc.from_date);
		}

		if (frm.doc.employee && frm.doc.from_date && !frm.doc.shift) {
			frm.trigger("set_employee_shift");
		}

		if (
			frm.doc.reason === "Regularization" &&
			frm.doc.employee
		) {
			frm.trigger("fetch_existing_checkins");
		}
	},

	reason(frm) {

		frm.trigger("set_request_type_options");
		frm.trigger("toggle_regularization_fields");

		if (frm.doc.reason === "Regularization") {

			if (frm.doc.from_date) {
				frm.set_value("to_date", frm.doc.from_date);
			}

			if (frm.doc.employee && frm.doc.from_date) {
				frm.trigger("fetch_existing_checkins");
			}
		}
	},

	custom_request_type(frm) {

		frm.trigger("toggle_regularization_fields");

		if (
			frm.doc.reason === "Regularization" &&
			frm.doc.employee &&
			frm.doc.from_date
		) {
			frm.trigger("fetch_existing_checkins");
		}
	},

	set_request_type_options(frm) {

		if (frm.doc.reason === "Regularization") {

			frm.set_df_property(
				"custom_request_type",
				"options",
				[
					"",
					"Forgot Check In",
					"Forgot Check Out"
				].join("\n")
			);

		} else {

			frm.set_df_property(
				"custom_request_type",
				"options",
				""
			);

			frm.set_value("custom_request_type", "");
		}
	},

	toggle_regularization_fields(frm) {

		let regularization = frm.doc.reason === "Regularization";

		frm.toggle_display("to_date", !regularization);

		frm.toggle_display("custom_request_type", regularization);

		frm.toggle_display("custom_check_in", regularization);

		frm.toggle_display("custom_check_out", regularization);

	},

	fetch_existing_checkins(frm) {

		if (
			!frm.doc.employee ||
			!frm.doc.from_date ||
			frm.doc.reason !== "Regularization"
		) {
			return;
		}

		frm.set_value("to_date", frm.doc.from_date);

		frappe.call({

			method: "teceze.api.attendance_regularization.get_existing_checkins",

			args: {
				employee: frm.doc.employee,
				from_date: frm.doc.from_date,
			},
            freeze: true,
			callback: function(r) {
				frm.set_value("custom_check_in", "");
				frm.set_value("custom_check_out", "");

				if (!r.message) return;

				frm.set_value(
					"custom_check_in",
					r.message.check_in || ""
				);

				frm.set_value(
					"custom_check_out",
					r.message.check_out || ""
				);

				// Optional hidden fields
				if (frm.fields_dict.custom_check_in_doc) {
					frm.set_value(
						"custom_check_in_doc",
						r.message.check_in_doc || ""
					);
				}

				if (frm.fields_dict.custom_check_out_doc) {
					frm.set_value(
						"custom_check_out_doc",
						r.message.check_out_doc || ""
					);
				}
			},
		});
	},

	set_employee_shift(frm) {

		if (!frm.doc.employee || !frm.doc.from_date) return;

		frappe.call({

			method: "hrms.hr.doctype.attendance.attendance.get_employee_shift",

			args: {
				employee: frm.doc.employee,
				for_date: frm.doc.from_date,
				consider_default_shift: true,
			},

			callback(r) {

				if (r.message && !frm.doc.shift) {
					frm.set_value("shift", r.message);
				}
			},
		});
	},
});