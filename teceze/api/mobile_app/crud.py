import json
import frappe
from frappe.utils import (
    now_datetime,
    getdate,
    get_datetime,
    add_to_date,
    date_diff
)

class CRUD:

    MAX_PAGE_SIZE = 100
    DEFAULT_PAGE_SIZE = 20
    MAX_BULK_SIZE = 100

    SYSTEM_FIELDS = {
        "name",
        "owner",
        "creation",
        "modified",
        "modified_by",
        "docstatus",
        "idx",
    }

    RESERVED_PARAMS = {
        "cmd",
        "doctype",
        "name",
        "page",
        "page_size",
        "limit",
        "sort_by",
        "sort_order",
        "order_by",
        "filters",
        "or_filters",
        "search",
        "search_field",
        "child_table",
        "parent",
    }

    OPERATORS = {
        "eq": "=",
        "ne": "!=",
        "gt": ">",
        "gte": ">=",
        "lt": "<",
        "lte": "<=",
        "like": "like",
        "in": "in",
        "between": "between",
    }

    @classmethod
    def handle(cls, doctype, permission=False):

        cls.validate_doctype(doctype)
        cls.check_authentication()

        method = frappe.request.method.upper()

        if method == "GET":
            return cls.handle_get(doctype,permission)

        if method == "POST":
            return cls.handle_post(doctype, permission)

        if method in ("PUT", "PATCH"):
            return cls.handle_update(doctype)

        if method == "DELETE":
            return cls.handle_delete(doctype)

        frappe.throw(
            f"Method {method} is not supported",
            frappe.ValidationError
        )

    # ---------------------------------------------------------
    # AUTHENTICATION
    # ---------------------------------------------------------

    @classmethod
    def check_authentication(cls):

        if frappe.session.user == "Guest":

            frappe.throw(
                "Authentication required",
                frappe.PermissionError
            )

    # ---------------------------------------------------------
    # DOCTYPE VALIDATION
    # ---------------------------------------------------------

    @classmethod
    def validate_doctype(cls, doctype):

        if not isinstance(doctype, str) or not doctype:

            frappe.throw(
                "Invalid DocType",
                frappe.ValidationError
            )

        if not frappe.db.exists("DocType", doctype):

            frappe.throw(
                f"DocType '{doctype}' does not exist",
                frappe.DoesNotExistError
            )

    # ---------------------------------------------------------
    # GET
    # ---------------------------------------------------------

    @classmethod
    def handle_get(cls, doctype,permission):

        meta = frappe.get_meta(doctype)

        # Single DocType
        if meta.issingle:

            return cls.get_single_doctype(doctype)

        name = frappe.form_dict.get("name")

        # Specific document
        if name:

            return cls.get_document(
                doctype=doctype,
                name=name
            )

        # Child table access
        child_table = frappe.form_dict.get("child_table")

        if child_table:

            parent_name = frappe.form_dict.get("parent")

            if not parent_name:

                frappe.throw(
                    "parent is required when child_table is used",
                    frappe.ValidationError
                )

            return cls.get_child_table(
                doctype=doctype,
                parent_name=parent_name,
                child_table=child_table
            )

        # Normal list
        return cls.get_list(doctype, permission)

    # ---------------------------------------------------------
    # GET SINGLE DOCTYPE
    # ---------------------------------------------------------

    @classmethod
    def get_single_doctype(cls, doctype):

        doc = frappe.get_single(doctype)

        if not doc.has_permission("read"):

            frappe.throw(
                "Permission denied",
                frappe.PermissionError
            )

        return {
            "success": True,
            "data": doc.as_dict()
        }

    # ---------------------------------------------------------
    # GET ONE DOCUMENT
    # ---------------------------------------------------------

    @classmethod
    def get_document(cls, doctype, name):

        try:

            doc = frappe.get_doc(
                doctype,
                name
            )

        except frappe.DoesNotExistError:

            return {
                "success": False,
                "message": "Document not found"
            }

        if not doc.has_permission("read"):

            frappe.throw(
                "Permission denied",
                frappe.PermissionError
            )

        return {
            "success": True,
            "data": doc.as_dict()
        }

    # ---------------------------------------------------------
    # GET LIST
    # ---------------------------------------------------------

    @classmethod
    def get_list(cls, doctype,permission):

        page, page_size = cls.get_pagination()

        filters = cls.build_filters(doctype)

        or_filters = cls.build_or_filters(doctype)

        order_by = cls.build_order_by(doctype)
        """
        SELECT * FROM Employee
        LIMIT 10 OFFSET 10;
        """
        start = (page - 1) * page_size

        """GET PAGINATED RECORDS
        frappe.get_list respects current user permissions"""

        records = frappe.get_list(
            doctype,
            filters=filters,
            or_filters=or_filters,
            fields=["*"],
            start=start,
            page_length=page_size,
            order_by=order_by,
            ignore_permissions=permission
        )

        # -----------------------------------------------------
        # GET TOTAL COUNT WITH USER PERMISSIONS
        #
        # IMPORTANT:
        # Do NOT use frappe.db.count()
        # because it counts database records directly and may
        # ignore Frappe permission filtering.
        #
        # frappe.get_list respects user permissions.
        # -----------------------------------------------------

        allowed_records = frappe.get_list(
            doctype,
            filters=filters,
            or_filters=or_filters,
            fields=["name"],
            page_length=0,
            ignore_permissions=permission
        )

        total = len(allowed_records)

        total_pages = (
            (total + page_size - 1) // page_size
            if total
            else 0
        )

        return {
            "success": True,
            "data": records,

            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_records": total,
                "total_pages": total_pages,

                "has_next_page": (
                    page < total_pages
                ),

                "has_previous_page": (
                    page > 1
                )
            }
        }

    # ---------------------------------------------------------
    # PAGINATION
    # ---------------------------------------------------------

    @classmethod
    def get_pagination(cls):

        page = frappe.form_dict.get(
            "page",
            1
        )

        page_size = frappe.form_dict.get(
            "page_size",
            cls.DEFAULT_PAGE_SIZE
        )

        try:

            page = int(page)
            page_size = int(page_size)

        except (TypeError, ValueError):

            frappe.throw(
                "page and page_size must be integers",
                frappe.ValidationError
            )

        if page < 1:

            page = 1

        if page_size < 1:

            page_size = cls.DEFAULT_PAGE_SIZE

        if page_size > cls.MAX_PAGE_SIZE:

            page_size = cls.MAX_PAGE_SIZE

        return page, page_size

    # ---------------------------------------------------------
    # FILTER BUILDER
    # ---------------------------------------------------------

    @classmethod
    def build_filters(cls, doctype):

        filters = []

        # JSON FILTERS
        raw_filters = frappe.form_dict.get("filters")

        if raw_filters:

            if isinstance(raw_filters, str):

                try:

                    raw_filters = json.loads(
                        raw_filters
                    )

                except Exception:

                    frappe.throw(
                        "Invalid filters JSON",
                        frappe.ValidationError
                    )

            if not isinstance(raw_filters, list):

                frappe.throw(
                    "filters must be a list",
                    frappe.ValidationError
                )

            for item in raw_filters:

                cls.validate_filter(
                    doctype,
                    item
                )

                filters.append(item)

        # QUERY PARAM FILTERS
        for key, value in frappe.form_dict.items():

            if key in cls.RESERVED_PARAMS:

                continue

            if value in (None, ""):

                continue

            fieldname, operator = cls.parse_filter_key(
                key
            )

            cls.validate_field(
                doctype,
                fieldname
            )

            # Exact equality
            if operator == "=":

                filters.append(
                    [fieldname, "=", value]
                )

                continue

            # IN
            if operator == "in":

                values = cls.parse_list_value(
                    value
                )

                filters.append(
                    [
                        fieldname,
                        "in",
                        values
                    ]
                )

                continue

            # BETWEEN
            if operator == "between":

                values = cls.parse_between_value(
                    value
                )

                filters.append(
                    [
                        fieldname,
                        "between",
                        values
                    ]
                )

                continue

            # LIKE
            if operator == "like":

                filters.append(
                    [
                        fieldname,
                        "like",
                        f"%{value}%"
                    ]
                )

                continue

            # Normal operators
            filters.append(
                [
                    fieldname,
                    operator,
                    value
                ]
            )

        return filters

    # ---------------------------------------------------------
    # OR FILTERS
    # ---------------------------------------------------------

    @classmethod
    def build_or_filters(cls, doctype):

        raw_or_filters = frappe.form_dict.get(
            "or_filters"
        )

        if not raw_or_filters:

            return []

        if isinstance(raw_or_filters, str):

            try:

                raw_or_filters = json.loads(
                    raw_or_filters
                )

            except Exception:

                frappe.throw(
                    "Invalid or_filters JSON",
                    frappe.ValidationError
                )

        if not isinstance(raw_or_filters, list):

            frappe.throw(
                "or_filters must be a list",
                frappe.ValidationError
            )

        for item in raw_or_filters:

            cls.validate_filter(
                doctype,
                item
            )

        return raw_or_filters

    # ---------------------------------------------------------
    # PARSE FILTER
    # ---------------------------------------------------------

    @classmethod
    def parse_filter_key(cls, key):

        if "__" not in key:

            return key, "="

        fieldname, operator_name = key.rsplit(
            "__",
            1
        )

        if operator_name not in cls.OPERATORS:

            frappe.throw(
                f"Invalid filter operator: {operator_name}",
                frappe.ValidationError
            )

        return (
            fieldname,
            cls.OPERATORS[operator_name]
        )

    # ---------------------------------------------------------
    # PARSE LIST
    # ---------------------------------------------------------

    @classmethod
    def parse_list_value(cls, value):

        if isinstance(value, list):

            return value

        try:

            parsed = json.loads(value)

            if isinstance(parsed, list):

                return parsed

        except Exception:

            pass

        return [
            item.strip()
            for item in str(value).split(",")
            if item.strip()
        ]

    # ---------------------------------------------------------
    # PARSE BETWEEN
    # ---------------------------------------------------------

    @classmethod
    def parse_between_value(cls, value):

        if isinstance(value, list):

            values = value

        else:

            try:

                parsed = json.loads(value)

                if isinstance(parsed, list):

                    values = parsed

                else:

                    values = str(value).split(",")

            except Exception:

                values = str(value).split(",")

        if len(values) != 2:

            frappe.throw(
                "between requires exactly two values",
                frappe.ValidationError
            )

        return [
            values[0].strip()
            if isinstance(values[0], str)
            else values[0],

            values[1].strip()
            if isinstance(values[1], str)
            else values[1]
        ]

    # ---------------------------------------------------------
    # VALIDATE FILTER
    # ---------------------------------------------------------

    @classmethod
    def validate_filter(cls, doctype, item):

        if not isinstance(item, (list, tuple)):

            frappe.throw(
                "Each filter must be a list",
                frappe.ValidationError
            )

        if len(item) < 3:

            frappe.throw(
                "Invalid filter format",
                frappe.ValidationError
            )

        fieldname = item[0]
        operator = item[1]

        allowed_operators = set(
            cls.OPERATORS.values()
        )

        if operator not in allowed_operators:

            frappe.throw(
                f"Invalid operator: {operator}",
                frappe.ValidationError
            )

        cls.validate_field(
            doctype,
            fieldname
        )

    # ---------------------------------------------------------
    # SORTING
    # ---------------------------------------------------------

    @classmethod
    def build_order_by(cls, doctype):

        sort_by = frappe.form_dict.get(
            "sort_by",
            "creation"
        )

        sort_order = frappe.form_dict.get(
            "sort_order",
            "desc"
        ).lower()

        if sort_order not in ("asc", "desc"):

            frappe.throw(
                "sort_order must be asc or desc",
                frappe.ValidationError
            )

        if sort_by not in cls.SYSTEM_FIELDS:

            cls.validate_field(
                doctype,
                sort_by
            )

        return f"{sort_by} {sort_order}"

    # ---------------------------------------------------------
    # GET CHILD TABLE
    # ---------------------------------------------------------

    @classmethod
    def get_child_table(
        cls,
        doctype,
        parent_name,
        child_table
    ):

        try:

            parent_doc = frappe.get_doc(
                doctype,
                parent_name
            )

        except frappe.DoesNotExistError:

            return {
                "success": False,
                "message": "Parent document not found"
            }

        if not parent_doc.has_permission("read"):

            frappe.throw(
                "Permission denied",
                frappe.PermissionError
            )

        table_field = cls.get_table_field(
            doctype,
            child_table
        )

        child_data = parent_doc.get(
            child_table
        ) or []

        return {
            "success": True,

            "parent": {
                "doctype": doctype,
                "name": parent_name
            },

            "child_table": {
                "fieldname": child_table,
                "doctype": table_field.options
            },

            "data": [
                row.as_dict()
                for row in child_data
            ]
        }

    # ---------------------------------------------------------
    # GET TABLE FIELD
    # ---------------------------------------------------------

    @classmethod
    def get_table_field(
        cls,
        doctype,
        fieldname
    ):

        meta = frappe.get_meta(doctype)

        field = meta.get_field(
            fieldname
        )

        if not field:

            frappe.throw(
                f"Field '{fieldname}' does not exist",
                frappe.ValidationError
            )

        if field.fieldtype not in (
            "Table",
            "Table MultiSelect"
        ):

            frappe.throw(
                f"'{fieldname}' is not a child table",
                frappe.ValidationError
            )

        if not field.options:

            frappe.throw(
                f"Child DocType not found for '{fieldname}'",
                frappe.ValidationError
            )

        return field

    # ---------------------------------------------------------
    # POST
    # ---------------------------------------------------------

    @classmethod
    def handle_post(cls, doctype, permission):

        payload = cls.get_json_payload()

        data = payload.get(
            "data",
            payload
        )

        # Bulk create
        if isinstance(data, list):

            return cls.create_bulk(
                doctype,
                data
            )

        # Single create
        if not isinstance(data, dict):

            frappe.throw(
                "data must be an object or list",
                frappe.ValidationError
            )

        if not data:

            frappe.throw(
                "data cannot be empty",
                frappe.ValidationError
            )

        return cls.create_document(
            doctype,
            data,
            permission
        )

    # ---------------------------------------------------------
    # CREATE DOCUMENT
    # ---------------------------------------------------------

    @classmethod
    def create_document(
        cls,
        doctype,
        data,
        permission
    ):

        clean_data = cls.clean_document_data(
            doctype,
            data
        )

        doc = frappe.get_doc({
            "doctype": doctype,
            **clean_data
        })

        doc.insert(
            ignore_permissions=permission
        )

        return {
            "success": True,
            "message": "Document created successfully",
            "data": doc.as_dict()
        }

    # ---------------------------------------------------------
    # BULK CREATE
    # ---------------------------------------------------------

    @classmethod
    def create_bulk(
        cls,
        doctype,
        items
    ):

        cls.validate_bulk_size(items)

        results = []
        errors = []
        """  
        need to atomic permission
        """
        for index, item in enumerate(items):

            if not isinstance(item, dict):

                errors.append({
                    "index": index,
                    "error": "Each item must be an object"
                })

                continue

            try:

                clean_data = cls.clean_document_data(
                    doctype,
                    item
                )

                doc = frappe.get_doc({
                    "doctype": doctype,
                    **clean_data
                })

                doc.insert()

                results.append(
                    doc.as_dict()
                )

            except Exception as e:

                frappe.db.rollback()

                frappe.log_error(
                    frappe.get_traceback(),
                    "Common CRUD Bulk Create Error"
                )

                errors.append({
                    "index": index,
                    "error": str(e)
                })

        return {
            "success": len(errors) == 0,

            "message": "Bulk create completed",

            "created_count": len(results),
            "failed_count": len(errors),

            "data": results,
            "errors": errors
        }

    # ---------------------------------------------------------
    # UPDATE HANDLER
    # ---------------------------------------------------------

    @classmethod
    def handle_update(cls, doctype):

        payload = cls.get_json_payload()

        data = payload.get(
            "data",
            payload
        )

        # Bulk update
        if isinstance(data, list):

            return cls.update_bulk(
                doctype,
                data
            )

        if not isinstance(data, dict):

            frappe.throw(
                "data must be an object or list",
                frappe.ValidationError
            )

        name = (
            payload.get("name")
            or data.get("name")
            or frappe.form_dict.get("name")
        )

        if not name:

            frappe.throw(
                "name is required for update",
                frappe.ValidationError
            )

        return cls.update_document(
            doctype=doctype,
            name=name,
            data=data
        )

    # ---------------------------------------------------------
    # UPDATE DOCUMENT
    # ---------------------------------------------------------

    @classmethod
    def update_document(
        cls,
        doctype,
        name,
        data
    ):

        try:

            doc = frappe.get_doc(
                doctype,
                name
            )

        except frappe.DoesNotExistError:

            return {
                "success": False,
                "message": "Document not found"
            }

        if not doc.has_permission("write"):

            frappe.throw(
                "Permission denied",
                frappe.PermissionError
            )

        data = data.copy()

        data.pop("name", None)

        clean_data = cls.clean_document_data(
            doctype,
            data
        )

        for fieldname, value in clean_data.items():

            doc.set(
                fieldname,
                value
            )

        doc.save()

        return {
            "success": True,
            "message": "Document updated successfully",
            "data": doc.as_dict()
        }

    # ---------------------------------------------------------
    # BULK UPDATE
    # ---------------------------------------------------------

    @classmethod
    def update_bulk(
        cls,
        doctype,
        items
    ):

        cls.validate_bulk_size(items)

        results = []
        errors = []

        for index, item in enumerate(items):

            if not isinstance(item, dict):

                errors.append({
                    "index": index,
                    "error": "Each item must be an object"
                })

                continue

            name = item.get("name")

            if not name:

                errors.append({
                    "index": index,
                    "error": "name is required"
                })

                continue

            try:

                doc = frappe.get_doc(
                    doctype,
                    name
                )

                if not doc.has_permission("write"):

                    raise frappe.PermissionError(
                        "Permission denied"
                    )

                data = item.copy()

                data.pop(
                    "name",
                    None
                )

                clean_data = cls.clean_document_data(
                    doctype,
                    data
                )

                for fieldname, value in clean_data.items():

                    doc.set(
                        fieldname,
                        value
                    )

                doc.save()

                results.append(
                    doc.as_dict()
                )

            except Exception as e:

                frappe.db.rollback()

                frappe.log_error(
                    frappe.get_traceback(),
                    "Common CRUD Bulk Update Error"
                )

                errors.append({
                    "index": index,
                    "name": name,
                    "error": str(e)
                })

        return {
            "success": len(errors) == 0,

            "message": "Bulk update completed",

            "updated_count": len(results),
            "failed_count": len(errors),

            "data": results,
            "errors": errors
        }

    # ---------------------------------------------------------
    # DELETE
    # ---------------------------------------------------------

    @classmethod
    def handle_delete(cls, doctype):

        payload = cls.get_json_payload(
            allow_empty=True
        )

        names = (
            payload.get("names")
            or payload.get("data")
            or frappe.form_dict.get("names")
        )

        name = (
            payload.get("name")
            or frappe.form_dict.get("name")
        )

        # Bulk delete
        if names:

            if isinstance(names, str):

                try:

                    parsed = json.loads(names)

                    if isinstance(parsed, list):

                        names = parsed

                    else:

                        names = [
                            item.strip()
                            for item in names.split(",")
                            if item.strip()
                        ]

                except Exception:

                    names = [
                        item.strip()
                        for item in names.split(",")
                        if item.strip()
                    ]

            if not isinstance(names, list):

                frappe.throw(
                    "names must be a list",
                    frappe.ValidationError
                )

            return cls.delete_bulk(
                doctype,
                names
            )

        # Single delete
        if not name:

            frappe.throw(
                "name or names is required",
                frappe.ValidationError
            )

        return cls.delete_document(
            doctype,
            name
        )

    # ---------------------------------------------------------
    # DELETE DOCUMENT
    # ---------------------------------------------------------

    @classmethod
    def delete_document(
        cls,
        doctype,
        name
    ):

        try:

            doc = frappe.get_doc(
                doctype,
                name
            )

        except frappe.DoesNotExistError:

            return {
                "success": False,
                "message": "Document not found"
            }

        if not doc.has_permission("delete"):

            frappe.throw(
                "Permission denied",
                frappe.PermissionError
            )

        frappe.delete_doc(
            doctype,
            name
        )

        return {
            "success": True,
            "message": "Document deleted successfully",
            "name": name
        }

    # ---------------------------------------------------------
    # BULK DELETE
    # ---------------------------------------------------------

    @classmethod
    def delete_bulk(
        cls,
        doctype,
        names
    ):

        cls.validate_bulk_size(names)

        deleted = []
        errors = []

        for index, name in enumerate(names):

            if not isinstance(name, str) or not name:

                errors.append({
                    "index": index,
                    "error": "Invalid name"
                })

                continue

            try:

                doc = frappe.get_doc(
                    doctype,
                    name
                )

                if not doc.has_permission("delete"):

                    raise frappe.PermissionError(
                        "Permission denied"
                    )

                frappe.delete_doc(
                    doctype,
                    name
                )

                deleted.append(name)

            except Exception as e:

                frappe.db.rollback()

                frappe.log_error(
                    frappe.get_traceback(),
                    "Common CRUD Bulk Delete Error"
                )

                errors.append({
                    "index": index,
                    "name": name,
                    "error": str(e)
                })

        return {
            "success": len(errors) == 0,

            "message": "Bulk delete completed",

            "deleted_count": len(deleted),
            "failed_count": len(errors),

            "deleted": deleted,
            "errors": errors
        }

    # ---------------------------------------------------------
    # CLEAN DOCUMENT DATA
    # ---------------------------------------------------------

    @classmethod
    def clean_document_data(
        cls,
        doctype,
        data,
        allow_system_fields=False
    ):

        if not isinstance(data, dict):

            frappe.throw(
                "Document data must be an object",
                frappe.ValidationError
            )

        meta = frappe.get_meta(doctype)

        clean_data = {}
        invalid_fields = []

        for fieldname, value in data.items():

            # Allow child row name and idx for update
            if (
                allow_system_fields
                and fieldname in ("name", "idx")
            ):

                clean_data[fieldname] = value

                continue

            # Skip parent system fields
            if fieldname in cls.SYSTEM_FIELDS:

                continue

            field = meta.get_field(
                fieldname
            )

            if not field:

                invalid_fields.append(
                    fieldname
                )

                continue

            # CHILD TABLE
            if field.fieldtype in (
                "Table",
                "Table MultiSelect"
            ):

                clean_data[fieldname] = (
                    cls.clean_child_table(
                        child_doctype=field.options,
                        rows=value
                    )
                )

                continue

            # Normal field
            clean_data[fieldname] = value

        if invalid_fields:

            frappe.throw(
                "Invalid fields: "
                + ", ".join(invalid_fields),
                frappe.ValidationError
            )

        return clean_data

    # ---------------------------------------------------------
    # CLEAN CHILD TABLE
    # ---------------------------------------------------------

    @classmethod
    def clean_child_table(
        cls,
        child_doctype,
        rows
    ):

        if not isinstance(rows, list):

            frappe.throw(
                f"Child table data for "
                f"'{child_doctype}' must be a list",
                frappe.ValidationError
            )

        clean_rows = []

        for index, row in enumerate(rows):

            if not isinstance(row, dict):

                frappe.throw(
                    f"Child row at index {index} "
                    f"must be an object",
                    frappe.ValidationError
                )

            clean_row = cls.clean_document_data(
                doctype=child_doctype,
                data=row,
                allow_system_fields=True
            )

            clean_rows.append(
                clean_row
            )

        return clean_rows

    # ---------------------------------------------------------
    # FIELD VALIDATION
    # ---------------------------------------------------------

    @classmethod
    def validate_field(
        cls,
        doctype,
        fieldname
    ):

        if fieldname in cls.SYSTEM_FIELDS:

            return

        meta = frappe.get_meta(doctype)

        if not meta.get_field(fieldname):

            frappe.throw(
                f"Invalid field: {fieldname}",
                frappe.ValidationError
            )

    # ---------------------------------------------------------
    # BULK SIZE VALIDATION
    # ---------------------------------------------------------

    @classmethod
    def validate_bulk_size(cls, items):

        if not isinstance(items, list):

            frappe.throw(
                "Bulk data must be a list",
                frappe.ValidationError
            )

        if not items:

            frappe.throw(
                "Bulk data cannot be empty",
                frappe.ValidationError
            )

        if len(items) > cls.MAX_BULK_SIZE:

            frappe.throw(
                f"Maximum {cls.MAX_BULK_SIZE} "
                f"records allowed",
                frappe.ValidationError
            )

    # ---------------------------------------------------------
    # JSON PAYLOAD
    # ---------------------------------------------------------

    @classmethod
    def get_json_payload(
        cls,
        allow_empty=False
    ):

        data = frappe.request.get_json(
            silent=True
        )

        if data is None:

            data = {}

        if not isinstance(data, dict):

            frappe.throw(
                "Request body must be a JSON object",
                frappe.ValidationError
            )

        if not data and not allow_empty:

            frappe.throw(
                "Request body is required",
                frappe.ValidationError
            )

        return data


