import json
import frappe
from frappe.utils import (
    now_datetime,
    getdate,
    get_datetime,
    add_to_date,
    date_diff
)
from frappe.utils import getdate, today
from frappe import _
from teceze.api.employee_attendance import (employee_checkin as desktop_employee_checkin,)
from teceze.api.attendance_regularization import get_existing_checkins
from datetime import timedelta
from frappe.utils import getdate, cint
from frappe.utils import add_days, getdate

import time
from functools import wraps
from datetime import timedelta
from frappe.utils import get_datetime, now_datetime
from frappe.utils import time_diff_in_seconds    
from datetime import timedelta
 
from frappe import _
from frappe.utils import (
    add_to_date,
    flt,
    get_datetime,
    getdate,
    now_datetime,
    to_timedelta,
)
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils import getdate, add_to_date, date_diff
from frappe.model.workflow import apply_workflow, get_transitions
from frappe.utils.password import update_password

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
        if (doctype == "Attendance Request" and clean_data.get("reason") == "Regularization" and clean_data.get("from_date")):
             clean_data["to_date"] = clean_data["from_date"]
        else:
            clean_data["custom_request_type"] = None
        
        
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




def calculate_time_function_taken():
    def wrapper(func):
        @wraps(func)
        def inner(*args, **kwargs):
            start_time = time.perf_counter()

            try:
                return func(*args, **kwargs)

            finally:
                time_taken = time.perf_counter() - start_time

                frappe.log_error(time_taken )

        return inner

    return wrapper

@frappe.whitelist(allow_guest=False)
@calculate_time_function_taken()
def employee_checkin():
    frappe.log_error("employee_checkin called",now_datetime)

    payload = CRUD.get_json_payload()
    data = payload.get("data", payload)

    employee = data.get("employee")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    log_type = data.get("log_type")
    source = data.get("source")

    if not employee:
        frappe.throw(_("Employee ID is required."))

    if latitude is None or longitude is None:
        frappe.throw(_("Latitude and Longitude are required."))

    logged_in_employee = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user},
        "name",
    )

    if not logged_in_employee:
        frappe.throw(
            _("Employee not found for the logged-in user.")
        )

    if employee != logged_in_employee:
        frappe.throw(
            _("You are not allowed to check in for another employee."),
            frappe.PermissionError,
        )
    frappe.log_error("funciton end",now_datetime)

    return desktop_employee_checkin(
        employee=employee,
        log_type=log_type,
        latitude=latitude,
        longitude=longitude,
        source="Mobile"
    )



@frappe.whitelist(allow_guest=False)
def app_policy():
    return CRUD.handle(
        doctype="Terms and Conditions",
         permission=True
    )

@frappe.whitelist(allow_guest=False)
def checkin_list():
    return CRUD.handle(
        doctype="Employee Checkin",
    )

@frappe.whitelist(allow_guest=False)
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

@frappe.whitelist()
def timesheet():
    method = frappe.request.method
    
    if method in ("PUT", "PATCH"):
        name = frappe.form_dict.get("name")
        action = frappe.form_dict.get("action")

        if not name:
            frappe.throw("Timesheet name is required")

        if action == "Submit":
            doc = frappe.get_doc("Timesheet", name)
            doc.check_permission("submit")
            doc.submit()

            return {
                "success": True,
                "message": "Timesheet submitted successfully",
                "data": doc.as_dict()
            }
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
                if child.get("hours") is not None:
                    child["hours"] = round(child["hours"], 2)
                child_map.setdefault(child.parent, []).append(child)

            for record in records:
                record["time_logs"] = child_map.get(
                    record.get("name"),
                    []
                )
    return response




import frappe
from frappe.utils import get_datetime, now_datetime


@frappe.whitelist(allow_guest=False)
def employee():

    emp = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user},
        ["name", "custom_first_login_time", "custom_is_time_over"],
        as_dict=True
    )

    if emp and emp.custom_first_login_time and not emp.custom_is_time_over:

        first_login = get_datetime(emp.custom_first_login_time)
        current_time = now_datetime()

        expiry_time = first_login.add(hours=48) if hasattr(first_login, "add") else first_login + __import__("datetime").timedelta(hours=48)

        frappe.log_error(
            title="Employee Time Check",
            message=f"""
            Employee: {emp.name}
            First Login: {first_login}
            Current Time: {current_time}
            Expiry Time: {expiry_time}
            Is Expired: {current_time >= expiry_time}
            """
        )

        if current_time >= expiry_time:

            frappe.db.set_value(
                "Employee",
                emp.name,
                "custom_is_time_over",
                1,
                update_modified=False
            )

            frappe.db.commit()

    return CRUD.handle(
        doctype="Employee",
    )



