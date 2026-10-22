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
     validate(frm) {
     const today = frappe.datetime.get_today();
     if (frm.doc.from_date &&frm.doc.from_date < today) {
           frappe.throw(__("From Date cannot be in the past. Please select today or a future date.")
           );
       }
    },
     refresh (frm){
        const from_date_field = frm.fields_dict.from_date;
        if (from_date_field && from_date_field.datepicker) {
            from_date_field.datepicker.update({
              minDate: frappe.datetime.get_today()
            });
      }
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
    


});
