import frappe

from frappe.utils import now_datetime, today
from geopy.distance import geodesic

settings = frappe.get_single(
        "Attendance Geofence Settings"
    )

latitude_test = settings.office_latitude,
longitude_test = settings.office_longitude

latitude = 13.0258
longitude = 80.2209
def validate_geofence(
    latitude,
    longitude
):

    settings = frappe.get_single(
        "Attendance Geofence Settings"
    )


    office = (
        settings.office_latitude,
        settings.office_longitude
    )

    employee = (
        float(latitude),
        float(longitude)
    )

    distance = geodesic(
        office,
        employee
    ).meters

    if distance > settings.allowed_radius:

        frappe.throw(
            f"""
            Outside Office Radius

            Distance:
            {round(distance,2)} m
            """
        )

    return distance

@frappe.whitelist()
# def check_in(
#     latitude,
#     longitude
# ):
def check_in():
    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": "jecintha.mary@teceze.com"
            # frappe.session.user
        },
        "name"
    )

    distance = validate_geofence(
        latitude,
        longitude
    )

    doc = frappe.get_doc({

        "doctype":
        "Employee Checkin",

        "employee":
        employee,

        "log_type":
        "IN",

        "time":
        now_datetime(),

        "latitude":
        latitude,

        "longitude":
        longitude,

        "distance":
        distance

    })

    doc.insert(
        ignore_permissions=True
    )

    frappe.db.commit()

    return "Checked In Successfully"

@frappe.whitelist()
def check_out():

    employee = frappe.db.get_value(
        "Employee",
        {
            "user_id": "jecintha.mary@teceze.com"
            # frappe.session.user
        },
        "name"
    )

    distance = validate_geofence(
        latitude,
        longitude
    )

    doc = frappe.get_doc({

        "doctype":
        "Employee Checkin",

        "employee":
        employee,

        "log_type":
        "OUT",

        "time":
        now_datetime(),

        "latitude":
        latitude,

        "longitude":
        longitude,

        "distance":
        distance

    })

    doc.insert(
        ignore_permissions=True
    )

    frappe.db.commit()

    return "Checked Out Successfully"

@frappe.whitelist()
def get_attendance_status():
    frappe.log_error("call attendance")
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": "jecintha.mary@teceze.com"}, #frappe.session.user
        "name"
    )
    frappe.log_error("employee",str(employee))
    today = frappe.utils.today()
    frappe.log_error("today",str(today))
    logs = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": ["between",
                [today + " 00:00:00",
                 today + " 23:59:59"]
            ]
        },
        fields=[
            "name",
            "log_type",
            "time"
        ],
        order_by="time desc",
        limit=1
    )

    if not logs:
        return {
            "status": "NOT_CHECKED_IN"
        }

    latest_log = logs[0]

    return {
        "status": latest_log.log_type,
        "checkin_time": str(latest_log.time)
    }