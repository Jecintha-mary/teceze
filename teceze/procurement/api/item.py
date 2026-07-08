import frappe

from teceze.procurement.api.auth import authenticate


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_items():

    try:

        # Validate JWT
        # authenticate()

        items = frappe.get_all(
            "Item",
            filters={
                "disabled": 0
            },
            fields=[
                "item_code",
                "item_name",
                "item_group",
                "custom_price",
                "custom_stock",
                "custom_item_image",
                "custom_mfg",
                "custom_mpn"
            ],
            ignore_permissions=True,
            order_by="item_name asc"
            
        )

        data = []

        for item in items:

            data.append({

                "item_code": item.item_code,

                "mfg" : item.custom_mfg,

                "mpn" : item.custom_mpn,

                "category": item.item_group,

                "price": item.custom_price or 0,

                "stock": item.custom_stock or 0,
                
                "image": item.custom_item_image

            })

        return {

            "success": True,

            "data": data,

            "statusCode": 200,

            "message": "Products fetched successfully"

        }

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Products API"
        )

        frappe.local.response["http_status_code"] = 500

        return {

            "success": False,

            "data": [],

            "statusCode": 500,

            "message": "Internal Server Error"

        }


@frappe.whitelist(allow_guest=True,methods=["GET"])
def get_item(item_code):

    try:

        # Validate JWT
        # authenticate()

        if not item_code:

            frappe.local.response["http_status_code"] = 400

            frappe.response.update({

                "success": False,
                "data": None,
                "statusCode": 400,
                "message": "Item Code is required"

            })

            return

        item = frappe.get_all(
            "Item",
            filters={
                "item_code": item_code,
                "disabled": 0
            },
            fields=[
                "item_code",
                "item_name",
                "item_group",
                "custom_price",
                "custom_stock",
                "custom_item_image"
            ],
            ignore_permissions=True
        )

        if not item:

            frappe.local.response["http_status_code"] = 404

            frappe.response.update({

                "success": False,
                "data": None,
                "statusCode": 404,
                "message": "Item not found"

            })

            return

        item = item[0]

        frappe.local.response["http_status_code"] = 200

        frappe.response.update({

            "success": True,

            "data": {

                "id": item.item_code,
                "name": item.item_name,
                "category": item.item_group,
                "price": item.custom_price,
                "stock": item.custom_stock,
                "image": item.custom_item_image

            },

            "statusCode": 200,

            "message": "Product fetched successfully"

        })

        return

    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Item API"
        )

        frappe.local.response["http_status_code"] = 500

        frappe.response.update({

            "success": False,
            "data": None,
            "statusCode": 500,
            "message": "Internal Server Error"

        })

        return