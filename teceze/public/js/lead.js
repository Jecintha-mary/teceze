/* ============================================================
   PREMIUM LEAD ACTIVITY
   ============================================================

   PARENT DOCTYPE:
       Lead

   HTML FIELD:
       custom_report

   CHILD DOCTYPE:
       Lead Activity

   ACTUAL CHILD FIELDS:
       activity_type
       subject
       description
       activity_date
       follow_up_date
       is_follow_completed
       is_followup

   FOLLOW-UP LOGIC:
       is_followup = 1
       is_follow_completed = 0
           -> Show "Done"

       is_followup = 1
       is_follow_completed = 1
           -> Show "Completed"

   DONE BUTTON:
       ONLY updates:
           is_follow_completed = 1

       DOES NOT:
           - change is_followup
           - save Lead
           - submit Lead
============================================================ */
frappe.ui.form.on("Lead", {

    refresh(frm) {

        render_lead_activity_report(frm);

        if (erpnext.LeadController) {

            frm.cscript.make_opportunity = function () {

                frappe.model.open_mapped_doc({
                    method: "erpnext.crm.doctype.lead.lead.make_opportunity",
                    frm: frm
                });

            };

        }
        
        hide_unwanted_create_options(frm);

    },

    after_save(frm) {

        render_lead_activity_report(frm);

    }

});

function hide_unwanted_create_options(frm) {

    // Wait until ERPNext finishes creating its buttons
    setTimeout(() => {

        // Hide Customer
        frm.page.remove_inner_button("Customer", "Create");

        // Hide Prospect
        frm.page.remove_inner_button("Prospect", "Create");

        // Remove Add to Prospect from Action menu
        frm.remove_custom_button(
            "Add to Prospect",
            "Action"
        );

    }, 100);

}
/* ============================================================
   FIND LEAD ACTIVITY CHILD TABLE
============================================================ */

function get_activity_table_field(frm) {

    const fields = frm.meta.fields || [];

    const table_field = fields.find(field => {

        return (
            field.fieldtype === "Table" &&
            field.options === "Lead Activity"
        );

    });

    return table_field
        ? table_field.fieldname
        : null;
}


/* ============================================================
   MAIN REPORT
============================================================ */

