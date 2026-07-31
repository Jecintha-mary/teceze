import frappe

from erpnext.crm.doctype.lead.lead import _set_missing_values
from frappe.model.mapper import get_mapped_doc


@frappe.whitelist()
def make_quotation(source_name, target_doc=None):

    def set_missing_values(source, target):
        _set_missing_values(source, target)

    target_doc = get_mapped_doc(
        "Lead",
        source_name,
        {
            "Lead": {
                "doctype": "Quotation",
                "field_map": {
                    "name": "party_name"
                }
            }
        },
        target_doc,
        set_missing_values,
    )

    lead = frappe.get_doc("Lead", source_name)

    item = frappe.get_doc("Item", lead.custom_required_item)

    target_doc.append(
        "items",
        {
            "item_code": lead.custom_required_item,
            "qty": lead.custom_no_of_items,
            "rate": lead.custom_amount,
            "uom": item.stock_uom,
        },
    )

    target_doc.quotation_to = "Lead"
    target_doc.run_method("set_missing_values")
    target_doc.run_method("set_other_charges")
    target_doc.run_method("calculate_taxes_and_totals")

    return target_doc