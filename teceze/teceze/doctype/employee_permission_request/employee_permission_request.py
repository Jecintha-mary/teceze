# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from datetime import datetime,date
from datetime import timedelta
from frappe import _

current_db_name = frappe.conf.get("db_name")

class EmployeePermissionRequest(Document):
	def validate(self):		
		if self.employee:
			### Not allowed permission for weekoff and holidays
			holiday=frappe.db.sql("""select holiday_list from `tabShift Type`;""",as_list=True)[0][0]
			if holiday:
				weekoff_data = frappe.db.sql('''SELECT date(holiday_date) as holiday_date FROM {0}.`tabHoliday` where parent = "{1}"'''.format(current_db_name,holiday), as_dict=True)
				if weekoff_data:
					for x in weekoff_data:
						if x.holiday_date:
							if str(x.holiday_date) == str(self.permission_on):
								frappe.throw("Permission Requests are not allowed for weekdays and holidays. Please contact your RM.")
			###If applied half day leave, permission cannot be availed for that day
			leave_application = frappe.db.sql("""select name from {0}.`tabLeave Application` where (half_day = '1' or half_day = '0') and docstatus != '2' and status in ("Open","Approved")
								and from_date = '{1}' and to_date = '{1}' and employee = '{2}'""".format(current_db_name,self.permission_on,self.employee),as_dict=True)
			if leave_application:
				frappe.throw("Permission cannot be availed because you already applied leave for that day. Please contact your RM")
	
			leave = frappe.db.sql("""select name,leave_type from {0}.`tabLeave Application` where half_day = '0' and docstatus != '2' and status in ("Open","Approved")
								and '{1}' between from_date and to_date and employee = '{2}'""".format(current_db_name,self.permission_on,self.employee),as_dict=True)

			if len(leave)>0:
				frappe.throw("Permission cannot be availed because you already applied "+leave[0]['leave_type']+"for that day. Please contact your RM")


	def on_submit(self):
		from hrms.hr.doctype.employee_checkin.employee_checkin import calculate_working_hours
		if (frappe.session.user.lower() == self.leave_approver.lower() or frappe.session.user == 'Administrator' or [d for d in ['Leave Approver','System Manager'] if d in frappe.permissions.get_roles(frappe.session.user)]): 
			pass
		else:
			frappe.throw("You don't have permission to submit this document. Please contact your RM")
		
		if self.status in ["Open"]:
			frappe.throw("Employee Permission Request with status 'Approved' and 'Rejected' can be submitted")
	
		
   		
#Validate Permission limitation
@frappe.whitelist()
def validate_permission(employee,permission_on,name):
	permission = frappe.db.sql("""select name from {0}.`tabEmployee Permission Request` where employee = '{1}' and docstatus != '2' and permission_on = '{2}' and name != '{3}'
	""".format(current_db_name,employee,permission_on,name),as_dict=True)
	if permission:
		return permission