function render_lead_activity_report(frm) {

    const html_field =
        frm.fields_dict.custom_report;

    if (!html_field) {
        return;
    }


    const activity_table =
        get_activity_table_field(frm);


    if (!activity_table) {

        html_field.$wrapper.html(`

            <div style="
                padding:40px;
                text-align:center;
                color:#888;
            ">

                Lead Activity table not found.

            </div>

        `);

        return;
    }


    const activities =
        frm.doc[activity_table] || [];


    const wrapper =
        html_field.$wrapper;


    /* ========================================================
       NORMAL ACTIVITIES
    ======================================================== */

    const normal_activities =
        activities
            .filter(row => {

                return Number(row.is_followup) !== 1;

            })
            .sort((a, b) => {

                return (
                    new Date(b.activity_date || 0) -
                    new Date(a.activity_date || 0)
                );

            });


    /* ========================================================
       ACTIVE FOLLOW-UPS
    ======================================================== */

    const active_followups =
        activities
            .filter(row => {

                return (
                    Number(row.is_followup) === 1 &&
                    Number(row.is_follow_completed) !== 1
                );

            })
            .sort((a, b) => {

                return (
                    new Date(a.follow_up_date || 0) -
                    new Date(b.follow_up_date || 0)
                );

            });


    /* ========================================================
       COMPLETED FOLLOW-UPS
    ======================================================== */

    const completed_followups =
        activities
            .filter(row => {

                return (
                    Number(row.is_followup) === 1 &&
                    Number(row.is_follow_completed) === 1
                );

            })
            .sort((a, b) => {

                return (
                    new Date(b.follow_up_date || 0) -
                    new Date(a.follow_up_date || 0)
                );

            });


    /* ========================================================
       CURRENT DATE
    ======================================================== */

    const now =
        new Date();


    /* ========================================================
       OVERDUE FOLLOW-UPS
    ======================================================== */

    const overdue_followups =
        active_followups.filter(row => {

            return (
                row.follow_up_date &&
                new Date(row.follow_up_date) < now
            );

        });


    /* ========================================================
       UPCOMING FOLLOW-UPS
    ======================================================== */

    const upcoming_followups =
        active_followups.filter(row => {

            return (
                row.follow_up_date &&
                new Date(row.follow_up_date) >= now
            );

        });


    /* ========================================================
       LAST ACTIVITY
    ======================================================== */

    const last_activity =
        normal_activities[0];


    const last_activity_type =
        last_activity?.activity_type ||
        "No activity";


    const last_activity_time =
        last_activity?.activity_date
            ? format_relative_time(
                last_activity.activity_date
            )
            : "";


    /* ========================================================
       LEAD DETAILS
    ======================================================== */

    const lead_status =
        frm.doc.status ||
        "New";


    const lead_owner =
        frm.doc.lead_owner ||
        frm.doc.owner ||
        "Administrator";


    /* ========================================================
       RENDER MAIN HTML
    ======================================================== */

    wrapper.html(`

       
<style>

/* ============================================================
   PREMIUM COLORFUL SAAS CRM
   ------------------------------------------------------------
   DESIGN:
   • Rich but elegant
   • Premium SaaS
   • Apple / Tesla inspired spacing
   • Soft gradients
   • Multi-accent colors
   • No flashy/disco effects
   • Fixed toolbar/header
   • Independent scrolling
   ============================================================ */


/* ============================================================
   ROOT
   ============================================================ */

.premium-lead-activity {

    width: 100%;

    box-sizing: border-box;

    padding: 6px 2px 30px;

    font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        "SF Pro Display",
        "SF Pro Text",
        "Segoe UI",
        sans-serif;

    color: #17201d;

    letter-spacing: -0.012em;

}


/* ============================================================
   HEADER
   ============================================================ */

.activity-header {

    display: flex;

    align-items: center;

    justify-content: space-between;

    margin-bottom: 20px;

}


.activity-title {

    display: flex;

    align-items: center;

    gap: 9px;

    color: #141a18;

    font-size: 20px;

    font-weight: 700;

    letter-spacing: -0.04em;

}


.activity-count {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    min-width: 24px;

    height: 24px;

    padding: 0 8px;

    border: 1px solid #ddd9ff;

    border-radius: 999px;

    background:
        linear-gradient(
            135deg,
            #f3f0ff,
            #eef7ff
        );

    color: #6556c7;

    font-size: 10px;

    font-weight: 700;

    box-shadow:
        0 2px 8px rgba(101, 86, 199, .08);

}


/* ============================================================
   LOG ACTIVITY BUTTON
   ============================================================ */

.lead-log-activity-btn {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    gap: 7px;

    height: 39px;

    padding: 0 16px;

    border: 1px solid #d9dcf8;

    border-radius: 10px;

    background:
        linear-gradient(
            135deg,
            #ffffff 0%,
            #f8f7ff 100%
        );

    color: #3e3970;

    font-size: 12px;

    font-weight: 650;

    cursor: pointer;

    white-space: nowrap;

    box-shadow:
        0 2px 4px rgba(59, 52, 130, .04),
        0 8px 22px rgba(59, 52, 130, .06);

    transition:
        transform .18s ease,
        border-color .18s ease,
        box-shadow .18s ease,
        background .18s ease;

}


.lead-log-activity-btn:hover {

    transform: translateY(-1px);

    border-color: #c5c9ef;

    background:
        linear-gradient(
            135deg,
            #ffffff,
            #f3f1ff
        );

    box-shadow:
        0 4px 8px rgba(59, 52, 130, .06),
        0 12px 26px rgba(59, 52, 130, .10);

}


.lead-log-activity-btn:active {

    transform: translateY(0);

}


/* ============================================================
   OVERDUE ALERT
   ============================================================ */

.activity-alert {

    display: flex;

    align-items: center;

    justify-content: space-between;

    min-height: 48px;

    margin-bottom: 16px;

    padding: 0 15px;

    border: 1px solid #f3d6c8;

    border-radius: 11px;

    background:
        linear-gradient(
            100deg,
            #fff8f4 0%,
            #fffafd 100%
        );

    box-shadow:
        0 4px 16px rgba(183, 105, 53, .045);

}


.activity-alert-left {

    display: flex;

    align-items: center;

    gap: 9px;

    color: #9a5a43;

    font-size: 11px;

    font-weight: 550;

}


.activity-alert-left strong {

    color: #783f2e;

    font-weight: 750;

}


.activity-alert-action {

    height: 29px;

    padding: 0 11px;

    border: 1px solid #e9cabe;

    border-radius: 7px;

    background: #ffffff;

    color: #985846;

    font-size: 10px;

    font-weight: 650;

    cursor: pointer;

    transition: .18s ease;

}


.activity-alert-action:hover {

    border-color: #d8afa0;

    background: #fff5f0;

}


/* ============================================================
   SUMMARY
   ============================================================ */

.activity-summary {

    display: grid;

    grid-template-columns:
        repeat(4, minmax(0, 1fr));

    border: 1px solid #e1e4ee;

    border-radius: 13px;

    overflow: hidden;

    background: #ffffff;

    margin-bottom: 16px;

    box-shadow:
        0 2px 5px rgba(27, 31, 45, .025),
        0 12px 34px rgba(48, 55, 87, .045);

}


.summary-card {

    position: relative;

    min-height: 84px;

    padding: 15px 17px;

    border-right: 1px solid #edf0f4;

    background: #ffffff;

    transition:
        background .18s ease;

}


.summary-card:hover {

    background:
        linear-gradient(
            135deg,
            #ffffff,
            #fafbff
        );

}


/* Decorative accent */

.summary-card:nth-child(1)::before {

    content: "";

    position: absolute;

    left: 0;

    top: 0;

    width: 3px;

    height: 100%;

    background:
        linear-gradient(
            180deg,
            #7c6cf2,
            #4fa9ff
        );

}


.summary-card:nth-child(2)::before {

    content: "";

    position: absolute;

    left: 0;

    top: 0;

    width: 3px;

    height: 100%;

    background:
        linear-gradient(
            180deg,
            #26b6a5,
            #5cdb9e
        );

}


.summary-card:nth-child(3)::before {

    content: "";

    position: absolute;

    left: 0;

    top: 0;

    width: 3px;

    height: 100%;

    background:
        linear-gradient(
            180deg,
            #ff9b72,
            #ffca74
        );

}


.summary-card:nth-child(4)::before {

    content: "";

    position: absolute;

    left: 0;

    top: 0;

    width: 3px;

    height: 100%;

    background:
        linear-gradient(
            180deg,
            #4fa9ff,
            #806df0
        );

}


.summary-card:nth-child(4) {

    border-right: 0;

}


.summary-label {

    margin-bottom: 9px;

    color: #9ba2ad;

    font-size: 9px;

    font-weight: 750;

    text-transform: uppercase;

    letter-spacing: .8px;

}


.summary-value {

    color: #202722;

    font-size: 13px;

    font-weight: 700;

    letter-spacing: -0.018em;

}


.summary-sub {

    margin-top: 5px;

    color: #9da5af;

    font-size: 10px;

}


/* ============================================================
   QUALIFICATION PILL
   ============================================================ */

.summary-pill {

    display: inline-flex;

    align-items: center;

    gap: 5px;

    height: 24px;

    padding: 0 10px;

    border: 1px solid #dcd8ff;

    border-radius: 999px;

    background:
        linear-gradient(
            135deg,
            #f3f0ff,
            #eef7ff
        );

    color: #5b4db0;

    font-size: 10px;

    font-weight: 700;

    box-shadow:
        0 3px 10px rgba(91, 77, 176, .07);

}


/* ============================================================
   COMPLETENESS
   ============================================================ */

.activity-completeness {

    grid-column: 1 / -1;

    padding: 12px 17px 14px;

    border-top: 1px solid #edf0f4;

    background:
        linear-gradient(
            180deg,
            #fbfcff,
            #f8fafc
        );

}


.completeness-top {

    display: flex;

    align-items: center;

    justify-content: space-between;

    margin-bottom: 7px;

}


.completeness-label {

    color: #89929d;

    font-size: 9px;

    font-weight: 750;

    text-transform: uppercase;

    letter-spacing: .75px;

}


.completeness-value {

    color: #717b86;

    font-size: 10px;

    font-weight: 600;

}


.completeness-bar {

    position: relative;

    height: 5px;

    overflow: hidden;

    border-radius: 999px;

    background: #e8ecf2;

}


.completeness-progress {

    width: ${activities.length ? "70%" : "0%"};

    height: 100%;

    border-radius: 999px;

    background:
        linear-gradient(
            90deg,
            #6e60e8 0%,
            #4e9cff 52%,
            #37c7a3 100%
        );

    box-shadow:
        0 0 12px rgba(93, 108, 235, .20);

}


/* ============================================================
   MAIN WORKSPACE
   ============================================================ */

.activity-main {

    display: grid;

    grid-template-columns:
        minmax(0, 1fr)
        318px;

    gap: 16px;

    height: 620px;

    min-height: 520px;

    align-items: stretch;

}


/* ============================================================
   LEFT PANEL
   ============================================================ */

.activity-left {

    min-width: 0;

    min-height: 0;

    display: flex;

    flex-direction: column;

    border: 1px solid #e1e4ec;

    border-radius: 13px;

    background: #ffffff;

    overflow: hidden;

    box-shadow:
        0 2px 5px rgba(22, 27, 40, .025),
        0 12px 32px rgba(53, 62, 98, .045);

}


/* ============================================================
   ACTIVITY TOOLBAR
   STATIC
   ============================================================ */

.activity-left-header {

    flex: 0 0 auto;

    display: flex;

    align-items: center;

    gap: 5px;

    flex-wrap: wrap;

    padding: 12px 13px;

    border-bottom: 1px solid #eceff4;

    background:
        linear-gradient(
            180deg,
            #ffffff,
            #fbfcff
        );

    position: relative;

    z-index: 20;

}


/* ============================================================
   FILTER BUTTONS
   ============================================================ */

.activity-filter {

    height: 31px;

    padding: 0 12px;

    border: 1px solid transparent;

    border-radius: 999px;

    background: transparent;

    color: #737d87;

    font-size: 10px;

    font-weight: 650;

    cursor: pointer;

    transition:
        color .18s ease,
        background .18s ease,
        border-color .18s ease,
        box-shadow .18s ease;

}


.activity-filter:hover {

    background: #f1f4ff;

    color: #584bb0;

}


.activity-filter.active {

    border-color: #d9d5ff;

    background:
        linear-gradient(
            135deg,
            #7667eb,
            #5d8ff0
        );

    color: #ffffff;

    box-shadow:
        0 4px 12px rgba(102, 94, 224, .20);

}


/* ============================================================
   SEARCH
   ============================================================ */

.activity-search {

    margin-left: auto;

    width: 178px;

    height: 33px;

    box-sizing: border-box;

    padding: 0 12px;

    border: 1px solid #dfe4eb;

    border-radius: 9px;

    outline: none;

    background:
        linear-gradient(
            180deg,
            #ffffff,
            #fafbfd
        );

    color: #303740;

    font-family: inherit;

    font-size: 10px;

    box-shadow:
        inset 0 1px 2px rgba(20, 25, 35, .015);

    transition:
        border-color .18s ease,
        box-shadow .18s ease,
        background .18s ease;

}


.activity-search::placeholder {

    color: #a4acb5;

}


.activity-search:hover {

    border-color: #d1d7e1;

}


.activity-search:focus {

    border-color: #9ca6e4;

    background: #ffffff;

    box-shadow:
        0 0 0 3px rgba(103, 96, 221, .08);

}


/* ============================================================
   ACTIVITY SCROLL AREA
   ============================================================ */

#lead-activity-list {

    flex: 1 1 auto;

    min-height: 0;

    padding: 0 19px 24px;

    overflow-y: auto;

    overflow-x: hidden;

    overscroll-behavior: contain;

    scrollbar-width: thin;

    scrollbar-color:
        #d4dae6
        transparent;

}


#lead-activity-list::-webkit-scrollbar {

    width: 6px;

}


#lead-activity-list::-webkit-scrollbar-track {

    background: transparent;

}


#lead-activity-list::-webkit-scrollbar-thumb {

    background:
        linear-gradient(
            180deg,
            #d5daf0,
            #ccd9e8
        );

    border-radius: 999px;

}


#lead-activity-list::-webkit-scrollbar-thumb:hover {

    background:
        linear-gradient(
            180deg,
            #bfc7df,
            #b7ccd9
        );

}


/* ============================================================
   DATE GROUP
   ============================================================ */

.activity-date-group {

    width: 100%;

}


.activity-date-label {

    display: flex;

    align-items: center;

    height: 40px;

    border-bottom: 1px solid #eef0f4;

    color: #9099a4;

    font-size: 9px;

    font-weight: 750;

    text-transform: uppercase;

    letter-spacing: .8px;

}


/* ============================================================
   ACTIVITY TIMELINE
   ============================================================ */

.lead-activity-item {

    position: relative;

    display: flex;

    gap: 13px;

    padding: 16px 4px 18px;

}


.lead-activity-item:not(:last-child)::after {

    content: "";

    position: absolute;

    left: 16px;

    top: 47px;

    bottom: 0;

    width: 1px;

    background:
        linear-gradient(
            180deg,
            #e2e5ee,
            #f0f2f6
        );

}


/* ============================================================
   ACTIVITY ICON
   ============================================================ */

.lead-activity-icon {

    position: relative;

    z-index: 2;

    display: flex;

    align-items: center;

    justify-content: center;

    width: 33px;

    height: 33px;

    min-width: 33px;

    border: 1px solid #dce1ec;

    border-radius: 10px;

    background:
        linear-gradient(
            145deg,
            #f2f0ff,
            #edf7ff
        );

    color: #5c5ab1;

    font-size: 12px;

    box-shadow:
        0 3px 10px rgba(79, 89, 177, .07);

}


/* ============================================================
   CONTENT
   ============================================================ */

.lead-activity-content {

    flex: 1;

    min-width: 0;

    padding-top: 1px;

}


.lead-activity-top {

    display: flex;

    align-items: center;

    gap: 8px;

}


.lead-activity-type {

    color: #46505b;

    font-size: 10px;

    font-weight: 750;

}


.lead-activity-time {

    color: #a2aab4;

    font-size: 9px;

    font-weight: 500;

}


.lead-activity-subject {

    margin-top: 5px;

    color: #1f2723;

    font-size: 13px;

    font-weight: 700;

    letter-spacing: -0.02em;

}


.lead-activity-description {

    max-width: 720px;

    margin-top: 5px;

    color: #75808a;

    font-size: 10px;

    line-height: 1.65;

    white-space: pre-wrap;

}


/* ============================================================
   RIGHT FOLLOW-UP PANEL
   ============================================================ */

.activity-right {

    min-width: 0;

    min-height: 0;

    display: flex;

    flex-direction: column;

    border: 1px solid #e1e4ec;

    border-radius: 13px;

    background: #ffffff;

    overflow: hidden;

    box-shadow:
        0 2px 5px rgba(22, 27, 40, .025),
        0 12px 32px rgba(53, 62, 98, .045);

}


/* ============================================================
   FOLLOW-UP HEADER
   STATIC
   ============================================================ */

.followup-header {

    flex: 0 0 auto;

    display: flex;

    align-items: center;

    justify-content: space-between;

    height: 57px;

    min-height: 57px;

    padding: 0 15px;

    border-bottom: 1px solid #eceff4;

    background:
        linear-gradient(
            180deg,
            #ffffff,
            #fbfcff
        );

    position: relative;

    z-index: 20;

}


.followup-title {

    display: flex;

    align-items: center;

    gap: 8px;

    color: #252d2a;

    font-size: 12px;

    font-weight: 700;

}


.followup-title > span:first-child {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    width: 25px;

    height: 25px;

    border-radius: 8px;

    background:
        linear-gradient(
            135deg,
            #eef0ff,
            #e8f7ff
        );

    color: #6659c7;

    font-size: 12px;

    box-shadow:
        0 3px 8px rgba(102, 89, 199, .08);

}


.followup-count {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    min-width: 19px;

    height: 19px;

    padding: 0 6px;

    border-radius: 999px;

    background: #f1f3f7;

    color: #88919b;

    font-size: 9px;

    font-weight: 700;

}


/* ============================================================
   FOLLOW-UP PLUS
   ============================================================ */

.followup-add {

    width: 29px;

    height: 29px;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 0;

    border: 1px solid #dce1e8;

    border-radius: 9px;

    background:
        linear-gradient(
            145deg,
            #ffffff,
            #f5f7fb
        );

    color: #505964;

    font-size: 17px;

    font-weight: 400;

    cursor: pointer;

    box-shadow:
        0 2px 7px rgba(30, 40, 50, .04);

    transition:
        transform .18s ease,
        border-color .18s ease,
        background .18s ease,
        box-shadow .18s ease;

}


.followup-add:hover {

    transform: translateY(-1px);

    border-color: #c3cae0;

    background:
        linear-gradient(
            145deg,
            #ffffff,
            #f0efff
        );

    box-shadow:
        0 5px 13px rgba(75, 70, 150, .09);

}


/* ============================================================
   FOLLOW-UP SCROLL AREA
   ============================================================ */

#lead-followups-list {

    flex: 1 1 auto;

    min-height: 0;

    overflow-y: auto;

    overflow-x: hidden;

    padding: 0 0 20px;

    overscroll-behavior: contain;

    scrollbar-width: thin;

    scrollbar-color:
        #d4dae6
        transparent;

}


#lead-followups-list::-webkit-scrollbar {

    width: 6px;

}


#lead-followups-list::-webkit-scrollbar-track {

    background: transparent;

}


#lead-followups-list::-webkit-scrollbar-thumb {

    background:
        linear-gradient(
            180deg,
            #d5daf0,
            #ccd9e8
        );

    border-radius: 999px;

}


#lead-followups-list::-webkit-scrollbar-thumb:hover {

    background:
        linear-gradient(
            180deg,
            #bfc7df,
            #b7ccd9
        );

}


/* ============================================================
   FOLLOW-UP SECTION HEADER
   ============================================================ */

.followup-section-title {

    display: flex;

    align-items: center;

    justify-content: space-between;

    padding: 15px 15px 8px;

    color: #8a929d;

    font-size: 9px;

    font-weight: 800;

    text-transform: uppercase;

    letter-spacing: .8px;

}


.followup-section-title span {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    min-width: 19px;

    height: 19px;

    padding: 0 5px;

    border-radius: 999px;

    background: #f2f4f7;

    color: #9098a3;

    font-size: 9px;

}


/* ============================================================
   FOLLOW-UP CARD
   ============================================================ */

.followup-card {

    position: relative;

    margin: 0 11px 10px;

    padding: 14px 14px 13px;

    border: 1px solid #e1e5ec;

    border-left: 3px solid #e1a84b;

    border-radius: 11px;

    background:
        linear-gradient(
            145deg,
            #ffffff 0%,
            #fffdf9 100%
        );

    box-shadow:
        0 2px 7px rgba(35, 40, 50, .035);

    transition:
        transform .18s ease,
        border-color .18s ease,
        box-shadow .18s ease;

}


.followup-card:hover {

    transform: translateY(-1px);

    border-color: #d4dae4;

    box-shadow:
        0 7px 20px rgba(35, 40, 50, .075);

}


/* ============================================================
   COMPLETED CARD
   ============================================================ */

.followup-card.completed {

    border-left-color: #35ad82;

    background:
        linear-gradient(
            145deg,
            #ffffff 0%,
            #f6fcf9 100%
        );

}


/* ============================================================
   CARD HEADER
   ============================================================ */

.followup-card-header {

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 10px;

}


.followup-type {

    display: inline-flex;

    align-items: center;

    height: 21px;

    padding: 0 7px;

    border: 1px solid #e0e5ed;

    border-radius: 6px;

    background: #f7f9fc;

    color: #66717c;

    font-size: 8px;

    font-weight: 800;

    text-transform: uppercase;

    letter-spacing: .7px;

}


/* ============================================================
   SUBJECT
   ============================================================ */

.followup-subject {

    margin-top: 9px;

    color: #1f2723;

    font-size: 12px;

    font-weight: 700;

    line-height: 1.45;

    letter-spacing: -0.015em;

}


/* ============================================================
   DESCRIPTION
   ============================================================ */

.followup-description {

    margin-top: 5px;

    color: #7c8690;

    font-size: 10px;

    line-height: 1.6;

}


/* ============================================================
   DATE
   ============================================================ */

.followup-date {

    display: flex;

    align-items: center;

    gap: 5px;

    margin-top: 11px;

    color: #89929c;

    font-size: 9px;

    font-weight: 600;

}


/* ============================================================
   OVERDUE
   ============================================================ */

.followup-overdue {

    display: inline-flex;

    align-items: center;

    margin-top: 8px;

    padding: 4px 8px;

    border: 1px solid #f3d8cf;

    border-radius: 6px;

    background:
        linear-gradient(
            135deg,
            #fff7f3,
            #fffaf8
        );

    color: #a45a46;

    font-size: 8px;

    font-weight: 750;

}


/* ============================================================
   DONE BUTTON
   ============================================================ */

.followup-done-btn {

    appearance: none !important;

    -webkit-appearance: none !important;

    display: inline-flex !important;

    align-items: center !important;

    justify-content: center !important;

    height: 29px !important;

    min-width: 72px !important;

    padding: 0 11px !important;

    border: 1px solid #bde2d0 !important;

    border-radius: 8px !important;

    background:
        linear-gradient(
            135deg,
            #f2fcf7,
            #eafaf2
        ) !important;

    color: #23825a !important;

    font-family: inherit !important;

    font-size: 9px !important;

    font-weight: 750 !important;

    cursor: pointer !important;

    box-shadow:
        0 3px 8px rgba(35, 130, 90, .07) !important;

    transition:
        transform .18s ease,
        background .18s ease,
        border-color .18s ease,
        box-shadow .18s ease !important;

}


.followup-done-btn:hover {

    transform: translateY(-1px);

    border-color: #8dccaa !important;

    background:
        linear-gradient(
            135deg,
            #eafaf1,
            #ddf6e9
        ) !important;

    color: #176943 !important;

    box-shadow:
        0 6px 15px rgba(35, 130, 90, .12) !important;

}


.followup-done-btn:active {

    transform: translateY(0);

    box-shadow:
        0 2px 5px rgba(35, 130, 90, .06) !important;

}


/* ============================================================
   COMPLETED BADGE
   ============================================================ */

.completed-badge {

    display: inline-flex;

    align-items: center;

    justify-content: center;

    gap: 5px;

    height: 27px;

    padding: 0 9px;

    border: 1px solid #bfe4d0;

    border-radius: 8px;

    background:
        linear-gradient(
            135deg,
            #f0fbf5,
            #e7f8ef
        );

    color: #277951;

    font-size: 8px;

    font-weight: 750;

    white-space: nowrap;

    box-shadow:
        0 3px 8px rgba(39, 121, 81, .06);

}


/* ============================================================
   EMPTY ACTIVITY
   ============================================================ */

.empty-activity {

    padding: 70px 20px;

    text-align: center;

}


.empty-icon {

    width: 48px;

    height: 48px;

    margin: 0 auto 14px;

    display: flex;

    align-items: center;

    justify-content: center;

    border: 1px solid #dddff4;

    border-radius: 14px;

    background:
        linear-gradient(
            135deg,
            #f2f0ff,
            #edf7ff
        );

    color: #6557bf;

    font-size: 18px;

    box-shadow:
        0 6px 18px rgba(88, 80, 180, .08);

}


.empty-title {

    color: #3f4944;

    font-size: 12px;

    font-weight: 700;

}


.empty-text {

    max-width: 280px;

    margin: 6px auto 0;

    color: #9ca5ae;

    font-size: 10px;

    line-height: 1.6;

}


/* ============================================================
   EMPTY FOLLOW-UPS
   ============================================================ */

.empty-followups {

    padding: 50px 15px;

    text-align: center;

}


.empty-followup-icon {

    width: 43px;

    height: 43px;

    margin: 0 auto 12px;

    display: flex;

    align-items: center;

    justify-content: center;

    border: 1px solid #dce1ee;

    border-radius: 13px;

    background:
        linear-gradient(
            135deg,
            #f2f0ff,
            #edf8ff
        );

    color: #6a5bc4;

    font-size: 15px;

}


.empty-followup-title {

    color: #3d4742;

    font-size: 11px;

    font-weight: 700;

}


.empty-followup-text {

    margin-top: 5px;

    color: #9ca5ae;

    font-size: 9px;

}


/* ============================================================
   FOCUS
   ============================================================ */

.activity-filter:focus-visible,
.lead-log-activity-btn:focus-visible,
.activity-alert-action:focus-visible,
.followup-add:focus-visible,
.followup-done-btn:focus-visible {

    outline: none;

    box-shadow:
        0 0 0 3px rgba(102, 92, 220, .12);

}


/* ============================================================
   LARGE SCREEN
   ============================================================ */

@media (max-width: 1150px) {

    .activity-main {

        grid-template-columns:
            minmax(0, 1fr)
            285px;

    }


    .activity-filter {

        padding-left: 10px;

        padding-right: 10px;

    }


    .activity-search {

        width: 155px;

    }

}


/* ============================================================
   TABLET
   ============================================================ */

@media (max-width: 950px) {

    .activity-main {

        grid-template-columns: 1fr;

        height: auto;

        min-height: 0;

    }


    .activity-left {

        height: 560px;

        min-height: 560px;

    }


    .activity-right {

        height: 480px;

        min-height: 480px;

    }

}


/* ============================================================
   MOBILE
   ============================================================ */

@media (max-width: 700px) {

    .activity-header {

        align-items: flex-start;

        gap: 12px;

    }


    .activity-title {

        font-size: 18px;

    }


    .lead-log-activity-btn {

        height: 37px;

        padding: 0 13px;

    }


    .activity-summary {

        grid-template-columns:
            1fr 1fr;

    }


    .summary-card:nth-child(2) {

        border-right: 0;

    }


    .summary-card:nth-child(1),
    .summary-card:nth-child(2) {

        border-bottom:
            1px solid #edf0f4;

    }


    .activity-left-header {

        align-items: stretch;

    }


    .activity-filter {

        padding-left: 9px;

        padding-right: 9px;

    }


    .activity-search {

        width: 100%;

        margin-left: 0;

        order: 10;

    }


    .activity-left {

        height: 520px;

        min-height: 520px;

    }


    .activity-right {

        height: 460px;

        min-height: 460px;

    }

}


/* ============================================================
   SMALL MOBILE
   ============================================================ */

@media (max-width: 480px) {

    .premium-lead-activity {

        padding-left: 0;

        padding-right: 0;

    }


    .activity-header {

        flex-direction: column;

        align-items: stretch;

    }


    .lead-log-activity-btn {

        width: 100%;

    }


    .activity-summary {

        grid-template-columns: 1fr;

    }


    .summary-card {

        border-right: 0 !important;

        border-bottom:
            1px solid #edf0f4;

    }


    .summary-card:last-of-type {

        border-bottom: 0;

    }


    .activity-left {

        height: 500px;

        min-height: 500px;

    }


    .activity-right {

        height: 450px;

        min-height: 450px;

    }


    .activity-filter {

        flex: 0 0 auto;

    }


    .lead-activity-item {

        gap: 10px;

    }


    .lead-activity-subject {

        font-size: 12px;

    }


    .followup-card {

        margin-left: 9px;

        margin-right: 9px;

    }

}


/* ============================================================
   REDUCED MOTION
   ============================================================ */

@media (prefers-reduced-motion: reduce) {

    .lead-log-activity-btn,
    .activity-filter,
    .activity-search,
    .followup-add,
    .followup-card,
    .followup-done-btn {

        transition: none !important;

    }

}

</style>

        <!-- ===================================================
             MAIN
        =================================================== -->

        <div class="premium-lead-activity">


            <!-- =================================================
                 HEADER
            ================================================= -->

            <div class="activity-header">

                <div class="activity-title">

                    Activity

                    <span class="activity-count">

                        ${activities.length}

                    </span>

                </div>


                <button
                    type="button"
                    id="lead-log-activity"
                    class="lead-log-activity-btn">

                    <span style="
                        font-size:16px;
                        line-height:1;
                    ">

                        +

                    </span>

                    Log activity

                </button>

            </div>


            <!-- =================================================
                 OVERDUE ALERT
            ================================================= -->

            ${
                overdue_followups.length
                    ? `

                        <div class="activity-alert">

                            <div class="activity-alert-left">

                                <span>
                                    ⚠
                                </span>

                                <span>

                                    <strong>
                                        ${overdue_followups.length}
                                    </strong>

                                    ${
                                        overdue_followups.length === 1
                                            ? " follow-up is overdue."
                                            : " follow-ups are overdue."
                                    }

                                </span>

                            </div>


                            <button
                                type="button"
                                class="activity-alert-action">

                                Review follow-ups

                            </button>

                        </div>

                    `
                    : ""
            }


            <!-- =================================================
                 SUMMARY
            ================================================= -->

            <div class="activity-summary">


                <div class="summary-card">

                    <div class="summary-label">
                        Qualification
                    </div>

                    <span class="summary-pill">

                        ●

                        ${frappe.utils.escape_html(
                            lead_status
                        )}

                    </span>

                </div>


                <div class="summary-card">

                    <div class="summary-label">
                        Lead Owner
                    </div>

                    <div class="summary-value">

                        ${frappe.utils.escape_html(
                            lead_owner
                        )}

                    </div>

                </div>


                <div class="summary-card">

                    <div class="summary-label">
                        Last Activity
                    </div>

                    <div class="summary-value">

                        ${frappe.utils.escape_html(
                            last_activity_type
                        )}

                    </div>


                    ${
                        last_activity_time
                            ? `

                                <div class="summary-sub">

                                    ${last_activity_time}

                                </div>

                            `
                            : ""
                    }

                </div>


                <div class="summary-card">

                    <div class="summary-label">
                        Next Follow-up
                    </div>

                    <div class="summary-value">

                        ${
                            upcoming_followups.length

                                ? frappe.datetime.str_to_user(
                                    upcoming_followups[0]
                                        .follow_up_date
                                )

                                : "None"
                        }

                    </div>

                </div>


                <div class="activity-completeness">

                    <div class="completeness-top">

                        <span class="completeness-label">

                            Activity Completeness

                        </span>


                        <span class="completeness-value">

                            ${activities.length}

                            ${
                                activities.length === 1
                                    ? "activity"
                                    : "activities"
                            }

                        </span>

                    </div>


                    <div class="completeness-bar">

                        <div class="completeness-progress"></div>

                    </div>

                </div>

            </div>


            <!-- =================================================
                 MAIN
            ================================================= -->

            <div class="activity-main">


                <!-- =================================================
                     LEFT
                ================================================= -->

                <div class="activity-left">


                    <div class="activity-left-header">


                        <button
                            type="button"
                            class="activity-filter active"
                            data-type="All">

                            All

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Call">

                            Calls

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Message">

                            Messages

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Email">

                            Emails

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Meeting">

                            Meetings

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Visit">

                            Visits

                        </button>


                        <button
                            type="button"
                            class="activity-filter"
                            data-type="Proposal">

                            Proposals

                        </button>


                        <input
                            type="text"
                            id="lead-activity-search"
                            class="activity-search"
                            placeholder="Search activity..."
                        >

                    </div>


                    <div id="lead-activity-list"></div>

                </div>


                <!-- =================================================
                     RIGHT
                ================================================= -->

                <div class="activity-right">


                    <div class="followup-header">


                        <div class="followup-title">

                            <span>
                                ♧
                            </span>

                            Follow-ups

                            <span class="followup-count">

                                ${
                                    active_followups.length +
                                    completed_followups.length
                                }

                            </span>

                        </div>


                        <button
                            type="button"
                            id="add-followup"
                            class="followup-add">

                            +

                        </button>

                    </div>


                    <div id="lead-followups-list">

                        ${render_followup_cards(
                            active_followups,
                            completed_followups
                        )}

                    </div>

                </div>

            </div>

        </div>

    `);


    /* ========================================================
       LOG ACTIVITY BUTTON
    ======================================================== */

    wrapper
        .find("#lead-log-activity")
        .off("click")
        .on("click", function () {

            open_lead_activity_form(
                frm,
                activity_table,
                false
            );

        });


    /* ========================================================
       ADD FOLLOW-UP BUTTON
    ======================================================== */

    wrapper
        .find("#add-followup")
        .off("click")
        .on("click", function () {

            open_lead_activity_form(
                frm,
                activity_table,
                true
            );

        });


    /* ========================================================
       ACTIVITY FILTER
    ======================================================== */

    wrapper
        .find(".activity-filter")
        .off("click")
        .on("click", function () {


            wrapper
                .find(".activity-filter")
                .removeClass("active");


            $(this)
                .addClass("active");


            const filter =
                $(this).attr("data-type");


            const search =
                wrapper
                    .find("#lead-activity-search")
                    .val();


            render_lead_activity_list(
                frm,
                activity_table,
                filter,
                search
            );

        });


    /* ========================================================
       SEARCH
    ======================================================== */

    wrapper
        .find("#lead-activity-search")
        .off("input")
        .on("input", function () {


            const filter =
                wrapper
                    .find(".activity-filter.active")
                    .attr("data-type");


            render_lead_activity_list(
                frm,
                activity_table,
                filter,
                $(this).val()
            );

        });


    /* ========================================================
       REVIEW FOLLOW-UPS
    ======================================================== */

    wrapper
        .find(".activity-alert-action")
        .off("click")
        .on("click", function () {


            const panel =
                wrapper.find(".activity-right");


            panel.css(
                "box-shadow",
                "0 0 0 2px rgba(80,95,88,.10)"
            );


            setTimeout(() => {

                panel.css(
                    "box-shadow",
                    "none"
                );

            }, 700);

        });


    /* ========================================================
       DONE BUTTON
       
       THIS IS THE IMPORTANT PART.

       ONLY:
           is_follow_completed = 1

       NOTHING ELSE.
       
       NO frm.save()
       NO frm.submit()
       NO is_followup CHANGE
    ======================================================== */

    wrapper
        .find(".followup-done-btn")
        .off("click")
        .on("click", function () {


            const row_name =
                $(this).attr("data-row-name");


            const row =
                (frm.doc[activity_table] || [])
                    .find(r => r.name === row_name);


            if (!row) {
                return;
            }


            /* ================================================
               ONLY CHANGE THIS FIELD
            ================================================ */

            row.is_follow_completed = 1;


            /* ================================================
               REFRESH CHILD TABLE
            ================================================ */

            frm.refresh_field(
                activity_table
            );


            /* ================================================
               RE-RENDER UI
            ================================================ */

            render_lead_activity_report(
                frm
            );


            /* ================================================
               MESSAGE
            ================================================ */

            frappe.show_alert({

                message:
                    __("Follow-up completed"),

                indicator:
                    "green"

            });

        });


    /* ========================================================
       INITIAL ACTIVITY LIST
    ======================================================== */

    render_lead_activity_list(
        frm,
        activity_table,
        "All",
        ""
    );

}


