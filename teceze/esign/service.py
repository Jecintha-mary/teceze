import frappe
from frappe.utils import now_datetime, get_url,add_days
from frappe.utils.file_manager import save_file
from teceze.esign.pdf import PDFService
from teceze.esign.merge import PDFMergeService
from teceze.esign.token import TokenService
from teceze.esign.validators import ESignValidator
from teceze.esign.email import EmailService


class ESignService:
    """Handles all E-Sign business logic."""

    def create_request(self, job_offer):
        """
        Create a new E-Sign Request for the given Job Offer.
        """

        # Fetch Job Offer
        job_offer_doc = frappe.get_doc("Job Offer", job_offer)

        # Validate
        ESignValidator.validate_new_request(job_offer_doc.name)

        # Generate secure token
        # Generate secure token
        #dharshini
        token = TokenService.generate()

        # Encrypt token before exposing it in URL
        encrypted_token = TokenService.encrypt(token)

        # Generate secure signing URL
        signing_url = (
            f"{get_url()}/e-sign-document/new?key={encrypted_token}"
        )

       
        # Create E-Sign Request
        esign_request = frappe.new_doc("E-Sign Request")

        esign_request.job_offer = job_offer_doc.name
        esign_request.job_applicant = job_offer_doc.job_applicant
        esign_request.applicant_name = job_offer_doc.applicant_name
        esign_request.applicant_email = job_offer_doc.applicant_email

        esign_request.token = token
        esign_request.signing_url = signing_url
        esign_request.status = "Pending"
        esign_request.requested_on = now_datetime()
        esign_request.expires_on = add_days(now_datetime(), 7)

        # Save E-Sign Request
        esign_request.insert(ignore_permissions=True)


        # -------------------------------
        # Generate Offer Package PDFs
        # -------------------------------

        # Generate Offer Letter PDF
        offer_pdf = PDFService.generate_pdf(
            doctype="Job Offer",
            docname=job_offer_doc.name,
            print_format="Teceze Offer Letter",
        )

        # Generate NDA PDF
        nda_pdf = PDFService.generate_pdf(
            doctype="Job Offer",
            docname=job_offer_doc.name,
            print_format="Teceze NDA",
        )

        # Generate Terms of Employment PDF
        terms_pdf = PDFService.generate_pdf(
            doctype="Job Offer",
            docname=job_offer_doc.name,
            print_format="Teceze Terms Of Employment",
        )


        # Merge all PDFs
        pdf_content = PDFMergeService.merge_pdfs(
            [
                offer_pdf,
                nda_pdf,
                terms_pdf,
            ]
        )


        # Save merged PDF as private File
        file_doc = save_file(
            fname=f"{job_offer_doc.name}_Offer_Package.pdf",
            content=pdf_content,
            dt="E-Sign Request",
            dn=esign_request.name,
            is_private=1,
        )


        # Store Original Document
        esign_request.original_document = file_doc.file_url

        # Save updated E-Sign Request
        esign_request.save(ignore_permissions=True)


        # Send email to candidate
        EmailService.send_request(esign_request)

        return esign_request