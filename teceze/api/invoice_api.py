#dharshini

import frappe
@frappe.whitelist(allow_guest=True,methods=["GET"])
#for single invoice
def get_invoice(invoice_no):
    salesorder=frappe.db.get_value("Sales Invoice Item",
        {"parent": invoice_no},
        "sales_order"
    )
    invoice=frappe.get_doc("Sales Invoice",invoice_no)
    return{
        "success":True,
        "data":[
        {
        "id":invoice.name,
        "invoiceNumber":invoice.name,
        "orderNumber":salesorder,
        "subtotal":None,
        "taxAmount":None,
        "grandTotal":invoice.grand_total,
        "issueDate":invoice.posting_date,
        "dueDate":invoice.due_date,
        "status":invoice.status,
        "paidDate":None
        }],
        "statusCode": 200,
        "message": "Request processed successfully"

    }
#fetch all invoices
@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_allinvoices():

    invoices = frappe.get_all(
        "Sales Invoice",
        fields=[
            "name",
            "posting_date",
            "due_date",
            "grand_total",
            "status"
        ],
        order_by="creation desc"
    )

    data= []

    for inv in invoices:
        sales_order = frappe.db.get_value(
            "Sales Invoice Item",
            {"parent": inv.name},
            "sales_order")
        data.append({
            "id": inv.name,
            "invoiceNumber": inv.name,
            "orderNumber": sales_order,
            "subtotal":None,
            "taxAmount":None,
            "grandTotal": inv.grand_total,
            "issueDate": inv.posting_date,
            "dueDate": inv.due_date,
            "status": inv.status,
            "paidDate":None
        })

    return{
        "success":True,
        "data": data,
        "statusCode": 200,
        "message": "Request processed successfully"
    }
#@frappe.whitelist(allow_guest=True,methods=["GET"])
# def test(invoice_no):

#     return frappe.get_all(
#         "Sales Invoice Item",
#         filters={"parent": invoice_no},
#         fields=["parent", "sales_order", "item_code"]
#     )

@frappe.whitelist(allow_guest=True)
def recent_invoices():

    invoices = frappe.get_all(
        "Sales Invoice",
        fields=[
            "name",
            "grand_total",
            "due_date",
            "status"
        ],
        order_by="creation desc",
        limit_page_length=5
    )

    data = []

    for inv in invoices:
        sales_order = frappe.db.get_value(
            "Sales Invoice Item",
            {"parent": inv.name},
            "sales_order"
        )

        data.append({
            "id": inv.name,
            "invoiceNumber": inv.name,
            "orderNumber": sales_order,
            "amount": inv.grand_total,
            "dueDate": inv.due_date,
            "status": inv.status
        })

    return {
        "Success": True,
        "data": data,
        "statusCode": 200,
        "message": "Request processed successfully"
    }