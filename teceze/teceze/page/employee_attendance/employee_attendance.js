frappe.pages["employee_attendance"].on_page_load = function (wrapper) {

    let employee = null;
    let timerInterval = null;

    // =========================================================
    // FRAPPE CALENDAR VARIABLES
    // =========================================================

    let attendance_calendar = null;
    let attendance_calendar_filters = [];


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

                        <h2>Employee Attendance</h2>

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
                <!-- LEFT COLUMN -->
                <!-- ================================================= -->

                <div class="attendance-left">


                    <!-- ================================================= -->
                    <!-- ATTENDANCE CARD -->
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


                        <!-- Backward compatibility -->

                        <span
                            id="live-timer"
                            style="display:none;">

                            00:00:00

                        </span>


                        <span
                            id="working_hours"
                            style="display:none;">

                        </span>


                        <!-- BUTTON -->

                        <div class="button-area">

                            <button
                                class="btn attendance-button"
                                id="attendance_btn">

                                Loading...

                            </button>

                        </div>


                        <div class="divider"></div>


                        <!-- CHECK IN / CHECK OUT -->

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

                </div>


                <!-- ================================================= -->
                <!-- RIGHT COLUMN -->
                <!-- ================================================= -->

                <div class="attendance-right">


                    <div class="card attendance-calendar-card">


                        <div class="attendance-calendar-header">

                            <h4>
                                Attendance Calendar
                            </h4>

                        </div>


                        <!-- ================================================= -->
                        <!-- FRAPPE CALENDAR CONTAINER -->
                        <!-- ================================================= -->

                        <div
                            id="attendance-calendar"
                            class="attendance-calendar-container">
                        </div>


                        <!-- LEGEND -->

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
                                    class="legend-dot legend-holiday">
                                </span>

                                Holiday

                            </span>

                        </div>


                    </div>

                </div>


            </div>


            <!-- ================================================= -->
            <!-- ATTENDANCE HISTORY -->
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
        today.toLocaleDateString(
            undefined,
            {
                weekday: "long"
            }
        )
    );


    // =========================================================
    // LOAD LOGGED EMPLOYEE
    // =========================================================

    load_employee();


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


                employee = r.message.name;


                // -------------------------------------------------
                // EMPLOYEE NAME
                // -------------------------------------------------

                $("#Employee_name").text(
                    r.message.employee_name
                );


                // -------------------------------------------------
                // EMPLOYEE ROLE
                // -------------------------------------------------

                $("#Employee_role").text(

                    r.message.designation ||
                    r.message.employee_location ||
                    "-"

                );


                // -------------------------------------------------
                // AVATAR
                // -------------------------------------------------

                $("#avatar_initial").text(

                    r.message.employee_name
                        .charAt(0)
                        .toUpperCase()

                );


                // -------------------------------------------------
                // LOAD STATUS
                // -------------------------------------------------

                load_status();


                // -------------------------------------------------
                // LOAD RECENT ATTENDANCE
                // -------------------------------------------------

                load_recent_attendance();


                // -------------------------------------------------
                // LOAD FRAPPE CALENDAR
                // -------------------------------------------------

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
    // CREATE FRAPPE ATTENDANCE CALENDAR
    // =========================================================

    function create_attendance_calendar() {

        const container =
            document.getElementById(
                "attendance-calendar"
            );


        if (!container) {

            console.error(
                "Attendance calendar container not found."
            );

            return;

        }


        if (!employee) {

            console.error(
                "Employee not loaded yet."
            );

            return;

        }


        // -------------------------------------------------
        // DESTROY PREVIOUS CALENDAR IF ANY
        // -------------------------------------------------

        attendance_calendar = null;


        // -------------------------------------------------
        // EMPLOYEE FILTER
        // -------------------------------------------------

        attendance_calendar_filters = [

            [
                "Attendance",
                "employee",
                "=",
                employee
            ]

        ];


        console.log(
            "Attendance calendar filters:",
            attendance_calendar_filters
        );


        // -------------------------------------------------
        // CLEAR CONTAINER
        // -------------------------------------------------

        container.innerHTML = "";


        // -------------------------------------------------
        // LOAD FRAPPE CALENDAR LIBRARY
        // -------------------------------------------------

        frappe.require(
            "calendar.bundle.js",
            function () {

                console.log(
                    "calendar.bundle.js loaded."
                );


                load_attendance_calendar_config();

            }
        );

    }


    // =========================================================
    // LOAD EMPLOYEE ATTENDANCE CALENDAR CONFIGURATION
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


                // -------------------------------------------------
                // CHECK CONFIGURATION
                // -------------------------------------------------

                if (!calendar_doc) {

                    console.error(
                        "Employee Attendance Calendar not found."
                    );


                    show_calendar_error(
                        "Employee Attendance Calendar configuration was not found."
                    );


                    return;

                }


                console.log(
                    "Employee Attendance Calendar configuration:",
                    calendar_doc
                );


                // -------------------------------------------------
                // FIELD MAP
                // -------------------------------------------------

                const field_map = {

                    id: "name",

                    start:
                        calendar_doc.start_date_field,

                    end:
                        calendar_doc.end_date_field,

                    title:
                        calendar_doc.subject_field,

                    allDay:
                        calendar_doc.all_day ? 1 : 0

                };


                console.log(
                    "Calendar field map:",
                    field_map
                );


                // -------------------------------------------------
                // START DATE CHECK
                // -------------------------------------------------

                if (!field_map.start) {

                    console.error(
                        "Calendar start date field is missing."
                    );


                    show_calendar_error(
                        "Calendar start date field is not configured."
                    );


                    return;

                }


                // -------------------------------------------------
                // LIST VIEW
                // -------------------------------------------------

                const list_view = {

                    filter_area: {

                        get: function () {

                            return attendance_calendar_filters;

                        }

                    }

                };


                // -------------------------------------------------
                // CALENDAR OPTIONS
                // -------------------------------------------------

                const calendar_options = {

                    doctype: "Attendance",

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


                console.log(
                    "Initializing Frappe Calendar..."
                );


                // -------------------------------------------------
                // CREATE FRAPPE CALENDAR
                // -------------------------------------------------

                try {

                    attendance_calendar =
                        new frappe.views.Calendar(
                            calendar_options
                        );


                    window.employee_attendance_calendar =
                        attendance_calendar;


                    console.log(
                        "Frappe Attendance Calendar initialized successfully.",
                        attendance_calendar
                    );


                    // -------------------------------------------------
                    // IMPORTANT
                    // REMOVE LOADING PLACEHOLDER
                    // -------------------------------------------------

                    $("#attendance-calendar")
                        .find(".calendar-loading")
                        .remove();


                    // -------------------------------------------------
                    // RESIZE AFTER RENDER
                    // -------------------------------------------------

                    setTimeout(
                        function () {

                            resize_attendance_calendar();


                            // Remove any leftover loading message
                            $("#attendance-calendar")
                                .find(".calendar-loading")
                                .remove();

                        },
                        500
                    );


                    // -------------------------------------------------
                    // ANOTHER RESIZE AFTER FULL RENDER
                    // -------------------------------------------------

                    setTimeout(
                        function () {

                            resize_attendance_calendar();

                        },
                        1200
                    );

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

    function show_calendar_error(message) {

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

            // Older Frappe calendar versions
            if (
                attendance_calendar.fullCalendar &&
                typeof attendance_calendar.fullCalendar.updateSize ===
                    "function"
            ) {

                attendance_calendar
                    .fullCalendar
                    .updateSize();

            }


            // Some Frappe versions expose refresh
            if (
                typeof attendance_calendar.resize ===
                    "function"
            ) {

                attendance_calendar.resize();

            }

        }

        catch (error) {

            console.warn(
                "Calendar resize failed:",
                error
            );

        }

    }


    // =========================================================
    // REFRESH CALENDAR
    // =========================================================

    function refresh_attendance_calendar() {

        if (!attendance_calendar) {

            if (employee) {

                create_attendance_calendar();

            }

            return;

        }


        try {

            // Frappe Calendar refresh
            if (
                typeof attendance_calendar.refresh ===
                    "function"
            ) {

                attendance_calendar.refresh();

                console.log(
                    "Attendance calendar refreshed."
                );

                return;

            }


            // FullCalendar fallback
            if (
                attendance_calendar.fullCalendar
            ) {

                attendance_calendar
                    .fullCalendar
                    .refetchEvents();

                console.log(
                    "Attendance calendar events refreshed."
                );

            }

        }

        catch (error) {

            console.error(
                "Calendar refresh failed:",
                error
            );


            // Recreate if refresh fails
            create_attendance_calendar();

        }

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


        const checkIn =
            new Date(checkinTime);


        const base =
            parseInt(
                previousSeconds || 0
            );


        const capInstant =
            sessionExpiresAt

                ? new Date(sessionExpiresAt)

                : new Date(
                    checkIn.getTime() +
                    (86400 - base) * 1000
                );


        render_timer(
            base,
            checkIn
        );


        timerInterval =
            setInterval(
                function () {

                    const now =
                        new Date();


                    if (
                        now.getTime() >=
                        capInstant.getTime()
                    ) {

                        stopWorkingTimer();

                        load_status();

                        return;

                    }


                    render_timer(
                        base,
                        checkIn
                    );

                },
                1000
            );

    }


    // =========================================================
    // UPDATE TIMER DISPLAY
    // =========================================================

    function render_timer(
        base,
        checkIn
    ) {

        let liveElapsed =
            Math.floor(

                (
                    new Date().getTime() -
                    checkIn.getTime()
                ) / 1000

            );


        if (liveElapsed < 0) {

            liveElapsed = 0;

        }


        let totalSeconds =
            base + liveElapsed;


        if (totalSeconds > 86400) {

            totalSeconds = 86400;

        }


        set_digit_timer(
            totalSeconds
        );


        const timer =
            _format_hms(
                totalSeconds
            );


        $("#live-timer").text(
            timer
        );


        $("#working_hours").text(
            timer
        );

    }


    // =========================================================
    // SET DIGIT TIMER
    // =========================================================

    function set_digit_timer(
        totalSeconds
    ) {

        totalSeconds =
            parseInt(
                totalSeconds || 0
            );


        const hrs =
            Math.floor(
                totalSeconds / 3600
            );


        const mins =
            Math.floor(
                (totalSeconds % 3600) / 60
            );


        const secs =
            totalSeconds % 60;


        $("#timer_hh").text(

            String(hrs)
                .padStart(2, "0")

        );


        $("#timer_mm").text(

            String(mins)
                .padStart(2, "0")

        );


        $("#timer_ss").text(

            String(secs)
                .padStart(2, "0")

        );

    }


    // =========================================================
    // FORMAT HH:MM:SS
    // =========================================================

    function _format_hms(
        totalSeconds
    ) {

        totalSeconds =
            parseInt(
                totalSeconds || 0
            );


        const hrs =
            Math.floor(
                totalSeconds / 3600
            );


        const mins =
            Math.floor(
                (totalSeconds % 3600) / 60
            );


        const secs =
            totalSeconds % 60;


        return (

            String(hrs)
                .padStart(2, "0")

            + ":"

            +

            String(mins)
                .padStart(2, "0")

            + ":"

            +

            String(secs)
                .padStart(2, "0")

        );

    }


    // =========================================================
    // STOP TIMER
    // =========================================================

    function stopWorkingTimer() {

        if (timerInterval) {

            clearInterval(
                timerInterval
            );

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


                let badge = "";


                // -------------------------------------------------
                // CHECKED IN
                // -------------------------------------------------

                if (
                    data.status ===
                    "CHECKED IN"
                ) {

                    badge = `

                        <span
                            class="status-badge status-in">

                            <span
                                class="status-dot">
                            </span>

                            Checked In

                        </span>

                    `;

                }


                // -------------------------------------------------
                // CHECKED OUT
                // -------------------------------------------------

                else if (
                    data.status ===
                    "CHECKED OUT"
                ) {

                    badge = `

                        <span
                            class="status-badge status-out">

                            <span
                                class="status-dot">
                            </span>

                            Checked Out

                        </span>

                    `;

                }


                // -------------------------------------------------
                // MISSED CHECK OUT
                // -------------------------------------------------

                else if (
                    data.status ===
                    "MISSED CHECK OUT"
                ) {

                    badge = `

                        <span
                            class="status-badge status-warning">

                            <span
                                class="status-dot">
                            </span>

                            Missed Check Out

                        </span>

                    `;

                }


                // -------------------------------------------------
                // NOT CHECKED IN
                // -------------------------------------------------

                else {

                    badge = `

                        <span
                            class="status-badge status-none">

                            <span
                                class="status-dot">
                            </span>

                            Not Checked In

                        </span>

                    `;

                }


                $("#status").html(
                    badge
                );


                // -------------------------------------------------
                // SMALL STATUS TEXT
                // -------------------------------------------------

                const STATUS_TEXT = {

                    "CHECKED IN": {

                        text: "In",

                        color: "#1f9d55"

                    },

                    "CHECKED OUT": {

                        text: "Out",

                        color: "#0c447c"

                    },

                    "MISSED CHECK OUT": {

                        text:
                            "Missed Check Out",

                        color: "#b7791f"

                    },

                    "NOT CHECKED IN": {

                        text:
                            "Not Checked In",

                        color: "#c0392b"

                    }

                };


                const status_text =
                    STATUS_TEXT[data.status] ||
                    STATUS_TEXT[
                        "NOT CHECKED IN"
                    ];


                $("#status_text")
                    .text(
                        status_text.text
                    )
                    .css(
                        "color",
                        status_text.color
                    );


                // -------------------------------------------------
                // TIMES
                // -------------------------------------------------

                $("#checkin_time").text(

                    data.checkin_time ||
                    "--"

                );


                $("#checkout_time").text(

                    data.checkout_time ||
                    "--"

                );


                // -------------------------------------------------
                // TIMER
                // -------------------------------------------------

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


                    // -------------------------------------------------
                    // CHECKED OUT
                    // -------------------------------------------------

                    if (
                        data.status ===
                        "CHECKED OUT"
                    ) {

                        const seconds =
                            parseInt(
                                data.previous_seconds ||
                                0
                            );


                        set_digit_timer(
                            seconds
                        );


                        $("#live-timer").text(

                            _format_hms(
                                seconds
                            )

                        );


                        $("#working_hours").text(

                            data.working_hours ||
                            "00:00:00"

                        );

                    }


                    // -------------------------------------------------
                    // MISSED CHECK OUT
                    // -------------------------------------------------

                    else if (
                        data.status ===
                        "MISSED CHECK OUT"
                    ) {

                        set_digit_timer(
                            86400
                        );


                        $("#live-timer").text(
                            "24:00:00"
                        );


                        $("#working_hours").text(
                            "24:00:00"
                        );

                    }


                    // -------------------------------------------------
                    // NOT CHECKED IN
                    // -------------------------------------------------

                    else {

                        set_digit_timer(
                            0
                        );


                        $("#live-timer").text(
                            "00:00:00"
                        );


                        $("#working_hours").text(
                            "00:00:00"
                        );

                    }

                }


                // -------------------------------------------------
                // BUTTON
                // -------------------------------------------------

                const buttonText =
                    data.button ||
                    "Check In";


                $("#attendance_btn")
                    .text(buttonText);


                $("#attendance_btn")
                    .removeClass(
                        "checkin checkout"
                    );


                if (
                    buttonText ===
                    "Check Out"
                ) {

                    $("#attendance_btn")
                        .addClass(
                            "checkout"
                        );

                }

                else {

                    $("#attendance_btn")
                        .addClass(
                            "checkin"
                        );

                }

            }

        });

    }


    // =========================================================
    // LOAD RECENT ATTENDANCE
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
                                class="text-center">

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

                                    ${
                                        frappe.utils.escape_html(
                                            String(
                                                row.date || ""
                                            )
                                        )
                                    }

                                </td>


                                <td>

                                    ${
                                        frappe.utils.escape_html(
                                            String(
                                                row.check_in || ""
                                            )
                                        )
                                    }

                                </td>


                                <td>

                                    ${
                                        frappe.utils.escape_html(
                                            String(
                                                row.check_out || ""
                                            )
                                        )
                                    }

                                </td>


                                <td>

                                    ${
                                        frappe.utils.escape_html(
                                            String(
                                                row.working_hours || ""
                                            )
                                        )
                                    }

                                </td>

                            </tr>

                        `);

                    }
                );

            }

        });

    }


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
    // GET CURRENT LOCATION
    // =========================================================

    function getCurrentLocation(
        callback
    ) {

        if (!navigator.geolocation) {

            frappe.msgprint(
                "Geolocation is not supported by this browser."
            );

            return;

        }


        navigator.geolocation.getCurrentPosition(

            function (position) {

                callback({

                    latitude:
                        position.coords.latitude,

                    longitude:
                        position.coords.longitude

                });

            },


            function (error) {

                let message =
                    "Unable to fetch current location.";


                switch (error.code) {

                    case error.PERMISSION_DENIED:

                        message =
                            "Location permission denied.";

                        break;


                    case error.POSITION_UNAVAILABLE:

                        message =
                            "Location information unavailable.";

                        break;


                    case error.TIMEOUT:

                        message =
                            "Location request timed out.";

                        break;

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

                enableHighAccuracy: true,

                timeout: 15000,

                maximumAge: 0

            }

        );

    }


    // =========================================================
    // ATTENDANCE BUTTON
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
                        "Employee not found."
                    );

                    return;

                }


                const btn =
                    $(this);


                btn.prop(
                    "disabled",
                    true
                );


                const log_type =

                    btn.text().trim() ===
                    "Check In"

                        ? "IN"

                        : "OUT";


                getCurrentLocation(
                    function (location) {

                        frappe.call({

                            method:
                                "teceze.api.employee_attendance.employee_checkin",

                            freeze: true,

                            freeze_message:
                                "Processing Attendance...",

                            args: {

                                employee:
                                    employee,

                                latitude:
                                    location.latitude,

                                longitude:
                                    location.longitude,

                                log_type:
                                    log_type

                            },

                            callback:
                                function (r) {

                                    btn.prop(
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
                                                : "Attendance failed."

                                        );

                                    }


                                    // Refresh status
                                    load_status();


                                    // Refresh history
                                    load_recent_attendance();


                                    // Refresh calendar
                                    setTimeout(
                                        function () {

                                            refresh_attendance_calendar();

                                        },
                                        500
                                    );

                                },


                            error:
                                function () {

                                    btn.prop(
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
    // RESIZE CALENDAR ON WINDOW RESIZE
    // =========================================================

    $(window)
        .off(
            "resize.employeeAttendanceCalendar"
        );


    $(window)
        .on(
            "resize.employeeAttendanceCalendar",
            function () {

                resize_attendance_calendar();

            }
        );


    // =========================================================
    // CLEANUP WHEN LEAVING PAGE
    // =========================================================

    $(wrapper).on(
        "page-unload",
        function () {

            stopWorkingTimer();

            attendance_calendar = null;

            $(window)
                .off(
                    "resize.employeeAttendanceCalendar"
                );

            $(document)
                .off(
                    ".employeeAttendance"
                );

        }
    );

};