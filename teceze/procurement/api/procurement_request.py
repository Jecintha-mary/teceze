import frappe

from teceze.procurement.api.auth import authenticate


@frappe.whitelist(allow_guest=True,methods=["POST"])
def create():

    try:

        # Validate JWT
        # authenticate()

        data = frappe.request.get_json()

        if not data.get("user"):
            frappe.local.response["http_status_code"] = 400

            return {
                "success": False,
                "statusCode": 400,
                "message": "User is required",
                "data": None
            }

        items = data.get("items", [])

        if not items:
            frappe.local.response["http_status_code"] = 400

            return {
                "success": False,
                "statusCode": 400,
                "message": "Items are required",
                "data": None
            }
        
        pr = frappe.new_doc("Procurement Request")

        # User Information
        pr.user = data.get("user")

        # Client Details
        pr.client_name = data.get("client_name")
        pr.contact_person = data.get("contact_person")
        pr.phone_number = data.get("phone_number")
        pr.email = data.get("email")
        pr.location = data.get("location")
        pr.postal_code = data.get("postal_code")
        pr.country = data.get("country")

        # Request Details
        pr.status = data.get("status") or "Open"
        pr.priority = data.get("priority")
        pr.details = data.get("details")
        pr.address = data.get("address")
        pr.remarks = data.get("remarks")
        total_amount = 0

        for row in data.get("items", []):

            item = frappe.get_doc("Item", row["productId"])

            amount = float(row["quantity"]) * float(row["unitPrice"])

            total_amount += amount

            pr.append("items", {

                "item_code": item.item_code,
                "item_name": item.item_name,
                "qty": row["quantity"],
                "unit_price": row["unitPrice"],
                "amount": amount,
                "schedule_date":  row["requiredBy"],
                "uom": item.stock_uom

            })

        pr.total_amount = total_amount

        pr.insert(ignore_permissions=True)

        frappe.db.commit()

        frappe.local.response["http_status_code"] = 201

        return {

            "success": True,

            "data": {

                "id": pr.name,
                "prNumber": pr.name,
                "status": pr.status,
                "submittedAt": pr.creation,
                "totalAmount": total_amount,
                "itemsCount": len(pr.items)

            },

            "statusCode": 201,

            "message": "Purchase Request added Successfully"

        }

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Create Procurement Request API"
        )

        frappe.local.response["http_status_code"] = 500

        return {

            "success": False,
            "data": None,
            "statusCode": 500,
            "message": "Internal Server Error"

        }


import frappe


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_procurement_requests():

    try:

        # Validate JWT
        # authenticate()

        requests = frappe.get_all(
            "Procurement Request",
            fields=[
                "name",
                "creation",
                "client_name",
                "contact_person",
                "phone_number",
                "email",
                "location",
                "postal_code",
                "country",
                "status",
                "priority",
                "details",
                "address",
                "remarks"
            ],
            order_by="creation desc",
            ignore_permissions=True
        )

        data = []

        for pr in requests:

            doc = frappe.get_doc("Procurement Request", pr.name)

            items = []
            total_amount = 0

            for row in doc.items:

                amount = row.amount or 0
                total_amount += amount

                items.append({

                    "productId": row.item_code,
                    "name": row.item_name,
                    "quantity": row.qty,
                    "unitPrice": row.unit_price,
                    "requiredBy": str(row.schedule_date) if row.schedule_date else "",
                    "amount": amount

                })

            data.append({

                "id": doc.name,
                "prNumber": doc.name,
                "date": str(doc.creation.date()),

                "client_name": doc.client_name,
                "contact_person": doc.contact_person,
                "phone_number": doc.phone_number,
                "email": doc.email,
                "location": doc.location,
                "postal_code": doc.postal_code,
                "country": doc.country,

                "status": doc.status,
                "priority": doc.priority,
                "details": doc.details,
                "address": doc.address,
                "remarks": doc.remarks,

                "items": items,

                "totalAmount": total_amount

            })

        frappe.local.response["http_status_code"] = 200

        frappe.response.update({

            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Purchase Requests fetched successfully"

        })

        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Procurement Requests API"
        )

        frappe.local.response["http_status_code"] = 500

        frappe.response.update({

            "success": False,
            "data": [],
            "statusCode": 500,
            "message": "Internal Server Error"

        })

        return