from frappe.utils import add_days, getdate




@frappe.whitelist(allow_guest=True)
def employee_checkin():

    return CRUD.handle(
        doctype="Employee Checkin",
        permission=True
    )

@frappe.whitelist(allow_guest=True)
def app_policy():
    return CRUD.handle(
        doctype="Terms and Conditions",
         permission=True
    )

@frappe.whitelist(allow_guest=True)
def attendance():
    return CRUD.handle(
        doctype="Attendance"
    )


@frappe.whitelist(allow_guest=False)
def project():
    return CRUD.handle(
        doctype="Project"
    )

@frappe.whitelist(allow_guest=False)
def tasklist():
    return CRUD.handle(
        doctype="Task"
    )
import frappe

@frappe.whitelist()
def timesheet():

    response = CRUD.handle("Timesheet")

    # Only modify normal list response
    if (
        isinstance(response, dict)
        and response.get("success")
        and isinstance(response.get("data"), list)
    ):
        records = response["data"]

        names = [row.get("name") for row in records if row.get("name")]

        if names:
            child_rows = frappe.get_all(
                "Timesheet Detail",
                filters={
                    "parent": ["in", names],
                    "parenttype": "Timesheet",
                    "parentfield": "time_logs"
                },
                fields=["*"],
                order_by="parent asc, idx asc"
            )

            child_map = {}

            for child in child_rows:
                child_map.setdefault(child.parent, []).append(child)

            for record in records:
                record["time_logs"] = child_map.get(
                    record.get("name"),
                    []
                )

    return response
