import frappe
import requests
from frappe import _
from frappe.utils import getdate, nowdate, add_days, flt


CEO_ROLES = {"System Manager", "CEO"}
ALLOWED_ROLES = CEO_ROLES | {"Sales User", "Presales User", "Presales Manager"}

LEAD_FIELDS = [
    "name", "creation", "status", "lead_owner", "custom_client_company",
    "custom_amount", "custom_currency", "lead_name", "company_name",
]
OPPORTUNITY_FIELDS = [
    "name", "creation", "transaction_date", "expected_closing", "workflow_state",
    "status", "opportunity_owner", "custom_lead_owner", "custom_presales_owner",
    "custom_service_vertical", "opportunity_amount", "currency", "customer_name",
    "party_name", "probability", "custom_quotation_number", "billing_address_name",
]
QUOTATION_FIELDS = [
    "name", "creation", "transaction_date", "valid_till", "workflow_state",
    "status", "currency", "grand_total", "opportunity", "custom_service_vertical",
    "custom_opportunity_owner", "party_name", "customer_name", "docstatus", "billing_address_name",
]


def _require_dashboard_access():
    roles = set(frappe.get_roles(frappe.session.user))
    if not roles.intersection(ALLOWED_ROLES):
        frappe.throw(_("You do not have permission to access the CRM dashboard."), frappe.PermissionError)
    return bool(roles.intersection(CEO_ROLES))


def _date_range(from_date=None, to_date=None):
    end = getdate(to_date or nowdate())
    start = getdate(from_date or add_days(end, -89))
    if start > end:
        frappe.throw(_("From date cannot be after To date."))
    return start, end


def _read_records(doctype, fields, date_field, start, end, is_executive):
    # Datetime fields need an exclusive upper bound at midnight of the next day.
    # Using <= end on a Datetime field compares against 00:00:00 and drops most
    # records created later on the selected To date.
    meta = frappe.get_meta(doctype)
    date_df = meta.get_field(date_field)
    if date_df and date_df.fieldtype == "Datetime":
        filters = [
            [date_field, ">=", f"{start} 00:00:00"],
            [date_field, "<", f"{add_days(end, 1)} 00:00:00"],
        ]
    else:
        filters = [[date_field, ">=", start], [date_field, "<=", end]]

    # Only query fields that exist on this site's DocType. This also makes the
    # dashboard safer across custom-field differences between environments.
    available_fields = {df.fieldname for df in meta.fields}
    selected_fields = [field for field in fields if field in available_fields]
    if "name" not in selected_fields:
        selected_fields.insert(0, "name")

    # Executives get a company-wide view; other roles use Frappe's permission-aware list API.
    getter = frappe.get_all if is_executive else frappe.get_list
    return getter(
        doctype, filters=filters, fields=selected_fields, limit_page_length=5000,
        order_by=f"{date_field} desc"
    )


def _employee_name_map(user_ids, is_executive):
    user_ids = list({u for u in user_ids if u and u != "Administrator"})
    result = {}
    if not user_ids:
        return result

    # Prefer Employee.employee_name, matched through Employee.user_id.
    try:
        filters = {"user_id": ["in", user_ids], "status": "Active"}
        getter = frappe.get_all if is_executive else frappe.get_list
        employees = getter(
            "Employee", filters=filters,
            fields=["user_id", "employee_name"], limit_page_length=5000
        )
        for employee in employees:
            if employee.get("user_id") and employee.get("employee_name"):
                result[employee.user_id] = employee.employee_name
    except Exception:
        # A missing Employee permission/field must not break the dashboard.
        pass

    # For users without an Employee record, fall back to the Frappe User full name.
    missing = [u for u in user_ids if u not in result]
    for user_id in missing:
        try:
            full_name = frappe.db.get_value("User", user_id, "full_name")
            if full_name:
                result[user_id] = full_name
        except Exception:
            pass
    return result


