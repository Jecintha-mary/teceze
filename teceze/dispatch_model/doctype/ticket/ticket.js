frappe.ui.form.on("Ticket", {
    
    setup(frm) {

        // Filter only active countries
        frm.set_query("country", function() {
            return {
                filters: {
                    custom_is_active: 1
                }
            };
        });

        frm.set_query("city", function() {

            return {
                filters: {
                    country: frm.doc.country || "",
                    is_active: 1
                }
            };

        });
        // Active Time Zone filter
        frm.set_query("filter_time_zone", function() {
            return {
                filters: {
                    is_active: 1
                }
            };
        });

        frm.set_query("act_time", function() {
            return {
                filters: {
                    is_active: 1
                }
            };
        });
        frm.set_query("client_name",function() {

            return {
                filters: {
                    disabled: 0
                }
            };

        });
        frm.set_query("project_name", function() {
            return {
                filters: {
                    project_type: "External",
                    custom_client : frm.doc.client_name,
                    status: ["not in", ["Completed", "Cancelled"]]
                }
            };
        });
    },
    client_name(frm) {
        if(!frm.doc.client_name){
            frm.set_value("project_name", "");
        }
    },
    country(frm) {

        // Clear city and timezone when country changes
        frm.set_value("city", "");
        frm.set_value("filter_time_zone", "");

    },
    city(frm) {

        if (!frm.doc.city) {
            frm.set_value("filter_time_zone", "");
            return;
        }

        // Fetch Time Zone from City Master
        frappe.db.get_value(
            "City",
            frm.doc.city,
            "time_zone"
        ).then(r => {

            if (r.message && r.message.time_zone) {

                const timezone = r.message.time_zone;
                frm.set_value("filter_time_zone", timezone);


            }

        });

    },
    refresh(frm) {
        toggle_other_tools(frm);
        if (!frm.is_new()) {
            render_activity_log(frm);
        }
    },

    tools_required(frm) {
        toggle_other_tools(frm);
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


function toggle_other_tools(frm) {
    let tools = frm.doc.tools_required || [];

    let show_other = tools.some(row => {
        return Object.values(row).includes("Others");
    });

    frm.toggle_display("others", show_other);
    frm.set_df_property("others", "reqd", show_other);

    if (!show_other) {
        frm.set_value("others", "");
    }
}