@frappe.whitelist(allow_guest=False)
def employee():
    return CRUD.handle(
        doctype="Employee"
    )





def get_logged_in_employee():

    employee = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user},
        "name"
    )

    if not employee:
        frappe.throw("Employee not found")

    return employee


def get_shift_assignment(employee, shift_date):

    assignments = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": employee,
            "start_date": ["<=", shift_date]
        },
        fields=[
            "shift_type",
            "start_date",
            "end_date"
        ],
        order_by="start_date desc"
    )

    for assignment in assignments:

        if (
            not assignment.end_date
            or getdate(assignment.end_date) >= getdate(shift_date)
        ):
            return assignment

    return None


def get_shift_window(employee, shift_date):

    assignment = get_shift_assignment(
        employee,
        shift_date
    )

    if not assignment:
        return None

    shift = frappe.get_doc(
        "Shift Type",
        assignment.shift_type
    )

    start = get_datetime(
        f"{shift_date} {shift.start_time}"
    )

    end = get_datetime(
        f"{shift_date} {shift.end_time}"
    )

    # Night shift
    if shift.end_time <= shift.start_time:
        end = add_to_date(end, days=1)

    # Buffer
    from_time = add_to_date(start, hours=-2)
    to_time = add_to_date(end, hours=2)

    return {
        "shift_type": assignment.shift_type,
        "shift_start": start,
        "shift_end": end,
        "from_time": from_time,
        "to_time": to_time
    }


