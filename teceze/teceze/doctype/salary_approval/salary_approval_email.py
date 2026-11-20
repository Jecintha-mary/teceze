import frappe
from frappe import _


@frappe.whitelist()
def send_salary_approval(*args, **kwargs):

    doc = kwargs.get("doc")
    if isinstance(doc, str):
        doc = frappe.parse_json(doc)
    if isinstance(doc, dict):
        doc = frappe.get_doc(doc)
    if not doc:
        frappe.throw(_("Salary Approval document was not received."))

    applicant = frappe.get_doc(
        "Job Applicant",
        doc.applicant
    )

    if not applicant.email_id:
        frappe.throw(
            _("No email address found for Applicant {0}.").format(
                applicant.applicant_name
            )
        )

    pdf = frappe.get_print(
        doctype="Salary Approval",
        name=doc.name,
        print_format="Salary Approval",
        as_pdf=True
    )

    frappe.sendmail(
        recipients=[applicant.email_id],
        subject=_(
            "Salary Structure for Approval - {0}"
        ).format(
            applicant.applicant_name
        ),
        message=_(
            """
            Dear {0},

            Please find attached your proposed salary structure
            for review.

            Kindly review the attached salary structure and reply
            to this email with your approval or rejection.

            Regards,<br>
            HR Team
            """
        ).format(
            applicant.applicant_name
        ),
        attachments=[
            {
                "fname": f"Salary Approval - {applicant.applicant_name}.pdf",
                "fcontent": pdf
            }
        ],
        reference_doctype="Salary Approval",
        reference_name=doc.name
    )

    doc.status = "Sent"
    doc.save(ignore_permissions=True)

    return {
        "status": "success",
        "message": _("Salary approval sent successfully.")
    }