def _add_owner_display_names(leads, opportunities, is_executive):
    user_ids = []
    for row in leads:
        user_ids.append(row.get("lead_owner"))
    for row in opportunities:
        user_ids.extend([
            row.get("opportunity_owner"),
            row.get("custom_lead_owner"),
            row.get("custom_presales_owner"),
        ])
    name_map = _employee_name_map(user_ids, is_executive)

    for row in leads:
        row["lead_owner_name"] = name_map.get(row.get("lead_owner"), row.get("lead_owner") or "")
    for row in opportunities:
        row["opportunity_owner_name"] = name_map.get(row.get("opportunity_owner"), row.get("opportunity_owner") or "")
        row["lead_owner_name"] = name_map.get(row.get("custom_lead_owner"), row.get("custom_lead_owner") or "")
        row["presales_owner_name"] = name_map.get(row.get("custom_presales_owner"), row.get("custom_presales_owner") or "")
    return name_map


def _get_lead_activities(lead_names, is_executive):
    if not lead_names:
        return []
    fields = ["parent", "activity_type", "subject", "description", "activity_date",
              "follow_up_date", "is_followup", "is_follow_completed"]
    filters = {"parent": ["in", lead_names], "parenttype": "Lead", "parentfield": "custom_activity_table"}
    if is_executive:
        return frappe.get_all("Lead Activity", filters=filters, fields=fields, limit_page_length=10000)
    return frappe.get_list("Lead Activity", filters=filters, fields=fields, limit_page_length=10000)



def _frankfurter_rate(source_currency, target_currency):
    """Return (rate, rate_date) from Frankfurter v2, cached for one hour."""
    source = (source_currency or "").upper().strip()
    target = (target_currency or "USD").upper().strip()
    if not source or not target:
        return None, None
    if source == target:
        return 1.0, None

    cache_key = f"crm_dashboard_fx:{source}:{target}"
    cache = frappe.cache()
    cached = cache.get_value(cache_key)
    if cached:
        try:
            return float(cached["rate"]), cached.get("date")
        except (KeyError, TypeError, ValueError):
            pass

    # Frankfurter is preferred, but it does not cover every currency used by
    # customers (notably some Asian/Middle Eastern currencies). Fall back to
    # the open.er-api daily rates and calculate a cross rate when needed.
    try:
        response = requests.get(
            f"https://api.frankfurter.dev/v2/rate/{source}/{target}", timeout=5,
        )
        response.raise_for_status()
        payload = response.json()
        rate = flt(payload.get("rate"))
        if rate > 0:
            result = {"rate": rate, "date": payload.get("date"), "provider": "Frankfurter"}
            cache.set_value(cache_key, result, expires_in_sec=3600)
            return rate, result.get("date")
    except Exception:
        pass

    try:
        response = requests.get(f"https://open.er-api.com/v6/latest/{source}", timeout=6)
        response.raise_for_status()
        payload = response.json()
        rates = payload.get("rates") or {}
        rate = flt(rates.get(target))
        if rate <= 0:
            # Cross-rate through USD when source->target is not directly present.
            source_to_usd = flt(rates.get("USD"))
            if source_to_usd > 0:
                usd_response = requests.get("https://open.er-api.com/v6/latest/USD", timeout=6)
                usd_response.raise_for_status()
                usd_rates = (usd_response.json() or {}).get("rates") or {}
                usd_to_target = flt(usd_rates.get(target))
                if usd_to_target > 0:
                    rate = source_to_usd * usd_to_target
        if rate <= 0:
            return None, None
        result = {"rate": rate, "date": payload.get("time_last_update_utc"), "provider": "ExchangeRate-API fallback"}
        cache.set_value(cache_key, result, expires_in_sec=3600)
        return rate, result.get("date")
    except Exception:
        frappe.log_error(title="CRM dashboard exchange-rate lookup failed", message=frappe.get_traceback())
        return None, None