/* ============================================================
   FOLLOW-UP CARDS
============================================================ */

function render_followup_cards(
    active_followups,
    completed_followups
) {

    let html = "";


    /* ========================================================
       ACTIVE FOLLOW-UPS
    ======================================================== */

    if (active_followups.length) {


        html += `

            <div class="followup-section-title">

                Active Follow-ups

                <span>

                    ${active_followups.length}

                </span>

            </div>

        `;


        active_followups.forEach(row => {


            const followup_date =
                row.follow_up_date

                    ? frappe.datetime.str_to_user(
                        row.follow_up_date
                    )

                    : "-";


            const is_overdue =
                row.follow_up_date &&
                new Date(row.follow_up_date) <
                new Date();


            html += `

                <div
                    class="followup-card"
                    data-row-name="${frappe.utils.escape_html(
                        row.name || ""
                    )}"
                >


                    <div class="followup-card-header">


                        <div class="followup-type">

                            ${frappe.utils.escape_html(
                                row.activity_type ||
                                "Follow-up"
                            )}

                        </div>


                        <!-- ==================================
                             ACTIVE = DONE BUTTON
                        =================================== -->

                        <button
                            type="button"
                            class="followup-done-btn"
                            data-row-name="${frappe.utils.escape_html(
                                row.name || ""
                            )}"
                        >

                            ✓ Done

                        </button>

                    </div>


                    ${
                        row.subject
                            ? `

                                <div class="followup-subject">

                                    ${frappe.utils.escape_html(
                                        row.subject
                                    )}

                                </div>

                            `
                            : ""
                    }


                    ${
                        row.description
                            ? `

                                <div class="followup-description">

                                    ${frappe.utils.escape_html(
                                        row.description
                                    )}

                                </div>

                            `
                            : ""
                    }


                    <div class="followup-date">

                        ${followup_date}

                    </div>


                    ${
                        is_overdue
                            ? `

                                <div class="followup-overdue">

                                    Overdue

                                </div>

                            `
                            : ""
                    }

                </div>

            `;

        });

    }


    /* ========================================================
       COMPLETED FOLLOW-UPS
    ======================================================== */

    if (completed_followups.length) {


        html += `

            <div class="followup-section-title completed-title">

                Completed

                <span>

                    ${completed_followups.length}

                </span>

            </div>

        `;


        completed_followups.forEach(row => {


            const followup_date =
                row.follow_up_date

                    ? frappe.datetime.str_to_user(
                        row.follow_up_date
                    )

                    : "-";


            html += `

                <div
                    class="followup-card completed"
                    data-row-name="${frappe.utils.escape_html(
                        row.name || ""
                    )}"
                >


                    <div class="followup-card-header">


                        <div class="followup-type">

                            ${frappe.utils.escape_html(
                                row.activity_type ||
                                "Follow-up"
                            )}

                        </div>


                        <!-- ==================================
                             COMPLETED = BADGE
                        =================================== -->

                        <span class="completed-badge">

                            ✓ Completed

                        </span>

                    </div>


                    ${
                        row.subject
                            ? `

                                <div class="followup-subject">

                                    ${frappe.utils.escape_html(
                                        row.subject
                                    )}

                                </div>

                            `
                            : ""
                    }


                    ${
                        row.description
                            ? `

                                <div class="followup-description">

                                    ${frappe.utils.escape_html(
                                        row.description
                                    )}

                                </div>

                            `
                            : ""
                    }


                    <div class="followup-date">

                        ${followup_date}

                    </div>

                </div>

            `;

        });

    }


    /* ========================================================
       NO FOLLOW-UPS
    ======================================================== */

    if (
        !active_followups.length &&
        !completed_followups.length
    ) {


        html = `

            <div class="empty-followups">

                <div class="empty-followup-icon">

                    ✓

                </div>


                <div class="empty-followup-title">

                    No follow-ups

                </div>


                <div class="empty-followup-text">

                    Add a follow-up using the + button.

                </div>

            </div>

        `;

    }


    return html;

}