@frappe.whitelist(allow_guest=False, methods=["PUT"])
def update_first_time():

    data = frappe.request.get_json(silent=True) or frappe.local.form_dict

    employee = data.get("name")

    if not employee or not frappe.db.exists("Employee", employee):
        frappe.throw("Valid Employee ID is required.")

    allowed_fields = {
        "name", "custom_first_login_time", "custom_is_agree",
        "cmd", "doctype"
    }

    invalid_fields = set(data) - allowed_fields
    if invalid_fields:
        frappe.throw("Invalid fields: " + ", ".join(invalid_fields))

    updates = {}

    # Set First Login Time only if currently empty
    if data.get("custom_first_login_time"):
        if not frappe.db.get_value("Employee", employee, "custom_first_login_time"):
            updates["custom_first_login_time"] = data["custom_first_login_time"]

    # Update Is Agree independently
    if "custom_is_agree" in data:
        updates["custom_is_agree"] = data["custom_is_agree"]

    if updates:
        frappe.db.set_value("Employee", employee, updates)

    return {
        "success": True,
        "message": "Employee updated successfully.",
        "employee": employee,
        "updated_fields": updates
    }


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
        fields=["name", "log_type", "time","custom_desk","custom_mobile"],
        order_by=f"time {order}",
        limit_page_length=1
    )

    return records[0] if records else None


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
def get_employee_checkin_summary(days=None, from_date=None, to_date=None):

    employee = get_logged_in_employee()

    from_date, to_date = get_date_range(days, from_date, to_date)

    total_days = date_diff(to_date, from_date) + 1
 
    result = []
 
    for i in range(total_days):

        current_date = add_to_date(from_date, days=i)

        shift_data = get_shift_window(employee, current_date)

        shift_type = shift_data["shift_type"] if shift_data else None
 
        # Every check-in event for the CALENDAR DAY, oldest first — scoped

        # to the full day, not the shift's scheduled hours, so a check-in

        # before the shift starts or a checkout after it ends (staying

        # late) is never silently dropped. Queried unconditionally, even

        # with no shift scheduled, since an employee can still check in

        # on an off day.

        events = frappe.get_all(

            "Employee Checkin",

            filters={

                "employee": employee,

                "time": ["between", [f"{current_date} 00:00:00", f"{current_date} 23:59:59"]]

            },

            fields=["log_type", "time"],

            order_by="time asc"

        )
 
        first_in = None

        last_out = None

        session_start = None

        total_seconds = 0
 
        for ev in events:

            if ev.log_type == "IN":

                if first_in is None:

                    first_in = ev.time

                if session_start is None:

                    session_start = ev.time

                # A duplicate IN while already open (double tap / bad

                # data) doesn't restart the session — the original start

                # stands, so total_seconds isn't skewed.

            elif ev.log_type == "OUT":

                if session_start is not None:

                    total_seconds += time_diff_in_seconds(ev.time, session_start)

                    session_start = None

                    last_out = ev.time

                # An OUT with nothing open (double checkout / bad data)

                # is ignored instead of producing a bogus duration.
 
        if session_start is not None:

            status = "CHECKED_IN"

            last_out = None

        elif first_in is not None:

            status = "CHECKED_OUT"

        else:

            status = "NOT_CHECKED_IN"
 
        total_seconds = int(total_seconds)

        hours, remainder = divmod(total_seconds, 3600)

        minutes, seconds = divmod(remainder, 60)
 
        result.append({

            "date": str(current_date),

            "shift_type": shift_type,

            "status": status,

            "first_in": str(first_in) if first_in else None,

            "last_out": str(last_out) if last_out else None,

            "current_session_first_in": str(session_start) if session_start else None,

            "worked_hours": f"{hours:02d}:{minutes:02d}:{seconds:02d}" if total_seconds else None,

            "total_seconds": total_seconds

        })
 
    return {

        "employee": employee,

        "from_date": str(from_date),

        "to_date": str(to_date),

        "total_days": total_days,

        "data": result

    }
"""
Mobile check-in API - Frappe HRMS
Put in: teceze/api/mobile_app/crud.py  (the app calls teceze.api.mobile_app.crud.*)
 
  GET  get_my_checkin_status()                        read-only, safe to poll
  POST mark_checkin(log_type, latitude, longitude)    write, locked per employee
  auto_checkout_open_sessions()                       scheduler job (hourly)
 
HOW THE STATUS IS DECIDED (one rule set, used by every function)
  1. Take the employee's LATEST check-in event (by punch time, then creation).
  2. No event                                 -> NOT_CHECKED_IN, timer 0.
  3. Shift of that event's date:
        Shift Assignment -> Employee default -> Company default
        -> no shift at all: the full calendar day (never an error).
     Window = shift start - "begin check-in before shift start"
           .. shift end   + "allow check-out after shift end"
     (overnight shift: the end is the next day).
  4. Latest is IN and older than 24 h (AUTO_CHECKOUT_AFTER)
                                              -> NOT_CHECKED_IN, timer 0,
                                                 stale_session_detected = true.
     The session is closed with an automatic OUT (hourly job, or at the
     employee's next check-in, whichever comes first).
  5. Latest is IN, under 24 h, but its shift is already over
                                              -> still CHECKED_IN (timer runs),
                                                 stale_session_detected = true
                                                 (the app warns "not checked out").
  6. Latest is OUT and its shift is over      -> NOT_CHECKED_IN, timer 0 (new shift).
  7. Otherwise pair the shift's events IN -> OUT:
        two INs in a row                      -> the latest IN wins
        OUT without an IN                     -> ignored
        a pair longer than 24 h               -> ignored
     Open IN left -> CHECKED_IN; else a session this shift -> CHECKED_OUT;
     else -> NOT_CHECKED_IN.
  8. is_resume = this shift already has closed sessions
        true  -> the app continues the timer from total_worked_seconds
        false -> the app starts from 0 (current_session_seconds)
 
Setup (once):
  - hooks.py:
        scheduler_events = {
            "hourly": ["teceze.api.mobile_app.crud.auto_checkout_open_sessions"],
        }
  - Index, for speed (bench console or a patch):
        frappe.db.add_index("Employee Checkin", ["employee", "time"])
"""
 

 
# ---------------------------------------------------------
# Settings
# ---------------------------------------------------------
# An IN left open longer than this is checked out automatically.
AUTO_CHECKOUT_AFTER = 24 * 3600
 
# Time written on the automatic OUT:
#   "after_24h" : exactly 24 h after the IN (the session counts 24 h of work)
#   "shift_end" : the end of that IN's shift (+ allowed grace), never later
#                 than 24 h - safer for payroll
AUTO_CHECKOUT_AT = "after_24h"
 
# True : the timer continues across a shift's sessions (is_resume can be true)
# False: every session starts from 0 (is_resume is always false)
COUNT_PREVIOUS_SESSIONS = True
 
# device_id on automatic check-outs, so HR / payroll can tell them apart.
AUTO_CHECKOUT_DEVICE = "auto-checkout"
 
