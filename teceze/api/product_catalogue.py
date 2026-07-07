import frappe

@frappe.whitelist(allow_guest=True)
def get_products():
    try:
        # 1) Fetch all active items
        items = frappe.get_all(
            "Item",
            filters={"disabled": 0},
            fields=["item_code", "item_name", "item_group"]
        )

        # Get all item codes from fetched items
        item_codes = [item.item_code for item in items]

        # If no items exist, return empty response
        if not item_codes:
            return {
                "success": True,
                "data": [],
                "statusCode": 200,
                "message": "Products fetched successfully"
            }

        # 2) Fetch all prices for these items in one query
        item_prices = frappe.get_all(
            "Item Price",
            filters={"item_code": ["in", item_codes]},
            fields=["item_code", "price_list_rate"]
        )

        # Create price map: {item_code: price}
        price_map = {}
        for price in item_prices:
            if price.item_code not in price_map:
                price_map[price.item_code] = price.price_list_rate or 0

        # 3) Fetch all stock rows for these items in one query
        bins = frappe.get_all(
            "Bin",
            filters={"item_code": ["in", item_codes]},
            fields=["item_code", "actual_qty"]
        )

        # Create stock map: {item_code: total_stock}
        stock_map = {}
        for bin_row in bins:
            stock_map[bin_row.item_code] = stock_map.get(bin_row.item_code, 0) + (bin_row.actual_qty or 0)

        # 4) Build final response data
        data = []
        for item in items:
            data.append({
                "id": item.item_code,
                "name": item.item_name,
                "category": item.item_group,
                "price": price_map.get(item.item_code, 0),
                "stock": stock_map.get(item.item_code, 0)
            })

        return {
            "success": True,
            "data": data,
            "statusCode": 200,
            "message": "Products fetched successfully"
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Product Catalogue API Error")
        return {
            "success": False,
            "data": [],
            "statusCode": 500,
            "message": str(e)
        }