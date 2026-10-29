# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from datetime import datetime,date
from datetime import timedelta
from frappe import _
current_db_name = frappe.conf.get("db_name")
MAX_PERMISSION_MINUTES_PER_MONTH = 60
from frappe.utils import getdate, today

class EmployeePermissionRequest(Document):
    def on_submit(self):
            from hrms.hr.doctype.employee_checkin.employee_checkin import calculate_working_hours
            if self.status in ["Open"]:
                    frappe.throw("Employee Permission Request with status 'Approved' and 'Rejected' can be submitted")

            if self.status == "Approved": 
                if getdate(self.permission_on) < getdate(today()):       
                        from teceze.teceze.overrides.permission import attendance_for_permission
                        attendance_for_permission(self)
    def validate(self):
      
        if self.workflow_state == "Approved":
                self.status = "Approved"
        
        elif self.workflow_state == "Rejected":
            self.status = "Rejected"
        elif self.workflow_state == "Pending Approval":
            self.status = "Pending Approval"

        if self.employee:
            ### Not allowed permission for weekoff and holidays
            default_shift = frappe.db.get_value(
                    "Employee",
                    self.employee,
                    "default_shift"
                )

            holiday = frappe.db.sql("""
                SELECT holiday_list
                FROM `tabShift Type`
                WHERE name = %s
            """, (default_shift,), as_list=True)
            
            holiday = holiday[0][0] if holiday else None
            # holiday = frappe.db.get_value("Shift Type", self.default_shift, "holiday_list")
            if holiday:
                weekoff_data = frappe.db.sql('''SELECT date(holiday_date) as holiday_date FROM `tabHoliday` where parent = "{0}"'''.format(holiday), as_dict=True)
                if weekoff_data:
                    for x in weekoff_data:
                        if x.holiday_date:
                            if str(x.holiday_date) == str(self.permission_on):
                                frappe.throw("Permission Requests are not allowed for weekdays and holidays. Please contact your RM.")
            ###If applied half day leave, permission cannot be availed for that day
            leave_application = frappe.db.sql("""select name from `tabLeave Application` where (half_day = %s or half_day = %s) and docstatus != %s and status in (%s, %s) and from_date = %s and to_date = %s and employee = %s""", (1, 0, 2, "Open", "Approved", self.permission_on, self.permission_on, self.employee), as_dict=True)

            if leave_application:
                frappe.throw("Permission cannot be availed because you already applied leave for that day. Please contact your RM")

            leave = frappe.db.sql("""select name, leave_type from `tabLeave Application` where half_day = %s and docstatus != %s and status in (%s, %s) and %s between from_date and to_date and employee = %s""", (0, 2, "Open", "Approved", self.permission_on, self.employee), as_dict=True)

            if len(leave)>0:
                frappe.throw("Permission cannot be availed because you already applied "+leave[0]['leave_type']+"for that day. Please contact your RM")



            
        
#Validate Permission limitation
@frappe.whitelist()
def validate_permission(employee,permission_on,name):
	permission = frappe.db.sql("""select name from `tabEmployee Permission Request` where employee = %s and docstatus != %s and permission_on = %s and name != %s""", (employee, 2, permission_on, name), as_dict=True)
	if permission:
		return permission

