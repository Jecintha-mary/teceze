frappe.ui.form.on("Attendance Request", {

    employee: function(frm) {
        fetch_existing_logs(frm);
    },

    from_date: function(frm) {
        fetch_existing_logs(frm);
    },

    refresh: function(frm) {
        fetch_existing_logs(frm);
    }

});


function fetch_existing_logs(frm) {

    if (!frm.doc.employee || !frm.doc.from_date)
        return;

    frappe.call({

        method: "teceze.overrides.attendance_regularization.get_existing_checkins",

        args: {
            employee: frm.doc.employee,
            from_date: frm.doc.from_date
        },

        callback: function(r) {

            if (!r.message)
                return;

            frm.set_value(
                "custom_existing_check_in",
                r.message.existing_check_in || ""
            );

            frm.set_value(
                "custom_existing_check_out",
                r.message.existing_check_out || ""
            );

        }

    });

}