def _date_key(value):
    if not value:
        return None
    try:
        return str(getdate(value))
    except Exception:
        return None


def _safe_sum_by_currency(rows, amount_field, currency_field):
    totals = {}
    for row in rows:
        currency = row.get(currency_field) or "UNKNOWN"
        totals[currency] = flt(totals.get(currency, 0)) + flt(row.get(amount_field))
    return {currency: round(value, 2) for currency, value in totals.items()}


def _billing_country(address_name=None, customer_name=None, is_executive=False):
    """Resolve billing country from a transaction billing address, then customer primary address."""
    address = address_name
    if not address and customer_name:
        try:
            address = frappe.db.get_value("Customer", customer_name, "customer_primary_address")
        except Exception:
            address = None
    if not address:
        return "Unknown country"
    try:
        country = frappe.db.get_value("Address", address, "country")
        return country or "Unknown country"
    except Exception:
        return "Unknown country"


@frappe.whitelist()
def get_dashboard_data(from_date=None, to_date=None, reporting_currency="USD", rates=None):
    """Return date-filtered CRM data. Rates are dashboard-only and never update transactions."""
    is_executive = _require_dashboard_access()
    start, end = _date_range(from_date, to_date)

    leads = _read_records("Lead", LEAD_FIELDS, "creation", start, end, is_executive)
    opportunities = _read_records("Opportunity", OPPORTUNITY_FIELDS, "transaction_date", start, end, is_executive)
    quotations = _read_records("Quotation", QUOTATION_FIELDS, "transaction_date", start, end, is_executive)

    # Do not assume every custom field exists in every installation; remove unknown fields by metadata.
    lead_names = [x.name for x in leads]
    activities = _get_lead_activities(lead_names, is_executive)
    employee_names = _add_owner_display_names(leads, opportunities, is_executive)

    if isinstance(rates, str):
        try:
            rates = frappe.parse_json(rates)
        except Exception:
            rates = {}
    rates = rates if isinstance(rates, dict) else {}
    reporting_currency = (reporting_currency or "USD").upper().strip()
    fx_meta = {}

    def convert(amount, source_currency):
        source_currency = (source_currency or "").upper().strip()
        target = reporting_currency
        if not source_currency:
            return None, False
        if source_currency == target:
            return flt(amount), True
        # User-entered dashboard override takes precedence over Frankfurter.
        manual_rate = rates.get(f"{source_currency}_{target}")
        if manual_rate not in (None, "") and flt(manual_rate) > 0:
            fx_meta[f"{source_currency}_{target}"] = {"rate": flt(manual_rate), "source": "Manual override", "date": None}
            return flt(amount) * flt(manual_rate), True
        rate, rate_date = _frankfurter_rate(source_currency, target)
        if not rate:
            return None, False
        fx_meta[f"{source_currency}_{target}"] = {"rate": rate, "source": "Frankfurter", "date": rate_date}
        return flt(amount) * rate, True

    lead_converted_total = 0
    lead_conversion_complete = True
    for lead in leads:
        value, ok = convert(lead.get("custom_amount"), lead.get("custom_currency"))
        if ok:
            lead_converted_total += flt(value)
        else:
            lead_conversion_complete = False

    quote_converted_total = 0
    quote_conversion_complete = True
    converted_quote_count = 0
    quote_currency_totals = _safe_sum_by_currency(quotations, "grand_total", "currency")
    for q in quotations:
        value, ok = convert(q.get("grand_total"), q.get("currency"))
        if ok:
            quote_converted_total += flt(value)
            converted_quote_count += 1
        else:
            quote_conversion_complete = False

    opp_converted_total = 0
    opp_conversion_complete = True
    for o in opportunities:
        value, ok = convert(o.get("opportunity_amount"), o.get("currency"))
        if ok:
            opp_converted_total += flt(value)
        else:
            opp_conversion_complete = False

    open_opportunities = [o for o in opportunities if (o.get("status") or "").lower() not in {"won", "lost", "converted", "closed"}]
    won = [o for o in opportunities if (o.get("workflow_state") or o.get("status") or "").lower() == "won"]
    lost = [o for o in opportunities if (o.get("workflow_state") or o.get("status") or "").lower() == "lost"]
    won_converted_total = 0
    won_conversion_complete = True
    for opportunity in won:
        value, ok = convert(opportunity.get("opportunity_amount"), opportunity.get("currency"))
        if ok:
            won_converted_total += flt(value)
        else:
            won_conversion_complete = False
    # Attach dashboard-only converted amounts to each opportunity record so all visible
    # charts and registers can use one selected reporting currency.
    for opportunity in opportunities:
        converted_value, converted_ok = convert(opportunity.get("opportunity_amount"), opportunity.get("currency"))
        opportunity["converted_opportunity_amount"] = round(flt(converted_value), 2) if converted_ok else None
    quoted_opportunity_names = {q.get("opportunity") for q in quotations if q.get("opportunity")}
    stage_counts = {}
    for o in opportunities:
        stage = o.get("workflow_state") or o.get("status") or "Unspecified"
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    verticals = {}
    stage_summary = {}
    country_summary = {}
    quotation_by_opportunity = {}
    for q in quotations:
        if q.get("opportunity"):
            quotation_by_opportunity.setdefault(q.get("opportunity"), q)
    for o in opportunities:
        converted_value, converted_ok = convert(o.get("opportunity_amount"), o.get("currency"))
        vertical = o.get("custom_service_vertical") or "Unassigned"
        entry = verticals.setdefault(vertical, {"opportunities": 0, "pipeline_value": 0.0, "value_complete": True, "won": 0, "quoted_opportunities": 0})
        entry["opportunities"] += 1
        if converted_ok:
            entry["pipeline_value"] += flt(converted_value)
        else:
            entry["value_complete"] = False
        stage = o.get("workflow_state") or o.get("status") or "Unspecified"
        stage_entry = stage_summary.setdefault(stage, {"count": 0, "value": 0.0, "value_complete": True})
        stage_entry["count"] += 1
        if converted_ok:
            stage_entry["value"] += flt(converted_value)
        else:
            stage_entry["value_complete"] = False
        q = quotation_by_opportunity.get(o.get("name"), {})
        country = _billing_country(q.get("billing_address_name"), o.get("customer_name") or o.get("party_name"), is_executive)
        country_entry = country_summary.setdefault(country, {"count": 0, "value": 0.0, "value_complete": True})
        country_entry["count"] += 1
        if converted_ok:
            country_entry["value"] += flt(converted_value)
        else:
            country_entry["value_complete"] = False
        if o in won:
            entry["won"] += 1
        if o.get("name") in quoted_opportunity_names:
            entry["quoted_opportunities"] += 1
    for group in (verticals, stage_summary, country_summary):
        for item in group.values():
            item["value"] = round(item.get("value", item.get("pipeline_value", 0.0)), 2)
            if "pipeline_value" in item:
                item["pipeline_value"] = round(item["pipeline_value"], 2)

    today = getdate(nowdate())
    followups = []
    for activity in activities:
        if not activity.get("isfollowup") or activity.get("is_follow_completed"):
            continue
        due = activity.get("follow_up_date")
        if not due:
            continue
        due_date = getdate(due)
        lead = next((x for x in leads if x.name == activity.parent), {})
        followups.append({
            "lead": activity.parent,
            "lead_name": lead.get("lead_name") or lead.get("company_name") or activity.parent,
            "subject": activity.get("subject") or activity.get("activity_type") or "Follow-up",
            "follow_up_date": str(due),
            "status": "Overdue" if due_date < today else ("Due today" if due_date == today else "Upcoming"),
            "owner": lead.get("lead_owner_name") or lead.get("lead_owner") or "",
        })

    # Date-wise counts and converted monetary values. The FX rate is the latest
    # available Frankfurter reference rate (or a dashboard manual override), not a
    # historical transaction-date rate. Amounts are converted before aggregation.
    daily = {}
    def add_daily(rows, date_field, amount_field, currency_field, prefix):
        for row in rows:
            day = _date_key(row.get(date_field))
            if not day:
                continue
            entry = daily.setdefault(day, {
                "date": day, "lead_count": 0, "lead_amount": 0.0, "lead_amount_complete": True,
                "opportunity_count": 0, "opportunity_amount": 0.0, "opportunity_amount_complete": True,
                "quotation_count": 0, "quotation_amount": 0.0, "quotation_amount_complete": True,
            })
            entry[f"{prefix}_count"] += 1
            converted, ok = convert(row.get(amount_field), row.get(currency_field))
            if ok:
                entry[f"{prefix}_amount"] += flt(converted)
            else:
                entry[f"{prefix}_amount_complete"] = False
    add_daily(leads, "creation", "custom_amount", "custom_currency", "lead")
    add_daily(opportunities, "transaction_date", "opportunity_amount", "currency", "opportunity")
    add_daily(quotations, "transaction_date", "grand_total", "currency", "quotation")
    daily_trend = []
    for day in sorted(daily):
        entry = daily[day]
        for prefix in ("lead", "opportunity", "quotation"):
            if entry[f"{prefix}_amount_complete"]:
                entry[f"{prefix}_amount"] = round(entry[f"{prefix}_amount"], 2)
            else:
                entry[f"{prefix}_amount"] = None
        daily_trend.append(entry)

    return {
        "period": {"from_date": str(start), "to_date": str(end)},
        "reporting_currency": reporting_currency,
        "daily_trend": daily_trend,
        "leads": {
            "count": len(leads),
            "status_counts": _count_by(leads, "status"),
            "amount_by_currency": _safe_sum_by_currency(leads, "custom_amount", "custom_currency"),
            "converted_amount": round(lead_converted_total, 2) if lead_conversion_complete else None,
            "conversion_complete": lead_conversion_complete,
            "records": leads[:100],
        },
        "opportunities": {
            "count": len(opportunities),
            "open_count": len(open_opportunities),
            "won_count": len(won),
            "won_converted_total": round(won_converted_total, 2) if won_conversion_complete else None,
            "won_conversion_complete": won_conversion_complete,
            "lost_count": len(lost),
            "win_rate": round((len(won) / (len(won) + len(lost)) * 100), 1) if won or lost else 0,
            "stage_counts": stage_counts,
            "stage_summary": stage_summary,
            "billing_country_summary": country_summary,
            "amount_by_currency": _safe_sum_by_currency(opportunities, "opportunity_amount", "currency"),
            "converted_amount": round(opp_converted_total, 2) if opp_conversion_complete else None,
            "conversion_complete": opp_conversion_complete,
            "records": opportunities[:200],
            "verticals": verticals,
        },
        "quotations": {
            "count": len(quotations),
            "amount_by_currency": quote_currency_totals,
            "converted_amount": round(quote_converted_total, 2) if quote_conversion_complete else None,
            "conversion_complete": quote_conversion_complete,
            "converted_count": converted_quote_count,
            "records": quotations[:200],
        },
        "followups": sorted(followups, key=lambda x: x["follow_up_date"]),
        "meta": {
            "is_executive": is_executive,
            "rates_used": rates,
            "fx_rates": fx_meta,
            "fx_provider": "Frankfurter API v2 (latest available daily reference rates); manual dashboard overrides take precedence.",
            "employee_names": employee_names,
            "note": "Dashboard-only conversion rates. Missing rates prevent a complete converted total. Historical date trends use the latest available rate, not the rate on each transaction date."
        },
    }


def _count_by(rows, field):
    counts = {}
    for row in rows:
        value = row.get(field) or "Unspecified"
        counts[value] = counts.get(value, 0) + 1
    return counts