/* ============================================================
   ACTIVITY LIST
============================================================ */

function render_lead_activity_list(
    frm,
    activity_table,
    filter_type,
    search
) {

    const wrapper =
        frm.fields_dict.custom_report.$wrapper;


    const activities =
        frm.doc[activity_table] || [];


    /* ========================================================
       ONLY NORMAL ACTIVITIES
       
       Follow-up:
           is_followup = 1

       Therefore:
           don't show them here.
    ======================================================== */

    let rows =
        activities.filter(row => {

            return Number(row.is_followup) !== 1;

        });


    /* ========================================================
       FILTER
    ======================================================== */

    if (
        filter_type &&
        filter_type !== "All"
    ) {

        rows =
            rows.filter(row => {

                return (
                    row.activity_type ===
                    filter_type
                );

            });

    }


    /* ========================================================
       SEARCH
    ======================================================== */

    if (search) {


        const keyword =
            String(search).toLowerCase();


        rows =
            rows.filter(row => {


                return (

                    String(
                        row.activity_type || ""
                    )
                        .toLowerCase()
                        .includes(keyword)

                    ||

                    String(
                        row.subject || ""
                    )
                        .toLowerCase()
                        .includes(keyword)

                    ||

                    String(
                        row.description || ""
                    )
                        .toLowerCase()
                        .includes(keyword)

                );

            });

    }


    /* ========================================================
       SORT
    ======================================================== */

    rows.sort((a, b) => {

        return (
            new Date(b.activity_date || 0) -
            new Date(a.activity_date || 0)
        );

    });


    const container =
        wrapper.find(
            "#lead-activity-list"
        );


    /* ========================================================
       EMPTY
    ======================================================== */

    if (!rows.length) {


        container.html(`

            <div class="empty-activity">

                <div class="empty-icon">

                    ⌕

                </div>


                <div class="empty-title">

                    No activities found

                </div>


                <div class="empty-text">

                    Log a call, message, email,
                    meeting or visit to get started.

                </div>

            </div>

        `);


        return;

    }


    /* ========================================================
       BUILD HTML
    ======================================================== */

    let html = "";

    let current_day = "";


    rows.forEach(row => {


        const day =
            format_lead_activity_day(
                row.activity_date
            );


        if (day !== current_day) {


            current_day = day;


            html += `

                <div class="activity-date-group">

                    <div class="activity-date-label">

                        ${frappe.utils.escape_html(
                            day
                        )}

                    </div>

                </div>

            `;

        }


        html +=
            build_lead_activity_row(row);

    });


    container.html(html);

}


