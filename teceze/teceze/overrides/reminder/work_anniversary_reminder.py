import base64
import mimetypes
from html import escape
from pathlib import Path 

import frappe
from frappe.utils import get_url, getdate, today

# Folder where your local anniversary email app module resides
ASSET_ROOT = Path(
    "/home/frappe/frappe-bench/apps/teceze/teceze/teceze/overrides/reminder/work_anniversary"
)


def _data_uri(relative_path):
    """Return a local birthday asset as a base64 data URI."""
    path = ASSET_ROOT / relative_path
 
    if not path.is_file():
        frappe.logger("Anniversary").warning(
            "Anniversary asset not found: %s", path
        )
        return ""
 
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"

def _initials(name):
    """Generate up to 2 uppercase initials from the employee's name."""
    parts = [part for part in name.split() if part]
    if not parts:
        return "TM"
    return "".join(part[0] for part in parts[:2]).upper()


def _completed_years(doj, today_date):
    return today_date.year - doj.year


def _img(relative_path, alt="", width=None, height=None, style=""):
    src = _data_uri(relative_path)
    if not src:
        return ""
 
    dimensions = ""
    if width:
        dimensions += f' width="{width}"'
    if height:
        dimensions += f' height="{height}"'
 
    return (
        f'<img src="{src}" alt="{escape(alt)}"{dimensions} '
        f'style="display:block;border:0;outline:none;text-decoration:none;{style}">'
    )


def _employee_image(employee):
    """Return the Employee image as an email-safe source."""
    image_url = getattr(employee, "image", None)
 
    if not image_url:
        return ""
 
    if image_url.startswith("/files/"):
        return f"{get_url()}{image_url}"
 
    if image_url.startswith("/private/files/"):
        file_path = Path(frappe.get_site_path(image_url.lstrip("/")))
        if file_path.is_file():
            mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
            encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
            return f"data:{mime_type};base64,{encoded}"
 
    return ""

def _anniversary_html(employee, current_date, years_completed):
    """Generate the Outlook-safe Work Anniversary two-column email HTML using local assets."""
    name_raw = employee.employee_name or "Team Member"
    role_raw = employee.designation or "Team Member"
    department_raw = (employee.department or "Team").split(" - ")[0]

    name = escape(name_raw)
    role = escape(role_raw)
    department = escape(department_raw)
    department_group = escape(department_raw.upper())
    initials = escape(_initials(name_raw))
    employee_image = _employee_image(employee) 
    print("EMPLOYEE IMAGE URL:", employee_image)

    year_label = "YEAR" if years_completed == 1 else "YEARS"
    milestone = escape(f"{years_completed} {year_label} OF SERVICE")

    # Asset helpers 
    # For the TECEZE logo:
    logo = f'<img src="https://teceze.com/wp-content/uploads/2026/05/logo.webp" alt="TECEZE Logo" width="180" style="display:block;border:0;outline:none;text-decoration:none;background-color:transparent !important;">'
    # logo = f'<img src="https://teceze.com/wp-content/uploads/2026/05/logo.webp" alt="TECEZE Logo" width="180" style="display:block;border:0;outline:none;text-decoration:none;">'
    logo_swirl_svg =_img("assets/card-logo-swirl.png","logo",width=50)
    medal_img = (
        '<img src="https://erp.teceze.com/files/medal1-removebg.png" '
        'alt="Work Anniversary Medal" width="160" '
        'style="display:block;border:0;outline:none;text-decoration:none;'
        'background-color:transparent !important;">'
    )
    card_img2 = _img("assets/card-img2.png", "TECEZE Logo", width=120, height=30)
    monogram_star = _img("assets/card-employee-monogram-star.svg", "Star", width=20, height=20)
    # card_logo_swirl = _img("assets/card-logo-swirl.png", "Card Logo", width=24) 
    card_logo_swirl =f'<img src="https://teceze.com/wp-content/uploads/2026/05/logo.webp" alt="TECEZE Logo" width="90" style="display:block;border:0;outline:none;text-decoration:none;background-color:transparent !important;">'
    # Dynamic Avatar Logic
    if employee_image:
        avatar_content = f"""
        <table role="presentation"
               width="114"
               height="114"
               cellpadding="0"
               cellspacing="0"
               border="0"
               style="width:114px;height:114px;border-collapse:separate;border-radius:57px;overflow:hidden;">
            <tr>
                <td width="114"
                    height="114"
                    align="center"
                    valign="middle"
                    style="width:114px;
                           height:114px;
                           padding:0;
                           border-radius:50px;
                           overflow:hidden;
                           background-color:#f0fdfa;">
                    <img src="{employee_image}"
                         alt="{name}"
                         width="114"
                         height="114"
                         style="display:block;
                                width:114px;
                                height:114px;
                                object-fit:cover;
                                border:0;
                                outline:none;
                                text-decoration:none;
                                border-radius:57px;">
                </td>
            </tr>
        </table>
    """
    else:
        avatar_content = f"""
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
                <tr><td align="center" style="padding-bottom:4px;">{monogram_star}</td></tr>
                <tr><td align="center" style="font-size:24px;line-height:28px;font-weight:700;color:#215092;">{initials}</td></tr>
            </table>
        """ 

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Happy Work Anniversary, {name}!</title>

