import frappe
@frappe.whitelist(allow_guest=True)
def get_purchase_requests():
    try:

        procurement_requests = frappe.get_all(
            "Procurement Request",
            fields=["name", "creation", "status", "remarks"],
            order_by="creation desc"
        )

        response = []

        for pr in procurement_requests:

            doc = frappe.get_doc("Procurement Request", pr.name)

            items = []
            total = 0

            required_by = None

            for row in doc.items:

                total += row.amount

                if required_by is None:
                    required_by = row.schedule_date

                items.append({
                    "productId": row.item_code,
                    "name": row.item_name,
                    "qty": row.qty,
                    "unitPrice": row.amount / row.qty if row.qty else 0
                })

            response.append({

                "id": doc.name,

                "prNumber": doc.name,

                "date": str(doc.creation.date()),

                "requiredBy": str(required_by) if required_by else None,

                "status": doc.status,

                "notes": doc.remarks,

                "items": items,

                "total": total

            })

        return {
            "success": True,
            "data": response,
            "statusCode": 200,
            "message": "Request processed successfully"
        }

    except Exception as e:

        frappe.log_error(frappe.get_traceback(), "Purchase Request API")

        return {
            "success": False,
            "data": [],
            "statusCode": 500,
            "message": str(e)
        }