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

    let employee_holiday_list = null;
    let employee_default_shift = null;

    let calendar_events_observer = null;
    let calendar_height_observer = null;
    let calendar_render_timer = null;
    let employee_selection_timer = null;

    // Every employee switch gets a new token. A load that finishes
    // with an old token is ignored, so fast switching never mixes
    // data and a "stuck" loading flag is impossible.
    let load_token = 0;


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
    // collapse into an empty strip.
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
    // LOAD CALENDAR DATA
    // =========================================================

    function load_calendar_data(emp, token, callback) {

        load_calendar_working_hours(emp, token, function () {

            load_employee_holiday_details(emp, token, function () {

                if (callback) {
                    callback();
                }

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

                        leave_type: String(row.leave_type || "").trim(),

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
                        custom_status: holiday.custom_status
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

        let holidayContainer = dayCell.querySelector(".calendar-holiday");

        if (!holidayContainer) {

            holidayContainer = document.createElement("div");

            holidayContainer.className = "calendar-holiday";

            const dayFrame =
                dayCell.querySelector(".fc-daygrid-day-frame");

            (dayFrame || dayCell).appendChild(holidayContainer);

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

            const name = document.createElement("span");

            name.className = "calendar-holiday-name";
            name.textContent =
                clean_holiday_description(holiday.description) ||
                "Holiday";

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
    // =========================================================

    function clear_attendance_calendar() {

        attendance_working_hours = {};
        attendance_records_by_date = {};
        holiday_calendar_data = {};
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