frappe.ui.form.on("Timesheet", {
    // setup(frm) {
    //     set_activity_type_query(frm);
    // },

    refresh(frm) {
        frm.remove_custom_button(__("Start Timer"));
        frm.remove_custom_button(__("Resume Timer"));
        // load_department_activities(frm);
        set_timesheet_type(frm);
        update_fields_after(frm, 500);
    },

    employee(frm) {
        set_timesheet_type(frm);
        update_fields_after(frm, 300);
    },

    department(frm) {
        // load_department_activities(frm);
        set_timesheet_type(frm);
        update_fields_after(frm, 300);
    },

    custom_timesheet_type_2(frm) {
        update_fields_after(frm, 300);
    }
});

function update_fields_after(frm, delay = 300) {
    setTimeout(() => update_timesheet_type_fields(frm), delay);
}
const PROJECT_DEPARTMENTS = new Set([
    "Product  Development - TCPL"
]);
function set_timesheet_type(frm) {
    if (!frm.doc.department) return;

   frm.set_value(
        "custom_timesheet_type_2",
        PROJECT_DEPARTMENTS.has(frm.doc.department)
            ? "Project"
            : "Activity"
    );
}

// function set_activity_type_query(frm) {
//     const grid = frm.fields_dict.time_logs?.grid;
//     const field = grid?.get_field("activity_type");

//     if (!field) return;

//     field.get_query = () => ({
//         filters: {
//             name: ["in", frm.allowed_activity_types || []]
//         }
//     });
// }

// function load_department_activities(frm) {
//     frm.allowed_activity_types = [];

//     if (!frm.doc.department) return;

//     frappe.call({
//         method: "frappe.client.get",
//         args: {
//             doctype: "Department",
//             name: frm.doc.department
//         },
//         callback(r) {
//             if (!r.message) return;

//             frm.allowed_activity_types = (r.message.custom_activity_type || [])
//                 .map(row => row.activity_type)
//                 .filter(Boolean);

//             frm.refresh_field("time_logs");
//             update_fields_after(frm);
//         }
//     });
// }

function update_timesheet_type_fields(frm) {
    const grid = frm.fields_dict.time_logs?.grid;
    const wrapper = frm.fields_dict.time_logs?.wrapper;

    if (!grid || !wrapper) return;

    const $wrapper = $(wrapper);
    const isActivity = frm.doc.custom_timesheet_type_2 == "Activity";
    const isProject = frm.doc.custom_timesheet_type_2 == "Project";

    const fields = ["project", "project_name", "task"];

    fields.forEach(field => {
        $wrapper.find(`[data-fieldname="${field}"]`)
            [isActivity ? "hide" : "show"]();
    });

    grid.update_docfield_property("project", "reqd", isProject ? 1 : 0);
    grid.update_docfield_property("task", "reqd", isProject ? 1 : 0);

    $wrapper.toggleClass("timesheet-activity-mode", isActivity);

    frm.refresh_field("time_logs");

    setTimeout(() => {
        const $newWrapper = $(frm.fields_dict.time_logs.wrapper);

        fields.forEach(field => {
            $newWrapper.find(`[data-fieldname="${field}"]`)
                [isActivity ? "hide" : "show"]();
        });
    }, 200);
}