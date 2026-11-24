"""
Service Delivery dashboard: server side.

Reads four DocTypes of the Dispatch Model module and returns one payload for the dashboard page:

    Ticket                    the request: client, project, service level, received time, status
    FSO Engineer Alignment    who is on the job, when they reached site, progress updates
    Activity And Sign-Off     the visit record and the client sign-off
    Dispatch Payment Request  engineer payment, client billing, finance status

Field names differ from site to site, so nothing is hard-wired. Every field is looked up in FIELDS
below by a list of likely fieldnames or labels; the first one that exists on the DocType wins. If a
field cannot be found the dashboard still loads, the affected figure is left empty and a note is
added to meta["warnings"].

Check what was matched, once, after installing:

    bench --site <your-site> execute \
        teceze.dispatch_model.page.service_delivery.service_delivery.get_mapping_report

If something is mapped wrongly, add the right fieldname at the front of its list in FIELDS.
"""

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import cstr, get_datetime

# --------------------------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------------------------

# DocType names. Matching ignores case, spaces and punctuation ("Activity and Sign-off" also works).
DOCTYPES = {
	"ticket": "Ticket",
	"alignment": "FSO Engineer Alignment",
	"activity": "Activity And Sign-Off",
	"payment": "Dispatch Payment Request",
}

# The dashboard page. Who may see ALL its data is decided by the page's own role list (Desk > Role Permission
# for Page and Report > Service Delivery, or the Roles table on the Page record): nothing is listed in this file,
# so adding or removing a role there is all that is needed. Users with such a role see all tickets even when their
# role has no read permission on Ticket / FSO Engineer Alignment / Activity And Sign-Off / Dispatch Payment
# Request (the dashboard is read-only and shows only the mapped fields). Everyone else needs normal read
# permission on those DocTypes, and Frappe's row filters (user permissions, "only if creator") apply to them.
PAGE_NAME = "service-delivery"

# False = only Administrator, System Manager and the roles on the page's role list (read from the database, see
#         above) see everything. Nothing about roles is written in this file.
# True  = every signed-in desk user, whatever their role, sees the whole dashboard.
SHOW_TO_ALL_ROLES = False

MAX_TICKETS = 5000  # newest first; the payload says when older tickets were left out

# SLA rules by service level, used when the Ticket does not store its own SLA due time.
# These are assumptions (the four DocTypes do not hold a Project SLA master): replace them, or add
# per-project exceptions in PROJECT_SLA below, with the real contract values.
#   sbdCutoff : SBD tickets received before this time (site time) are due the same business day
#   onSiteBy  : the engineer must be on site by this time on the due day
#   atRiskH   : hours before the due time at which an open ticket counts as "at risk"
SLA_RULES = {
	"SBD": {"sbdCutoff": "14:00", "onSiteBy": "18:00", "atRiskH": 2},
	"NBD": {"sbdCutoff": "14:00", "onSiteBy": "18:00", "atRiskH": 3},
}
PROJECT_SLA = {
	# "Warehouse Wi-Fi expansion": {"sbdCutoff": "13:00", "onSiteBy": "18:00", "atRiskH": 2},
}

# Used when a ticket has no readable time zone. None = the site's system time zone.
DEFAULT_TZ = None

# Each logical field -> (likely fieldnames or labels, allowed fieldtypes). First match wins.
def F(*names, types=None):
	return (list(names), types)


FIELDS = {
	"ticket": {
		"client": F("client", "client_name", "client_organization", "client_organisation", "customer", "customer_name"),
		"project": F("project", "project_name", "service_project", "project_code"),
		"title": F("activity_details", "title", "subject", "summary", "ticket_title", "activity"),
		"priority": F("service_level", "sla_level", "sla", "priority", "level", "service_type"),
		"received": F("email_received_time", "received_time", "received_on", "received_at", "email_received", "received", "ticket_received", types=("Datetime",)),
		"received_tz": F("time_zone", "timezone", "email_time_zone", "received_time_zone"),
		"activity_date": F("activity_date", "scheduled_date", "visit_date", types=("Date", "Datetime")),
		"activity_time": F("activity_time", "activity_time_site_local", "scheduled_time", types=("Time", "Data")),
		"activity_tz": F("activity_time_zone", "activity_timezone", "site_time_zone"),
		"status": F("status", "workflow_state", "ticket_status", "stage", "current_stage"),
		"sla_due": F("sla_due", "sla_due_by", "sla_due_time", "sla_deadline", "due_by", types=("Datetime",)),
		"fso_owner": F("fso_owner", "assigned_fso", "fso", "fso_name"),
		"spoc_name": F("spoc_name", "spoc", "site_contact", "contact_name", "contact_person"),
		"spoc_email": F("spoc_email", "contact_email", "email"),
		"spoc_phone": F("spoc_contact_number", "spoc_phone", "contact_number", "contact_phone", "phone", "mobile_no"),
	},
	"alignment": {
		"engineer": F("engineer_name", "engineer", "field_engineer", "fso_engineer", "name_of_engineer", "engineer_full_name"),
		"phone": F("engineer_phone", "engineer_contact", "phone", "mobile", "mobile_no", "contact_number"),
		"fso_owner": F("fso_owner", "assigned_fso", "fso", "fso_name"),
		"engaged_at": F("engaged_at", "engaged_on", "engagement_time", types=("Datetime",)),
		"on_site": F("on_site_time", "on_site_at", "arrival_time", "arrived_at", "check_in_time", "checkin_time", "on_site", types=("Datetime",)),
		"progress_table": F("progress_updates", "progress", "updates", "status_updates", "progress_log", types=("Table",)),
	},
	"activity": {
		"visit_date": F("visit_date", "activity_date", "date", types=("Date", "Datetime")),
		"arrival": F("time_in", "arrival", "arrival_time", "arrival_timesite_local", "check_in", "check_in_time", "on_site_time", types=("Time", "Datetime", "Data")),
		"signoff_file": F("sign_off_sheet", "signoff_sheet", "sign_off_file", "signed_sheet", "sign_off_document", "client_sign_off", types=("Attach", "Attach Image", "Data", "Link")),
		"signed_by": F("signed_by", "client_signatory", "signatory", "signed_by_name", "sign_off"),
		"signed_on": F("signed_on", "sign_off_date", "signoff_date", "signed_date", types=("Date", "Datetime")),
	},
	"payment": {
		"status": F("status", "workflow_state", "payment_status", "finance_status", "request_status"),
		"paid_on": F("paid_on", "payment_date", "paid_date", "paid_at", types=("Date", "Datetime")),
		"reference": F("payment_reference", "payment_ref", "reference", "transaction_reference"),
		"client_billing": F("client_billing_cost", "client_cost", "billing_cost", "client_billing", "client_billing_amount"),
	},
}

