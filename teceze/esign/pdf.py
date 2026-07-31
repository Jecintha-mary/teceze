import frappe
from frappe.utils.pdf import get_pdf


class PDFService:
    """Handles PDF generation."""

    @staticmethod
    def generate_pdf(doctype, docname, print_format):
        """
        Generate a PDF for the given Print Format.
        """

        html = frappe.get_print(
            doctype=doctype,
            name=docname,
            print_format=print_format,
            letterhead=None,
            no_letterhead=0,
            as_pdf=False,
        )

        return get_pdf(html)