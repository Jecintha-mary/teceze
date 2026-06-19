// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt


frappe.ui.form.on('Probation Review Goals', {
	score: function(frm, cdt, cdn) {
		var d = locals[cdt][cdn];
		if (flt(d.score) > 5) {
			frappe.msgprint(__("Assessee Score must be less than or equal to 5"));
			d.score = 0;
			refresh_field('score', d.name, 'goals');
		}
		else {
			frm.trigger('set_score_earned');
		}
	},
	manager_score: function(frm, cdt, cdn) {
		var d = locals[cdt][cdn];
		if (flt(d.manager_score) > 5) {
			frappe.msgprint(__("Manager Score must be less than or equal to 5"));
			d.manager_score = 0;
			refresh_field('manager_score', d.name, 'goals');
		}
		else {
			frm.trigger('set_manager_score_earned');
		}
	},
	per_weightage: function(frm) {
		frm.trigger('set_score_earned');
	},
	goals_remove: function(frm) {
		frm.trigger('set_score_earned');
	}
});


frappe.ui.form.on('Probation Review', {
	setup: function(frm) {
		frm.add_fetch('employee', 'company', 'company');
	},

	calculate_total: function(frm) {
	  	let goals = frm.doc.goals || [];
		let total = 0;

		if (goals == []) {
			frm.set_value('total_score', 0);
			return;
		}
		for (let i = 0; i<goals.length; i++) {
			total = flt(total)+flt(goals[i].score_earned);
		}
		if (!isNaN(total)) {
			frm.set_value('total_score', total);
			frm.refresh_field('calculate_total');
		}
	},

	calculate_manager_total: function(frm) {
	  	let goals = frm.doc.goals || [];
		let total = 0;

		if (goals == []) {
			frm.set_value('manager_total_score', 0);
			return;
		}
		for (let i = 0; i<goals.length; i++) {
			total = flt(total)+flt(goals[i].m_score_earned);
		}
		if (!isNaN(total)) {
			frm.set_value('manager_total_score', total);
			frm.refresh_field('calculate_manager_total');
		}
	},

	set_score_earned: function(frm) {
		let goals = frm.doc.goals || [];
		for (let i = 0; i<goals.length; i++) {
			var d = locals[goals[i].doctype][goals[i].name];
			if (d.score && d.per_weightage) {
				d.score_earned = flt(d.per_weightage*d.score, precision("score_earned", d))/100;
			}
			else {
				d.score_earned = 0;
			}
			refresh_field('score_earned', d.name, 'goals');
		}
		frm.trigger('calculate_total');
	},

	set_manager_score_earned: function(frm) {
		let goals = frm.doc.goals || [];
		for (let i = 0; i<goals.length; i++) {
			var d = locals[goals[i].doctype][goals[i].name];
			if (d.manager_score && d.per_weightage) {
				d.m_score_earned = flt(d.per_weightage*d.manager_score, precision("m_score_earned", d))/100;
			}
			else {
				d.m_score_earned = 0;
			}
			refresh_field('m_score_earned', d.name, 'goals');
		}
		frm.trigger('calculate_manager_total');
	},




	refresh: function(frm) {
		frm.get_field('goals').grid.cannot_add_rows = true;
        frm.get_field("goals").grid.df.cannot_delete_rows = true;
		frm.fields_dict.goals.grid.update_docfield_property("manager_score","read_only",1);
		frm.fields_dict.goals.grid.update_docfield_property("m_score_earned","read_only",1);
		frm.fields_dict.goals.grid.update_docfield_property("per_weightage","read_only",1);
		frm.fields_dict.goals.grid.update_docfield_property("description","read_only",1);
		frm.fields_dict.goals.grid.update_docfield_property("kra","read_only",1);
		frm.fields_dict.goals.grid.update_docfield_property("remarks","read_only",1);
        frm.set_df_property('remarks', 'read_only', 1);
        frm.set_df_property('manager_remarks', 'read_only', 1);
        frm.set_df_property('manager_reco', 'read_only', 1);
        frm.set_df_property('probation_status', 'read_only', 1);
        frm.set_df_property('hr_remarks', 'read_only', 1);
        frm.refresh_field("goals");
        switch(frm.doc.workflow_state) {
        case undefined:
        case "Self Review":
			frm.set_df_property('remarks', 'read_only', 0);
			frm.refresh_field("goals");
			break;
            frm.set_df_property('remarks', 'read_only', 0);
            break;
        case "Reporting Manager Review":
			frm.fields_dict.goals.grid.update_docfield_property("manager_score","read_only",0);
			frm.fields_dict.goals.grid.update_docfield_property("m_score_earned","read_only",1);
			frm.fields_dict.goals.grid.update_docfield_property("remarks","read_only",0);
            frm.set_df_property('manager_reco', 'read_only', 0);
            frm.set_df_property('manager_remarks', 'read_only', 0);
			frm.refresh_field('manager_reco')
            break;
        case "HR Review":
            frm.set_df_property('probation_status', 'read_only', 0);
            frm.set_df_property('hr_remarks', 'read_only', 0);
            break;
        case "Completed":
            frm.set_read_only();
            break;
        }		
	    frm.set_query("employee", function() {
            return {
                "filters": {
                    "employment_type": "Probation",
                    "status": "Active"
                }
            };
        });
	},
	onload: function(frm) {
        frm.get_field('goals').grid.cannot_add_rows = true;
        frm.get_field("goals").grid.df.cannot_delete_rows = true;
	},
	employee: function(frm) {
        frappe.call({
        	method: 'teceze.teceze.doctype.probation_review.probation_review.get_rm_details',
        	async:false,
        	args: {
        		rm_id: frm.doc.reporting_manager
        	}
        }).then(r => {
            let doc = r.message;
			console.log(doc)
            frm.set_value("rm_name",doc.employee_name);
            frm.set_value("rm_email",doc.company_email);
			frm.refresh_field('rm_name')
			frm.refresh_field('rm_email')
        });
	},
    kra_template: function(frm){
        if(frm.is_new()){
            frappe.db.get_doc('Appraisal Template', frm.doc.kra_template)
            .then(doc => {
                frm.set_value('goals', null);
                $.each(doc.goals, function(index, row){
                    var child = frm.add_child("goals");
					child.kra = row.key_result_area,
                    child.per_weightage = row.per_weightage;
					child.description = row.description;
                    child.score = 0;
                    child.manager_score = 0;
                    child.remarks = null;
                    child.score_earned = 0;
                    child.m_score_earned = 0;
                });
                cur_frm.refresh_field('goals');
            });
        }
    },
    after_workflow_action: (frm) => {
        if (frm.doc.workflow_state == "Completed"){
            switch(frm.doc.probation_status) {
            case "Accomplished":
                //*** Update the Employement Type in employee doc
                frappe.show_alert({message:__('Pl. proceed with Employee Promotion to <b>Full-time</b>!'),indicator:'green'}, 5);
                break;
            case "Extended":
                //*** Update the probation_end_date in employee doc
                frappe.db.set_value('Employee', frm.doc.employee, {probation_end_date: frappe.datetime.add_days(frm.doc.probation_end_date, +30)});
                frappe.show_alert({message:__('Probation Period extended for 30 days!'),indicator:'green'}, 5);                    
                break;
            case "Separate":
                frappe.show_alert({message:__('Oops, my bad to miss an employee! Procced with Emploee Seperation SOP.'),indicator:'green'}, 5);
                break;
            }
        }
    }
});