import frappe


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_orders():
    sales_orders = frappe.get_all(
        "Sales Order",
        fields=[
            "name",
            "transaction_date",
            "status",
            "delivery_date",
            "grand_total"
        ]
    )

    data = []

    for so in sales_orders:
        so_doc = frappe.get_doc("Sales Order", so.name)

        line_items = []
        items_summary_list = []

        for item in so_doc.items:
            qty = item.qty or 0
            item_name = item.item_code or ""
            amount = item.amount or 0

            line_items.append({
                "name": f"{int(qty)}x {item_name}",
                "amount": amount
            })

            items_summary_list.append(f"{int(qty)} {item_name}")

        data.append({
            "id": so_doc.name,
            "orderNumber": so_doc.name,
            "date": str(so_doc.transaction_date) if so_doc.transaction_date else None,
            "prNumber": None,
            "status": so_doc.status,
            "carrier": None,
            "trackingNumber": None,
            "eta": str(so_doc.delivery_date) if so_doc.delivery_date else None,
            "itemsSummary": ", ".join(items_summary_list),
            "lineItems": line_items,
            "totalAmount": so_doc.grand_total or 0
        })

    return {
        "success": True,
        "data": data,
        "statusCode": 200,
        "message": "Request processed successfully"
    }


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_order(order_number):
    if not frappe.db.exists("Sales Order", order_number):
        return {
            "success": False,
            "data": None,
            "statusCode": 404,
            "message": f"Sales Order {order_number} not found"
        }

    so_doc = frappe.get_doc("Sales Order", order_number)

    line_items = []
    items_summary_list = []

    for item in so_doc.items:
        qty = item.qty or 0
        item_name = item.item_code or ""
        amount = item.amount or 0

        line_items.append({
            "name": f"{int(qty)}x {item_name}",
            "amount": amount
        })

        items_summary_list.append(f"{int(qty)} {item_name}")

    return {
        "success": True,
        "data": {
            "id": so_doc.name,
            "orderNumber": so_doc.name,
            "date": str(so_doc.transaction_date) if so_doc.transaction_date else None,
            "prNumber": None,
            "status": so_doc.status,
            "carrier": None,
            "trackingNumber": None,
            "eta": str(so_doc.delivery_date) if so_doc.delivery_date else None,
            "itemsSummary": ", ".join(items_summary_list),
            "lineItems": line_items,
            "totalAmount": so_doc.grand_total or 0
        },
        "statusCode": 200,
        "message": "Request processed successfully"
    }


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_order_tracking(order_number):
    if not frappe.db.exists("Sales Order", order_number):
        return {
            "success": False,
            "data": None,
            "statusCode": 404,
            "message": f"Sales Order {order_number} not found"
        }

    so_doc = frappe.get_doc("Sales Order", order_number)

    items_summary_list = []

    for item in so_doc.items:
        qty = item.qty or 0
        item_name = item.item_code or ""
        items_summary_list.append(f"{int(qty)} {item_name}")

    return {
        "success": True,
        "data": {
            "orderNumber": so_doc.name,
            "currentStatus": so_doc.status,
            "carrier": None,
            "trackingNumber": None,
            "eta": str(so_doc.delivery_date) if so_doc.delivery_date else None,
            "items": ", ".join(items_summary_list)
        },
        "statusCode": 200,
        "message": "Request processed successfully"
    }