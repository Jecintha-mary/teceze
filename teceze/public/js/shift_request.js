
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

    refresh(frm) {
        // System Manager and HR Manager can submit
        if (has_common(frappe.user_roles, [
            "System Manager",
            "HR Manager"
        ])) {
            return;
        }

        const current_user = frappe.session.user;

        // Employee applying for their own request
        const is_own_request =
            frm.doc.custom_employee_email === current_user;

        // Shift Request Approver can submit only requests
        // assigned to them, unless it is their own request
        const is_approver_not_assigned =
            has_common(frappe.user_roles, ["Shift Request Approver"]) &&
            frm.doc.approver !== current_user;

        if (is_own_request || is_approver_not_assigned) {
            frm.page.clear_primary_action();
            frm.page.clear_secondary_action();
        }
    }
});