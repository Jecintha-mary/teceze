// Copyright (c) 2026, Teceze Consultancy Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employee", {
	setup(frm) {

        frm.set_query('designation', function() {
            return {
                filters: {
            custom_department: frm.doc.department
            },
            or_filters: {
                custom_department: 'All Departments'
            }
                };
        });
    
   
    //Shift filter
    frm.set_query("default_shift", function () {
            if (!frm.doc.custom_work_location) {
                return {
                    filters: {
                        custom_work_location: ""
                    }
                };
            }

            return {
                filters: {
                    custom_location: frm.doc.custom_work_location
                }
            };
        });
    },
    refresh(frm) {

        // HR Manager has full access
        if (frappe.user_roles.includes("HR Manager")) {
            return;
        }

        // Shift Allocator can edit only Default Shift
        if (frappe.user_roles.includes("Shift Allocator")) {

            frm.meta.fields.forEach(df => {
                if (
                    df.fieldname &&
                    df.fieldname !== "default_shift" &&
                    ![
                        "Section Break",
                        "Column Break",
                        "Tab Break",
                        "HTML"
                    ].includes(df.fieldtype)
                ) {
                    frm.set_df_property(
                        df.fieldname,
                        "read_only",
                        1
                    );
                }
            });

            // Default Shift editable
            frm.set_df_property(
                "default_shift",
                "read_only",
                0
            );

            return;
        }

        // All other users - entire form read-only
        frm.meta.fields.forEach(df => {
            if (
                df.fieldname &&
                ![
                    "Section Break",
                    "Column Break",
                    "Tab Break",
                    "HTML"
                ].includes(df.fieldtype)
            ) {
                frm.set_df_property(
                    df.fieldname,
                    "read_only",
                    1
                );
            }
        });
    }
});

