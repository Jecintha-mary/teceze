import frappe
from phonenumbers import country_code_for_region


@frappe.whitelist(allow_guest=True)
def get_country_phone_details(country):
    try:
        # Get Country document
        country_doc = frappe.get_doc("Country", country)

        # ISO Country Code (IN, AZ, US...)
        country_code = country_doc.code.upper()

        # Get Dialing Code
        dialing_code = country_code_for_region(country_code)

        if dialing_code == 0:
            frappe.throw("Phone code not found")

        # Get Custom Max Length
        max_len = country_doc.custom_max_length

        return {
            "success": True,
            "data": [
                {
                    "phone_code": f"+{dialing_code}",
                    "max_len": max_len
                }
            ]
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Country Phone API")
        frappe.throw(str(e))