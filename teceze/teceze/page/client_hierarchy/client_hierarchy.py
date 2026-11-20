
import frappe
from frappe import _


# ============================================================
# CONFIGURATION
# ============================================================

CHILD_DOCTYPE = "Service Vertical Items"
CHILD_PARENTFIELD = "custom_service_vertical"

# Keeps SQL IN clauses manageable for large datasets.
BATCH_SIZE = 500

LEAD_FIELDS = [
    "name",
    "lead_name",
    "first_name",
    "last_name",
    "job_title",
    "custom_client_company",
    "custom_region_name",
    "custom_lead_qualification",
    "custom_lead_stage",
    "lead_owner",
    "mobile_no",
    "email_id"
]


# ============================================================
# COMMON HELPERS
# ============================================================

def _chunks(items, size=BATCH_SIZE):
    """Split a collection into manageable batches."""

    for start in range(0, len(items), size):
        yield items[start:start + size]


def _clean_filter(value, field_name):
    """Validate and normalize incoming filter values."""

    if value is None:
        return None

    if not isinstance(value, str):
        frappe.throw(
            _("Invalid value provided for {0}.").format(field_name)
        )

    value = value.strip()

    if len(value) > 140:
        frappe.throw(
            _("Filter value for {0} is too long.").format(field_name)
        )

    return value or None


def _get_service_rows(parent_names, service_vertical=None):
    """
    Fetch service vertical child records in batches.

    Only call this with parent names already obtained
    from permission-checked Lead records.
    """

    service_map = {}

    if not parent_names:
        return service_map

    for batch in _chunks(parent_names):

        filters = {
            "parent": ["in", batch],
            "parenttype": "Lead",
            "parentfield": CHILD_PARENTFIELD
        }

        if service_vertical:
            filters["service_vertical_items"] = service_vertical

        rows = frappe.get_all(
            CHILD_DOCTYPE,
            filters=filters,
            fields=[
                "parent",
                "service_vertical_items",
                "idx"
            ],
            order_by="parent asc, idx asc",
            limit_page_length=0
        )

        for row in rows:

            parent = row.parent
            vertical = row.service_vertical_items

            if not vertical:
                continue

            if parent not in service_map:
                service_map[parent] = []

            # Prevent duplicate service verticals.
            if vertical not in service_map[parent]:
                service_map[parent].append(vertical)

    return service_map


def _get_visible_leads(filters=None, fields=None):
    """
    Always use frappe.get_list so standard Lead permissions
    and user-level restrictions are respected.
    """

    return frappe.get_list(
        "Lead",
        filters=filters or {},
        fields=fields or ["name"],
        limit_page_length=0
    )


def _build_lead_data(lead, service_map):
    """Convert a Lead record into hierarchy response data."""

    lead_data = {
        key: value
        for key, value in lead.items()
    }

    # Deduplicate service verticals without using dict().
    verticals = []

    for vertical in service_map.get(lead.name, []):

        if vertical not in verticals:
            verticals.append(vertical)

    if not verticals:
        verticals = ["Unassigned"]

    first_name = lead.get("first_name") or ""
    last_name = lead.get("last_name") or ""

    full_name = " ".join(
        part for part in [first_name, last_name] if part
    )

    lead_data["service_verticals"] = verticals

    lead_data["display_name"] = (
        lead.get("lead_name")
        or full_name
        or lead.name
    )

    lead_data["client_company"] = (
        lead.get("custom_client_company")
        or "Unassigned Company"
    )

    lead_data["region"] = (
        lead.get("custom_region_name")
        or "Unassigned Region"
    )

    lead_data["qualification"] = (
        lead.get("custom_lead_qualification")
        or "Unclassified"
    )

    return lead_data


# ============================================================
# FILTER OPTIONS
# ============================================================

@frappe.whitelist()
def get_filter_options():

    try:

        # Only retrieve Lead records visible to the current user.
        leads = _get_visible_leads(
            fields=[
                "name",
                "custom_client_company",
                "custom_region_name"
            ]
        )

        companies = set()
        regions = set()

        lead_names = []

        for lead in leads:

            lead_names.append(lead.name)

            if lead.custom_client_company:
                companies.add(lead.custom_client_company)

            if lead.custom_region_name:
                regions.add(lead.custom_region_name)

        # Fetch service verticals only for visible Lead records.
        service_map = _get_service_rows(lead_names)

        services = set()

        for verticals in service_map.values():

            for vertical in verticals:
                services.add(vertical)

        return {
            "companies": sorted(companies, key=str.lower),
            "regions": sorted(regions, key=str.lower),
            "service_verticals": sorted(services, key=str.lower)
        }

    except Exception:

        frappe.log_error(
            message=frappe.get_traceback(),
            title="Client Hierarchy - Filter Options Error"
        )

        frappe.throw(
            _("Unable to load hierarchy filter options. "
              "Please check the Error Log.")
        )


