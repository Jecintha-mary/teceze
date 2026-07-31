import frappe

@frappe.whitelist(allow_guest=True)
def get_locations(country):
    try:
        locations = frappe.get_all(
            "Location",
            filters={
                "custom_country": country
            },
            fields=[
                "location_name"
            ],
            order_by="location_name asc"
        )

        return {
            "success": True,
            "message": "Locations fetched successfully.",
            "data": locations
        }

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Get Locations API")
        frappe.throw("Unable to fetch locations")