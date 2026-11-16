"""
Sample data for testing the Task Dashboard on erp.teceze.local.

Put this file next to task_dashboard.py:
    apps/teceze/teceze/teceze/page/task_dashboard/test_data.py

The manager is your existing test user priya.ramesh@teceze.com. This file
adds three sample employees who report to her, two projects, tasks and
timesheets.

---- From the Frappe console --------------------------------------------

    bench --site erp.teceze.local console

    In [1]: from teceze.teceze.page.task_dashboard.test_data import create, live_demo, cleanup
    In [2]: create()        # add the sample records
    In [3]: live_demo()     # one change every 8 seconds; watch the dashboard
    In [4]: cleanup()       # remove everything this file created

    Each function saves its own changes. If one fails, it undoes its own
    half-finished work, so you can fix the problem and simply run it again.

---- Or straight from the terminal ---------------------------------------

    bench --site erp.teceze.local execute teceze.teceze.page.task_dashboard.test_data.create
    bench --site erp.teceze.local execute teceze.teceze.page.task_dashboard.test_data.live_demo
    bench --site erp.teceze.local execute teceze.teceze.page.task_dashboard.test_data.cleanup

Everything created here is marked, so cleanup() only removes test records:
    users      -> email ends with @dashtest.example.com
    employees  -> ID starts with DASHTEST-
    projects   -> MARKER in the Notes field
    tasks      -> MARKER in the Description field
    timesheets -> MARKER in the Note field
Priya's own User and Employee records are never changed or deleted.

Use this on a development or test site, not on production.
"""

import time
from datetime import timedelta

import frappe
from frappe.desk.form import assign_to
from frappe.utils import add_days, get_datetime, getdate, nowdate

MANAGER_USER = "priya.ramesh@teceze.com"
DOMAIN = "dashtest.example.com"
MARKER = "dashboard-test-data"
PASSWORD = "DashTest@2026!"

# Direct reports created under the manager.
# key, first name, last name, designation, gets a login user?
REPORTS = [
    ("arjun", "Arjun", "Rao", "Software Engineer", True),
    ("sneha", "Sneha", "Pillai", "QA Analyst", True),
    ("vikram", "Vikram", "Das", "Field Technician", False),  # no login: timesheets only
]

PROJECTS = {
    "portal": "Customer Portal Revamp",
    "mobile": "Mobile Field App",
}

# person ("manager" = Priya), subject, status, priority, project, sprint tag, due date (days from today)
TASKS = [
    ("manager", "Finalise portal wireframes", "Completed", "Medium", "portal", "Sprint 01", -20),
    ("manager", "Set up CI pipeline", "Completed", "High", "portal", "Sprint 01", -15),
    ("manager", "Login and SSO integration", "Working", "Urgent", "portal", "Sprint 02", 3),
    ("manager", "Customer profile page", "Working", "High", "portal", "Sprint 02", 5),
    ("manager", "API rate limit review", "Overdue", "High", "portal", "Sprint 02", -2),
    ("manager", "Offline sync design", "Open", "Medium", "mobile", "Sprint 03", 12),
    ("manager", "Push notification spike", "Open", "Low", "mobile", "Sprint 03", -1),  # past due date
    ("manager", "Quarterly roadmap notes", "Pending Review", "Low", None, None, 7),
    ("arjun", "Build customer profile API", "Working", "High", "portal", "Sprint 02", 4),
    ("arjun", "Write unit tests for auth module", "Open", "Medium", "portal", "Sprint 02", 6),
    ("arjun", "Configure staging server", "Completed", "Medium", "portal", "Sprint 01", -12),
    ("arjun", "Map field visit data model", "Pending Review", "Low", "mobile", "Sprint 03", 2),
    ("sneha", "Regression test plan for portal", "Working", "High", "portal", "Sprint 02", 3),
    ("sneha", "Test offline sync scenarios", "Working", "Medium", "mobile", "Sprint 03", 10),
    ("sneha", "Smoke test release 1.0", "Completed", "Low", "portal", "Sprint 01", -8),
]