import frappe


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_procurement_requests_by_client(client_name):

    try:

        if not client_name:

            frappe.local.response["http_status_code"] = 400

            frappe.response.update({
                "success": False,
                "data": [],
                "statusCode": 400,
                "message": "Client Name is required"
            })

            return

        requests = frappe.get_all(
            "Procurement Request",
            filters={
                "client_name": client_name
            },
            fields=[
                "name",
                "creation",
                "client_name",
                "contact_person",
                "phone_number",
                "email",
                "location",
                "postal_code",
                "country",
                "status",
                "priority",
                "details",
                "address",
                "remarks"
            ],
            order_by="creation desc",
            ignore_permissions=True
        )

        data = []

        for pr in requests:

            doc = frappe.get_doc("Procurement Request", pr.name)

            items = []
            total_amount = 0

            for row in doc.items:

                amount = row.amount or 0
                total_amount += amount

                items.append({

                    "productId": row.item_code,
                    "name": row.item_name,
                    "quantity": row.qty,
                    "unitPrice": row.unit_price,
                    "requiredBy": str(row.schedule_date) if row.schedule_date else "",
                    "amount": amount

                })

            data.append({

                "id": doc.name,
                "prNumber": doc.name,
                "date": str(doc.creation.date()),

                "client_name": doc.client_name,
                "contact_person": doc.contact_person,
                "phone_number": doc.phone_number,
                "email": doc.email,
                "location": doc.location,
                "postal_code": doc.postal_code,
                "country": doc.country,

                "status": doc.status,
                "priority": doc.priority,
                "details": doc.details,
                "address": doc.address,
                "remarks": doc.remarks,

                "items": items,
                "totalAmount": total_amount

            })

        frappe.local.response["http_status_code"] = 200

        frappe.response.update({

            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Purchase Requests fetched successfully"

        })

        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Procurement Requests By Client"
        )

        frappe.local.response["http_status_code"] = 500

        frappe.response.update({

            "success": False,
            "data": [],
            "statusCode": 500,
            "message": "Internal Server Error"

        })

        return

@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_procurement_request(pr_id):

    try:

        # Validate JWT
        # authenticate()

        if not pr_id:

            frappe.local.response["http_status_code"] = 400

            frappe.response.update({
                "success": False,
                "data": None,
                "statusCode": 400,
                "message": "Procurement Request ID is required"
            })

            return

        if not frappe.db.exists("Procurement Request", pr_id):

            frappe.local.response["http_status_code"] = 404

            frappe.response.update({
                "success": False,
                "data": None,
                "statusCode": 404,
                "message": "Procurement Request not found"
            })

            return

        doc = frappe.get_doc("Procurement Request", pr_id)

        items = []
        total_amount = 0

        for row in doc.items:

            amount = row.amount or 0
            total_amount += amount

            items.append({

                "productId": row.item_code,
                "name": row.item_name,
                "quantity": row.qty,
                "unitPrice": row.unit_price,
                "requiredBy": str(row.schedule_date) if row.schedule_date else "",
                "amount": amount

            })

        frappe.local.response["http_status_code"] = 200

        frappe.response.update({

            "success": True,

            "data": {

                "id": doc.name,
                "prNumber": doc.name,
                "date": str(doc.creation.date()),

                "client_name": doc.client_name,
                "contact_person": doc.contact_person,
                "phone_number": doc.phone_number,
                "email": doc.email,
                "location": doc.location,
                "postal_code": doc.postal_code,
                "country": doc.country,

                "status": doc.status,
                "priority": doc.priority,
                "details": doc.details,
                "address": doc.address,
                "remarks": doc.remarks,

                "items": items,

                "totalAmount": total_amount

            },

            "statusCode": 200,

            "message": "Purchase Request fetched successfully"

        })

        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Procurement Request API"
        )

        frappe.local.response["http_status_code"] = 500

        frappe.response.update({

            "success": False,
            "data": None,
            "statusCode": 500,
            "message": "Internal Server Error"

        })

        return


import frappe


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_recent_procurement_requests(client_name):

    try:

        # Validate JWT
        # authenticate()

        requests = frappe.get_all(
            "Procurement Request",
            filters={
                "client_name": client_name
            },
            fields=[
                "name",
                "creation",
                "client_name",
                "contact_person",
                "phone_number",
                "email",
                "location",
                "postal_code",
                "country",
                "status",
                "priority",
                "details",
                "address",
                "remarks"
            ],
            order_by="creation desc",
            limit_page_length=5,
            ignore_permissions=True
        )

        data = []

        for pr in requests:

            doc = frappe.get_doc("Procurement Request", pr.name)

            items = []
            total_amount = 0

            for row in doc.items:

                amount = row.amount or 0
                total_amount += amount

                items.append({

                    "productId": row.item_code,
                    "name": row.item_name,
                    "quantity": row.qty,
                    "unitPrice": row.unit_price,
                    "requiredBy": str(row.schedule_date) if row.schedule_date else "",
                    "amount": amount

                })

            data.append({

                "id": doc.name,
                "prNumber": doc.name,
                "date": str(doc.creation.date()),

                "client_name": doc.client_name,
                "contact_person": doc.contact_person,
                "phone_number": doc.phone_number,
                "email": doc.email,
                "location": doc.location,
                "postal_code": doc.postal_code,
                "country": doc.country,

                "status": doc.status,
                "priority": doc.priority,
                "details": doc.details,
                "address": doc.address,
                "remarks": doc.remarks,

                "items": items,

                "totalAmount": total_amount

            })

        frappe.local.response["http_status_code"] = 200

        frappe.response.update({

            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Recent Purchase Requests fetched successfully"

        })

        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Recent Procurement Requests API"
        )

        frappe.local.response["http_status_code"] = 500

        frappe.response.update({

            "success": False,
            "data": [],
            "statusCode": 500,
            "message": "Internal Server Error"

        })

        return

