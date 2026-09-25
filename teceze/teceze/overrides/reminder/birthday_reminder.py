

import base64
import mimetypes
import random
from pathlib import Path
import frappe
from frappe.utils import getdate, today, get_url
from html import escape
ASSET_ROOT = Path(
    "/home/frappe/frappe-bench/apps/teceze/teceze/teceze/overrides/reminder/birthday_mail_assets"
)
LOGO_FILENAME = "teceze-logo.png"

BIRTHDAY_MESSAGES = [
    (
        "Your work makes a difference.",
        "Wishing you a year filled with grand ideas, deeply meaningful<br>"
        "moments, and thrilling new milestones. Thank you for elevating<br>"
        "the artistry of everything we ship at Lumina."
    ),
    (
        "Your dedication inspires the team.",
        "May this year bring exciting opportunities, meaningful achievements,<br>"
        "and wonderful memories. Thank you for everything you bring<br>"
        "to the team every single day."
    ),
    (
        "Today is all about celebrating you.",
        "Wishing you a year filled with fresh ideas, meaningful experiences,<br>"
        "professional growth, and plenty of memorable moments to celebrate."
    ),
    (
        "Great work starts with great people.",
        "Thank you for the energy, creativity, and commitment you bring<br>"
        "every day. Wishing you an incredible year ahead filled with<br>"
        "new milestones and memorable moments."
    ),
    (
        "Another year. Another opportunity to shine.",
        "May the year ahead be filled with inspiring challenges, exciting<br>"
        "wins, meaningful experiences, and plenty of reasons to celebrate."
    ),
    (
        "Your contribution matters.",
        "Wishing you a wonderful birthday and a year filled with new<br>"
        "possibilities, personal growth, professional success, and<br>"
        "moments that make you smile."
    ),
    (
        "Here's to another remarkable chapter.",
        "May your journey ahead be filled with bold ideas, rewarding<br>"
        "experiences, great teamwork, and achievements you can be proud of."
    ),
    (
        "Celebrating the person behind the great work.",
        "Thank you for making a difference through everything you do.<br>"
        "Wishing you a bright, successful, and memorable year ahead."
    ),
    (
        "Your journey is worth celebrating.",
        "May this birthday mark the beginning of an exciting year filled<br>"
        "with happiness, growth, new opportunities, and unforgettable moments."
    ),
    (
        "Keep creating. Keep growing. Keep inspiring.",
        "Wishing you another year of meaningful achievements, exciting<br>"
        "possibilities, and plenty of moments to celebrate along the way."
    ),
]

def _data_uri(relative_path):
    """
    Return a local birthday asset as a base64 data URI.
    """
    path = ASSET_ROOT / relative_path
    if not path.is_file():
        frappe.logger("birthday_reminder").warning(
            "Birthday asset not found: %s",
            path,
        )
        return ""
    mime_type = (
        mimetypes.guess_type(path.name)[0]
        or "application/octet-stream"
    )
    encoded = base64.b64encode(
        path.read_bytes()
    ).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"
def _img(
    relative_path,
    alt="",
    width=None,
    height=None,
    style="",
):
    """
    Return an email-safe image using a data URI.
    """
    src = _data_uri(relative_path)
    if not src:
        return ""
    dimensions = ""
    if width:
        dimensions += f' width="{width}"'
    if height:
        dimensions += f' height="{height}"'
    return (
        f'<img '
        f'src="{src}" '
        f'alt="{escape(alt)}"'
        f'{dimensions} '
        f'style="'
        f'display:block;'
        f'border:0;'
        f'outline:none;'
        f'text-decoration:none;'
        f'{style}'
        f'">'
    )
