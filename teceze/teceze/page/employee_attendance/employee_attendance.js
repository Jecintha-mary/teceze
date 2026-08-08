frappe.pages["employee_attendance"].on_page_load = function (wrapper) {

    let employee = null;
    let timerInterval = null;

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Employee Attendance",
        single_column: true
    });

    page.main.html(`
<div class="attendance-container">

    <!-- Header -->
    <div class="attendance-header">

        <div class="header-left">
            <h2>Employee Attendance</h2>

            <span id="status">
                <span class="status-badge status-none">
                    <span class="status-dot"></span>
                    Loading...
                </span>
            </span>

        </div>

        <div id="current-date" class="text-muted"></div>

    </div>

    <!-- Attendance Card -->

    <div class="card attendance-card">

        <div class="profile-section">

            <div class="profile-left">

                <div class="avatar" id="avatar_initial">
                    A
                </div>

                <div>

                    <h3 id="Employee_name">Loading...</h3>

                    <p id="Employee_location">Loading...</p>

                </div>

            </div>

            <div class="clock-box">

                <small>Working Timing</small>

                <h3 id="live-timer">00:00:00</h3>

            </div>

        </div>

        <div class="divider"></div>

        <div class="attendance-details">

            <div class="attendance-row">
                <span>Check In</span>
                <strong id="checkin_time">--</strong>
            </div>

            <div class="attendance-row">
                <span>Check Out</span>
                <strong id="checkout_time">--</strong>
            </div>

            <div class="attendance-row">
                <span>Working Hours</span>
                <strong id="working_hours">00:00:00</strong>
            </div>

        </div>

        <div class="button-area">
            <button class="btn" id="attendance_btn">
                Loading...
            </button>
        </div>

    </div>

    <!-- Attendance History -->

    <div class="card history-card">

        <div class="history-header">
            <h4>Recent Attendance</h4>
        </div>

        <table class="table attendance-table">

            <thead>

                <tr>

                    <th>Date</th>

                    <th>Check In</th>

                    <th>Check Out</th>

                    <th>Hours</th>

                </tr>

            </thead>

            <tbody id="attendance_history">

                <tr>

                    <td colspan="4" class="text-center">
                        Loading...
                    </td>

                </tr>

            </tbody>

        </table>

    </div>

</div>
`);

    const today = new Date();

    $("#current-date").text(
        today.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric"
        })
    );

//---------------------------------------------------------
// Load Logged Employee
//---------------------------------------------------------

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

            $("#Employee_name").text(
                r.message.employee_name
            );

            $("#Employee_location").text(
                r.message.employee_location || "-"
            );

            $("#avatar_initial").text(
                r.message.employee_name.charAt(0).toUpperCase()
            );

            load_status();

            load_recent_attendance();

        }

    });

}

//---------------------------------------------------------
// Start Live Working Timer
//---------------------------------------------------------

function startWorkingTimer(checkinTime, previousSeconds, sessionExpiresAt) {

    stopWorkingTimer();

    const checkIn = new Date(checkinTime);
    const base = parseInt(previousSeconds || 0);

    // Prefer the server-provided real expiry instant. Fall back to a
    // derived one only if it's ever missing (shouldn't happen once
    // get_today_status always includes it for CHECKED IN).
    const capInstant = sessionExpiresAt
        ? new Date(sessionExpiresAt)
        : new Date(checkIn.getTime() + (86400 - base) * 1000);

    render_timer(base, checkIn);

    timerInterval = setInterval(function () {

        const now = new Date();

        if (now.getTime() >= capInstant.getTime()) {

            stopWorkingTimer();

            // Don't guess the capped state locally - ask the server,
            // which will now return MISSED CHECK OUT with the exact
            // payload (working_hours, button, etc.) it's authoritative for.
            load_status();

            return;

        }

        render_timer(base, checkIn);

    }, 1000);

}
 
// Update Timer Display

function render_timer(base, checkIn) {

    let liveElapsed = Math.floor(
        (new Date().getTime() - checkIn.getTime()) / 1000
    );

    if (liveElapsed < 0) {
        liveElapsed = 0;
    }

    let totalSeconds = base + liveElapsed;

    if (totalSeconds > 86400) {
        totalSeconds = 86400;
    }

    const timer = _format_hms(totalSeconds);

    $("#live-timer").text(timer);

}
// Convert Seconds to HH:MM:SS Format

