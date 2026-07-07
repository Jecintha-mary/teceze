import frappe

@frappe.whitelist(allow_guest=True)
def get_lost_quotations():

    quotations = frappe.get_all(
        "Quotation",
        filters={
            "status": "Lost"
        },
        fields=[
            "name",
            "transaction_date",
            "status",
            "grand_total"
        ]
    )

    data = []

    for q in quotations:

        items = frappe.get_all(
            "Quotation Item",
            filters={"parent": q.name},
            fields=["item_name", "qty"]
        )

        item_list = []

        for item in items:
            item_list.append(f"{item.qty}x {item.item_name}")

        data.append({
            "id": q.name,
            "quoteNumber": q.name,
            "prNumber": "",
            "date": q.transaction_date,
            "items": item_list,
            "amount": q.grand_total,
            "status": q.status
        })

    return {
        "success": True,
        "data": data,
        "statusCode": 200,
        "message": "Request processed successfully"
    }