# Rows of the progress table inside FSO Engineer Alignment (status, time, note per update)
PROGRESS_FIELDS = {
	"status": F("status", "progress", "progress_status", "update"),
	"time": F("time", "at", "datetime", "update_time", "timestamp", "updated_at", "date_time"),
	"note": F("note", "notes", "remarks", "comment"),
}

# Ticket workflow state -> workflow step, matched EXACTLY (ignoring case, spaces and punctuation).
# Nothing is guessed from keywords: a state that is not listed here is reported in the data notes and its
# stage is worked out from the linked records. Add new workflow states here (or in STATUS_OVERRIDES).
# Steps: 1 Raised, 2 SD review, 3 Assign FSO, 4 FSO process, 5 To SDC, 6 SDC validation, 7 Sign-off,
# 8 FSO payment, 9 SDM billing, 10 Finance, 11 Closed. 0 = leave the ticket out (cancelled etc.).
STATUS_STAGES = {
	"raised": 1, "returnedtoclient": 1,
	"sdreview": 2,
	"assignfso": 3,
	"fsoprocess": 4,
	"tosdc": 5,
	"sdcvalidation": 6,
	"signoff": 7,
	"fsopayment": 8,
	"sdmbilling": 9,
	"finance": 10,
	"closed": 11,
	"cancelled": 0, "rejected": 0,
}

# Dispatch Payment Request status -> step (exact, same rules). Used only for tickets that have a linked payment.
PAYMENT_STAGES = {
	"draft": 8,
	"awaitingforpayment": 10,
	"onhold": 10,
	"paymentdone": 11,
}

# Exact overrides win over the rules: {"waiting for parts": 4}  (key = status with only a-z, 0-9)
STATUS_OVERRIDES = {}

# Workflow step names, owning team (matches the dashboard's own team keys) and "step done" wording.
STEP_TEAMS = ["client", "sd", "sd", "fso", "fso", "sdc", "sdc", "fso", "sdm", "accounts"]
STEP_LABELS = [
	"Ticket raised", "Review complete", "Assigned to FSO queue", "FSO work complete", "Moved to SDC queue",
	"Validation complete", "Sign-off sheet attached", "Payment request sent", "Billing approved", "Engineer paid",
]
STEP_SHORT = ["Raised", "SD review", "Assign FSO", "FSO process", "To SDC", "SDC validation", "Sign-off", "FSO payment", "SDM billing", "Finance", "Closed"]

# Time zone text -> IANA zone. Real IANA names ("Asia/Kolkata") are accepted as they are.
TZ_ALIASES = [
	("ist", "Asia/Kolkata"), ("india", "Asia/Kolkata"), ("kolkata", "Asia/Kolkata"), ("mumbai", "Asia/Kolkata"),
	("gst", "Asia/Dubai"), ("gulf", "Asia/Dubai"), ("dubai", "Asia/Dubai"), ("uae", "Asia/Dubai"),
	("sgt", "Asia/Singapore"), ("singapore", "Asia/Singapore"),
	("myt", "Asia/Kuala_Lumpur"), ("malaysia", "Asia/Kuala_Lumpur"), ("kuala", "Asia/Kuala_Lumpur"),
	("gmt", "Europe/London"), ("bst", "Europe/London"), ("uk", "Europe/London"), ("london", "Europe/London"),
	("utc", "UTC"),
]

STANDARD = {"name": "Data", "creation": "Datetime", "modified": "Datetime", "owner": "Link", "docstatus": "Int"}
LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Heading", "Button", "Fold", "Image"}
CHUNK = 800


# --------------------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------------------

def norm(value):
	return re.sub(r"[^a-z0-9]", "", cstr(value).lower())


def chunks(items, size=CHUNK):
	items = list(items)
	for i in range(0, len(items), size):
		yield items[i : i + size]


def iso(dt):
	"""An aware datetime -> ISO string in UTC, the format the dashboard reads."""
	return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def hhmm(value):
	"""A Time value (timedelta, "9:00:00" or "09:00") -> "09:00", or None."""
	m = re.match(r"^(\d{1,2}):(\d{2})", cstr(value).strip())
	return "%02d:%s" % (int(m.group(1)), m.group(2)) if m else None


def number(value):
	try:
		return float(value) if cstr(value).strip() != "" else None
	except ValueError:
		return None


def system_tz():
	try:
		from frappe.utils import get_system_timezone

		return get_system_timezone()
	except Exception:
		return "UTC"


def zone(name):
	try:
		return ZoneInfo(name)
	except Exception:
		return None


# --------------------------------------------------------------------------------------------------
# Safe raw SQL
#
# Every database read in this file goes through select() below. The rules that keep it injection-proof:
#   1. VALUES never go into the query text. They are passed as parameters (%(name)s), IN lists as one
#      tuple parameter, LIMIT as an integer parameter.
#   2. IDENTIFIERS (table and column names) cannot be parameters, so they are only taken from lists the
#      code has verified: a DocType resolved from the database, a column that exists on that table, and a
#      strict character pattern. They are always quoted with backticks.
#   3. Query text is fixed in shape. select() refuses anything that is not one plain SELECT, or that
#      contains a quote, comment, semicolon or a write / file / delay keyword.
#   4. Raw SQL skips Frappe's permission layer, so every query on a DocType checks read access first and
#      adds Frappe's own row filter (user permissions, "only if creator", shares) through {perm}.
#   5. Every query has a LIMIT, and sensitive columns (bank, IBAN, account, password ...) are never selected.
# --------------------------------------------------------------------------------------------------

IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")  # a column name
DOCTYPE_NAME = re.compile(r"^\w[\w \-/&.()]{0,139}$")  # a DocType name: no quote, backtick, semicolon, % or comment characters
SECRET_COLUMN = re.compile(
	r"(bank|iban|ifsc|swift|sort_?code|routing|account_?(no|num|number)|password|secret|token|api_?key|pan_?(no|number)|tax_?id)",
	re.I,
)
SELECT_ONLY = re.compile(r"^\s*select\s", re.I)
FORBIDDEN = re.compile(
	r";|--|#|/\*|\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|call|handler|load_file|outfile|dumpfile|sleep|benchmark)\b",
	re.I,
)
MAX_CHILD_ROWS = 20000  # per chunk of tickets
MAX_HISTORY_ROWS = 50000
PERM_SLOT = "{perm}"


def dashboard_roles():
	"""Roles allowed on the dashboard page: the page's Roles table plus any Custom Role override. Read once per request."""
	cached = getattr(frappe.local, "sd_dashboard_roles", None)
	if cached is not None:
		return cached
	roles = {r["role"] for r in select("SELECT `role` FROM `tabHas Role` WHERE `parenttype` = %(type)s AND `parent` = %(page)s LIMIT %(limit)s", {"type": "Page", "page": PAGE_NAME, "limit": 500})}
	for custom in select("SELECT `name` FROM `tabCustom Role` WHERE `page` = %(page)s LIMIT %(limit)s", {"page": PAGE_NAME, "limit": 5}):
		roles |= {r["role"] for r in select("SELECT `role` FROM `tabHas Role` WHERE `parenttype` = %(type)s AND `parent` = %(custom)s LIMIT %(limit)s", {"type": "Custom Role", "custom": custom["name"], "limit": 500})}
	frappe.local.sd_dashboard_roles = roles
	return roles


def full_access():
	"""True for Administrator, System Manager and users holding a role of the dashboard page (same rule Frappe uses to open a page)."""
	if frappe.session.user == "Administrator":
		return True
	mine = set(frappe.get_roles())
	if SHOW_TO_ALL_ROLES:
		return "Desk User" in mine  # any desk user; Guest and website users are never included
	return "System Manager" in mine or bool(mine & dashboard_roles())


def can_read(doctype):
	return full_access() or bool(frappe.has_permission(doctype, "read"))


def q_col(name):
	"""A column name, validated and backtick-quoted."""
	if not isinstance(name, str) or not IDENT.match(name):
		frappe.throw(_("Invalid field name."), frappe.PermissionError)
	return "`%s`" % name


def q_table(doctype):
	"""The table of a DocType, validated and backtick-quoted."""
	if not isinstance(doctype, str) or not DOCTYPE_NAME.match(doctype):
		frappe.throw(_("Invalid DocType name."), frappe.PermissionError)
	return "`tab%s`" % doctype


def in_list(values, prefix="v"):
	"""
	('(%(v0)s, %(v1)s)', {'v0': ..., 'v1': ...}) for an IN (...) list: one named parameter per value,
	so every driver escapes each value itself. The caller chunks the list (CHUNK) and never passes it empty.
	"""
	values = list(values)
	if not values:
		frappe.throw(_("Invalid query."), frappe.PermissionError)
	keys = ["%s%d" % (prefix, i) for i in range(len(values))]
	return "(" + ", ".join("%(" + k + ")s" for k in keys) + ")", dict(zip(keys, values))


def read_filter(doctype):
	"""
	' and (...)' limiting rows to what the current user may read: user permissions, "only if creator"
	and shares. Built and escaped by Frappe itself (the same call Frappe's own script reports use).
	Empty for users with unrestricted access. Fails closed: if it cannot be built, nothing is returned.
	"""
	from frappe.desk.reportview import get_match_cond

	cond = get_match_cond(doctype) or ""
	if cond and not cond.lstrip().lower().startswith("and "):
		frappe.throw(_("The permission filter for {0} could not be built.").format(doctype), frappe.PermissionError)
	return cond.replace("%", "%%")  # the query is formatted with parameters, so a literal % must be doubled


def select(template, values=None, read_for=None):
	"""
	Run one read-only query. `template` holds identifiers and %(name)s placeholders only (never data);
	put {perm} where the row-permission filter for `read_for` should go.
	"""
	bare = re.sub(r"`[^`]*`", "``", template)  # quoted identifiers may legitimately look like keywords
	if not SELECT_ONLY.match(template) or FORBIDDEN.search(bare) or "'" in bare or '"' in bare:
		frappe.throw(_("Only plain read queries are allowed."), frappe.PermissionError)
	perm = ""
	if read_for and not full_access():
		frappe.has_permission(read_for, "read", throw=True)
		perm = read_filter(read_for)
	if template.count(PERM_SLOT) != (1 if read_for else 0):
		frappe.throw(_("Invalid query."), frappe.PermissionError)
	return frappe.db.sql(template.replace(PERM_SLOT, perm), values or {}, as_dict=True)


def table_columns(doctype):
	"""Real database columns of a DocType's table (a field without a column, e.g. a virtual one, can't be selected)."""
	try:
		return set(frappe.db.get_table_columns(doctype))
	except Exception:
		return set()


class Schema:
	"""Field lookup for one DocType."""

	def __init__(self, key, doctype):
		self.key, self.doctype = key, doctype
		self.meta = frappe.get_meta(doctype)
		self.fields = [df for df in self.meta.fields if df.fieldtype not in LAYOUT and df.fieldname]
		self.by_name = {norm(df.fieldname): df for df in self.fields}
		self.by_label = {norm(df.label): df for df in self.fields if df.label}

	def find(self, candidates, types=None):
		for c in candidates:
			n = norm(c)
			for table in (self.by_name, self.by_label):
				df = table.get(n)
				if df and (not types or df.fieldtype in types):
					return df
			if c in STANDARD and (not types or STANDARD[c] in types):
				return SimpleNamespace(fieldname=c, label=c, fieldtype=STANDARD[c], options=None)
		return None

	def link_to(self, doctype):
		"""The Link field that points at `doctype` (how child DocTypes find their ticket)."""
		for df in self.fields:
			if df.fieldtype == "Link" and df.options == doctype:
				return df
		return self.find(["ticket", "ticket_id", "ticket_no", "ticket_number", "dispatch_ticket", "reference_ticket"])


