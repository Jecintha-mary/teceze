frappe.ui.form.on("Shift Request", {
    setup(frm) {
        // Filter Shift Type by Work Location
        frm.set_query("shift_type", function () {
            const location = frm.doc.custom_work_location;

            if (!location) {
                return {
                    filters: {
                        name: ["=", ""]
                    }
                };
            }
            return {
                filters: {
                    custom_location: location
                }
            };
        });
     },
     refresh (frm){
    
        //Hide Submit button for employees and HR
		if(has_common(frappe.user_roles, ["System Manager","HR Manager"])){
		}else{
			if(frm.doc.custom_employee_email == frappe.session.user || (frappe.user_roles.indexOf("HR User") > 0 && frm.doc.approver!= frappe.session.user)){
				frm.page.clear_primary_action()
				frm.page.clear_secondary_action()
                frm.page.actions.hide();
                frm.page.wrapper
                .find('.actions-btn-group')
                .hide();
                }
		}
     },
     
    validate(frm) {
    const today = frappe.datetime.get_today();

    // Validate From Date
    if (frm.doc.from_date && frm.doc.from_date < today) {
        frappe.throw(
            __("From Date cannot be in the past. Please select today or a future date.")
        );
    }

    // Confirm before creating a new Shift Request
    if (frm.is_new() && !frm._create_confirmed) {
        // Stop the current save
        frappe.validated = false;

        frappe.confirm(
            __("Are you sure you want to create this Shift Request?"),

            // Yes
            () => {
                frm._create_confirmed = true;
                frm.save();
            },

            // No
            () => {
                frm._create_confirmed = false;
            }
        );
    }
},
});
