import frappe
from frappe.utils import now_datetime

class ESignValidator:
    """Handles all E-Sign validations."""

    @staticmethod
    def validate_new_request(job_offer):
        """
        Ensure there is no active E-Sign Request
        for the given Job Offer.
        """

        existing_request = frappe.db.exists(
            "E-Sign Request",
            {
                "job_offer": job_offer,
                "status": ["in", ["Pending", "Viewed"]]
            }
        )

        if existing_request:
            frappe.throw(
                "An active E-Sign Request already exists for this Job Offer."
            )
    #dharshini
    @staticmethod
    def validate_access(esign_request):
        """
        Validate whether the signing link is still valid.
        """

        # Already signed
        if esign_request.status == "Signed":
            frappe.throw("This document has already been signed.")

        # Cancelled
        if esign_request.status == "Cancelled":
            frappe.throw("This signing request has been cancelled.")

        # Expired
        if now_datetime() > esign_request.expires_on:

            if esign_request.status != "Expired":
                esign_request.status = "Expired"
                esign_request.save(ignore_permissions=True)

            frappe.throw("This signing link has expired.")