def get_checkin(employee, from_time, to_time, log_type, order):

    records = frappe.get_all(
        "Employee Checkin",
        filters=[
            ["employee", "=", employee],
            ["log_type", "=", log_type],
            ["time", "between", [from_time, to_time]]
        ],
        fields=["name", "log_type", "time"],
        order_by=f"time {order}",
        limit_page_length=1
    )

    return records[0] if records else None

def calculate_worked_time(first_in, last_out=None):

    # No check-in
    if not first_in:
        return None

    # If OUT exists, calculate until OUT
    end_time = last_out or now_datetime()

    seconds = int(
        (end_time - first_in).total_seconds()
    )

    if seconds < 0:
        return None

    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    return {
        "total_seconds": (
            hours * 3600
            + minutes * 60
            + seconds
        ),
        "formatted":
            f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    }



@frappe.whitelist(allow_guest=False)
def get_employee_first_checkin_of_shift():

    employee = get_logged_in_employee()

    shift_data = get_shift_window(
        employee,
        getdate(now_datetime())
    )

    if not shift_data:
        frappe.throw("Shift Assignment not found")

    first_in = get_checkin(
        employee,
        shift_data["from_time"],
        shift_data["to_time"],
        "IN",
        "asc"
    )

    return {
        "employee": employee,
        **shift_data,
        "first_checkin": first_in
    }



