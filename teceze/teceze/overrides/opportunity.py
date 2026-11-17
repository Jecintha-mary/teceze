# apps/teceze/teceze/overrides/opportunity.py
import frappe
from frappe.utils import flt

CLOSED_STATUSES = ("Converted", "Lost", "Closed")


@frappe.whitelist()
def get_opportunity_dashboard():
    """Pipeline value + workflow-state-wise counts and values (respects permissions)."""

    rows = frappe.get_list(
        "Opportunity",
        fields=[
            "workflow_state",
            "status",
            "opportunity_amount",
            "base_opportunity_amount",
            "conversion_rate",
        ],
        limit_page_length=0,
    )

    states = {}
    total_value = 0.0
    pipeline_value = 0.0
    open_count = 0

    for r in rows:
        key = r.workflow_state or r.status or "Unknown"

        # company-currency value (falls back to amount x conversion rate)
        value = flt(r.base_opportunity_amount) or (
            flt(r.opportunity_amount) * (flt(r.conversion_rate) or 1)
        )

        s = states.setdefault(key, {"count": 0, "value": 0.0})
        s["count"] += 1
        s["value"] += value
        total_value += value

        if r.status not in CLOSED_STATUSES:
            pipeline_value += value
            open_count += 1

    return {
        "total": len(rows),
        "total_value": total_value,
        "pipeline_value": pipeline_value,
        "open_count": open_count,
        "states": states,
    }



import frappe

def send_presales_assessment_notification(doc, method=None):
    frappe.log_error('ssssssssssssssssssss')
    # Trigger only when workflow state changes
    if doc.workflow_state != "Presales Assessment":
        return
    # Fetch employees matching your condition
   # 1. Get Service Vertical from Opportunity
    service_vertical = doc.get("custom_service_vertical")
    frappe.log_error
    if not service_vertical:
        return

    # 2. Get Department from Service Vertical master
    department = frappe.db.get_value(
        "Service Vertical",
        service_vertical,
        "department"
    )
    frappe.log_error('department: ' + str(department))

    if not department:
        return

    # 3. Get users having Presales Manager role
    presales_users = frappe.get_all(
        "Has Role",
        filters={
            "role": "Presales Manager",
            "parenttype": "User",
            "parentfield": "roles"
        },
        pluck="parent"
    )
    frappe.log_error('presales_users: ' + str(presales_users))
    if not presales_users:
        return

    # 4. Get active employees matching department and role
    employees = frappe.get_all(
        "Employee",
        filters={
            "status": "Active",
            "department": department,
            "user_id": ["in", presales_users]
        },
        fields=["user_id", "employee_name", "department"]
    )
    frappe.log_error('employees: ' + str(employees))
    # 5. Prepare recipients
    recipients = list({
        employee.user_id
        for employee in employees
        if employee.user_id
        and frappe.db.get_value("User", employee.user_id, "enabled")
    })

    if not recipients:
        return

    subject = f"New Opportunity – Presales Assessment – {doc.name}"

    message = f"""
    <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f5f7fa; padding: 30px 15px;">
      <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #12344d; padding: 20px 25px;">
          <h2 style="margin: 0; color: #ffffff; font-size: 20px;">New Opportunity – Presales Assessment</h2>
        </div>

        <div style="padding: 25px; color: #334155; font-size: 14px; line-height: 1.6;">
          <p>Dear Presales Team,</p>

          <p>A new opportunity has been submitted by the Sales team and is ready for Presales Assessment.</p>

          <div style="background-color: #eef6f8; border-left: 4px solid #168aad; padding: 10px 14px;">
            <strong>Opportunity Details</strong>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 10px; background: #f8fafc;"><strong>Opportunity ID</strong></td>
              <td style="padding: 10px;">{frappe.utils.escape_html(doc.name)}</td>
            </tr>
          </table>

          <p>Please review the opportunity details and proceed with the necessary presales assessment.</p>

          <p>
            Regards,<br>
            <strong>{frappe.utils.escape_html(frappe.db.get_value("User", doc.get("opportunity_owner"), "full_name") or doc.get("opportunity_owner") or "")}</strong>
          </p>
        </div>

        <div style="background: #f8fafc; padding: 12px 25px; text-align: center; font-size: 11px; color: #94a3b8;">
          Automated notification from TECEZE Portal. Please do not reply to this email.
        </div>
      </div>
    </div>
    """

    frappe.sendmail(
        recipients=recipients,
        subject=subject,
        message=message,
        reference_doctype=doc.doctype,
        reference_name=doc.name
    )