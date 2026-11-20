import frappe

import requests
import calendar

from frappe.utils import add_days, getdate, nowdate, get_first_day, get_last_day, flt

PAGE_SIZE = 1000

def _date_window(period):

    """Return the reporting window and trend bucket format."""

    today = getdate(nowdate())

    if period == "daily":

        start = today

        end = today

        bucket = "hour"

    elif period == "weekly":

        start = add_days(today, -6)

        end = today

        bucket = "day"

    elif period == "quarterly":

        current_quarter_month = ((today.month - 1) // 3) *3 + 1

        quarter_index = today.year *4 + ((current_quarter_month - 1) // 3)

        first_index = quarter_index - 3

        start_year, start_quarter_zero = divmod(first_index, 4)

        start_month = start_quarter_zero *3 + 1

        start = getdate(f"{start_year}-{start_month:02d}-01")

        end = today

        bucket = "quarter"

    else:

        # Monthly view: rolling six calendar months including this month.

        this_month = get_first_day(today)

        start = add_days(this_month, -150)

        start = get_first_day(start)

        end = today

        bucket = "month"

    return start, end, bucket

def _fields_for(doctype, requested):

    meta = frappe.get_meta(doctype)

    available = {df.fieldname for df in meta.fields}

    available.update({"name", "owner", "creation", "modified", "docstatus"})

    return [field for field in requested if field in available]

def _fetch_permitted(doctype, requested_fields, date_field, start_date, end_date):

    """Fetch every matching row through permission-aware get_list pagination."""

    if not frappe.db.exists("DocType", doctype):

        return []

    meta = frappe.get_meta(doctype)

    date_df = meta.get_field(date_field)

    if not date_df:

        date_field = "creation"

        date_df = meta.get_field(date_field)

    fields = _fields_for(doctype, requested_fields)

    if "name" not in fields:

        fields.insert(0, "name")

    if date_df and date_df.fieldtype == "Datetime":

        filters = [

            [date_field, ">=", f"{start_date} 00:00:00"],

            [date_field, "<", f"{add_days(end_date, 1)} 00:00:00"],

        ]

    else:

        filters = [

            [date_field, ">=", start_date],

            [date_field, "<=", end_date],

        ]

    rows = []

    start = 0

    while True:

        batch = frappe.get_list(

            doctype,

            filters=filters,

            fields=fields,

            order_by=f"{date_field} desc",

            start=start,

            page_length=PAGE_SIZE,

        )

        rows.extend(batch)

        if len(batch) < PAGE_SIZE:

            break

        start += PAGE_SIZE

    return rows

def _outcome(row):

    """Recognise common workflow labels such as Won, Closed Won and Lost."""

    workflow = (row.get("workflow_state") or "").strip().lower()

    status = (row.get("status") or "").strip().lower()

    if workflow.endswith("won") or status == "won":

        return "won"

    if workflow.endswith("lost") or status == "lost":

        return "lost"

    return "open"

def _currency_totals(rows, amount_field):

    totals = {}

    for row in rows:

        currency = (row.get("currency") or "Unspecified").strip()

        totals[currency] = totals.get(currency, 0) + flt(row.get(amount_field))

    return {key: round(value, 2) for key, value in totals.items()}

def _frankfurter_rate(source_currency, target_currency="USD"):

    """Return (rate, rate_date) with a one-hour cache."""

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

    # Primary provider: Frankfurter.

    try:

        response = requests.get(

            f"https://api.frankfurter.dev/v2/rate/{source}/{target}",

            timeout=5,

        )

        response.raise_for_status()

        payload = response.json()

        rate = flt(payload.get("rate"))

        if rate > 0:

            result = {

                "rate": rate,

                "date": payload.get("date"),

                "provider": "Frankfurter",

            }

            cache.set_value(cache_key, result, expires_in_sec=3600)

            return rate, result.get("date")

    except Exception:

        pass

    # Fallback provider: ExchangeRate-API, including USD cross-rate.

    try:

        response = requests.get(

            f"https://open.er-api.com/v6/latest/{source}",

            timeout=6,

        )

        response.raise_for_status()

        payload = response.json()

        rates = payload.get("rates") or {}

        rate = flt(rates.get(target))

        if rate <= 0:

            source_to_usd = flt(rates.get("USD"))

            if source_to_usd > 0:

                usd_response = requests.get(

                    "https://open.er-api.com/v6/latest/USD",

                    timeout=6,

                )

                usd_response.raise_for_status()

                usd_rates = (usd_response.json() or {}).get("rates") or {}

                usd_to_target = flt(usd_rates.get(target))

                if usd_to_target > 0:

                    rate = source_to_usd *usd_to_target

        if rate <= 0:

            return None, None

        result = {

            "rate": rate,

            "date": payload.get("time_last_update_utc"),

            "provider": "ExchangeRate-API fallback",

        }

        cache.set_value(cache_key, result, expires_in_sec=3600)

        return rate, result.get("date")

    except Exception:

        frappe.log_error(

            title="CRM dashboard exchange-rate lookup failed",

            message=frappe.get_traceback(),

        )

        return None, None

def _convert_currency_map_to_usd(currency_totals):

    """Convert a currency-to-amount map into a single USD total."""

    usd_total = 0.0

    conversions = {}

    unconverted = {}

    for currency, amount in (currency_totals or {}).items():

        currency = (currency or "").upper().strip()

        amount = flt(amount)

        if not currency or currency == "UNSPECIFIED":

            unconverted[currency or "Unspecified"] = round(amount, 2)

            continue

        rate, rate_date = _frankfurter_rate(currency, "USD")

        if not rate or rate <= 0:

            unconverted[currency] = round(amount, 2)

            continue

        converted_amount = amount *rate

        usd_total += converted_amount

        conversions[currency] = {

            "source_amount": round(amount, 2),

            "rate_to_usd": rate,

            "usd_amount": round(converted_amount, 2),

            "rate_date": rate_date,

        }

    return round(usd_total, 2), conversions, unconverted

def _currency_totals_usd(rows, amount_field):

    source_totals = _currency_totals(rows, amount_field)

    usd_total, conversions, unconverted = _convert_currency_map_to_usd(

        source_totals

    )

    return {

        "usd_total": usd_total,

        "source_totals": source_totals,

        "conversions": conversions,

        "unconverted": unconverted,

    }

def _display_name_map(opportunities):

    """Use visible Employee records for labels; fall back to user IDs."""

    user_ids = sorted({

        row.get("opportunity_owner")

        for row in opportunities

        if row.get("opportunity_owner")

    })

    names = {user_id: user_id for user_id in user_ids}

    if not user_ids or not frappe.db.exists("DocType", "Employee"):

        return names

    try:

        employee_fields = _fields_for(

            "Employee", ["user_id", "employee_name", "status"]

        )

        if "user_id" not in employee_fields:

            return names

        employees = frappe.get_list(

            "Employee",

            filters={

                "user_id": ["in", user_ids],

                "status": "Active",

            },

            fields=employee_fields,

            page_length=2000,

        )

        for employee in employees:

            if employee.get("user_id") and employee.get("employee_name"):

                names[employee["user_id"]] = employee["employee_name"]

    except frappe.PermissionError:

        # Employee names are optional; never bypass Employee permissions.

        pass

    return names

def _bucket_key(value, bucket):

    if not value:

        return None

    date_value = getdate(value)

    if bucket == "hour":

        # Date-only transaction fields have no hour component.

        return "Today"

    if bucket == "day":

        return date_value.strftime("%a")

    if bucket == "quarter":

        quarter = ((date_value.month - 1) // 3) + 1

        return f"Q{quarter} {date_value.year}"

    return date_value.strftime("%b %Y")

def _trend_data(opportunities, bucket):

    """Closed opportunity counts by period, split into Won and Lost."""

    labels = []

    if bucket == "hour":

        labels = ["Today"]

    elif bucket == "day":

        from datetime import timedelta

        today = getdate(nowdate())

        labels = [

            (today - timedelta(days=offset)).strftime("%a")

            for offset in range(6, -1, -1)

        ]

    elif bucket == "quarter":

        today = getdate(nowdate())

        current_q = ((today.month - 1) // 3) + 1

        q_index = today.year *4 + current_q - 1

        for offset in range(3, -1, -1):

            index = q_index - offset

            year, q_zero = divmod(index, 4)

            labels.append(f"Q{q_zero + 1} {year}")

    else:

        today = getdate(nowdate())

        month_index = today.year *12 + today.month - 1

        for offset in range(5, -1, -1):

            index = month_index - offset

            year, month_zero = divmod(index, 12)

            import calendar

            labels.append(calendar.month_abbr[month_zero + 1] + f" {year}")

    values = {

        label: {"won": 0, "lost": 0}

        for label in labels

    }

    for row in opportunities:

        outcome = _outcome(row)

        if outcome not in {"won", "lost"}:

            continue

        label = _bucket_key(

            row.get("transaction_date") or row.get("creation"),

            bucket,

        )

        if label in values:

            values[label][outcome] += 1

    return {

        "categories": labels,

        "won": [values[label]["won"] for label in labels],

        "lost": [values[label]["lost"] for label in labels],

    }

def _lead_status_data(leads):

    counts = {}

    for lead in leads:

        status = (lead.get("status") or "").strip() or "Unspecified"

        counts[status] = counts.get(status, 0) + 1

    return [

        {"name": status, "value": count}

        for status, count in sorted(

            counts.items(), key=lambda item: (-item[1], item[0].lower())

        )

    ]

def _team_performance(opportunities, name_map):

    grouped = {}

    for row in opportunities:

        owner = row.get("opportunity_owner")

        if not owner:

            continue

        entry = grouped.setdefault(owner, {

            "user_id": owner,

            "salesperson": name_map.get(owner, owner),

            "assigned": 0,

            "won": 0,

            "lost": 0,

            "open": 0,

            "pipeline_by_currency": {},

        })

        entry["assigned"] += 1

        outcome = _outcome(row)

        if outcome == "won":

            entry["won"] += 1

        elif outcome == "lost":

            entry["lost"] += 1

        else:

            entry["open"] += 1

            currency = (row.get("currency") or "Unspecified").strip()

            entry["pipeline_by_currency"][currency] = (

                entry["pipeline_by_currency"].get(currency, 0)

                + flt(row.get("opportunity_amount"))

            )

    result = []

    for entry in grouped.values():

        closed = entry["won"] + entry["lost"]

        entry["win_rate"] = round(entry["won"] / closed *100, 1) if closed else 0

        source_currency_totals = {

            key: round(value, 2)

            for key, value in entry["pipeline_by_currency"].items()

        }

        usd_total, conversions, unconverted = _convert_currency_map_to_usd(

            source_currency_totals

        )

        # Keep source values for traceability, but expose the display

        # amount as USD so the dashboard does not mix currencies.

        entry["pipeline_by_currency_original"] = source_currency_totals

        entry["pipeline_by_currency"] = {"USD": usd_total}

        entry["pipeline_value_usd"] = usd_total

        entry["pipeline_currency_conversions"] = conversions

        entry["pipeline_unconverted"] = unconverted

        result.append(entry)

    return sorted(

        result,

        key=lambda row: (-row["assigned"], row["salesperson"].lower()),

    )

def _top_opportunities(opportunities, name_map):

    rows = sorted(

        opportunities,

        key=lambda row: flt(row.get("opportunity_amount")),

        reverse=True,

    )[:5]

    return [{

        "name": row.get("name"),

        "customer": row.get("customer_name") or row.get("party_name") or "-",

        "salesperson": name_map.get(

            row.get("opportunity_owner"),

            row.get("opportunity_owner") or "-",

        ),

        "amount": flt(row.get("opportunity_amount")),

        "currency": row.get("currency") or "",

        "stage": row.get("workflow_state") or row.get("status") or "-",

        "expected_closing": str(row.get("expected_closing") or "-"),

        "status": row.get("status") or "-",

    } for row in rows]

def _quotation_updates(quotations, opportunity_owner_map, name_map):

    rows = sorted(

        quotations,

        key=lambda row: str(row.get("modified") or row.get("creation") or ""),

        reverse=True,

    )[:5]

    result = []

    for row in rows:

        owner = (

            row.get("custom_opportunity_owner")

            or opportunity_owner_map.get(row.get("opportunity"))

        )

        result.append({

            "name": row.get("name"),

            "customer": row.get("customer_name") or row.get("party_name") or "-",

            "opportunity": row.get("opportunity") or "-",

            "amount": flt(row.get("grand_total")),

            "currency": row.get("currency") or "",

            "created": str(row.get("creation") or "-")[:10],

            "salesperson": name_map.get(owner, owner or "-"),

            "status": row.get("workflow_state") or row.get("status") or "-",

        })

    return result


def _sales_performance_data(period, start_date, end_date, bucket, opportunities):
    """Build USD target and completed sales series for the selected dashboard period.

    Sales Target Assignment is permission-filtered through frappe.get_list.
    Sales Amount targets use Monthly targets for daily/weekly/monthly views and
    Quarterly targets for quarterly view. Targets are prorated by active calendar
    days so partial weeks/months/quarters compare fairly with won opportunities.
    """
    categories = _trend_data(opportunities, bucket).get("categories", [])
    target_values = {label: 0.0 for label in categories}
    completed_values = {label: 0.0 for label in categories}

    # Load only target assignments the current user is permitted to read.
    assignments = []
    if frappe.db.exists("DocType", "Sales Target Assignment"):
        try:
            
            assignments = frappe.get_list(
                "Sales Target Assignment",
                filters=[
                    ["start_date", "<=", end_date],
                    ["to_date", ">=", start_date],
                ],
                fields=["name", "sales_person", "start_date", "to_date"],
                page_length=0,
            )
        except frappe.PermissionError:
            # A user without target-assignment read permission still gets
            # the rest of the dashboard; no permission bypass is attempted.
            assignments = []

    target_period = "Quarterly" if period == "quarterly" else "Monthly"

    for assignment in assignments:
        try:
            # Parent permission was checked by get_list above. get_doc is used
            # only to read its configured child-table rows.
            assignment_doc = frappe.get_doc(
                "Sales Target Assignment", assignment.name
            )
        except (frappe.PermissionError, frappe.DoesNotExistError):
            continue
        except Exception:
            frappe.log_error(
                title="Sales dashboard target assignment read failed",
                message=frappe.get_traceback(),
            )
            continue

        assignment_start = getdate(assignment.get("start_date"))
        assignment_end = getdate(assignment.get("to_date"))
        active_start = max(start_date, assignment_start)
        active_end = min(end_date, assignment_end)
        if active_start > active_end:
            continue

        # Select one target row for the requested frequency. Do not add
        # Monthly + Quarterly + Half-Yearly + Yearly rows together.
        selected_detail = None
        for detail in assignment_doc.get("target_details") or []:
            if (detail.get("target_type") or "").strip().lower() != "sales amount":
                continue
            if (detail.get("period_type") or "").strip().lower() != target_period.lower():
                continue
            selected_detail = detail
            break

        if not selected_detail:
            continue

        currency = (selected_detail.get("currency") or "USD").upper().strip()
        rate, _rate_date = _frankfurter_rate(currency, "USD")
        if not rate or rate <= 0:
            continue

        period_target = flt(selected_detail.get("target_value")) * rate
        current_day = active_start

        while current_day <= active_end:
            label = _bucket_key(current_day, bucket)
            if label in target_values:
                if target_period == "Monthly":
                    days_in_target_period = calendar.monthrange(
                        current_day.year, current_day.month
                    )[1]
                else:
                    quarter_start_month = ((current_day.month - 1) // 3) * 3 + 1
                    days_in_target_period = sum(
                        calendar.monthrange(current_day.year, month)[1]
                        for month in range(quarter_start_month, quarter_start_month + 3)
                    )

                target_values[label] += period_target / days_in_target_period
            current_day = add_days(current_day, 1)

    # Completed sales = Won Opportunity Amount, grouped into the same buckets.
    for opportunity in opportunities:
        if _outcome(opportunity) != "won":
            continue

        opportunity_date = getdate(
            opportunity.get("transaction_date") or opportunity.get("creation")
        )
        label = _bucket_key(opportunity_date, bucket)
        if label not in completed_values:
            continue

        currency = (opportunity.get("currency") or "USD").upper().strip()
        rate, _rate_date = _frankfurter_rate(currency, "USD")
        if not rate or rate <= 0:
            continue

        completed_values[label] += flt(opportunity.get("opportunity_amount")) * rate

    return {
        "categories": categories,
        "target": [round(target_values[label], 2) for label in categories],
        "completed": [round(completed_values[label], 2) for label in categories],
        "currency": "USD",
    }

@frappe.whitelist()

def get_sales_team_dashboard_data(period="monthly"):

    """Permission-aware dashboard data. No role gating and no permission bypass."""

    period = (period or "monthly").lower()

    if period not in {"daily", "weekly", "monthly", "quarterly"}:

        period = "monthly"

    start_date, end_date, bucket = _date_window(period)

    opportunities = _fetch_permitted(

        "Opportunity",

        [

            "name", "transaction_date", "creation", "modified",

            "owner", "opportunity_owner", "opportunity_amount", "currency",

            "expected_closing", "workflow_state", "status",

            "customer_name", "party_name",

        ],

        "transaction_date",

        start_date,

        end_date,

    )

    leads = frappe.get_list(

    "Lead",

    fields=["name", "status"],

    page_length=0

)

    quotations = _fetch_permitted(

        "Quotation",

        [

            "name", "creation", "modified", "transaction_date",

            "opportunity", "workflow_state", "status", "grand_total",

            "currency", "customer_name", "party_name", "docstatus",

            "custom_opportunity_owner",

        ],

        "creation",

        start_date,

        end_date,

    )

    won = [row for row in opportunities if _outcome(row) == "won"]

    lost = [row for row in opportunities if _outcome(row) == "lost"]

    open_opportunities = [

        row for row in opportunities if _outcome(row) == "open"

    ]

    sales_performance = _sales_performance_data(
        period, start_date, end_date, bucket, opportunities
    )

    pending_quotations = [

        row for row in quotations

        if (row.get("workflow_state") or "").strip().lower()

        not in {"approved", "rejected", "cancelled"}

        and (row.get("status") or "").strip().lower() != "cancelled"

        and row.get("docstatus") != 2

    ]

    name_map = _display_name_map(opportunities)

    opportunity_owner_map = {

        row.get("name"): row.get("opportunity_owner")

        for row in opportunities

        if row.get("name") and row.get("opportunity_owner")

    }

    closed_count = len(won) + len(lost)

    win_rate = round(len(won) / closed_count *100, 1) if closed_count else 0

    pipeline_conversion = _currency_totals_usd(

        open_opportunities, "opportunity_amount"

    )
        # Won opportunity value in USD
    won_conversion = _currency_totals_usd(
        won, "opportunity_amount"
    )

    # Lost opportunity value in USD
    lost_conversion = _currency_totals_usd(
        lost, "opportunity_amount"
    )

    # Pending quotation value in USD
    pending_quotation_conversion = _currency_totals_usd(
        pending_quotations, "grand_total"
    )

    return {

        "period": period,

        "from_date": str(start_date),

        "to_date": str(end_date),

        "kpis": {

            "total_opportunities": len(opportunities),

            "pipeline_by_currency": {"USD": pipeline_conversion["usd_total"]},

            "pipeline_value_usd": pipeline_conversion["usd_total"],

            "pipeline_source_by_currency": pipeline_conversion["source_totals"],

            "pipeline_currency_conversions": pipeline_conversion["conversions"],

            "pipeline_unconverted": pipeline_conversion["unconverted"],

            "won": len(won),

            "pending_quotations": len(pending_quotations),

            "lost_count": len(lost),

            "win_rate": win_rate,

        },

        "trend": _trend_data(opportunities, bucket),
        "sales_performance": sales_performance,

        "lead_status": _lead_status_data(leads),

        "team_performance": _team_performance(opportunities, name_map),

        "top_opportunities": _top_opportunities(opportunities, name_map),

        "quotation_updates": _quotation_updates(

            quotations, opportunity_owner_map, name_map

        ),

    }