def resolve_doctype(wanted):
	if frappe.db.exists("DocType", wanted):
		return wanted
	target = norm(wanted)
	for row in select("SELECT `name` FROM `tabDocType` WHERE `istable` = 0 LIMIT %(limit)s", {"limit": 10000}):
		if norm(row["name"]) == target:
			return row["name"]
	return None


def step_from_status(text):
	"""Workflow step for a Ticket status (exact match), or None when the status is not known."""
	n = norm(text)
	if not n:
		return None
	if n in STATUS_OVERRIDES:
		return STATUS_OVERRIDES[n]
	return STATUS_STAGES.get(n)


def payment_step(text):
	"""Workflow step for a Dispatch Payment Request status (exact match), or None."""
	return PAYMENT_STAGES.get(norm(text))


def priority_from(text):
	n = norm(text)
	if "sbd" in n or "samebusiness" in n or "sameday" in n:
		return "SBD"
	if "nbd" in n or "nextbusiness" in n or "nextday" in n:
		return "NBD"
	return None


def tz_from(text):
	"""IANA zone name for a time zone value, or None."""
	text = cstr(text).strip()
	if not text:
		return None
	if zone(text):
		return text
	# "EST (UTC-05:00)": a fixed offset. Whole hours map to the Etc/GMT zones (their sign is inverted).
	offset = re.search(r"(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?", text.lower())
	if offset and int(offset.group(3) or 0) == 0:
		hours = int(offset.group(2))
		if hours == 0:
			return "UTC"
		etc = zone("Etc/GMT%s%d" % ("-" if offset.group(1) == "+" else "+", hours))
		if etc:
			return etc.key
	tokens = re.findall(r"[a-z]+", text.lower())
	for alias, iana in TZ_ALIASES:
		# with a half-hour offset such as "IST (UTC+05:30)", the zone name decides; "utc" is only the offset
		if offset and alias == "utc":
			continue
		if alias in tokens:
			return iana
	return None


# --------------------------------------------------------------------------------------------------
# The builder
# --------------------------------------------------------------------------------------------------

