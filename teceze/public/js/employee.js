// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employee", {
	setup(frm) {
        frm.set_value('designation', '');

        frm.set_query('designation', function() {
            return {
                filters: {
                    custom_department: frm.doc.department
                }
            };
        });
    },

});
