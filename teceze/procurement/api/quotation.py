import frappe

@frappe.whitelist(allow_guest=True)
def get_quotations():
    data = []

    quotations = frappe.get_all(
        "Quotation",
        fields=["name", "party_name", "transaction_date", "grand_total", "status"],
        order_by="creation desc",
    )

    for q in quotations:
        items = frappe.get_all(
            "Quotation Item",
            filters={"parent": q.name},
            fields=["qty", "item_name"],
        )

        item_list = [
            f"{int(item.qty) if item.qty == int(item.qty) else item.qty}x {item.item_name}"
            for item in items
        ]

        pr_number = None
        if q.party_name:
            pr_number = frappe.db.get_value(
                "Lead",
                q.party_name,  
                "custom_procurement_id",  
            )

        data.append({
            "id": q.name,
            "quoteNumber": q.name,
            "prNumber": pr_number,
            "date": str(q.transaction_date) if q.transaction_date else None,
            "items": item_list,
            "amount": q.grand_total,
            "status": q.status,
        })

    return {
        "success": True,
        "data": data,
    }




@frappe.whitelist(allow_guest=True)
def get_one_quotation(quotation_id):
    doc = frappe.get_doc("Quotation", quotation_id)

    pr_number = None
    if doc.party_name:
        pr_number = frappe.db.get_value(
            "Lead",
            doc.party_name,
            "custom_procurement_id"
        )

    return {
        "success": True,
        "data": {
            "id": doc.name,
            "quoteNumber": doc.name,
            "prNumber": pr_number,
            "date": str(doc.transaction_date) if doc.transaction_date else None,
            "items": [
                f"{item.qty:g}x {item.item_name}"
                for item in doc.items
            ],
            "amount": doc.grand_total,
            "status": doc.status,
        }
    }