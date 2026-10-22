frappe.pages["employee_attendance"].on_page_load = function (wrapper) {

    let employee = null;
    let timerInterval = null;


    let attendance_calendar = null;
    let attendance_calendar_filters = [];

    // grouped record per date  -> { status, working_hours, leave_type, ... }
    let attendance_working_hours = {};
    // original Attendance rows per date (never modified)
    let attendance_records_by_date = {};
    let holiday_calendar_data = {};

    let employee_holiday_list = null;
    let employee_default_shift = null;

    // =========================================================
    // LEAVE TYPE LIST (standard "Leave Type" DocType)
    //
    // Fetched ONCE per page load and shared by the leave balance
    // cards and the attendance calendar.
    //
    //   leave_type_names : lowercase name -> official Leave Type name
    //   leave_type_meta  : official name  -> { is_lwp, is_compensatory }
    // =========================================================

    let leave_type_names = {};
    let leave_type_meta = {};
    let leave_types_loaded = false;
    let leave_types_promise = null;

    // =========================================================
    // ASSOCIATE MEMBERS - DISPLAY CAP
    // =========================================================

    const MAX_VISIBLE_ASSOCIATES = 5;

    // =========================================================
    // LEFT COLUMN / CALENDAR HEIGHT SYNC
    // =========================================================

    let calendar_height_observer = null;

    const LEFT_RIGHT_STACK_BREAKPOINT = 850;

    // =========================================================
    // CALENDAR EVENT STATUS COLORS
    // =========================================================

    let calendar_events_observer = null;
    let calendar_render_timer = null;

    // "work from home" must stay FIRST so it matches
    // before the generic "leave" entry.

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
    // LEAVE TYPE ICONS + COLORS
    //
    // This is PRESENTATION ONLY (which colour / icon a card gets).
    // It is never used as the source of leave type names - those
    // come from the Leave Type list / API data. A leave type that
    // matches nothing here simply gets the default style below.
    // =========================================================

    const LEAVE_TYPE_STYLE = [
        { match: "marriage",    cls: "lt-marriage",   icon: "fa-heart" },
        { match: "privilege",   cls: "lt-privilege",  icon: "fa-star" },
        { match: "restricted",  cls: "lt-restricted", icon: "fa-bookmark" },
        { match: "sick",        cls: "lt-sick",       icon: "fa-medkit" },
        { match: "casual",      cls: "lt-casual",     icon: "fa-calendar" },
        { match: "without pay", cls: "lt-lwp",        icon: "fa-money" },
        { match: "comp",        cls: "lt-compoff",    icon: "fa-exchange" }
    ];

    // style used for Leave Types set up by Leave Type flags

    const LEAVE_FLAG_STYLE = {
        lwp:          { cls: "lt-lwp",     icon: "fa-money" },
        compensatory: { cls: "lt-compoff", icon: "fa-exchange" }
    };


    function get_leave_style(leave_type) {

        const official = resolve_leave_type(leave_type);

        const meta = leave_type_meta[official] || {};

        // 1) Leave Type flags (reliable, configured in Leave Type)

        if (meta.is_lwp) {
            return LEAVE_FLAG_STYLE.lwp;
        }

        if (meta.is_compensatory) {
            return LEAVE_FLAG_STYLE.compensatory;
        }

        // 2) keyword look (existing behaviour)

        const t = String(official || "").toLowerCase();

        return LEAVE_TYPE_STYLE.find(function (s) {
            return t.indexOf(s.match) !== -1;
        }) || {
            // 3) fallback for any new leave type
            cls: "",
            icon: "fa-calendar-check-o"
        };

    }


    // =========================================================
    // LOAD LEAVE TYPES (once, cached, never blocks the page)
    //
    // The returned promise ALWAYS resolves. On any error the maps
    // stay empty and every stored leave type is shown as saved.
    //
    // First try also asks for the Leave Type flags
    // "is_lwp" and "is_compensatory". If this installation does
    // not allow / have those fields the call is repeated once with
    // only "name".
    // =========================================================

    function load_leave_types() {

        if (leave_types_promise) {
            return leave_types_promise;
        }

        leave_types_promise = new Promise(function (resolve) {

            const fetch_list = function (fields, allow_fallback) {

                frappe.call({

                    method: "frappe.client.get_list",

                    args: {

                        doctype: "Leave Type",

                        fields: fields,

                        limit_page_length: 0

                    },

                    callback: function (r) {

                        const names = {};
                        const meta = {};

                        (r.message || []).forEach(function (row) {

                            if (!row.name) {
                                return;
                            }

                            const key =
                                String(row.name).trim().toLowerCase();

                            // duplicates collapse onto one entry

                            if (names[key]) {
                                return;
                            }

                            names[key] = row.name;

                            meta[row.name] = {
                                is_lwp: Number(row.is_lwp) === 1,
                                is_compensatory:
                                    Number(row.is_compensatory) === 1
                            };

                        });

                        leave_type_names = names;
                        leave_type_meta = meta;
                        leave_types_loaded = true;

                        // console.log("Leave Types:", leave_type_names);

                        resolve();

                    },

                    error: function (error) {

                        if (allow_fallback) {

                            fetch_list(["name"], false);

                            return;

                        }

                        console.error(
                            "Unable to load Leave Type list. " +
                            "Stored leave types will be shown as saved:",
                            error
                        );

                        leave_type_names = {};
                        leave_type_meta = {};
                        leave_types_loaded = false;

                        // allow a retry on the next call

                        leave_types_promise = null;

                        resolve();

                    }

                });

            };

            fetch_list(["name", "is_lwp", "is_compensatory"], true);

        });

        return leave_types_promise;

    }


    // Official Leave Type name when known, otherwise the stored
    // value unchanged. Names are never shortened or replaced.

    function resolve_leave_type(value) {

        const stored = String(value || "").trim();

        if (!stored) {
            return "";
        }

        return leave_type_names[stored.toLowerCase()] || stored;

    }


    // Leave Without Pay: taken from the Leave Type "is_lwp" flag.
    // Only when the Leave Type list could not be loaded does it
    // fall back to the old name check, so today's behaviour is kept.

    function is_leave_without_pay(leave_type) {

        const official = resolve_leave_type(leave_type);

        if (leave_type_meta[official]) {
            return !!leave_type_meta[official].is_lwp;
        }

        return String(official).trim().toLowerCase() ===
            "leave without pay";

    }


    // =========================================================
    // CREATE PAGE
    // =========================================================

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Employee Attendance",
        single_column: true
    });


    // =========================================================
    // PAGE HTML  (same IDs as before)
    // =========================================================

    page.main.html(`
        <main class="attendance-container">

            <!-- ================= Header ================= -->
            <header class="attendance-header">

                <div class="header-left">
                    <div class="header-title-block">
                        <h2>Employee Attendance</h2>
                        <p class="header-subtitle">
                            Track your attendance and working hours
                        </p>
                    </div>

                    <!-- kept for JS compatibility; hidden by CSS -->
                    <span id="status"></span>
                </div>

                <time class="header-right">
                    <strong id="current-date-main"></strong>
                    <small id="current-date-sub"></small>
                </time>

            </header>


            <!-- ================= Leave balance ================= -->
            <h3 class="section-title">Leave Balance</h3>

            <section class="leave-balance-section"></section>


            <!-- ================= Dashboard ================= -->
            <section class="attendance-main-grid">

                <!-- ---------- Left column ---------- -->
                <section class="attendance-left">

                    <!-- Profile / timer -->
                    <article class="card attendance-card">

                        <div class="profile-row">
                            <div class="avatar avatar-large" id="avatar_initial">A</div>

                            <div class="profile-info">
                                <h3 id="Employee_name" class="profile-name">Loading...</h3>
                                <p id="Employee_role" class="profile-role">Loading...</p>
                                <span id="status_text" class="status-text">--</span>
                            </div>
                        </div>

                        <div class="digit-timer" aria-label="Working hours">
                            <span class="digit-box" id="timer_hh">00</span>
                            <span class="digit-colon">:</span>
                            <span class="digit-box" id="timer_mm">00</span>
                            <span class="digit-colon">:</span>
                            <span class="digit-box" id="timer_ss">00</span>
                        </div>

                        <div class="timer-caption">Working Hours</div>

                        <!-- Backward compatibility -->
                        <span id="live-timer" hidden>00:00:00</span>
                        <span id="working_hours" hidden>00:00:00</span>

                        <div class="button-area">
                            <button
                                type="button"
                                id="attendance_btn"
                                class="attendance-button">
                                Loading...
                            </button>
                        </div>

                        <dl class="checkinout-grid">

                            <div class="checkinout-box">
                                <div class="cio-text">
                                    <dt>Check In</dt>
                                    <dd id="checkin_time">--</dd>
                                </div>
                            </div>

                            <div class="checkinout-box">
                                <div class="cio-text">
                                    <dt>Check Out</dt>
                                    <dd id="checkout_time">--</dd>
                                </div>
                            </div>

                        </dl>

                    </article>


                    <!-- Reporting manager -->
                    <article class="card manager-card">

                        <h4 class="card-label">Reporting Manager</h4>

                        <div class="manager-row" id="manager_row">
                            <div class="avatar avatar-small avatar-tint-0" id="manager_avatar">--</div>

                            <div class="manager-info">
                                <strong id="manager_name">Loading...</strong>
                                <span id="manager_code" class="manager-code"></span>
                                <span id="manager_status" class="member-status">--</span>
                            </div>

                            <i class="fa fa-angle-right manager-chevron"></i>
                        </div>

                    </article>


                    <!-- Associate members -->
                    <article class="card members-card">

                        <header class="members-card-header">
                            <h4 class="card-label">Associate Members</h4>
                            <a href="#" id="view_all_members" class="view-all-link">View All</a>
                        </header>

                        <div id="associate_members_list" class="members-list">
                            <div class="members-empty">Loading...</div>
                        </div>

                    </article>


                    <!-- Attendance policies -->
                    <article class="card attendance-policy-section">

                        <h4 class="card-label">Policies</h4>

                        <div
                            id="attendance_policy_list"
                            class="attendance-policy-list">

                            <div class="members-empty">
                                Loading policies...
                            </div>

                        </div>

                        <div
                            id="policy_toggle_row"
                            class="policy-toggle-row"
                            hidden>

                            <a
                                href="#"
                                id="toggle_policies"
                                class="view-all-link">View All Policies</a>

                        </div>

                    </article>

                </section>


                <!-- ---------- Right column ---------- -->
                <section class="attendance-right">

                    <article class="card attendance-calendar-card">

                        <header class="attendance-calendar-header">
                            <h3>Attendance Calendar</h3>
                        </header>

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

                </section>

            </section>


            <!-- ================= Recent attendance ================= -->
            <section class="card history-card">

                <header class="history-header">
                    <h3>Recent Attendance</h3>
                    <a href="#" id="view_all_attendance" class="view-all-link">View All</a>
                </header>

                <div class="attendance-table-wrapper">

                    <table class="attendance-table">

                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Check In</th>
                                <th>Check Out</th>
                            </tr>
                        </thead>

                        <tbody id="attendance_history">
                            <tr>
                                <td colspan="3">Loading...</td>
                            </tr>
                        </tbody>

                    </table>

                </div>

            </section>

        </main>
    `);


    // =========================================================
    // CURRENT DATE
    // =========================================================

    const today = new Date();

    $("#current-date-main").text(
        today.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit"
        })
    );

    $("#current-date-sub").text(
        today.toLocaleDateString(undefined, {
            weekday: "long"
        })
    );


    // =========================================================
    // ATTENDANCE POLICIES (URLs from Teceze Settings)
    //
    // The API returns URLs only, so the display names live here.
    // Order matters: the first DEFAULT_POLICY_COUNT entries are the
    // ones shown before "View All" is clicked.
    // =========================================================

    const POLICY_DEFINITIONS = [
        {
            label: "Probation Policy",
            key: "probation_policy_url"
        },
        {
            label: "Resignation Policy",
            key: "resignation_policy_url"
        },
        {
            label: "Performance Improvement Policy",
            key: "performance_improvement_plan_url"
        },
        {
            label: "Internship Policy",
            key: "internship_policy_url"
        },
        {
            label: "India Leave Policy",
            key: "india_leave_policy_url"
        },
        {
            label: "Dress Code Policy",
            key: "dress_code_policy_url"
        },
        {
            label: "Whistleblower Policy",
            key: "whistleblower_policy_url"
        }
    ];

    const DEFAULT_POLICY_COUNT = 2;

    // only policies with a valid https URL, in display order
    let attendance_policies = [];
    let policies_expanded = false;


    function load_attendance_policy_urls() {

        frappe.call({

            method:
                "teceze.api.employee_attendance.get_attendance_policy_urls",

            callback: function (r) {

                const data = r.message || {};

                attendance_policies = [];

                POLICY_DEFINITIONS.forEach(function (def, index) {

                    const url = String(data[def.key] || "").trim();

                    // missing / empty / non-HTTPS -> not rendered
                    if (!/^https:\/\//i.test(url)) {
                        return;
                    }

                    attendance_policies.push({
                        label: def.label,
                        url: url,
                        is_default: index < DEFAULT_POLICY_COUNT
                    });

                });

                policies_expanded = false;

                render_attendance_policies();

            },

            error: function (error) {

                console.error(
                    "Unable to load attendance policy URLs:",
                    error
                );

                attendance_policies = [];

                const container = document.getElementById(
                    "attendance_policy_list"
                );

                const toggle_row =
                    document.getElementById("policy_toggle_row");

                if (toggle_row) {
                    toggle_row.hidden = true;
                }

                if (container) {

                    container.innerHTML = "";

                    const msg = document.createElement("div");
                    msg.className = "members-empty";
                    msg.textContent = "Unable to load policies.";

                    container.appendChild(msg);

                }

            }

        });

    }


    // Rebuilds the list from scratch every time, so repeated
    // View All / Show Less clicks can never duplicate cards.

    function render_attendance_policies() {

        const container = document.getElementById(
            "attendance_policy_list"
        );

        const toggle = document.getElementById("toggle_policies");

        const toggle_row = document.getElementById("policy_toggle_row");

        if (!container) {
            return;
        }

        const extra_count = attendance_policies.filter(function (p) {
            return !p.is_default;
        }).length;

        // no extra policies configured -> no useless toggle

        if (toggle_row) {
            toggle_row.hidden = extra_count === 0;
        }

        if (toggle) {

            toggle.textContent = policies_expanded
                ? "Show Less"
                : "View All Policies";

        }

        const visible = attendance_policies.filter(function (p) {
            return policies_expanded || p.is_default;
        });

        container.innerHTML = "";

        if (!visible.length) {

            const empty = document.createElement("div");

            empty.className = "members-empty";
            empty.textContent = "No policies configured.";

            container.appendChild(empty);

            return;

        }

        visible.forEach(function (policy) {

            const item = document.createElement("div");
            item.className = "attendance-policy-item";

            const icon = document.createElement("i");
            icon.className = "fa fa-file-pdf-o";

            const link = document.createElement("a");
            link.href = policy.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = policy.label;

            item.appendChild(icon);
            item.appendChild(link);

            container.appendChild(item);

        });

    }


    // =========================================================
    // POLICIES: VIEW ALL / SHOW LESS
    //
    // Delegated + namespaced (same pattern as #view_all_members),
    // so it is removed on page-unload by
    // $(document).off(".employeeAttendance").
    // =========================================================

    $(document).off("click.employeeAttendance", "#toggle_policies");

    $(document).on(
        "click.employeeAttendance",
        "#toggle_policies",
        function (e) {

            e.preventDefault();

            policies_expanded = !policies_expanded;

            render_attendance_policies();

        }
    );


    // =========================================================
    // LOAD LOGGED EMPLOYEE
    // =========================================================

    load_employee();


    function load_employee() {

        frappe.call({

            method: "teceze.api.employee_login.get_logged_employee",

            callback: function (r) {

                if (!r.message) {
                    frappe.msgprint("Employee not mapped.");
                    return;
                }

                employee = r.message.name;
                load_attendance_policy_urls();

                $("#Employee_name").text(r.message.employee_name);

                $("#Employee_role").text(
                    r.message.designation ||
                    r.message.employee_location ||
                    "-"
                );

                $("#avatar_initial").text(
                    r.message.employee_name.charAt(0).toUpperCase()
                );

                load_status();
                load_recent_attendance();
                load_reporting_manager();
                load_leave_balance();
                load_associate_members();

                // LOAD ATTENDANCE + HOLIDAYS THEN CREATE CALENDAR

                load_calendar_data(function () {
                    create_attendance_calendar();
                });

            },

            error: function () {
                frappe.msgprint("Unable to load employee information.");
            }

        });

    }


    // =========================================================
    // REPORTING MANAGER CARD
    // =========================================================

    function load_reporting_manager() {

        if (!employee) {
            return;
        }

        frappe.call({

            method: "teceze.api.employee_attendance.get_reporting_manager_status",

            args: { employee: employee },

            callback: function (r) {

                const card = $(".manager-card");

                if (!r.message) {
                    card.hide();
                    return;
                }

                card.show();

                const m = r.message;

                $("#manager_avatar").text(
                    (m.employee_name || "?").charAt(0).toUpperCase()
                );

                $("#manager_name").text(m.employee_name || m.name);

                $("#manager_code").text(m.name || "");

                const status_class =
                    m.status === "IN"
                        ? "status-in-text"
                        : "status-out-text";

                $("#manager_status")
                    .text(m.status_label)
                    .removeClass("status-in-text status-out-text")
                    .addClass(status_class);

                $("#manager_row")
                    .off("click")
                    .on("click", function () {

                        frappe.route_options = { employee: m.name };

                        frappe.set_route(
                            "query-report",
                            "Employee Leave and Permission"
                        );

                    });

            },

            error: function () {
                $(".manager-card").hide();
            }

        });

    }


    // =========================================================
    // ASSOCIATE MEMBERS CARD
    // =========================================================

    // "Dinesh Kumar M" -> "Dinesh K."

    function short_name(full) {

        const parts = String(full || "").trim().split(/\s+/);

        if (parts.length === 1) {
            return parts[0];
        }

        return parts[0] + " " + parts[1].charAt(0).toUpperCase() + ".";

    }


    // green ("in") / yellow ("leave") / red ("out").
    // Unclear or missing status always falls to red.

    function get_presence_bucket(m) {

        const status = String(m.status || "").trim().toUpperCase();
        const label = String(m.status_label || "").trim().toLowerCase();

        if (
            status === "IN" ||
            status === "CHECKED_IN"
        ) {
            return "in";
        }

        if (
            status === "ON_LEAVE" ||
            status === "LEAVE"
        ) {
            return "leave";
        }

        if (status === "HALF_DAY") {
            return "half-day";
        }

        if (
            status === "WORK_FROM_HOME" ||
            status === "WFH"
        ) {
            return "wfh";
        }

        if (status === "NOT_CHECKED_IN") {
            return "out";
        }

        if (
            status === "OUT" ||
            status === "NOT_CHECKED_IN"
        ) {
            return "out";
        }

        return "out";

    }


    const PRESENCE_BUCKET_LABEL = {
        "in": "Checked In",
        "leave": "On Leave",
        "out": "Not Checked In",
        "half-day": "Half Day",
        "wfh": "Work From Home"
    };


    function load_associate_members() {

        if (!employee) {
            return;
        }

        frappe.call({

            method: "teceze.api.employee_attendance.get_associate_members",

            args: { employee: employee },

            callback: function (r) {

                const list = $("#associate_members_list");

                // console.log("Associate members:", r.message);

                list.empty();

                if (!r.message || r.message.length === 0) {

                    list.append(`
                        <div class="members-empty">
                            No associate members found
                        </div>
                    `);

                    return;
                }

                const visible_members =
                    r.message.slice(0, MAX_VISIBLE_ASSOCIATES);

                visible_members.forEach(function (m, i) {

                    const initial =
                        (m.employee_name || "?")
                            .substring(0, 2)
                            .toUpperCase();

                    const presence = get_presence_bucket(m);

                    const status_label =
                        m.status_label || PRESENCE_BUCKET_LABEL[presence];

                    const chip = $(`
                        <button
                            type="button"
                            class="member-chip">

                            <div class="avatar avatar-tint-${i % 5}">

                                ${frappe.utils.escape_html(initial)}

                                <span class="presence ${presence}"></span>

                            </div>

                            <span class="member-short">

                                ${frappe.utils.escape_html(
                                    short_name(m.employee_name)
                                )}

                            </span>

                        </button>
                    `);

                    chip.attr(
                        "title",
                        `${m.name} - ${m.employee_name} (${status_label})`
                    );

                    chip.on("click", function () {

                        frappe.route_options = { employee: m.name };

                        frappe.set_route(
                            "query-report",
                            "Employee Leave and Permission"
                        );

                    });

                    list.append(chip);

                });

            },

            error: function () {

                $("#associate_members_list").html(`
                    <div class="members-empty">
                        Unable to load associate members
                    </div>
                `);

            }

        });

    }


    // =========================================================
    // VIEW ALL ASSOCIATE MEMBERS
    // =========================================================

    $(document).off("click.employeeAttendance", "#view_all_members");

    $(document).on(
        "click.employeeAttendance",
        "#view_all_members",
        function (e) {

            e.preventDefault();

            frappe.set_route(
                "query-report",
                "Employee Leave and Permission"
            );

        }
    );


    // =========================================================
    // LOAD CALENDAR DATA
    //
    // The Leave Type list is loaded first (once, cached) so it is
    // ready before Attendance rows are processed. It never fails
    // the chain: on error the stored leave types are used as saved.
    // =========================================================

    function load_calendar_data(callback) {

        load_leave_types().then(function () {

            load_calendar_working_hours(function () {

                load_employee_holiday_details(function () {

                    if (callback) {
                        callback();
                    }

                });

            });

        });

    }


    // =========================================================
    // GROUP ALL ATTENDANCE RECORDS OF ONE DATE INTO ONE RECORD
    //
    // Example (24-09-2026):
    //
    //   Attendance 1 -> Half Day, 4.52 hrs
    //   Attendance 2 -> Half Day, Sick Leave
    //
    //   Result -> ONE record:
    //     Half Day / Sick Leave / Present / 04:31 Hrs
    //
    // Status priority for the grouped record:
    //   Half Day  >  On Leave  >  Work From Home  >  Present  >  Absent
    //
    // Working hours = highest value among the records.
    // Leave type    = unique leave types joined with ", ".
    //                 (rec.leave_type is already the official
    //                 Leave Type name - see load_calendar_working_hours)
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


        // ---------- grouped status ----------

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


        // ---------- grouped working hours (highest) ----------

        let grouped_working_hours = 0;

        date_records.forEach(function (rec) {

            const hours = Number(rec.working_hours || 0);

            if (hours > grouped_working_hours) {
                grouped_working_hours = hours;
            }

        });


        // ---------- unique leave types ----------

        const leave_types = [];

        date_records.forEach(function (rec) {

            if (
                rec.leave_type &&
                leave_types.indexOf(rec.leave_type) === -1
            ) {
                leave_types.push(rec.leave_type);
            }

        });


        // ---------- other-half status (Half Day only) ----------

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

            // original records stay available, untouched
            records: date_records

        };

    }


    // =========================================================
    // LOAD ATTENDANCE RECORDS (grouped by date)
    // =========================================================

    function load_calendar_working_hours(callback) {

        if (!employee) {

            attendance_working_hours = {};
            attendance_records_by_date = {};

            if (callback) {
                callback();
            }

            return;
        }

        frappe.call({

            method: "frappe.client.get_list",

            args: {

                doctype: "Attendance",

                filters: {
                    employee: employee,
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

                attendance_working_hours = {};
                attendance_records_by_date = {};

                const records = r.message || [];

                // FIRST: collect all original records per date

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

                        // official Leave Type name; a historical value
                        // that is not in the list is kept as saved

                        leave_type: resolve_leave_type(row.leave_type),

                        half_day_status:
                            String(row.half_day_status || "").trim()

                    });

                });


                // SECOND: build ONE grouped record per date

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

                // console.log(
                //     "Grouped Attendance records:",
                //     attendance_working_hours
                // );

                // console.log(
                //     "All Attendance records by date:",
                //     attendance_records_by_date
                // );

                if (callback) {
                    callback();
                }

            },

            error: function (error) {

                console.error(
                    "Unable to load Attendance working hours:",
                    error
                );

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
    // =========================================================

    function load_employee_holiday_details(month, callback) {

        if (typeof month === "function") {
            callback = month;
            month = null;
        }

        holiday_calendar_data = {};
        employee_holiday_list = null;
        employee_default_shift = null;

        if (!employee) {
            if (callback) {
                callback();
            }
            return;
        }

        frappe.call({
            method:
                "teceze.api.employee_attendance.get_employee_holiday_details",

            args: {
                employee: employee,
                month: month || null
            },

            callback: function (r) {
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
                        weekly_off: holiday.weekly_off
                    });
                });

                if (callback) {
                    callback();
                }
            },

            error: function () {
                holiday_calendar_data = {};

                if (callback) {
                    callback();
                }
            }
        });
    }

    // =========================================================
    // RELOAD HOLIDAYS FOR THE VISIBLE CALENDAR MONTH
    // =========================================================

    let holiday_month_loading = null;

    function reload_holidays_for_visible_month() {

        const container = document.getElementById("attendance-calendar");

        if (!container || !employee) {
            return;
        }

        const dayCells = container.querySelectorAll(
            ".fc-daygrid-day[data-date]"
        );

        if (!dayCells.length) {
            return;
        }

        // Use a date from the currently visible month.
        // Prefer a cell that is not an adjacent-month date.
        let visibleDate = null;

        dayCells.forEach(function (cell) {
            if (
                !visibleDate &&
                !cell.classList.contains("fc-day-other")
            ) {
                visibleDate = cell.getAttribute("data-date");
            }
        });

        if (!visibleDate) {
            visibleDate = dayCells[0].getAttribute("data-date");
        }

        if (!visibleDate) {
            return;
        }

        const month = visibleDate.slice(0, 7);

        if (holiday_month_loading === month) {
            return;
        }

        holiday_month_loading = month;

        load_employee_holiday_details(month + "-01", function () {
            holiday_month_loading = null;
            add_holidays_to_calendar();
        });
    }



    // =========================================================
    // ADD WORKING HOURS / LEAVE TYPE TO CALENDAR EVENT
    //
    // Status is read from the GROUPED record
    // attendance_working_hours[date], NOT from Frappe's
    // displayed event text.
    //
    // Idempotent: a signature is stored on the element so the
    // MutationObserver cannot make this rebuild lines forever.
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


        // =====================================================
        // HALF DAY  (one block: Half Day / Leave type /
        //            Present|Absent / hours)
        // =====================================================

        if (status === "half day") {

            // hide Frappe's original title / time

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

            // already rendered -> stop

            if (
                eventEl.getAttribute("data-half-day-signature") ===
                    signature &&
                eventEl.querySelector(".calendar-half-day-status")
            ) {
                return;
            }

            // remove previous custom content

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

            // other half

            if (attendance.half_day_status) {

                appendLine(
                    "calendar-half-day-present",
                    attendance.half_day_status
                );

            }

            appendLine("calendar-working-hours", formattedHours);

            eventEl.setAttribute("data-half-day-signature", signature);
            eventEl.setAttribute("data-attendance-half-day", "1");
            eventEl.setAttribute("data-grouped-attendance", "1");
            eventEl.setAttribute("data-attendance-date", date);

            return;

        }


        // =====================================================
        // NOT A HALF DAY
        // =====================================================

        eventEl.removeAttribute("data-attendance-half-day");
        eventEl.removeAttribute("data-half-day-signature");
        eventEl.removeAttribute("data-grouped-attendance");


        // PRESENT

        if (status === "present") {

            if (
                formattedHours &&
                !eventEl.querySelector(".calendar-working-hours")
            ) {
                appendLine("calendar-working-hours", formattedHours);
            }

            eventEl.setAttribute("data-extra-info-added", "1");

            return;

        }


        // ABSENT

        if (status === "absent") {

            eventEl.setAttribute("data-extra-info-added", "1");

            return;

        }


        // ON LEAVE

        if (status === "on leave" || status.indexOf("leave") !== -1) {

            if (
                leaveType &&
                !eventEl.querySelector(".calendar-leave-type")
            ) {
                appendLine("calendar-leave-type", leaveType);
            }

            eventEl.setAttribute("data-extra-info-added", "1");

            return;

        }


        // OTHER STATUS

        eventEl.setAttribute("data-extra-info-added", "1");

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

        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;

        return (
            String(hrs).padStart(2, "0") +
            ":" +
            String(mins).padStart(2, "0") +
            " Hrs"
        );

    }


    // =========================================================
    // CLEAN HOLIDAY DESCRIPTION HTML
    // =========================================================

    function clean_holiday_description(html) {

        if (!html) {
            return "";
        }

        const temp = document.createElement("div");

        temp.innerHTML = String(html);

        return (temp.textContent || temp.innerText || "").trim();

    }


    // =========================================================
    // ADD HOLIDAY DETAILS TO CALENDAR DAY
    //
    // (original version - Weekly Off styling is applied
    //  separately by mark_weekly_off_days() below)
    // =========================================================

    function add_holiday_to_calendar_day(date) {

        if (!date) {
            return;
        }

        const holidays = holiday_calendar_data[date];

        if (!holidays || holidays.length === 0) {
            return;
        }

        const dayCell =
            document.querySelector(
                `.fc-daygrid-day[data-date="${date}"]`
            );

        if (!dayCell) {
            return;
        }

        // lets CSS tint holiday cells
        dayCell.classList.add("has-holiday");

        let holidayContainer = dayCell.querySelector(".calendar-holiday");

        if (!holidayContainer) {

            holidayContainer = document.createElement("div");

            holidayContainer.className = "calendar-holiday";

            const dayTop =
                dayCell.querySelector(".fc-daygrid-day-frame");

            if (dayTop) {
                dayTop.appendChild(holidayContainer);
            }
            else {
                dayCell.appendChild(holidayContainer);
            }

        }

        const holidaySignature =
            holidays
                .map(function (holiday) {
                    return [
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

            const holidayName =
                clean_holiday_description(holiday.description) ||
                "Holiday";

            const holidayNameElement = document.createElement("span");

            holidayNameElement.className = "calendar-holiday-name";
            holidayNameElement.textContent = holidayName;

            holidayContainer.appendChild(holidayNameElement);

            if (holiday.custom_status) {

                const statusElement = document.createElement("span");

                statusElement.className = "calendar-holiday-status";
                statusElement.textContent = holiday.custom_status;

                holidayContainer.appendChild(statusElement);

            }

        });

    }


    // =========================================================
    // MARK WEEKLY OFF (WO) DAYS
    //
    // Runs AFTER the holiday chips are drawn. Wrapped in
    // try/catch so it can never stop the holidays from showing.
    //
    // A day is "weekly off" only when EVERY holiday entry on it
    // has the description "WO". Those days lose the orange tint
    // (CSS: .has-weekly-off / .is-weekly-off). Real holidays keep
    // the orange look.
    // =========================================================

    function mark_weekly_off_days() {

        try {

            Object.keys(holiday_calendar_data).forEach(function (date) {

                const holidays = holiday_calendar_data[date] || [];

                if (!holidays.length) {
                    return;
                }

                const dayCell =
                    document.querySelector(
                        `.fc-daygrid-day[data-date="${date}"]`
                    );

                if (!dayCell) {
                    return;
                }

                const is_weekly_off = holidays.every(function (holiday) {

                    return clean_holiday_description(holiday.description)
                        .toUpperCase() === "WO";

                });

                dayCell.classList.toggle("has-weekly-off", is_weekly_off);

                if (is_weekly_off) {
                    dayCell.classList.remove("has-holiday");
                }

                const chip = dayCell.querySelector(".calendar-holiday");

                if (chip) {
                    chip.classList.toggle("is-weekly-off", is_weekly_off);
                }

            });

        }
        catch (error) {

            console.warn("Could not mark weekly off days:", error);

        }

    }


    // =========================================================
    // ADD HOLIDAYS TO ALL VISIBLE CALENDAR DAYS
    // =========================================================

    function add_holidays_to_calendar() {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container
            .querySelectorAll(".fc-daygrid-day[data-date]")
            .forEach(function (dayCell) {

                const date = dayCell.getAttribute("data-date");

                if (!date) {
                    return;
                }

                add_holiday_to_calendar_day(date);

            });

        // WO days: remove the orange look (safe - never throws)
        mark_weekly_off_days();

    }


    // =========================================================
    // ONE CALENDAR EVENT PER DATE  (the actual fix)
    //
    // Frappe's calendar asks the server for every Attendance
    // record and draws one event per record. Two records on the
    // same date therefore show up as two boxes.
    //
    // Here we wrap the calendar's prepare_events() so that the
    // events are de-duplicated BEFORE FullCalendar ever renders
    // them: only one event per date is kept, and its title is
    // replaced with the grouped status for that date.
    // =========================================================

    // "2026-09-24", "2026-09-24 00:00:00" or a Date -> "2026-09-24"

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

                // not a dated event -> leave untouched

                if (!date) {
                    result.push(ev);
                    return;
                }

                // a record for this date is already in -> skip

                if (seen[date]) {
                    return;
                }

                seen[date] = true;

                const grouped = attendance_working_hours[date];

                if (grouped) {

                    ev.title = grouped.status;

                    // ids of every Attendance record merged here
                    ev.attendance_ids = grouped.attendance_id;

                }

                result.push(ev);

            });

            return result;

        };

        calendar.__single_event_per_date = true;

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
            console.error("Employee not loaded yet.");
            return;
        }

        attendance_calendar = null;

        attendance_calendar_filters = [
            ["Attendance", "employee", "=", employee],
            ["Attendance", "docstatus", "=", 1]
        ];

        // console.log("Attendance calendar filters:", attendance_calendar_filters);

        container.innerHTML = "";

        frappe.require("calendar.bundle.js", function () {

            // console.log("calendar.bundle.js loaded.");

            load_attendance_calendar_config();

        });

    }


    // =========================================================
    // LOAD CALENDAR CONFIGURATION
    // =========================================================

    function load_attendance_calendar_config() {

        frappe.model.with_doc(

            "Calendar View",

            "Employee Attendance Calendar",

            function () {

                const calendar_doc =
                    frappe.get_doc(
                        "Calendar View",
                        "Employee Attendance Calendar"
                    );

                if (!calendar_doc) {

                    console.error("Employee Attendance Calendar not found.");

                    show_calendar_error(
                        "Employee Attendance Calendar configuration was not found."
                    );

                    return;

                }

                // console.log(
                //     "Employee Attendance Calendar configuration:",
                //     calendar_doc
                // );

                const field_map = {
                    id: "name",
                    start: calendar_doc.start_date_field,
                    end: calendar_doc.end_date_field,
                    title: calendar_doc.subject_field,
                    allDay: calendar_doc.all_day ? 1 : 0
                };

                // console.log("Calendar field map:", field_map);

                if (!field_map.start) {

                    console.error("Calendar start date field is missing.");

                    show_calendar_error(
                        "Calendar start date field is not configured."
                    );

                    return;

                }

                const list_view = {
                    filter_area: {
                        get: function () {
                            return attendance_calendar_filters;
                        }
                    }
                };

                const calendar_options = {
                    doctype: "Attendance",
                    parent: $("#attendance-calendar"),
                    page: page,
                    list_view: list_view,
                    field_map: field_map,
                    get_events_method: "frappe.desk.calendar.get_events"
                };

                // console.log("Initializing Frappe Calendar...");

                try {

                    attendance_calendar =
                        new frappe.views.Calendar(calendar_options);

                    window.employee_attendance_calendar =
                        attendance_calendar;

                    // Reload holiday details when the visible month changes.
                    const calendarContainer =
                        document.getElementById("attendance-calendar");

                    if (calendarContainer) {

                        calendarContainer.addEventListener(
                            "click",
                            function (event) {

                                const button = event.target.closest(
                                    ".fc-prev-button, " +
                                    ".fc-next-button, " +
                                    ".fc-today-button"
                                );

                                if (!button) {
                                    return;
                                }

                                setTimeout(function () {
                                    reload_holidays_for_visible_month();
                                }, 300);
                            }
                        );
                    }

                    // ONE event per date: patch before the first
                    // events response is processed

                    enable_single_event_per_date(attendance_calendar);

                    // console.log(
                    //     "Frappe Attendance Calendar initialized successfully.",
                    //     attendance_calendar
                    // );

                    // turn off drag-to-create, keep weekends visible

                    try {

                        const fc =
                            attendance_calendar.fullCalendar ||
                            attendance_calendar.calendar ||
                            attendance_calendar.cal;

                        if (fc && typeof fc.setOption === "function") {

                            fc.setOption("selectable", false);
                            fc.setOption("weekends", true);

                        }

                        // in case the first fetch already finished
                        // before the patch was applied

                        if (fc && typeof fc.refetchEvents === "function") {
                            fc.refetchEvents();
                        }

                    }
                    catch (e) {

                        console.warn(
                            "Could not configure calendar:",
                            e
                        );

                    }

                    setTimeout(function () {

                        resize_attendance_calendar();
                        watch_calendar_height();
                        watch_calendar_event_colors();
                        add_holidays_to_calendar();

                    }, 500);

                    setTimeout(function () {

                        resize_attendance_calendar();
                        sync_left_column_height();
                        colorize_calendar_events();
                        add_holidays_to_calendar();

                    }, 1200);

                }
                catch (error) {

                    console.error(
                        "Failed to initialize Frappe Calendar:",
                        error
                    );

                    show_calendar_error(
                        "Unable to initialize Frappe Attendance Calendar."
                    );

                }

            }

        );

    }


    // =========================================================
    // LOAD LEAVE BALANCE
    //
    // The Leave Type list is loaded first (once, cached). Each
    // leave type returned by the leave balance API is resolved to
    // its official Leave Type name; a value that is not in the
    // list is shown exactly as the API returned it.
    // =========================================================

    function load_leave_balance() {

        load_leave_types().then(function () {

            frappe.call({

                method: "teceze.api.mobile_app.crud.leave_balance",

                callback: function (r) {

                    if (!r.message || !r.message.success) {

                        console.error("Failed to load leave balance:", r.message);

                        return;

                    }

                    const leave_balances = r.message.data || [];

                    // console.log("Leave balances loaded:", leave_balances);

                    const parent =
                        document.querySelector(".leave-balance-section");

                    if (!parent) {

                        console.error("Leave balance section not found");

                        return;

                    }

                    parent.innerHTML = "";

                    // icon + color per leave type
                    // progress bar = days USED
                    // negative balance is shown in red

                    leave_balances.forEach(function (item) {

                        const leave_type =
                            resolve_leave_type(item.leave_type) || "Leave";

                        const balance = Number(item.balance || 0);

                        const total = Number(item.total || 0);

                        const style = get_leave_style(leave_type);

                        // Used = Total - Balance

                        const used = Number((total - balance).toFixed(2));

                        // from the Leave Type "is_lwp" flag
                        // (name check only if the list is unavailable)

                        const is_lwp = is_leave_without_pay(leave_type);

                        // used more than allocated (e.g. LWP: total 0, used 2)

                        const is_negative = used > total;

                        const pct =
                            total > 0
                                ? Math.min((used / total) * 100, 100)
                                : (used > 0 ? 100 : 0);

                        const card = document.createElement("div");

                        card.className =
                            "card leave-balance-card " +
                            style.cls +
                            (is_negative ? " is-negative" : "");

                        // total shown only for normal leave types

                        const total_display =
                            is_lwp
                                ? ""
                                : `
                                    <span class="leave-card-total">

                                        / ${frappe.utils.escape_html(String(total))}

                                    </span>
                                `;

                        card.innerHTML = `

                            <div class="leave-card-top">

                                <div class="leave-card-icon">

                                    <i class="fa ${style.icon}"></i>

                                </div>

                                <div class="leave-card-info">

                                    <h4 class="leave-card-title">

                                        ${frappe.utils.escape_html(String(leave_type))}

                                    </h4>

                                    <div class="leave-card-balance">

                                        <strong>

                                            ${frappe.utils.escape_html(String(used))}

                                        </strong>

                                        ${total_display}

                                        <span class="leave-card-days">

                                            days used

                                        </span>

                                    </div>

                                </div>

                            </div>

                            <div class="leave-card-progress">

                                <div
                                    class="leave-card-progress-bar"
                                    style="width: ${pct}%;">
                                </div>

                            </div>

                        `;

                        parent.appendChild(card);

                    });

                },

                error: function (err) {

                    console.error("Error loading leave balance:", err);

                }

            });

        });

    }


    // =========================================================
    // CALENDAR ERROR
    // =========================================================

    function show_calendar_error(message) {

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        container.innerHTML = `

            <div
                class="text-muted text-center"
                style="
                    padding:40px;
                    font-size:14px;
                ">

                ${frappe.utils.escape_html(message)}

            </div>

        `;

    }


    // =========================================================
    // CALENDAR RESIZE
    // =========================================================

    function resize_attendance_calendar() {

        if (!attendance_calendar) {
            return;
        }

        try {

            if (
                attendance_calendar.fullCalendar &&
                typeof attendance_calendar.fullCalendar.updateSize ===
                    "function"
            ) {
                attendance_calendar.fullCalendar.updateSize();
            }

            if (typeof attendance_calendar.resize === "function") {
                attendance_calendar.resize();
            }

        }
        catch (error) {

            console.warn("Calendar resize failed:", error);

        }

    }


    // =========================================================
    // SYNC LEFT COLUMN HEIGHT
    //
    // The CSS grid stretches both columns to the same height,
    // so we only clear any old inline height.
    // =========================================================

    function sync_left_column_height() {

        const leftCol = document.querySelector(".attendance-left");

        if (!leftCol) {
            return;
        }

        leftCol.style.height = "";

    }


    // =========================================================
    // WATCH CALENDAR HEIGHT
    // =========================================================

    function watch_calendar_height() {

        const calendarCard =
            document.querySelector(".attendance-calendar-card");

        if (!calendarCard) {
            return;
        }

        if (calendar_height_observer) {
            calendar_height_observer.disconnect();
        }

        if (typeof ResizeObserver === "undefined") {

            sync_left_column_height();

            return;

        }

        calendar_height_observer =
            new ResizeObserver(function () {
                sync_left_column_height();
            });

        calendar_height_observer.observe(calendarCard);

        sync_left_column_height();

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
    //
    // Uses the GROUPED Attendance status for the date. Falls back
    // to matching the visible text only when there is no
    // Attendance record for that date.
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

        // USE GROUPED ATTENDANCE STATUS

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

        // FALLBACK: MATCH VISIBLE TEXT

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
    //
    // enable_single_event_per_date() already stops duplicates at
    // the source. This only catches anything that still slips
    // through (e.g. a Frappe version where prepare_events is not
    // used). It hides the whole FullCalendar "harness" wrapper
    // and uses !important, because plain inline display:none is
    // overridden by a stylesheet rule using display ... !important.
    // =========================================================

    function hide_calendar_element(el) {

        if (!el) {
            return;
        }

        el.style.setProperty("display", "none", "important");

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

                // only dates that have an Attendance record

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

                        eventEl.setAttribute("data-attendance-date", date);

                        return;

                    }

                    hide_calendar_element(eventEl);
                    hide_calendar_element(harness);

                    eventEl.setAttribute("data-attendance-hidden", "1");

                });

            });

    }


    // =========================================================
    // COLORIZE CALENDAR EVENTS
    // + ADD WORKING HOURS / LEAVE TYPE
    // + SAFETY NET FOR DUPLICATES
    // + ADD HOLIDAYS
    // + HIDE FRAPPE EXTRAS
    // =========================================================

    function colorize_calendar_events() {

        hide_calendar_extras();

        const container = document.getElementById("attendance-calendar");

        if (!container) {
            return;
        }

        const events =
            container.querySelectorAll(
                ".fc-event, " +
                ".fc-daygrid-event, " +
                ".fc-list-event"
            );

        events.forEach(function (eventEl) {

            colorize_calendar_event(eventEl);

            add_extra_info_to_calendar_event(eventEl);

        });

        remove_duplicate_calendar_events();

        add_holidays_to_calendar();

    }


    // =========================================================
    // WATCH CALENDAR EVENTS
    // =========================================================

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
    // REFRESH CALENDAR
    // =========================================================

    function refresh_attendance_calendar() {

        load_calendar_data(function () {

            if (!attendance_calendar) {

                if (employee) {
                    create_attendance_calendar();
                }

                return;

            }

            try {

                // make sure the one-event-per-date patch is on

                enable_single_event_per_date(attendance_calendar);

                if (typeof attendance_calendar.refresh === "function") {

                    attendance_calendar.refresh();

                    setTimeout(function () {

                        colorize_calendar_events();
                        add_holidays_to_calendar();

                    }, 500);

                    // console.log("Attendance calendar refreshed.");

                    return;

                }

                if (attendance_calendar.fullCalendar) {

                    attendance_calendar.fullCalendar.refetchEvents();

                    setTimeout(function () {

                        colorize_calendar_events();
                        add_holidays_to_calendar();

                    }, 500);

                    // console.log("Attendance calendar events refreshed.");

                }

            }
            catch (error) {

                console.error("Calendar refresh failed:", error);

                create_attendance_calendar();

            }

        });

    }


    // =========================================================
    // START LIVE WORKING TIMER
    // =========================================================

    function startWorkingTimer(
        checkinTime,
        previousSeconds,
        sessionExpiresAt
    ) {

        stopWorkingTimer();

        const checkIn = new Date(checkinTime);

        const base = parseInt(previousSeconds || 0);

        const capInstant =
            sessionExpiresAt
                ? new Date(sessionExpiresAt)
                : new Date(checkIn.getTime() + (86400 - base) * 1000);

        render_timer(base, checkIn);

        timerInterval = setInterval(function () {

            const now = new Date();

            if (now.getTime() >= capInstant.getTime()) {

                stopWorkingTimer();

                load_status();

                return;

            }

            render_timer(base, checkIn);

        }, 1000);

    }


    // =========================================================
    // UPDATE TIMER DISPLAY
    // =========================================================

    function render_timer(base, checkIn) {

        let liveElapsed =
            Math.floor((new Date().getTime() - checkIn.getTime()) / 1000);

        if (liveElapsed < 0) {
            liveElapsed = 0;
        }

        let totalSeconds = base + liveElapsed;

        if (totalSeconds > 86400) {
            totalSeconds = 86400;
        }

        set_digit_timer(totalSeconds);

        const timer = _format_hms(totalSeconds);

        $("#live-timer").text(timer);

        $("#working_hours").text(timer);

    }


    // =========================================================
    // SET DIGIT TIMER
    // =========================================================

    function set_digit_timer(totalSeconds) {

        totalSeconds = parseInt(totalSeconds || 0);

        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        $("#timer_hh").text(String(hrs).padStart(2, "0"));
        $("#timer_mm").text(String(mins).padStart(2, "0"));
        $("#timer_ss").text(String(secs).padStart(2, "0"));

    }


    // =========================================================
    // FORMAT HH:MM:SS
    // =========================================================

    function _format_hms(totalSeconds) {

        totalSeconds = parseInt(totalSeconds || 0);

        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        return (
            String(hrs).padStart(2, "0") +
            ":" +
            String(mins).padStart(2, "0") +
            ":" +
            String(secs).padStart(2, "0")
        );

    }


    // =========================================================
    // STOP TIMER
    // =========================================================

    function stopWorkingTimer() {

        if (timerInterval) {

            clearInterval(timerInterval);

            timerInterval = null;

        }

    }


    // =========================================================
    // LOAD TODAY'S STATUS
    // =========================================================

    function load_status() {

        if (!employee) {
            return;
        }

        frappe.call({

            method: "teceze.api.employee_login.get_today_status",

            args: { employee: employee },

            callback: function (r) {

                if (!r.message) {
                    return;
                }

                const data = r.message;

                // Header badge is hidden by CSS now (the pill in the
                // profile card replaces it). Kept for compatibility.

                let badge = "";

                if (data.status === "CHECKED IN") {

                    badge = `
                        <span class="status-badge status-in">
                            <span class="status-dot"></span>
                            Checked In
                        </span>
                    `;

                }
                else if (data.status === "CHECKED OUT") {

                    badge = `
                        <span class="status-badge status-out">
                            <span class="status-dot"></span>
                            Checked Out
                        </span>
                    `;

                }
                else if (data.status === "MISSED CHECK OUT") {

                    badge = `
                        <span class="status-badge status-warning">
                            <span class="status-dot"></span>
                            Missed Check Out
                        </span>
                    `;

                }
                else {

                    badge = `
                        <span class="status-badge status-none">
                            <span class="status-dot"></span>
                            Not Checked In
                        </span>
                    `;

                }

                $("#status").html(badge);

                // pill color comes from a CSS class
                // (st-in / st-out / st-missed / st-none)

                const STATUS_TEXT = {

                    "CHECKED IN": { text: "In", cls: "st-in" },

                    "CHECKED OUT": { text: "Out", cls: "st-out" },

                    "MISSED CHECK OUT": {
                        text: "Missed Check Out",
                        cls: "st-missed"
                    },

                    "NOT CHECKED IN": {
                        text: "Not Checked In",
                        cls: "st-none"
                    }

                };

                const status_text =
                    STATUS_TEXT[data.status] ||
                    STATUS_TEXT["NOT CHECKED IN"];

                $("#status_text")
                    .text(status_text.text)
                    .attr("class", "status-text " + status_text.cls);

                $("#checkin_time").text(data.checkin_time || "--");

                $("#checkout_time").text(data.checkout_time || "--");

                if (data.status === "CHECKED IN") {

                    startWorkingTimer(
                        data.checkin_datetime,
                        data.previous_seconds,
                        data.session_expires_at
                    );

                }
                else {

                    stopWorkingTimer();

                    if (data.status === "CHECKED OUT") {

                        const seconds = parseInt(data.previous_seconds || 0);

                        set_digit_timer(seconds);

                        $("#live-timer").text(_format_hms(seconds));

                        $("#working_hours").text(
                            data.working_hours || "00:00:00"
                        );

                    }
                    else if (data.status === "MISSED CHECK OUT") {

                        set_digit_timer(86400);

                        $("#live-timer").text("24:00:00");

                        $("#working_hours").text("24:00:00");

                    }
                    else {

                        set_digit_timer(0);

                        $("#live-timer").text("00:00:00");

                        $("#working_hours").text("00:00:00");

                    }

                }

                // button has an icon.
                // The click handler still works because
                // btn.text().trim() returns "Check In" / "Check Out".

                const buttonText = data.button || "Check In";

                const button_icon =
                    buttonText === "Check Out"
                        ? "fa-sign-out"
                        : "fa-sign-in";

                $("#attendance_btn").html(
                    `<i class="fa ${button_icon}"></i>` +
                    `<span>${frappe.utils.escape_html(buttonText)}</span>`
                );

                $("#attendance_btn").removeClass("checkin checkout");

                if (buttonText === "Check Out") {
                    $("#attendance_btn").addClass("checkout");
                }
                else {
                    $("#attendance_btn").addClass("checkin");
                }

            }

        });

    }


    // =========================================================
    // RECENT ATTENDANCE HELPERS
    // =========================================================

    function time_to_minutes(str) {

        const m =
            String(str || "")
                .trim()
                .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

        if (!m) {
            return null;
        }

        let h = Number(m[1]) % 12;

        if (m[3].toUpperCase() === "PM") {
            h += 12;
        }

        return h * 60 + Number(m[2]);

    }


    // Uses the server value when present, otherwise works it out
    // from the check-in / check-out times.

    function hours_for_row(row) {

        const wh = row.working_hours;

        if (
            wh !== undefined &&
            wh !== null &&
            String(wh).trim() !== ""
        ) {
            return String(wh);
        }

        const a = time_to_minutes(row.check_in);
        const b = time_to_minutes(row.check_out);

        if (a === null || b === null) {
            return "";
        }

        let diff = b - a;

        if (diff < 0) {
            diff += 1440;
        }

        return (diff / 60).toFixed(2);

    }


    function table_cell(value) {

        const v = String(value == null ? "" : value).trim();

        return v
            ? `<td>${frappe.utils.escape_html(v)}</td>`
            : `<td class="is-empty">--</td>`;

    }


    // =========================================================
    // LOAD RECENT ATTENDANCE
    // =========================================================

    function load_recent_attendance() {

        if (!employee) {
            return;
        }

        frappe.call({

            method: "teceze.api.employee_attendance.get_recent_attendance",

            args: { employee: employee },

            callback: function (r) {

                const tbody = $("#attendance_history");

                tbody.empty();

                if (!r.message || r.message.length === 0) {

                    tbody.append(`
                        <tr>
                            <td colspan="3">
                                No attendance records found
                            </td>
                        </tr>
                    `);

                    return;
                }

                r.message.forEach(function (row) {

                    tbody.append(`

                        <tr>

                            ${table_cell(row.date)}

                            ${table_cell(row.check_in)}

                            ${table_cell(row.check_out)}

                        </tr>

                    `);

                });

            },

            error: function () {

                $("#attendance_history").html(`
                    <tr>
                        <td colspan="3">
                            Unable to load attendance history
                        </td>
                    </tr>
                `);

            }

        });

    }


    // =========================================================
    // VIEW ALL ATTENDANCE
    // =========================================================

    $(document).off("click.employeeAttendance", "#view_all_attendance");

    $(document).on(
        "click.employeeAttendance",
        "#view_all_attendance",
        function (e) {

            e.preventDefault();

            if (!employee) {
                return;
            }

            frappe.set_route("List", "Employee Checkin", {
                employee: employee
            });

        }
    );


    // =========================================================
    // GET CURRENT LOCATION
    // =========================================================

    function getCurrentLocation(callback) {

        if (!navigator.geolocation) {

            frappe.msgprint(
                "Geolocation is not supported by this browser."
            );

            $("#attendance_btn").prop("disabled", false);

            return;
        }

        navigator.geolocation.getCurrentPosition(

            function (position) {

                callback({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });

            },

            function (error) {

                let message = "Unable to fetch current location.";

                switch (error.code) {

                    case error.PERMISSION_DENIED:

                        message = "Location permission denied.";

                        break;

                    case error.POSITION_UNAVAILABLE:

                        message =
                            "Unable to detect your location. Please turn on your location and try checking in again.";

                        break;

                    case error.TIMEOUT:

                        message = "Location request timed out.";

                        break;

                }

                frappe.msgprint(message);

                $("#attendance_btn").prop("disabled", false);

            },

            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }

        );

    }


    // =========================================================
    // CHECK IN / CHECK OUT BUTTON
    // =========================================================

    $(document).off("click.employeeAttendance", "#attendance_btn");

    $(document).on(
        "click.employeeAttendance",
        "#attendance_btn",
        function () {

            if (!employee) {

                frappe.msgprint("Employee not found.");

                return;

            }

            const btn = $(this);

            btn.prop("disabled", true);

            const log_type =
                btn.text().trim() === "Check In" ? "IN" : "OUT";

            getCurrentLocation(function (location) {

                frappe.call({

                    method:
                        "teceze.api.employee_attendance.employee_checkin",

                    freeze: true,

                    freeze_message: "Processing Attendance...",

                    args: {
                        employee: employee,
                        latitude: location.latitude,
                        longitude: location.longitude,
                        log_type: log_type
                    },

                    callback: function (r) {

                        btn.prop("disabled", false);

                        if (r.message && r.message.success) {

                            frappe.show_alert({
                                message: r.message.message,
                                indicator: "green"
                            });

                        }
                        else {

                            frappe.msgprint(
                                r.message
                                    ? r.message.message
                                    : "Attendance failed."
                            );

                        }

                        load_status();
                        load_recent_attendance();
                        load_reporting_manager();
                        load_associate_members();

                        setTimeout(function () {
                            refresh_attendance_calendar();
                        }, 500);

                    },

                    error: function () {

                        btn.prop("disabled", false);

                        frappe.msgprint("Unable to process attendance.");

                        load_status();
                        load_recent_attendance();
                        refresh_attendance_calendar();

                    }

                });

            });

        }
    );


    // =========================================================
    // RESIZE CALENDAR ON WINDOW RESIZE
    // =========================================================

    $(window).off("resize.employeeAttendanceCalendar");

    $(window).on("resize.employeeAttendanceCalendar", function () {

        resize_attendance_calendar();

        sync_left_column_height();

    });


    // =========================================================
    // CLEANUP WHEN LEAVING PAGE
    // =========================================================

    $(wrapper).on("page-unload", function () {

        stopWorkingTimer();

        attendance_calendar = null;
        attendance_working_hours = {};
        attendance_records_by_date = {};
        holiday_calendar_data = {};
        employee_default_shift = null;
        employee_holiday_list = null;

        if (calendar_height_observer) {

            calendar_height_observer.disconnect();

            calendar_height_observer = null;

        }

        if (calendar_events_observer) {

            calendar_events_observer.disconnect();

            calendar_events_observer = null;

        }

        if (calendar_render_timer) {

            clearTimeout(calendar_render_timer);

            calendar_render_timer = null;

        }

        $(window).off("resize.employeeAttendanceCalendar");

        $(document).off(".employeeAttendance");

    });

};