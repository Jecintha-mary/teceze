frappe.ui.form.on('Project', {
    refresh: function(frm){

    },
    setup: function(frm) {
        frm.set_query('custom_sdm_id', function() {
            return {
                query: "teceze.teceze.overrides.project.get_sdm_user_employees"
            };
        });

        frm.set_query('custom_sdc_id', function() {
            return {
                query: "teceze.teceze.overrides.project.get_sdc_user_employees"
            };
        });

        frm.set_query('custom_project_manager', function() {
            return {
                query: "teceze.teceze.overrides.project.get_project_manager_user_employees"
            };
        });
    }
});