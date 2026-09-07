frappe.ui.form.on("Timesheet", {

    setup(frm) {
        set_activity_type_query(frm);
    },

    refresh(frm) {
        load_department_activities(frm);
        update_timesheet_type_fields(frm);
    },

    department(frm) {
        load_department_activities(frm);
    },

    custom_timesheet_type(frm) {
        update_timesheet_type_fields(frm);
    }

});


/* =========================================================
   ACTIVITY TYPE FILTER
   ========================================================= */

function set_activity_type_query(frm) {

    const activity_field =
        frm.fields_dict.time_logs?.grid?.get_field("activity_type");

    if (!activity_field) return;

    activity_field.get_query = function () {

        return {
            filters: {
                name: ["in", frm.allowed_activity_types || []]
            }
        };

    };
}


function load_department_activities(frm) {

    frm.allowed_activity_types = [];

    if (!frm.doc.department) {
        return;
    }

    frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Department",
            name: frm.doc.department
        },

        callback: function (r) {

            if (!r.message) return;

            frm.allowed_activity_types =
                (r.message.custom_activity_type || [])
                    .map(row => row.activity_type)
                    .filter(Boolean);

            frm.refresh_field("time_logs");
        }
    });
}


/* =========================================================
   TIMESHEET TYPE
   ========================================================= */

function update_timesheet_type_fields(frm) {

    const grid = frm.fields_dict.time_logs?.grid;

    if (!grid) return;

    const is_activity =
        frm.doc.custom_timesheet_type === "Activity";

    const is_project =
        frm.doc.custom_timesheet_type === "Project";


    if (is_activity) {

        // Hide Project
        grid.update_docfield_property(
            "project",
            "hidden",
            1
        );

        // Hide Project Name
        grid.update_docfield_property(
            "project_name",
            "hidden",
            1
        );

        // Hide Task
        grid.update_docfield_property(
            "task",
            "hidden",
            1
        );

        // Remove mandatory
        grid.update_docfield_property(
            "project",
            "reqd",
            0
        );

        grid.update_docfield_property(
            "task",
            "reqd",
            0
        );

    }

    else if (is_project) {

        // Show Project
        grid.update_docfield_property(
            "project",
            "hidden",
            0
        );

        // Show Project Name
        grid.update_docfield_property(
            "project_name",
            "hidden",
            0
        );

        // Show Task
        grid.update_docfield_property(
            "task",
            "hidden",
            0
        );

        // Make mandatory again
        grid.update_docfield_property(
            "project",
            "reqd",
            1
        );

        grid.update_docfield_property(
            "task",
            "reqd",
            1
        );

    }

    frm.refresh_field("time_logs");
}