/* ============================================================
   BUILD ACTIVITY ROW
============================================================ */

function build_lead_activity_row(row) {


    let icon = "●";


    if (row.activity_type === "Call") {

        icon = "☎";

    }

    else if (
        row.activity_type === "Message"
    ) {

        icon = "💬";

    }

    else if (
        row.activity_type === "Email"
    ) {

        icon = "✉";

    }

    else if (
        row.activity_type === "Meeting"
    ) {

        icon = "▣";

    }

    else if (
        row.activity_type === "Visit"
    ) {

        icon = "⌖";

    }

    else if (
        row.activity_type === "Proposal"
    ) {

        icon = "▤";

    }


    const type =
        frappe.utils.escape_html(
            row.activity_type || ""
        );


    const subject =
        frappe.utils.escape_html(
            row.subject || ""
        );


    const description =
        frappe.utils.escape_html(
            row.description || ""
        );


    const time =
        row.activity_date

            ? frappe.datetime.str_to_user(
                row.activity_date
            )

            : "";


    return `

        <div class="lead-activity-item">


            <div class="lead-activity-icon">

                ${icon}

            </div>


            <div class="lead-activity-content">


                <div class="lead-activity-top">


                    <span class="lead-activity-type">

                        ${type}

                    </span>


                    <span class="lead-activity-time">

                        ${time}

                    </span>

                </div>


                ${
                    subject
                        ? `

                            <div class="lead-activity-subject">

                                ${subject}

                            </div>

                        `
                        : ""
                }


                ${
                    description
                        ? `

                            <div class="lead-activity-description">

                                ${description}

                            </div>

                        `
                        : ""
                }

            </div>

        </div>

    `;

}