def get_date_range(days=None, from_date=None, to_date=None):

    # Specific date range
    if from_date and to_date:

        from_date = getdate(from_date)
        to_date = getdate(to_date)

    # Number of days
    else:

        days = int(days or 10)

        if days <= 0:
            frappe.throw("Days must be greater than 0")

        to_date = getdate(now_datetime())

        from_date = getdate(
            add_to_date(
                to_date,
                days=-(days - 1),
                as_string=True
            )
        )

    if from_date > to_date:
        frappe.throw(
            "From Date cannot be greater than To Date"
        )

    return from_date, to_date

@frappe.whitelist(allow_guest=False)
def get_employee_checkin_summary(
    days=None,
    from_date=None,
    to_date=None
):

    employee = get_logged_in_employee()

    from_date, to_date = get_date_range(
        days,
        from_date,
        to_date
    )

    total_days = date_diff(
        to_date,
        from_date
    ) + 1

    result = []

    for i in range(total_days):

        current_date = add_to_date(
            from_date,
            days=i
        )

        shift_data = get_shift_window(
            employee,
            current_date
        )

        # No shift
        if not shift_data:

            result.append({
                "date": str(current_date),
                "shift_type": None,
                "first_in": None,
                "last_out": None,
                "worked_hours": None
            })

            continue

        # First IN
        first_in = get_checkin(
            employee,
            shift_data["from_time"],
            shift_data["to_time"],
            "IN",
            "asc"
        )

        # Last OUT
        last_out = get_checkin(
            employee,
            shift_data["from_time"],
            shift_data["to_time"],
            "OUT",
            "desc"
        )

        first_time = (
            first_in.time
            if first_in
            else None
        )

        last_time = (
            last_out.time
            if last_out
            else None
        )

        worked_time = calculate_worked_time(
            first_time,
            last_time
        )

        result.append({
            "date": str(current_date),
            "shift_type": shift_data["shift_type"],
            "first_in": str(first_time) if first_time else None,
            "last_out": str(last_time) if last_time else None,
            "worked_hours": (
                worked_time["formatted"]
                if worked_time
                else None
            ),
            "total_seconds": (
                worked_time["total_seconds"]
                if worked_time
                else 0
            )
        })

    return {
        "employee": employee,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "total_days": total_days,
        "data": result
    }
