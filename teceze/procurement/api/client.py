import frappe

@frappe.whitelist(allow_guest=True)
def get_clients(user):
    clients = frappe.get_all(
        "Customer",
        filters={
            "custom_is_p2p_customer": 1,
            "custom_user": user
        },
        fields=[
            "name",
        ],
        order_by="creation desc"
    )

    return {
        "success": True,
        "data": clients
    }