# person, submit it?, time logs: (day from today, hours, project)
TIMESHEETS = [
    ("manager", True, [(-9, 8, "portal"), (-8, 7.5, "portal")]),
    ("manager", True, [(-2, 8, "mobile")]),
    ("manager", False, [(-1, 4, None)]),
    ("arjun", True, [(-5, 8, "portal")]),
    ("arjun", False, [(-1, 6, "portal")]),
    ("sneha", True, [(-3, 7.5, "portal")]),
    ("vikram", True, [(-4, 8, "mobile")]),
    ("vikram", False, [(-1, 8, "mobile")]),
]

# Times of day to try for a time log. Priya may already have real timesheets,
# so if 09:00 overlaps one of hers, the next start time is tried.
START_HOURS = (9, 6, 19, 2)


# ---------------------------------------------------------------- helpers

def _manager(manager_user):
    emp = frappe.db.get_value(
        "Employee", {"user_id": manager_user, "status": "Active"}, ["name", "company"], as_dict=True
    )
    if not emp:
        frappe.throw(f"{manager_user} is not linked to an active Employee.")
    return emp


def _ensure(doctype, value, fieldname):
    """Create a simple master record (Designation, Activity Type) if it's missing."""
    if not frappe.db.exists(doctype, value):
        frappe.get_doc({"doctype": doctype, fieldname: value}).insert(ignore_permissions=True)


# fields we never copy from another record
_NO_COPY = {"naming_series", "amended_from", "employee_name", "user_id", "reports_to", "status", "company"}
_DATE_END_WORDS = {"end", "to", "due", "till", "expiry"}


def _template(doctype, filters):
    """The most recently changed record of this type, used to copy your site's
    custom mandatory values (department, project type ...) from."""
    name = frappe.db.get_value(doctype, filters, "name", order_by="modified desc")
    return frappe.get_doc(doctype, name) if name else None


def _fallback(df):
    """A sensible value for a mandatory field when there is nothing to copy."""
    today = getdate(nowdate())
    if df.fieldtype in ("Date", "Datetime"):
        # end-type dates go into the future, others into the past,
        # so the record covers the sample tasks (due -20 .. +12 days)
        is_end = bool(set(df.fieldname.split("_")) & _DATE_END_WORDS)
        day = add_days(today, 60 if is_end else -30)
        return day if df.fieldtype == "Date" else f"{day} 09:00:00"
    if df.fieldtype == "Link":
        return frappe.db.get_value(df.options, {}, "name")
    if df.fieldtype == "Select":
        return next((o for o in (df.options or "").split("\n") if o.strip()), None)
    if df.fieldtype in ("Int", "Float", "Currency", "Percent"):
        return 1
    if df.fieldtype in ("Data", "Small Text", "Text", "Long Text", "Text Editor"):
        return "Sample data"
    return None


def _fill_required(doctype, values, template=None, prefer=None):
    """Your site has extra mandatory fields on several forms (Employee: department,
    default_shift, custom_country ...; Project: project_type, department, dates ...).
    Fill every mandatory field we haven't set ourselves:
      1. from `prefer` (values we know are right for this manager),
      2. else copied from `template` (an existing record of the same type),
      3. else a sensible fallback (dates relative to today, first linked record ...).
    Dates are never copied, so they always fit around the sample tasks."""
    prefer = prefer or {}
    for df in frappe.get_meta(doctype).fields:
        name = df.fieldname
        if name in _NO_COPY or values.get(name) or df.fieldtype in ("Table", "Table MultiSelect", "Check"):
            continue
        if not (df.reqd or df.mandatory_depends_on):
            continue
        value = prefer.get(name)
        if not value and template and df.fieldtype not in ("Date", "Datetime"):
            value = template.get(name)
        if not value and df.reqd:
            value = _fallback(df)
        if value:
            values[name] = value
    return values