class Builder:
	def __init__(self):
		self.schemas = {}
		self.fields = {}
		self.links = {}
		self.progress = None
		self.warnings = {}
		self.status_map = defaultdict(Counter)
		self.step_source = Counter()
		self.truncated = False
		self.excluded = 0
		self.default_tz = DEFAULT_TZ or system_tz()
		self._display = {}
		self.allowed = set()  # DocTypes whose tables this builder may query
		self._columns = {}

	# ---- warnings ----
	def warn(self, code, message, ticket=None):
		w = self.warnings.setdefault(code, {"message": message, "tickets": [], "count": 0})
		w["count"] += 1
		if ticket and len(w["tickets"]) < 8:
			w["tickets"].append(ticket)

	# ---- schema ----
	def resolve(self, strict=True):
		for key, wanted in DOCTYPES.items():
			name = resolve_doctype(wanted)
			if not name:
				if key == "ticket" and strict:
					frappe.throw(_("The DocType {0} was not found, so the dashboard has nothing to read.").format(wanted))
				self.warn(f"doctype:{key}", _("DocType {0} was not found; the figures that depend on it are empty.").format(wanted))
				continue
			schema = Schema(key, name)
			self.schemas[key] = schema
			self.allowed.add(name)
			for logical, (names, types) in FIELDS[key].items():
				df = schema.find(names, types)
				self.fields[(key, logical)] = df
				if not df and key == "ticket" and logical in ("client", "project", "priority", "received", "status"):
					self.warn(f"field:{key}.{logical}", _("Ticket field “{0}” was not found (looked for: {1}).").format(logical, ", ".join(names[:4])))
			if key != "ticket" and "ticket" in self.schemas:
				self.links[key] = schema.link_to(self.schemas["ticket"].doctype)
				if not self.links[key]:
					self.warn(f"link:{key}", _("{0} has no field linking it to a Ticket, so it was ignored.").format(name))
		al = self.schemas.get("alignment")
		table = self.fields.get(("alignment", "progress_table"))
		if al and table and table.options:
			self.progress = Schema("progress", table.options)
			self.allowed.add(table.options)
			self.progress_fields = {k: self.progress.find(*v) for k, v in PROGRESS_FIELDS.items()}

	def df(self, key, logical):
		return self.fields.get((key, logical))

	def value(self, key, logical, row):
		df = self.df(key, logical)
		return row.get(df.fieldname) if df else None

	def text(self, key, logical, row):
		"""A field as display text (a Link shows the linked record's title, not its id)."""
		df = self.df(key, logical)
		if not df:
			return ""
		v = row.get(df.fieldname)
		if not v:
			return ""
		if df.fieldtype == "Link" and df.options:
			return self._display.get((df.options, v), cstr(v))  # titles come from prefetch_titles(); otherwise the id
		return cstr(v).strip()

	def table(self, doctype):
		"""Quoted table of a DocType, only for DocTypes this builder has verified (resolved or linked from a mapped field)."""
		if doctype not in self.allowed:
			frappe.throw(_("DocType {0} is not part of this dashboard.").format(doctype), frappe.PermissionError)
		return q_table(doctype)

	def columns(self, doctype):
		if doctype not in self._columns:
			self._columns[doctype] = table_columns(doctype)
		return self._columns[doctype]

	def select_fields(self, key):
		"""Columns to read for one DocType: mapped fields that really exist as columns, never a sensitive one."""
		doctype = self.schemas[key].doctype
		real = self.columns(doctype)
		names = {"name", "creation", "modified", "docstatus"}
		for (k, _logical), df in self.fields.items():
			if k == key and df and df.fieldtype not in ("Table", "Table MultiSelect"):
				names.add(df.fieldname)
		link = self.links.get(key)
		if link:
			names.add(link.fieldname)
		keep = sorted(n for n in names if n in real and IDENT.match(n) and not SECRET_COLUMN.search(n))
		for n in sorted(names - set(keep)):
			if n not in ("name", "creation", "modified", "docstatus") and n not in real:
				self.warn(f"column:{doctype}.{n}", _("{0} has no database column {1}, so it was not read.").format(doctype, n))
		return keep

	# ---- data access: parameterised, read-only SQL (see "Safe raw SQL" above) ----
	def fetch_tickets(self):
		dt = self.schemas["ticket"].doctype
		cols = ", ".join(q_col(c) for c in self.select_fields("ticket"))
		received = self.df("ticket", "received")
		order = []
		if received and received.fieldname in self.columns(dt) and IDENT.match(received.fieldname):
			order.append(q_col(received.fieldname) + " DESC")
		order += ["`creation` DESC", "`name` DESC"]
		rows = select(
			"SELECT " + cols + " FROM " + self.table(dt) + " WHERE 1 = 1" + PERM_SLOT + " ORDER BY " + ", ".join(order) + " LIMIT %(limit)s",
			{"limit": MAX_TICKETS + 1},
			read_for=dt,
		)
		self.truncated = len(rows) > MAX_TICKETS
		return rows[:MAX_TICKETS]

	def fetch_children(self, key, names):
		"""rows of a linked DocType, grouped by ticket id, oldest first"""
		schema, link = self.schemas.get(key), self.links.get(key)
		out = defaultdict(list)
		if not schema or not link or not names:
			return out
		if link.fieldname not in self.columns(schema.doctype):
			return out
		if not can_read(schema.doctype):
			self.warn(f"perm:{key}", _("You do not have read access to {0}; the figures that depend on it are empty.").format(schema.doctype))
			return out
		cols = ", ".join(q_col(c) for c in self.select_fields(key))
		head = "SELECT " + cols + " FROM " + self.table(schema.doctype) + " WHERE " + q_col(link.fieldname) + " IN "
		for part in chunks(names):
			marks, values = in_list(part)
			values["limit"] = MAX_CHILD_ROWS
			rows = select(head + marks + PERM_SLOT + " ORDER BY `creation` ASC, `name` ASC LIMIT %(limit)s", values, read_for=schema.doctype)
			if len(rows) >= MAX_CHILD_ROWS:
				self.warn(f"cap:{key}", _("{0} has more linked rows than the dashboard reads at once; some were left out.").format(schema.doctype))
			for r in rows:
				out[r.get(link.fieldname)].append(r)
		return out

	def fetch_progress(self, names):
		"""progress-table rows of FSO Engineer Alignment, keyed by the alignment document name.
		Child rows have no permissions of their own: they follow the parent rows, which were already filtered."""
		out = defaultdict(list)
		if not self.progress or not names:
			return out
		parent = self.schemas["alignment"].doctype
		table_field = self.fields.get(("alignment", "progress_table"))
		real = self.columns(self.progress.doctype)
		cols = ["parent", "idx"] + sorted({df.fieldname for df in self.progress_fields.values() if df and df.fieldname in real and IDENT.match(df.fieldname) and not SECRET_COLUMN.search(df.fieldname)})
		head = "SELECT " + ", ".join(q_col(c) for c in cols) + " FROM " + self.table(self.progress.doctype) + " WHERE `parent` IN "
		tail = " AND `parenttype` = %(parenttype)s AND `parentfield` = %(parentfield)s ORDER BY `parent` ASC, `idx` ASC LIMIT %(limit)s"
		for part in chunks(names):
			marks, values = in_list(part)
			values.update({"parenttype": parent, "parentfield": table_field.fieldname, "limit": MAX_CHILD_ROWS})
			for r in select(head + marks + tail, values):
				out[r["parent"]].append(r)
		return out

	def fetch_versions(self, names):
		"""status changes of each ticket from the document history (needs 'Track Changes' on Ticket)"""
		status = self.df("ticket", "status")
		out = defaultdict(list)
		if not status or not names:
			return out
		dt = self.schemas["ticket"].doctype  # the ticket ids passed in were already permission-filtered
		head = "SELECT `docname`, `creation`, `data` FROM `tabVersion` WHERE `ref_doctype` = %(dt)s AND `docname` IN "
		tail = " ORDER BY `creation` ASC, `name` ASC LIMIT %(limit)s"
		try:
			for part in chunks(names):
				marks, values = in_list(part)
				values.update({"dt": dt, "limit": MAX_HISTORY_ROWS})
				for v in select(head + marks + tail, values):
					try:
						changed = json.loads(v["data"] or "{}").get("changed") or []
					except ValueError:
						continue
					for field, _old, new in (c[:3] for c in changed if len(c) >= 3):
						if field == status.fieldname and new:
							out[v["docname"]].append((v["creation"], cstr(new)))
		except Exception:
			self.warn("versions", _("The ticket history could not be read; stage times come from the linked records instead."))
		return out

	def fetch_comments(self, names):
		out = defaultdict(list)
		if not names:
			return out
		dt = self.schemas["ticket"].doctype
		head = "SELECT `reference_name`, `creation`, `content` FROM `tabComment` WHERE `reference_doctype` = %(dt)s AND `reference_name` IN "
		tail = " AND `comment_type` = %(kind)s ORDER BY `creation` ASC, `name` ASC LIMIT %(limit)s"
		try:
			for part in chunks(names):
				marks, values = in_list(part)
				values.update({"dt": dt, "kind": "Comment", "limit": MAX_HISTORY_ROWS})
				for c in select(head + marks + tail, values):
					out[c["reference_name"]].append(c)
		except Exception:
			pass
		return out

	def prefetch_titles(self, rows_by_key):
		"""Display text of Link fields (the linked record's title), read in one query per linked DocType."""
		wanted = defaultdict(set)  # linked DocType -> ids
		for (key, _logical), df in self.fields.items():
			if df and df.fieldtype == "Link" and df.options and key in rows_by_key:
				for r in rows_by_key[key]:
					if r.get(df.fieldname):
						wanted[df.options].add(r[df.fieldname])
		for doctype, ids in wanted.items():
			try:
				title = frappe.get_meta(doctype).title_field
				if not title or title == "name" or not frappe.db.exists("DocType", doctype) or not can_read(doctype):
					continue
				if title not in self.columns(doctype) or not IDENT.match(title) or SECRET_COLUMN.search(title):
					continue
				self.allowed.add(doctype)
				head = "SELECT `name`, " + q_col(title) + " AS `title` FROM " + self.table(doctype) + " WHERE `name` IN "
				for part in chunks(sorted(ids)):
					marks, values = in_list(part)
					values["limit"] = len(part)
					for r in select(head + marks + PERM_SLOT + " LIMIT %(limit)s", values, read_for=doctype):
						self._display[(doctype, r["name"])] = cstr(r["title"] or r["name"])
			except Exception:
				continue  # the id is shown instead of the title

	def fetch_project_rows(self, doctype, ids, columns):
		"""Manager / active-state columns of the Project records the tickets point to."""
		out = {}
		if not ids or not columns or not can_read(doctype):
			return out
		self.allowed.add(doctype)
		real = self.columns(doctype)
		cols = sorted({c for c in columns if c in real and IDENT.match(c) and not SECRET_COLUMN.search(c)})
		if not cols:
			return out
		head = "SELECT `name`, " + ", ".join(q_col(c) for c in cols) + " FROM " + self.table(doctype) + " WHERE `name` IN "
		for part in chunks(sorted(ids)):
			marks, values = in_list(part)
			values["limit"] = len(part)
			for r in select(head + marks + PERM_SLOT + " LIMIT %(limit)s", values, read_for=doctype):
				out[r["name"]] = r
		return out

	def value_counts(self, logical="status", limit=500):
		"""{value: ticket count} of one Ticket field, grouped in the database (diagnostic reports)."""
		df = self.df("ticket", logical)
		dt = self.schemas["ticket"].doctype
		if not df or df.fieldname not in self.columns(dt) or not IDENT.match(df.fieldname) or SECRET_COLUMN.search(df.fieldname):
			return {}
		col = q_col(df.fieldname)
		rows = select(
			"SELECT " + col + " AS `value`, COUNT(*) AS `n` FROM " + self.table(dt) + " WHERE 1 = 1" + PERM_SLOT
			+ " GROUP BY " + col + " ORDER BY `n` DESC LIMIT %(limit)s",
			{"limit": int(limit)},
			read_for=dt,
		)
		return {r["value"]: r["n"] for r in rows}

	def status_counts(self):
		return self.value_counts("status")

	# ---- time ----
	def to_utc(self, value, tzname, time_part=None):
		"""A Frappe Date/Datetime (naive, in `tzname`) -> aware datetime. `time_part` adds a Time to a Date."""
		if not value:
			return None
		try:
			dt = get_datetime(f"{value} {time_part}") if time_part not in (None, "") and not isinstance(value, datetime) else get_datetime(value)
		except Exception:
			return None
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=zone(tzname) or zone(self.default_tz) or timezone.utc)
		return dt

	# ---- one ticket ----
	def build_ticket(self, row, align_rows, act_rows, pay_rows, progress, versions, comments):
		tid = row["name"]
		rtz = tz_from(self.text("ticket", "received_tz", row))
		if self.text("ticket", "received_tz", row) and not rtz and norm(self.text("ticket", "received_tz", row)) != "timezone":  # "Time Zone" is the field's placeholder label
			self.warn("tz", _("A time zone value was not recognised; the site time zone was used instead."), tid)
		rtz = rtz or self.default_tz
		atz = tz_from(self.text("ticket", "activity_tz", row)) or rtz

		received = self.to_utc(self.value("ticket", "received", row), rtz) or self.to_utc(row.get("creation"), self.default_tz)
		if not received:
			self.warn("nocreated", _("Tickets without a received time were left out."), tid)
			return None

		level = priority_from(self.text("ticket", "priority", row))
		if not level:
			self.warn("priority", _("Some tickets have no recognisable service level (SBD or NBD); NBD was assumed."), tid)
			level = "NBD"

		# latest alignment / activity / payment record of the ticket
		al = align_rows[-1] if align_rows else None
		act = act_rows[-1] if act_rows else None
		pay = pay_rows[-1] if pay_rows else None

		engineer = self.text("alignment", "engineer", al) if al else ""
		engineer_phone = self.text("alignment", "phone", al) if al else ""
		fso_owner = (self.text("ticket", "fso_owner", row) or (self.text("alignment", "fso_owner", al) if al else ""))

		# --- when the engineer reached site: the SLA clock stop ---
		on_site = None
		if al:
			on_site = self.to_utc(self.value("alignment", "on_site", al), rtz)
			if not on_site:
				for p in progress.get(al["name"], []):
					status = p.get(self.progress_fields["status"].fieldname) if self.progress_fields.get("status") else ""
					if "onsite" in norm(status) or "arrived" in norm(status) or "checkedin" in norm(status):
						tf = self.progress_fields.get("time")
						on_site = self.to_utc(p.get(tf.fieldname), rtz) if tf else None
						if on_site:
							break
		if not on_site and act:
			arrival_df = self.df("activity", "arrival")
			arrival = self.value("activity", "arrival", act)
			if arrival_df and arrival_df.fieldtype == "Datetime":
				on_site = self.to_utc(arrival, atz)  # the visit happens at the site, so its time zone applies
			elif arrival:
				on_site = self.to_utc(self.value("activity", "visit_date", act), atz, time_part=arrival)

		# --- when the visit was scheduled ---
		activity_at = self.to_utc(self.value("ticket", "activity_date", row), atz, time_part=self.value("ticket", "activity_time", row))

		# --- stage ---
		raw_status = self.text("ticket", "status", row)
		step, source = None, "status"
		if row.get("docstatus") == 2:
			step = 0
		else:
			step = step_from_status(raw_status)
		if step is None:
			source = "evidence"
			step = self.step_from_evidence(row, al, act, pay, on_site)
			if raw_status:
				self.warn("status", _("Some tickets have a status the dashboard does not recognise; their stage was worked out from the linked records. Add the status to STATUS_STAGES or STATUS_OVERRIDES in service_delivery.py."), tid)
		if raw_status:
			self.status_map[raw_status][step] += 1
		if step == 0:
			self.excluded += 1
			return None
		self.step_source[source] += 1
		pay_step = payment_step(self.text("payment", "status", pay)) if pay else None
		if pay_step == 11 and 8 <= step <= 10:
			step = 11  # the linked payment request is "Payment Done"
		closed = step == 11

		closed_at = None
		if closed:
			paid = self.to_utc(self.value("payment", "paid_on", pay), atz) if pay else None
			closed_at = paid or (self.to_utc(pay.get("modified"), self.default_tz) if pay else None) or self.to_utc(row.get("modified"), self.default_tz)

		history, log = self.history_and_log(tid, received, step, versions, comments, al, act, pay, progress, engineer, closed_at, rtz, atz)

		sla_due = self.to_utc(self.value("ticket", "sla_due", row), rtz)
		contact = {"name": self.text("ticket", "spoc_name", row), "email": self.text("ticket", "spoc_email", row), "phone": self.text("ticket", "spoc_phone", row)}
		return {
			"id": tid,
			"client": self.text("ticket", "client", row),
			"project": self.text("ticket", "project", row),
			"_projectId": self.value("ticket", "project", row),
			"title": self.text("ticket", "title", row),
			"priority": level,
			"tz": atz,
			"receivedTz": rtz,
			"created": iso(received),
			"step": min(step, 10),
			"closed": closed,
			"closedAt": iso(closed_at) if closed_at else None,
			"onSiteAt": iso(on_site) if on_site else None,
			"activityAt": iso(activity_at) if activity_at else None,
			"slaDue": iso(sla_due) if sla_due else None,
			# from the linked payment request when there is one (None = no payment record, the dashboard then uses the stage)
			"paymentPending": None if not pay else pay_step != 11,
			"fsoOwner": fso_owner,
			"engineer": {"name": engineer, "phone": engineer_phone} if engineer else {},
			"contact": contact,
			"history": history,
			"log": log,
			"updatedAt": log[-1]["at"] if log else iso(received),
		}

	def step_from_evidence(self, row, al, act, pay, on_site):
		"""Work out the stage from which linked records exist, when the status text can't be used."""
		if pay:
			status = payment_step(self.text("payment", "status", pay))
			if status:
				return status
			if self.value("payment", "paid_on", pay):
				return 11
			if self.value("payment", "client_billing", pay):
				return 10
			return 8
		if act and self.value("activity", "signoff_file", act):
			return 8  # the client sign-off is attached, so the ticket is waiting for the payment request
		if al or act:
			return 4  # an engineer or a visit record exists; whether SDC has picked it up can't be told from the records
		if self.text("ticket", "fso_owner", row):
			return 3
		return 2

	def history_and_log(self, tid, received, step, versions, comments, al, act, pay, progress, engineer, closed_at, rtz, atz):
		"""
		history: when each completed step finished (drives the drawer's pipeline times)
		log:     recent activity (drives the drawer's activity list), oldest first
		"""
		done = {1: received}
		log = [{"at": iso(received), "team": "client", "title": STEP_LABELS[0], "text": ""}]

		# stage changes from the document history are the most exact source
		for when, status in versions.get(tid, []):
			s = step_from_status(status)
			t = self.to_utc(when, self.default_tz)
			if not s or not t:
				continue
			for n in range(1, min(s, 11)):
				done.setdefault(n, t)
			if 1 < s <= 11:
				log.append({"at": iso(t), "team": STEP_TEAMS[min(s, 10) - 1] if s <= 10 else "accounts", "title": f"Stage: {STEP_SHORT[s - 1]}", "text": ""})

		# otherwise use the linked records as evidence
		if al:
			t = self.to_utc(al.get("creation"), self.default_tz)
			if t:
				if step > 3:
					done.setdefault(3, t)
				log.append({"at": iso(t), "team": "fso", "title": "Engineer engaged", "text": engineer})
			for p in progress.get(al["name"], []):
				tf, sf, nf = (self.progress_fields.get(k) for k in ("time", "status", "note"))
				pt = self.to_utc(p.get(tf.fieldname), rtz) if tf else None
				status = cstr(p.get(sf.fieldname)) if sf else ""
				if pt and status:
					log.append({"at": iso(pt), "team": "fso", "title": f"Progress: {status}", "text": cstr(p.get(nf.fieldname)) if nf else ""})
		if act and step > 7:
			t = self.to_utc(self.value("activity", "signed_on", act), atz) or self.to_utc(act.get("modified"), self.default_tz)
			if t:
				done.setdefault(7, t)
				signer = self.text("activity", "signed_by", act)
				log.append({"at": iso(t), "team": "sdc", "title": STEP_LABELS[6], "text": f"Signed by {signer}" if signer else ""})
		if pay:
			t = self.to_utc(pay.get("creation"), self.default_tz)
			if t and step > 8:
				done.setdefault(8, t)
			if t:
				log.append({"at": iso(t), "team": "fso", "title": STEP_LABELS[7], "text": ""})
		if closed_at:
			done.setdefault(10, closed_at)
			ref = self.text("payment", "reference", pay) if pay else ""
			log.append({"at": iso(closed_at), "team": "accounts", "title": STEP_LABELS[9], "text": f"Payment ref {ref}" if ref else ""})
		for c in comments.get(tid, []):
			t = self.to_utc(c.get("creation"), self.default_tz)
			text = re.sub(r"<[^>]+>", " ", cstr(c.get("content"))).strip()
			if t and text:
				log.append({"at": iso(t), "team": None, "title": "Note", "text": text[:300]})

		history = []
		for n in range(1, min(step, 11)):
			if n in done:
				history.append({"step": n, "label": STEP_LABELS[n - 1], "team": STEP_TEAMS[n - 1], "at": iso(done[n]), "note": ""})
		log.sort(key=lambda e: e["at"])
		return history, log[-40:]

	# ---- projects ----
	def build_projects(self, tickets):
		by_project = defaultdict(list)
		for t in tickets:
			by_project[t["project"] or "No project"].append(t)
		pdt = self.df("ticket", "project")
		sdm_df, state_df, off_df = None, None, None
		if pdt and pdt.fieldtype == "Link" and pdt.options:
			try:
				pschema = Schema("project", pdt.options)
				sdm_df = pschema.find(["sdm", "service_delivery_manager", "project_manager", "account_manager"])
				state_df = pschema.find(["status", "project_status"])
				off_df = pschema.find(["disabled", "is_disabled"], types=("Check",))
			except Exception:
				pass
		project_ids = {t["_projectId"] for t in tickets if t.get("_projectId")}
		project_rows = self.fetch_project_rows(pdt.options, project_ids, [df.fieldname for df in (sdm_df, state_df, off_df) if df]) if pdt and pdt.options and project_ids else {}
		projects = []
		for name, ts in by_project.items():
			level = Counter(t["priority"] for t in ts).most_common(1)[0][0]
			rules = dict(SLA_RULES[level])
			rules.update(PROJECT_SLA.get(name, {}))
			project_id = next((t["_projectId"] for t in ts if t.get("_projectId")), None)
			row = project_rows.get(project_id) or {}
			sdm = cstr(row.get(sdm_df.fieldname) or "") if sdm_df else ""
			active = True
			if off_df and row.get(off_df.fieldname):
				active = False
			if state_df and norm(row.get(state_df.fieldname)) in ("completed", "cancelled", "closed", "inactive", "onhold"):
				active = False
			projects.append(
				{
					"code": name,
					"name": name,
					"client": Counter(t["client"] for t in ts).most_common(1)[0][0],
					"tz": Counter(t["tz"] for t in ts).most_common(1)[0][0],
					"priority": level,
					"sdm": sdm,
					"active": active,
					**rules,
				}
			)
		return sorted(projects, key=lambda p: (p["client"], p["name"]))

	# ---- run ----
	def run(self):
		self.resolve(strict=True)
		rows = [r for r in self.fetch_tickets()]
		names = [r["name"] for r in rows]
		align = self.fetch_children("alignment", names)
		act = self.fetch_children("activity", names)
		pay = self.fetch_children("payment", names)
		align_names = [r["name"] for rs in align.values() for r in rs]
		progress = self.fetch_progress(align_names)
		self.prefetch_titles({
			"ticket": rows,
			"alignment": [r for rs in align.values() for r in rs],
			"activity": [r for rs in act.values() for r in rs],
			"payment": [r for rs in pay.values() for r in rs],
		})
		versions = self.fetch_versions(names)
		comments = self.fetch_comments(names)

		tickets = []
		for r in rows:
			t = self.build_ticket(r, align.get(r["name"], []), act.get(r["name"], []), pay.get(r["name"], []), progress, versions, comments)
			if t:
				tickets.append(t)
		for t in tickets:
			t["client"] = t["client"] or "No client"
			t["project"] = t["project"] or "No project"
		projects = self.build_projects(tickets)
		for t in tickets:
			t.pop("_projectId", None)

		warnings = [{"message": w["message"], "count": w["count"], "tickets": w["tickets"]} for w in self.warnings.values()]
		return {
			"version": 2,
			"tickets": tickets,
			"projects": projects,
			"meta": {
				"generated": iso(datetime.now(timezone.utc)),
				"truncated": self.truncated,
				"excluded": self.excluded,
				"limit": MAX_TICKETS,
				"tz": self.default_tz,  # the dashboard shows "today", periods and dates in this time zone
				"doctypes": {k: s.doctype for k, s in self.schemas.items()},
				"stage_source": dict(self.step_source),
				"warnings": warnings,
			},
		}


