// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Dispatch Request", {
// 	refresh(frm) {

// 	},
// });
// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt


frappe.ui.form.on("Dispatch Request", {

    validate(frm) {


        // Account Name validation
        if (!frm.doc.account_name) {

            frappe.throw("Account Name is required");

        }


        if (frm.doc.account_name.length < 2) {

            frappe.throw(
                "Account Name should contain at least 2 characters"
            );

        }


        // Site Address validation
        if (!frm.doc.site_address) {

            frappe.throw("Site Address is required");

        }


        // Country validation
        if (!frm.doc.country) {

            frappe.throw("Country is required");

        }


        // Location validation
        if (!frm.doc.location__city) {

            frappe.throw("Location / City is required");

        }


        // Site Contact validation
        if (!frm.doc.site_contact_name) {

            frappe.throw("Site Contact Name is required");

        }


        // Phone validation
        if (!frm.doc.contact_phone) {

            frappe.throw("Contact Phone is required");

        }


        if (frm.doc.contact_phone.length < 10) {

            frappe.throw(
                "Contact Phone should contain minimum 10 digits"
            );

        }


        // Email validation
        if (frm.doc.email_id) {

            let email_pattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (!email_pattern.test(frm.doc.email_id)) {

                frappe.throw(
                    "Please enter a valid Email ID"
                );

            }

        }


        // Date validation
        if (!frm.doc.date_of_activity) {

            frappe.throw(
                "Date of Activity is required"
            );

        }


        // Duration validation
        if (!frm.doc.estimated_duration) {

            frappe.throw(
                "Estimated Duration is required"
            );

        }


        // Time validation
        if (!frm.doc.time_of_activity) {

            frappe.throw(
                "Time of Activity is required"
            );

        }

    }

});