def _logo_html():
    """
    Company logo using Frappe inline/CID image support.
    HTML:
        <img embed="teceze-logo.png">
    Frappe:
        inline_images=[...]
    """
    logo_path = ASSET_ROOT / LOGO_FILENAME
    if not logo_path.is_file():
        frappe.logger("birthday_reminder").warning(
            "Birthday logo not found: %s",
            logo_path,
        )
        return ""
    return (
        f'<img '
        f'embed="{LOGO_FILENAME}" '
        f'alt="TECEZE" '
        f'width="250" '
        f'style="'
        f'display:block;'
        f'width:250px;'
        f'max-width:250px;'
        f'height:auto;'
        f'border:0;'
        f'outline:none;'
        f'text-decoration:none;'
        f'">'
    )
def _initials(name):
    parts = [
        part
        for part in name.split()
        if part
    ]
    if not parts:
        return "TM"
    return "".join(
        part[0]
        for part in parts[:2]
    ).upper()
def _completed_years(start_date, current_date):
    if not start_date:
        return None
    start_date = getdate(start_date)
    years = (
        current_date.year
        - start_date.year
    )
    if (
        current_date.month,
        current_date.day
    ) < (
        start_date.month,
        start_date.day
    ):
        years -= 1
    return max(years, 0)
def _employee_image(employee):
    """
    Return Employee image as an email-safe source.
    """
    image_url = getattr(
        employee,
        "image",
        None,
    )
    if not image_url:
        return ""
    if image_url.startswith("/files/"):
        return f"{get_url()}{image_url}"
    if image_url.startswith("/private/files/"):
        file_path = Path(
            frappe.get_site_path(
                image_url.lstrip("/")
            )
        )
        if file_path.is_file():
            mime_type = (
                mimetypes.guess_type(file_path.name)[0]
                or "application/octet-stream"
            )
            encoded = base64.b64encode(
                file_path.read_bytes()
            ).decode("ascii")
            return (
                f"data:{mime_type};base64,{encoded}"
            )
    return ""
