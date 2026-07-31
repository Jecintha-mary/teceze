import frappe


class DocumentBuilder:
    """
    Builds all documents required for the E-Sign process.
    """

    @staticmethod
    def get_print_formats():
        """
        Returns the list of print formats
        that should be included in the
        E-Sign package.
        """

        return [
            "Teceze Offer Letter",
            "Teceze NDA",
            "Teceze Terms Of Employment"
        ]