from io import BytesIO

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    from PyPDF2 import PdfReader, PdfWriter


class PDFMergeService:
    """
    Handles merging multiple PDF files.
    """

    @staticmethod
    def merge_pdfs(pdf_list):
        """
        Merge multiple PDF byte contents.

        Args:
            pdf_list (list): List of PDF bytes

        Returns:
            bytes: Merged PDF bytes
        """

        writer = PdfWriter()

        for pdf in pdf_list:

            if not pdf:
                continue

            reader = PdfReader(BytesIO(pdf))

            for page in reader.pages:
                writer.add_page(page)

        output = BytesIO()

        writer.write(output)

        output.seek(0)

        return output.read()