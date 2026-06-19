# Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MyWhiteListFunctions(Document):
	pass


@frappe.whitelist()
def get_approver(id):
	doc = frappe.get_doc("User", id)
	return doc

@frappe.whitelist()
def permission_validation(employee, month, year):
    import datetime
    test_date = datetime.datetime(int(year), int(month), 1)
    nxt_mnth = test_date.replace(day=28) + datetime.timedelta(days=4)
    res = nxt_mnth - datetime.timedelta(days=nxt_mnth.day)
    last_date = res.day
    from_date = str(year) + '-' + str(month) + '-' + '01'
    to_date = str(year) + '-' + str(month) + '-' + str(last_date)
    leave_permission = frappe.db.sql(
        """select name from `tabEmployee Permission Request` where employee = %s\
            and (permission_on between %s and %s) and status in ('Open','Approved') and docstatus < 2""",
        (employee, from_date, to_date),
        as_dict=1,
    )
    return leave_permission