/* ============================================================
   CREATE ACTIVITY / FOLLOW-UP
============================================================ */

function open_lead_activity_form(
    frm,
    activity_table,
    is_follow_up
) {


    const dialog =
        new frappe.ui.Dialog({

            title:
                is_follow_up
                    ? __("Create Follow-up")
                    : __("Log Activity"),


            fields: [


                /* ==========================================
                   ACTIVITY TYPE
                ========================================== */

                {
                    label:
                        __("Activity Type"),

                    fieldname:
                        "activity_type",

                    fieldtype:
                        "Select",

                    options:
                        [
                            "Call",
                            "Message",
                            "Email",
                            "Meeting",
                            "Visit",
                            "Proposal"
                        ].join("\n"),

                    reqd:
                        1

                },


                /* ==========================================
                   SUBJECT
                ========================================== */

               {
                    label: __("Subject"),
                    fieldname: "subject",
                    fieldtype: "Select",
                    options: [
                        "Enquiry",
                        "Presentation",
                        "Requirement Discussion",
                        "Proposal Discussion",
                        "Negotiation",
                        "Others"
                    ].join("\n")
                },


                /* ==========================================
                   DESCRIPTION
                ========================================== */

                {
                    label:
                        __("Description"),

                    fieldname:
                        "description",

                    fieldtype:
                        "Data"

                },


                /* ==========================================
                   ACTIVITY DATE
                ========================================== */

                {
                    label:
                        __("Activity Date"),

                    fieldname:
                        "activity_date",

                    fieldtype:
                        "Datetime",

                    default:
                        frappe.datetime.now_datetime()

                },


                /* ==========================================
                   FOLLOW-UP DATE
                ========================================== */

                {
                    label:
                        __("Follow Up Date"),

                    fieldname:
                        "follow_up_date",

                    fieldtype:
                        "Datetime",

                    reqd:
                        is_follow_up

                }

            ],


            primary_action_label:
                is_follow_up
                    ? __("Create Follow-up")
                    : __("Log Activity"),


            primary_action(values) {


                /* ==========================================
                   FOLLOW-UP DATE REQUIRED
                ========================================== */

                if (
                    is_follow_up &&
                    !values.follow_up_date
                ) {

                    frappe.msgprint(
                        __("Please select a Follow Up Date.")
                    );

                    return;

                }


                /* ==========================================
                   CREATE CHILD ROW
                ========================================== */

                const row =
                    frm.add_child(
                        activity_table
                    );


                row.activity_type =
                    values.activity_type;


                row.subject =
                    values.subject;


                row.description =
                    values.description;


                row.activity_date =
                    values.activity_date;


                row.follow_up_date =
                    is_follow_up
                        ? values.follow_up_date
                        : null;


                /* ==========================================
                   FOLLOW-UP FLAG
                   
                   ONLY creation identifies the row.
                ========================================== */

                row.is_followup =
                    is_follow_up
                        ? 1
                        : 0;


                /* ==========================================
                   DO NOT TOUCH:
                   
                   row.is_follow_completed
                   
                   Your DocType already has:
                       default = 0
                ========================================== */


                frm.refresh_field(
                    activity_table
                );


                /* ==========================================
                   MARK FORM DIRTY
                   
                   NO SAVE
                   NO SUBMIT
                ========================================== */

                frm.dirty();


                dialog.hide();


                /* ==========================================
                   REFRESH UI
                ========================================== */

                render_lead_activity_report(
                    frm
                );

            }

        });


    dialog.show();

}


