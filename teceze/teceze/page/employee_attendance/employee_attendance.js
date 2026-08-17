frappe.pages["employee_attendance"].on_page_load = function (wrapper) {

    // =========================================================
    // VARIABLES
    // =========================================================

    let employee = null;
    let timerInterval = null;

    let attendance_calendar = null;
    let attendance_calendar_filters = [];

    let calendar_height_observer = null;
    let calendar_events_observer = null;

    const MAX_VISIBLE_ASSOCIATES = 5;

    const LEFT_RIGHT_STACK_BREAKPOINT = 850;


    // =========================================================
    // CALENDAR EVENT STATUS CLASSES
    // =========================================================

    const CALENDAR_STATUS_CLASS_MAP = [
        {
            match: "half day",
            className: "cal-event-halfday"
        },
        {
            match: "present",
            className: "cal-event-present"
        },
        {
            match: "absent",
            className: "cal-event-absent"
        },
        {
            match: "leave",
            className: "cal-event-leave"
        },
        {
            match: "holiday",
            className: "cal-event-holiday"
        }
    ];

    const CALENDAR_STATUS_CLASSNAMES =
        CALENDAR_STATUS_CLASS_MAP.map(
            function (entry) {
                return entry.className;
            }
        );


    // =========================================================
    // CREATE PAGE
    // =========================================================

    const page = frappe.ui.make_app_page({

        parent: wrapper,

        title: "Employee Attendance",

        single_column: true

    });


    // =========================================================
    // PAGE HTML
    // =========================================================

    page.main.html(`

        <div class="attendance-container">

            <!-- ================================================= -->
            <!-- HEADER -->
            <!-- ================================================= -->

            <div class="attendance-header">

                <div class="header-left">

                    <div class="header-title-block">

                        <h2>
                            Employee Attendance
                        </h2>

                        <p class="header-subtitle">
                            Track your attendance and working hours
                        </p>

                    </div>

                    <span id="status">

                        <span class="status-badge status-none">

                            <span class="status-dot"></span>

                            Loading...

                        </span>

                    </span>

                </div>


                <div class="header-right">

                    <div id="current-date-main"></div>

                    <div
                        id="current-date-sub"
                        class="text-muted">
                    </div>

                </div>

            </div>


            <!-- ================================================= -->
            <!-- MAIN GRID -->
            <!-- ================================================= -->

            <div class="attendance-main-grid">


                <!-- ================================================= -->
                <!-- LEFT -->
                <!-- ================================================= -->

                <div class="attendance-left">


                    <!-- ================================================= -->
                    <!-- ATTENDANCE CARD
                    <!-- ================================================= -->

                    <div class="card attendance-card attendance-card-centered">

                        <div
                            class="avatar avatar-large"
                            id="avatar_initial">

                            A

                        </div>


                        <h3
                            id="Employee_name"
                            class="profile-name">

                            Loading...

                        </h3>


                        <p
                            id="Employee_role"
                            class="profile-role">

                            Loading...

                        </p>


                        <div
                            id="status_text"
                            class="status-text">

                            --

                        </div>


                        <!-- TIMER -->

                        <div class="digit-timer">

                            <span
                                class="digit-box"
                                id="timer_hh">

                                00

                            </span>

                            <span class="digit-colon">
                                :
                            </span>

                            <span
                                class="digit-box"
                                id="timer_mm">

                                00

                            </span>

                            <span class="digit-colon">
                                :
                            </span>

                            <span
                                class="digit-box"
                                id="timer_ss">

                                00

                            </span>

                        </div>


                        <!-- BACKWARD COMPATIBILITY -->

                        <span
                            id="live-timer"
                            style="display:none;">

                            00:00:00

                        </span>


                        <span
                            id="working_hours"
                            style="display:none;">

                            00:00:00

                        </span>


                        <!-- ATTENDANCE BUTTON -->

                        <div class="button-area">

                            <button
                                class="btn attendance-button"
                                id="attendance_btn">

                                Loading...

                            </button>

                        </div>


                        <div class="divider"></div>


                        <!-- CHECK IN / OUT -->

                        <div class="checkinout-grid">

                            <div class="checkinout-box">

                                <span class="cio-label">
                                    Check In
                                </span>

                                <strong
                                    id="checkin_time"
                                    class="cio-value">

                                    --

                                </strong>

                            </div>


                            <div class="checkinout-box">

                                <span class="cio-label">
                                    Check Out
                                </span>

                                <strong
                                    id="checkout_time"
                                    class="cio-value">

                                    --

                                </strong>

                            </div>

                        </div>

                    </div>


                    <!-- ================================================= -->
                    <!-- REPORTING MANAGER
                    <!-- ================================================= -->

                    <div class="card manager-card">

                        <div class="manager-card-title">
                            Reporting Manager
                        </div>


                        <div
                            class="manager-row"
                            id="manager_row">

                            <div
                                class="avatar avatar-small"
                                id="manager_avatar">

                                --

                            </div>


                            <div class="manager-info">

                                <strong id="manager_name">
                                    Loading...
                                </strong>

                                <span
                                    id="manager_status"
                                    class="member-status">

                                    --

                                </span>

                            </div>

                        </div>

                    </div>


                    <!-- ================================================= -->
                    <!-- ASSOCIATE MEMBERS
                    <!-- ================================================= -->

                    <div class="card members-card">

                        <div class="members-card-header">

                            <div class="members-card-title">

                                Associate Members

                            </div>


                            <a
                                href="#"
                                id="view_all_members"
                                class="view-all-link">

                                View All

                            </a>

                        </div>


                        <div
                            id="associate_members_list"
                            class="members-list">

                            <div
                                class="text-muted text-center"
                                style="padding:16px;">

                                Loading...

                            </div>

                        </div>

                    </div>

                </div>


                <!-- ================================================= -->
                <!-- RIGHT
                <!-- ================================================= -->

                <div class="attendance-right">

                    <div class="card attendance-calendar-card">

                        <div class="attendance-calendar-header">

                            <h4>
                                Attendance Calendar
                            </h4>

                        </div>


                        <div
                            id="attendance-calendar"
                            class="attendance-calendar-container">
                        </div>


                        <div class="calendar-legend">

                            <span class="legend-item">

                                <span
                                    class="legend-dot legend-present">
                                </span>

                                Present

                            </span>


                            <span class="legend-item">

                                <span
                                    class="legend-dot legend-absent">
                                </span>

                                Absent

                            </span>


                            <span class="legend-item">

                                <span
                                    class="legend-dot legend-leave">
                                </span>

                                Leave

                            </span>


                            <span class="legend-item">

                                <span
                                    class="legend-dot legend-halfday">
                                </span>

                                Half Day

                            </span>


                            <span class="legend-item">

                                <span
                                    class="legend-dot legend-holiday">
                                </span>

                                Holiday

                            </span>

                        </div>

                    </div>

                </div>

            </div>


            <!-- ================================================= -->
            <!-- RECENT ATTENDANCE
            <!-- ================================================= -->

            <div class="card history-card">

                <div class="history-header">

                    <h4>
                        Recent Attendance
                    </h4>


                    <a
                        href="#"
                        id="view_all_attendance"
                        class="view-all-link">

                        View All

                    </a>

                </div>


                <div class="table-responsive">

                    <table class="table attendance-table">

                        <thead>

                            <tr>

                                <th>
                                    Date
                                </th>

                                <th>
                                    Check In
                                </th>

                                <th>
                                    Check Out
                                </th>

                                <th>
                                    Hours
                                </th>

                            </tr>

                        </thead>


                        <tbody id="attendance_history">

                            <tr>

                                <td
                                    colspan="4"
                                    class="text-center">

                                    Loading...

                                </td>

                            </tr>

                        </tbody>

                    </table>

                </div>

            </div>

        </div>

    `);


    // =========================================================
    // CURRENT DATE
    // =========================================================

    update_current_date();


    function update_current_date() {

        const today = new Date();


        $("#current-date-main").text(

            today.toLocaleDateString(
                undefined,
                {
                    year: "numeric",
                    month: "short",
                    day: "2-digit"
                }
            )

        );


        $("#current-date-sub").text(

            today.toLocaleDateString(
                undefined,
                {
                    weekday: "long"
                }
            )

        );

    }


    // =========================================================
    // INITIAL LOAD
    // =========================================================

    load_employee();


    // =========================================================
    // GET LOGGED EMPLOYEE
    // =========================================================

    function load_employee() {

        frappe.call({

            method:
                "teceze.api.employee_login.get_logged_employee",

            callback: function (r) {

                if (!r.message) {

                    frappe.msgprint(
                        "Employee not mapped."
                    );

                    return;

                }


                /*
                 * IMPORTANT:
                 *
                 * employee is retained because your existing
                 * APIs require Employee.
                 *
                 * The backend MUST validate this value against
                 * frappe.session.user.
                 */

                employee =
                    r.message.name;


                if (!employee) {

                    frappe.msgprint(
                        "No Employee is mapped to the logged-in user."
                    );

                    return;

                }


                $("#Employee_name").text(
                    r.message.employee_name || "-"
                );


                $("#Employee_role").text(

                    r.message.designation ||
                    r.message.employee_location ||
                    "-"

                );


                $("#avatar_initial").text(

                    (
                        r.message.employee_name ||
                        "?"
                    )
                        .charAt(0)
                        .toUpperCase()

                );


                // Current status

                load_status();


                // Recent attendance

                load_recent_attendance();


                // Reporting manager

                load_reporting_manager();


                // Associate members

                load_associate_members();


                // Calendar

                create_attendance_calendar();

            },


            error: function () {

                frappe.msgprint(
                    "Unable to load employee information."
                );

            }

        });

    }


    // =========================================================
    // CURRENT STATUS
    // =========================================================

    function load_status() {

        if (!employee) {
            return;
        }


        frappe.call({

            method:
                "teceze.api.employee_login.get_today_status",

            args: {

                employee:
                    employee

            },


            callback: function (r) {

                if (!r.message) {
                    return;
                }


                const data =
                    r.message;


                update_status_ui(
                    data
                );


                if (
                    data.status ===
                    "CHECKED IN"
                ) {

                    startWorkingTimer(

                        data.checkin_datetime,

                        data.previous_seconds,

                        data.session_expires_at

                    );

                }

                else {

                    stopWorkingTimer();


                    const seconds =
                        parseInt(
                            data.previous_seconds || 0,
                            10
                        );


                    set_digit_timer(
                        seconds
                    );


                    $("#live-timer").text(
                        _format_hms(seconds)
                    );


                    $("#working_hours").text(
                        data.working_hours ||
                        "00:00:00"
                    );

                }

            },


            error: function () {

                stopWorkingTimer();

                $("#status_text")
                    .text(
                        "Unable to load status"
                    );

            }

        });

    }


    // =========================================================
    // STATUS UI
    // =========================================================

    function update_status_ui(
        data
    ) {

        const status =
            data.status || "";


        let badge_class =
            "status-none";


        let badge_text =
            "Not Checked In";


        if (
            status ===
            "CHECKED IN"
        ) {

            badge_class =
                "status-in";

            badge_text =
                "Checked In";

        }

        else if (
            status ===
            "CHECKED OUT"
        ) {

            badge_class =
                "status-out";

            badge_text =
                "Checked Out";

        }

        else if (
            status ===
            "MISSED CHECK OUT"
        ) {

            badge_class =
                "status-warning";

            badge_text =
                "Missed Check Out";

        }

        else if (
            status ===
            "ADMIN"
        ) {

            badge_class =
                "status-none";

            badge_text =
                "System Manager";

        }


        $("#status").html(`

            <span
                class="status-badge ${badge_class}">

                <span class="status-dot"></span>

                ${frappe.utils.escape_html(
                    badge_text
                )}

            </span>

        `);


        $("#status_text")
            .text(
                badge_text
            );


        $("#checkin_time")
            .text(
                data.checkin_time || "--"
            );


        $("#checkout_time")
            .text(
                data.checkout_time || "--"
            );


        const button =
            $("#attendance_btn");


        const buttonText =
            data.button ||
            (
                status === "CHECKED IN"
                    ? "Check Out"
                    : "Check In"
            );


        button
            .text(buttonText)
            .removeClass(
                "checkin checkout"
            );


        if (
            buttonText ===
            "Check Out"
        ) {

            button.addClass(
                "checkout"
            );

        }

        else {

            button.addClass(
                "checkin"
            );

        }


        if (
            status ===
            "ADMIN"
        ) {

            button.prop(
                "disabled",
                true
            );

        }

        else {

            button.prop(
                "disabled",
                false
            );

        }

    }


    // =========================================================
    // TIMER
    // =========================================================

    function startWorkingTimer(

        checkin_datetime,

        previous_seconds,

        session_expires_at

    ) {

        stopWorkingTimer();


        if (!checkin_datetime) {

            set_digit_timer(
                previous_seconds || 0
            );

            return;

        }


        const checkinDate =
            new Date(
                checkin_datetime
            );


        if (
            Number.isNaN(
                checkinDate.getTime()
            )
        ) {

            set_digit_timer(
                previous_seconds || 0
            );

            return;

        }


        const previous =
            parseInt(
                previous_seconds || 0,
                10
            );


        function updateTimer() {

            const now =
                Date.now();


            let elapsed =
                Math.floor(
                    (
                        now -
                        checkinDate.getTime()
                    ) / 1000
                );


            if (
                elapsed < 0
            ) {

                elapsed = 0;

            }


            let total =
                previous +
                elapsed;


            /*
             * Frontend timer is ONLY a display.
             *
             * Backend remains the source of truth.
             */

            if (
                total >
                86400
            ) {

                total =
                    86400;

            }


            /*
             * If backend provides session expiry,
             * never display beyond that session.
             */

            if (
                session_expires_at
            ) {

                const expiry =
                    new Date(
                        session_expires_at
                    );


                if (
                    !Number.isNaN(
                        expiry.getTime()
                    )
                ) {

                    const remaining =
                        Math.max(
                            0,
                            Math.floor(
                                (
                                    expiry.getTime() -
                                    Date.now()
                                ) / 1000
                            )
                        );


                    if (
                        total >= 86400 ||
                        remaining <= 0
                    ) {

                        total =
                            Math.min(
                                total,
                                86400
                            );

                    }

                }

            }


            set_digit_timer(
                total
            );


            $("#live-timer")
                .text(
                    _format_hms(total)
                );


            $("#working_hours")
                .text(
                    _format_hms(total)
                );

        }


        updateTimer();


        timerInterval =
            setInterval(
                updateTimer,
                1000
            );

    }


    // =========================================================
    // STOP TIMER
    // =========================================================

    function stopWorkingTimer() {

        if (
            timerInterval
        ) {

            clearInterval(
                timerInterval
            );

            timerInterval =
                null;

        }

    }


    // =========================================================
    // TIMER DISPLAY
    // =========================================================

    function set_digit_timer(
        total_seconds
    ) {

        total_seconds =
            Math.max(
                0,
                parseInt(
                    total_seconds || 0,
                    10
                )
            );


        const hours =
            Math.floor(
                total_seconds /
                3600
            );


        const minutes =
            Math.floor(
                (
                    total_seconds %
                    3600
                ) / 60
            );


        const seconds =
            total_seconds %
            60;


        $("#timer_hh").text(
            String(hours)
                .padStart(2, "0")
        );


        $("#timer_mm").text(
            String(minutes)
                .padStart(2, "0")
        );


        $("#timer_ss").text(
            String(seconds)
                .padStart(2, "0")
        );

    }


    function _format_hms(
        total_seconds
    ) {

        total_seconds =
            Math.max(
                0,
                parseInt(
                    total_seconds || 0,
                    10
                )
            );


        const hours =
            Math.floor(
                total_seconds /
                3600
            );


        const minutes =
            Math.floor(
                (
                    total_seconds %
                    3600
                ) / 60
            );


        const seconds =
            total_seconds %
            60;


        return (

            String(hours)
                .padStart(2, "0")

            + ":" +

            String(minutes)
                .padStart(2, "0")

            + ":" +

            String(seconds)
                .padStart(2, "0")

        );

    }


    // =========================================================
    // GET GPS LOCATION
    //
    // IMPORTANT:
    // accuracy is captured from browser GPS.
    //
    // accuracy is in METERS.
    // =========================================================

    function getCurrentLocation(
        callback
    ) {

        if (
            !navigator.geolocation
        ) {

            frappe.msgprint(
                "Geolocation is not supported by this browser."
            );

            $("#attendance_btn")
                .prop(
                    "disabled",
                    false
                );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            function (position) {

                const latitude =
                    Number(
                        position.coords.latitude
                    );


                const longitude =
                    Number(
                        position.coords.longitude
                    );


                const accuracy =
                    Number(
                        position.coords.accuracy
                    );


                if (
                    !Number.isFinite(
                        latitude
                    ) ||
                    !Number.isFinite(
                        longitude
                    )
                ) {

                    frappe.msgprint(
                        "Invalid GPS coordinates received."
                    );

                    $("#attendance_btn")
                        .prop(
                            "disabled",
                            false
                        );

                    return;

                }


                if (
                    !Number.isFinite(
                        accuracy
                    ) ||
                    accuracy < 0
                ) {

                    frappe.msgprint(
                        "GPS accuracy could not be determined. Please try again."
                    );

                    $("#attendance_btn")
                        .prop(
                            "disabled",
                            false
                        );

                    return;

                }


                callback({

                    latitude:
                        latitude,

                    longitude:
                        longitude,

                    accuracy:
                        accuracy

                });

            },


            function (error) {

                let message =
                    "Unable to fetch current location.";


                if (
                    error.code ===
                    error.PERMISSION_DENIED
                ) {

                    message =
                        "Location permission denied.";

                }

                else if (
                    error.code ===
                    error.POSITION_UNAVAILABLE
                ) {

                    message =
                        "Location information unavailable.";

                }

                else if (
                    error.code ===
                    error.TIMEOUT
                ) {

                    message =
                        "Location request timed out.";

                }


                frappe.msgprint(
                    message
                );


                $("#attendance_btn")
                    .prop(
                        "disabled",
                        false
                    );

            },


            {

                /*
                 * Force the browser to request
                 * the highest available GPS accuracy.
                 */

                enableHighAccuracy:
                    true,

                /*
                 * Do not wait indefinitely.
                 */

                timeout:
                    15000,

                /*
                 * Do not use cached GPS data.
                 */

                maximumAge:
                    0

            }

        );

    }


    // =========================================================
    // ATTENDANCE BUTTON
    //
    // IMPORTANT:
    //
    // employee IS REQUIRED by your existing API.
    //
    // Therefore we SEND:
    //
    // employee
    // latitude
    // longitude
    // accuracy
    // log_type
    //
    // BUT:
    //
    // Backend MUST NOT TRUST employee.
    //
    // Backend must compare it against the employee obtained
    // from frappe.session.user.
    // =========================================================

    $(document)
        .off(
            "click.employeeAttendance",
            "#attendance_btn"
        );


    $(document)
        .on(
            "click.employeeAttendance",
            "#attendance_btn",
            function () {

                if (!employee) {

                    frappe.msgprint(
                        "Employee information is not available."
                    );

                    return;

                }


                const button =
                    $(this);


                const buttonText =
                    button
                        .text()
                        .trim();


                const log_type =
                    buttonText ===
                    "Check In"

                        ? "IN"

                        : "OUT";


                button.prop(
                    "disabled",
                    true
                );


                /*
                 * Get fresh GPS coordinates for every
                 * attendance action.
                 */

                getCurrentLocation(

                    function (location) {

                        frappe.call({

                            method:
                                "teceze.api.employee_attendance.employee_checkin",

                            freeze:
                                true,

                            freeze_message:
                                "Processing Attendance...",


                            args: {

                                /*
                                 * Employee remains here because
                                 * your existing backend requires it.
                                 *
                                 * The backend MUST validate it
                                 * against frappe.session.user.
                                 */

                                employee:
                                    employee,

                                latitude:
                                    location.latitude,

                                longitude:
                                    location.longitude,

                                accuracy:
                                    location.accuracy,

                                log_type:
                                    log_type

                            },


                            callback:
                                function (r) {

                                    button.prop(
                                        "disabled",
                                        false
                                    );


                                    if (
                                        r.message &&
                                        r.message.success
                                    ) {

                                        frappe.show_alert({

                                            message:
                                                r.message.message,

                                            indicator:
                                                "green"

                                        });

                                    }

                                    else {

                                        frappe.msgprint(

                                            r.message
                                                ? r.message.message
                                                : "Attendance operation failed."

                                        );

                                    }


                                    /*
                                     * Always refresh from backend.
                                     */

                                    load_status();

                                    load_recent_attendance();

                                    load_reporting_manager();

                                    load_associate_members();

                                    refresh_attendance_calendar();

                                },


                            error:
                                function () {

                                    button.prop(
                                        "disabled",
                                        false
                                    );


                                    frappe.msgprint(
                                        "Unable to process attendance."
                                    );


                                    load_status();

                                    load_recent_attendance();

                                    refresh_attendance_calendar();

                                }

                        });

                    }

                );

            }

        );


    // =========================================================
    // RECENT ATTENDANCE
    // =========================================================

    function load_recent_attendance() {

        if (!employee) {
            return;
        }


        frappe.call({

            method:
                "teceze.api.employee_attendance.get_recent_attendance",

            args: {

                employee:
                    employee

            },


            callback: function (r) {

                const tbody =
                    $("#attendance_history");


                tbody.empty();


                if (
                    !r.message ||
                    r.message.length === 0
                ) {

                    tbody.append(`

                        <tr>

                            <td
                                colspan="4"
                                class="text-center text-muted">

                                No attendance records found

                            </td>

                        </tr>

                    `);

                    return;

                }


                r.message.forEach(
                    function (row) {

                        tbody.append(`

                            <tr>

                                <td>

                                    ${frappe.utils.escape_html(
                                        String(
                                            row.date || ""
                                        )
                                    )}

                                </td>


                                <td>

                                    ${frappe.utils.escape_html(
                                        String(
                                            row.check_in || ""
                                        )
                                    )}

                                </td>


                                <td>

                                    ${frappe.utils.escape_html(
                                        String(
                                            row.check_out || ""
                                        )
                                    )}

                                </td>


                                <td>

                                    ${frappe.utils.escape_html(
                                        String(
                                            row.working_hours || ""
                                        )
                                    )}

                                </td>

                            </tr>

                        `);

                    }
                );

            },


            error: function () {

                $("#attendance_history")
                    .html(`

                        <tr>

                            <td
                                colspan="4"
                                class="text-center text-muted">

                                Unable to load attendance history

                            </td>

                        </tr>

                    `);

            }

        });

    }


    // =========================================================
    // REPORTING MANAGER
    // =========================================================

    function load_reporting_manager() {

        if (!employee) {
            return;
        }


        frappe.call({

            method:
                "teceze.api.employee_attendance.get_reporting_manager_status",

            args: {

                employee:
                    employee

            },


            callback: function (r) {

                const card =
                    $(".manager-card");


                if (!r.message) {

                    card.hide();

                    return;

                }


                card.show();


                const manager =
                    r.message;


                $("#manager_avatar")
                    .text(

                        (
                            manager.employee_name ||
                            "?"
                        )
                            .charAt(0)
                            .toUpperCase()

                    );


                $("#manager_name")
                    .text(

                        `${manager.name} - ${manager.employee_name}`

                    );


                const status_class =
                    manager.status ===
                    "IN"

                        ? "status-in-text"

                        : "status-out-text";


                $("#manager_status")
                    .text(
                        manager.status_label
                    )
                    .removeClass(
                        "status-in-text status-out-text"
                    )
                    .addClass(
                        status_class
                    );

            },


            error: function () {

                $(".manager-card")
                    .hide();

            }

        });

    }


    // =========================================================
    // ASSOCIATE MEMBERS
    // =========================================================

    function load_associate_members() {

        if (!employee) {
            return;
        }


        frappe.call({

            method:
                "teceze.api.employee_attendance.get_associate_members",

            args: {

                employee:
                    employee

            },


            callback: function (r) {

                const list =
                    $("#associate_members_list");


                list.empty();


                if (
                    !r.message ||
                    r.message.length === 0
                ) {

                    list.append(`

                        <div
                            class="text-muted text-center"
                            style="padding:16px;">

                            No associate members found

                        </div>

                    `);

                    return;

                }


                const visible_members =
                    r.message.slice(
                        0,
                        MAX_VISIBLE_ASSOCIATES
                    );


                visible_members.forEach(
                    function (member) {

                        const initial =
                            (
                                member.employee_name ||
                                "?"
                            )
                                .charAt(0)
                                .toUpperCase();


                        const status_class =
                            member.status ===
                            "IN"

                                ? "status-in-text"

                                : "status-out-text";


                        const row =
                            $(`

                                <div
                                    class="member-row">

                                    <div
                                        class="avatar avatar-small">

                                        ${frappe.utils.escape_html(
                                            initial
                                        )}

                                    </div>


                                    <div
                                        class="member-info">

                                        <strong>

                                            ${frappe.utils.escape_html(
                                                member.name
                                            )}

                                            -

                                            ${frappe.utils.escape_html(
                                                member.employee_name
                                            )}

                                        </strong>


                                        <span
                                            class="member-status ${status_class}">

                                            ${frappe.utils.escape_html(
                                                member.status_label
                                            )}

                                        </span>

                                    </div>

                                </div>

                            `);


                        row.on(
                            "click",
                            function () {

                                frappe.route_options = {

                                    employee:
                                        member.name

                                };


                                frappe.set_route(

                                    "query-report",

                                    "Employee Leave and Permission"

                                );

                            }
                        );


                        list.append(
                            row
                        );

                    }
                );

            },


            error: function () {

                $("#associate_members_list")
                    .html(`

                        <div
                            class="text-muted text-center"
                            style="padding:16px;">

                            Unable to load associate members

                        </div>

                    `);

            }

        });

    }


    // =========================================================
    // VIEW ALL ASSOCIATES
    // =========================================================

    $(document)
        .off(
            "click.employeeAttendance",
            "#view_all_members"
        );


    $(document)
        .on(
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
    // VIEW ALL ATTENDANCE
    // =========================================================

    $(document)
        .off(
            "click.employeeAttendance",
            "#view_all_attendance"
        );


    $(document)
        .on(
            "click.employeeAttendance",
            "#view_all_attendance",
            function (e) {

                e.preventDefault();


                if (!employee) {
                    return;
                }


                frappe.set_route(

                    "List",

                    "Employee Checkin",

                    {
                        employee:
                            employee
                    }

                );

            }
        );


    // =========================================================
    // CREATE CALENDAR
    // =========================================================

    function create_attendance_calendar() {

        const container =
            document.getElementById(
                "attendance-calendar"
            );


        if (!container) {
            return;
        }


        if (!employee) {
            return;
        }


        /*
         * Destroy references to previous calendar.
         */

        attendance_calendar =
            null;


        /*
         * Employee is required for the calendar filter.
         */

        attendance_calendar_filters = [

            [
                "Attendance",
                "employee",
                "=",
                employee
            ]

        ];


        container.innerHTML = "";


        /*
         * Load Frappe calendar bundle.
         */

        frappe.require(

            "calendar.bundle.js",

            function () {

                load_attendance_calendar_config();

            }

        );

    }


    // =========================================================
    // CALENDAR CONFIG
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

                    show_calendar_error(
                        "Employee Attendance Calendar configuration was not found."
                    );

                    return;

                }


                const field_map = {

                    id:
                        "name",

                    start:
                        calendar_doc.start_date_field,

                    end:
                        calendar_doc.end_date_field,

                    title:
                        calendar_doc.subject_field,

                    allDay:
                        calendar_doc.all_day
                            ? 1
                            : 0

                };


                if (!field_map.start) {

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

                    doctype:
                        "Attendance",

                    parent:
                        $("#attendance-calendar"),

                    page:
                        page,

                    list_view:
                        list_view,

                    field_map:
                        field_map,

                    get_events_method:
                        "frappe.desk.calendar.get_events"

                };


                try {

                    attendance_calendar =
                        new frappe.views.Calendar(
                            calendar_options
                        );


                    window.employee_attendance_calendar =
                        attendance_calendar;


                    /*
                     * Use MutationObserver instead of setTimeout.
                     */

                    watch_calendar_event_colors();


                    /*
                     * Use ResizeObserver instead of
                     * arbitrary timeout-based resizing.
                     */

                    watch_calendar_height();


                    resize_attendance_calendar();

                    sync_left_column_height();

                    colorize_calendar_events();


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
    // CALENDAR ERROR
    // =========================================================

    function show_calendar_error(
        message
    ) {

        const container =
            document.getElementById(
                "attendance-calendar"
            );


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

                ${frappe.utils.escape_html(
                    message
                )}

            </div>

        `;

    }


    // =========================================================
    // CALENDAR HEIGHT
    // =========================================================

    function resize_attendance_calendar() {

        const calendar_card =
            document.querySelector(
                ".attendance-calendar-card"
            );


        if (!calendar_card) {
            return;
        }


        /*
         * Do not force a hard-coded calendar height.
         */

        sync_left_column_height();

    }


    // =========================================================
    // SYNC LEFT COLUMN
    // =========================================================

    function sync_left_column_height() {

        const left =
            document.querySelector(
                ".attendance-left"
            );


        const calendar_card =
            document.querySelector(
                ".attendance-calendar-card"
            );


        if (
            !left ||
            !calendar_card
        ) {

            return;

        }


        /*
         * Stack vertically on smaller screens.
         */

        if (
            window.innerWidth <=
            LEFT_RIGHT_STACK_BREAKPOINT
        ) {

            left.style.height =
                "auto";

            return;

        }


        const height =
            calendar_card.getBoundingClientRect()
                .height;


        if (
            height > 0
        ) {

            left.style.height =
                `${height}px`;

        }

    }


    // =========================================================
    // WATCH CALENDAR HEIGHT
    // =========================================================

    function watch_calendar_height() {

        const calendar_card =
            document.querySelector(
                ".attendance-calendar-card"
            );


        if (!calendar_card) {
            return;
        }


        if (
            calendar_height_observer
        ) {

            calendar_height_observer.disconnect();

        }


        if (
            typeof ResizeObserver ===
            "undefined"
        ) {

            sync_left_column_height();

            return;

        }


        calendar_height_observer =
            new ResizeObserver(

                function () {

                    resize_attendance_calendar();

                    sync_left_column_height();

                }

            );


        calendar_height_observer.observe(
            calendar_card
        );

    }


    // =========================================================
    // WATCH CALENDAR EVENTS
    // =========================================================

    function watch_calendar_event_colors() {

        const container =
            document.getElementById(
                "attendance-calendar"
            );


        if (!container) {
            return;
        }


        if (
            calendar_events_observer
        ) {

            calendar_events_observer.disconnect();

        }


        if (
            typeof MutationObserver ===
            "undefined"
        ) {

            colorize_calendar_events();

            return;

        }


        calendar_events_observer =
            new MutationObserver(

                function () {

                    colorize_calendar_events();

                }

            );


        calendar_events_observer.observe(

            container,

            {
                childList:
                    true,

                subtree:
                    true

            }

        );


        colorize_calendar_events();

    }


    // =========================================================
    // COLORIZE CALENDAR EVENTS
    // =========================================================

    function colorize_calendar_events() {

        const container =
            document.getElementById(
                "attendance-calendar"
            );


        if (!container) {
            return;
        }


        const event_elements =
            container.querySelectorAll(

                ".fc-event, " +
                ".fc-daygrid-event, " +
                ".fc-list-event"

            );


        event_elements.forEach(

            function (event_element) {

                CALENDAR_STATUS_CLASSNAMES.forEach(

                    function (class_name) {

                        event_element.classList.remove(
                            class_name
                        );

                    }

                );


                const text = (

                    event_element.innerText ||
                    event_element.textContent ||
                    ""

                )
                    .trim()
                    .toLowerCase();


                if (!text) {
                    return;
                }


                for (
                    let i = 0;
                    i <
                    CALENDAR_STATUS_CLASS_MAP.length;
                    i++
                ) {

                    const entry =
                        CALENDAR_STATUS_CLASS_MAP[i];


                    if (
                        text.includes(
                            entry.match
                        )
                    ) {

                        event_element.classList.add(
                            entry.className
                        );

                        break;

                    }

                }

            }

        );

    }


    // =========================================================
    // REFRESH CALENDAR
    // =========================================================

    function refresh_attendance_calendar() {

        if (
            attendance_calendar &&
            typeof attendance_calendar.refresh ===
            "function"
        ) {

            try {

                attendance_calendar.refresh();

            }

            catch (error) {

                console.warn(
                    "Calendar refresh failed:",
                    error
                );

                create_attendance_calendar();

            }

        }

        else if (
            employee
        ) {

            create_attendance_calendar();

        }

    }


    // =========================================================
    // WINDOW RESIZE
    // =========================================================

    $(window)
        .off(
            "resize.employeeAttendance"
        );


    $(window)
        .on(
            "resize.employeeAttendance",
            function () {

                resize_attendance_calendar();

                sync_left_column_height();

            }
        );


    // =========================================================
    // CLEANUP
    // =========================================================

    $(wrapper).on(
        "page-unload",
        function () {

            stopWorkingTimer();


            if (
                calendar_height_observer
            ) {

                calendar_height_observer.disconnect();

                calendar_height_observer =
                    null;

            }


            if (
                calendar_events_observer
            ) {

                calendar_events_observer.disconnect();

                calendar_events_observer =
                    null;

            }


            attendance_calendar =
                null;


            $(window)
                .off(
                    "resize.employeeAttendance"
                );


            $(document)
                .off(
                    ".employeeAttendance"
                );

        }
    );

};