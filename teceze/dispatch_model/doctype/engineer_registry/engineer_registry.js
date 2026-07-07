// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Engineer Registry", {
// 	refresh(frm) {

// 	},
// });
// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt


// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt

// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt

// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt

// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt


// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd.
// For license information, please see license.txt


frappe.ui.form.on("Engineer Registry", {

    validate(frm) {


        // Engineer Name Validation

        if (!frm.doc.engineer_name) {

            frappe.throw("Engineer Name is required");

        }


        if (frm.doc.engineer_name.length < 3) {

            frappe.throw(
                "Engineer Name should contain minimum 3 characters"
            );

        }


        let name_pattern = /^[A-Za-z ]+$/;


        if (!name_pattern.test(frm.doc.engineer_name)) {

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

        if (
            frm.doc.experience === null ||
            frm.doc.experience === undefined
        ) {

            frappe.throw(
                "Experience is required"
            );

        }


        let experience_pattern = /^[0-9]+$/;


        if (!experience_pattern.test(frm.doc.experience)) {

            frappe.throw(
                "Experience should contain only numbers"
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


        let location_pattern = /^[A-Za-z ]+$/;


        if (!location_pattern.test(frm.doc.location)) {

            frappe.throw(
                "Location should contain only letters"
            );

        }



        // Availability Validation

        if (!frm.doc.availability) {

            frappe.throw(
                "Availability is required"
            );

        }



        // Project Validation

        if (frm.doc.project) {

            if (frm.doc.project.length < 2) {

                frappe.throw(
                    "Project name should contain minimum 2 characters"
                );

            }

        }



        // Rating Validation

        if (
            frm.doc.rating === null ||
            frm.doc.rating === undefined
        ) {

            frappe.throw(
                "Rating is required"
            );

        }



        if (frm.doc.rating < 0 || frm.doc.rating > 5) {

            frappe.throw(
                "Rating should be between 0 and 5"
            );

        }



        // Rating Decimal Validation

        let rating_pattern = /^\d(\.\d)?$/;


        if (!rating_pattern.test(frm.doc.rating)) {

            frappe.throw(
                "Rating should have maximum one decimal place (Example: 4.8)"
            );

        }


    }

});