# ============================================================
# MAIN CLIENT HIERARCHY API
# ============================================================

@frappe.whitelist()
def get_hierarchy_data(
    company=None,
    region=None,
    service_vertical=None
):

    try:

        # ----------------------------------------------------
        # 1. VALIDATE FILTERS
        # ----------------------------------------------------

        company = _clean_filter(company, "Company")
        region = _clean_filter(region, "Region")
        service_vertical = _clean_filter(
            service_vertical,
            "Service Vertical"
        )

        # Require at least one filter.
        if not any([company, region, service_vertical]):

            return {
                "leads": [],
                "total": 0,
                "requires_filter": True
            }

        # ----------------------------------------------------
        # 2. PREPARE LEAD FILTERS
        # ----------------------------------------------------

        filters = {}

        if company:
            filters["custom_client_company"] = company

        if region:
            filters["custom_region_name"] = region

        # ----------------------------------------------------
        # 3. SERVICE VERTICAL FILTER
        # ----------------------------------------------------

        matching_parent_names = None

        if service_vertical:

            matching_parent_names = set()

            child_rows = frappe.get_all(
                CHILD_DOCTYPE,
                filters={
                    "service_vertical_items": service_vertical,
                    "parenttype": "Lead",
                    "parentfield": CHILD_PARENTFIELD
                },
                fields=["parent"],
                limit_page_length=0
            )

            for row in child_rows:

                if row.parent:
                    matching_parent_names.add(row.parent)

            # No Lead records have this service vertical.
            if not matching_parent_names:

                return {
                    "leads": [],
                    "total": 0,
                    "requires_filter": False
                }

        # ----------------------------------------------------
        # 4. FETCH PERMITTED LEADS
        # ----------------------------------------------------

        leads = []

        if matching_parent_names is not None:

            # Process large parent-name collections in batches.
            for batch in _chunks(sorted(matching_parent_names)):

                batch_filters = {
                    key: value
                    for key, value in filters.items()
                }

                batch_filters["name"] = ["in", batch]

                batch_leads = _get_visible_leads(
                    filters=batch_filters,
                    fields=LEAD_FIELDS
                )

                leads.extend(batch_leads)

        else:

            # Company/region filters are applied directly
            # by the database.
            leads = _get_visible_leads(
                filters=filters,
                fields=LEAD_FIELDS
            )

        if not leads:

            return {
                "leads": [],
                "total": 0,
                "requires_filter": False
            }

        # ----------------------------------------------------
        # 5. REMOVE DUPLICATE LEADS
        # ----------------------------------------------------

        unique_leads = []
        seen_names = set()

        for lead in leads:

            if lead.name in seen_names:
                continue

            seen_names.add(lead.name)
            unique_leads.append(lead)

        leads = unique_leads

        # ----------------------------------------------------
        # 6. FETCH SERVICE VERTICALS IN BATCHES
        # ----------------------------------------------------

        lead_names = [
            lead.name for lead in leads
        ]

        service_map = _get_service_rows(
            lead_names,
            service_vertical=service_vertical
        )

        # ----------------------------------------------------
        # 7. BUILD HIERARCHY DATA
        # ----------------------------------------------------

        result = []

        for lead in leads:

            lead_data = _build_lead_data(
                lead,
                service_map
            )

            result.append(lead_data)

        # ----------------------------------------------------
        # 8. STABLE SORTING
        # ----------------------------------------------------

        result.sort(
            key=lambda item: (
                (item.get("client_company") or "").lower(),
                (item.get("region") or "").lower(),
                (item.get("qualification") or "").lower(),
                (item.get("display_name") or "").lower()
            )
        )

        # ----------------------------------------------------
        # 9. RESPONSE
        # ----------------------------------------------------

        return {
            "leads": result,
            "total": len(result),
            "requires_filter": False
        }

    except frappe.ValidationError:
        raise

    except Exception:

        frappe.log_error(
            message=frappe.get_traceback(),
            title="Client Hierarchy - Data Fetch Error"
        )

        frappe.throw(
            _("Unable to load client hierarchy. "
              "Please check the Error Log.")
        )
