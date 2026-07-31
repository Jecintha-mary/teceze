import frappe


class EmailService:
    """Handles all E-Sign emails."""

    @staticmethod
    def send_request(esign_request):

        subject = "Offer Letter - Please Review & Sign"

        message = f"""
        <p>Dear <b>{esign_request.applicant_name}</b>,</p>

        <p>Congratulations!</p>

        <p>
        We are pleased to share your Offer Letter.
        Please review the attached document and complete the electronic signature
        by clicking the button below.
        </p>

        <br>

        <a href="{esign_request.signing_url}"
        style="
            background:#0d6efd;
            color:white;
            padding:12px 25px;
            text-decoration:none;
            border-radius:5px;
            font-size:16px;
        ">
            Review & Sign
        </a>

        <br><br>

        <p>
        If the button doesn't work, copy and paste the link below:
        </p>

        <p>{esign_request.signing_url}</p>

        <br>

        <p>Regards,<br>HR Team</p>
        """



        frappe.sendmail(
            recipients=[esign_request.applicant_email],
            subject=subject,
            message=message,
            delayed=False,
        )