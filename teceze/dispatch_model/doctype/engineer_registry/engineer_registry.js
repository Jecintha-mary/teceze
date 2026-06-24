// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Engineer Registry", {
// 	refresh(frm) {

// 	},
// });
// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt


frappe.ui.form.on("Engineer Registry", {

    validate(frm) {


        // Name Validation
        if (!frm.doc.name) {

            frappe.throw("Engineer Name is required");

        }


        if (frm.doc.name.length < 3) {

            frappe.throw(
                "Engineer Name should contain minimum 3 characters"
            );

        }


        let name_pattern = /^[A-Za-z ]+$/;

        if (!name_pattern.test(frm.doc.name)) {

            frappe.throw(
                "Engineer Name should contain only letters"
            );

        }



        // Skills Validation

        if (!frm.doc.skills || frm.doc.skills.length === 0) {

            frappe.throw(
                "Please select at least one skill"
            );

        }



        // Experience Validation

        if (frm.doc.experience === null || frm.doc.experience === undefined) {

            frappe.throw(
                "Experience is required"
            );

        }


        if (frm.doc.experience < 0) {

            frappe.throw(
                "Experience cannot be negative"
            );

        }



        // Location Validation

        if (!frm.doc.location) {

            frappe.throw(
                "Location is required"
            );

        }



        // Availability Validation

        if (!frm.doc.availability) {

            frappe.throw(
                "Availability is required"
            );

        }



        // Rating Validation

        if (frm.doc.rating === null || frm.doc.rating === undefined) {

            frappe.throw(
                "Rating is required"
            );

        }


        if (frm.doc.rating < 0 || frm.doc.rating > 5) {

            frappe.throw(
                "Rating should be between 0 and 5"
            );

        }


    }

});
