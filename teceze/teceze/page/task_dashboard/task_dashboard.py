import frappe
from frappe import _
from frappe.utils import cint, flt, get_fullname, today
from frappe.query_builder import DocType, Order
from frappe.query_builder.functions import Count, Sum, Max, Coalesce
from pypika.terms import Case
from pypika import Field
import math
import re

DEFAULT_PAGE_SIZE = 20   # rows per table page
MAX_PAGE_SIZE = 100      # upper limit, so nobody can request every row at once

# Who gets the admin view (every task and timesheet, any employee).
# The Administrator login always does. Add roles here, e.g. "Projects Manager".
ADMIN_ROLES = {"System Manager"}

ALL_EMPLOYEES = "__all__"   # picker value for the company-wide view
TOP_PEOPLE = 8              # rows in the admin "by assignee / by employee" cards


EMPLOYEE_FIELDS = ["name", "employee_name", "designation", "user_id"]


def _permitted_employees(filters, fields=EMPLOYEE_FIELDS, limit=0, order_by="employee_name asc"):
    """Employee records the logged-in user is allowed to read.
    frappe.get_list applies role permissions, User Permissions and permission
    query conditions (frappe.get_all would skip all of them).
    limit=0 means no limit: always pass it, because get_list's page length
    defaults to 20 in some Frappe versions and in the REST API."""
    return frappe.get_list(
        "Employee", filters=filters, fields=fields, order_by=order_by, limit_page_length=limit
    )


def is_admin(user=None):
    user = user or frappe.session.user
    return user == "Administrator" or bool(ADMIN_ROLES & set(frappe.get_roles(user)))


@frappe.whitelist()
def get_dropdown_employees():
    """Choices for the employee picker.
    Admins: "All employees" first (their default), then every active employee.
    Others: themselves, then their active direct reports.
    Each entry carries `group` (heading shown above it in the picker) and `is_me`."""
    current_user = frappe.session.user

    mine = _permitted_employees({"user_id": current_user, "status": "Active"}, limit=1)
    me = mine[0] if mine else None

    def entry(e, is_me=False):
        return {
            "employee": e.name,
            "employee_name": e.employee_name,
            "designation": e.designation,
            "user": e.user_id,
            "is_me": is_me,
            "group": "",
        }

    def with_group(entries, label):
        for e in entries:
            e["group"] = f"{label} ({len(entries)})"
        return entries

    if is_admin():
        everyone = _permitted_employees({"status": "Active"})
        employees = [{
            "employee": ALL_EMPLOYEES,
            "employee_name": _("All employees"),
            "designation": _("Company-wide view"),
            "initials": "All",
            "is_me": False,
            "group": "",
        }]
        if me:
            employees.append(entry(me, is_me=True))
        others = [entry(e) for e in everyone if not me or e.name != me.name]
        employees += with_group(others, _("Employees"))
        return {"default_employee": ALL_EMPLOYEES, "is_admin": True, "employees": employees}

    if not me:
        # This login is not linked to an active Employee, so there is nobody to show
        return {"default_employee": None, "is_admin": False, "employees": []}

    # only the reports this manager is permitted to read
    reports = _permitted_employees({"reports_to": me.name, "status": "Active"})
    others = [entry(r) for r in reports if r.name != me.name]
    employees = [entry(me, is_me=True)] + with_group(others, _("Direct reports"))
    return {"default_employee": me.name, "is_admin": False, "employees": employees}

def get_sprint(user_tags):
    """_user_tags is stored like 'Sprint 01' (or ',Sprint 01,Other').
    Returns the sprint name, or None if the task has no sprint tag."""
    for tag in (user_tags or "").split(","):
        tag = tag.strip()
        if re.match(r"^sprint", tag, re.IGNORECASE):
            # 'Sprint-01' and 'Sprint 01' become the same name
            return re.sub(r"^sprint[\s_-]*", "Sprint ", tag, flags=re.IGNORECASE)
    return None

