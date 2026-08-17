frappe.ui.form.on("Timesheet", {
    onload(frm) {
        frm.remove_custom_button(__("Start Timer"));
        frm.remove_custom_button(__("Resume Timer"));
    }
});