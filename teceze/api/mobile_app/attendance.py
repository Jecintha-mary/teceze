import frappe

from teceze.api.employee_attendance import employee_checkin


def _get_employee():
    """Get the employee linked to the logged-in user."""

    if frappe.session.user == "Guest":
        frappe.throw(
            "You must be logged in",
            frappe.AuthenticationError
        )

    employee = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user},
        "name"
    )

    if not employee:
        frappe.throw(
            "No Employee is linked to the logged-in user",
            frappe.ValidationError
        )

    return employee


@frappe.whitelist(methods=["POST"])
def checkin():
    """Mobile employee check-in."""

    data = frappe.request.get_json() or {}

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if latitude is None or longitude is None:
        frappe.local.response.http_status_code = 400

        return {
            "success": False,
            "message": "Latitude and longitude are required"
        }

    try:
        employee = _get_employee()

        result = employee_checkin(
            employee=employee,
            log_type="IN",
            latitude=latitude,
            longitude=longitude
        )

        return {
            "success": True,
            "message": result.get(
                "message",
                "Check In Successful"
            ),
            "data": {
                "employee": employee,
                "latitude": float(latitude),
                "longitude": float(longitude)
            }
        }

    except frappe.AuthenticationError:
        frappe.local.response.http_status_code = 401

        return {
            "success": False,
            "message": "You must be logged in"
        }

    except Exception as e:
        frappe.local.response.http_status_code = 400

        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist(methods=["POST"])
def checkout():
    """Mobile employee check-out."""

    data = frappe.request.get_json() or {}

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if latitude is None or longitude is None:
        frappe.local.response.http_status_code = 400

        return {
            "success": False,
            "message": "Latitude and longitude are required"
        }

    try:
        employee = _get_employee()

        result = employee_checkin(
            employee=employee,
            log_type="OUT",
            latitude=latitude,
            longitude=longitude
        )

        return {
            "success": True,
            "message": result.get(
                "message",
                "Check Out Successful"
            ),
            "data": {
                "employee": employee,
                "latitude": float(latitude),
                "longitude": float(longitude),
                "working_hours": result.get(
                    "working_hours",
                    0
                )
            }
        }

    except frappe.AuthenticationError:
        frappe.local.response.http_status_code = 401

        return {
            "success": False,
            "message": "You must be logged in"
        }

    except Exception as e:
        frappe.local.response.http_status_code = 400

        return {
            "success": False,
            "message": str(e)
        }