/* ============================================================
   RELATIVE TIME
============================================================ */

function format_relative_time(
    date_value
) {


    if (!date_value) {

        return "";

    }


    const date =
        new Date(date_value);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const now =
        new Date();


    const diff =
        Math.floor(
            (
                now.getTime() -
                date.getTime()
            ) / 1000
        );


    if (diff < 60) {

        return "Just now";

    }


    if (diff < 3600) {


        const minutes =
            Math.floor(
                diff / 60
            );


        return (
            minutes +
            (
                minutes === 1
                    ? " minute ago"
                    : " minutes ago"
            )
        );

    }


    if (diff < 86400) {


        const hours =
            Math.floor(
                diff / 3600
            );


        return (
            hours +
            (
                hours === 1
                    ? " hour ago"
                    : " hours ago"
            )
        );

    }


    if (diff < 604800) {


        const days =
            Math.floor(
                diff / 86400
            );


        return (
            days +
            (
                days === 1
                    ? " day ago"
                    : " days ago"
            )
        );

    }


    return frappe.datetime.str_to_user(
        date_value
    );

}


/* ============================================================
   ACTIVITY DAY
============================================================ */

function format_lead_activity_day(
    date_value
) {


    if (!date_value) {

        return "No Date";

    }


    const date =
        new Date(date_value);


    if (
        isNaN(
            date.getTime()
        )
    ) {

        return "No Date";

    }


    const now =
        new Date();


    const today =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );


    const target =
        new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );


    const diff =
        Math.floor(
            (
                today - target
            ) / 86400000
        );


    if (diff === 0) {

        return "Today";

    }


    if (diff === 1) {

        return "Yesterday";

    }


    if (diff === -1) {

        return "Tomorrow";

    }


    return date.toLocaleDateString(
        undefined,
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}