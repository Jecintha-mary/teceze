import frappe


@frappe.whitelist(allow_guest=True)
def get_leave_applications_list(
    employee=None,
    from_date=None,
    to_date=None,
    status=None,
    limit_page_length=20,
    limit_start=0
):
    

    try:

        if not employee:
            frappe.local.response["http_status_code"] = 400
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 400
            frappe.local.response["message"] = "Employee is required"
            frappe.local.response["data"] = []
            frappe.local.response["total_count"] = 0
            return


        employee_name = frappe.db.get_value(
            "Employee",
            employee,
            "employee_name"
        )

        if not employee_name:
            frappe.local.response["http_status_code"] = 404
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 404
            frappe.local.response["message"] = "Employee not found"
            frappe.local.response["data"] = []
            frappe.local.response["total_count"] = 0
            return


        try:
            limit_page_length = int(limit_page_length)
            limit_start = int(limit_start)

        except (TypeError, ValueError):

            frappe.local.response["http_status_code"] = 400
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 400
            frappe.local.response["message"] = (
                "Invalid pagination parameters"
            )
            frappe.local.response["data"] = []
            frappe.local.response["total_count"] = 0
            return

        # Default page size
        if limit_page_length <= 0:
            limit_page_length = 20

        # Maximum page size
        if limit_page_length > 100:
            limit_page_length = 100

        # Offset cannot be negative
        if limit_start < 0:
            limit_start = 0


        filters = {
            "employee": employee
        }

        if from_date:
            filters["from_date"] = [">=", from_date]

        if to_date:
            filters["to_date"] = ["<=", to_date]

        if status:
            filters["status"] = status


        leave_applications = frappe.get_all(
            "Leave Application",
            filters=filters,
            fields=[
                "name",
                "employee",
                "leave_type",
                "from_date",
                "to_date",
                "half_day",
                "half_day_date",
                "total_leave_days",
                "description",
                "status",
                "docstatus",
                "posting_date",
                "company"
            ],
            order_by="from_date desc, creation desc",
            limit_start=limit_start,
            limit_page_length=limit_page_length
        )


        for leave in leave_applications:
            leave["employee_name"] = employee_name


        total_count = frappe.db.count(
            "Leave Application",
            filters=filters
        )


        frappe.local.response["http_status_code"] = 200
        frappe.local.response["success"] = True
        frappe.local.response["status_code"] = 200
        frappe.local.response["message"] = (
            "Leave applications fetched successfully"
        )
        frappe.local.response["data"] = leave_applications
        frappe.local.response["total_count"] = total_count


    except frappe.PermissionError:

        frappe.local.response["http_status_code"] = 403
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 403
        frappe.local.response["message"] = (
            "You do not have permission to access leave applications"
        )
        frappe.local.response["data"] = []
        frappe.local.response["total_count"] = 0


    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Leave Applications API Error"
        )

        frappe.local.response["http_status_code"] = 500
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 500
        frappe.local.response["message"] = (
            "Unable to fetch leave applications"
        )
        frappe.local.response["data"] = []
        frappe.local.response["total_count"] = 0



@frappe.whitelist(allow_guest=True)
def get_leave_application(employee=None, leave_application=None):

    try:

        if not employee:
            frappe.local.response["http_status_code"] = 400
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 400
            frappe.local.response["message"] = "Employee is required"
            frappe.local.response["data"] = None
            return


        if not leave_application:
            frappe.local.response["http_status_code"] = 400
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 400
            frappe.local.response["message"] = (
                "Leave application is required"
            )
            frappe.local.response["data"] = None
            return


        employee_name = frappe.db.get_value(
            "Employee",
            employee,
            "employee_name"
        )

        if not employee_name:
            frappe.local.response["http_status_code"] = 404
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 404
            frappe.local.response["message"] = "Employee not found"
            frappe.local.response["data"] = None
            return


        leave = frappe.db.get_value(
            "Leave Application",
            {
                "name": leave_application,
                "employee": employee
            },
            [
                "name",
                "employee",
                "leave_type",
                "from_date",
                "to_date",
                "half_day",
                "half_day_date",
                "total_leave_days",
                "description",
                "status",
                "docstatus",
                "posting_date",
                "company"
            ],
            as_dict=True
        )

        if not leave:
            frappe.local.response["http_status_code"] = 404
            frappe.local.response["success"] = False
            frappe.local.response["status_code"] = 404
            frappe.local.response["message"] = (
                "Leave application not found for this employee"
            )
            frappe.local.response["data"] = None
            return


        leave["employee_name"] = employee_name


        frappe.local.response["http_status_code"] = 200
        frappe.local.response["success"] = True
        frappe.local.response["status_code"] = 200
        frappe.local.response["message"] = (
            "Leave application fetched successfully"
        )
        frappe.local.response["data"] = leave


    except frappe.PermissionError:

        frappe.local.response["http_status_code"] = 403
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 403
        frappe.local.response["message"] = (
            "You do not have permission to access this leave application"
        )
        frappe.local.response["data"] = None


    except Exception:

        frappe.log_error(
            frappe.get_traceback(),
            "Get Leave Application API Error"
        )

        frappe.local.response["http_status_code"] = 500
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 500
        frappe.local.response["message"] = (
            "Unable to fetch leave application"
        )
        frappe.local.response["data"] = None



