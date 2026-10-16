
import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime
from frappe.utils.jinja import render_template
from frappe.utils import escape_html


PARENT_DOCTYPE = "Opportunity"
CHILD_DOCTYPE = "Clarification Log"
TABLE_FIELD = "custom_clarifications"

RAISER_ROLE = "Clarification Raiser"
RESPONDER_ROLE = "Responder"

WAITING = "Waiting"
ANSWERED = "Answered"
SLA_BREACH = "SLA Breach"
SLA_HOURS = 2

CHILD_FIELDS = (
    "message",
    "is_clarification",
    "parent_clarification",
    "status",
)


def require_role(role):
    if role not in frappe.get_roles(frappe.session.user):
        frappe.throw(
            _("You do not have permission to perform this action."),
            frappe.PermissionError,
        )


def get_opportunity(name, write=False):
    doc = frappe.get_doc(PARENT_DOCTYPE, name)
    doc.check_permission("write" if write else "read")
    return doc


def get_clarification(doc, clarification_name):
    for row in doc.get(TABLE_FIELD) or []:
        if row.name == clarification_name and row.is_clarification:
            return row

    frappe.throw(_("Clarification not found."))


def has_response(doc, clarification_name):
    return any(
        not row.is_clarification
        and row.parent_clarification == clarification_name
        for row in doc.get(TABLE_FIELD) or []
    )


def save_clarification_update(doc):
    # This flag is set only by trusted server-side methods below.
    # It allows their controlled child-table updates through validation.
    doc.flags.clarification_api_update = True
    doc.save()


def validate_opportunity_clarifications(doc, method=None):
    #Dharshini/Jeci
    # if doc.workflow_state == "Presales Assessment":
    #     send_email_for_manager(doc)

    """Prevent direct child-table modifications through ordinary Opportunity saves."""
    if doc.flags.get("clarification_api_update"):
        return

    old_doc = doc.get_doc_before_save()

    if not old_doc:
        if doc.get(TABLE_FIELD):
            frappe.throw(
                _("Clarifications must be created through the clarification interface.")
            )
        return

    old_rows = {
        row.name: row
        for row in old_doc.get(TABLE_FIELD) or []
    }
    new_rows = {
        row.name: row
        for row in doc.get(TABLE_FIELD) or []
    }

    # Reject direct additions and deletions.
    if set(old_rows) != set(new_rows):
        frappe.throw(
            _("Use the clarification interface to modify clarification records.")
        )

    # Reject direct changes to protected fields.
    for name, old_row in old_rows.items():
        new_row = new_rows[name]

        for fieldname in CHILD_FIELDS:
            if old_row.get(fieldname) != new_row.get(fieldname):
                frappe.throw(
                    _("Use the clarification interface to modify clarification records.")
                )


@frappe.whitelist()
def get_threads(opportunity):
    doc = get_opportunity(opportunity)

    rows = doc.get(TABLE_FIELD) or []
    responses = {}

    for row in rows:
        if not row.is_clarification and row.parent_clarification:
            responses[row.parent_clarification] = row

    threads = []

    for row in rows:
        if not row.is_clarification:
            continue

        response = responses.get(row.name)

        threads.append({
            "name": row.name,
            "message": row.message,
            "owner": row.owner,
            "creation": row.creation,
            "status": row.status or WAITING,
            "response": ({
                "name": response.name,
                "message": response.message,
                "owner": response.owner,
                "creation": response.creation,
            } if response else None),
        })

    return threads


@frappe.whitelist()
def create_clarification(opportunity, message):
    require_role(RAISER_ROLE)

    message = (message or "").strip()
    if not message:
        frappe.throw(_("Clarification message is required."))

    doc = get_opportunity(opportunity, write=True)

    row = doc.append(TABLE_FIELD, {
        "message": message,
        "is_clarification": 1,
        "status": WAITING,
    })

    save_clarification_update(doc)

    return {"name": row.name, "status": WAITING}


@frappe.whitelist()
def update_clarification(opportunity, clarification_name, message):
    require_role(RAISER_ROLE)

    message = (message or "").strip()
    if not message:
        frappe.throw(_("Clarification message is required."))

    doc = get_opportunity(opportunity, write=True)
    row = get_clarification(doc, clarification_name)

    if row.status == ANSWERED or has_response(doc, row.name):
        frappe.throw(_("Answered clarifications cannot be edited."))

    row.message = message
    save_clarification_update(doc)

    return {"name": row.name, "status": row.status}


@frappe.whitelist()
def submit_response(opportunity, clarification_name, message):
    require_role(RESPONDER_ROLE)

    message = (message or "").strip()
    if not message:
        frappe.throw(_("Response is required."))

    doc = get_opportunity(opportunity, write=True)
    clarification = get_clarification(doc, clarification_name)

    if clarification.owner == frappe.session.user:
        frappe.throw(
            _("The user who raised a clarification cannot respond to it.")
        )

    if clarification.status == ANSWERED or has_response(doc, clarification.name):
        frappe.throw(_("This clarification has already been answered."))

    response = doc.append(TABLE_FIELD, {
        "message": message,
        "is_clarification": 0,
        "parent_clarification": clarification.name,
    })

    clarification.status = ANSWERED

    save_clarification_update(doc)

    return {"name": response.name, "status": ANSWERED}