from frappe.utils import get_datetime, getdate, now_datetime, add_to_date


def get_current_checkin_status(employee, date=None):

    if not date:
        date = getdate(now_datetime())

    shift_name = frappe.db.get_value(
        "Employee",
        employee,
        "default_shift"
    )

    if not shift_name:
        return "NOT_CHECKED_IN"

    shift = frappe.db.get_value(
        "Shift Type",
        shift_name,
        [
            "start_time",
            "end_time",
            "begin_check_in_before_shift_start_time",
            "allow_check_out_after_shift_end_time",
        ],
        as_dict=True
    )

    if not shift:
        return "NOT_CHECKED_IN"

    # Shift start/end
    start_datetime = get_datetime(
        f"{date} {shift.start_time}"
    )

    end_datetime = get_datetime(
        f"{date} {shift.end_time}"
    )

    # Apply thresholds
    start_datetime = add_to_date(
        start_datetime,
        minutes=-(
            shift.begin_check_in_before_shift_start_time or 0
        )
    )

    end_datetime = add_to_date(
        end_datetime,
        minutes=(
            shift.allow_check_out_after_shift_end_time or 0
        )
    )

    # Get latest check-in inside effective shift window
    checkin = frappe.get_all(
        "Employee Checkin",
        filters=[
            ["employee", "=", employee],
            ["time", ">=", start_datetime],
            ["time", "<=", end_datetime],
        ],
        fields=["log_type", "time"],
        order_by="time desc",
        limit_page_length=1,
    )

    if not checkin:
        return "NOT_CHECKED_IN"

    return checkin[0].log_type