# How far back the hourly job looks for open sessions.
AUTO_CHECKOUT_LOOKBACK_DAYS = 7
 
 
# ---------------------------------------------------------
# Data access
# ---------------------------------------------------------
def _employee():
    emp = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user, "status": "Active"},
        ["name", "company", "default_shift"],
        as_dict=True,
    )
    if not emp:
        frappe.throw(_("No active Employee linked to this user"), frappe.PermissionError)
    return emp
 
 
def _employee_by_name(name):
    return frappe.db.get_value(
        "Employee", name, ["name", "company", "default_shift"], as_dict=True
    )
 
 
def _latest(employee, upto):
    rows = frappe.get_all(
        "Employee Checkin",
        filters={"employee": employee, "time": ["<=", upto]},
        fields=["name", "log_type", "time","custom_desk","custom_mobile"],
        order_by="time desc, creation desc",  # by punch TIME, never by creation
        limit_page_length=1,
        ignore_permissions=True,
    )
    return rows[0] if rows else None
 
 
def _rows(employee, start, end):
    return frappe.get_all(
        "Employee Checkin",
        filters={"employee": employee, "time": ["between", [start, end]]},
        fields=["log_type", "time"],
        order_by="time asc, creation asc",
        limit_page_length=0,
        ignore_permissions=True,
    )
 
 
def _insert(emp, log_type, time, latitude=None, longitude=None, device_id=None,source_checkin=None):
    doc = frappe.new_doc("Employee Checkin")
    doc.employee = emp.name
    doc.log_type = log_type
    doc.time = time
    meta = frappe.get_meta("Employee Checkin")
    if device_id:
        doc.device_id = device_id
    # The app sends the phone's location with every punch.
    if latitude not in (None, "") and meta.has_field("latitude"):
        doc.latitude = flt(latitude)
    if longitude not in (None, "") and meta.has_field("longitude"):
        doc.longitude = flt(longitude)
    if source_checkin:
        doc.custom_desk = source_checkin.custom_desk
        doc.custom_mobile = source_checkin.custom_mobile
    else:
        # Normal mobile check-in / checkout
        doc.custom_desk = 0
        doc.custom_mobile = 1
    doc.insert(ignore_permissions=True)
    return doc
 
 
def _lock(emp):
    """Lock the employee row until the transaction ends (no double punch)."""
    frappe.db.get_value("Employee", emp.name, "name", for_update=True)
 
 
# ---------------------------------------------------------
# Shift
# ---------------------------------------------------------
def _shift_name(emp, on_date):
    rows = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": emp.name,
            "docstatus": 1,
            "status": "Active",
            "start_date": ["<=", on_date],
        },
        or_filters=[["end_date", "is", "not set"], ["end_date", ">=", on_date]],
        fields=["shift_type"],
        order_by="start_date desc, creation desc",
        limit_page_length=1,
        ignore_permissions=True,
    )
    if rows:
        return rows[0].shift_type, "Shift Assignment"
    if emp.default_shift:
        return emp.default_shift, "Employee Default"
    if frappe.get_meta("Company").has_field("default_shift"):
        name = frappe.get_cached_value("Company", emp.company, "default_shift")
        if name:
            return name, "Company Default"
    return None, None
 
 
def _window(emp, on_date):
    """Shift start/end plus the check-in/out allowances. Falls back to the full day."""
    midnight = get_datetime(on_date)
    name, source = _shift_name(emp, on_date)
 
    if not name:
        end = midnight + timedelta(days=1) - timedelta(seconds=1)
        return {
            "shift": None, "source": None, "date": getdate(on_date),
            "start": midnight, "end": end, "from_time": midnight, "to_time": end,
        }
 
    st = frappe.get_cached_value(
        "Shift Type",
        name,
        [
            "start_time",
            "end_time",
            "begin_check_in_before_shift_start_time",
            "allow_check_out_after_shift_end_time",
        ],
        as_dict=True,
    )
    start = midnight + to_timedelta(st.start_time)
    end = midnight + to_timedelta(st.end_time)
    if end <= start:  # overnight shift
        end += timedelta(days=1)
 
    return {
        "shift": name, "source": source, "date": getdate(on_date),
        "start": start, "end": end,
        "from_time": add_to_date(start, minutes=-int(st.begin_check_in_before_shift_start_time or 0)),
        "to_time": add_to_date(end, minutes=int(st.allow_check_out_after_shift_end_time or 0)),
    }
 
 
# ---------------------------------------------------------
# Automatic check-out (after 24 h)
# ---------------------------------------------------------
def _overdue(latest, now):
    """True when the latest punch is an IN left open longer than 24 h."""
    return bool(
        latest
        and latest.log_type == "IN"
        and (now - get_datetime(latest.time)).total_seconds() > AUTO_CHECKOUT_AFTER
    )
 
 
def _auto_checkout_time(emp, in_time):
    after_24h = in_time + timedelta(seconds=AUTO_CHECKOUT_AFTER)
    if AUTO_CHECKOUT_AT == "shift_end":
        shift_end = _window(emp, getdate(in_time))["to_time"]
        return min(max(shift_end, in_time), after_24h)
    return after_24h
 
 
def _close_overdue(emp, now):
    """Write the automatic OUT for an IN open longer than 24 h. Returns its name."""
    latest = _latest(emp.name, now)
    if not _overdue(latest, now):
        return None
    in_time = get_datetime(latest.time)
    return _insert(
        emp, "OUT", _auto_checkout_time(emp, in_time), device_id=AUTO_CHECKOUT_DEVICE,source_checkin=latest
    ).name
 
 
