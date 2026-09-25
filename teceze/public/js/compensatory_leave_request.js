frappe.ui.form.on('Compensatory Leave Request', {
    validate: function(frm){
        // Only show confirmation for a new Leave Application
        if (frm.is_new() && !frm._create_confirmed) {

            // Stop the current save
            frappe.validated = false;

            frappe.confirm(
                __("Are you sure you want to create this Compensatory Leave Request?"),

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

    after_save(frm) {
        // Reset for future saves
        frm._create_confirmed = false;
    },

})