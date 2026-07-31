import frappe
from frappe.utils import flt
from frappe.utils.pdf import get_pdf
from teceze.esign.service import ESignService
#dharshini
def validate(doc, method):
    
    gross = flt(doc.custom_gross_per_annum)
    variable = flt(doc.custom_variable_per_annum)
    employer_pf = flt(doc.custom_pf_per_annum)
    medical = flt(doc.custom_medical_insurance_per_annum)

    doc.custom_gross_per_month = round(gross / 12)
    doc.custom_variable_per_month = round(variable / 12)
    doc.custom_pf_per_month = round(employer_pf / 12)
    doc.custom_medical_insurance_per_month = round(medical / 12)

    doc.custom_annual_ctc = (
        gross
        + variable
        + employer_pf
        + medical
    )

    doc.custom_annual_ctc_month = round(
        doc.custom_annual_ctc / 12
    )

    doc.custom_basic_per_annum = round(gross * 0.50)
    doc.custom_basic_per_month = round(
        doc.custom_basic_per_annum / 12
    )

    doc.custom_hra_per_annum = round(
        doc.custom_basic_per_annum * 0.50
    )

    doc.custom_hra_per_month = round(
        doc.custom_hra_per_annum / 12
    )

    doc.custom_lta_per_annum = 18000
    doc.custom_lta_per_month = 1500

    doc.custom_food_allowance_per_annum = 14400
    doc.custom_food_allowance_per_month = 1200

    doc.custom_spl_allowance_per_annum = (
        gross
        - doc.custom_basic_per_annum
        - doc.custom_hra_per_annum
        - doc.custom_lta_per_annum
        - doc.custom_food_allowance_per_annum
    )

    doc.custom_spl_allowance_per_month = round(
        doc.custom_spl_allowance_per_annum / 12
    )

    doc.custom_gross_salary_per_annum = (
        doc.custom_basic_per_annum
        + doc.custom_hra_per_annum
        + doc.custom_lta_per_annum
        + doc.custom_food_allowance_per_annum
        + doc.custom_spl_allowance_per_annum
    )

    doc.custom_gross_salary_per_month = round(
        doc.custom_gross_salary_per_annum / 12
    )

    doc.custom_pf_employee_per_annum = 21600
    doc.custom_pf_employee_per_month = 1800

    doc.custom_total_deduction_per_annum = (
        doc.custom_pf_employee_per_annum
    )

    doc.custom_total_deduction_per_month = (
        doc.custom_pf_employee_per_month
    )

    doc.custom_net_pay_per_annum = (
        doc.custom_gross_salary_per_annum
        - doc.custom_total_deduction_per_annum
    )

    doc.custom_net_pay_per_month = round(
        doc.custom_net_pay_per_annum / 12
    )




# def send_offer_email(doc, method):

#     # Generate Offer Letter PDF
#     offer_html = frappe.get_print(
#         "Job Offer",
#         doc.name,
#         print_format="Offer Letter"
#     )
#     offer_pdf = get_pdf(offer_html)

#     # Generate NDA PDF
#     nda_html = frappe.get_print(
#         "Job Offer",
#         doc.name,
#         print_format="NDA1"
#     )
#     nda_pdf = get_pdf(nda_html)

#     # Generate Terms & Conditions PDF
#     terms_html = frappe.get_print(
#         "Job Offer",
#         doc.name,
#         print_format="Terms of employment"
#     )
#     terms_pdf = get_pdf(terms_html)

#     frappe.sendmail(
#         recipients=[doc.applicant_email],
#         subject=f"Offer Letter - {doc.designation}",
#         message=f"""
# Dear {doc.applicant_name},

# I hope you are doing well.

# Please find attached your Offer Letter for the position of <b>{doc.designation}</b> at <b>Teceze Consultancy Services Pvt. Ltd.</b>

# The following documents are attached for your reference:

# <ul>
#     <li>Offer Letter</li>
#     <li>Non-Disclosure Agreement (NDA)</li>
#     <li>Terms & Conditions</li>
# </ul>

# Kindly review all the documents carefully, sign them, and return them at your earliest convenience.

# We look forward to welcoming you to the Teceze family.

# Regards,<br>
# <b>HR Team</b><br>
# Teceze Consultancy Services Pvt. Ltd.
#         """,
#         attachments=[
#             {
#                 "fname": "Offer Letter.pdf",
#                 "fcontent": offer_pdf,
#             },
#             {
#                 "fname": "NDA.pdf",
#                 "fcontent": nda_pdf,
#             },
#             {
#                 "fname": "Terms and Conditions.pdf",
#                 "fcontent": terms_pdf,
#             },
#         ],
#     )


#Raji 


def send_offer_email(doc, method):
    """
    Trigger the E-Sign process when the Job Offer is submitted.
    """

    service = ESignService()
    service.create_request(doc.name)