frappe.pages["attendance_calendar"].on_page_load = function (wrapper) {

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Attendance Calendar",
        single_column: true
    });


    // =========================================================
    // VARIABLES
    // =========================================================

    let employee = null;                    // selected employee ID

    let attendance_calendar = null;         // frappe.views.Calendar instance
    let attendance_calendar_filters = [];

    let attendance_working_hours = {};      // grouped record per date
    let attendance_records_by_date = {};    // original rows per date
    let holiday_calendar_data = {};
    let attendance_request_data = {};       // visible requests per date
    let attendance_requests = [];           // visible requests (Pending Approval / Approved)
    let leave_application_data = {};        // visible leave applications per date

    let employee_holiday_list = null;
    let employee_default_shift = null;

    let calendar_events_observer = null;
    let calendar_height_observer = null;
    let calendar_render_timer = null;
    let employee_selection_timer = null;

    let request_load_error_shown = false;

    // Leave Type list (standard "Leave Type" DocType). Fetched once
    // per page life and shared by every employee load.
    // key = lowercase name, value = official Leave Type name.
    let leave_type_names = {};
    let leave_types_loaded = false;
    let leave_types_promise = null;

    // Every employee switch gets a new token. A load that finishes
    // with an old token is ignored, so fast switching never mixes
    // data and a "stuck" loading flag is impossible.
    let load_token = 0;


    // =========================================================
    // ATTENDANCE REQUEST CONFIGURATION
    //
    // The code you supplied did not fetch Attendance Requests, so
    // this block is new. The status of an Attendance Request in
    // HRMS comes from the workflow, normally stored in the
    // "workflow_state" field. If your installation stores it in a
    // different field, change ATTENDANCE_REQUEST_STATUS_FIELD only.
    // =========================================================

    const ATTENDANCE_REQUEST_DOCTYPE = "Attendance Request";

    const ATTENDANCE_REQUEST_STATUS_FIELD = "workflow_state";

    // Only these two statuses are ever shown. Draft (and anything
    // else) never reaches the calendar. Stored data is not changed.

    const VISIBLE_REQUEST_STATUSES = ["Pending Approval", "Approved"];


    // Leave Application status. Your Leave Application list shows
    // "Pending Approval" / "Approved", which normally comes from the
    // workflow ("workflow_state"). If your installation keeps it in
    // another field (for example the standard "status"), change
    // LEAVE_APPLICATION_STATUS_FIELD only.

    const LEAVE_APPLICATION_DOCTYPE = "Leave Application";

    const LEAVE_APPLICATION_STATUS_FIELD = "workflow_state";


    const CALENDAR_STATUS_CLASS_MAP = [
        { match: "work from home", className: "cal-event-wfh" },
        { match: "half day",       className: "cal-event-halfday" },
        { match: "present",        className: "cal-event-present" },
        { match: "absent",         className: "cal-event-absent" },
        { match: "leave",          className: "cal-event-leave" }
    ];

    const CALENDAR_STATUS_CLASSNAMES =
        CALENDAR_STATUS_CLASS_MAP.map(function (entry) {
            return entry.className;
        });


    // =========================================================
    // STYLES
    //
    // Colours, holiday boxes, event look, cards and legend all come
    // from the SAME stylesheet the employee_attendance page uses.
    // Only a minimum height is added here so FullCalendar can never
    // collapse into an empty strip. The overview cards and the
    // attendance request chips are styled here too.
    // =========================================================

    if (!document.getElementById("attendance-calendar-page-style")) {

        const style = document.createElement("style");

        style.id = "attendance-calendar-page-style";

        style.textContent = `

            /* ---------- layout: both cards full width, same edges ---------- */

            .attendance-calendar-page .attendance-filter-card,
            .attendance-calendar-page .attendance-calendar-card {
                width: 100% !important;
                max-width: none !important;
                margin: 0 0 20px 0 !important;
                box-sizing: border-box;
            }

            /* ---------- calendar card: breathing room ---------- */

            .attendance-calendar-page .attendance-calendar-card {
                padding: 24px 28px 20px !important;
            }

            .attendance-calendar-page .attendance-calendar-header {
                margin: 0 0 16px 0 !important;
                padding: 0 0 14px 0 !important;
                border-bottom: 1px solid var(--border-color, #e5e7eb);
            }

            .attendance-calendar-page .attendance-calendar-header h3 {
                margin: 0 !important;
                font-size: 18px !important;
                font-weight: 600 !important;
                line-height: 1.3;
            }

            .attendance-calendar-page #attendance-calendar {
                min-height: 650px;
                padding: 0 !important;
                margin: 0 !important;
            }

            .attendance-calendar-page .fc-header-toolbar {
                margin: 0 0 16px 0 !important;
            }

            .attendance-calendar-page .calendar-legend {
                margin-top: 16px !important;
                padding-top: 14px;
                border-top: 1px solid var(--border-color, #e5e7eb);
            }

            .attendance-calendar-page .calendar-placeholder {
                padding: 60px 20px;
                text-align: center;
                color: var(--text-muted, #6b7280);
                font-size: 14px;
            }

            /* ---------- half day: ONLY "Half Day" is bold ---------- */

            .attendance-calendar-page [data-attendance-half-day="1"] .calendar-half-day-status {
                font-weight: 700 !important;
            }

            .attendance-calendar-page [data-attendance-half-day="1"] .calendar-leave-type,
            .attendance-calendar-page [data-attendance-half-day="1"] .calendar-half-day-present,
            .attendance-calendar-page [data-attendance-half-day="1"] .calendar-working-hours {
                font-weight: 400 !important;
            }

            /* ---------- weekly off (WO): grey, same as the employee home page ----------
               Only days where EVERY holiday row is a weekly off get these
               classes. Public holidays (Gandhi Jayanti, Dasara...) keep
               their existing orange look. */

            .attendance-calendar-page .fc .fc-daygrid-day.has-weekly-off,
            .attendance-calendar-page .fc .fc-daygrid-day.has-weekly-off .fc-daygrid-day-frame {
                background: #f6f7fa !important;
            }

            .attendance-calendar-page .fc .fc-daygrid-day .calendar-holiday.calendar-holiday-weekly-off {
                background: #eef0f4 !important;
                border-color: #cdd2db !important;
                border-left-color: #6b7a90 !important;
                color: #3b4558 !important;
            }

            .attendance-calendar-page .fc .fc-daygrid-day .calendar-holiday.calendar-holiday-weekly-off .calendar-holiday-name {
                color: #3b4558 !important;
            }

            [data-theme="dark"] .attendance-calendar-page .fc .fc-daygrid-day.has-weekly-off,
            [data-theme="dark"] .attendance-calendar-page .fc .fc-daygrid-day.has-weekly-off .fc-daygrid-day-frame {
                background: #1d2025 !important;
            }

            [data-theme="dark"] .attendance-calendar-page .fc .fc-daygrid-day .calendar-holiday.calendar-holiday-weekly-off {
                background: #2a2e35 !important;
                border-color: #3a4048 !important;
                border-left-color: #8a96a8 !important;
                color: #c3cad5 !important;
            }

            [data-theme="dark"] .attendance-calendar-page .fc .fc-daygrid-day .calendar-holiday.calendar-holiday-weekly-off .calendar-holiday-name {
                color: #c3cad5 !important;
            }

            /* ---------- attendance overview cards ---------- */

            .attendance-calendar-page .attendance-overview {
                display: grid;
                grid-template-columns: repeat(8, minmax(0, 1fr));
                gap: 12px;
                margin: 0 0 22px 0;
            }

            .attendance-calendar-page .overview-card {
                --ov-accent: #94a3b8;
                position: relative;
                min-width: 0;
                min-height: 76px;
                padding: 12px 14px 12px 16px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: center;
                background: #fbfcfe;
                border: 1px solid #e6e9ef;
                border-left: 4px solid var(--ov-accent);
                border-radius: 12px;
            }

            .attendance-calendar-page .overview-card-count {
                color: var(--ov-accent);
                font-size: 24px;
                font-weight: 700;
                line-height: 1.1;
            }

            .attendance-calendar-page .overview-card-label {
                margin-top: 6px;
                color: #56627a;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: .06em;
                line-height: 1.25;
                text-transform: uppercase;
            }

            .attendance-calendar-page .overview-card.is-zero .overview-card-count,
            .attendance-calendar-page .overview-card.is-zero .overview-card-label {
                opacity: .55;
            }

            .attendance-calendar-page .overview-present  { --ov-accent: #178a4c; }
            .attendance-calendar-page .overview-absent   { --ov-accent: #dc4b4b; }
            .attendance-calendar-page .overview-halfday  { --ov-accent: #8b5cf6; }
            .attendance-calendar-page .overview-wfh      { --ov-accent: #2c9bb8; }
            .attendance-calendar-page .overview-leave    { --ov-accent: #2563eb; }
            .attendance-calendar-page .overview-weekoff  { --ov-accent: #475569; }
            .attendance-calendar-page .overview-holidays { --ov-accent: #d97706; }
            .attendance-calendar-page .overview-pending  { --ov-accent: #ea580c; }

            @media (max-width: 1280px) {
                .attendance-calendar-page .attendance-overview {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
            }

            @media (max-width: 600px) {
                .attendance-calendar-page .attendance-overview {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }

            [data-theme="dark"] .attendance-calendar-page .overview-card {
                background: #20242a;
                border-color: #30353c;
                border-left-color: var(--ov-accent);
            }

            [data-theme="dark"] .attendance-calendar-page .overview-card-label {
                color: #aeb6c2;
            }

            /* ---------- leave application status ---------- */

            .attendance-calendar-page .calendar-leave-group {
                order: 3;
                margin-top: 3px;
            }

            .attendance-calendar-page .calendar-leave-application-status {
                display: inline-block;
                margin-top: 3px;
                padding: 0 7px;
                background: #e8f6ed;
                color: #166534;
                border: 1px solid #c3e6d0;
                border-radius: 999px;
                font-size: 10px;
                line-height: 15px;
                font-weight: 600;
                white-space: nowrap;
            }

            /* ---------- attendance request chips (inside a day cell) ---------- */

            .attendance-calendar-page .calendar-request-group {
                order: 3;
                margin-top: 3px;
            }

            .attendance-calendar-page .calendar-request {
                --rq-accent: #d97706;
                margin: 3px 0 0 0;
                padding: 4px 7px;
                background: #ffffff;
                color: #26344f;
                border: 1px dashed #cfd6e2;
                border-left: 3px solid var(--rq-accent);
                border-radius: 8px;
                font-size: 11px;
                line-height: 1.25;
                font-weight: 600;
            }

            .attendance-calendar-page .calendar-request.request-approved {
                --rq-accent: #178a4c;
            }

            .attendance-calendar-page .calendar-request-reason {
                display: block;
                color: #1e3a8a;
            }

            .attendance-calendar-page .calendar-request-status {
                display: inline-block;
                margin-top: 2px;
                padding: 0 7px;
                border-radius: 999px;
                font-size: 10px;
                line-height: 15px;
                font-weight: 600;
                white-space: nowrap;
            }

            .attendance-calendar-page .request-pending-approval .calendar-request-status {
                background: #fff1e6;
                color: #b4380a;
                border: 1px solid #f6c9a5;
            }

            .attendance-calendar-page .request-approved .calendar-request-status {
                background: #e8f6ed;
                color: #166534;
                border: 1px solid #c3e6d0;
            }

            [data-theme="dark"] .attendance-calendar-page .calendar-request {
                background: #191c20;
                color: #d7dce2;
                border-color: #3a4048;
                border-left-color: var(--rq-accent);
            }

            [data-theme="dark"] .attendance-calendar-page .calendar-request-reason {
                color: #9db8f5;
            }

        `;

        document.head.appendChild(style);

    }


    // =========================================================
    // PAGE HTML
    // =========================================================

    page.main.html(`

        <main class="attendance-container attendance-calendar-page">

            <div class="attendance-filter-card">

                <div class="employee-filter-row">

                    <div class="employee-filter-wrapper">

                        <label>Employee</label>

                        <div id="employee-filter"></div>

                    </div>

                    <div class="employee-filter-wrapper">

                        <label>Employee Name</label>

                        <div id="employee-name-filter"></div>

                    </div>

                </div>

            </div>

            <article class="card attendance-calendar-card">

                <header class="attendance-calendar-header">

                    <h3>Attendance Calendar</h3>

                </header>

                <section class="attendance-overview" id="attendance-overview">

                    <div class="overview-card overview-present is-zero">
                        <div class="overview-card-count" data-overview="present">0</div>
                        <div class="overview-card-label">Present</div>
                    </div>

                    <div class="overview-card overview-absent is-zero">
                        <div class="overview-card-count" data-overview="absent">0</div>
                        <div class="overview-card-label">Absent</div>
                    </div>

                    <div class="overview-card overview-halfday is-zero">
                        <div class="overview-card-count" data-overview="half_day">0</div>
                        <div class="overview-card-label">Half Day</div>
                    </div>

                    <div class="overview-card overview-wfh is-zero">
                        <div class="overview-card-count" data-overview="work_from_home">0</div>
                        <div class="overview-card-label">Work From Home</div>
                    </div>

                    <div class="overview-card overview-leave is-zero">
                        <div class="overview-card-count" data-overview="leave">0</div>
                        <div class="overview-card-label">Leave</div>
                    </div>

                    <div class="overview-card overview-weekoff is-zero">
                        <div class="overview-card-count" data-overview="weekly_off">0</div>
                        <div class="overview-card-label">Weekly Off</div>
                    </div>

                    <div class="overview-card overview-holidays is-zero">
                        <div class="overview-card-count" data-overview="holidays">0</div>
                        <div class="overview-card-label">Holidays</div>
                    </div>

                    <div class="overview-card overview-pending is-zero">
                        <div class="overview-card-count" data-overview="pending_requests">0</div>
                        <div class="overview-card-label">Pending Requests</div>
                    </div>

                </section>

                <div
                    id="attendance-calendar"
                    class="attendance-calendar-container">
                </div>

                <footer class="calendar-legend">

                    <span><i class="legend-dot legend-present"></i>Present</span>

                    <span><i class="legend-dot legend-absent"></i>Absent</span>

                    <span><i class="legend-dot legend-leave"></i>Leave</span>

                    <span><i class="legend-dot legend-holiday"></i>Holiday</span>

                    <span><i class="legend-dot legend-halfday"></i>Half Day</span>

                </footer>

            </article>

        </main>

    `);

    show_placeholder("Select an employee to view the attendance calendar.");


    function show_placeholder(message) {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container.innerHTML =
            `<div class="calendar-placeholder">
                ${frappe.utils.escape_html(message)}
            </div>`;

    }


    // =========================================================
    // EMPLOYEE LINK FIELD
    // =========================================================

    const employee_control = frappe.ui.form.make_control({

        parent: $("#employee-filter"),

        df: {
            fieldtype: "Link",
            options: "Employee",
            fieldname: "employee",
            label: "Employee",
            placeholder: "Search employee name or ID",
            reqd: 0
        },

        render_input: true

    });

    const employee_name_control = frappe.ui.form.make_control({

        parent: $("#employee-name-filter"),

        df: {
            fieldtype: "Data",
            fieldname: "employee_name",
            label: "Employee Name",
            placeholder: "Select an employee",
            reqd: 0
        },

        render_input: true

    });

    employee_name_control.$input.prop("readonly", true);


    function show_employee_name(emp) {

        employee_name_control.set_value("");

        frappe.db
            .get_value("Employee", emp, "employee_name")
            .then(function (r) {

                if (employee !== emp) {
                    return;
                }

                employee_name_control.set_value(
                    (r.message && r.message.employee_name) || ""
                );

            });

    }


    // =========================================================
    // HANDLE EMPLOYEE SELECTION
    // =========================================================

    function handle_employee_selection() {

        const value = employee_control.get_value();

        if (!value) {

            employee = null;

            load_token++;

            employee_name_control.set_value("");

            clear_attendance_calendar();

            show_placeholder(
                "Select an employee to view the attendance calendar."
            );

            return;

        }

        // change + selectcomplete + Enter can all fire for one pick

        if (value === employee) {
            return;
        }

        employee = value;

        show_employee_name(value);

        load_selected_employee(value);

    }


    function schedule_selection(delay) {

        if (employee_selection_timer) {
            clearTimeout(employee_selection_timer);
        }

        employee_selection_timer =
            setTimeout(handle_employee_selection, delay);

    }


    employee_control.$input.on("change", function () {
        schedule_selection(100);
    });

    employee_control.$input.on("awesomplete-selectcomplete", function () {
        schedule_selection(100);
    });

    employee_control.$input.on("keydown", function (e) {

        if (e.key === "Enter") {
            schedule_selection(150);
        }

    });


    // =========================================================
    // LOAD SELECTED EMPLOYEE
    // =========================================================

    function load_selected_employee(emp) {

        if (!emp) {
            return;
        }

        const token = ++load_token;

        clear_attendance_calendar();

        show_placeholder("Loading attendance...");

        load_calendar_data(emp, token, function () {

            // a newer selection started, or the field was cleared

            if (token !== load_token || employee !== emp) {
                return;
            }

            create_attendance_calendar();

        });

    }


    // =========================================================
    // LEAVE TYPE LIST (standard "Leave Type" DocType)
    //
    // Fetched ONCE per page life and shared by every employee
    // load (no repeat API call when the employee changes).
    //
    // It is used as a resolver only: a stored leave type is
    // matched to the official Leave Type name. If the value is
    // not in the list (deleted / renamed type) or the list could
    // not be loaded, the stored historical value is kept as is.
    // Names are never abbreviated or shortened.
    //
    // Attendance statuses (Present, Absent, On Leave, Half Day,
    // Work From Home) are NOT leave types and never go through
    // this resolver.
    // =========================================================

    function load_leave_types() {

        if (leave_types_promise) {
            return leave_types_promise;
        }

        // This promise ALWAYS resolves (even on error), so a failed
        // Leave Type fetch can never stop the calendar from loading.

        leave_types_promise = new Promise(function (resolve) {

            frappe.call({

                method: "frappe.client.get_list",

                args: {

                    doctype: "Leave Type",

                    fields: ["name"],

                    limit_page_length: 0

                },

                callback: function (r) {

                    const names = {};

                    (r.message || []).forEach(function (row) {

                        if (!row.name) {
                            return;
                        }

                        names[String(row.name).trim().toLowerCase()] =
                            row.name;

                    });

                    leave_type_names = names;
                    leave_types_loaded = true;

                    console.log("Leave Types:", leave_type_names);

                    resolve();

                },

                error: function (error) {

                    console.error(
                        "Unable to load Leave Type list. " +
                        "Stored leave types will be shown as saved:",
                        error
                    );

                    leave_type_names = {};
                    leave_types_loaded = false;

                    // allow a retry on the next employee selection

                    leave_types_promise = null;

                    resolve();

                }

            });

        });

        return leave_types_promise;

    }


    // Official Leave Type name when known, otherwise the stored
    // value unchanged. Never returns a shortened name.

    function resolve_leave_type(value) {

        const stored = String(value || "").trim();

        if (!stored) {
            return "";
        }

        return leave_type_names[stored.toLowerCase()] || stored;

    }


    // =========================================================
    // LOAD CALENDAR DATA
    //
    // The Leave Type list is loaded first so it is ready before
    // Attendance and Leave Application rows are processed.
    // =========================================================

    function load_calendar_data(emp, token, callback) {

        load_leave_types().then(function () {

            // a newer selection started while the list was loading

            if (token !== load_token) {
                return;
            }

            load_calendar_working_hours(emp, token, function () {

                load_employee_holiday_details(emp, token, function () {

                    load_attendance_requests(emp, token, function () {

                        load_leave_applications(emp, token, function () {

                            if (callback) {
                                callback();
                            }

                        });

                    });

                });

            });

        });

    }


    // =========================================================
    // GROUP ALL ATTENDANCE RECORDS OF ONE DATE INTO ONE RECORD
    //
    // Status priority:
    //   Half Day > On Leave > Work From Home > Present > Absent
    // Working hours = highest value among the records.
    // Leave type    = unique leave types joined with ", ".
    // =========================================================

    function group_attendance_records(date, date_records) {

        const lower = function (v) {
            return String(v || "").trim().toLowerCase();
        };

        const find_status = function (test) {
            return date_records.find(function (rec) {
                return test(lower(rec.status));
            });
        };

        const half_rec = find_status(function (s) {
            return s === "half day";
        });

        const leave_rec = find_status(function (s) {
            return s === "on leave" || s.indexOf("leave") !== -1;
        });

        const wfh_rec = find_status(function (s) {
            return s === "work from home" || s === "wfh";
        });

        const present_rec = find_status(function (s) {
            return s === "present";
        });

        const absent_rec = find_status(function (s) {
            return s === "absent";
        });


        let grouped_status = date_records[0].status;

        if (half_rec) {
            grouped_status = "Half Day";
        }
        else if (leave_rec) {
            grouped_status = leave_rec.status;
        }
        else if (wfh_rec) {
            grouped_status = wfh_rec.status;
        }
        else if (present_rec) {
            grouped_status = present_rec.status;
        }
        else if (absent_rec) {
            grouped_status = absent_rec.status;
        }


        let grouped_working_hours = 0;

        date_records.forEach(function (rec) {

            const hours = Number(rec.working_hours || 0);

            if (hours > grouped_working_hours) {
                grouped_working_hours = hours;
            }

        });


        const leave_types = [];

        date_records.forEach(function (rec) {

            if (
                rec.leave_type &&
                leave_types.indexOf(rec.leave_type) === -1
            ) {
                leave_types.push(rec.leave_type);
            }

        });


        let grouped_half_day_status = "";

        if (lower(grouped_status) === "half day") {

            if (grouped_working_hours > 0) {

                grouped_half_day_status = "Present";

            }
            else if (
                date_records.some(function (rec) {
                    return lower(rec.half_day_status) === "present";
                })
            ) {

                grouped_half_day_status = "Present";

            }
            else if (
                date_records.some(function (rec) {
                    return lower(rec.half_day_status) === "absent";
                })
            ) {

                grouped_half_day_status = "Absent";

            }

        }


        return {

            attendance_id:
                date_records.map(function (rec) {
                    return rec.attendance_id;
                }).join(","),

            attendance_date: date,

            status: grouped_status,

            working_hours: grouped_working_hours,

            leave_type: leave_types.join(", "),

            half_day_status: grouped_half_day_status,

            records: date_records

        };

    }


    // =========================================================
    // LOAD ATTENDANCE RECORDS (grouped by date)
    // =========================================================

    function load_calendar_working_hours(emp, token, callback) {

        attendance_working_hours = {};
        attendance_records_by_date = {};

        frappe.call({

            method: "frappe.client.get_list",

            args: {

                doctype: "Attendance",

                filters: {
                    employee: emp,
                    docstatus: 1
                },

                fields: [
                    "name",
                    "attendance_date",
                    "status",
                    "working_hours",
                    "leave_type",
                    "half_day_status"
                ],

                order_by: "attendance_date asc, creation asc",

                limit_page_length: 0

            },

            callback: function (r) {

                // stale response -> ignore (the newer load owns the data)

                if (token !== load_token) {
                    return;
                }

                const records = r.message || [];

                records.forEach(function (row) {

                    if (!row.attendance_date) {
                        return;
                    }

                    const date = String(row.attendance_date).slice(0, 10);

                    if (!attendance_records_by_date[date]) {
                        attendance_records_by_date[date] = [];
                    }

                    attendance_records_by_date[date].push({

                        attendance_id: row.name,

                        attendance_date: date,

                        status: String(row.status || "").trim(),

                        working_hours: Number(row.working_hours || 0),

                        // official Leave Type name; falls back to the
                        // stored value for historical / unknown types

                        leave_type: resolve_leave_type(row.leave_type),

                        half_day_status:
                            String(row.half_day_status || "").trim()

                    });

                });

                Object.keys(attendance_records_by_date).forEach(
                    function (date) {

                        const date_records =
                            attendance_records_by_date[date];

                        if (!date_records || !date_records.length) {
                            return;
                        }

                        attendance_working_hours[date] =
                            group_attendance_records(date, date_records);

                    }
                );

                console.log(
                    "Grouped Attendance records:",
                    attendance_working_hours
                );

                if (callback) {
                    callback();
                }

            },

            error: function (error) {

                console.error(
                    "Unable to load Attendance working hours:",
                    error
                );

                if (token !== load_token) {
                    return;
                }

                attendance_working_hours = {};
                attendance_records_by_date = {};

                if (callback) {
                    callback();
                }

            }

        });

    }


    // =========================================================
    // LOAD EMPLOYEE HOLIDAY DETAILS
    //
    // The API now returns "weekly_off" and a description that is
    // already "WO" for weekly offs. Both are kept as returned.
    // Nothing is inferred from Saturday / Sunday.
    // =========================================================

    function load_employee_holiday_details(emp, token, callback) {

        holiday_calendar_data = {};
        employee_holiday_list = null;
        employee_default_shift = null;

        frappe.call({

            method:
                "teceze.api.employee_attendance.get_employee_holiday_details",

            args: { employee: emp },

            callback: function (r) {

                if (token !== load_token) {
                    return;
                }

                const data = r.message || {};

                employee_default_shift = data.default_shift || null;
                employee_holiday_list = data.holiday_list || null;

                (data.holidays || []).forEach(function (holiday) {

                    if (!holiday.holiday_date) {
                        return;
                    }

                    const date = String(holiday.holiday_date).slice(0, 10);

                    if (!holiday_calendar_data[date]) {
                        holiday_calendar_data[date] = [];
                    }

                    holiday_calendar_data[date].push({
                        holiday_list: holiday.holiday_list,
                        holiday_date: holiday.holiday_date,
                        description: holiday.description,
                        custom_status: holiday.custom_status,
                        weekly_off: is_weekly_off_row(holiday)
                    });

                });

                console.log("Employee holiday details:", holiday_calendar_data);

                if (callback) {
                    callback();
                }

            },

            error: function (error) {

                console.error(
                    "Unable to load employee holiday details:",
                    error
                );

                if (token !== load_token) {
                    return;
                }

                holiday_calendar_data = {};

                if (callback) {
                    callback();
                }

            }

        });

    }


    // A row is a weekly off when the API says so: weekly_off = 1,
    // or the API already replaced the description with "WO".

    function is_weekly_off_row(holiday) {

        if (!holiday) {
            return false;
        }

        if (Number(holiday.weekly_off) === 1) {
            return true;
        }

        return String(holiday.description || "").trim() === "WO";

    }


    // =========================================================
    // LOAD ATTENDANCE REQUESTS
    //
    // Only "Pending Approval" and "Approved" requests are kept.
    // Draft (or any other status) is dropped here, before any
    // calendar rendering, and also filtered on the server.
    // The stored status is never modified.
    // =========================================================

    function normalize_request_status(value) {

        const status = String(value || "").trim().toLowerCase();

        if (status === "pending approval") {
            return "Pending Approval";
        }

        if (status === "approved") {
            return "Approved";
        }

        return "";

    }


    function request_date_parts(value) {

        const parts = String(value || "").slice(0, 10).split("-");

        if (parts.length !== 3) {
            return null;
        }

        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);

        if (!y || !m || !d) {
            return null;
        }

        return { y: y, m: m, d: d };

    }


    function expand_request_dates(from_date, to_date) {

        const from = request_date_parts(from_date);
        const to = request_date_parts(to_date || from_date);

        if (!from) {
            return [];
        }

        const start = new Date(from.y, from.m - 1, from.d);
        const end = to ? new Date(to.y, to.m - 1, to.d) : start;

        const dates = [];

        const cursor = new Date(start.getTime());

        // safety cap against bad data

        while (cursor <= end && dates.length < 400) {

            dates.push(event_date_key(cursor));

            cursor.setDate(cursor.getDate() + 1);

        }

        return dates;

    }


    function load_attendance_requests(emp, token, callback) {

        attendance_requests = [];
        attendance_request_data = {};

        const filters = {
            employee: emp
        };

        filters[ATTENDANCE_REQUEST_STATUS_FIELD] =
            ["in", VISIBLE_REQUEST_STATUSES];

        frappe.call({

            method: "frappe.client.get_list",

            args: {

                doctype: ATTENDANCE_REQUEST_DOCTYPE,

                filters: filters,

                fields: [
                    "name",
                    "from_date",
                    "to_date",
                    "reason",
                    "explanation",
                    ATTENDANCE_REQUEST_STATUS_FIELD + " as request_status"
                ],

                order_by: "from_date asc, creation asc",

                limit_page_length: 0

            },

            callback: function (r) {

                if (token !== load_token) {
                    return;
                }

                (r.message || []).forEach(function (row) {

                    // second safety net: only the two visible statuses

                    const status = normalize_request_status(row.request_status);

                    if (!status) {
                        return;
                    }

                    const dates =
                        expand_request_dates(row.from_date, row.to_date);

                    if (!dates.length) {
                        return;
                    }

                    const request = {
                        name: row.name,
                        reason: String(row.reason || "").trim(),
                        explanation: String(row.explanation || "").trim(),
                        status: status,
                        dates: dates
                    };

                    attendance_requests.push(request);

                    dates.forEach(function (date) {

                        if (!attendance_request_data[date]) {
                            attendance_request_data[date] = [];
                        }

                        // one chip per request per date

                        const already =
                            attendance_request_data[date].some(
                                function (existing) {
                                    return existing.name === request.name;
                                }
                            );

                        if (!already) {
                            attendance_request_data[date].push(request);
                        }

                    });

                });

                console.log(
                    "Visible Attendance Requests:",
                    attendance_requests
                );

                if (callback) {
                    callback();
                }

            },

            error: function (error) {

                console.error(
                    "Unable to load Attendance Requests. Check " +
                    "ATTENDANCE_REQUEST_STATUS_FIELD (currently '" +
                    ATTENDANCE_REQUEST_STATUS_FIELD + "'):",
                    error
                );

                if (token !== load_token) {
                    return;
                }

                attendance_requests = [];
                attendance_request_data = {};

                if (!request_load_error_shown) {

                    request_load_error_shown = true;

                    frappe.show_alert({
                        message:
                            "Attendance Requests could not be loaded. " +
                            "Request chips and the Pending Requests " +
                            "count may be incomplete.",
                        indicator: "orange"
                    });

                }

                if (callback) {
                    callback();
                }

            }

        });

    }


    // =========================================================
    // FORMAT WORKING HOURS   (4.52 -> "04:31 Hrs")
    // =========================================================

    function formatWorkingHours(hours) {

        const numericHours = Number(hours);

        if (!Number.isFinite(numericHours) || numericHours <= 0) {
            return "";
        }

        const totalMinutes = Math.round(numericHours * 60);

        if (totalMinutes <= 0) {
            return "";
        }

        return (
            String(Math.floor(totalMinutes / 60)).padStart(2, "0") +
            ":" +
            String(totalMinutes % 60).padStart(2, "0") +
            " Hrs"
        );

    }


    // =========================================================
    // ADD WORKING HOURS / LEAVE TYPE TO CALENDAR EVENT
    // (idempotent - safe to call from the MutationObserver)
    // =========================================================

    function add_extra_info_to_calendar_event(eventEl) {

        if (!eventEl) {
            return;
        }

        const dayCell = eventEl.closest(".fc-daygrid-day");

        if (!dayCell) {
            return;
        }

        const date = dayCell.getAttribute("data-date");

        if (!date) {
            return;
        }

        const attendance = attendance_working_hours[date];

        if (!attendance) {
            return;
        }

        const status =
            String(attendance.status || "").trim().toLowerCase();

        const leaveType = String(attendance.leave_type || "").trim();

        const formattedHours =
            formatWorkingHours(attendance.working_hours);


        const appendLine = function (className, text) {

            if (!text) {
                return;
            }

            const element = document.createElement("div");

            element.className = className;
            element.textContent = text;

            eventEl.appendChild(element);

        };


        // ---------- HALF DAY ----------

        if (status === "half day") {

            eventEl
                .querySelectorAll(
                    ".fc-event-title, " +
                    ".fc-event-title-container, " +
                    ".fc-event-time"
                )
                .forEach(function (element) {

                    if (element.style.display !== "none") {
                        element.style.display = "none";
                    }

                });

            const signature = [
                attendance.attendance_id || "",
                "half day",
                leaveType,
                attendance.half_day_status || "",
                attendance.working_hours || 0
            ].join("|");

            if (
                eventEl.getAttribute("data-half-day-signature") ===
                    signature &&
                eventEl.querySelector(".calendar-half-day-status")
            ) {
                return;
            }

            eventEl
                .querySelectorAll(
                    ".calendar-half-day-status, " +
                    ".calendar-leave-type, " +
                    ".calendar-working-hours, " +
                    ".calendar-half-day-present"
                )
                .forEach(function (element) {
                    element.remove();
                });

            appendLine("calendar-half-day-status", "Half Day");
            appendLine("calendar-leave-type", leaveType);
            appendLine(
                "calendar-half-day-present",
                attendance.half_day_status
            );
            appendLine("calendar-working-hours", formattedHours);

            eventEl.setAttribute("data-half-day-signature", signature);
            eventEl.setAttribute("data-attendance-half-day", "1");
            eventEl.setAttribute("data-grouped-attendance", "1");
            eventEl.setAttribute("data-attendance-date", date);

            return;

        }


        // ---------- NOT A HALF DAY ----------

        eventEl.removeAttribute("data-attendance-half-day");
        eventEl.removeAttribute("data-half-day-signature");
        eventEl.removeAttribute("data-grouped-attendance");


        if (status === "present") {

            if (
                formattedHours &&
                !eventEl.querySelector(".calendar-working-hours")
            ) {
                appendLine("calendar-working-hours", formattedHours);
            }

            return;

        }

        if (status === "on leave" || status.indexOf("leave") !== -1) {

            if (
                leaveType &&
                !eventEl.querySelector(".calendar-leave-type")
            ) {
                appendLine("calendar-leave-type", leaveType);
            }

        }

    }


    // =========================================================
    // HOLIDAYS
    // =========================================================

    function clean_holiday_description(html) {

        if (!html) {
            return "";
        }

        const temp = document.createElement("div");

        temp.innerHTML = String(html);

        return (temp.textContent || temp.innerText || "").trim();

    }


    function add_holiday_to_calendar_day(dayCell) {

        const date = dayCell.getAttribute("data-date");

        const holidays = holiday_calendar_data[date];

        if (!holidays || holidays.length === 0) {
            return;
        }

        dayCell.classList.add("has-holiday");

        // A day is shown grey only when EVERY holiday row on it is a
        // weekly off. A real public holiday keeps its orange look.

        const all_weekly_off =
            holidays.every(function (holiday) {
                return holiday.weekly_off;
            });

        dayCell.classList.toggle("has-weekly-off", all_weekly_off);

        let holidayContainer = dayCell.querySelector(".calendar-holiday");

        if (!holidayContainer) {

            holidayContainer = document.createElement("div");

            holidayContainer.className = "calendar-holiday";

            const dayFrame =
                dayCell.querySelector(".fc-daygrid-day-frame");

            (dayFrame || dayCell).appendChild(holidayContainer);

        }

        holidayContainer.classList.toggle(
            "calendar-holiday-weekly-off",
            all_weekly_off
        );

        const holidaySignature =
            holidays
                .map(function (holiday) {
                    return [
                        holiday.weekly_off ? "WO" : "",
                        holiday.description || "",
                        holiday.custom_status || ""
                    ].join("|");
                })
                .join("||");

        if (
            holidayContainer.getAttribute("data-holiday-signature") ===
            holidaySignature
        ) {
            return;
        }

        holidayContainer.setAttribute(
            "data-holiday-signature",
            holidaySignature
        );

        holidayContainer.innerHTML = "";

        holidays.forEach(function (holiday) {

            const name = document.createElement("span");

            name.className = "calendar-holiday-name";

            // Weekly off is always shown as "WO". The description
            // is never substituted back in. Public holidays keep
            // their full description.

            if (holiday.weekly_off) {

                name.textContent = "WO";

            }
            else {

                name.textContent =
                    clean_holiday_description(holiday.description) ||
                    "Holiday";

            }

            holidayContainer.appendChild(name);

            if (holiday.custom_status) {

                const status = document.createElement("span");

                status.className = "calendar-holiday-status";
                status.textContent = holiday.custom_status;

                holidayContainer.appendChild(status);

            }

        });

    }


    function add_holidays_to_calendar() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(".fc-daygrid-day[data-date]")
            .forEach(add_holiday_to_calendar_day);

    }


    // =========================================================
    // ATTENDANCE REQUESTS ON THE CALENDAR
    // (idempotent - safe to call from the MutationObserver)
    // =========================================================

    function is_request_duplicate_of_attendance(request, date) {

        const attendance = attendance_working_hours[date];

        if (!attendance) {
            return false;
        }

        const reason =
            String(request.reason || "").trim().toLowerCase();

        const status =
            String(attendance.status || "").trim().toLowerCase();

        const is_wfh_reason =
            reason === "work from home" || reason === "wfh";

        const is_wfh_status =
            status === "work from home" || status === "wfh";

        return is_wfh_reason && is_wfh_status;

    }


    function add_requests_to_calendar_day(dayCell) {

        const date = dayCell.getAttribute("data-date");

        // Skip a request chip when the day's attendance already says
        // the same thing (e.g. a Work From Home request on a day that
        // is already Work From Home). Counts are NOT affected: the
        // Pending Requests card still uses every Pending Approval request.

        const requests =
            (attendance_request_data[date] || []).filter(function (request) {
                return !is_request_duplicate_of_attendance(request, date);
            });

        const existing = dayCell.querySelector(".calendar-request-group");

        if (!requests || requests.length === 0) {

            if (existing) {
                existing.remove();
            }

            return;

        }

        const signature =
            requests
                .map(function (request) {
                    return [
                        request.name,
                        request.reason,
                        request.status
                    ].join("|");
                })
                .join("||");

        let group = existing;

        if (!group) {

            group = document.createElement("div");

            group.className = "calendar-request-group";

            const dayFrame =
                dayCell.querySelector(".fc-daygrid-day-frame");

            (dayFrame || dayCell).appendChild(group);

        }

        if (group.getAttribute("data-request-signature") === signature) {
            return;
        }

        group.setAttribute("data-request-signature", signature);

        group.innerHTML = "";

        requests.forEach(function (request) {

            const chip = document.createElement("div");

            chip.className =
                "calendar-request " +
                (request.status === "Approved"
                    ? "request-approved"
                    : "request-pending-approval");

            if (request.explanation) {
                chip.title = request.explanation;
            }

            const reason = document.createElement("span");

            reason.className = "calendar-request-reason";
            reason.textContent = request.reason || "Attendance Request";

            const status = document.createElement("span");

            status.className = "calendar-request-status";
            status.textContent = request.status;

            chip.appendChild(reason);
            chip.appendChild(status);

            group.appendChild(chip);

        });

    }


    // =========================================================
    // LEAVE APPLICATIONS (status display)
    //
    // Only Pending Approval and Approved are shown. They do NOT
    // change the overview counts (Leave still counts attendance
    // dates, Pending Requests still counts Attendance Requests).
    // =========================================================

    function load_leave_applications(emp, token, callback) {

        leave_application_data = {};

        const filters = {
            employee: emp
        };

        filters[LEAVE_APPLICATION_STATUS_FIELD] =
            ["in", VISIBLE_REQUEST_STATUSES];

        frappe.call({

            method: "frappe.client.get_list",

            args: {

                doctype: LEAVE_APPLICATION_DOCTYPE,

                filters: filters,

                fields: [
                    "name",
                    "from_date",
                    "to_date",
                    "leave_type",
                    LEAVE_APPLICATION_STATUS_FIELD + " as leave_status"
                ],

                order_by: "from_date asc, creation asc",

                limit_page_length: 0

            },

            callback: function (r) {

                if (token !== load_token) {
                    return;
                }

                (r.message || []).forEach(function (row) {

                    const status = normalize_request_status(row.leave_status);

                    if (!status) {
                        return;
                    }

                    const application = {
                        name: row.name,

                        // official Leave Type name; falls back to the
                        // stored value for historical / unknown types

                        leave_type: resolve_leave_type(row.leave_type),
                        status: status
                    };

                    expand_request_dates(row.from_date, row.to_date)
                        .forEach(function (date) {

                            if (!leave_application_data[date]) {
                                leave_application_data[date] = [];
                            }

                            leave_application_data[date].push(application);

                        });

                });

                console.log(
                    "Visible Leave Applications:",
                    leave_application_data
                );

                if (callback) {
                    callback();
                }

            },

            error: function (error) {

                console.error(
                    "Unable to load Leave Applications. Check " +
                    "LEAVE_APPLICATION_STATUS_FIELD (currently '" +
                    LEAVE_APPLICATION_STATUS_FIELD + "'):",
                    error
                );

                if (token !== load_token) {
                    return;
                }

                leave_application_data = {};

                if (callback) {
                    callback();
                }

            }

        });

    }


    function add_leave_status_to_calendar_day(dayCell) {

        const date = dayCell.getAttribute("data-date");

        const applications = leave_application_data[date] || [];

        const attendance = attendance_working_hours[date];

        const attendance_status =
            attendance
                ? String(attendance.status || "").trim().toLowerCase()
                : "";

        const attendance_is_leave =
            attendance_status !== "half day" &&
            attendance_status.indexOf("leave") !== -1;

        const eventEl =
            dayCell.querySelector(".fc-daygrid-event.cal-event-leave");


        // Approved leave that already shows as an On Leave block:
        // put the status inside that block instead of a second box.

        const merge_into_block =
            attendance_is_leave && eventEl
                ? applications.some(function (application) {
                    return application.status === "Approved";
                })
                : false;

        const old_badge = dayCell.querySelector(
            ".calendar-leave-application-status"
        );

        if (merge_into_block) {

            if (!old_badge) {

                const badge = document.createElement("div");

                badge.className = "calendar-leave-application-status";
                badge.textContent = "Approved";

                eventEl.appendChild(badge);

            }

        }
        else if (old_badge) {

            old_badge.remove();

        }


        // Everything else (Pending Approval, or no leave block) gets
        // its own chip with the leave type and full status name.

        const separate = applications.filter(function (application) {
            return !(merge_into_block && application.status === "Approved");
        });

        const existing = dayCell.querySelector(".calendar-leave-group");

        if (!separate.length) {

            if (existing) {
                existing.remove();
            }

            return;

        }

        const signature =
            separate
                .map(function (application) {
                    return [
                        application.name,
                        application.leave_type,
                        application.status
                    ].join("|");
                })
                .join("||");

        let group = existing;

        if (!group) {

            group = document.createElement("div");

            group.className = "calendar-leave-group";

            const dayFrame =
                dayCell.querySelector(".fc-daygrid-day-frame");

            (dayFrame || dayCell).appendChild(group);

        }

        if (group.getAttribute("data-leave-signature") === signature) {
            return;
        }

        group.setAttribute("data-leave-signature", signature);

        group.innerHTML = "";

        separate.forEach(function (application) {

            const chip = document.createElement("div");

            chip.className =
                "calendar-request " +
                (application.status === "Approved"
                    ? "request-approved"
                    : "request-pending-approval");

            const type = document.createElement("span");

            type.className = "calendar-request-reason";
            type.textContent = application.leave_type || "Leave";

            const status = document.createElement("span");

            status.className = "calendar-request-status";
            status.textContent = application.status;

            chip.appendChild(type);
            chip.appendChild(status);

            group.appendChild(chip);

        });

    }


    function add_leave_status_to_calendar() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(".fc-daygrid-day[data-date]")
            .forEach(add_leave_status_to_calendar_day);

    }


    function add_requests_to_calendar() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(".fc-daygrid-day[data-date]")
            .forEach(add_requests_to_calendar_day);

    }


    // =========================================================
    // ATTENDANCE OVERVIEW CARDS
    //
    // Counts come from the data already loaded for the selected
    // employee, limited to the range the calendar is showing.
    // Attendance is counted per UNIQUE DATE using the grouped
    // record (the existing status-priority logic), so duplicate
    // Attendance rows never inflate a count.
    // =========================================================

    function get_visible_date_range() {

        const fc = get_fullcalendar();

        try {

            const view = fc && fc.view;

            if (view && view.currentStart && view.currentEnd) {

                return {
                    start: event_date_key(view.currentStart),
                    end: event_date_key(view.currentEnd)   // exclusive
                };

            }

        }
        catch (e) {
            console.warn("Could not read calendar range:", e);
        }

        // fallback: the current month

        const now = new Date();

        return {
            start: event_date_key(
                new Date(now.getFullYear(), now.getMonth(), 1)
            ),
            end: event_date_key(
                new Date(now.getFullYear(), now.getMonth() + 1, 1)
            )
        };

    }


    function compute_overview_counts() {

        const counts = {
            present: 0,
            absent: 0,
            half_day: 0,
            work_from_home: 0,
            leave: 0,
            weekly_off: 0,
            holidays: 0,
            pending_requests: 0
        };

        if (!employee) {
            return counts;
        }

        const range = get_visible_date_range();

        const in_range = function (date) {
            return date >= range.start && date < range.end;
        };


        // ---- attendance: one grouped record per date ----

        Object.keys(attendance_working_hours).forEach(function (date) {

            if (!in_range(date)) {
                return;
            }

            const status =
                String(attendance_working_hours[date].status || "")
                    .trim()
                    .toLowerCase();

            if (status === "half day") {
                counts.half_day++;
            }
            else if (status === "on leave" || status.indexOf("leave") !== -1) {
                counts.leave++;
            }
            else if (status === "work from home" || status === "wfh") {
                counts.work_from_home++;
            }
            else if (status === "present") {
                counts.present++;
            }
            else if (status === "absent") {
                counts.absent++;
            }

        });


        // ---- weekly offs and public holidays: unique dates ----
        // A date that has any weekly_off row counts as a weekly off,
        // otherwise as a holiday. Never both.

        Object.keys(holiday_calendar_data).forEach(function (date) {

            if (!in_range(date)) {
                return;
            }

            const rows = holiday_calendar_data[date] || [];

            if (!rows.length) {
                return;
            }

            const weekly = rows.some(function (row) {
                return row.weekly_off;
            });

            if (weekly) {
                counts.weekly_off++;
            }
            else {
                counts.holidays++;
            }

        });


        // ---- pending requests: distinct requests, Pending Approval only ----

        attendance_requests.forEach(function (request) {

            if (request.status !== "Pending Approval") {
                return;
            }

            const touches_range = request.dates.some(in_range);

            if (touches_range) {
                counts.pending_requests++;
            }

        });

        return counts;

    }


    function update_attendance_overview() {

        const section = document.getElementById("attendance-overview");

        if (!section) {
            return;
        }

        const counts = compute_overview_counts();

        Object.keys(counts).forEach(function (key) {

            const countEl =
                section.querySelector('[data-overview="' + key + '"]');

            if (!countEl) {
                return;
            }

            const text = String(counts[key]);

            if (countEl.textContent !== text) {
                countEl.textContent = text;
            }

            const card = countEl.closest(".overview-card");

            if (card) {
                card.classList.toggle("is-zero", counts[key] === 0);
            }

        });

    }


    // =========================================================
    // ONE CALENDAR EVENT PER DATE
    // =========================================================

    function event_date_key(value) {

        if (!value) {
            return "";
        }

        if (value instanceof Date) {

            return (
                value.getFullYear() +
                "-" +
                String(value.getMonth() + 1).padStart(2, "0") +
                "-" +
                String(value.getDate()).padStart(2, "0")
            );

        }

        return String(value).slice(0, 10);

    }


    function enable_single_event_per_date(calendar) {

        if (
            !calendar ||
            calendar.__single_event_per_date ||
            typeof calendar.prepare_events !== "function"
        ) {
            return;
        }

        const original_prepare_events =
            calendar.prepare_events.bind(calendar);

        calendar.prepare_events = function (events) {

            const prepared = original_prepare_events(events) || [];

            const seen = {};
            const result = [];

            prepared.forEach(function (ev) {

                const date = event_date_key(ev.start);

                if (!date) {
                    result.push(ev);
                    return;
                }

                if (seen[date]) {
                    return;
                }

                seen[date] = true;

                const grouped = attendance_working_hours[date];

                if (grouped) {
                    ev.title = grouped.status;
                    ev.attendance_ids = grouped.attendance_id;
                }

                result.push(ev);

            });

            return result;

        };

        calendar.__single_event_per_date = true;

    }


    // =========================================================
    // CALENDAR CONFIG (Calendar View doc, with safe fallback)
    //
    // If the "Employee Attendance Calendar" Calendar View cannot be
    // loaded (missing, no permission, slow), with_doc may never call
    // back and the calendar silently never appears. So we give it
    // 3 seconds and then fall back to sensible defaults.
    // =========================================================

    function get_calendar_field_map(callback) {

        let finished = false;

        const finish = function (calendar_doc) {

            if (finished) {
                return;
            }

            finished = true;

            clearTimeout(timer);

            const doc = calendar_doc || {};

            callback({
                id: "name",
                start: doc.start_date_field || "attendance_date",
                end: doc.end_date_field || "attendance_date",
                title: doc.subject_field || "status",
                allDay: doc.all_day === 0 ? 0 : 1
            });

        };

        const timer = setTimeout(function () {

            console.warn(
                "Calendar View did not load in time - using defaults."
            );

            finish(null);

        }, 3000);

        try {

            frappe.model.with_doc(
                "Calendar View",
                "Employee Attendance Calendar",
                function () {

                    finish(
                        frappe.get_doc(
                            "Calendar View",
                            "Employee Attendance Calendar"
                        )
                    );

                }
            );

        }
        catch (e) {

            console.warn("Calendar View load failed:", e);

            finish(null);

        }

    }


    // =========================================================
    // CREATE FRAPPE ATTENDANCE CALENDAR
    // =========================================================

    function create_attendance_calendar() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            console.error("Attendance calendar container not found.");
            return;
        }

        if (!employee) {
            return;
        }

        const token = load_token;
        const emp = employee;

        attendance_calendar = null;

        attendance_calendar_filters = [
            ["Attendance", "employee", "=", emp],
            ["Attendance", "docstatus", "=", 1]
        ];

        container.innerHTML = "";

        frappe.require("calendar.bundle.js", function () {

            if (token !== load_token || employee !== emp) {
                return;
            }

            get_calendar_field_map(function (field_map) {

                if (token !== load_token || employee !== emp) {
                    return;
                }

                init_calendar(field_map);

            });

        });

    }


    function init_calendar(field_map) {

        if (!frappe.views || !frappe.views.Calendar) {

            show_calendar_error(
                "Frappe Calendar view is not available. " +
                "Hard refresh the page (Ctrl+Shift+R) and try again."
            );

            return;

        }

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container.innerHTML = "";

        console.log("Calendar field map:", field_map);

        const list_view = {
            filter_area: {
                get: function () {
                    return attendance_calendar_filters;
                }
            }
        };

        try {

            attendance_calendar = new frappe.views.Calendar({
                doctype: "Attendance",
                parent: $(container),
                page: page,
                list_view: list_view,
                field_map: field_map,
                get_events_method: "frappe.desk.calendar.get_events"
            });

            window.hr_attendance_calendar = attendance_calendar;

            enable_single_event_per_date(attendance_calendar);

            const fc = get_fullcalendar();

            try {

                if (fc && typeof fc.setOption === "function") {
                    fc.setOption("selectable", false);
                    fc.setOption("weekends", true);
                }

                if (fc && typeof fc.refetchEvents === "function") {
                    fc.refetchEvents();
                }

            }
            catch (e) {
                console.warn("Could not configure calendar:", e);
            }

            const token = load_token;

            setTimeout(function () {

                if (token !== load_token) {
                    return;
                }

                resize_attendance_calendar();
                watch_calendar_height();
                watch_calendar_event_colors();
                add_holidays_to_calendar();
                add_requests_to_calendar();
                update_attendance_overview();

            }, 500);

            setTimeout(function () {

                if (token !== load_token) {
                    return;
                }

                resize_attendance_calendar();
                colorize_calendar_events();

                // nothing was drawn at all -> tell the user

                if (!container.querySelector(".fc")) {

                    console.error(
                        "FullCalendar did not render inside #attendance-calendar.",
                        container
                    );

                }

            }, 1500);

        }
        catch (error) {

            console.error("Failed to initialize Frappe Calendar:", error);

            show_calendar_error(
                "Unable to initialize Frappe Attendance Calendar."
            );

        }

    }


    // =========================================================
    // CALENDAR ERROR
    // =========================================================

    function show_calendar_error(message) {

        show_placeholder(message);

    }


    // =========================================================
    // CALENDAR RESIZE
    // =========================================================

    function get_fullcalendar() {

        if (!attendance_calendar) {
            return null;
        }

        return (
            attendance_calendar.fullcalendar ||
            attendance_calendar.fullCalendar ||
            attendance_calendar.calendar ||
            attendance_calendar.cal ||
            null
        );

    }


    function resize_attendance_calendar() {

        const fc = get_fullcalendar();

        try {

            if (fc && typeof fc.updateSize === "function") {
                fc.updateSize();
            }

        }
        catch (error) {

            console.warn("Calendar resize failed:", error);

        }

    }


    function watch_calendar_height() {

        const calendarCard =
            document.querySelector(".attendance-calendar-card");

        if (!calendarCard || typeof ResizeObserver === "undefined") {
            return;
        }

        if (calendar_height_observer) {
            calendar_height_observer.disconnect();
        }

        calendar_height_observer =
            new ResizeObserver(function () {
                resize_attendance_calendar();
            });

        calendar_height_observer.observe(calendarCard);

    }


    // =========================================================
    // HIDE FRAPPE'S DRAG HINT + "HIDE WEEKENDS" BUTTON
    // =========================================================

    function hide_calendar_extras() {

        const card = document.querySelector(".attendance-calendar-card");

        if (!card) {
            return;
        }

        card.querySelectorAll("*").forEach(function (el) {

            if (el.children.length) {
                return;
            }

            const t = (el.textContent || "").trim();

            if (
                t.indexOf("Select or drag across") === 0 ||
                t === "Hide Weekends" ||
                t === "Show Weekends"
            ) {

                (el.closest("button, .btn") || el).style.display = "none";

            }

        });

    }


    // =========================================================
    // COLORIZE ONE CALENDAR EVENT
    // =========================================================

    function colorize_calendar_event(eventEl) {

        if (!eventEl) {
            return;
        }

        eventEl.classList.remove.apply(
            eventEl.classList,
            CALENDAR_STATUS_CLASSNAMES
        );

        const dayCell = eventEl.closest(".fc-daygrid-day");

        const date =
            dayCell ? dayCell.getAttribute("data-date") : null;

        const attendance =
            date ? attendance_working_hours[date] : null;

        if (attendance) {

            const status =
                String(attendance.status || "").trim().toLowerCase();

            if (status === "half day") {
                eventEl.classList.add("cal-event-halfday");
                return;
            }

            if (status === "present") {
                eventEl.classList.add("cal-event-present");
                return;
            }

            if (status === "absent") {
                eventEl.classList.add("cal-event-absent");
                return;
            }

            if (status === "work from home" || status === "wfh") {
                eventEl.classList.add("cal-event-wfh");
                return;
            }

            if (status === "on leave" || status.indexOf("leave") !== -1) {
                eventEl.classList.add("cal-event-leave");
                return;
            }

        }

        // fallback: match visible text

        const text = (eventEl.textContent || "").trim().toLowerCase();

        for (let i = 0; i < CALENDAR_STATUS_CLASS_MAP.length; i++) {

            const entry = CALENDAR_STATUS_CLASS_MAP[i];

            if (text.indexOf(entry.match) !== -1) {
                eventEl.classList.add(entry.className);
                return;
            }

        }

    }


    // =========================================================
    // SAFETY NET: HIDE ANY EXTRA EVENT ON THE SAME DATE
    // =========================================================

    function hide_calendar_element(el) {

        if (el) {
            el.style.setProperty("display", "none", "important");
        }

    }


    function remove_duplicate_calendar_events() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(".fc-daygrid-day[data-date]")
            .forEach(function (dayCell) {

                const date = dayCell.getAttribute("data-date");

                if (!date || !attendance_working_hours[date]) {
                    return;
                }

                const events =
                    Array.from(
                        dayCell.querySelectorAll(".fc-daygrid-event")
                    );

                if (events.length <= 1) {
                    return;
                }

                events.forEach(function (eventEl, index) {

                    const harness =
                        eventEl.closest(".fc-daygrid-event-harness");

                    if (index === 0) {

                        eventEl.style.removeProperty("display");

                        if (harness) {
                            harness.style.removeProperty("display");
                        }

                        eventEl.setAttribute(
                            "data-grouped-calendar-event",
                            "1"
                        );

                        return;

                    }

                    hide_calendar_element(eventEl);
                    hide_calendar_element(harness);

                    eventEl.setAttribute("data-attendance-hidden", "1");

                });

            });

    }


    // =========================================================
    // COLORIZE ALL EVENTS + EXTRAS
    // =========================================================

    function colorize_calendar_events() {

        hide_calendar_extras();

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(
                ".fc-event, .fc-daygrid-event, .fc-list-event"
            )
            .forEach(function (eventEl) {

                colorize_calendar_event(eventEl);

                add_extra_info_to_calendar_event(eventEl);

            });

        remove_duplicate_calendar_events();

        add_holidays_to_calendar();

        add_requests_to_calendar();

        add_leave_status_to_calendar();

        // keeps the overview in step with the displayed month

        update_attendance_overview();

    }


    function watch_calendar_event_colors() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        if (calendar_events_observer) {
            calendar_events_observer.disconnect();
        }

        if (calendar_render_timer) {
            clearTimeout(calendar_render_timer);
            calendar_render_timer = null;
        }

        if (typeof MutationObserver === "undefined") {
            colorize_calendar_events();
            return;
        }

        calendar_events_observer =
            new MutationObserver(function () {

                if (calendar_render_timer) {
                    clearTimeout(calendar_render_timer);
                }

                calendar_render_timer = setTimeout(function () {
                    colorize_calendar_events();
                }, 50);

            });

        calendar_events_observer.observe(container, {
            childList: true,
            subtree: true
        });

        colorize_calendar_events();

    }


    // =========================================================
    // CLEAR CALENDAR
    //
    // The cached Leave Type list is intentionally NOT cleared here:
    // it does not depend on the employee and is reused.
    // =========================================================

    function clear_attendance_calendar() {

        attendance_working_hours = {};
        attendance_records_by_date = {};
        holiday_calendar_data = {};
        attendance_request_data = {};
        attendance_requests = [];
        leave_application_data = {};
        employee_holiday_list = null;
        employee_default_shift = null;

        if (calendar_events_observer) {
            calendar_events_observer.disconnect();
            calendar_events_observer = null;
        }

        if (calendar_height_observer) {
            calendar_height_observer.disconnect();
            calendar_height_observer = null;
        }

        if (calendar_render_timer) {
            clearTimeout(calendar_render_timer);
            calendar_render_timer = null;
        }

        const fc = get_fullcalendar();

        if (fc && typeof fc.destroy === "function") {

            try {
                fc.destroy();
            }
            catch (error) {
                console.warn("Calendar destroy failed:", error);
            }

        }

        attendance_calendar = null;

        const container = document.getElementById("attendance-calendar");

        if (container) {
            container.innerHTML = "";
        }

        // every overview card back to 0

        update_attendance_overview();

    }


    // =========================================================
    // WINDOW RESIZE
    // =========================================================

    $(window).off("resize.attendanceCalendar");

    $(window).on("resize.attendanceCalendar", function () {
        resize_attendance_calendar();
    });


    // =========================================================
    // PAGE CLEANUP
    // =========================================================

    $(wrapper).on("page-unload", function () {

        if (employee_selection_timer) {
            clearTimeout(employee_selection_timer);
            employee_selection_timer = null;
        }

        employee = null;

        load_token++;

        clear_attendance_calendar();

        $(window).off("resize.attendanceCalendar");

    });

};