def _birthday_html(employee, current_date):
    name_raw = (
        employee.employee_name
        or "Team Member"
    )
    role_raw = (
        employee.designation
        or "Team Member"
    )
    department_raw = (
        employee.department
        or "Team"
    )
    name = escape(name_raw)
    role = escape(role_raw)
    department = escape(department_raw)
    department_group = escape(
        department_raw.upper()
    )
    initials = escape(
        _initials(name_raw)
    )
    employee_image = _employee_image(
        employee
    )
    years = _completed_years(
        employee.date_of_joining,
        current_date,
    )
    milestone = (
        f"{years} YEARS WITH US"
        if years is not None
        else "CELEBRATING YOU TODAY"
    )
    logo = _logo_html()
    message_title, message_body = random.choice(BIRTHDAY_MESSAGES)
   
    monogram_icon = _img(
        "card-employee-monogram-icon.png",
        "",
        width=28,
        height=28,
    )
    cake_icon = _img(
        "card-executive-message-icon.png",
        "Birthday cake",
        width=28,
        height=32,
    )
    button_icon = _img(
        "btn-icon.png",
        "",
        width=18,
        height=16,
    )
    cake_design = _img(
        "birthday-cake-design.png",
        "Birthday cake",
        width=430,
        height=276,
        style=(
            "width:430px;"
            "height:276px;"
            "max-width:100%;"
            "object-fit:cover;"
            "border-radius:14px;"
        ),
    )
    if employee_image:
        avatar_html = (
            f'<img '
            f'src="{employee_image}" '
            f'alt="{name}" '
            f'width="120" '
            f'height="120" '
            f'style="'
            f'display:block;'
            f'width:120px;'
            f'height:120px;'
            f'object-fit:cover;'
            f'border-radius:60px;'
            f'border:0;'
            f'outline:none;'
            f'text-decoration:none;'
            f'">'
        )
    else:
        avatar_html = (
            monogram_icon
            +
            (
                f'<div style="'
                f'font-size:28px;'
                f'line-height:34px;'
                f'font-weight:700;'
                f'color:#215092;'
                f'padding-top:5px;'
                f'">'
                f'{initials}'
                f'</div>'
            )
            +
            (
                '<div style="'
                'font-size:9px;'
                'line-height:12px;'
                'font-weight:600;'
                'letter-spacing:1.4px;'
                'color:#64748b;'
                '">'
                'DYNAMIC AVATAR'
                '</div>'
            )
        )
    return f'''
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" style=" margin:0; padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; background-image:linear-gradient(#FFFFFF,#FFFFFF) !important; " >
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0" >
        <meta name="x-apple-disable-message-reformatting" >
        <meta name="color-scheme" content="light" >
        <meta name="supported-color-schemes" content="light" >
        <title>
            Happy Birthday, {name}!
        </title>
        <style>
            :root{{color-scheme:light only !important;supported-color-schemes:light !important;}}html{{margin:0 !important;padding:0 !important;background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}body{{margin:0 !important;padding:0 !important;background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;color:#0F172A !important;font-family:Arial,Helvetica,sans-serif !important;color-scheme:light only !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}.email-background{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}.email-shell{{width:100% !important;background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}.email-shell > tbody > tr{{height:100% !important;}}.email-shell > tbody > tr > td{{height:100% !important;}}.right-card{{width:100% !important;height:100% !important;background:#FBFDFF !important;background-color:#FBFDFF !important;}}.white-bg{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsb]{{background-color:#FFFFFF !important;}}[data-ogsb] html{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsb] body{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsb] .email-background{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsb] .email-shell{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsc] html{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsc] body{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsc] .email-background{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}[data-ogsc] .email-shell{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}img{{border:0 !important;outline:none !important;text-decoration:none !important;}}@media only screen and (max-width:900px){{html{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}body{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}.email-background{{background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}.email-shell{{width:100% !important;max-width:100% !important;background:#FFFFFF !important;background-color:#FFFFFF !important;background-image:linear-gradient(#FFFFFF,#FFFFFF) !important;}}.email-shell > tbody > tr{{height:auto !important;}}.email-shell > tbody > tr > td{{height:auto !important;}}.column{{display:block !important;width:100% !important;max-width:100% !important;height:auto !important;}}.column-pad{{padding-left:12px !important;padding-right:12px !important;}}.right-card{{width:100% !important;height:auto !important;}}.cake-design{{width:100% !important;height:auto !important;}}}}
        </style>
    </head>
    <body bgcolor="#FFFFFF" style=" margin:0; padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; background-image: linear-gradient(#FFFFFF,#FFFFFF) !important; color:#0F172A; font-family: Arial, Helvetica, sans-serif; color-scheme:light only !important; " >
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" class="email-background" style=" width:100%; margin:0; padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; background-image: linear-gradient(#FFFFFF,#FFFFFF) !important; " >
            <tr>
                <td align="center" bgcolor="#FFFFFF" style=" padding:18px 8px; background:#FFFFFF !important; background-color:#FFFFFF !important; background-image: linear-gradient(#FFFFFF,#FFFFFF) !important; " >
                    <table role="presentation" width="1220" height="100%" cellpadding="0" cellspacing="0" border="0" class="email-shell" bgcolor="#FFFFFF" style=" width:100%; max-width:1220px; margin:0 auto; background:#FFFFFF !important; background-color:#FFFFFF !important; background-image: linear-gradient(#FFFFFF,#FFFFFF) !important; border-top:4px solid #0EA39E; " >
                        <tr height="100%" style="height:100%;" >
                            <td width="600" height="100%" valign="top" class="column column-pad" bgcolor="#FFFFFF" style=" width:49%; max-width:600px; height:100%; padding:0 10px 0 0; background:#FFFFFF !important; background-color:#FFFFFF !important; " >
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style=" width:100%; margin:0; padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; " >
                                    <tr>
                                        <td align="left" style=" padding:32px 28px 8px 28px; display: flex; justify-content: center; " >
                                            {logo}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td align="center"  style=" padding:20px 20px 18px 20px;" >
                                            <div style=" font-size:30px; line-height:36px; font-weight:800; color:#17485B; letter-spacing:0; " >
                                                HAPPY
                                                <br>
                                                BIRTHDAY
                                            </div>
                                            <div style=" width:96px; height:2px; margin:16px auto 0 auto; font-size:0; line-height:0; " >
                                                &nbsp;
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td bgcolor="#FFFFFF" style=" padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; " >
                                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="birthday-card" bgcolor="#F8FFFD" style=" width:100%; background:#F8FFFD !important; background-color:#F8FFFD !important; border:1px solid #CCFBF1; border-radius:16px; " >
                                                <tr>
                                                    <td align="center" bgcolor="#F8FFFD" style=" padding:30px 24px 36px 24px; background:#F8FFFD !important; background-color:#F8FFFD !important; " >
                                                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style=" margin:0 auto; " >
                                                            <tr>
                                                                <td align="center" valign="middle" width="154" height="154" style=" width:154px; height:154px; border-radius:77px; padding:8px; " >
                                                                    <table role="presentation" width="138" height="138" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style=" width:138px; height:138px; background:#FFFFFF !important; background-color:#FFFFFF !important; border-radius:69px; " >
                                                                        <tr>
                                                                            <td align="center" valign="middle" bgcolor="#F0FDFA" style=" border:1px solid #99F6E4; border-radius:69px; " >
                                                                                {avatar_html}
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                        <div style=" height:22px; line-height:22px; font-size:1px; " >
                                                            &nbsp;
                                                        </div>
                                                        <div style=" font-size:22px; line-height:30px; font-weight:700; color:#0F172A; " >
                                                            {name}
                                                        </div>
                                                        <div style=" font-size:15px; line-height:24px; color:#007B88; padding-top:3px; " >
                                                            {role} &bull; {department}
                                                        </div>
                                                        <div style=" font-size:12px; line-height:20px; letter-spacing:1px; text-transform:uppercase; color:#64748B; padding-top:2px; " >
                                                            {department_group} &bull; {escape(milestone)}
                                                        </div>
                                                        <div style=" height:26px; line-height:26px; font-size:1px; " >
                                                            &nbsp;
                                                        </div>
                                                        <div style=" width:210px; height:1px; background:#5EEAD4; margin:0 auto; font-size:0; line-height:0; " >
                                                            &nbsp;
                                                        </div>
                                                        <div style=" height:14px; line-height:14px; font-size:1px; " >
                                                            &nbsp;
                                                        </div>
                                                        <div style=" font-size:17px; line-height:28px; color:#334155; " >
                                                            &ldquo;Another year. Another chapter.
                                                            <br>
                                                            Another reason to celebrate.&rdquo;
                                                        </div>
                                                        <div style=" padding-top:12px; color:#0EA39E; font-size:18px; letter-spacing:8px; " >
                                                            &#10022; &#10022; &#10022;
                                                        </div>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                            <td width="600" height="100%" valign="middle" class="column column-pad" bgcolor="#FFFFFF" style=" width:49%; max-width:600px; height:100%; padding:0 0 0 10px; background:#FFFFFF !important; background-color:#FFFFFF !important; " >
                                <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" class="right-card" bgcolor="#FBFDFF" style=" width:100%; height:100% !important; background:#FBFDFF !important; background-color:#FBFDFF !important; border:1px solid #E2E8F0; border-radius:16px; " >
                                    <tr>
                                        <td align="center" bgcolor="#FBFDFF" style=" padding:30px 24px 18px 24px; background:#FBFDFF !important; background-color:#FBFDFF !important; " >
                                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cake-card" bgcolor="#FFFFFF" style=" width:100%; background:#FFFFFF !important; background-color:#FFFFFF !important; border:1px solid #CCFBF1; border-radius:16px; " >
                                                <tr>
                                                    <td align="center" valign="middle" bgcolor="#FFFFFF" style=" padding:0; background:#FFFFFF !important; background-color:#FFFFFF !important; " >
                                                        {cake_design}
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td align="center" bgcolor="#FBFDFF" style=" padding:0 32px 18px 32px; background:#FBFDFF !important; background-color:#FBFDFF !important; " >
                                            <div style=" font-size:17px; line-height:26px; font-weight:500; color:#0F172A; " >
                                                &ldquo;{message_title}&rdquo;
                                            </div>
                                            <div style=" height:10px; line-height:10px; font-size:1px; " >
                                                &nbsp;
                                            </div>
                                            <div style=" font-size:15px; line-height:24px; color:#475569; " >
                                                {message_body}
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div style=" font-size:16px; line-height:24px; color:#006A66; display: flex; justify-content: center; " >
                                                Warm wishes from your team
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td align="left" bgcolor="#FFFFFF" style=" padding:32px 28px 8px 28px; background:#FFFFFF !important; background-color:#FFFFFF !important; display: flex; justify-content: center; " >
                                            {logo}
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" align="center" bgcolor="#FFFFFF" style=" padding:10px 30px 26px 30px; background:#FFFFFF !important; background-color:#FFFFFF !important; " </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
        </html>
'''
def get_all_employees():
    all_recipients = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "employment_type": ["!=", "Engineer"],
            "company_email": ["!=", ""],
        },
        pluck="company_email"
    )
    return all_recipients