def auto_checkout_open_sessions():
    """Hourly scheduler job: check out every IN left open longer than 24 h."""
    now = now_datetime()
    cutoff = now - timedelta(seconds=AUTO_CHECKOUT_AFTER)
    since = cutoff - timedelta(days=AUTO_CHECKOUT_LOOKBACK_DAYS)
    employees = set(
        frappe.get_all(
            "Employee Checkin",
            filters=[["log_type", "=", "IN"], ["time", "between", [since, cutoff]]],
            pluck="employee",
            ignore_permissions=True,
        )
    )
    for name in employees:
        try:
            emp = _employee_by_name(name)
            if not emp:
                continue
            _lock(emp)
            if _close_overdue(emp, now):
                frappe.db.commit()
        except Exception:
            frappe.db.rollback()
            frappe.log_error(title=f"Auto checkout failed for {name}")
 
 
# ---------------------------------------------------------
# Timer maths
# ---------------------------------------------------------
def _pair(rows, now):
    closed, open_start, first_in, last_out = 0, None, None, None
 
    for r in rows:
        t = get_datetime(r.time)
        if r.log_type == "IN":
            open_start = t  # two INs in a row: the latest IN wins
            first_in = first_in or t
        elif open_start is not None:  # OUT that closes an open IN
            secs = int((t - open_start).total_seconds())
            if 0 <= secs <= AUTO_CHECKOUT_AFTER:
                closed += secs
                last_out = t
            open_start = None
        # OUT without an IN: ignored
 
    running = int((now - open_start).total_seconds()) if open_start else 0
    return closed, max(running, 0), open_start, first_in, last_out
 
 
# ---------------------------------------------------------
# Status (also reusable for any employee, e.g. team_members)
# ---------------------------------------------------------
def build_status(emp, now=None):
    now = now or now_datetime()
    latest = _latest(emp.name, now)
 
    # 2. Never checked in
    if not latest:
        return _response(emp, "NOT_CHECKED_IN", now, _window(emp, getdate(now)))
 
    latest_time = get_datetime(latest.time)
 
    # 4. IN open longer than 24 h -> treated as checked out (auto OUT follows)
    if _overdue(latest, now):
        return _response(
            emp, "NOT_CHECKED_IN", now, _window(emp, getdate(now)),
            stale=True, stale_since=latest_time,
        )
 
    window = _window(emp, getdate(latest_time))
 
    # 6. Checked out and that shift is over -> new shift, empty timer
    if latest.log_type == "OUT" and now > window["to_time"]:
        return _response(emp, "NOT_CHECKED_IN", now, _window(emp, getdate(now)))
 
    # 7. Pair this shift's events
    from_time = window["from_time"]
    if latest.log_type == "IN":
        from_time = min(from_time, latest_time)  # session may start before the window
 
    closed, running, open_start, first_in, last_out = _pair(
        _rows(emp.name, from_time, now), now
    )
    if open_start:
        status = "CHECKED_IN"
    elif first_in:
        status = "CHECKED_OUT"  # worked this shift, checked out
    else:
        status = "NOT_CHECKED_IN"  # e.g. only an automatic OUT in this shift
 
    # 5. Still open after its shift ended -> warn (timer keeps running)
    stale = bool(open_start and now > window["to_time"])
 
    return _response(
        emp, status, now, window,
        closed=closed, running=running, running_since=open_start,
        first_in=first_in, last_out=last_out,
        stale=stale, stale_since=open_start if stale else None,
    )
 
 
def _response(emp, status, now, window, closed=0, running=0, running_since=None,
              first_in=None, last_out=None, stale=False, stale_since=None):
    previous = closed if COUNT_PREVIOUS_SESSIONS else 0
    total = previous + running
    # 8. Continue the timer only when this shift already has closed sessions.
    is_resume = bool(COUNT_PREVIOUS_SESSIONS and closed > 0)
 
    def s(v):
        return str(v) if v else None
 
    return {
        "success": True,
        "data": {
            "status": status,
            "is_checked_in": status == "CHECKED_IN",
            "employee": emp.name,
            "shift": window["shift"],
            "shift_source": window["source"],
            "shift_date": str(window["date"]),
            "shift_start": str(window["start"]),
            "shift_end": str(window["end"]),
            "first_checkin": s(first_in),
            "last_checkin": s(running_since),
            "running_since": s(running_since),
            "last_checkout": s(last_out),  # sent whenever there is one
            "closed_seconds": previous,
            "current_session_seconds": running,
            "total_worked_seconds": total,
            "stale_session_detected": stale,
            "stale_since": s(stale_since),  # the IN that wasn't checked out
            "server_time": str(now),
            "is_resume": is_resume,
        },
    }
 
 
@frappe.whitelist(allow_guest=False)
def get_my_checkin_status():
    return build_status(_employee())
 
 
# Punch

@frappe.whitelist(allow_guest=False, methods=["POST"])
def mark_checkin(log_type, latitude=None, longitude=None):
    if log_type not in ("IN", "OUT"):
        frappe.throw(_("log_type must be IN or OUT"))
 
    emp = _employee()
 
    # A second tap waits here, then sees the first punch and is rejected.
    _lock(emp)
 
    now = now_datetime()
    auto_checkout = None
 
    if log_type == "IN":
        # A session left open over 24 h is closed first (if the hourly job
        # hasn't done it yet), then the new IN starts a fresh session.
        auto_checkout = _close_overdue(emp, now)
        if build_status(emp, now)["data"]["is_checked_in"]:
            frappe.throw(_("You are already checked in."))
    else:
        if not build_status(emp, now)["data"]["is_checked_in"]:
            frappe.throw(_("You are not checked in."))
 
    doc = _insert(emp, log_type, now, latitude, longitude)
 
    return {
        "success": True,
        "message": _("Check In Successful") if log_type == "IN" else _("Check Out Successful"),
        "data": {
            "name": doc.name,
            "log_type": log_type,
            "time": str(now),
            "auto_checkout_name": auto_checkout,
        },
        # The new state, by the same rules (the app re-reads it anyway).
        "status": build_status(emp)["data"],
    }
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
            "reports_to": None,
            "checkin_status": None,
            "pagination": {
                "page": 1,
                "page_size": CRUD.DEFAULT_PAGE_SIZE,
                "total_records": 0,
                "total_pages": 0,
                "has_next_page": False,
                "has_previous_page": False
            }
        }

    report_to_name = frappe.db.get_value(
        "Employee",
        reports_to,
        "employee_name"
    )
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
        "reports_to": report_to_name,
        "checkin_status": get_current_checkin_status(
            reports_to,
            today
        ),
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_records": total_records,
            "total_pages": total_pages,
            "has_next_page": page < total_pages,
            "has_previous_page": page > 1
        }
    }



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
def issues():
    return CRUD.handle(
        doctype="Issue",
    )



