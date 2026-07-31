import frappe

@frappe.whitelist(allow_guest=True)
def get_countries():
    try:
        countries = frappe.get_all(
            "Country",
            fields=[
                "country_name",
                "code"
            ],
            order_by="country_name asc"
        )

        return {
            "success": True,
            "message": "Countries fetched successfully.",
            "data": countries
        }

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Get Countries API")
        frappe.throw("Unable to fetch countries")