def _shift_with_holiday_list(preferred):
    """Your app's Employee hook (teceze/overrides/employee.py) creates a shift and
    holiday assignment for every new Employee, and needs the shift to have a
    Holiday List. Use the manager's shift if it has one, otherwise any shift that does."""
    if not frappe.get_meta("Shift Type").has_field("holiday_list"):
        return preferred
    if preferred and frappe.db.get_value("Shift Type", preferred, "holiday_list"):
        return preferred
    shift = frappe.db.get_value("Shift Type", {"holiday_list": ["is", "set"]}, "name")
    if not shift:
        frappe.throw(
            "No Shift Type has a Holiday List. Open any Shift Type (e.g. "
            f"{preferred or 'your default shift'}), set its Holiday List, and run create() again."
        )
    return shift


def _make_user(key, first, last):
    email = f"{key}@{DOMAIN}"
    if frappe.db.exists("User", email):  # left over from an earlier attempt
        return email
    roles = [{"role": r} for r in ("Projects User", "Employee") if frappe.db.exists("Role", r)]
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": first,
        "last_name": last,
        "user_type": "System User",
        "send_welcome_email": 0,
        "roles": roles,
    })
    user.new_password = PASSWORD
    user.insert(ignore_permissions=True)
    return user.name


def _time_log(day, hours, project, start_hour=9, task=None):
    start = get_datetime(f"{add_days(nowdate(), day)} {start_hour:02d}:00:00")
    return _fill_required("Timesheet Detail", {
        "activity_type": "Development",
        "from_time": start,
        "to_time": start + timedelta(hours=hours),
        "hours": hours,
        "project": project,
        "task": task,
    })


def _add_timesheet(employee, company, logs, submit):
    """Insert a timesheet, moving it to another time of day if it overlaps an existing one.
    logs: [(day from today, hours, project, task)]"""
    for hour in START_HOURS:
        try:
            ts = frappe.get_doc(_fill_required("Timesheet", {
                "doctype": "Timesheet",
                "employee": employee,
                "company": company,
                "note": MARKER,
                "time_logs": [_time_log(day, hrs, proj, hour, task) for day, hrs, proj, task in logs],
            }, _template("Timesheet", {"company": company}))).insert(ignore_permissions=True)
            if submit:
                ts.submit()
            return ts
        except Exception as e:
            if type(e).__name__ != "OverlapError":
                raise
            frappe.clear_messages()
    frappe.throw("Could not find a free time slot for a sample timesheet.")


def _assign(task_name, user, subject):
    assign_to.add({"assign_to": [user], "doctype": "Task", "name": task_name, "description": subject})


def _set_status(task_name, status, user):
    task = frappe.get_doc("Task", task_name)
    task.status = status
    if status == "Completed":
        task.completed_on = min(getdate(task.exp_end_date or nowdate()), getdate(nowdate()))
        task.completed_by = user
    task.save(ignore_permissions=True)


def _test_task(subject):
    return frappe.db.get_value("Task", {"subject": subject, "description": ["like", f"%{MARKER}%"]}, "name")


def _test_project(title):
    return frappe.db.get_value("Project", {"project_name": title, "notes": ["like", f"%{MARKER}%"]}, "name")


def _print_expected(manager_user):
    """Ask the dashboard's own API what it will show, logged in as the manager."""
    from teceze.teceze.page.task_dashboard.task_dashboard import get_dashboard_data, get_dropdown_employees

    previous = frappe.session.user
    try:
        frappe.set_user(manager_user)
        for e in get_dropdown_employees()["employees"]:
            d = get_dashboard_data(e["employee"])["summary"]
            counts = {r["status"]: r["total"] for r in d["task_status_counts"]}
            print(
                f"  {e['employee_name']:<16} Total {d['total_tasks']:>2} | "
                f"Open {counts.get('Open', 0)} | In Progress {counts.get('Working', 0)} | "
                f"Completed {counts.get('Completed', 0)} | "
                f"Hours {d['total_hours']:.2f} ({d['timesheet_count']} timesheets)"
            )
    finally:
        frappe.set_user(previous)


# ---------------------------------------------------------------- create

