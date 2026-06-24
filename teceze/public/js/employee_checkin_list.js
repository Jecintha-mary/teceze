OFFICE_LAT = 13.0258
OFFICE_LNG = 80.2209
RADIUS = 100
// frappe.listview_settings['Employee Checkin'] = {

//     onload(listview) {

//         render_attendance_card(listview);

//     }

// };

// function render_attendance_card(listview){

//     frappe.call({
//         method: "teceze.teceze.overrides.employee_checkin.get_attendance_status",
//         callback: function(r){

//             let data = r.message;

//             let html = `
//                 <div class="card p-3 mb-3">
//                     <h4>Today's Attendance</h4>

//                     <p>
//                         Status :
//                         <b id="attendance_status">
//                             ${data.status}
//                         </b>
//                     </p>

//                     <p>
//                         Check In :
//                         <span id="checkin_time">
//                             ${data.checkin_time || "-"}
//                         </span>
//                     </p>

//                     <p>
//                         Working Hours :
//                         <span id="working_hours">
//                             00:00:00
//                         </span>
//                     </p>

//                     <button
//                         class="btn btn-primary"
//                         id="checkin_btn">
//                         Check In
//                     </button>

//                     <button
//                         class="btn btn-danger"
//                         id="checkout_btn">
//                         Check Out
//                     </button>

//                 </div>
//             `;

//             $(html).prependTo(
//                 listview.page.main
//             );

//              // START TIMER HERE
//         if (data.status === "IN") {
//             start_timer(data.checkin_time);
//         }

//             // bind_buttons();

//             if(data.status=="IN"){
//                 start_timer(
//                     data.checkin_time
//                 );
//             }

//         }
//     });

// }
// $(document).on("click", "#checkin_btn", function() {

//     frappe.call({
//         method: "teceze.teceze.overrides.employee_checkin.check_in",
//         callback: function(r) {
//             frappe.msgprint(r.message);
//             location.reload();
//         }
//     });

// });


// function start_timer(checkin_time){

//     let start =
//         new Date(checkin_time);

//     setInterval(function(){

//         let now = new Date();

//         let diff =
//             now - start;

//         let hours =
//             Math.floor(
//                 diff/3600000
//             );

//         let minutes =
//             Math.floor(
//                 (diff%3600000)/60000
//             );

//         let seconds =
//             Math.floor(
//                 (diff%60000)/1000
//             );

//         $("#working_hours").html(
//             String(hours).padStart(2,'0')
//             + ":"
//             + String(minutes).padStart(2,'0')
//             + ":"
//             + String(seconds).padStart(2,'0')
//         );

//     },1000);

// }

// function start_timer(checkin_time) {
//     console.log("call wh")
//     let start = new Date(checkin_time);

//     setInterval(function () {

//         let now = new Date();

//         let diff = Math.floor(
//             (now.getTime() - start.getTime()) / 1000
//         );

//         let hours = Math.floor(diff / 3600);
//         let minutes = Math.floor((diff % 3600) / 60);
//         let seconds = diff % 60;

//         let display =
//             String(hours).padStart(2, '0') + ":" +
//             String(minutes).padStart(2, '0') + ":" +
//             String(seconds).padStart(2, '0');

//         $("#working_hours").text(display);

//     }, 1000);
// }

frappe.listview_settings['Employee Checkin'] = {

    onload(listview) {
        render_attendance_card(listview);
    }

};

function render_attendance_card(listview) {

    frappe.call({
        method: "teceze.teceze.overrides.employee_checkin.get_attendance_status",

        callback: function(r) {

            let data = r.message;

            let button_html = "";

            if (data.status === "IN") {

                button_html = `
                    <button
                        class="btn btn-primary btn-lg"
                        id="checkout_btn">
                        Check Out
                    </button>
                `;

            } else {

                button_html = `
                    <button
                        class="btn btn-success btn-lg"
                        id="checkin_btn">
                        Check In
                    </button>
                `;
            }

            let html = `
                <div class="card p-4 mb-3">

                    <div class="row align-items-center">

                        <div class="col-md-8">

                            <h4>Today's Attendance</h4>

                            <p>
                                <strong>Status:</strong>
                                <span id="attendance_status">
                                    ${data.status}
                                </span>
                            </p>

                            <p>
                                <strong>Check In:</strong>
                                <span id="checkin_time">
                                    ${data.checkin_time || "-"}
                                </span>
                            </p>

                            <p>
                                <strong>Working Hours:</strong>
                                <span id="working_hours">
                                    00:00:00
                                </span>
                            </p>

                        </div>

                        <div class="col-md-4 text-end">

                            ${button_html}

                        </div>

                    </div>

                </div>
            `;

            $(html).prependTo(listview.page.main);

            // Start timer if checked in
            if (data.status === "IN") {
                start_timer(data.checkin_time);
            }

        }
    });

}


// CHECK IN

$(document).on("click", "#checkin_btn", function() {

    frappe.call({
        method: "teceze.teceze.overrides.employee_checkin.check_in",

        callback: function(r) {

            frappe.show_alert({
                message: r.message,
                indicator: "green"
            });

            location.reload();
        }
    });

});


// CHECK OUT

$(document).on("click", "#checkout_btn", function() {

    frappe.call({
        method: "teceze.teceze.overrides.employee_checkin.check_out",

        callback: function(r) {

            frappe.show_alert({
                message: r.message,
                indicator: "blue"
            });

            location.reload();
        }
    });

});


// LIVE TIMER

function start_timer(checkin_time) {

    let start = new Date(checkin_time);

    setInterval(function() {

        let now = new Date();

        let diff = Math.floor(
            (now.getTime() - start.getTime()) / 1000
        );

        let hours = Math.floor(diff / 3600);

        let minutes = Math.floor(
            (diff % 3600) / 60
        );

        let seconds = diff % 60;

        let display =
            String(hours).padStart(2, '0') + ":" +
            String(minutes).padStart(2, '0') + ":" +
            String(seconds).padStart(2, '0');

        $("#working_hours").text(display);

    }, 1000);

}