@frappe.whitelist(allow_guest=False, methods=["GET", "POST", "PUT"])
def employee_permission():

    method = frappe.request.method

    # GET / POST - Existing CRUD handling
    if method in ["GET", "POST"]:
        return CRUD.handle(
            doctype="Employee Permission Request",
        )

    # PUT - Update / Workflow
    data = frappe.request.get_json(silent=True) or frappe.local.form_dict

    name = data.get("name")
    action = data.get("action")
    fields = data.get("fields") or {}

    if not name:
        frappe.throw("Document name is required")

    doc = frappe.get_doc("Employee Permission Request", name)
    doc.check_permission("write")

    # Prevent direct workflow manipulation
    restricted_fields = ["workflow_state", "docstatus", "status"]

    for field in restricted_fields:
        if field in fields:
            frappe.throw(f"Cannot update {field} directly")

    # Update normal fields
    if fields:
        doc.update(fields)

    # Workflow action
    if action:

        transitions = get_transitions(doc)

        allowed_actions = [
            row.get("action") for row in transitions
        ]

        if action not in allowed_actions:
            frappe.throw(
                f"Invalid workflow action: {action}. "
                f"Available actions: {', '.join(allowed_actions) or 'None'}"
            )

        doc = apply_workflow(doc, action)

    else:
        doc.save()

    return {
        "success": True,
        "name": doc.name,
        "workflow_state": doc.workflow_state,
        "docstatus": doc.docstatus,
        "message": f"Employee Permission Request {action or 'updated'} successfully"
    }

