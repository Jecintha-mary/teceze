frappe.ui.form.on("Ticket", {
    
    onload(frm) {
        load_timezone_options(frm);
    }
});
function load_timezone_options(frm) {
    
frappe.call({
    method: "frappe.core.doctype.user.user.get_timezones",

    callback(r) {
        if (!r.message?.timezones) return;

        const timezones = r.message.timezones;
        const timezone_map = {};

        const options = [];

        timezones.forEach(tz => {
            try {
                const now = new Date();

                const offset = new Intl.DateTimeFormat("en-US", {
                    timeZone: tz,
                    timeZoneName: "longOffset"
                }).formatToParts(now)
                    .find(p => p.type === "timeZoneName")
                    ?.value.replace("GMT", "UTC");

                let label;

                if (tz === "Asia/Kolkata") {
                    label = "IST (UTC+05:30)";
                } else {
                    const abbreviation = new Intl.DateTimeFormat("en-US", {
                        timeZone: tz,
                        timeZoneName: "short"
                    }).formatToParts(now)
                        .find(p => p.type === "timeZoneName")?.value;

                    label = `${abbreviation} (${offset})`;
                }

                timezone_map[label] = tz;
                options.push(label);

            } catch (e) {
                console.log("Timezone error:", tz);
            }
        });

        const unique_options = [...new Set(options)].sort();

        // Ensure IST is available
        if (!unique_options.includes("IST (UTC+05:30)")) {
            unique_options.push("IST (UTC+05:30)");
        }

        frm.set_df_property("time_zone", "options", unique_options.join("\n"));
        frm.set_df_property("activity_time_zone", "options", unique_options.join("\n"));

        // Default logged-in user's timezone
        if (frm.is_new() && !frm.doc.time_zone) {
            frappe.call({
                method: "frappe.client.get_value",
                args: {
                    doctype: "User",
                    filters: {
                        name: frappe.session.user
                    },
                    fieldname: "time_zone"
                },
                callback(res) {
                    const user_timezone = res.message?.time_zone;

                    if (user_timezone) {
                        const user_label = Object.keys(timezone_map)
                            .find(label => timezone_map[label] === user_timezone);

                        if (user_label) {
                            frm.set_value("time_zone", user_label);
                            frm.set_value("activity_time_zone", user_label);
                        }
                    }
                }
            });
        }
    }
});

}


function load_timezone_options_test(frm) {
    frappe.call({
        method: "frappe.core.doctype.user.user.get_timezones",
        callback(r) {
            if (!r.message?.timezones) return;

            const timezones = r.message.timezones.sort();

            frm.set_df_property(
                "time_zone",
                "options",
                timezones.join("\n")
            );
            frm.set_df_property(
                "activity_time_zone",
                "options",
                timezones.join("\n")
            );

            
            // Set logged-in user's timezone as default
            if (frm.is_new() && !frm.doc.time_zone) {
                frappe.call({
                    method: "frappe.client.get_value",
                    args: {
                        doctype: "User",
                        filters: {
                            name: frappe.session.user
                        },
                        fieldname: "time_zone"
                    },
                    callback(res) {
                        const user_timezone = res.message?.time_zone;

                        if (user_timezone) {
                            frm.set_value("time_zone", user_timezone);
                            frm.set_value("activity_time_zone",user_timezone);

                        }
                        
                    }
                });
            }
        }
    });
}
frappe.ui.form.on("Ticket", {
    refresh(frm) {
        if (!frm.is_new()) {
            render_activity_log(frm);
        }
    },
    onload_post_render(frm) {
        if (!frm.is_new()) {
            render_activity_log(frm);
        }
    }
});
function render_activity_log(frm) {
    const wrapper = frm.fields_dict.activity_log_html?.$wrapper;
    if (!wrapper) return;

    frappe.call({
        method: "teceze.dispatch_model.doctype.ticket.ticket.get_ticket_activity_log",
        args: { ticket_name: frm.doc.name },
        callback(r) {
            if (!r.message) return;
            const { workflow_states = [], activities = [], current_state } = r.message;
            const escape = (v) => frappe.utils.escape_html(String(v || ""));

            const visited = new Set(activities.map(a => a.new_state).filter(Boolean));
            if (current_state) visited.add(current_state);

            // 1. Workflow Stepper HTML
            let workflowHTML = "";
            workflow_states.forEach((state, i) => {
                const isCurrent = state === current_state;
                const isDone = visited.has(state) && !isCurrent;
                const lineDone = i > 0 && visited.has(state);

                workflowHTML += `
                    <div style="flex:1; text-align:center;">
                        <div style="display:flex; align-items:center;">
                            <div style="flex:1; height:2px; background:${i === 0 ? 'transparent' : (lineDone ? '#16a34a' : 'var(--border-color)')}"></div>
                            <div style="width:30px; height:30px; border-radius:50%; background:${isCurrent ? '#2563eb' : (isDone ? '#dcfce7' : 'var(--subtle-fg)')}; color:${isCurrent ? '#fff' : (isDone ? '#16a34a' : 'var(--text-muted)')}; display:flex; align-items:center; justify-content:center; margin:0 4px; font-size:13px; font-weight:600;">
                                ${isDone ? '✓' : (i + 1)}
                            </div>
                            <div style="flex:1; height:2px; background:${i === workflow_states.length - 1 ? 'transparent' : 'var(--border-color)'}"></div>
                        </div>
                        <div style="font-size:11px; font-weight:600; margin-top:6px; color:${isCurrent ? '#2563eb' : 'var(--text-color)'}">${escape(state)}</div>
                    </div>
                `;
            });

            // 2. Activity History HTML (No background fill, clean border separators)
            let activityHTML = "";
            activities.forEach((act) => {
                const user = escape(act.user_name || act.user || "System");
                const time = act.creation ? frappe.datetime.str_to_user(act.creation) : "";
                
                const oldState = act.old_state;
                const newState = act.new_state;
                const workflowTransition = (oldState && newState) 
                    ? `${escape(oldState)} &rarr; ${escape(newState)}` 
                    : (newState ? escape(newState) : "Workflow Updated");

                const isDone = newState !== current_state;

                activityHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 4px; border-bottom:1px solid var(--border-color);">
                        <div>
                            <div style="font-weight:600; font-size:13px; color:var(--heading-color); display:flex; align-items:center; gap:8px;">
                                <span>${workflowTransition}</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:4px; display:flex; gap:14px;">
                                <span>👤 ${user}</span>
                                <span>🕒 ${time}</span>
                            </div>
                        </div>
                        <span style="font-size:10px; font-weight:600; padding:3px 10px; border-radius:12px; background:${isDone ? '#dcfce7' : '#dbeafe'}; color:${isDone ? '#15803d' : '#1d4ed8'};">
                            ${isDone ? '✓ Completed' : 'In Progress'}
                        </span>
                    </div>
                `;
            });

            // 3. Render Final Component
            wrapper.html(`
                <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; padding:18px; font-family:var(--font-stack);">
                    <div style="font-weight:600; font-size:14px; margin-bottom:16px; color:var(--heading-color); display:flex; align-items:center; gap:8px;">
                        <span>📌</span> Ticket Status TimeLine
                    </div>
                    <div style="display:flex; align-items:center; margin-bottom:24px;">${workflowHTML}</div>
                    
                    <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">
                        Activity History
                    </div>
                    <div>${activityHTML || '<div style="color:var(--text-muted); padding:10px 0;">No activity recorded yet.</div>'}</div>
                </div>
            `);
        }
    });
}
