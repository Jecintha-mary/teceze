import base64
import frappe
from frappe.utils.file_manager import save_file
from teceze.esign.token import TokenService
from teceze.esign.validators import ESignValidator


@frappe.whitelist(allow_guest=True)
def get_document(key):
    """
    Fetch E-Sign Request using encrypted signing key.
    """

    if not key:
        frappe.throw("Signing key is required.")

    try:
        token = TokenService.decrypt(key)

    except Exception:
        frappe.throw("Invalid signing link.")

    request_name = frappe.db.get_value(
        "E-Sign Request",
        {"token": token},
        "name"
    )

    if not request_name:
        frappe.throw("Invalid signing link.")

    esign_request = frappe.get_doc(
        "E-Sign Request",
        request_name
    )

    # Validate request
    ESignValidator.validate_access(esign_request)

    # Update Viewed status
    if esign_request.status == "Pending":
        esign_request.status = "Viewed"
        esign_request.save(ignore_permissions=True)

    return {
        "name": esign_request.name,
        "applicant_name": esign_request.applicant_name,
        "original_document": esign_request.original_document,
        "status": esign_request.status,
    }


@frappe.whitelist(allow_guest=True)
def save_signature(key,signature):
    """
    Save candidate signature as an image file.
    """

    if not key:
        frappe.throw("Signing key is required.")

    try:
        token = TokenService.decrypt(key)

    except Exception:
        frappe.throw("Invalid signing link.")

    request_name = frappe.db.get_value(
        "E-Sign Request",
        {"token": token},
        "name"
    )

    if not request_name:
        frappe.throw("Invalid signing link.")

    esign_request = frappe.get_doc(
        "E-Sign Request",
        request_name
    )

    # Validate request
    ESignValidator.validate_access(esign_request)

    # Remove Base64 prefix if present
    if signature.startswith("data:image"):
        signature = signature.split(",", 1)[1]

    image_bytes = base64.b64decode(signature)

    # Save signature as File
    file_doc = save_file(
        fname=f"{esign_request.name}_signature.png",
        content=image_bytes,
        dt="E-Sign Request",
        dn=esign_request.name,
        is_private=1,
    )

    # Store file URL
    esign_request.signature_image = file_doc.file_url

    esign_request.save(ignore_permissions=True)

    return {
        "status": "success",
        "message": "Signature saved successfully.",
        "signature_url": file_doc.file_url,
    }