def update_sla_statuses():
    """Scheduled job: flag unanswered clarifications older than two hours."""
    cutoff = add_to_date(now_datetime(), hours=-SLA_HOURS)

    overdue = frappe.get_all(
        CHILD_DOCTYPE,
        filters={
            "parenttype": PARENT_DOCTYPE,
            "parentfield": TABLE_FIELD,
            "is_clarification": 1,
            "status": WAITING,
            "creation": ["<", cutoff],
        },
        fields=["name", "parent"],
        order_by="creation asc",
    )

    processed = set()

    for item in overdue:
        if item.parent in processed:
            continue

        processed.add(item.parent)

        try:
            doc = frappe.get_doc(PARENT_DOCTYPE, item.parent)
            changed = False

            for row in doc.get(TABLE_FIELD) or []:
                if (
                    row.is_clarification
                    and row.status == WAITING
                    and get_datetime(row.creation) < get_datetime(cutoff)
                    and not has_response(doc, row.name)
                ):
                    row.status = SLA_BREACH
                    changed = True

            if changed:
                save_clarification_update(doc)

        except Exception:
            frappe.log_error(
                title="Clarification SLA Update Failed",
                message=frappe.get_traceback(),
            )


@frappe.whitelist()
def send_email_for_manager(doc):
    # 1. Get Service Vertical from Opportunity
    service_vertical = doc.get("custom_service_vertical")

    if not service_vertical:
        return

    # 2. Get Department from Service Vertical
    department = frappe.db.get_value(
        "Service Vertical",
        service_vertical,
        "department"
    )

    if not department:
        return

    # 3. Get active Presales Managers in this department
    managers = frappe.db.sql(
        """
        SELECT DISTINCT
            COALESCE(NULLIF(e.company_email, ''), u.email) AS email
        FROM `tabEmployee` e
        INNER JOIN `tabUser` u
            ON u.name = e.user_id
        INNER JOIN `tabHas Role` hr
            ON hr.parent = u.name
            AND hr.parenttype = 'User'
            AND hr.role = 'Presales Manager'
        WHERE e.department = %(department)s
            AND e.status = 'Active'
            AND u.enabled = 1
        """,
        {"department": department},
        as_dict=True
    )

    # recipients = list({
    #     row.email for row in managers if row.email
    # })
    recipients = ['jecintha.mary@teceze.com']
    if not recipients:
        frappe.log_error(
            title="Presales Notification",
            message=f"No Presales Managers found for {department}"
        )
        return

    # 4. Get Opportunity Owner's full name
    opportunity_owner = doc.get("opportunity_owner")

    owner_name = (
        frappe.db.get_value(
            "User",
            opportunity_owner,
            "full_name"
        )
        if opportunity_owner else None
    ) or opportunity_owner or ""

    # 5. Prepare safe HTML values
    opportunity_name = escape_html(str(doc.name or ""))
    customer_name = escape_html(str(doc.get("customer_name") or ""))
    vertical_name = escape_html(str(service_vertical))
    department_name = escape_html(str(department))
    sender_name = escape_html(str(owner_name))

    # 6. Build HTML email content directly in Python
    subject = f"New Opportunity - Presales Assessment: {doc.name}"

    message = f"""
    <div style="font-family: Arial, Helvetica, sans-serif;
                background-color: #f5f7fa; padding: 30px 15px;">
      <div style="max-width: 650px; margin: 0 auto;
                  background-color: #ffffff;
                  border: 1px solid #e2e8f0; border-radius: 8px;
                  overflow: hidden;">

        <div style="background-color: #12344d; padding: 20px 25px;">
          <h2 style="margin: 0; color: #ffffff; font-size: 20px;">
            New Opportunity – Presales Assessment
          </h2>
        </div>

        <div style="padding: 25px; color: #334155;
                    font-size: 14px; line-height: 1.6;">

          <p>Dear Presales Manager,</p>

          <p>
            A new Opportunity has been submitted by the Sales team
            and is ready for Presales Assessment.
          </p>

          <div style="background-color: #eef6f8;
                      border-left: 4px solid #168aad;
                      padding: 10px 14px;">
            <strong>Opportunity Details</strong>
          </div>

          <table style="width: 100%; border-collapse: collapse;
                        font-size: 14px;">
            <tr>
              <td style="padding: 10px; background: #f8fafc;">
                <strong>Opportunity ID</strong>
              </td>
              <td style="padding: 10px;">{opportunity_name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc;">
                <strong>Customer</strong>
              </td>
              <td style="padding: 10px;">{customer_name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc;">
                <strong>Service Vertical</strong>
              </td>
              <td style="padding: 10px;">{vertical_name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc;">
                <strong>Department</strong>
              </td>
              <td style="padding: 10px;">{department_name}</td>
            </tr>
          </table>

          <p>
            Please review the Opportunity details and proceed with
            the necessary presales assessment.
          </p>

          <p>
            Regards,<br>
            <strong>{sender_name}</strong>
          </p>
        </div>

        <div style="background: #f8fafc; padding: 12px 25px;
                    text-align: center; font-size: 11px;
                    color: #64748b;">
          Automated notification from TECEZE Portal.
          Please do not reply to this email.
        </div>

      </div>
    </div>
    """

    # 7. Send HTML email using Frappe
    frappe.sendmail(
        recipients=recipients,
        subject=subject,
        message=message,
        reference_doctype=doc.doctype,
        reference_name=doc.name,
        now=True
    )