def create(manager_user=MANAGER_USER):
    """Create the sample employees, projects, tasks and timesheets under the manager."""
    if frappe.db.exists("Employee", {"name": ["like", "DASHTEST-%"]}):
        frappe.throw("Sample data already exists. Run cleanup() first.")

    try:
        _create(manager_user)
        frappe.db.commit()
    except Exception:
        frappe.db.rollback()  # undo the half-finished records so you can simply run it again
        raise

    print(f"\nSample data created. Log in as {manager_user} and open /app/task-dashboard")
    print("The dashboard should show (your existing records are included in these numbers):\n")
    _print_expected(manager_user)
    print(f"\nSample report logins: arjun@{DOMAIN}, sneha@{DOMAIN}  password: {PASSWORD}\n")


def _create(manager_user):
    frappe.flags.mute_emails = True
    manager = _manager(manager_user)
    template = frappe.get_doc("Employee", manager.name)
    shift = _shift_with_holiday_list(template.get("default_shift"))
    today = getdate(nowdate())

    for person in REPORTS:
        _ensure("Designation", person[3], "designation_name")
    _ensure("Activity Type", "Development", "activity_type")

    # ---- people: User (login) + Employee, reporting to the manager ----
    emp, users = {"manager": manager.name}, {"manager": manager_user}
    for key, first, last, designation, has_login in REPORTS:
        user = _make_user(key, first, last) if has_login else None
        values = _fill_required("Employee", {
            "doctype": "Employee",
            "first_name": first,
            "last_name": last,
            "employee_number": f"DASHTEST-{key.upper()}",
            "date_of_birth": "1992-05-14",
            "date_of_joining": add_days(today, -400),
            "company": manager.company,
            "status": "Active",
            "designation": designation,
            "user_id": user,
            "reports_to": manager.name,
            "default_shift": shift,
        }, template)  # template = the manager's own Employee record
        # a fixed DASHTEST- ID, so your real employee numbering is not used up
        doc = frappe.get_doc(values).insert(ignore_permissions=True, set_name=f"DASHTEST-{key.upper()}")
        emp[key], users[key] = doc.name, user

    # ---- projects ----
    if frappe.get_meta("Project").get_field("project_type") and not frappe.db.count("Project Type"):
        _ensure("Project Type", "Internal", "project_type")
    project_template = _template("Project", {"company": manager.company})
    proj = {}
    for key, title in PROJECTS.items():
        doc = frappe.get_doc(_fill_required("Project", {
            "doctype": "Project",
            "project_name": title,
            "company": manager.company,
            "status": "Open",
            "notes": MARKER,
        }, project_template, prefer={"department": template.get("department")})).insert(ignore_permissions=True)
        proj[key] = doc.name

    # ---- tasks: create, tag the sprint, assign (makes the ToDo), then set status ----
    created_tasks = []  # (person, task name, project) for linking timesheet rows
    task_template = _template("Task", {"company": manager.company})
    task_prefer = {"project": proj["portal"], "department": template.get("department")}
    for who, subject, status, priority, pkey, sprint, due in TASKS:
        task = frappe.get_doc(_fill_required("Task", {
            "doctype": "Task",
            "subject": subject,
            "status": "Open",
            "priority": priority,
            "project": proj.get(pkey),
            "company": manager.company,
            "exp_start_date": add_days(today, due - 5),
            "exp_end_date": add_days(today, due),
            "description": MARKER,
        }, task_template, prefer=task_prefer)).insert(ignore_permissions=True)
        created_tasks.append((who, task.name, task.project, status))
        if sprint:
            task.add_tag(sprint)
        if users.get(who):
            _assign(task.name, users[who], subject)
        if status != "Open":
            _set_status(task.name, status, users.get(who))

    # ---- timesheets ----
    # Your site makes Task mandatory on each timesheet row, and ERPNext requires
    # that task to belong to the row's project. So each row gets a sample task
    # from the same project, preferably one assigned to that person.
    # Submitting a timesheet can change the linked task's status on your site
    # (Open -> Working, even Completed -> Working), so tasks that are already
    # Working come first: logging hours on them leaves every status as designed.
    IN_PROGRESS = ("Working",)

    def task_for(who, project):
        same_project = [t for t in created_tasks if t[2] == project]
        candidates = (
            [t for t in same_project if t[0] == who and t[3] in IN_PROGRESS]
            or [t for t in same_project if t[3] in IN_PROGRESS]
            or [t for t in same_project if t[0] == who]
            or same_project
            or created_tasks
        )
        pick = candidates[0]
        return pick[1], pick[2]

    for who, submit, logs in TIMESHEETS:
        rows = []
        for day, hours, pkey in logs:
            task, project = task_for(who, proj.get(pkey))
            rows.append((day, hours, project, task))
        _add_timesheet(emp[who], manager.company, rows, submit)


