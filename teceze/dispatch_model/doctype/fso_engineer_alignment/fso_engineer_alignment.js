const PARENT = "Engineer Onboarding";
const TABLE = "bank_details";
const load_meta = (dt) => new Promise((resolve) => frappe.model.with_doctype(dt, resolve));

frappe.ui.form.on("FSO Engineer Alignment", {
	refresh: (frm) => load_banks(frm, true),
	engineer_name: (frm) => load_banks(frm, false),

	bank_account(frm) {
		const row = frm._banks?.[frm.doc.bank_account];
		(frm._fields || []).forEach((f) => frm.set_value(f, row?.[f] ?? ""));
	},
	eng_cost(frm) {
        calculate_billing_total(frm);
        console.log("Call")
    },

    other_cost(frm) {
        calculate_billing_total(frm);
    },

    travel_cst(frm) {
        calculate_billing_total(frm);
    },

});

// child fieldnames that also exist on this doctype (auto-detected once)
async function get_fields(frm) {
	if (frm._fields) return frm._fields;

	await load_meta(PARENT);
	const child = frappe.get_meta(PARENT).fields.find((df) => df.fieldname === TABLE).options;
	await load_meta(child);

	const own = new Set(frappe.get_meta(frm.doctype).fields.map((df) => df.fieldname));
	return (frm._fields = frappe.get_meta(child).fields
		.filter((df) => !frappe.model.no_value_type.includes(df.fieldtype) && own.has(df.fieldname))
		.map((df) => df.fieldname));
}

async function load_banks(frm, keep) {
	const engineer = frm.doc.engineer_name;
	const seq = (frm._seq = (frm._seq || 0) + 1);
	const fields = await get_fields(frm);

	if (!keep) {
		frm.set_value("bank_account", "");
		fields.forEach((f) => frm.set_value(f, ""));
	}

	let rows = [];
	if (engineer) {
		frm._cache = frm._cache || {};
		rows = frm._cache[engineer] ||= (await frappe.db.get_doc(PARENT, engineer))[TABLE] || [];
		if (seq !== frm._seq) return; // stale response
	}

	frm._banks = {};
	rows.forEach((r) => {
		let label = `${r.bank_name || "Bank"} - ${r.account_number || r.idx}`;
		if (frm._banks[label]) label += ` (${r.idx})`;
		frm._banks[label] = r;
	});

	frm.set_df_property("bank_account", "options", ["", ...Object.keys(frm._banks)].join("\n"));
	if (frm.doc.bank_account && !frm._banks[frm.doc.bank_account]) {
		frm.set_value("bank_account", "");
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