var RM = "";
var user = '';
var today_date = frappe.datetime.get_today()
frappe.ui.form.on('Leave Application', {
	refresh: function(frm) {
        //Status should be Open if new data
		if(frm.is_new()){
			if (frm.doc.status == "Approved"){
                frm.doc.status = "Open"
                cur_frm.refresh_field('status');
			}
		}
        var today = frappe.datetime.get_today();
        //Disable Duplicate functionality
        $(document).on('mouseover', function (events) {
            $("a:contains(Copy to Clipboard)").css({ 'pointer-events': 'none' }),
            $("a:contains(Duplicate)").css({ 'pointer-events': 'none' });
        })

        //Filter for active emploees
         frm.set_query("employee", function() {
            return {
                "filters": {
                    "status": "Active"
                }
            };
        });
        

        //Hide Submit button for employees and HR
		if(has_common(frappe.user_roles, ["System Manager","HR Manager"])){
		}else{
			if(frm.doc.employee_email == frappe.session.user || (frappe.user_roles.indexOf("HR User") > 0 && frm.doc.leave_approver!= frappe.session.user)){
				frm.page.clear_primary_action()
			}
		}

       
        //Status Non editable
		if(has_common(frappe.user_roles, ["System Manager","HR Manager"])){
        }else{
			if(!frm.is_new()){
				if(has_common(frappe.user_roles, ["HR User"]) && frm.doc.leave_approver != frappe.session.user){
					frm.set_df_property("status", "read_only", 1); }
				else if(has_common(frappe.user_roles, ["Leave Approver"]) && frm.doc.employee_email != frappe.session.user){
					frm.set_df_property("status", "read_only", 0);
				}else{	
						frm.set_df_property("status", "read_only", 1);
				}
			}
			else{
				frm.set_df_property("status", "read_only", 1);
			}
            
        }
	},

	leave_approver: function(frm){
        RM = frm.doc.leave_approver.trim();
        if(frappe.user.name){
            frappe.db.get_value('User', {name: frappe.user.name
            }, ['name', 'full_name'], (r) => {
                user = r.full_name;
                
            })
        }
        //Set leave aprover name
        if(frm.doc.leave_approver){
            frappe.call({
                method: 'teceze.teceze.doctype.my_white_list_functions.my_white_list_functions.get_approver',
                async:false,
                args: {
                    id: frm.doc.leave_approver
                }
            }).then(r => {
                let doc = r.message;
                frm.set_value("leave_approver_name",doc.full_name);
            });  
        }     
	},
	employee: function(frm){
        //Set leave aprover name
        if(frm.doc.leave_approver){
            frappe.call({
                method: 'teceze.teceze.doctype.my_white_list_functions.my_white_list_functions.get_approver',
                async:false,
                args: {
                    id: frm.doc.leave_approver
                }
            }).then(r => {
                let doc = r.message;
                frm.set_value("leave_approver_name",doc.full_name);
            }); 
        }
        
	},
	leave_type: function(frm){
        frm.trigger("calculate_total_days");
        
	},
	from_date: function(frm){
        if(frm.doc.from_date && frm.doc.to_date){
            frm.trigger("calculate_total_days");
        }
        
	}, 

    calculate_total_days: function(frm) {
		if (frm.doc.from_date && frm.doc.to_date && frm.doc.employee && frm.doc.leave_type) {
			var from_date = Date.parse(frm.doc.from_date);
			var to_date = Date.parse(frm.doc.to_date);

			if (to_date < from_date) {
				frappe.msgprint(__("To Date cannot be less than From Date"));
				frm.set_value('to_date', '');
                frm.doc.total_leave_days = "";
				return;
			}
			// server call is done to include holidays in leave days calculations
			return frappe.call({
				method: 'hrms.hr.doctype.leave_application.leave_application.get_number_of_leave_days',
				args: {
					"employee": frm.doc.employee,
					"leave_type": frm.doc.leave_type,
					"from_date": frm.doc.from_date,
					"to_date": frm.doc.to_date,
					"half_day": frm.doc.half_day,
					"half_day_date": frm.doc.half_day_date,
				},
				callback: function(r) {
					if (r && r.message) {
						frm.set_value('total_leave_days', r.message);
                        frm.doc.total_leave_days = r.message;
						// frm.trigger("get_leave_balance");
					}
				}
			});
		}
	},
	total_leave_days: function(frm){
        switch(frm.doc.leave_type) {
            case "Bereavement Leave":
                break;
            case "Casual Leave":
                if(frm.doc.from_date && frm.doc.to_date && frm.doc.leave_type == "Casual Leave" && frm.doc.employee){
                    if (frm.doc.total_leave_days > 2) { 
                        frm.doc.from_date = "";
                        frm.doc.to_date = "";
                        frm.doc.total_leave_days = "";
                        cur_frm.refresh_fields()
                        frappe.throw(__("Maximum 2 day is allowed to apply for CL"));
                        return false;
                    }
                }
            break;
            case "Sick Leave":
                if(frm.doc.from_date && frm.doc.to_date && frm.doc.leave_type  == "Sick Leave" && frm.doc.employee){
                    if (frm.doc.total_leave_days > 2) {        
                        frm.doc.from_date = "";
                        frm.doc.to_date = "";
                        cur_frm.refresh_fields()
                        frappe.throw(__("Maximum 2 days is allowed to apply for SL"));
                        return false;
                    }
                }
            break;
            
            case "Leave Without Pay":
            
            break;
            case "Maternity Leave":
            
            break;
            case "Paternity Leave":

            break;
            
       
		}
	},
});

function validate_application(frm){
    RM = frm.doc.leave_approver;
    if(frappe.user.name){
        frappe.db.get_value('User', {name: frappe.user.name
        }, ['name', 'full_name'], (r) => {
            user = r.full_name;
            
        })
    }
    if (frappe.user_roles.indexOf("Administrator") > 0){RM = "Administrator";} // Need to check this siva

    // if the application date in not the leave date then dont allow RM to apply
   
    //Check for Applied Before for the given month
    switch(frm.doc.leave_type) {
    case undefined:
        break;
    case "Maternity Leave":
        if ((frappe.user_roles.indexOf("HR User") >= 0  || frappe.user_roles.indexOf("Administrator") >= 0)){
        } else {
            if (frm.doc.from_date){
                if (frm.doc.from_date < frappe.datetime.add_days(frappe.datetime.get_today(), +30)) { // Check for MtL Applied 30 days in advance   
                    frm.doc.from_date = "";
                    frm.doc.to_date = "";
                    frm.doc.total_leave_days = "";
                    cur_frm.refresh_fields()
                    frappe.throw(__("Maternity Leave should be applied, 30 days in advance. Check with your RM."));
                    return false;
                }
                if (frm.doc.total_leave_days < 90 || frm.doc.total_leave_days > 180){
                    frappe.throw("Maternity Leave should be 90 to 180 days.")
                }
            }
        }
        break;
    
    }
}