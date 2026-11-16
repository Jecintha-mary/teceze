frappe.ui.form.on("FSO Engineer Alignment", {
    setup(frm) {

            frm.set_query("country", function () {
                return {
                    filters: {
                        custom_region: frm.doc.region
                    }
                };
            });
        },

        region(frm) {
            frm.set_value("country", "");
        }

})
// frappe.ui.form.on("FSO Engineer Alignment", {
//     ticket(frm) {
//         if (!frm.doc.ticket) {
//             frm.set_value("activity_date", "");
//             frm.set_value("tools", "");
//             return;
//         }

//         frappe.db.get_doc("Ticket", frm.doc.ticket).then(ticket => {

//             // Activity date
//             const date = ticket.activity_date
//                 ? moment(ticket.activity_date).format("DD MMM YYYY")
//                 : "";

//             // Activity time
//             const time = ticket.activity_time
//                 ? moment(ticket.activity_time, "HH:mm:ss").format("HH:mm")
//                 : "";

//             // Time zone
//             const timezone = ticket.activity_time_zone || "";

//             const date_time = [date, time]
//                 .filter(Boolean)
//                 .join(", ");

//             frm.set_value(
//                 "activity_date",
//                 [date_time, timezone].filter(Boolean).join(" , ")
//             );

//             // Fetch selected tools
//             let selected_tools = [];

//             (ticket.tools_required || []).forEach(row => {
//                 if (row.tool_name && row.tool_name !== "Others") {
//                     selected_tools.push(row.tool_name);
//                 }
//             });

//             // // Fetch Others value only when Others is selected
//             // const has_others = (ticket.tools_required || []).some(
//             //     row => row.tool_name === "Others"
//             // );

//             // if (has_others && ticket.others) {
//             //     selected_tools.push(ticket.others);
//             // }

//             // // Set tools in FSO Engineer Alignment
//             // frm.set_value("tools", selected_tools.join(", "));
//         });
//     }
// });