# ---------------------------------------------------------------- live demo

def live_demo(manager_user=MANAGER_USER, pause=8):
    """Change one record at a time so you can watch the dashboard update by itself."""
    frappe.flags.mute_emails = True
    manager = _manager(manager_user)
    portal = _test_project(PROJECTS["portal"])
    if not portal or not _test_task("Offline sync design"):
        frappe.throw("Sample data not found. Run create() first.")

    def move_to_working():
        _set_status(_test_task("Offline sync design"), "Working", manager_user)

    def assign_new_task():
        task = frappe.get_doc(_fill_required("Task", {
            "doctype": "Task",
            "subject": "Hotfix: session timeout on login",
            "status": "Open",
            "priority": "Urgent",
            "project": portal,
            "company": manager.company,
            "exp_start_date": nowdate(),
            "exp_end_date": add_days(nowdate(), 1),
            "description": MARKER,
        }, _template("Task", {"company": manager.company}),
            prefer={"department": frappe.db.get_value("Employee", manager.name, "department")},
        )).insert(ignore_permissions=True)
        task.add_tag("Sprint 03")
        _assign(task.name, manager_user, task.subject)

    def complete_task():
        _set_status(_test_task("Login and SSO integration"), "Completed", manager_user)

    def log_time():
        task = _test_task("Customer profile page")  # a sample task in the portal project
        _add_timesheet(manager.name, manager.company, [(0, 6, portal, task)], submit=True)

    def rename_project():
        project = frappe.get_doc("Project", portal)
        project.project_name = "Customer Portal v2"
        project.save(ignore_permissions=True)

    def change_report_designation():
        doc = frappe.get_doc("Employee", "DASHTEST-ARJUN")
        doc.designation = "QA Analyst"
        doc.save(ignore_permissions=True)

    def unassign_task():
        assign_to.remove("Task", _test_task("Quarterly roadmap notes"), manager_user)

    steps = [
        ("Task 'Offline sync design' moved from Open to Working",
         "Open -1, In Progress +1", move_to_working),
        ("New task assigned to you: 'Hotfix: session timeout on login'",
         "Total Tasks +1, Open +1, new row at the top of the Tasks table", assign_new_task),
        ("Task 'Login and SSO integration' completed",
         "Completed +1, In Progress -1, Sprint 02 progress bar grows", complete_task),
        ("New 6-hour timesheet submitted for today",
         "Hours Logged +6.00, timesheet count +1, new row in the Timesheets table", log_time),
        ("Project renamed to 'Customer Portal v2'",
         "Name changes in 'Tasks by project' and the Project column", rename_project),
        ("Arjun Rao's designation changed to 'QA Analyst'",
         "Switch to Arjun in the picker: 'Active role' shows QA Analyst", change_report_designation),
        ("Your assignment removed from 'Quarterly roadmap notes'",
         "Total Tasks -1, the task disappears from the table", unassign_task),
    ]

    print(f"\nLive demo: one change every {pause} seconds. Keep the dashboard open as {manager_user}.\n")
    for i, (what, expect, run) in enumerate(steps, 1):
        try:
            run()
            frappe.db.commit()  # realtime events are sent when the change is committed
        except Exception:
            frappe.db.rollback()
            raise
        print(f"[{i}/{len(steps)}] {what}\n        Watch for: {expect}\n")
        if i < len(steps):
            time.sleep(pause)

    print("Done. Run cleanup() and then create() if you want to run the demo again.")


