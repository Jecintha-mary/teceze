import frappe

@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_sdm_user_employees(doctype, txt, searchfield, start, page_len, filters):
    
    sdm_employees = frappe.db.sql("""
        SELECT emp.name, emp.employee_name
        FROM `tabEmployee` emp
        INNER JOIN `tabUser` u ON emp.user_id = u.name
        INNER JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE hr.role = 'SDM'
            AND emp.status = 'Active'
            AND (
                emp.name LIKE %(txt)s
                OR emp.employee_name LIKE %(txt)s
            )
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })

    return sdm_employees


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_sdc_user_employees(doctype, txt, searchfield, start, page_len, filters):
    
    sdc_employees = frappe.db.sql("""
        SELECT emp.name, emp.employee_name
        FROM `tabEmployee` emp
        INNER JOIN `tabUser` u ON emp.user_id = u.name
        INNER JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE hr.role = 'SDC'
            AND emp.status = 'Active'
            AND (
                emp.name LIKE %(txt)s
                OR emp.employee_name LIKE %(txt)s
            )
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })

    return sdc_employees

@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_project_manager_user_employees(doctype, txt, searchfield, start, page_len, filters):
    
    pm_employees = frappe.db.sql("""
        SELECT emp.name, emp.employee_name
        FROM `tabEmployee` emp
        INNER JOIN `tabUser` u ON emp.user_id = u.name
        INNER JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE hr.role = 'PM'
            AND emp.status = 'Active'
            AND (
                emp.name LIKE %(txt)s
                OR emp.employee_name LIKE %(txt)s
            )
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })

    return pm_employees