# --------------------------------------------------------------------------------------------------
# Whitelisted methods
# --------------------------------------------------------------------------------------------------

@frappe.whitelist()
def get_dashboard_data():
	"""Everything the Service Delivery dashboard shows."""
	return Builder().run()


@frappe.whitelist()
def get_mapping_report():
	"""
	Which DocTypes and fields were matched, plus how each ticket status maps to a workflow step.
	Run it once after installing, and again whenever a DocType changes.
	"""
	frappe.only_for(("System Manager", "Administrator"))  # it lists the structure of the DocTypes
	b = Builder()
	b.resolve(strict=False)
	report = {"doctypes": {}, "status_values": {}}
	for key, schema in b.schemas.items():
		found, missing = {}, []
		for logical in FIELDS[key]:
			df = b.fields.get((key, logical))
			if df:
				found[logical] = f"{df.fieldname}  ({df.fieldtype})"
			else:
				missing.append(logical)
		link = b.links.get(key)
		report["doctypes"][key] = {
			"doctype": schema.doctype,
			"linked_to_ticket_by": link.fieldname if link else ("(this is the Ticket)" if key == "ticket" else "NOT FOUND"),
			"matched": found,
			"not_found": missing,
			"all_fields": [f"{df.fieldname} | {df.label} | {df.fieldtype}" + (f" -> {df.options}" if df.options else "") for df in schema.fields],
		}
	if b.df("ticket", "status"):
		for raw, n in b.status_counts().items():
			step = step_from_status(raw)
			report["status_values"][cstr(raw) or "(empty)"] = {
				"tickets": n,
				"becomes": "NOT RECOGNISED (stage is worked out from the linked records)" if step is None else ("left out" if step == 0 else f"{step}. {STEP_SHORT[step - 1]}"),
			}
	for w in b.warnings.values():
		report.setdefault("warnings", []).append(w["message"])
	return report