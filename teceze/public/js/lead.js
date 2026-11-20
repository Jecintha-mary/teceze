/* ============================================================
   PREMIUM LEAD ACTIVITY  (redesign, logic unchanged)
   ------------------------------------------------------------
   PARENT DOCTYPE : Lead            HTML FIELD : custom_report
   CHILD DOCTYPE  : Lead Activity
   CHILD FIELDS   : activity_type, subject, description,
                    activity_date, follow_up_date,
                    is_follow_completed, is_followup

   DONE BUTTON only sets is_follow_completed = 1
   (no is_followup change, no save, no submit)

   SIDEBAR SAFE:
   Every CSS rule below is scoped under .premium-lead-activity,
   so nothing leaks into the ERPNext sidebar, navbar or other pages.
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
    },

    country(frm) {
        if (!frm.doc.country) return;

        frappe.db.get_value("Country", frm.doc.country, "custom_phone_code").then((r) => {
            let code = r.message && r.message.custom_phone_code;
            if (!code) return;

            code = String(code).trim();
            if (!code.startsWith("+")) code = "+" + code;

            const number = (frm.doc.mobile_no || "").replace(/^\+\d+\s*/, "");
            frm.set_value("mobile_no", code + " " + number);
        });
    }
});


function hide_unwanted_create_options(frm) {
    // Wait until ERPNext finishes creating its buttons
    setTimeout(() => {
        frm.page.remove_inner_button("Customer", "Create");
        frm.page.remove_inner_button("Prospect", "Create");
        frm.remove_custom_button("Add to Prospect", "Action");
    }, 100);
}


/* ============================================================
   FIND LEAD ACTIVITY CHILD TABLE
============================================================ */

function get_activity_table_field(frm) {
    const fields = frm.meta.fields || [];
    const table_field = fields.find(field =>
        field.fieldtype === "Table" && field.options === "Lead Activity"
    );
    return table_field ? table_field.fieldname : null;
}


/* ============================================================
   SVG ICONS (replace emoji / text glyphs)
============================================================ */

function pla_icon(name, size) {
    size = size || 16;
    const p = {
        Call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
        Message: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.6A8 8 0 1 1 21 12z"/>',
        Email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/>',
        Meeting: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
        Visit: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        Proposal: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
        Default: '<circle cx="12" cy="12" r="4"/>',
        Check: '<path d="M5 12l5 5 9-10"/>',
        Plus: '<path d="M12 5v14M5 12h14"/>',
        Alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
        Search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
        Bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
        Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.Default}</svg>`;
}


/* ============================================================
   MAIN REPORT
============================================================ */

function render_lead_activity_report(frm) {

    const html_field = frm.fields_dict.custom_report;
    if (!html_field) return;

    const activity_table = get_activity_table_field(frm);

    if (!activity_table) {
        html_field.$wrapper.html(`
            <div style="padding:40px;text-align:center;color:#888;">
                Lead Activity table not found.
            </div>
        `);
        return;
    }

    const activities = frm.doc[activity_table] || [];
    const wrapper = html_field.$wrapper;

    /* NORMAL ACTIVITIES */
    const normal_activities = activities
        .filter(row => Number(row.is_followup) !== 1)
        .sort((a, b) => new Date(b.activity_date || 0) - new Date(a.activity_date || 0));

    /* ACTIVE FOLLOW-UPS */
    const active_followups = activities
        .filter(row => Number(row.is_followup) === 1 && Number(row.is_follow_completed) !== 1)
        .sort((a, b) => new Date(a.follow_up_date || 0) - new Date(b.follow_up_date || 0));

    /* COMPLETED FOLLOW-UPS */
    const completed_followups = activities
        .filter(row => Number(row.is_followup) === 1 && Number(row.is_follow_completed) === 1)
        .sort((a, b) => new Date(b.follow_up_date || 0) - new Date(a.follow_up_date || 0));

    const now = new Date();

    const overdue_followups = active_followups.filter(row =>
        row.follow_up_date && new Date(row.follow_up_date) < now
    );

    const upcoming_followups = active_followups.filter(row =>
        row.follow_up_date && new Date(row.follow_up_date) >= now
    );

    /* LAST ACTIVITY */
    const last_activity = normal_activities[0];
    const last_activity_type = last_activity?.activity_type || "No activity";
    const last_activity_time = last_activity?.activity_date
        ? format_relative_time(last_activity.activity_date)
        : "";

    /* LEAD DETAILS */
    const lead_status = frm.doc.status || "New";
    const lead_owner = frm.doc.lead_owner || frm.doc.owner || "Administrator";

    wrapper.html(`

<style>
/* ============================================================
   PREMIUM LEAD ACTIVITY : SCOPED STYLES
   Everything lives under .premium-lead-activity
============================================================ */

.premium-lead-activity {
    --pla-ink: #0B1F2A;
    --pla-mute: #5C6F7A;
    --pla-soft: #8593A0;
    --pla-line: #E8E4DA;
    --pla-line-soft: #F0EDE4;
    --pla-surface: #FFFFFF;
    --pla-tint: #FBFAF6;
    --pla-teal: #0F766E;
    --pla-grad: linear-gradient(135deg, #14B8A6 0%, #0F766E 45%, #2A3D8F 100%);
    --pla-shadow: 0 1px 2px rgba(11,31,42,.04), 0 12px 32px rgba(11,31,42,.06);

    width: 100%;
    box-sizing: border-box;
    padding: 8px 2px 32px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    color: var(--pla-ink);
    letter-spacing: -0.01em;
}
.premium-lead-activity *,
.premium-lead-activity *::before,
.premium-lead-activity *::after { box-sizing: border-box; }

.premium-lead-activity button { font-family: inherit; }

/* ---------- HEADER ---------- */
.premium-lead-activity .activity-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 22px;
}
.premium-lead-activity .activity-title {
    display: flex; align-items: center; gap: 12px;
    font-family: Fraunces, Georgia, "Times New Roman", serif;
    font-size: 30px; font-weight: 600; letter-spacing: -0.02em; color: var(--pla-ink);
}
.premium-lead-activity .activity-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 28px; height: 28px; padding: 0 9px;
    border: 1px solid var(--pla-line); border-radius: 999px;
    background: var(--pla-surface); color: var(--pla-ink);
    font-family: Inter, sans-serif; font-size: 12px; font-weight: 700;
}