@frappe.whitelist(allow_guest=False)
def team_members():

    current_employee = get_logged_in_employee()

    # ---------------------------------------------------------
    # GET REPORTING MANAGER
    # ---------------------------------------------------------

    reports_to = frappe.db.get_value(
        "Employee",
        current_employee,
        "reports_to"
    )

    if not reports_to:
        return {
            "success": True,
            "data": [],
            "pagination": {
                "page": 1,
                "page_size": CRUD.DEFAULT_PAGE_SIZE,
                "total_records": 0,
                "total_pages": 0,
                "has_next_page": False,
                "has_previous_page": False
            }
        }

    # ---------------------------------------------------------
    # REUSE GENERIC CRUD PAGINATION
    # ---------------------------------------------------------

    page, page_size = CRUD.get_pagination()

    start = (page - 1) * page_size

    # ---------------------------------------------------------
    # GET TOTAL TEAM MEMBERS
    # ---------------------------------------------------------

    total_records = frappe.db.count(
        "Employee",
        filters={
            "reports_to": reports_to,
            "status": "Active",
            "name": ["!=", current_employee],
        }
    )

    total_pages = (
        (total_records + page_size - 1) // page_size
        if total_records
        else 0
    )

    # ---------------------------------------------------------
    # GET PAGINATED TEAM MEMBERS
    # ---------------------------------------------------------

    employees = frappe.get_all(
        "Employee",
        filters={
            "reports_to": reports_to,
            "status": "Active",
            "name": ["!=", current_employee],
        },
        fields=[
            "name",
            "employee_name",
            "user_id",
            "designation",
            "department",
            "image",
            "custom_shift",
            "default_shift",
            "custom_work_location",
            "company_email",
            "cell_number"
        ],
        order_by="employee_name asc",
        start=start,
        page_length=page_size,
    )

    # ---------------------------------------------------------
    # TODAY
    # ---------------------------------------------------------

    today = getdate(now_datetime())

    # ---------------------------------------------------------
    # CALCULATE MEMBER STATUS
    # ---------------------------------------------------------

    for member in employees:

        # -----------------------------------------------------
        # CHECK APPROVED LEAVE TODAY
        # -----------------------------------------------------

        leave = frappe.get_all(
            "Leave Application",
            filters=[
                ["employee", "=", member.name],
                ["status", "=", "Approved"],
                ["from_date", "<=", today],
                ["to_date", ">=", today],
            ],
            fields=["name"],
            limit_page_length=1,
        )

        if leave:
            member["status"] = "LEAVE"
            continue

        # -----------------------------------------------------
        # CHECK CURRENT CHECK-IN STATUS
        # -----------------------------------------------------

        member["status"] = get_current_checkin_status(
            member.name,
            today
        )

    # ---------------------------------------------------------
    # RESPONSE
    # ---------------------------------------------------------

    return {
        "success": True,
        "data": employees,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total_records,
            "total_pages": total_pages,
            "has_next_page": page < total_pages,
            "has_previous_page": page > 1
        }
    }


@frappe.whitelist(allow_guest=False)
def activity_type():
    return CRUD.handle(
        doctype="Activity Type",
    )
@frappe.whitelist(allow_guest=False)
def leave_type():
    return CRUD.handle(
        doctype="Leave Type",
    )

@frappe.whitelist(allow_guest=False)
def attendance_request():
    return CRUD.handle(
        doctype="Attendance Request",
    )

@frappe.whitelist(allow_guest=False)
def leave_balance():

    # -----------------------------------------
    # LEAVE ALLOCATION
    # -----------------------------------------

    allocations = frappe.get_list(
        "Leave Allocation",
        fields=[
            "leave_type",
            "total_leaves_allocated"
        ]
    )

    leave_balance = {}

    for allocation in allocations:

        leave_type = allocation.leave_type

        if leave_type not in leave_balance:
            leave_balance[leave_type] = {
                "leave_type": leave_type,
                "total": 0,
                "used": 0,
                "balance": 0
            }

        leave_balance[leave_type]["total"] += (
            allocation.total_leaves_allocated or 0
        )

    # -----------------------------------------
    # USED LEAVE
    # -----------------------------------------

    applications = frappe.get_list(
        "Leave Application",
        filters={
            "status": "Approved"
        },
        fields=[
            "leave_type",
            "total_leave_days"
        ]
    )

    for application in applications:

        leave_type = application.leave_type

        if leave_type not in leave_balance:
            leave_balance[leave_type] = {
                "leave_type": leave_type,
                "total": 0,
                "used": 0,
                "balance": 0
            }

        leave_balance[leave_type]["used"] += (
            application.total_leave_days or 0
        )

    # -----------------------------------------
    # CALCULATE BALANCE
    # -----------------------------------------

    for item in leave_balance.values():

        item["balance"] = (
            item["total"] - item["used"]
        )

    return {
        "success": True,
        "data": list(leave_balance.values())
    }  



from frappe.utils import (
    getdate,
    date_diff,
    add_to_date,
)