<style>
:root {{
    color-scheme: light only !important;
    supported-color-schemes: light !important;
}}

body, table, td, div, span {{
    color-scheme: light !important;
    forced-color-adjust: none !important;
}}

@media only screen and (max-width: 600px) {{
    .email-shell {{
        width: 100% !important;
    }}
    .column {{
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
    }}
    .column-pad-left {{
        padding-right: 0 !important;
        padding-bottom: 20px !important;
    }}
    .column-pad-right {{
        padding-left: 0 !important;
    }}
}}
</style>
</head>

<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Inter',Arial,Helvetica,sans-serif;color:#0f172a;">

<!-- Top Accent Line -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;">
<tr>
<td style="height:6px;background:linear-gradient(90deg, #0ea39e 0%, #1578a8 50%, #215092 100%);font-size:0;line-height:0;">&nbsp;</td>
</tr>
</table>

<!-- Outer Container -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0;padding:20px 0;background-color:#f8fafc;">
<tr>
<td align="center" style="padding:10px;">

<!--[if mso]>
<table role="presentation" width="1000" cellpadding="0" cellspacing="0" border="0" style="width:1000px;"><tr><td valign="top" width="485">
<![endif]-->

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-shell" style="max-width:1000px;margin:0 auto;">
<tr>

<!-- ========================= LEFT COLUMN ========================= -->
<td width="485" valign="top" class="column column-pad-left" style="width:48%;padding-right:12px;vertical-align:top;">

    <!-- Left Header Block -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
        <tr>
            <td align="center" style="padding:4px 0;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
                    <tr>
                        <td valign="middle">{logo}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td align="center" style="padding-top:4px;">
                <div style="font-size:24px;line-height:28px;font-weight:800;letter-spacing:-0.5px;color:#0f172a;">
                    HAPPY <span style="color:#006a66;">ANNIVERSARY</span>
                </div>
                <div style="width:80px;height:2px;background:linear-gradient(90deg, rgba(14,163,158,0) 0%, #0ea39e 50%, rgba(14,163,158,0) 100%);margin:8px auto 0 auto;font-size:0;line-height:0;">&nbsp;</div>
            </td>
        </tr>
    </table>

    <!-- Left Card Block (Employee Profile) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #ccfbf1;border-radius:16px;box-shadow:0px 10px 30px rgba(14,163,158,0.08);">
        <tr>
            <td align="center" valign="middle" style="padding:24px 18px;">

                <!-- Avatar Circle -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                        <td align="center" valign="middle" width="124" height="124" style="width:124px;height:124px;background:linear-gradient(45deg, #0ea39e 0%, #38bdf8 50%, #215092 100%);border-radius:62px;padding:5px;">
                            <table role="presentation" width="114" height="114" cellpadding="0" cellspacing="0" border="0" style="width:114px;height:114px;background-color:#ffffff;border-radius:57px;">
                                <tr>
                                    <td align="center" valign="middle"  width="114" height="114"  style="width:114px; height:114px; background-color:#f0fdfa; border:1px solid #ccfbf1; border-radius:50%; overflow:hidden;">
                                        {avatar_content}
                                    </td> 
                                    
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                <!-- Employee Details -->
                <div style="font-size:18px;line-height:24px;font-weight:700;color:#0f172a;padding-top:14px;">
                    {name}
                </div>
                <div style="font-size:13px;line-height:18px;font-weight:600;color:#006a66;padding-top:3px;">
                    {role} &bull; {department}
                </div>
                <div style="font-size:11px;line-height:15px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;padding-top:4px;">
                                {milestone}
                            </div>

                <div style="width:100%;max-width:280px;height:1px;background:linear-gradient(90deg, rgba(94,234,212,0) 0%, #5eead4 50%, rgba(94,234,212,0) 100%);margin:20px auto;font-size:0;line-height:0;">&nbsp;</div>

            
                <!-- Quote -->
                <div style="font-size:13px;line-height:20px;color:#334155;font-style:italic;font-weight:500;">
                    &ldquo;Another year of excellence.<br>
                    Another milestone achieved.<br>
                    Another reason to celebrate.&rdquo;
                </div>

            </td>
        </tr>
    </table>

</td>

<!--[if mso]>
</td><td valign="top" width="485">
<![endif]-->

