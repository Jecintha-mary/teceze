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
function render_activity_log(frm) {
	const wrapper = frm.fields_dict.activity_log_html?.$wrapper;
	if (!wrapper) return;

	if (!frm.doc.name || frm.doc.__islocal) {
		wrapper.html(`
			<div style="padding:18px;color:#64748b;font-size:13px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
				Save the ticket to view activity history.
			</div>
		`);
		return;
	}

	const palette = {
		"Raised": { text: "#4E4780", dot: "#4E4780" },
		"FSO Assigned": { text: "#365A7E", dot: "#365A7E" },
		"In Progress": { text: "#7C5330", dot: "#7C5330" },
		"Pending SDC Validation": { text: "#2F6360", dot: "#2F6360" },
		"Rework Required": { text: "#84434F", dot: "#84434F" },
		"Pending Sign-off": { text: "#6E4673", dot: "#6E4673" },
		"Pending FSO Payment": { text: "#2F5F70", dot: "#2F5F70" },
		"Pending SDM Billing": { text: "#695A24", dot: "#695A24" },
		"Pending FSO Head Approval": { text: "#7F4A39", dot: "#7F4A39" },
		"Pending Finance": { text: "#475469", dot: "#475469" },
		"Completed": { text: "#3A6445", dot: "#3A6445" }
	};

	const fallback = { text: "#334155", dot: "#64748b" };

	const get_initials = (name) => {
		const parts = (name || "U").trim().split(/\s+/);
		return parts.length === 1
			? parts[0].slice(0, 2).toUpperCase()
			: (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	};

	const format_ts = (ts) => {
		if (!ts) return "";
		const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/);
		return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : frappe.utils.escape_html(ts);
	};

	frappe.call({
		method: "teceze.dispatch_model.doctype.ticket.ticket.get_ticket_activity_log",
		args: { ticket_name: frm.doc.name },
		callback: (r) => {
			const activities = (r.message && r.message.activities) || [];

			if (!activities.length) {
				wrapper.html(`
					<div style="padding:20px;color:#64748b;font-size:13px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
						No workflow activity recorded yet.
					</div>
				`);
				return;
			}

			const rowsHtml = activities.map((item, idx) => {
				const oldState = item.old_state || "";
				const newState = item.new_state || "";
				const theme = palette[newState] || fallback;
				const userName = item.user_name || item.user || "User";
				const initials = get_initials(userName);
				const isLast = idx === activities.length - 1;
				const isFirst = idx === 0;

				const titleHtml = oldState
					? `<span style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.4;">
						<span style="color:#64748b;font-size:13.5px;font-weight:500;">
							${frappe.utils.escape_html(oldState)}
						</span>
						<span style="color:#94a3b8;font-size:13px;font-weight:500;">→</span>
						<span style="color:${theme.text};font-size:14px;font-weight:700;">
							${frappe.utils.escape_html(newState)}
						</span>
					</span>`
					: `<span style="color:${theme.text};font-size:14px;font-weight:700;line-height:1.4;">
						${frappe.utils.escape_html(newState)}
					</span>`;

				return `
					<div style="display:grid;grid-template-columns:28px 1fr;gap:12px;position:relative;">
						<!-- Left rail & hollow status ring -->
						<div style="display:flex;flex-direction:column;align-items:center;position:relative;">
							${!isFirst ? `<div style="width:1.5px;height:14px;background:#e2e8f0;"></div>` : `<div style="height:14px;"></div>`}
							<span style="width:10px;height:10px;border-radius:50%;border:2px solid ${theme.dot};background:#ffffff;flex-shrink:0;z-index:1;"></span>
							${!isLast ? `<div style="width:1.5px;flex:1;background:#e2e8f0;min-height:48px;"></div>` : ``}
						</div>

						<!-- Right content block -->
						<div style="padding:10px 4px 16px 0;${!isLast ? "border-bottom:1px solid #f1f5f9;" : "padding-bottom:6px;"}">
							<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
								<div>${titleHtml}</div>
								<div style="font-size:12.5px;color:#64748b;white-space:nowrap;font-variant-numeric:tabular-nums;">
									${format_ts(item.creation)}
								</div>
							</div>

							<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
								<div style="display:flex;align-items:center;gap:10px;">
									<span style="width:26px;height:26px;border-radius:50%;background:#f8fafc;border:1px solid #cbd5e1;color:#475569;font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">
										${frappe.utils.escape_html(initials)}
									</span>
									<span style="font-size:13px;color:#334155;font-weight:500;">
										${frappe.utils.escape_html(userName)}
									</span>
								</div>

								<span style="font-size:12.5px;color:#15803d;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
									<span>✓</span>
									<span>Completed</span>
								</span>
							</div>
						</div>
					</div>
				`;
			}).join("");

			wrapper.html(`
				<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 18px;">
					${rowsHtml}
				</div>
			`);
		}
	});
}