// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Engineer Onboarding", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("Engineer Onboarding", {
    setup(frm) {

            frm.set_query("country", function () {
                return {
                    filters: {
                        custom_region: frm.doc.region
                    }
                };
            });
        },

        region(frm) {
            frm.set_value("country", "");
        }

})