@frappe.whitelist(allow_guest=False)
def get_attendance_list(
    from_date=None,
    to_date=None
):

    # =====================================================
    # 1. VALIDATE DATE PARAMETERS
    # =====================================================

    if not from_date or not to_date:
        frappe.throw(
            "from_date and to_date are required",
            frappe.ValidationError
        )

    from_date = getdate(from_date)
    to_date = getdate(to_date)

    if to_date < from_date:
        frappe.throw(
            "to_date cannot be earlier than from_date",
            frappe.ValidationError
        )

    # =====================================================
    # 2. GET LOGGED-IN EMPLOYEE
    # =====================================================

    employee = get_logged_in_employee()

    # =====================================================
    # 3. GET EMPLOYEE DETAILS
    # =====================================================

    employee_data = frappe.db.get_value(
        "Employee",
        employee,
        [
            "employee_name",
            "default_shift",
            "holiday_list",
            "custom_shift"
        ],
        as_dict=True
    )

    if not employee_data:
        frappe.throw(
            "Employee not found",
            frappe.DoesNotExistError
        )

    default_shift = employee_data.default_shift
    holiday_list = employee_data.holiday_list
    shift = employee_data.custom_shift

    # =====================================================
    # 4. GET ATTENDANCE RECORDS
    # =====================================================

    attendance_records = frappe.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": [
                "between",
                [from_date, to_date]
            ]
        },
        fields=[
            "name",
            "attendance_date",
            "status",
            "in_time",
            "out_time",
            "working_hours"
        ],
        order_by="attendance_date asc"
    )

    # =====================================================
    # 5. CREATE ATTENDANCE MAP
    # =====================================================

    attendance_map = {
        getdate(record.attendance_date): record
        for record in attendance_records
    }

    # =====================================================
    # 6. GET HOLIDAY LIST RECORDS
    # =====================================================

    holiday_records = []

    if holiday_list:

        holiday_records = frappe.get_all(
            "Holiday",
            filters=[
                ["parent", "=", holiday_list],
                ["parenttype", "=", "Holiday List"],
                ["holiday_date", "between", [from_date, to_date]]
            ],
            fields=[
                "holiday_date",
                "description",
                "weekly_off"
            ],
            order_by="holiday_date asc"
        )

    # =====================================================
    # 7. CREATE HOLIDAY MAP
    # =====================================================

    holiday_map = {
        getdate(record.holiday_date): record
        for record in holiday_records
    }

    # =====================================================
    # 8. INITIALIZE SUMMARY
    # =====================================================

    total_present = 0
    total_absent = 0
    total_half_day = 0
    total_weekend = 0
    total_holiday = 0

    # =====================================================
    # 9. INITIALIZE RESULT
    # =====================================================

    result = {}

    total_days = (
        date_diff(
            to_date,
            from_date
        ) + 1
    )

    # =====================================================
    # 10. LOOP THROUGH EACH DATE
    # =====================================================

    for i in range(total_days):

        current_date = getdate(
            add_to_date(
                from_date,
                days=i
            )
        )

        attendance = attendance_map.get(
            current_date
        )

        holiday = holiday_map.get(
            current_date
        )

        # =================================================
        # 11. ATTENDANCE EXISTS
        # =================================================

        if attendance:

            status = (
                attendance.status.lower()
                if attendance.status
                else "absent"
            )

            # ---------------------------------------------
            # COUNT PRESENT
            # ---------------------------------------------

            if status == "present":
                total_present += 1

            # ---------------------------------------------
            # COUNT ABSENT
            # ---------------------------------------------

            elif status == "absent":
                total_absent += 1

            # ---------------------------------------------
            # COUNT HALF DAY
            # ---------------------------------------------

            elif status == "half day":
                total_half_day += 1

            # ---------------------------------------------
            # ADD ATTENDANCE DATA
            # ---------------------------------------------

            result[str(current_date)] = {
                "time": (
                    attendance.in_time.strftime("%H:%M")
                    if attendance.in_time
                    else "00:00"
                ),

                "in_time": (
                    attendance.in_time.strftime("%H:%M")
                    if attendance.in_time
                    else None
                ),

                "out_time": (
                    attendance.out_time.strftime("%H:%M")
                    if attendance.out_time
                    else None
                ),

                "working_hours": (
                    attendance.working_hours
                    if attendance.working_hours is not None
                    else 0
                ),

                "status": status
            }

            continue

        # =================================================
        # 12. NO ATTENDANCE → CHECK HOLIDAY
        # =================================================

        if holiday:

            # ---------------------------------------------
            # WEEKLY OFF
            # ---------------------------------------------

            if holiday.weekly_off:

                total_weekend += 1

                result[str(current_date)] = {
                    "time": "00:00",
                    "in_time": None,
                    "out_time": None,
                    "working_hours": 0,
                    "status": "weekend"
                }

            # ---------------------------------------------
            # NORMAL HOLIDAY
            # ---------------------------------------------

            else:

                total_holiday += 1

                result[str(current_date)] = {
                    "time": "00:00",
                    "in_time": None,
                    "out_time": None,
                    "working_hours": 0,
                    "status": holiday.description
                    if holiday.description
                    else "holiday"
                }

            continue

        # =================================================
        # 13. NO ATTENDANCE + NO HOLIDAY → ABSENT
        # =================================================

        total_absent += 1

        result[str(current_date)] = {
            "time": "00:00",
            "in_time": None,
            "out_time": None,
            "working_hours": 0,
            "status": "absent"
        }

    # =====================================================
    # 14. RETURN RESPONSE
    # =====================================================

    return {
        "success": True,

        "employee": employee,

        "employee_name": employee_data.employee_name,

        "default_shift": default_shift,

        "shift": shift,

        "holiday_list": holiday_list,

        "from_date": str(from_date),

        "to_date": str(to_date),

        "total_days": total_days,

        "summary": {
            "present": total_present,
            "absent": total_absent,
            "half_day": total_half_day,
            "weekend": total_weekend,
            "holiday": total_holiday
        },

        "data": result
    }



import frappe
from frappe.model.workflow import apply_workflow, get_transitions

@frappe.whitelist(allow_guest=False)
def leave():
    method = frappe.request.method

    # GET / DELETE
    if method in ("GET", "DELETE"):
        return CRUD.handle(
            doctype="Leave Application",
            permission=False
        )

    # POST = Create + Submit
    if method == "POST":

        data = frappe.form_dict.copy()

        for field in [
            "cmd",
            "name",
            "action",
            "docstatus",
            "workflow_state",
            "status"
        ]:
            data.pop(field, None)

        doc = frappe.new_doc("Leave Application")

        for fieldname, value in data.items():
            if doc.meta.has_field(fieldname):
                doc.set(fieldname, value)

        doc.employee = get_logged_in_employee()

        doc.insert()

        doc = apply_workflow(doc, "Submit")

        return {
            "success": True,
            "message": "Leave Application submitted successfully",
            "data": doc.as_dict()
        }

    # PUT / PATCH
    if method in ("PUT", "PATCH"):

        name = frappe.form_dict.get("name")
        action = frappe.form_dict.get("action")

        if not name:
            frappe.throw("Leave Application name is required")

        # --------------------------------
        # Workflow action
        # --------------------------------
        if action:

            doc = frappe.get_doc("Leave Application", name)

            doc = apply_workflow(doc, action)

            return {
                "success": True,
                "message": f"Leave Application {action} successfully",
                "data": doc.as_dict()
            }

        # --------------------------------
        # Normal update
        # --------------------------------
        return CRUD.handle(
            doctype="Leave Application",
            permission=True
        )

    frappe.throw(f"Method {method} not supported")

from frappe.utils.password import update_password

@frappe.whitelist(allow_guest=False)
def update_user_password(pwd):
    if not pwd:
        frappe.throw("Password is required")
    update_password(frappe.session.user, pwd)

    return {
        "success": True,
        "message": "Password updated successfully"
    }