# ---------------------------------------------------------------- cleanup

def _delete_linked_to_test_employees():
    """Delete every record that points at a DASHTEST- employee, whatever the
    linking field is called: `employee` (Leave Allocation, Shift Assignment ...),
    `assigned_to` (Holiday List Assignment, a Dynamic Link) or anything else."""
    fields = [
        (f.dt, f.fieldname, f.fieldtype, f.options)
        for f in frappe.get_all(
            "DocField",
            filters={"fieldtype": ["in", ["Link", "Dynamic Link"]]},
            fields=["parent as dt", "fieldname", "fieldtype", "options"],
        )
    ] + [
        (f.dt, f.fieldname, f.fieldtype, f.options)
        for f in frappe.get_all(
            "Custom Field",
            filters={"fieldtype": ["in", ["Link", "Dynamic Link"]]},
            fields=["dt", "fieldname", "fieldtype", "options"],
        )
    ]

    # doctype -> fields that can hold an Employee ID
    by_doctype = {}
    for dt, fieldname, fieldtype, options in fields:
        if fieldtype == "Dynamic Link" or options == "Employee":
            by_doctype.setdefault(dt, set()).add(fieldname)

    for doctype, fieldnames in sorted(by_doctype.items()):
        if doctype == "Employee" or not frappe.db.exists("DocType", doctype):
            continue
        meta = frappe.get_meta(doctype)
        if meta.istable or meta.issingle or getattr(meta, "is_virtual", 0):
            continue
        if not frappe.db.table_exists(doctype):
            continue
        rows = frappe.get_all(
            doctype,
            or_filters={f: ["like", "DASHTEST-%"] for f in fieldnames},
            fields=["name", "docstatus"],
        )
        for row in rows:
            try:
                if row.docstatus == 1:
                    frappe.get_doc(doctype, row.name).cancel()
                frappe.delete_doc(doctype, row.name, force=1, ignore_permissions=True)
            except Exception:
                # test records only: if the normal delete is blocked, remove the row directly
                frappe.clear_messages()
                frappe.db.delete(doctype, {"name": row.name})
        if rows:
            print(f"  removed {len(rows)} {doctype} record(s)")


def cleanup():
    """Delete every record this file created (and nothing else)."""
    frappe.flags.mute_emails = True
    like = f"%{MARKER}%"
    try:
        for ts in frappe.get_all("Timesheet", filters={"note": ["like", like]}, fields=["name", "docstatus"]):
            if ts.docstatus == 1:
                frappe.get_doc("Timesheet", ts.name).cancel()
            frappe.delete_doc("Timesheet", ts.name, force=1, ignore_permissions=True)

        for task in frappe.get_all("Task", filters={"description": ["like", like]}, pluck="name"):
            for todo in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": task}, pluck="name"):
                frappe.delete_doc("ToDo", todo, force=1, ignore_permissions=True)
            frappe.delete_doc("Task", task, force=1, ignore_permissions=True)

        for project in frappe.get_all("Project", filters={"notes": ["like", like]}, pluck="name"):
            frappe.delete_doc("Project", project, force=1, ignore_permissions=True)

        # Your app creates extra records for every new Employee (leave allocations,
        # shift and holiday assignments ...). Remove anything linked to a test employee.
        _delete_linked_to_test_employees()

        for e in frappe.get_all("Employee", filters={"name": ["like", "DASHTEST-%"]}, pluck="name"):
            frappe.delete_doc("Employee", e, force=1, ignore_permissions=True)

        for user in frappe.get_all("User", filters={"name": ["like", f"%@{DOMAIN}"]}, pluck="name"):
            frappe.delete_doc("User", user, force=1, ignore_permissions=True)

        frappe.db.commit()
    except Exception:
        frappe.db.rollback()
        raise
    print("Sample data removed. (Designations, the Activity Type and sprint tags are left in place.)")
