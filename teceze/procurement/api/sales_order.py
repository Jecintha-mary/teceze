import frappe

@frappe.whitelist(allow_guest=True)
def get_sales_orders():
    try:
        data = []

        sales_orders = frappe.get_all(
            "Sales Order",
            fields=[
                "name",
                # "custom_so_status",
                "transaction_date",
                "custom_quotation",
                "delivery_date",
                "total",
                "custom_carrier",
                "custom_tracking_no",
            ],
            order_by="creation desc"
        )

        for so in sales_orders:
            pr_number = None

            # Get PR Number from Quotation -> Lead
            if so.custom_quotation:
                quotation = frappe.db.get_value(
                    "Quotation",
                    so.custom_quotation,
                    ["party_name"],
                    as_dict=True
                )

                if quotation and quotation.party_name:
                    pr_number = frappe.db.get_value(
                        "Lead",
                        quotation.party_name,
                        "custom_procurement_id"
                    )

            # Get Sales Order Items
            items = frappe.get_all(
                "Sales Order Item",
                filters={"parent": so.name},
                fields=["qty", "item_name"]
            )

            track_items = frappe.get_all(
                "Sale Order Tracking",
                filters={"parent": so.name},
                fields=["status", "completed","date","is_active"]
            )
            item_list = ", ".join(
                [
                    f"{int(item.qty) if item.qty == int(item.qty) else item.qty} {item.item_name}"
                    for item in items
                ]
            )

          
            data.append({
                "orderNumber": so.name,
                "prNumber": pr_number,
                # "currentStatus": so.custom_so_status,
                "carrier": so.custom_carrier,
                "tracking_no": so.custom_tracking_no,
                "eta": so.delivery_date,
                "total": so.total,
                "items": item_list,
                "items_list": [
                {
                    "item_name": item.item_name,
                    "qty": item.qty
                }
                for item in items
            ],
                "steps": [
            {
                "step": i + 1,
                "label": row.status,
                "timestamp": row.date.isoformat() if row.date else None,
                "completed": bool(row.completed),
                "active": bool(row.is_active),
            }
            for i, row in enumerate(track_items or [])
        ]
            })

        return {
            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Request processed successfully"
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Sales Orders API")

        return {
            "success": False,
            "data": [],
            "statusCode": 500,
            "message": str(e)
        }



@frappe.whitelist(allow_guest=True)
def get_one_sales_order(sales_order_id):
    so = frappe.get_doc("Sales Order", sales_order_id)

    pr_number = None
    if so.custom_quotation:
        lead_name = frappe.db.get_value(
            "Quotation", so.custom_quotation, "party_name"
        )
        if lead_name:
            pr_number = frappe.db.get_value(
                "Lead", lead_name, "custom_procurement_id"
            )

    items = ", ".join(
        f"{item.qty:g} {item.item_name}"
        for item in so.items
    )
    return {
        "success": True,
        "data": {
            "orderNumber": so.name,
            "prNumber": pr_number,
            # "currentStatus": so.custom_so_status,
            "carrier": so.custom_carrier,
            "tracking_no": so.custom_tracking_no,
            "eta": str(so.delivery_date) if so.delivery_date else None,
            "total": so.total,
            "items": items,
            "items_list": [
                {
                    "item_name": item.item_name,
                    "qty": item.qty
                }
                for item in so.items
            ],
            "steps": [
            {
                "step": i + 1,
                "label": row.status,
                "timestamp": row.date.isoformat() if row.date else None,
                "completed": bool(row.completed),
                "active": bool(row.is_active),
            }
            for i, row in enumerate(so.custom_sales_tracking)
        ]
        },
        "statusCode": 200,
        "message": "Request processed successfully",
    }

@frappe.whitelist(allow_guest=True)
def get_recent_sales_orders():
    try:
        data = []

        sales_orders = frappe.get_all(
            "Sales Order",
            fields=[
                "name",
                # "custom_so_status",
                "transaction_date",
                "custom_quotation",
                "delivery_date",
                "total",
                "custom_carrier",
                "custom_tracking_no",
            ],
            order_by="creation desc",
            limit=1
        )

        for so in sales_orders:
            pr_number = None

            # Get PR Number from Quotation -> Lead
            if so.custom_quotation:
                quotation = frappe.db.get_value(
                    "Quotation",
                    so.custom_quotation,
                    ["party_name"],
                    as_dict=True
                )

                if quotation and quotation.party_name:
                    pr_number = frappe.db.get_value(
                        "Lead",
                        quotation.party_name,
                        "custom_procurement_id"
                    )

            # Get Sales Order Items
            items = frappe.get_all(
                "Sales Order Item",
                filters={"parent": so.name},
                fields=["qty", "item_name"]
            )

            track_items = frappe.get_all(
                "Sale Order Tracking",
                filters={"parent": so.name},
                fields=["status", "completed","date","is_active"]
            )
            item_list = ", ".join(
                [
                    f"{int(item.qty) if item.qty == int(item.qty) else item.qty} {item.item_name}"
                    for item in items
                ]
            )

          
            data.append({
                "orderNumber": so.name,
                "prNumber": pr_number,
                # "currentStatus": so.custom_so_status,
                "carrier": so.custom_carrier,
                "tracking_no": so.custom_tracking_no,
                "eta": so.delivery_date,
                "total": so.total,
                "items": item_list,
                "items_list": [
                {
                    "item_name": item.item_name,
                    "qty": item.qty
                }
                for item in items
            ],
                "steps": [
            {
                "step": i + 1,
                "label": row.status,
                "timestamp": row.date.isoformat() if row.date else None,
                "completed": bool(row.completed),
                "active": bool(row.is_active),
            }
            for i, row in enumerate(track_items or [])
        ]
            })

        return {
            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Request processed successfully"
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Sales Orders API")

        return {
            "success": False,
            "data": [],
            "statusCode": 500,
            "message": str(e)
        }
