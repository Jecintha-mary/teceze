import frappe

@frappe.whitelist(allow_guest=False)
def approve_quotation(quotation):

    q = frappe.get_doc("Quotation", quotation)

    q.flags.ignore_permissions = True

    q.submit()

    return {
        "success": True,
        "data": None,
        "statusCode": 200,
        "message": "Request processed successfully"
    }