@frappe.whitelist(allow_guest=False)
def leave_balance():

    # Get logged-in employee
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": frappe.session.user},
        "name"
    )

    if not employee:
        return {
            "success": False,
            "message": "Employee not found"
        }

    leave_balance = {}

    # Get only submitted employee allocations
    allocations = frappe.get_list(
        "Leave Allocation",
        filters={
            "employee": employee,
            "docstatus": 1
        },
        fields=[
            "leave_type",
            "total_leaves_allocated"
        ]
    )

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

    # Get only submitted and approved leave applications
    applications = frappe.get_list(
        "Leave Application",
        filters={
            "employee": employee,
            "status": "Approved",
            "docstatus": 1
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

    # Calculate balance
    for item in leave_balance.values():

        item["balance"] = (
            item["total"] - item["used"]
        )

    return {
        "success": True,
        "data": list(leave_balance.values())
    }




@frappe.whitelist(allow_guest=False)
def leave():
    method = frappe.request.method

    # GET / DELETE
    if method in ("GET", "DELETE"):
        return CRUD.handle(
            doctype="Leave Application",
            permission=False
        )
    
    """Need remove next build in app"""

    data = frappe.form_dict.copy()
    if method == "POST" and data.get("name") and data.get("action") in ("Approve", "Reject"):        
        frappe.log_error(
            title="Leave Workflow Debug",
            message={
                "document": data.get("name"),
                "requested_action": data.get("action"),
                "current_user": frappe.session.user,
                "roles": frappe.get_roles()
            }
        )
        method = "PUT"
    frappe.log_error("Leave API Method", method)

    """Need remove next build in app"""

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

        # doc = apply_workflow(doc, "Submit")

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
            from frappe.model.workflow import get_transitions
            doc = frappe.get_doc("Leave Application", name)
            

            transitions = get_transitions(doc)

            frappe.log_error(
                title="Leave Workflow Debug",
                message={
                    "document": doc.name,
                    "workflow_state": doc.workflow_state,
                    "docstatus": doc.docstatus,
                    "current_user": frappe.session.user,
                    "roles": frappe.get_roles(),
                    "requested_action": action,
                    "available_actions": [
                        row.action for row in transitions
                    ]
                }
            )
           
            doc = apply_workflow(doc, action)

            # doc = frappe.get_doc("Leave Application", name)

            # doc = apply_workflow(doc, action)

            return {
                "success": True,
                "message": f"Leave Application {action} successfully",
                "data": doc.as_dict()
            }

        return CRUD.handle(
            doctype="Leave Application",
            permission=True
        )

    frappe.throw(f"Method {method} not supported")


@frappe.whitelist(allow_guest=False)
def update_user_password(pwd):
    if not pwd:
        frappe.throw("Password is required")
    update_password(frappe.session.user, pwd)

    return {
        "success": True,
        "message": "Password updated successfully"
    }
@frappe.whitelist(allow_guest=False)
def Leave_cancellation(name, comment):

    # 1. Authentication
    CRUD.check_authentication()

    # 2. Name validation
    if not name or not name.strip():
        frappe.throw("Leave Application name is required")

    # 3. Comment validation
    if not comment or not comment.strip():
        frappe.throw("Comment is required")

    # 4. Logged-in employee
    employee = get_logged_in_employee()

    # 5. Get Leave Application
    leave_application = frappe.db.get_value(
        "Leave Application",
        name,
        ["employee", "leave_approver"],
        as_dict=True
    )

    # 6. Leave Application exists
    if not leave_application:
        frappe.throw("Leave Application not found")

    # 7. Ownership validation
    if leave_application.employee != employee:
        frappe.throw(
            "You are not allowed to access this Leave Application"
        )

    # 8. Approver validation
    approver = leave_application.leave_approver

    if not approver:
        frappe.throw("Leave Approver not found")

    # 9. Approver User validation
    approver_name = frappe.db.get_value(
        "User",
        approver,
        "full_name"
    )

    if not approver_name:
        frappe.throw("Leave Approver user not found")

    # 10. Get Employee Name
    employee_name = frappe.db.get_value(
        "Employee",
        employee,
        "employee_name"
    )

    if not employee_name:
        frappe.throw("Employee name not found")

    # 11. Get document
    doc = frappe.get_doc("Leave Application", name)

    # 12. Add cancellation comment
    message = (
        f"@{approver_name} "
        f"{employee_name} has requested you to cancel the Leave Application, "
        f"due to {comment.strip()}."
    )

    doc.add_comment("Comment", message)

    return {
        "success": True,
        "message": "Cancellation request sent successfully"
    }
@frappe.whitelist(allow_guest=False)
def attendance_request_fields():
    CRUD.check_authentication()
    get_logged_in_employee()
    meta = frappe.get_meta("Attendance Request")
    reason_field = meta.get_field("reason")
    if not reason_field:
        frappe.throw("Reason field not found")
    exclude_fields = {
        "employee",
        "company",
        "from_date"
    }
    data = {}
    reasons = [
        reason.strip()
        for reason in reason_field.options.splitlines()
        if reason.strip()
    ]

    for reason in reasons:
        doc = frappe._dict({
            "reason": reason
        })

        fields = {}
        for field in meta.fields:

            if (
                field.hidden
                or field.fieldname in exclude_fields
                or field.fieldname == "reason"
                or field.fieldtype in (
                    "Section Break",
                    "Column Break",
                    "Tab Break",
                    "HTML"
                )
            ):
                continue
            # Use depends_on OR mandatory_depends_on
            condition = field.depends_on or field.mandatory_depends_on
            if not condition:
                continue
            condition = condition.removeprefix("eval:")
            try:
                if frappe.safe_eval(condition, {"doc": doc}):

                    fields[field.fieldname] = {
                        "fieldname": field.fieldname,
                        "fieldtype": field.fieldtype
                    }
            except Exception:
                continue
        if fields:
            data[frappe.scrub(reason)] = fields
    return {
        "success": True,
        "message": "Attendance Request fields fetched successfully",
        "data": data
    }
@frappe.whitelist(allow_guest=False)
def regularization_date(employee, from_date):

    CRUD.check_authentication()

    checkin_data = get_existing_checkins(employee, from_date)

    return {
        "success":True,
        "data":{
        "check_in": checkin_data.get("check_in", ""),
        "check_out": checkin_data.get("check_out", "")
        }
    }


@frappe.whitelist(allow_guest=False)
def attendance_request():

    method = frappe.request.method

    # GET / DELETE
    if method in ("GET", "DELETE"):
        return CRUD.handle(
            doctype="Attendance Request"
        )
    

    # POST = Create + Submit
    if method == "POST":

        data = frappe.form_dict.copy()
        data.pop("cmd", None)

        from_date = data.get("from_date")
        to_date = data.get("to_date")

        # Future date is not allowed
        if from_date and getdate(from_date) > getdate(today()):
            frappe.throw(
                "Attendance Request cannot be created for a future date."
            )

        if to_date and getdate(to_date) > getdate(today()):
            frappe.throw(
                "Attendance Request cannot be created for a future date."
            )

        try:
            doc = frappe.new_doc("Attendance Request")

            for fieldname, value in data.items():
                if doc.meta.has_field(fieldname):
                    doc.set(fieldname, value)

            #Regularization
            if ( data.get("reason") == "Regularization" and data.get("from_date") ): 
                doc.to_date = data.get("from_date") 
                doc.half_day = 0 
                doc.half_day_date = None

            # On Duty -> attachment mandatory + valid file URL
            attachment = data.get("custom_attachment")

            if data.get("reason") == "On Duty":
                if not attachment:
                    frappe.throw("Attachment is mandatory for On Duty.")

                if not frappe.db.exists("File", {"file_url": attachment}):
                    frappe.throw("Invalid attachment. Please upload the file first.")
            
            # Always use logged-in employee
            doc.employee = get_logged_in_employee()

            # Draft
            doc.insert()
            

            # # Draft → Pending Approval
            # doc = apply_workflow(
            #     doc,
            #     "Submit"
            # )

            return {
                "success": True,
                "message": "Attendance Request submitted successfully",
                "data": doc.as_dict()
            }

        except Exception as e:
            # Let the original Frappe error go to frontend
            if "Holiday" in str(e):
                frappe.local.response["http_status_code"] = 417

                return {
                    "success": False,
                    "message": "The selected date is a holiday. Please include holidays to continue.",
                    "status_code":417,
                    "data": None
                }

            frappe.throw(str(e))

    # PUT / PATCH
    if method in ("PUT", "PATCH"):

        name = frappe.form_dict.get("name")
        action = frappe.form_dict.get("action")

        if action:

            doc = frappe.get_doc(
                "Attendance Request",
                name
            )

            doc = apply_workflow(
                doc,
                action
            )

            return {
                "success": True,
                "message": f"Attendance Request {action} successfully",
                "data": doc.as_dict()
            }

        return CRUD.handle(
            doctype="Attendance Request",
            permission=True
        )

    frappe.throw(
        f"Method {method} not supported"
    )

@frappe.whitelist(allow_guest=False)
def attendance_request_cancellation(name, comment):

    # 1. Name validation
    if not name or not name.strip():
        frappe.throw("Attendance request name is required")

    # 2. Comment validation
    if not comment or not comment.strip():
        frappe.throw("Comment is required")

    # 3. Logged-in employee
    employee = get_logged_in_employee()

    # 4. Get Attendance Request
    attendance_request = frappe.db.get_value(
        "Attendance Request",
        name,
        ["employee"],
        as_dict=True
    )

    # 5. Attendance Request exists
    if not attendance_request:
        frappe.throw("Attendance Request not found")

    # 6. Ownership validation
    if attendance_request.employee != employee:
        frappe.throw(
            "You are not allowed to access this Attendance Request"
        )

    # 7. Get Reporting Manager from Employee
    reporting_manager = frappe.db.get_value(
        "Employee",
        employee,
        "reports_to"
    )

    if not reporting_manager:
        frappe.throw("Reporting Manager not found")

    # 8. Get Reporting Manager's User
    reporting_manager_user = frappe.db.get_value(
        "Employee",
        reporting_manager,
        "user_id"
    )

    if not reporting_manager_user:
        frappe.throw("Reporting Manager user not found")

    # 9. Get Reporting Manager's full name from User
    reporting_manager_name = frappe.db.get_value(
        "User",
        reporting_manager_user,
        "full_name"
    )

    if not reporting_manager_name:
        frappe.throw("Reporting Manager user not found")

    employee_name = frappe.db.get_value(
    "Employee",
    employee,
    "employee_name"
    )

    # 10. Get Attendance Request document
    doc = frappe.get_doc("Attendance Request", name)

    # 11. Add cancellation comment
    message = (
    f"@{reporting_manager_name} "
    f"{employee_name} has requested you to cancel the Attendance Request, "
    f"due to {comment.strip()}."
)
    doc.add_comment("Comment", message)


    return {
    "success": True,
    "message": "Cancellation request sent successfully"
}

@frappe.whitelist(allow_guest=False)
def policy_details():
    
    
    policy_fields = {
        "probation_policy_url": "custom_probation_policy_url",
        "resignation_policy_url": "custom_resignation_policy_url",
        "performance_improvement_plan_url": "custom_performance_improvement_plan",
        "internship_policy_url": "custom_internship_policy_url",
        "india_leave_policy_url": "custom_india_leave_policy_url",
        "dress_code_policy_url": "custom_dress_code_policy_url",
        "whistleblower_policy_url": "custom_whistleblower_policy_url",
    }
    settings = frappe.get_single("Teceze Settings").as_dict()

    data = {
        key: (settings.get(fieldname) or "").strip()
        for key, fieldname in policy_fields.items()
    }
    return {
        "success": True,
        "message": "Policy details fetched successfully",
        "data": data,
    }


@frappe.whitelist(allow_guest=False)
def agree_details():
    
    
    policy_fields = {
        "work_etiquete": "workplace_etiquette",
        "male_accomodation": "male_accomodation",
       
    }
    settings = frappe.get_single("Teceze Settings").as_dict()

    data = {
        key: (settings.get(fieldname) or "").strip()
        for key, fieldname in policy_fields.items()
    }
    return {
        "success": True,
        "message": "Policy details fetched successfully",
        "data": data,
    }

from frappe.utils import getdate, get_last_day

@frappe.whitelist(allow_guest=False)
def salary_slip():
    CRUD.check_authentication()

    # Payslip read-only: create / update / delete block
    if frappe.request.method != "GET":
        frappe.throw(_("Only GET is allowed"), frappe.PermissionError)

    employee = get_logged_in_employee()

    frappe.form_dict["employee"] = employee
    frappe.has_permission(
        "Salary Slip",
        "read",
        throw=True
    )

    return CRUD.handle("Salary Slip")

@frappe.whitelist(allow_guest=False)
def salary_slip_pdf(name=None):
    CRUD.check_authentication()

    employee = get_logged_in_employee()
    if not employee:
        frappe.throw(_("Employee record not found"), frappe.PermissionError)

    filters = {"employee": employee, "docstatus": ["in", [0, 1]]}

    if name:
        filters["name"] = name
    # elif start_date:
    #     first_day = getdate(start_date).replace(day=1)
    #     filters["start_date"] = ["between", [first_day, get_last_day(first_day)]]
        
    slips = frappe.get_list(
        "Salary Slip",
        filters=filters,
        fields=["name"],
        order_by="start_date desc",
        page_length=1,
    )
    if not slips:
        frappe.throw(_("Salary Slip not found"), frappe.DoesNotExistError)

    slip_name = slips[0].name
    frappe.has_permission("Salary Slip", "read", slip_name, throw=True)

    pdf = frappe.get_print(
        "Salary Slip",
        slip_name,
        print_format="Salary Slip",
        as_pdf=True,
    )

    frappe.local.response.filename = f"{slip_name.replace('/', '-')}.pdf"
    frappe.local.response.filecontent = pdf
    frappe.local.response.type = "pdf"



@frappe.whitelist(allow_guest=False)
def get_attendance_list(from_date=None, to_date=None):

    # =====================================================
    # 1. VALIDATE DATES
    # =====================================================

    if not from_date or not to_date:
        frappe.throw("from_date and to_date are required")

    from_date = getdate(from_date)
    to_date = getdate(to_date)

    if to_date < from_date:
        frappe.throw("to_date cannot be earlier than from_date")

    # =====================================================
    # 2. GET LOGGED-IN EMPLOYEE
    # =====================================================

    employee = get_logged_in_employee()

    employee_data = frappe.db.get_value(
        "Employee",
        employee,
        ["employee_name", "company"],
        as_dict=True
    )

    if not employee_data:
        frappe.throw("Employee not found")

    company = employee_data.company

    # =====================================================
    # 3. GET SHIFT ASSIGNMENTS
    # =====================================================

    shift_assignments = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": employee,
            "docstatus": 1,
            "status": "Active",
            "start_date": ["<=", to_date]
        },
        fields=[
            "name",
            "shift_type",
            "start_date",
            "end_date"
        ],
        order_by="start_date asc"
    )

    def get_shift_for_date(current_date):

        applicable = [
            row for row in shift_assignments
            if (
                getdate(row.start_date) <= current_date
                and (
                    not row.end_date
                    or getdate(row.end_date) >= current_date
                )
            )
        ]

        if not applicable:
            return None

        selected = max(
            applicable,
            key=lambda row: getdate(row.start_date)
        )

        return selected.shift_type

    # =====================================================
    # 4. GET HOLIDAY LIST ASSIGNMENTS
    # =====================================================

    assigned_to = [employee]

    if company:
        assigned_to.append(company)

    holiday_assignments = frappe.get_all(
        "Holiday List Assignment",
        filters={
            "assigned_to": ["in", assigned_to],
            "docstatus": 1
        },
        fields=[
            "name",
            "assigned_to",
            "holiday_list",
            "from_date"
        ],
        order_by="from_date asc"
    )

    employee_holiday_assignments = [
        row for row in holiday_assignments
        if row.assigned_to == employee
    ]

    company_holiday_assignments = [
        row for row in holiday_assignments
        if row.assigned_to == company
    ]

    # =====================================================
    # 5. GET HOLIDAY LIST APPLICABLE FOR EACH DATE
    # =====================================================

    def get_holiday_list_for_date(current_date):

        # First check employee-specific assignments
        employee_applicable = [
            row for row in employee_holiday_assignments
            if (
                row.from_date
                and row.holiday_list
                and getdate(row.from_date) <= current_date
            )
        ]

        if employee_applicable:
            selected = max(
                employee_applicable,
                key=lambda row: getdate(row.from_date)
            )

            return selected.holiday_list

        # Otherwise use company assignment
        company_applicable = [
            row for row in company_holiday_assignments
            if (
                row.from_date
                and row.holiday_list
                and getdate(row.from_date) <= current_date
            )
        ]

        if company_applicable:
            selected = max(
                company_applicable,
                key=lambda row: getdate(row.from_date)
            )

            return selected.holiday_list

        return None

    # =====================================================
    # 6. GET ATTENDANCE RECORDS
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

    attendance_map = {
        getdate(row.attendance_date): row
        for row in attendance_records
    }

    # =====================================================
    # 7. GET HOLIDAY RECORDS
    # =====================================================

    holiday_list_names = list(set(
        row.holiday_list
        for row in holiday_assignments
        if row.holiday_list
    ))

    holiday_map = {}

    if holiday_list_names:

        holiday_records = frappe.get_all(
            "Holiday",
            filters={
                "parent": ["in", holiday_list_names],
                "parenttype": "Holiday List",
                "holiday_date": [
                    "between",
                    [from_date, to_date]
                ]
            },
            fields=[
                "parent",
                "holiday_date",
                "description",
                "weekly_off"
            ],
            order_by="holiday_date asc"
        )

        holiday_map = {
            (
                row.parent,
                getdate(row.holiday_date)
            ): row
            for row in holiday_records
        }

    # =====================================================
    # 8. INITIALIZE SUMMARY
    # =====================================================

    total_present = 0
    total_absent = 0
    total_half_day = 0
    total_weekend = 0
    total_holiday = 0

    result = {}

    total_days = (to_date - from_date).days + 1

    # =====================================================
    # 9. PROCESS EACH DATE
    # =====================================================

    for i in range(total_days):

        current_date = from_date + timedelta(days=i)

        # Get attendance
        attendance = attendance_map.get(current_date)

        # Get applicable shift
        current_shift = get_shift_for_date(current_date)

        # Get applicable Holiday List
        current_holiday_list = get_holiday_list_for_date(
            current_date
        )

        # Get holiday ONLY from the selected Holiday List
        holiday = None

        if current_holiday_list:
            holiday = holiday_map.get(
                (current_holiday_list, current_date)
            )

        # =================================================
        # 10. ATTENDANCE EXISTS - HIGHEST PRIORITY
        # =================================================

        if attendance:

            status = (
                attendance.status.lower()
                if attendance.status
                else "absent"
            )

            if status == "present":
                total_present += 1

            elif status == "absent":
                total_absent += 1

            elif status == "half day":
                total_half_day += 1

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
        # 11. NO ATTENDANCE - CHECK HOLIDAY
        # =================================================

        if holiday:

            if cint(holiday.weekly_off) == 1:

                total_weekend += 1

                status = "weekend"

            else:

                total_holiday += 1

                status = (
                    holiday.description
                    if holiday.description
                    else "holiday"
                )

            result[str(current_date)] = {
                "time": "00:00",
                "in_time": None,
                "out_time": None,
                "working_hours": 0,
                "status": status
            }

            continue

        # =================================================
        # 12. NEITHER ATTENDANCE NOR HOLIDAY
        # =================================================

        result[str(current_date)] = {
            "time": "00:00",
            "in_time": None,
            "out_time": None,
            "working_hours": 0,
            "status": ""
        }

    # =====================================================
    # 13. GET CURRENT SHIFT AND HOLIDAY LIST
    # =====================================================

    shift = get_shift_for_date(to_date)

    holiday_list = get_holiday_list_for_date(to_date)

    # =====================================================
    # 14. RETURN RESPONSE
    # =====================================================

    return {
        "success": True,

        "employee": employee,

        "employee_name": employee_data.employee_name,

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


@frappe.whitelist(allow_guest=False)
def get_weather():
    current_logged_in_employee = get_logged_in_employee()
    worklocation=frappe.db.get_value("Employee", current_logged_in_employee, "custom_work_location")
    if not worklocation:
        return {
            "success": False,
            "message": "Work location not found for the employee"
        }       

    locaiton_details=frappe.db.get_value("Location", worklocation, ["latitude", "longitude"], as_dict=True)
    if not locaiton_details:
        return {
            "success": False,
            "message": "Latitude and Longitude not found for the work location"
        }   
    return {
        "success": True,
        "data": {
            "latitude": locaiton_details.latitude,
            "longitude": locaiton_details.longitude
        }
    }   