def _natural_key(text):
    """Sort 'Sprint 2' before 'Sprint 10'."""
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", text or "")]


def _sprint_order(name):
    """Natural order, then the plain text, so 'Sprint 2' and 'Sprint 02' always come
    out in the same order (and keep the same colour) on every reload."""
    return (_natural_key(name), name or "")


def _resolve_scope(employee=None):
    """Check the caller may see this view, and describe it:
      kind      "all" (admins: every task and timesheet) or "employee"
      employee  the Employee ID, or ALL_EMPLOYEES
      emp       the Employee record (None for "all")
      user      the employee's login user (task assignments are stored against users)"""
    admin = is_admin()
    choices = None if admin else get_dropdown_employees()  # non-admins: their own list, built once

    if not employee:
        employee = ALL_EMPLOYEES if admin else choices["default_employee"]

    if employee == ALL_EMPLOYEES:
        if not admin:
            frappe.throw(_("Only administrators can see every employee"), frappe.PermissionError)
        return frappe._dict(kind="all", employee=ALL_EMPLOYEES, emp=None, user=None)

    # Safety check: admins may open any employee they can read,
    # others only someone in their own dropdown list (themselves + direct reports)
    if not admin and employee not in [e["employee"] for e in choices["employees"]]:
        employee = None

    # get_list returns nothing for a record the user may not read,
    # so this is the permission check and the fetch in one
    found = _permitted_employees(
        {"name": employee},
        fields=["name", "employee_name", "department", "designation", "status", "user_id"],
        limit=1,
        order_by=None,
    ) if employee else []
    if not found:
        frappe.throw(_("You are not permitted to view this employee's data"), frappe.PermissionError)

    emp = found[0]
    return frappe._dict(kind="employee", employee=employee, emp=emp, user=emp.user_id)


def _has_tasks(scope):
    """An employee without a login user can't be assigned tasks."""
    return scope.kind == "all" or bool(scope.user)


