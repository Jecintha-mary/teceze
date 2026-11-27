const PARENT = "Engineer Onboarding";
const TABLE = "bank_details";
const load_meta = (dt) => new Promise((resolve) => frappe.model.with_doctype(dt, resolve));

// Shared across all form instances in the current session
let shared_fields = null;

function set_if_changed(frm, fieldname, value) {
	const current = frm.doc[fieldname] ?? "";
	const next = value ?? "";
	if (current !== next) {
		return frm.set_value(fieldname, next);
	}
	return Promise.resolve();
}

frappe.ui.form.on("FSO Engineer Alignment", {
	// refresh: (frm) => load_banks(frm, true),
	engineer_name: (frm) => load_banks(frm, false),

	async bank_account(frm) {
		const row = frm._banks?.[frm.doc.bank_account];
		const fields = await get_fields(frm);
		await Promise.all(fields.map((f) => set_if_changed(frm, f, row?.[f] ?? "")));
	},

	eng_cost(frm) {
		calculate_billing_total(frm);
	},

	other_cost(frm) {
		calculate_billing_total(frm);
	},

	travel_cst(frm) {
		calculate_billing_total(frm);
	},
});

// Child fieldnames that also exist on this doctype (cached once per session)
async function get_fields(frm) {
	if (shared_fields) return shared_fields;

	await load_meta(PARENT);
	const child = frappe.get_meta(PARENT).fields.find((df) => df.fieldname === TABLE)?.options;
	if (!child) return (shared_fields = []);

	await load_meta(child);

	const own = new Set(frappe.get_meta(frm.doctype).fields.map((df) => df.fieldname));
	shared_fields = frappe.get_meta(child).fields
		.filter((df) => !frappe.model.no_value_type.includes(df.fieldtype) && own.has(df.fieldname))
		.map((df) => df.fieldname);

	return shared_fields;
}

async function load_banks(frm, keep) {
	const engineer = frm.doc.engineer_name;
	const seq = (frm._seq = (frm._seq || 0) + 1);
	const fields = await get_fields(frm);

	if (!keep) {
		await Promise.all([
			set_if_changed(frm, "bank_account", ""),
			...fields.map((f) => set_if_changed(frm, f, "")),
		]);
		if (seq !== frm._seq) return;
	}

	let rows = [];
	if (engineer) {
		frm._cache = frm._cache || {};
		if (!frm._cache[engineer]) {
			const doc = await frappe.db.get_doc(PARENT, engineer);
			if (seq !== frm._seq) return; // stale response
			frm._cache[engineer] = doc[TABLE] || [];
		}
		rows = frm._cache[engineer];
	}

	const active_rows = rows.filter((r) => r.is_active);
	const banks = {};
	const options = [""];

	for (const r of active_rows) {
		const status = r.is_active ? "Active" : "Inactive";
		let label = `${r.bank_name || "Bank"} - ${r.account_number || r.idx} (${status})`;
		if (banks[label]) label += ` [${r.idx}]`;
		banks[label] = r;
		options.push(label);
	}

	frm._banks = banks;
	frm.set_df_property("bank_account", "options", options.join("\n"));

	if (frm.doc.bank_account && !banks[frm.doc.bank_account]) {
		await set_if_changed(frm, "bank_account", "");
	}
}
function calculate_billing_total(frm) {

    // 1. Get input values
    let eng_cost = flt(frm.doc.eng_cost);
    let other_cost = flt(frm.doc.other_cost);
    let travel_cst = flt(frm.doc.travel_cst);

    let total_cost = eng_cost + other_cost + travel_cst;
    frm.set_value("total_cost", total_cost);

}