/* ---------- BUTTONS ---------- */
.premium-lead-activity .lead-log-activity-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 44px; padding: 0 22px; border: 0; border-radius: 12px;
    background: var(--pla-grad); color: #fff;
    font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap;
    box-shadow: 0 10px 24px rgba(15,118,110,.30);
    transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
}
.premium-lead-activity .lead-log-activity-btn:hover {
    transform: translateY(-1px); filter: brightness(.92);
    box-shadow: 0 14px 30px rgba(15,118,110,.38);
}
.premium-lead-activity .lead-log-activity-btn:active { transform: translateY(0); }

/* ---------- OVERDUE ALERT ---------- */
.premium-lead-activity .activity-alert {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 54px; margin-bottom: 18px; padding: 0 18px;
    border: 1px solid #F1D5C7; border-radius: 14px;
    background: linear-gradient(100deg, #FFF7F2 0%, #FFFBF8 100%);
}
.premium-lead-activity .activity-alert-left {
    display: flex; align-items: center; gap: 10px;
    color: #9A4F36; font-size: 13px; font-weight: 550;
}
.premium-lead-activity .activity-alert-left strong { color: #7A3622; font-weight: 750; }
.premium-lead-activity .activity-alert-action {
    height: 34px; padding: 0 14px; border: 1px solid #E9C4B5; border-radius: 9px;
    background: #fff; color: #8A4631; font-size: 12px; font-weight: 650; cursor: pointer;
    transition: background .18s ease, border-color .18s ease;
}
.premium-lead-activity .activity-alert-action:hover { background: #FFF1EA; border-color: #D9A894; }

/* ---------- SUMMARY ---------- */
.premium-lead-activity .activity-summary {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 20px; overflow: hidden;
    border: 1px solid var(--pla-line); border-radius: 18px;
    background: var(--pla-surface); box-shadow: var(--pla-shadow);
}
.premium-lead-activity .summary-card {
    position: relative; min-height: 100px; padding: 20px 22px 18px 24px;
    border-right: 1px solid var(--pla-line-soft); background: var(--pla-surface);
}
.premium-lead-activity .summary-card:nth-child(4) { border-right: 0; }
.premium-lead-activity .summary-card::before {
    content: ""; position: absolute; left: 0; top: 16px; bottom: 16px; width: 3px;
    border-radius: 0 3px 3px 0;
}
.premium-lead-activity .summary-card:nth-child(1)::before { background: linear-gradient(180deg, #7C6CF2, #4FA9FF); }
.premium-lead-activity .summary-card:nth-child(2)::before { background: linear-gradient(180deg, #14B8A6, #5CDB9E); }
.premium-lead-activity .summary-card:nth-child(3)::before { background: linear-gradient(180deg, #FF9B72, #FFCA74); }
.premium-lead-activity .summary-card:nth-child(4)::before { background: linear-gradient(180deg, #4FA9FF, #806DF0); }

.premium-lead-activity .summary-label {
    margin-bottom: 12px; color: var(--pla-mute);
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em;
}
.premium-lead-activity .summary-value {
    color: var(--pla-ink); font-size: 15px; font-weight: 650;
    letter-spacing: -0.015em; word-break: break-word;
}
.premium-lead-activity .summary-sub { margin-top: 4px; color: var(--pla-soft); font-size: 12px; }

.premium-lead-activity .summary-pill {
    display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px;
    border: 1px solid #DDD8F7; border-radius: 999px;
    background: #ECE8FA; color: #4C3A9A; font-size: 12px; font-weight: 700;
}
.premium-lead-activity .summary-pill::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%; background: #6D5BD0;
}

/* completeness */
.premium-lead-activity .activity-completeness {
    grid-column: 1 / -1; padding: 14px 24px 18px;
    border-top: 1px solid var(--pla-line-soft); background: var(--pla-tint);
}
.premium-lead-activity .completeness-top {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
}
.premium-lead-activity .completeness-label {
    color: var(--pla-mute); font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .12em;
}
.premium-lead-activity .completeness-value { color: var(--pla-mute); font-size: 12px; font-weight: 600; }
.premium-lead-activity .completeness-bar {
    height: 6px; overflow: hidden; border-radius: 999px; background: #E8E4DA;
}
.premium-lead-activity .completeness-progress {
    width: ${activities.length ? "70%" : "0%"}; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #6D5BD0 0%, #4E9CFF 52%, #14B8A6 100%);
}

/* ---------- MAIN GRID ---------- */
.premium-lead-activity .activity-main {
    display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px;
    height: 640px; min-height: 520px; align-items: stretch;
}
.premium-lead-activity .activity-left,
.premium-lead-activity .activity-right {
    min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
    border: 1px solid var(--pla-line); border-radius: 18px;
    background: var(--pla-surface); box-shadow: var(--pla-shadow);
}

/* ---------- TOOLBAR (static) ---------- */
.premium-lead-activity .activity-left-header {
    flex: 0 0 auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 14px 16px; border-bottom: 1px solid var(--pla-line-soft);
    background: var(--pla-surface); position: relative; z-index: 20;
}
.premium-lead-activity .activity-filter {
    height: 34px; padding: 0 14px; border: 0; border-radius: 999px;
    background: transparent; color: #4A5D68; font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background .18s ease, color .18s ease;
}
.premium-lead-activity .activity-filter:hover { background: #F1EEE5; color: var(--pla-ink); }
.premium-lead-activity .activity-filter.active {
    background: var(--pla-ink); color: #fff; box-shadow: 0 6px 14px rgba(11,31,42,.22);
}
.premium-lead-activity .activity-search {
    margin-left: auto; width: 200px; height: 38px; padding: 0 14px;
    border: 1px solid var(--pla-line); border-radius: 11px; outline: none;
    background: var(--pla-tint); color: var(--pla-ink); font-family: inherit; font-size: 12px;
    transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.premium-lead-activity .activity-search::placeholder { color: #8E9AA4; }
.premium-lead-activity .activity-search:focus {
    border-color: #14B8A6; background: #fff; box-shadow: 0 0 0 3px rgba(20,184,166,.14);
}

/* ---------- SCROLL AREAS ---------- */
.premium-lead-activity #lead-activity-list,
.premium-lead-activity #lead-followups-list {
    flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
    overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #D6D1C3 transparent;
}
.premium-lead-activity #lead-activity-list { padding: 0 22px 26px; }
.premium-lead-activity #lead-followups-list { padding: 0 0 22px; }
.premium-lead-activity #lead-activity-list::-webkit-scrollbar,
.premium-lead-activity #lead-followups-list::-webkit-scrollbar { width: 6px; }
.premium-lead-activity #lead-activity-list::-webkit-scrollbar-thumb,
.premium-lead-activity #lead-followups-list::-webkit-scrollbar-thumb {
    background: #D6D1C3; border-radius: 999px;
}

/* ---------- TIMELINE ---------- */
.premium-lead-activity .activity-date-label {
    display: flex; align-items: center; height: 46px; border-bottom: 1px solid var(--pla-line-soft);
    color: var(--pla-mute); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em;
}
.premium-lead-activity .lead-activity-item { position: relative; display: flex; gap: 16px; padding: 18px 0 6px; }
.premium-lead-activity .lead-activity-item:not(:last-child)::after {
    content: ""; position: absolute; left: 20px; top: 62px; bottom: -12px; width: 2px; background: var(--pla-line-soft);
}
.premium-lead-activity .lead-activity-icon {
    position: relative; z-index: 2; display: flex; align-items: center; justify-content: center;
    width: 42px; height: 42px; min-width: 42px; border-radius: 13px;
    background: #DDF4F0; color: var(--pla-teal);
}
.premium-lead-activity .lead-activity-item.t-Message .lead-activity-icon { background: #ECE8FA; color: #4C3A9A; }
.premium-lead-activity .lead-activity-item.t-Call .lead-activity-icon { background: #FDEBDD; color: #A5531D; }
.premium-lead-activity .lead-activity-item.t-Meeting .lead-activity-icon { background: #E2EEFC; color: #1F5FA8; }
.premium-lead-activity .lead-activity-item.t-Visit .lead-activity-icon { background: #E6F4DF; color: #3D7A22; }
.premium-lead-activity .lead-activity-item.t-Proposal .lead-activity-icon { background: #F6E6EF; color: #9A2F69; }

.premium-lead-activity .lead-activity-content {
    flex: 1; min-width: 0; margin-bottom: 14px; padding: 14px 18px;
    border: 1px solid var(--pla-line-soft); border-radius: 14px; background: var(--pla-tint);
}
.premium-lead-activity .lead-activity-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.premium-lead-activity .lead-activity-type { color: var(--pla-ink); font-size: 14px; font-weight: 700; }
.premium-lead-activity .lead-activity-time { color: var(--pla-mute); font-size: 12px; font-weight: 500; }
.premium-lead-activity .lead-activity-subject {
    margin-top: 6px; font-family: Fraunces, Georgia, serif; font-size: 18px; font-weight: 600;
    letter-spacing: -0.01em; color: var(--pla-ink);
}
.premium-lead-activity .lead-activity-description {
    max-width: 720px; margin-top: 6px; color: var(--pla-mute);
    font-size: 13px; line-height: 1.6; white-space: pre-wrap;
}

/* ---------- FOLLOW-UP PANEL ---------- */
.premium-lead-activity .followup-header {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
    height: 66px; min-height: 66px; padding: 0 18px;
    border-bottom: 1px solid var(--pla-line-soft); background: var(--pla-surface);
    position: relative; z-index: 20;
}
.premium-lead-activity .followup-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; }
.premium-lead-activity .followup-title > span:first-child {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 10px; background: #DDF4F0; color: var(--pla-teal);
}
.premium-lead-activity .followup-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px;
    background: #F1EEE5; color: var(--pla-mute); font-size: 11px; font-weight: 700;
}
.premium-lead-activity .followup-add {
    width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 0; border-radius: 11px; background: var(--pla-ink); color: #fff; cursor: pointer;
    box-shadow: 0 8px 18px rgba(11,31,42,.25);
    transition: transform .18s ease, background .18s ease;
}
.premium-lead-activity .followup-add:hover { transform: translateY(-1px); background: var(--pla-teal); }

.premium-lead-activity .followup-section-title {
    display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 10px;
    color: var(--pla-mute); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em;
}
.premium-lead-activity .followup-section-title span {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px;
    background: #F1EEE5; color: var(--pla-mute); font-size: 11px;
}

.premium-lead-activity .followup-card {
    position: relative; margin: 0 14px 12px; padding: 16px 16px 14px;
    border: 1px solid var(--pla-line); border-left: 4px solid #E1A84B; border-radius: 14px;
    background: var(--pla-surface); box-shadow: 0 2px 8px rgba(11,31,42,.04);
    transition: transform .18s ease, box-shadow .18s ease;
}
.premium-lead-activity .followup-card:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(11,31,42,.09); }
.premium-lead-activity .followup-card.completed { border-left-color: #2FA57A; background: #F7FCFA; }

.premium-lead-activity .followup-card-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.premium-lead-activity .followup-type {
    display: inline-flex; align-items: center; height: 24px; padding: 0 10px;
    border-radius: 7px; background: #F1EEE5; color: #4A5D68;
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
}
.premium-lead-activity .followup-subject { margin-top: 12px; font-size: 14px; font-weight: 700; line-height: 1.4; color: var(--pla-ink); }
.premium-lead-activity .followup-description { margin-top: 5px; color: var(--pla-mute); font-size: 12px; line-height: 1.6; }
.premium-lead-activity .followup-date {
    display: flex; align-items: center; gap: 6px; margin-top: 12px;
    color: var(--pla-mute); font-size: 12px; font-weight: 600;
}
.premium-lead-activity .followup-overdue {
    display: inline-flex; align-items: center; margin-top: 10px; padding: 4px 10px;
    border: 1px solid #F1D5C7; border-radius: 7px; background: #FFF4EE;
    color: #9A4F36; font-size: 11px; font-weight: 750;
}

/* Done button */
.premium-lead-activity .followup-done-btn {
    appearance: none; -webkit-appearance: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 32px; min-width: 76px; padding: 0 12px;
    border: 1px solid #BDE2D0; border-radius: 9px;
    background: #EAF8F1; color: #1C7A52;
    font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
    transition: transform .18s ease, background .18s ease, color .18s ease, border-color .18s ease;
}
.premium-lead-activity .followup-done-btn:hover {
    transform: translateY(-1px); background: #1C7A52; border-color: #1C7A52; color: #fff;
}
.premium-lead-activity .followup-done-btn:active { transform: translateY(0); }

.premium-lead-activity .completed-badge {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px;
    border: 1px solid #BFE4D0; border-radius: 9px; background: #E7F8EF;
    color: #1C7A52; font-size: 12px; font-weight: 700; white-space: nowrap;
}

/* ---------- EMPTY STATES ---------- */
.premium-lead-activity .empty-activity,
.premium-lead-activity .empty-followups { text-align: center; }
.premium-lead-activity .empty-activity { padding: 80px 20px; }
.premium-lead-activity .empty-followups { padding: 64px 18px; }
.premium-lead-activity .empty-icon,
.premium-lead-activity .empty-followup-icon {
    margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;
    width: 56px; height: 56px; border-radius: 18px; background: #DDF4F0; color: var(--pla-teal);
}
.premium-lead-activity .empty-title,
.premium-lead-activity .empty-followup-title { color: var(--pla-ink); font-size: 14px; font-weight: 700; }
.premium-lead-activity .empty-text,
.premium-lead-activity .empty-followup-text {
    max-width: 280px; margin: 6px auto 0; color: var(--pla-mute); font-size: 12px; line-height: 1.6;
}

/* ---------- FOCUS ---------- */
.premium-lead-activity .activity-filter:focus-visible,
.premium-lead-activity .lead-log-activity-btn:focus-visible,
.premium-lead-activity .activity-alert-action:focus-visible,
.premium-lead-activity .followup-add:focus-visible,
.premium-lead-activity .followup-done-btn:focus-visible {
    outline: none; box-shadow: 0 0 0 3px rgba(20,184,166,.28);
}

/* ---------- RESPONSIVE ---------- */
@media (max-width: 1150px) {
    .premium-lead-activity .activity-main { grid-template-columns: minmax(0, 1fr) 300px; }
    .premium-lead-activity .activity-search { width: 160px; }
}
@media (max-width: 950px) {
    .premium-lead-activity .activity-main { grid-template-columns: 1fr; height: auto; min-height: 0; }
    .premium-lead-activity .activity-left { height: 560px; }
    .premium-lead-activity .activity-right { height: 480px; }
}
@media (max-width: 700px) {
    .premium-lead-activity .activity-summary { grid-template-columns: 1fr 1fr; }
    .premium-lead-activity .summary-card:nth-child(2) { border-right: 0; }
    .premium-lead-activity .summary-card:nth-child(1),
    .premium-lead-activity .summary-card:nth-child(2) { border-bottom: 1px solid var(--pla-line-soft); }
    .premium-lead-activity .activity-search { width: 100%; margin-left: 0; order: 10; }
    .premium-lead-activity .activity-title { font-size: 24px; }
}
@media (max-width: 480px) {
    .premium-lead-activity .activity-header { flex-direction: column; align-items: stretch; gap: 14px; }
    .premium-lead-activity .lead-log-activity-btn { width: 100%; }
    .premium-lead-activity .activity-summary { grid-template-columns: 1fr; }
    .premium-lead-activity .summary-card { border-right: 0 !important; border-bottom: 1px solid var(--pla-line-soft); }
    .premium-lead-activity .activity-left { height: 500px; }
    .premium-lead-activity .activity-right { height: 450px; }
}
@media (prefers-reduced-motion: reduce) {
    .premium-lead-activity * { transition: none !important; }
}
</style>

        <div class="premium-lead-activity">

            <!-- HEADER -->
            <div class="activity-header">
                <div class="activity-title">
                    Activity
                    <span class="activity-count">${activities.length}</span>
                </div>

                <button type="button" id="lead-log-activity" class="lead-log-activity-btn">
                    ${pla_icon("Plus", 16)}
                    Log activity
                </button>
            </div>

            <!-- OVERDUE ALERT -->
            ${
                overdue_followups.length
                    ? `
                        <div class="activity-alert">
                            <div class="activity-alert-left">
                                ${pla_icon("Alert", 18)}
                                <span>
                                    <strong>${overdue_followups.length}</strong>
                                    ${overdue_followups.length === 1
                                        ? " follow-up is overdue."
                                        : " follow-ups are overdue."}
                                </span>
                            </div>
                            <button type="button" class="activity-alert-action">
                                Review follow-ups
                            </button>
                        </div>
                    `
                    : ""
            }

            <!-- SUMMARY -->
            <div class="activity-summary">

                <div class="summary-card">
                    <div class="summary-label">Qualification</div>
                    <span class="summary-pill">${frappe.utils.escape_html(lead_status)}</span>
                </div>

                <div class="summary-card">
                    <div class="summary-label">Lead Owner</div>
                    <div class="summary-value">${frappe.utils.escape_html(lead_owner)}</div>
                </div>

                <div class="summary-card">
                    <div class="summary-label">Last Activity</div>
                    <div class="summary-value">${frappe.utils.escape_html(last_activity_type)}</div>
                    ${last_activity_time ? `<div class="summary-sub">${last_activity_time}</div>` : ""}
                </div>

                <div class="summary-card">
                    <div class="summary-label">Next Follow-up</div>
                    <div class="summary-value">
                        ${
                            upcoming_followups.length
                                ? frappe.datetime.str_to_user(upcoming_followups[0].follow_up_date)
                                : "None"
                        }
                    </div>
                </div>

                <div class="activity-completeness">
                    <div class="completeness-top">
                        <span class="completeness-label">Activity Completeness</span>
                        <span class="completeness-value">
                            ${activities.length} ${activities.length === 1 ? "activity" : "activities"}
                        </span>
                    </div>
                    <div class="completeness-bar">
                        <div class="completeness-progress"></div>
                    </div>
                </div>
            </div>

            <!-- MAIN -->
            <div class="activity-main">

                <!-- LEFT -->
                <div class="activity-left">

                    <div class="activity-left-header">
                        <button type="button" class="activity-filter active" data-type="All">All</button>
                        <button type="button" class="activity-filter" data-type="Call">Calls</button>
                        <button type="button" class="activity-filter" data-type="Message">Messages</button>
                        <button type="button" class="activity-filter" data-type="Email">Emails</button>
                        <button type="button" class="activity-filter" data-type="Meeting">Meetings</button>
                        <button type="button" class="activity-filter" data-type="Visit">Visits</button>
                        <button type="button" class="activity-filter" data-type="Proposal">Proposals</button>

                        <input
                            type="text"
                            id="lead-activity-search"
                            class="activity-search"
                            placeholder="Search activity..."
                            aria-label="Search activity"
                        >
                    </div>

                    <div id="lead-activity-list"></div>
                </div>

                <!-- RIGHT -->
                <div class="activity-right">

                    <div class="followup-header">
                        <div class="followup-title">
                            <span>${pla_icon("Bell", 17)}</span>
                            Follow-ups
                            <span class="followup-count">
                                ${active_followups.length + completed_followups.length}
                            </span>
                        </div>

                        <button type="button" id="add-followup" class="followup-add" aria-label="Add follow-up">
                            ${pla_icon("Plus", 18)}
                        </button>
                    </div>

                    <div id="lead-followups-list">
                        ${render_followup_cards(active_followups, completed_followups)}
                    </div>
                </div>
            </div>
        </div>

    `);


    /* LOG ACTIVITY BUTTON */
    wrapper
        .find("#lead-log-activity")
        .off("click")
        .on("click", function () {
            open_lead_activity_form(frm, activity_table, false);
        });


    /* ADD FOLLOW-UP BUTTON */
    wrapper
        .find("#add-followup")
        .off("click")
        .on("click", function () {
            open_lead_activity_form(frm, activity_table, true);
        });


    /* ACTIVITY FILTER */
    wrapper
        .find(".activity-filter")
        .off("click")
        .on("click", function () {

            wrapper.find(".activity-filter").removeClass("active");
            $(this).addClass("active");

            const filter = $(this).attr("data-type");
            const search = wrapper.find("#lead-activity-search").val();

            render_lead_activity_list(frm, activity_table, filter, search);
        });


    /* SEARCH */
    wrapper
        .find("#lead-activity-search")
        .off("input")
        .on("input", function () {

            const filter = wrapper.find(".activity-filter.active").attr("data-type");

            render_lead_activity_list(frm, activity_table, filter, $(this).val());
        });


    /* REVIEW FOLLOW-UPS */
    wrapper
        .find(".activity-alert-action")
        .off("click")
        .on("click", function () {

            const panel = wrapper.find(".activity-right");

            panel.css("box-shadow", "0 0 0 3px rgba(20,184,166,.28)");

            setTimeout(() => {
                panel.css("box-shadow", "");
            }, 700);
        });


    /* ========================================================
       DONE BUTTON
       ONLY: is_follow_completed = 1
       NO frm.save(), NO frm.submit(), NO is_followup change
    ======================================================== */
    wrapper
        .find(".followup-done-btn")
        .off("click")
        .on("click", function () {

            const row_name = $(this).attr("data-row-name");

            const row = (frm.doc[activity_table] || [])
                .find(r => r.name === row_name);

            if (!row) return;

            row.is_follow_completed = 1;

            frm.refresh_field(activity_table);

            render_lead_activity_report(frm);

            frappe.show_alert({
                message: __("Follow-up completed"),
                indicator: "green"
            });
        });


    /* INITIAL ACTIVITY LIST */
    render_lead_activity_list(frm, activity_table, "All", "");
}


/* ============================================================
   FOLLOW-UP CARDS
============================================================ */

function render_followup_cards(active_followups, completed_followups) {

    let html = "";

    /* ACTIVE FOLLOW-UPS */
    if (active_followups.length) {

        html += `
            <div class="followup-section-title">
                Active Follow-ups
                <span>${active_followups.length}</span>
            </div>
        `;

        active_followups.forEach(row => {

            const followup_date = row.follow_up_date
                ? frappe.datetime.str_to_user(row.follow_up_date)
                : "-";

            const is_overdue = row.follow_up_date && new Date(row.follow_up_date) < new Date();

            html += `
                <div class="followup-card" data-row-name="${frappe.utils.escape_html(row.name || "")}">

                    <div class="followup-card-header">
                        <div class="followup-type">
                            ${frappe.utils.escape_html(row.activity_type || "Follow-up")}
                        </div>

                        <button
                            type="button"
                            class="followup-done-btn"
                            data-row-name="${frappe.utils.escape_html(row.name || "")}">
                            ${pla_icon("Check", 14)} Done
                        </button>
                    </div>

                    ${row.subject
                        ? `<div class="followup-subject">${frappe.utils.escape_html(row.subject)}</div>`
                        : ""}

                    ${row.description
                        ? `<div class="followup-description">${frappe.utils.escape_html(row.description)}</div>`
                        : ""}

                    <div class="followup-date">
                        ${pla_icon("Clock", 14)} ${followup_date}
                    </div>

                    ${is_overdue ? `<div class="followup-overdue">Overdue</div>` : ""}
                </div>
            `;
        });
    }

    /* COMPLETED FOLLOW-UPS */
    if (completed_followups.length) {

        html += `
            <div class="followup-section-title completed-title">
                Completed
                <span>${completed_followups.length}</span>
            </div>
        `;

        completed_followups.forEach(row => {

            const followup_date = row.follow_up_date
                ? frappe.datetime.str_to_user(row.follow_up_date)
                : "-";

            html += `
                <div class="followup-card completed" data-row-name="${frappe.utils.escape_html(row.name || "")}">

                    <div class="followup-card-header">
                        <div class="followup-type">
                            ${frappe.utils.escape_html(row.activity_type || "Follow-up")}
                        </div>

                        <span class="completed-badge">
                            ${pla_icon("Check", 14)} Completed
                        </span>
                    </div>

                    ${row.subject
                        ? `<div class="followup-subject">${frappe.utils.escape_html(row.subject)}</div>`
                        : ""}

                    ${row.description
                        ? `<div class="followup-description">${frappe.utils.escape_html(row.description)}</div>`
                        : ""}

                    <div class="followup-date">
                        ${pla_icon("Clock", 14)} ${followup_date}
                    </div>
                </div>
            `;
        });
    }

    /* NO FOLLOW-UPS */
    if (!active_followups.length && !completed_followups.length) {

        html = `
            <div class="empty-followups">
                <div class="empty-followup-icon">${pla_icon("Check", 24)}</div>
                <div class="empty-followup-title">No follow-ups</div>
                <div class="empty-followup-text">Add a follow-up using the + button.</div>
            </div>
        `;
    }

    return html;
}


/* ============================================================
   ACTIVITY LIST
============================================================ */

function render_lead_activity_list(frm, activity_table, filter_type, search) {

    const wrapper = frm.fields_dict.custom_report.$wrapper;
    const activities = frm.doc[activity_table] || [];

    /* ONLY NORMAL ACTIVITIES (is_followup = 1 rows are not shown here) */
    let rows = activities.filter(row => Number(row.is_followup) !== 1);

    /* FILTER */
    if (filter_type && filter_type !== "All") {
        rows = rows.filter(row => row.activity_type === filter_type);
    }

    /* SEARCH */
    if (search) {

        const keyword = String(search).toLowerCase();

        rows = rows.filter(row =>
            String(row.activity_type || "").toLowerCase().includes(keyword) ||
            String(row.subject || "").toLowerCase().includes(keyword) ||
            String(row.description || "").toLowerCase().includes(keyword)
        );
    }

    /* SORT */
    rows.sort((a, b) => new Date(b.activity_date || 0) - new Date(a.activity_date || 0));

    const container = wrapper.find("#lead-activity-list");

    /* EMPTY */
    if (!rows.length) {

        container.html(`
            <div class="empty-activity">
                <div class="empty-icon">${pla_icon("Search", 24)}</div>
                <div class="empty-title">No activities found</div>
                <div class="empty-text">
                    Log a call, message, email, meeting or visit to get started.
                </div>
            </div>
        `);

        return;
    }

    /* BUILD HTML */
    let html = "";
    let current_day = "";

    rows.forEach(row => {

        const day = format_lead_activity_day(row.activity_date);

        if (day !== current_day) {

            current_day = day;

            html += `
                <div class="activity-date-group">
                    <div class="activity-date-label">
                        ${frappe.utils.escape_html(day)}
                    </div>
                </div>
            `;
        }

        html += build_lead_activity_row(row);
    });

    container.html(html);
}


/* ============================================================
   BUILD ACTIVITY ROW
============================================================ */

function build_lead_activity_row(row) {

    const raw_type = row.activity_type || "";

    const type = frappe.utils.escape_html(raw_type);
    const subject = frappe.utils.escape_html(row.subject || "");
    const description = frappe.utils.escape_html(row.description || "");
    const time = row.activity_date ? frappe.datetime.str_to_user(row.activity_date) : "";

    const type_class = /^[A-Za-z]+$/.test(raw_type) ? "t-" + raw_type : "";

    return `
        <div class="lead-activity-item ${type_class}">

            <div class="lead-activity-icon">
                ${pla_icon(raw_type, 19)}
            </div>

            <div class="lead-activity-content">

                <div class="lead-activity-top">
                    <span class="lead-activity-type">${type}</span>
                    <span class="lead-activity-time">${time}</span>
                </div>

                ${subject ? `<div class="lead-activity-subject">${subject}</div>` : ""}

                ${description ? `<div class="lead-activity-description">${description}</div>` : ""}

            </div>
        </div>
    `;
}


/* ============================================================
   CREATE ACTIVITY / FOLLOW-UP
============================================================ */

function open_lead_activity_form(frm, activity_table, is_follow_up) {

    const dialog = new frappe.ui.Dialog({

        title: is_follow_up ? __("Create Follow-up") : __("Log Activity"),

        fields: [

            {
                label: __("Activity Type"),
                fieldname: "activity_type",
                fieldtype: "Select",
                options: ["Call", "Message", "Email", "Meeting", "Visit", "Proposal"].join("\n"),
                reqd: 1
            },

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

            {
                label: __("Description"),
                fieldname: "description",
                fieldtype: "Data"
            },

            {
                label: __("Activity Date"),
                fieldname: "activity_date",
                fieldtype: "Datetime",
                default: frappe.datetime.now_datetime()
            },

            {
                label: __("Follow Up Date"),
                fieldname: "follow_up_date",
                fieldtype: "Datetime",
                reqd: is_follow_up,
                default: frappe.datetime.now_datetime(),
                onchange: function () {
                    const value = this.get_value();
                    const now = frappe.datetime.now_datetime();

                    if (value && value < now) {
                        frappe.msgprint(__("Follow-up date cannot be in the past."));
                        this.set_value(now);
                    }
                }
            }
        ],

        primary_action_label: is_follow_up ? __("Create Follow-up") : __("Log Activity"),

        primary_action(values) {

            /* FOLLOW-UP DATE REQUIRED */
            if (is_follow_up && !values.follow_up_date) {
                frappe.msgprint(__("Please select a Follow Up Date."));
                return;
            }

            if (is_follow_up && values.follow_up_date) {
                const selectedDate = values.follow_up_date;
                const currentDate = frappe.datetime.now_datetime();

                if (selectedDate < currentDate) {
                    frappe.msgprint(__("Follow-up date cannot be in the past."));
                    return;
                }
            }

            /* CREATE CHILD ROW */
            const row = frm.add_child(activity_table);

            row.activity_type = values.activity_type;
            row.subject = values.subject;
            row.description = values.description;
            row.activity_date = values.activity_date;
            row.follow_up_date = is_follow_up ? values.follow_up_date : null;

            /* FOLLOW-UP FLAG (only creation identifies the row) */
            row.is_followup = is_follow_up ? 1 : 0;

            /* is_follow_completed is NOT touched (DocType default = 0) */

            frm.refresh_field(activity_table);

            /* MARK FORM DIRTY (no save, no submit) */
            frm.dirty();

            dialog.hide();

            render_lead_activity_report(frm);
        }
    });

    dialog.show();
}


/* ============================================================
   RELATIVE TIME
============================================================ */

function format_relative_time(date_value) {

    if (!date_value) return "";

    const date = new Date(date_value);

    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "Just now";

    if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
    }

    if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return hours + (hours === 1 ? " hour ago" : " hours ago");
    }

    if (diff < 604800) {
        const days = Math.floor(diff / 86400);
        return days + (days === 1 ? " day ago" : " days ago");
    }

    return frappe.datetime.str_to_user(date_value);
}


/* ============================================================
   ACTIVITY DAY
============================================================ */

function format_lead_activity_day(date_value) {

    if (!date_value) return "No Date";

    const date = new Date(date_value);

    if (isNaN(date.getTime())) return "No Date";

    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diff = Math.floor((today - target) / 86400000);

    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff === -1) return "Tomorrow";

    return date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}