function _format_hms(totalSeconds) {

    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    return (
        String(hrs).padStart(2, "0") + ":" +
        String(mins).padStart(2, "0") + ":" +
        String(secs).padStart(2, "0")
    );

}

//---------------------------------------------------------
// Stop Timer
//---------------------------------------------------------

function stopWorkingTimer() {

    if (timerInterval) {

        clearInterval(timerInterval);

        timerInterval = null;

    }

}

//---------------------------------------------------------
// Load Today's Status
//---------------------------------------------------------

function load_status() {

    frappe.call({

        method: "teceze.api.employee_login.get_today_status",

        args: {
            employee: employee
        },

        callback: function (r) {

            if (!r.message) {
                return;
            }

            const data = r.message;

            //-------------------------------------------------
            // Status Badge
            //-------------------------------------------------

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

            //-------------------------------------------------
            // Attendance Details
            //-------------------------------------------------

            $("#checkin_time").text(data.checkin_time || "--");

            $("#checkout_time").text(data.checkout_time || "--");

            //-------------------------------------------------
            // Working Hours / Timer
            //-------------------------------------------------

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

                    $("#live-timer").text(_format_hms(parseInt(data.previous_seconds || 0)));
                    $("#working_hours").text(data.working_hours || 0);

                }

                else if (data.status === "MISSED CHECK OUT") {

                    // Backend already returns working_hours as "24:00:00"
                    // equivalent (24.0) for this status - display the
                    // fixed cap directly rather than recomputing it.
                    $("#live-timer").text("24:00:00");
                    $("#working_hours").text("24:00:00");

                }

                else {

                    $("#live-timer").text("00:00:00");
                    $("#working_hours").text("00:00:00");

                }

            }

            // Single source of truth for button text, for every
            // status - no branch above needs to set it separately.
            $("#attendance_btn").text(data.button);

        }

    });

}

//---------------------------------------------------------
// Load Recent Attendance
//---------------------------------------------------------

function load_recent_attendance() {

    frappe.call({

        method: "teceze.api.employee_attendance.get_recent_attendance",

        args: {
            employee: employee
        },

        callback: function (r) {

            const tbody = $("#attendance_history");

            tbody.empty();

            if (!r.message || r.message.length === 0) {

                tbody.append(`
                    <tr>
                        <td colspan="4" class="text-center">
                            No attendance records found
                        </td>
                    </tr>
                `);

                return;

            }

            r.message.forEach(function (row) {

                tbody.append(`
                    <tr>
                        <td>${row.date}</td>
                        <td>${row.check_in}</td>
                        <td>${row.check_out}</td>
                        <td>${row.working_hours}</td>
                    </tr>
                `);

            });

        }

    });

}

//---------------------------------------------------------
// Get Current Location
//---------------------------------------------------------

function getCurrentLocation(callback) {

    if (!navigator.geolocation) {

        frappe.msgprint("Geolocation is not supported by this browser.");

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
                    message = "Location information unavailable.";
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

//---------------------------------------------------------
// Attendance Button
//---------------------------------------------------------

$(document).off("click", "#attendance_btn");

$(document).on("click", "#attendance_btn", function () {

    if (!employee) {

        frappe.msgprint("Employee not found.");

        return;

    }

    const btn = $(this);

    btn.prop("disabled", true);

    const log_type =
        btn.text().trim() === "Check In"
            ? "IN"
            : "OUT";
    
    getCurrentLocation(function (location) {
        
        frappe.call({

            method: "teceze.api.employee_attendance.employee_checkin",

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

                // Resync regardless of success/failure so the UI
                // never diverges from actual server state (e.g. if
                // the click raced against an auto_checkout the
                // backend just performed).
                load_status();
                load_recent_attendance();

            },

            error: function () {

                btn.prop("disabled", false);

                frappe.msgprint("Unable to process attendance.");

                load_status();
                load_recent_attendance();

            }

        });

    });

});
};