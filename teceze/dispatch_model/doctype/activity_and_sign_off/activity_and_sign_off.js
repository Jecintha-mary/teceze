frappe.ui.form.on("Activity And Sign-Off", {
    time_in(frm) {
        calculate_working_hours(frm);
    },
    time_out(frm) {
        calculate_working_hours(frm);
    },
    validate(frm) {
        calculate_working_hours(frm);

        const { time_in, time_out } = frm.doc;
        if (!time_in || !time_out) return;

        const start = moment(time_in, "HH:mm:ss");
        const end = moment(time_out, "HH:mm:ss");

        if (end.isSameOrBefore(start)) {
            frappe.msgprint({
                title: __("Invalid Time"),
                message: __("Time Out must be later than Time In."),
                indicator: "red",
            });
            frappe.validated = false;
            return;
        }

        if (flt(frm.doc.working_hours) <= 0) {
            frappe.msgprint({
                title: __("Invalid Working Hours"),
                message: __("Working Hours must be greater than 0."),
                indicator: "red",
            });
            frappe.validated = false;
        }
    },
});

function calculate_working_hours(frm) {
    const { time_in, time_out } = frm.doc;

    frm.set_df_property("time_out", "description", "");

    if (!time_in || !time_out) {
        frm.set_value("working_hours", 0);
        return;
    }

    const start = moment(time_in, "HH:mm:ss");
    const end = moment(time_out, "HH:mm:ss");

    if (!start.isValid() || !end.isValid()) return;

    if (end.isSameOrBefore(start)) {
        frm.set_df_property(
            "time_out",
            "description",
            `<span style="color: var(--red-500);">${__("Time Out must be later than Time In")}</span>`
        );
        frm.set_value("working_hours", 0);
        return;
    }

    const hours = flt(end.diff(start, "seconds") / 3600, 2);
    frm.set_value("working_hours", hours);
}