import frappe
from frappe import _
from frappe.query_builder import DocType
from frappe.query_builder.functions import Sum

@frappe.whitelist(allow_guest=True)
def get_dashboard_summary():
    total_purchase_requests = frappe.db.count("Procurement Request")
    open_quotations = frappe.db.count(
        "Quotation",
        filters={"status": "Open"}
        )
    working_order = frappe.db.count(
        "Sale Order Tracking",
        filters={"status": "Confirmed","is_active":"1"}
        )
    si = DocType("Sales Invoice")

    total_due = (
        frappe.qb.from_(si)
        .select(Sum(si.grand_total))
        .where(si.status == "Unpaid")
    ).run()[0][0] or 0
    overdue_invoice = frappe.db.count(
        "Sales Invoice",
        filters={"status": "Overdue"}
        )
    order_ship = frappe.db.count(
        "Sale Order Tracking",
        filters={"status": "Shipped","is_active":"1"}
        )
    data = {
        "totalPurchaseRequests": total_purchase_requests,
        "quotationsAwaitingAction": open_quotations,        
        "activeOrders": working_order,                     
        "activeOrdersShippedCount": order_ship,        
        "totalInvoicesDue": total_due,            
        "overdueInvoicesCount": overdue_invoice,            
    }

    return {
        "success": True,
        "data": data,
        "statusCode": 200,
        "message": _("Request processed successfully"),
    }

@frappe.whitelist(allow_guest=True)
def pr_status_breakdown():
    rows = frappe.db.sql("""
        SELECT status, COUNT(*) AS count
        FROM `tabProcurement Request`
        GROUP BY status
    """, as_dict=True)

    color_map = {
        "Submitted": "blue",
        "Quoted": "amber",
        "Approved": "emerald",
        "Rejected": "red",
    }

    data = [
        {
            "status": row.status,
            "count": row.count,
            "colorToken": color_map.get(row.status, "gray"),
        }
        for row in rows
    ]

    return {
        "success": True,
        "data": data,
        "statusCode": 200,
        "message": "Request processed successfully",
    }


@frappe.whitelist(allow_guest=True)
def get_procurement_monthly_amounts():
    rows = frappe.db.sql("""
        SELECT
            DATE_FORMAT(creation, '%b') AS month,
            COALESCE(SUM(total_amount), 0) AS amount
        FROM `tabProcurement Request`
        WHERE docstatus < 2
        GROUP BY YEAR(creation), MONTH(creation)
        ORDER BY YEAR(creation), MONTH(creation)
    """, as_dict=True)

    return {
        "success": True,
        "data": rows,
        "statusCode": 200,
        "message": "Request processed successfully",
    }