def send_birthday_wishes():
    """
    Queue birthday emails for active employees whose birthday
    is today.
    """ 
    if not frappe.db.get_single_value("Teceze Settings", "birthday"):
        frappe.logger("birthday_reminder").info(
            "Birthday reminders are disabled in Teceze Settings. Skipping."
        )
        return "Birthday reminders disabled in Teceze Settings."
    today_date = getdate(today())
    employees = frappe.db.sql(
        """
        SELECT
            name,
            employee_name,
            company_email,
            personal_email,
            date_of_birth,
            date_of_joining,
            designation,
            department,
            image
        FROM `tabEmployee`
        WHERE status = 'Active'
          AND (
                employment_type IS NULL
                OR employment_type != 'Engineer'
              )
          AND date_of_birth IS NOT NULL
          AND MONTH(date_of_birth) = %s
          AND DAY(date_of_birth) = %s
        ORDER BY employee_name
        """,
        (
            today_date.month,
            today_date.day,
        ),
        as_dict=True,
    )
    if not employees:
        frappe.logger(
            "birthday_reminder"
        ).info(
            "No birthdays found for %s",
            today_date,
        )
        return "No birthdays today"
    if not ASSET_ROOT.is_dir():
        frappe.throw(
            "Birthday email asset folder not found: "
            f"{ASSET_ROOT}"
        )
    logo_path = ASSET_ROOT / LOGO_FILENAME
    if not logo_path.is_file():
        frappe.throw(
            "Birthday email logo not found: "
            f"{logo_path}"
        )
    logo_content = logo_path.read_bytes()
    queued = 0
    skipped = 0
    failed = 0
    all_recipients =get_all_employees()
    for employee in employees:
        recipient = all_recipients
        if not recipient:
            skipped += 1
            frappe.logger(
                "birthday_reminder"
            ).warning(
                "No email address for employee %s (%s)",
                employee.employee_name,
                employee.name,
            )
            continue
        try:
            message = _birthday_html(
                employee,
                today_date,
            )
            subject = (
               f"🥳 It's {employee.employee_name}'s Birthday — Let's Celebrate!"
            )
            frappe.sendmail(
                recipients=recipient,
                subject=subject,
                message=message,
                inline_images=[
                    {
                        "filename": LOGO_FILENAME,
                        "filecontent": logo_content,
                    }
                ],
                raw_html=True,
                add_css=False,
            )
            queued += 1
            frappe.logger(
                "birthday_reminder"
            ).info(
                "Birthday email queued for %s (%s)",
                employee.employee_name,
                recipient,
            )
        except Exception:
            failed += 1
            frappe.log_error(
                frappe.get_traceback(),
                (
                    "Birthday email failed: "
                    f"{employee.employee_name}"
                ),
            )
    return (
        f"Birthday emails processed: "
        f"{len(employees)} | "
        f"queued: {queued} | "
        f"skipped: {skipped} | "
        f"failed: {failed}"
    )