@frappe.whitelist(allow_guest=True)
def create_leave_application(
    employee=None,
    leave_type=None,
    from_date=None,
    to_date=None,
    half_day=0,
    half_day_date=None,
    description=None
):
    try:


        if not employee:
            return_error(
                400,
                "Employee is required"
            )
            return

        # ---------------------------------------------------------
        # 2. Validate Employee Exists
        # ---------------------------------------------------------

        employee_data = frappe.db.get_value(
            "Employee",
            employee,
            [
                "employee_name",
                "company",
                "department"
            ],
            as_dict=True
        )

        if not employee_data:
            return_error(
                404,
                "Employee not found"
            )
            return

        # ---------------------------------------------------------
        # 3. Validate Leave Type
        # ---------------------------------------------------------

        if not leave_type:
            return_error(
                400,
                "Leave type is required"
            )
            return

        if not frappe.db.exists(
            "Leave Type",
            leave_type
        ):
            return_error(
                404,
                "Leave type not found"
            )
            return

        # ---------------------------------------------------------
        # 4. Validate Dates
        # ---------------------------------------------------------

        if not from_date:
            return_error(
                400,
                "From date is required"
            )
            return

        if not to_date:
            return_error(
                400,
                "To date is required"
            )
            return

        if from_date > to_date:
            return_error(
                400,
                "From date cannot be greater than to date"
            )
            return

        # ---------------------------------------------------------
        # 5. Validate Half Day
        # ---------------------------------------------------------

        half_day = int(half_day or 0)

        if half_day not in (0, 1):
            return_error(
                400,
                "Half day must be either 0 or 1"
            )
            return

        if half_day == 1 and not half_day_date:
            return_error(
                400,
                "Half day date is required when half day is selected"
            )
            return

        # ---------------------------------------------------------
        # 6. Prepare Leave Application
        # ---------------------------------------------------------

        leave_application = frappe.get_doc({
            "doctype": "Leave Application",
            "employee": employee,
            "employee_name": employee_data.employee_name,
            "leave_type": leave_type,
            "from_date": from_date,
            "to_date": to_date,
            "half_day": half_day,
            "half_day_date": half_day_date if half_day else None,
            "description": description,
            "company": employee_data.company
        })

        # ---------------------------------------------------------
        # 7. Insert
        # ---------------------------------------------------------

        leave_application.insert(
            ignore_permissions=True
        )

        # ---------------------------------------------------------
        # IMPORTANT
        #
        # Do NOT submit here.
        #
        # docstatus = 0
        #
        # Your approval workflow can process this application.
        # ---------------------------------------------------------

        frappe.db.commit()

        # ---------------------------------------------------------
        # 8. Response
        # ---------------------------------------------------------

        data = {
            "name": leave_application.name,
            "employee": leave_application.employee,
            "employee_name": employee_data.employee_name,
            "leave_type": leave_application.leave_type,
            "from_date": leave_application.from_date,
            "to_date": leave_application.to_date,
            "half_day": leave_application.half_day,
            "half_day_date": leave_application.half_day_date,
            "total_leave_days": leave_application.total_leave_days,
            "description": leave_application.description,
            "status": leave_application.status,
            "docstatus": leave_application.docstatus,
            "posting_date": leave_application.posting_date,
            "company": leave_application.company
        }

        frappe.local.response["http_status_code"] = 201
        frappe.local.response["success"] = True
        frappe.local.response["status_code"] = 201
        frappe.local.response["message"] = (
            "Leave application created successfully"
        )
        frappe.local.response["data"] = data

    except frappe.ValidationError as e:

        frappe.db.rollback()

        frappe.log_error(
            frappe.get_traceback(),
            "Leave Application Validation Error"
        )

        frappe.local.response["http_status_code"] = 400
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 400
        frappe.local.response["message"] = str(e)
        frappe.local.response["data"] = None

    except frappe.PermissionError as e:

        frappe.db.rollback()

        frappe.log_error(
            frappe.get_traceback(),
            "Leave Application Permission Error"
        )

        frappe.local.response["http_status_code"] = 403
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 403
        frappe.local.response["message"] = str(e)
        frappe.local.response["data"] = None

    except Exception as e:

        frappe.db.rollback()

        # Log complete traceback
        frappe.log_error(
            frappe.get_traceback(),
            "Create Leave Application API Error"
        )

        # Return actual error temporarily for debugging
        frappe.local.response["http_status_code"] = 500
        frappe.local.response["success"] = False
        frappe.local.response["status_code"] = 500
        frappe.local.response["message"] = str(e)
        frappe.local.response["data"] = None


def return_error(status_code, message):

    frappe.local.response["http_status_code"] = status_code
    frappe.local.response["success"] = False
    frappe.local.response["status_code"] = status_code
    frappe.local.response["message"] = message
    frappe.local.response["data"] = None