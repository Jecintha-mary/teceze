// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

var RM = "";
var user = '';
var today_date = frappe.datetime.get_today()
frappe.ui.form.on('Employee Permission Request', {
	onload: function(frm){
		//Document Read Only for HR
		if(has_common(frappe.user_roles, ["System Manager"])){
		}else{
			if(!frm.is_new() && frm.doc.employee_email != frappe.session.user && (frappe.user_roles.indexOf("HR Manager") > 0 && frm.doc.leave_approver != frappe.session.user)){
				frm.page.clear_primary_action();
				frm.set_read_only();
			}
		}
	},
	refresh: function(frm) {
		//Status should be Open if new data
		if(frm.is_new()){
			if (frm.doc.status == "Approved"){
				frm.doc.status = "Open"
				cur_frm.refresh_field('status');
			}
		}
		//Disable Duplicate functionality
        $(document).on('mouseover', function (events) {
            $("a:contains(Copy to Clipboard)").css({ 'pointer-events': 'none' }),
            $("a:contains(Duplicate)").css({ 'pointer-events': 'none' });
        })

        //Hide Cancel button for RM if time exceeds
		if(has_common(frappe.user_roles, ["System Manager"])){
		}
		else{
			if(frappe.session.user == frm.doc.leave_approver){
				if(frm.doc.permission_on < today_date){
					frm.page.clear_secondary_action()
					
				}
			}
			else{
				frm.page.clear_secondary_action()
			}
		}
			
		//Filter Active Employee
        frm.set_query("employee", function() {
            return {
                "filters": {
					"status": "Active"
				}
            };
        });

		//Hide Submit button for employees and HR
		if(has_common(frappe.user_roles, ["System Manager"])){
		}else{
			if(frm.doc.employee_email == frappe.session.user || (frappe.user_roles.indexOf("HR Manager") > 0 && frm.doc.leave_approver != frappe.session.user)){
				frm.page.clear_primary_action()
			}
		}
		//Non editable status for employee
		if(has_common(frappe.user_roles, ["System Manager"])){
        }else{
			if(!frm.is_new()){
				if(has_common(frappe.user_roles, ["HR Manager"]) && frm.doc.leave_approver != frappe.session.user){
					frm.set_df_property("status", "read_only", 1); }
				else if(has_common(frappe.user_roles, ["Leave Approver","Report Manager"]) && frm.doc.employee_email != frappe.session.user){
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
		RM = frm.doc.leave_approver;

	},
	validate: function(frm) {
		duplicate_permission(frm);
	    if (validate_permission(frm) === false){
	        frappe.validated = false;
	    }
	},
	from_time: function(frm){
		valid_permission(frm);
		valid_apply_permission(frm);
		duplicate_permission(frm);
	
	},
	to_time: function(frm){
		valid_permission(frm);
		valid_apply_permission(frm);
		duplicate_permission(frm);
	},
	permission_on:function(frm){
		valid_permission(frm);
		valid_apply_permission(frm);
		duplicate_permission(frm);
		//Not allow previous date
		if(has_common(frappe.user_roles, ["System Manager"])){
        }else{
			if(frm.doc.permission_on < today_date){
				frm.doc.permission_on = '';
				cur_frm.refresh_fields();
				frappe.throw("You don't have permission to create this document. Please contact admin.")
			}
		}
	},
	employee: function(frm) {
		valid_apply_permission(frm);
		valid_permission(frm);
		duplicate_permission(frm);
	    if (frm.doc.employee === "") {
	        return;
	    }
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
	    
		//HR should not allow to create employee permission request for other employees
		if(has_common(frappe.user_roles, ["System Manager"])){
		}else{
		if(frappe.user_roles.indexOf("HR Manager") >= 0 && frm.doc.employee_email != frappe.session.user && frappe.session.user != frm.doc.leave_approver){    
			frm.doc.employee = "";
			frm.doc.employee_name = "";
			frm.doc.employee_email = "";
			frm.doc.leave_approver = "";
			frm.doc.leave_approver_name = "";
			frm.doc.department = "";
			frm.doc.designation = "";   
			frm.doc.division = "";              
			frm.doc.permission_on = "";
			frm.doc.from_time = "";
			frm.doc.to_time = "";
			cur_frm.refresh_fields()
			frappe.msgprint("You don't have permission to create this document. Please contact admin.")  
			
		}
	}
	},
});

//Permission time validation
function validate_permission(frm){
    if (frm.doc.employee !== undefined) {
		if(frm.doc.from_time && frm.doc.to_time){
        	var splitEntryDatetime= frm.doc.from_time.split(':');
			var splitExitDatetime= frm.doc.to_time.split(':');
			var totalMinsOfEntry= splitEntryDatetime[0] * 60 + parseInt(splitEntryDatetime[1]) + splitEntryDatetime[0] / 60;
			var totalMinsOfExit= splitExitDatetime[0] * 60 + parseInt(splitExitDatetime[1]) + splitExitDatetime[0] / 60;
			var duration = parseInt(totalMinsOfExit - totalMinsOfEntry)/60;

			if (duration > 1){
				frappe.msgprint(__("Permission is valid for maximuim 1 hrs!"));
				frappe.validated = false;
				return false;
			}
	}
    if(frm.doc.from_time && frm.doc.to_time){
        if (Date.parse('1/1/1999 ' + frm.doc.to_time) <= Date.parse('1/1/1999 ' + frm.doc.from_time)){
			frm.doc.from_time = "";
			frm.doc.to_time = "";
			cur_frm.refresh_fields()
    	    frappe.throw(__("To Time can not be less than from time"));
    	    
        }
        if (Date.parse('1/1/1999 ' + frm.doc.from_time) < Date.parse("1/1/1999 9:00")){
			frm.doc.from_time = "";
			cur_frm.refresh_fields()
    	    frappe.throw(__("From Time can not be less than 9 AM"));
    	    
        }
        
        if (Date.parse('1/1/1999 ' + frm.doc.to_time) > Date.parse("1/1/1999 18:00")){
			frm.doc.to_time = "";
			cur_frm.refresh_fields()
    	    frappe.throw(__("To Time can not be greater than 6 PM"));
    	   
        }
	}
    	
    }
}
//Validate permission limitation
function valid_permission(frm){
    if(frm.doc.employee && frm.doc.permission_on && frm.is_new()){
    const PermissionDate = frm.doc.permission_on.split("-");
    	frappe.call({
    	"method": "teceze.teceze.doctype.my_white_list_functions.my_white_list_functions.permission_validation",
    	"args": {
    		"employee": frm.doc.employee,
    		"month": PermissionDate[1],
    		"year": PermissionDate[0]
    	},
    	callback:function(r){
    		if(r.message.length >= 2){
				frm.doc.employee = "";
				frm.doc.from_time = "";
				frm.doc.to_time = "";
				frm.doc.permission_on = "";
				frm.doc.leave_approver = "";
				frm.doc.employee_name = "";
				frm.doc.employee_email = "";
				frm.doc.department = "";
				frm.doc.designation = "";
				frm.doc.leave_approver_name = "";
				frm.doc.reason = "";
				cur_frm.refresh_fields()
    		    frappe.throw(__("Permission limit for the month exceeds. Please contact your RM"));
    		}
    	}
        });
	}
}

function valid_apply_permission(frm){
	if(has_common(frappe.user_roles, ["System Manager"])){
	}else{
		//Should not allow for previous date	
		if(frm.doc.employee && frm.doc.permission_on < today_date){	
				frm.doc.permission_on = "";
				frm.doc.from_time = "";
				frm.doc.to_time = "";
				cur_frm.refresh_fields()
				frappe.throw("You don't have permission to create this document. Please contact admin.")

		}
		//Should not allow future date for RM
		if(frm.doc.employee && frm.doc.employee_email != frappe.session.user && frm.doc.permission_on > today_date){
				frm.doc.permission_on = "";
				frm.doc.from_time = "";
				frm.doc.to_time = "";
				cur_frm.refresh_fields()
				frappe.throw("You don't have permission to create this document. Please contact admin.")
		}
		
	}
}

//Validate duplicate record with same date
function duplicate_permission(frm){
	if(frm.doc.employee && frm.doc.permission_on){
		frappe.call({
			"method": "teceze.teceze.doctype.employee_permission_request.employee_permission_request.validate_permission",
			"args": {
				"employee": frm.doc.employee,
				"permission_on": frm.doc.permission_on,
				"name":frm.doc.name
			},
			callback:function(r){
				if (r.message){		
					frappe.msgprint("Permission already applied for the same date!")
					frappe.validated = false
					}
			}
		})
	}
}