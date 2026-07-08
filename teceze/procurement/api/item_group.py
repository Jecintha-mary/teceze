import frappe

@frappe.whitelist(allow_guest=True)
def get_google_item_groups():
    try:
        item_groups = frappe.get_all(
            "Item Group",
            filters={
                "custom_is_google_category": 1
            },
            fields=[
                "name",
            ],
            order_by="item_group_name asc"
        )

        return {
            "success": True,
            "message": "Google Item Groups fetched successfully.",
            "data": item_groups
        }

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Get Google Item Groups API")
        frappe.throw("Unable to fetch Item Groups")