frappe.ui.form.on("Attendance", {
    refresh: function(frm){
        //Hide Submit button for employees and HR
		if(has_common(frappe.user_roles, ["System Manager","HR Manager"])){
		}else{
				frm.page.clear_primary_action()
				frm.page.clear_secondary_action()			
		}
    }
})