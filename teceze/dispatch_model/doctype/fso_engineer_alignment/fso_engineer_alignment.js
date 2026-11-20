// frappe.ui.form.on("FSO Engineer Alignment", {
//     setup(frm) {

//             frm.set_query("country", function () {
//                 return {
//                     filters: {
//                         custom_region: frm.doc.region
//                     }
//                 };
//             });
//         },

//         region(frm) {
//             frm.set_value("country", "");
//         }

// //})
// frappe.ui.form.on("FSO Engineer Alignment", {
//     ticket(frm) {
//         if (!frm.doc.ticket) {
//             frm.set_value("tools", "");
//             return;
//         }
//         frappe.db.get_doc("Ticket", frm.doc.ticket).then(ticket => {
//             // Fetch selected tools
//             let selected_tools = [];
//             (ticket.tools_required || []).forEach(row => {
//                 if (row.tool_name && row.tool_name !== "Others") {
//                     selected_tools.push(row.tool_name);
//                 }
//             });

//             // Fetch Others value only when Others is selected
//             const has_others = (ticket.tools_required || []).some(
//                 row => row.tool_name === "Others"
//             );

//             if (has_others && ticket.others) {
//                 selected_tools.push(ticket.others);
//             }

//             // Set tools in FSO Engineer Alignment
//             frm.set_value("tools", selected_tools.join(", "));
//         });
//     }
// });
