// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt


var imgs = []
var task_status = []
const date = new Date();

let day = date.getDate();
let month = date.getMonth() + 1;
let year = date.getFullYear();

if (month<10){
	month = "0"+month
}
let currentDate = `${year}-${month}-${day}`;

date.setDate(date.getDate() + 5);
let wday = date.getDate();
let wmonth = date.getMonth() + 1;
if (wmonth<10){
	wmonth = "0"+wmonth
}
let wyear = date.getFullYear();
let week_date = `${wyear}-${wmonth}-${wday}`;


frappe.query_reports["_Project Health Report"] = {
	"filters": [
		{
			"fieldname": "project",
			"label": __("Project"),
			"fieldtype": "Link",
			"options": "Project",
			"on_change": function (query_report) {
				frappe.query_report.refresh();
				project = frappe.query_report.get_filter_value('project');
				if (project) {
					frappe.db.get_value('Project', {
						name: project
					}, ['status', 'project_name'], (r) => {
						var proj_status = r.status + ": " + r.project_name
						frappe.query_report.set_filter_value("project_name", proj_status);
						frappe.query_report.refresh();
					})
				} else {
					frappe.query_report.set_filter_value("project_name", "");
					frappe.query_report.refresh();
				}
			},
			get_query: function () {
				var type = frappe.query_report.get_filter_value('project_type');
				var dep = frappe.query_report.get_filter_value('department');
				if (type && dep) {
					return {
						filters: {
							'project_type': type,
							'department': dep
						}
					}
				}
				if (type) {
					return {
						filters: {
							'project_type': type,
						}
					}
				}
				if (dep) {
					return {
						filters: {
							'department': dep
						}
					}
				}
			}
		},
		{
			"fieldname": "project_name",
			"label": __("Project Name"),
			"fieldtype": "Data",
			"read_only": 1,
			"depends_on": "eval:doc.project",
		},
		{
			"fieldname": "analysis",
			"label": __(""),
			"fieldtype": "Select",
			"options": ["Task Analysis", "Log Analysis", "Summarized View", "Project P&L"],
			"default": "Task Analysis",
			"depends_on": "eval:doc.project",
			"on_change": function (query_report) {
				frappe.query_report.refresh();
			}
		},
		{
			"fieldname": "show_tags",
			"label": __("Show Tags"),
			"fieldtype": "Check",
			"depends_on": "eval:doc.project && doc.analysis == 'Task Analysis'",
			"on_change": function (query_report) {
				frappe.query_report.refresh();
			}
		},
		{
			"fieldname": "en_var",
			"label": __("Enable Variance"),
			"fieldtype": "Check",
			"depends_on": "eval:doc.project && doc.analysis == 'Task Analysis'",
			"on_change": function (query_report) {
				frappe.query_report.refresh();
			}
		},

	],
	onload: function () {
		setTimeout(function mysamm(){
			var project = frappe.query_report.get_filter_value('project');
			if (project) {
				frappe.db.get_value('Project', {
					name: project
				}, ['status', 'project_name'], (r) => {
					var proj_status = r.status + ": " + r.project_name
					frappe.query_report.set_filter_value("project_name", proj_status);
					frappe.query_report.refresh();
				})
			} else {
				frappe.query_report.set_filter_value("project_name", "");
				frappe.query_report.refresh();
			}
		},200)
		
		frappe.query_report.refresh();
		frappe.call({

			"method": "teceze.teceze.report._project_health_report._project_health_report.get_user_image",
			callback: function (r) {
				imgs = r.message
			}
		});
		frappe.call({
			"method": "teceze.teceze.report._project_health_report._project_health_report.get_status",
			callback: function (r) {
				task_status = r.message
			}
		});
	},

	"formatter": function (value, row, column, data, default_formatter) {
		analysis = frappe.query_report.get_filter_value('analysis');
		if (analysis == "Project P&L") {
			if (value == undefined || value == null || value == 0) {
				value = ""
				return value
			}
		}

		if (data && column.fieldname == 'exp_hrs') {
			if (data.exp_hrs != null) {
				if (data.division !== '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
					value = `<span style='float:right;'>${value}</span>`;
					val_ac = parseFloat(data.exp_hrs)
					data.exp_hrs = val_ac.toFixed(2);
					return value
				}
			}
		}
		// //progresss bar 
		// if (data && column.fieldname == 'progress' && value != null) {
		// 	var prog_bar = ''
		// 	prog_bar += '<div class="list-row-col ellipsis hidden-xs text-right" style="padding-top:2px;padding-left:8px">'
		// 	prog_bar += '<span class="ellipsis" title="'+ str(width)+'% Completed">'
		// 	prog_bar +=	'<a class="filterable ellipsis" data-filter="per_ordered,=,">'
		// 	prog_bar +=	'<div class="progress" style="margin: 0px;">'
		// 	prog_bar +=	'<div class="progress-bar progress-bar-success" role="progressbar" aria-valuenow="" aria-valuemin="0" aria-valuemax="100" style="width:'+ str(width)+'%;opacity:0.3;">'
		// 	prog_bar +=	'</div>'
		// 	prog_bar +=	'</div>'
		// 	prog_bar +=	'</a>'
		// 	prog_bar +=	'</span>'
		// 	prog_bar +=	'</div>'
		// 	value = 
		// }

		if (data && column.fieldname == 'actual_hrs') {
			if (data.actual_hrs != null) {
				if (data.exp_hrs < data.actual_hrs) {
					if (data.division !== '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
						value = `<span style='color:#FF0000!important;float:right;'>${value}</span>`;
						val_ac = parseFloat(data.actual_hrs)
						data.actual_hrs = val_ac.toFixed(2);
						return value
					}
				}
			}

			if (data.actual_hrs != null) {
				if (data.exp_hrs > data.actual_hrs) {
					if (data.division !== '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
						value = `<span style='color:#32CD32!important;float:right;'>${value}</span>`;
						val_ac = parseFloat(data.actual_hrs)
						data.actual_hrs = val_ac.toFixed(2);
						return value
					}
				}
			}
			if (data.actual_hrs != null) {
				if (data.exp_hrs == data.actual_hrs) {
					if (data.division !== '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
						value = `<span style='color:#f8814f!important;float:right;'>${value}</span>`;
						val_ac = parseFloat(data.actual_hrs)
						data.actual_hrs = val_ac.toFixed(2);
						return value
					}
				}
			}

		}


		if (data && column.fieldname == 'estimated_hrs') {
			if (data.division == '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
				val_estimated = parseFloat(data.estimated_hrs)
				data.estimated_hrs = val_estimated.toFixed(2);
				value = data.estimated_hrs
				value = "<b>" + value + "</b>"
				value = `<span style="float: right;" >${value}</span>`
				return value
			}
		}

		if (data && column.fieldname == 'actual_hrs') {
			value = `<span style="float: right;" >${value}</span>`
			if (data.division == '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
				val_ac = parseFloat(data.actual_hrs)
				data.actual_hrs = val_ac.toFixed(2);
				value = data.actual_hrs
				value = "<b>" + value + "</b>"
				value = `<span style="float: right;" >${value}</span>`
				return value
			}
		}


		if (data && column.fieldname == 'exp_hrs') {
			if (data.division == '<p style="color:inherit; font-weight: 600; opacity: 1.0;">Total</p>') {
				val_exp = parseFloat(data.exp_hrs)
				data.exp_hrs = val_exp.toFixed(2);
				value = data.exp_hrs
				value = "<b>" + value + "</b>"
				value = `<span style="float: right;" >${value}</span>`
				return value
			}
		}


		if (value !== undefined && value !== null) {
			if (data && column.fieldname == "division" || column.fieldname == "remarks") {
				column.align = 'center';
				value = `<span style="float: left;" >${value}</span>`;
			}
			if (data && column.fieldname == "actual_hrs" || column.fieldname == "exp_hrs" ||
				column.fieldname == "estimated_hrs") {
				column.align = 'center';
				value = `<span style="float:right;" >${value}</span>`;
			}
		}

		//log analysis
		var months_name = ['apr_', 'may_', 'jun_', 'jul_', 'aug_', 'sep_', 'oct_', 'nov_', 'dec_', 'jan_', 'feb_', 'mar_']
		months_name.map((mon, index, array) => {
			if (data && value != undefined) {
				if (column.fieldname.includes(mon)) {
					value = parseFloat(value).toFixed(2)
					value = `<span style="float:right !important" >${value}</span>`;
				}
			}
			if (data.employee == 'Total' && value !== undefined && value !== null) {
				if (column.fieldname.includes(mon)) {
					value = `<b>${value}</b>`;
				}

			}
		})
		if (value !== undefined && value !== null) {
			if (data.employee && column.fieldname == "employee") {
				column.align = 'left';
			}
			if (data.division && column.fieldname == "division") {
				value = `<span style="float:left !important" >${value}</span>`;
			}

		}

		if (data.employee == 'Total' && value !== undefined && value !== null) {
			if (column.fieldname == 'employee') {
				value = `<b>${value}</b>`;

			}
		}

		//end log analysis
		if (data && value != undefined) {
			if(column.fieldname == "exp_end_date"){
				if (value < currentDate && (data.status =="Working" || data.status =="Overdue")){
					value = `<span style="color:red;">${value}</span>`
					return value
				}
				if (value < week_date  && (data.status =="Working" || data.status =="Overdue")){
					value = `<span style="color:orange;">${value}</span>`
					return value
				}
				
			}

			if (data &&column.fieldname == "hrs" &&  data.hrs >data.expected_hrs && value && data.is_parent_project==1){
				// console.log(data.ex,"-------",data.hrs)
				value = `<span style="color:red">${value}</span>`;
				return value
			}
			
			if(data.indent == "0" && data.is_parent==1 && value && column.fieldname != "status"  && column.fieldname !="_assign"){
				value = `<strong>${value}</strong>`
				return value
			}
			if(data.indent == "1" && data.is_parent==1 && value && column.fieldname != "status" && column.fieldname !="_assign"){
				value = `<strong>${value}</strong>`
				return value
			}
			if(data.indent == "2" && data.is_parent==1 && value && column.fieldname != "status" && column.fieldname !="_assign"){
				value = `<strong>${value}</strong>`
				return value
			}
			if(data.indent == "3" && data.is_parent==1 && value && column.fieldname != "status" && column.fieldname !="_assign"){
				value = `<strong>${value}</strong>`
				return value
			}
			if (column.fieldname == "expected_hrs") {
				column.align = 'right';
			}
			if (column.fieldname == "hrs") {
				column.align = 'right';
				if (value !== null && value  && data.indent == "0" ) {
					value = `<span style=" ">${value}</span>`;
					return value
				}

				if (value !== null  && value && data.indent == "1") {
					value = `<span style=" opacity: 0.7;">${value}</span>`;
					return value
				}

				if (value !== null && value && data.indent == "2") {
					value = `<span style=" opacity: 0.4;">${value}</span>`;
					return value
				}
			}
			
			if (column.fieldname == "status") {
				switch (value) {
					case 'Open':
						value = `<span style="color:#f8814f; opacity: 0.8;">${value}</span>`;
						break;

					case 'Working':
						value = `<span>${value}</span>`;
						break;

					case 'Pending Review':
						value = `<span style="color:#f8814f; text-bold"; >${value}</span>`;
						break;

					case 'Overdue':
						value = `<span style="color:#e24c4c";>${value}</span>`;
						break;
					case 'Template':
						value = `<span style="color:#1579d0; opacity: 0.6";>${value}</span>`;
						break;
					case 'Completed':
						value = `<span style="color:#2f9d58;opacity: 0.6;" >${value}</span>`;
						break;
					case 'Cancelled':
						value = `<span style="color:#333c44; opacity: 0.6;">${value}</span>`;
						break;
				}
			}
			if (column.fieldname == "priority") {
				switch (value) {
					case 'Low':
						value = `<span style="opacity: 0.4"; >${value}</span>`;
						break;
					case 'Medium':
						value = `<span style="opacity: 0.8"; >${value}</span>`;
						break;
					case 'High':
						value = `<span style="opacity:1"; >${value}</span>`;
						break;
				}
			}
			if (column.fieldname == "type") {
				switch (value) {
					case 'Against SRS':
						value = `<span style="opacity: 0.4";>${value}</span>`;
						break;
					case 'Against CR':
						value = `<span style="opacity: 0.55";>${value}</span>`;
						break;
					case 'Support Issue':
						value = `<span style="opacity: 0.7";>${value}</span>`;
						break;
					case 'Bug':
						value = `<span style="opacity: 0.9"; >${value}</span>`;
						break;
					case 'QC Defect':
						value = `<span style="opacity: 1"; >${value}</span>`;
						break;
				}
			}
			if (column.fieldname == 'start_diff' || column.fieldname == 'end_diff') {
				if (value > 5) {
					value = `<span style="color:red;";>${value}</span>`;
					column.align = 'right';
				}
			}

			if (column.fieldname == 'exp_start_date' || column.fieldname == 'exp_end_date') {
				column.align = 'right';
				if (value !== null && data.indent == "0") {
					value = `<span style=" ">${value}</span>`;
					return value
				}

				if (value !== null && data.indent == "1") {
					value = `<span style=" opacity: 0.7;">${value}</span>`;
					return value
				}

				if (value !== null && data.indent == "2") {
					value = `<span style=" opacity: 0.4;">${value}</span>`;
					return value
				}
			}
			if (column.fieldname == 'act_start_date' || column.fieldname == 'act_end_date') {
				column.align = 'right';
				if (value !== null && data.indent == "0") {
					value = `<span style=" ">${value}</span>`;
					return value
				}

				if (value !== null && data.indent == "1") {
					value = `<span style=" opacity: 0.9;">${value}</span>`;
					return value
				}

				if (value !== null && data.indent == "2") {
					value = `<span style=" opacity: 0.6;">${value}</span>`;
					return value
				}
			}

			switch (column.fieldname) {
				case 'total':
					value = '<b>' + value + '</b>';
					break;

				case 'Overdue':
					value = `<span style="color:#e24c4c";>${value}</span>`;
					break;

				case 'Completed':
					value = `<span style='color:#2f9d58!important;'>${value}  </span>`;
					break;

				case 'Cancelled':
					value = `<span style='color:#333c44!important;'>${value}</span>`;
					break;
			}

			if (column.fieldname == '_assign') {
				if (value && value !== null) {
					value = JSON.parse(String(value));

					div1 = `<div class="avatar-group left overlap">`
					div2 = ``
					div3 = `</div>`
					for (let i = 0; i < value.length; i++) {
						for (let j = 0; j < imgs.length; j++) {
							if (value[i] == imgs[j].name && imgs[j].image !== null && value[i] !== null) {
								span = `<span class="avatar avatar-small " title="` + value[i] + `">
									<span class="avatar-frame" style="background-image: url(&quot;` + imgs[j].image + `&quot;)" title="` + value[i] + `"></span>
								</span>`
								div2 = div2 + span
							}
						}
					}
					value = div1 + div2 + div3
				} else {
					value = ''
				}
			} else {
				if (value !== null) {
					value = value
				} else {
					value = ''
				}
			}

			if (value == 0) {
				value = ''
			}
		}
		if (value !== undefined && value !== null) {
			if (data && column.fieldname == "subject" || column.fieldname == "task") {
				value = `<span style="float: left;" >${value}</span>`;
			}
			if (data && column.fieldname == "_assign") {
				value = `<span style="float: left;margin-top:-5px;" >${value}</span>`;
			}
			if (data && column.fieldname == "hrs" || column.fieldname == "expected_hrs" || column.fieldname == "exp_start_date" ||
				column.fieldname == "act_start_date" || column.fieldname == "start_diff" || column.fieldname == "exp_end_date" ||
				column.fieldname == "exp_end_date" || column.fieldname == "end_diff") {
				value = `<span style="float:right;" >${value}</span>`;
			}
		}


		if (data.employee == 'Total' || column.fieldname == 'tot') {
			if (data && column.fieldname == 'tot' && value) {
				value = '<b>' + value.toFixed(2) + '</b>';
				value = `<span style="float: right;" >${value}</span>`;
				return value;
			}
		}
		value = default_formatter(value, row, column, data);
		return value;
	},
	"set_route1": function (data) {
		window.open("http://" + window.location.host + 'app/task/' + data)
	},

};

function add_child(project_details) {
	valu = JSON.parse(String(project_details));
	frappe.new_doc("Task", {
		project: valu.project,
		parent_task: valu.task,
	});
}
function add_qc_defect(project_details) {
	valu = JSON.parse(String(project_details));
	frappe.new_doc("Task", {
		project: valu.project,
		parent_task: valu.task,
		type: 'QC Defect'
	});
}

function add_task(project_details) {
	value = JSON.parse(String(project_details));
	new_task = frappe.new_doc("Task", {
		project: value.project
	});
}