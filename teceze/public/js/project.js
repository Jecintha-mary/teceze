frappe.ui.form.on('Project', {

    setup: function(frm) {
        frm.set_query('custom_sdm', function() {
            return {
                filters: {
                    is_active: 1,
                    service_team: "SDM"
                }
            };
        });
        frm.set_query('custom_sdc', function() {
            return {
                filters: {
                    is_active: 1,
                    service_team: "SDC"
                }
            };
        });
    }
});