def _page_args(page, page_size):
    page_size = min(max(cint(page_size) or DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    return max(cint(page), 1), page_size


def _page_result(rows, total, page, page_size):
    return {
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, math.ceil(total / page_size)),
    }

def _user_tags_col(Task):
    """The `_user_tags` column of Task (a name starting with an underscore)."""
    return Field("_user_tags", table=Task)

def _task_scope(scope):
    """The tasks a view covers. Returns (query, Task, Project).
      "all":      every task except templates
      "employee": tasks assigned to the employee's user through ToDo (the
                  sub-query keeps each task once even if it has several ToDo rows)"""
    Task, Project, ToDo = DocType("Task"), DocType("Project"), DocType("ToDo")

    query = frappe.qb.from_(Task).left_join(Project).on(Project.name == Task.project)

    if scope.kind == "all":
        if frappe.get_meta("Task").has_field("is_template"):
            query = query.where(Task.is_template == 0)
        return query, Task, Project

    assigned = (
        frappe.qb.from_(ToDo)
        .select(ToDo.reference_name)
        .where(ToDo.reference_type == "Task")
        .where(ToDo.allocated_to == scope.user)
        .where(ToDo.status != "Cancelled")
    )
    return query.where(Task.name.isin(assigned)), Task, Project


# ---------------------------------------------------------------- summary

def _task_summary(scope):
    """Everything the cards and charts need, counted in the database.
    One grouped query returns a few dozen rows however many tasks the user has."""
    summary = {
        "task_status_counts": [],
        "total_tasks": 0,
        "overdue_count": 0,
        "priority_counts": {},
        "projects": [],
        "sprints": [],
    }
    if not _has_tasks(scope):
        return summary

    query, Task, Project = _task_scope(scope)

    overdue = (
        Case()
        .when(
            Task.status.notin(["Completed", "Cancelled"])
            & ((Task.status == "Overdue") | (Task.exp_end_date < today())),
            1,
        )
        .else_(0)
        .as_("overdue")
    )
    user_tags = _user_tags_col(Task)

    groups = (
        query.select(
            Task.status, Task.priority, Task.project, Project.project_name,
            user_tags, overdue, Count("*").as_("n"),
        )
        .groupby(
            Task.status, Task.priority, Task.project, Project.project_name,
            user_tags, overdue,
        )
        .run(as_dict=True)
    )

    status, priority, projects, sprints = {}, {}, {}, {}
    for g in groups:
        n = cint(g.n)
        sprint = get_sprint(g._user_tags)
        active = g.status not in ("Completed", "Cancelled")

        summary["total_tasks"] += n
        status[g.status] = status.get(g.status, 0) + n
        if g.overdue:
            summary["overdue_count"] += n
        if active:
            priority[g.priority] = priority.get(g.priority, 0) + n

        proj = projects.setdefault(g.project or "", {
            "project": g.project, "project_name": g.project_name, "n": 0, "sprints": set(),
        })
        proj["n"] += n
        if sprint:
            proj["sprints"].add(sprint)

        spr = sprints.setdefault(sprint, {"sprint": sprint, "n": 0, "done": 0})
        spr["n"] += n
        if g.status == "Completed":
            spr["done"] += n

    summary["task_status_counts"] = [{"status": s, "total": n} for s, n in status.items()]
    summary["priority_counts"] = priority
    summary["projects"] = sorted(
        ({**p, "sprints": sorted(p["sprints"], key=_sprint_order)} for p in projects.values()),
        key=lambda p: -p["n"],
    )
    # named sprints in natural order, "no sprint" last
    summary["sprints"] = sorted(
        sprints.values(), key=lambda s: (s["sprint"] is None, _sprint_order(s["sprint"]))
    )
    return summary

def _timesheet_summary(scope):
    query, TS = _timesheet_scope(scope)
    totals = query.select(
        Count("*").as_("cnt"),
        Coalesce(Sum(TS.total_hours), 0).as_("hrs"),
        Max(TS.start_date).as_("latest_start"),
    ).run(as_dict=True)[0]
    return {
        "timesheet_count": cint(totals.cnt),
        "total_hours": flt(totals.hrs, 2),
        "latest_timesheet_start": totals.latest_start,
    }


# ---------------------------------------------------------------- task table

def _sprint_tag_values(scope, sprint):
    """The sprint name is worked out from the raw tag text (see get_sprint), so
    find the raw _user_tags values that mean this sprint, and filter on those."""
    query, Task, _p = _task_scope(scope)
    rows = query.select(Coalesce(_user_tags_col(Task), "")).distinct().run()
    raw = [r[0] for r in rows]
    wanted = None if sprint == "No sprint" else sprint
    return tuple(tag for tag in raw if get_sprint(tag) == wanted)


def _tasks_page(scope, status=None, sprint=None, page=1, page_size=DEFAULT_PAGE_SIZE):
    page, page_size = _page_args(page, page_size)
    if not _has_tasks(scope):
        return _page_result([], 0, 1, page_size)

    def scoped():
        """A fresh scoped query with the optional filters applied."""
        query, Task, Project = _task_scope(scope)
        if status:
            query = query.where(Task.status == status)
        if sprint:
            query = query.where(Coalesce(_user_tags_col(Task), "").isin(list(tags)))
        return query, Task, Project

    if sprint:
        tags = _sprint_tag_values(scope, sprint)
        if not tags:  # no task carries this sprint any more
            return _page_result([], 0, 1, page_size)

    query, _t, _p = scoped()
    total = cint(query.select(Count("*")).run()[0][0])
    pages = max(1, math.ceil(total / page_size))
    page = min(page, pages)  # e.g. the last page emptied while you were looking at it

    query, Task, Project = scoped()
    rows = (
        query.select(
            Task.name, Task.subject, Task.status, Task.priority, Task.project,
            Project.project_name, _user_tags_col(Task),
            Task.exp_start_date, Task.exp_end_date,
        )
        .orderby(Task.modified, order=Order.desc)
        .orderby(Task.name, order=Order.desc)
        .limit(page_size)
        .offset((page - 1) * page_size)
        .run(as_dict=True)
    )

    # who each task on this page is assigned to (several people are possible);
    # only the admin's all-employees view shows it
    assignees = _task_assignees([r.name for r in rows]) if scope.kind == "all" else {}
    for r in rows:
        r["sprint"] = get_sprint(r.pop("_user_tags", None))
        r["assigned_to"] = assignees.get(r.name, [])
    return _page_result(rows, total, page, page_size)


def _people_names(users):
    """Login user -> display name: the Employee name if the user may read that
    Employee (Active first), else the user's full name (Frappe's own helper,
    the same one it uses to show who a document is assigned to)."""
    users = [u for u in set(users) if u]
    if not users:
        return {}
    names = {}
    for e in _permitted_employees(
        {"user_id": ["in", users]},
        fields=["user_id", "employee_name"],
        order_by="status asc",  # "Active" sorts before "Inactive" / "Left"
    ):
        names.setdefault(e.user_id, e.employee_name)
    return {u: names.get(u) or get_fullname(u) for u in users}


def _task_assignees(task_names):
    """Task -> sorted list of the names of the people it is assigned to."""
    if not task_names:
        return {}
    ToDo = DocType("ToDo")
    rows = (
        frappe.qb.from_(ToDo)
        .select(ToDo.reference_name, ToDo.allocated_to)
        .where(ToDo.reference_type == "Task")
        .where(ToDo.reference_name.isin(task_names))
        .where(ToDo.status != "Cancelled")
        .distinct()
        .run(as_dict=True)
    )
    names = _people_names(r.allocated_to for r in rows)
    out = {}
    for r in rows:
        out.setdefault(r.reference_name, set()).add(names.get(r.allocated_to, r.allocated_to))
    return {task: sorted(people) for task, people in out.items()}

# ---------------------------------------------------------------- timesheet table

def _timesheet_scope(scope):
    """The timesheets a view covers. Returns (query, Timesheet).
      "all":      every timesheet that is not cancelled
      "employee": by Employee, or by their user if set"""
    TS = DocType("Timesheet")
    query = frappe.qb.from_(TS).where(TS.docstatus < 2)
    if scope.kind == "all":
        return query, TS

    match = TS.employee == scope.employee
    if scope.user:  # `user = NULL` never matched in the old SQL, so only add it when set
        match = match | (TS.user == scope.user)
    return query.where(match), TS


def _timesheets_page(scope, page=1, page_size=DEFAULT_PAGE_SIZE):
    page, page_size = _page_args(page, page_size)

    query, TS = _timesheet_scope(scope)
    total = cint(query.select(Count("*")).run()[0][0])
    pages = max(1, math.ceil(total / page_size))
    page = min(page, pages)

    query, TS = _timesheet_scope(scope)
    rows = (
        query.select(
            TS.name, TS.status, TS.start_date, TS.end_date, TS.total_hours,
            TS.employee, TS.employee_name,  # whose timesheet it is
        )
        .orderby(TS.start_date, order=Order.desc)
        .orderby(TS.name, order=Order.desc)
        .limit(page_size)
        .offset((page - 1) * page_size)
        .run(as_dict=True)
    )
    return _page_result(rows, total, page, page_size)

# ---------------------------------------------------------------- admin workload

def _workload():
    """Admin cards: active tasks per assignee and hours per employee (top TOP_PEOPLE)."""
    Task, ToDo, TS = DocType("Task"), DocType("ToDo"), DocType("Timesheet")
    active = Task.status.notin(["Completed", "Cancelled"])
    no_templates = frappe.get_meta("Task").has_field("is_template")

    # active tasks per person (a task with two assignees counts for both)
    per_user = (
        frappe.qb.from_(ToDo)
        .join(Task).on(Task.name == ToDo.reference_name)
        .select(ToDo.allocated_to, Count(Task.name).distinct().as_("n"))
        .where(ToDo.reference_type == "Task")
        .where(ToDo.status != "Cancelled")
        .where(active)
    )
    if no_templates:
        per_user = per_user.where(Task.is_template == 0)
    per_user = per_user.groupby(ToDo.allocated_to).run(as_dict=True)

    names = _people_names(r.allocated_to for r in per_user)
    assignees = sorted(
        ({"user": r.allocated_to, "name": names.get(r.allocated_to, r.allocated_to), "n": cint(r.n)}
         for r in per_user),
        key=lambda r: (-r["n"], r["name"]),
    )

    # active tasks nobody is assigned to
    assigned = (
        frappe.qb.from_(ToDo).select(ToDo.reference_name)
        .where(ToDo.reference_type == "Task").where(ToDo.status != "Cancelled")
    )
    unassigned = frappe.qb.from_(Task).select(Count("*")).where(active).where(Task.name.notin(assigned))
    if no_templates:
        unassigned = unassigned.where(Task.is_template == 0)
    unassigned = cint(unassigned.run()[0][0])

    # hours per employee
    per_employee = (
        frappe.qb.from_(TS)
        .select(TS.employee, TS.employee_name,
                Coalesce(Sum(TS.total_hours), 0).as_("hours"), Count("*").as_("n"))
        .where(TS.docstatus < 2)
        .groupby(TS.employee, TS.employee_name)
        .run(as_dict=True)
    )
    hours = sorted(
        ({"employee": r.employee, "name": r.employee_name or r.employee or _("No employee"),
          "hours": flt(r.hours, 2), "n": cint(r.n)} for r in per_employee),
        key=lambda r: (-r["hours"], r["name"]),
    )

    return {
        "assignees": assignees[:TOP_PEOPLE],
        "assignee_count": len(assignees),
        "unassigned_active": unassigned,
        "hours_by_employee": hours[:TOP_PEOPLE],
        "employee_hours_count": len(hours),
        "active_employees": len(_permitted_employees({"status": "Active"}, fields=["name"], order_by=None)),
    }


# ---------------------------------------------------------------- API

@frappe.whitelist()
def get_dashboard_data(employee=None, task_status=None, task_sprint=None,
                       task_page=1, timesheet_page=1, page_size=DEFAULT_PAGE_SIZE,
                       task_page_size=None, timesheet_page_size=None):
    """Everything for the first load (and live reloads) in one call:
    the summary numbers plus the current page of each table.
    employee: an Employee ID, or "__all__" for the admin's company-wide view.
    task_page_size / timesheet_page_size: rows per page of each table
    (each falls back to page_size)."""
    scope = _resolve_scope(employee)

    summary = {**_task_summary(scope), **_timesheet_summary(scope)}
    if scope.kind == "all":
        summary.update(_workload())

    return {
        "scope": scope.kind,
        "is_admin": is_admin(),
        "employee_id": scope.employee,
        "user": scope.user,
        "employee": scope.emp,
        "summary": summary,
        "tasks": _tasks_page(scope, task_status, task_sprint, task_page, task_page_size or page_size),
        "timesheets": _timesheets_page(scope, timesheet_page, timesheet_page_size or page_size),
    }


@frappe.whitelist()
def get_tasks_page(employee=None, status=None, sprint=None, page=1, page_size=DEFAULT_PAGE_SIZE):
    """One page of the Tasks table (used by the filter chips and the pager)."""
    scope = _resolve_scope(employee)
    return {"employee_id": scope.employee, **_tasks_page(scope, status, sprint, page, page_size)}


@frappe.whitelist()
def get_timesheets_page(employee=None, page=1, page_size=DEFAULT_PAGE_SIZE):
    """One page of the Timesheets table (used by the pager)."""
    scope = _resolve_scope(employee)
    return {"employee_id": scope.employee, **_timesheets_page(scope, page, page_size)}