<!-- ========================= RIGHT COLUMN ========================= -->
<td width="485" valign="top" class="column column-pad-right" style="width:48%;padding-left:12px;vertical-align:top;">

    <!-- Right Card Block (Main Celebration Details) -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #ccfbf1;border-radius:16px;box-shadow:0px 10px 30px rgba(14,163,158,0.08);">
        <tr>
            <td align="center" valign="middle" style="padding:36px 18px;">

                <!-- Subtitle Tag -->
                <div style="font-size:11px;font-weight:600;letter-spacing:1px;color:#0ea39e;text-transform:uppercase;margin-bottom:12px;">
                    &bull; ANNIVERSARY DEDICATION &bull;
                </div>

                <!-- Award Medal Graphic -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px auto;">
                    <tr>
                        <td align="center" valign="middle">
                            {medal_img}
                        </td>
                    </tr>
                </table>

                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:10px auto 14px auto;">
                <tr>
                    <td align="center" valign="middle">
                        <img src="https://dummyimage.com/330x56/215092/ffffff.png&text=CONGRATULATIONS" alt="CONGRATULATIONS" width="165" height="28" style="display:block;border:0;outline:none;text-decoration:none;">
                    </td>
                </tr>
            </table>

                <!-- Headline -->
                <div style="color:#0f172a;font-size:15px;line-height:22px;font-weight:600;margin-bottom:10px;">
                    &ldquo;Your dedication inspires us all.&rdquo;
                </div>

                <!-- Appreciation Message -->
                <div style="font-size:13px;line-height:22px;color:#334155;margin-bottom:24px;">
                    Thank you for your hard work, constant innovation, and for being an integral part of everything we build at {department_group}. You elevate the artistry of our team every day.
                </div>

                <!-- Signature Section -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;padding-top:16px;">
                    <tr>
                        <td align="center">
                            <div style="width:40px;height:2px;background:linear-gradient(90deg, rgba(14,163,158,0) 0%, #0ea39e 50%, rgba(14,163,158,0) 100%);margin-bottom:8px;font-size:0;line-height:0;">&nbsp;</div>
                            <div style="font-size:12px;font-weight:600;color:#006a66;margin-bottom:8px;">
                                Warm wishes from your team
                            </div>
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                                <tr>
                                    <td valign="middle" style="padding-right:6px;">
                                        {card_logo_swirl}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>

</td>

</tr>
</table>

<!--[if mso]>
</td></tr></table>
<![endif]-->

</td>
</tr>
</table>

</body>
</html>""" 

def _ordinal_year(years):
    """Return 1st, 2nd, 3rd, 4th, etc."""
    if 10 <= years % 100 <= 20:
        suffix = "th"
    else:
        suffix = {
            1: "st",
            2: "nd",
            3: "rd",
        }.get(years % 10, "th")

    return f"{years}{suffix}" 
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


def send_work_anniversary_wishes():  
    if not frappe.db.get_single_value("Teceze Settings", "work_anniversary"):
        frappe.logger("work_anniversary").info(
            "Work anniversary reminders are disabled in Teceze Settings. Skipping."
        )
        return "Work anniversary reminders disabled in Teceze Setting."
    today_date = getdate(today())

    employees = frappe.db.sql("""
        SELECT 
            name, 
            employee_name, 
            designation, 
            department, 
            company_email, 
            date_of_joining, 
            image 
        FROM `tabEmployee` 
        WHERE status = 'Active' 
            AND (employment_type IS NULL OR employment_type != 'Engineer') 
            AND date_of_joining IS NOT NULL
            AND MONTH(date_of_joining) = MONTH(CURDATE())
            AND DAY(date_of_joining) = DAY(CURDATE())
    """, as_dict=True)

    if not ASSET_ROOT.is_dir():
        frappe.throw(
            f"Anniversary email folder not found: {ASSET_ROOT}"
        )

    queued = 0
    skipped = 0
    failed = 0
    all_recipient=get_all_employees()
    for employee in employees:
        recipient = all_recipient
        doj = getdate(employee.date_of_joining)

        if doj.month == today_date.month and doj.day == today_date.day:
            years_completed = _completed_years(doj, today_date)

            if years_completed <= 0:
                skipped += 1
                frappe.logger("work_anniversary").info(
                    "Skipped anniversary for %s (%s) - 0 completed years",
                    employee.employee_name,
                    employee.name,
                )
                continue

            try:
                message = _anniversary_html(
                    employee,
                    today_date,
                    years_completed
                )

                ordinal_year = _ordinal_year(years_completed)

                subject = (
                    f"Happy {ordinal_year} Work Anniversary, "
                    f"{employee.employee_name}! 🎉"
                )
                if recipient != ["priya.ramesh@teceze.com"]:
                    frappe.logger("work_anniversary").warning(
                        "Email blocked: unauthorized recipient %s", recipient,
                    )
                    continue

                frappe.sendmail(
                    recipients=recipient,
                    subject=subject,
                    message=message
                )

                queued += 1

                frappe.logger("work_anniversary").info(
                    "Work anniversary email queued | "
                    "Employee: %s (%s) | "
                    "Recipient: %s | "
                    "Subject: %s",
                    employee.employee_name,
                    employee.name,
                    ", ".join(recipient),
                    subject,
                )

            except Exception:
                failed += 1
                frappe.log_error(
                    frappe.get_traceback(),
                    f"Work anniversary email failed: {employee.employee_name}",
                )

    return (
        f"Work anniversary emails processed: {len(employees)} | "
        f"queued: {queued} | "
        f"skipped: {skipped} | "
        f"failed: {failed}"
    )