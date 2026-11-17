(function () {
	"use strict";

	/* ------------------------------------------------------------------ */
	/* Constants                                                           */
	/* ------------------------------------------------------------------ */

	const STORE_KEY = "teceze_sdd_state_v2";
	const TZ = "Asia/Dubai"; // company time zone for the dashboard
	const H = 3600e3;
	const DAY = 24 * H;
	const SLA_TARGET = 85; // % of measured tickets that must meet the on-site SLA
	const PAGE_SIZE = 10;

	const TEAMS = {
		client: { label: "Client" },
		sd: { label: "Service Desk" },
		fso: { label: "FSO" },
		sdc: { label: "SDC" },
		sdm: { label: "SDM" },
		accounts: { label: "Accounts" },
	};

	const STEPS = [
		{ n: 1, team: "client", title: "Client ticket", desc: "Client raises ticket in system", bar: "Raised", status: "Returned to client" },
		{ n: 2, team: "sd", title: "Service desk review", desc: "Validate details, categorise, confirm documents", bar: "SD review", status: "SD review" },
		{ n: 3, team: "sd", title: "Assign to FSO queue", desc: "Service desk assigns the ticket to FSO", bar: "Assign FSO", status: "Assign FSO" },
		{ n: 4, team: "fso", title: "FSO process", desc: "Engineer works, FSO updates progress and actions", bar: "FSO process", status: "FSO process" },
		{ n: 5, team: "fso", title: "Move to SDC queue", desc: "FSO moves the ticket to SDC", bar: "To SDC", status: "To SDC" },
		{ n: 6, team: "sdc", title: "SDC validation and discussion", desc: "SDC validates, discusses with the engineer, documents", bar: "SDC validation", status: "SDC validation" },
		{ n: 7, team: "sdc", title: "Attach sign-off sheet", desc: "SDC uploads the client sign-off and sends the ticket to FSO for the payment request", bar: "Sign-off", status: "Sign-off", mandatory: true },
		{ n: 8, team: "fso", title: "FSO payment request", desc: "FSO enters the engineer rate, costs and bank details and sends the request to the SDM", bar: "FSO payment", status: "FSO payment" },
		{ n: 9, team: "sdm", title: "SDM billing review", desc: "SDM adds the client billing cost, checks the margin and sends the request to finance", bar: "SDM billing", status: "SDM billing" },
		{ n: 10, team: "accounts", title: "Move to account team for billing", desc: "Finance processes the engineer payment and updates the status", bar: "Finance", status: "Finance" },
	];


	/** The 10 workflow steps plus Closed: the 11 stages of the lifecycle */
	const STAGES = STEPS.map((s) => Object.assign({}, s)).concat([{ n: 11, team: null, title: "Closed", desc: "Engineer paid and the ticket is closed", bar: "Closed" }]);
	const STAGE_SHORT = ["Raised", "SD review", "Assign FSO", "FSO process", "To SDC", "SDC valid.", "Sign-off", "FSO pay", "SDM billing", "Finance", "Closed"];
	/** Short checkpoint note for each stage, shown in the ticket drawer */
	const STAGE_NOTE = ["Intake verified", "Triage and categorise", "Route allocation", "SLA clock stop", "Handover to SDC", "Technical audit", "Client acceptance", "Engineer settlement", "Margin review", "AP posting", "Lifecycle finalised"];
	const DONE_LABELS = ["Ticket raised", "Review complete", "Assigned to FSO queue", "FSO work complete", "Moved to SDC queue", "Validation complete", "Sign-off sheet attached", "Payment request sent", "Billing approved", "Engineer paid"];
	const CLOCK_STOP_STAGE = 4;

	const svg = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
	const ICON = {
		box: svg('<path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"/>'),
		download: svg('<path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/>'),
		check: svg('<path d="M5 13l4 4L19 7"/>', 2.6),
		x: svg('<path d="M6 18 18 6M6 6l12 12"/>'),
		info: svg('<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>'),
		refresh: svg('<path d="M4 4v5h.6m15.4 2A8 8 0 0 0 4.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 0 1-15.4-2m15.4 2H15"/>'),
		clock: svg('<path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>'),
		chevron: svg('<path d="m19 9-7 7-7-7"/>'),
		trend: svg('<path d="M13 7h8m0 0v8m0-8-8 8-4-4-6 6"/>'),
		search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
	};

	/* ------------------------------------------------------------------ */
	/* Helpers                                                             */
	/* ------------------------------------------------------------------ */

	const esc = (v) =>
		String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
	const num = (v) => {
		const n = parseFloat(v);
		return isFinite(n) ? n : 0;
	};
	const iso = (ms) => new Date(ms).toISOString();
	const nowIso = () => new Date().toISOString();
	const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
	function dur(ms) {
		const m = Math.round(Math.abs(ms) / 60000);
		const d = Math.floor(m / 1440);
		const h = Math.floor((m % 1440) / 60);
		const mm = m % 60;
		if (d) return `${d}d ${h}h`;
		if (h) return `${h}h ${mm}m`;
		return `${mm}m`;
	}

	/* ------------------------------------------------------------------ */
	/* Time zones                                                          */
	/* ------------------------------------------------------------------ */

	const dtfCache = {};
	const dtfNumCache = {};
	function dtf(tz) {
		return (dtfCache[tz] =
			dtfCache[tz] ||
			new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
	}
	function dtfNum(tz) {
		return (dtfNumCache[tz] =
			dtfNumCache[tz] ||
			new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
	}
	function parts(v, tz) {
		const p = {};
		dtf(tz || TZ).formatToParts(new Date(v)).forEach((x) => (p[x.type] = x.value));
		return p;
	}
	/** Wall clock of an instant in a time zone */
	function wall(ms, tz) {
		const p = {};
		dtfNum(tz || TZ).formatToParts(new Date(ms)).forEach((x) => (p[x.type] = x.value));
		const h = p.hour === "24" ? "00" : p.hour;
		return { y: +p.year, mo: +p.month, d: +p.day, h: +h, mi: +p.minute, s: +p.second, ymd: `${p.year}-${p.month}-${p.day}`, hm: `${h}:${p.minute}` };
	}
	function tzOffset(ms, tz) {
		const w = wall(ms, tz);
		return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
	}
	/** UTC ms for a wall clock date + time in a time zone */
	function wallToUtc(ymd, hm, tz) {
		const [y, mo, d] = ymd.split("-").map(Number);
		const [h, mi] = (hm || "00:00").split(":").map(Number);
		const guess = Date.UTC(y, mo - 1, d, h, mi);
		let t = guess - tzOffset(guess, tz);
		const o2 = tzOffset(t, tz);
		if (guess - o2 !== t) t = guess - o2;
		return t;
	}
	function tzAbbr(tz, ms) {
		if (tz === "Europe/London") return tzOffset(ms || Date.now(), tz) === 0 ? "GMT" : "BST";
		return { "Asia/Dubai": "GST", "Asia/Kolkata": "IST", "Asia/Singapore": "SGT", "Asia/Kuala_Lumpur": "MYT" }[tz] || tz;
	}
	const ymdIn = (v, tz) => wall(Date.parse(v), tz).ymd;
	/** wall time today-minus-n-days in a time zone */
	function tzAt(daysAgo, hm, tz) {
		const today = wall(Date.now(), tz).ymd;
		const d = new Date(Date.parse(today + "T00:00:00Z") - daysAgo * DAY).toISOString().slice(0, 10);
		return wallToUtc(d, hm, tz);
	}

	function fmtShort(v, tz) {
		if (!v) return "–";
		const p = parts(v, tz);
		return `${p.day} ${p.month}, ${p.hour}:${p.minute}`;
	}
	function fmtDue(v, tz) {
		if (!v) return "–";
		tz = tz || TZ;
		const p = parts(v, tz);
		return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${tzAbbr(tz, Date.parse(v))}`;
	}
	function fmtFull(v, tz) {
		if (!v) return "–";
		tz = tz || TZ;
		const p = parts(v, tz);
		return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${tzAbbr(tz, Date.parse(v))}`;
	}
	function fmtDate(v, tz) {
		if (!v) return "–";
		const p = parts(v, tz);
		return `${p.day} ${p.month} ${p.year}`;
	}
	/* ------------------------------------------------------------------ */
	/* SLA                                                                 */
	/* ------------------------------------------------------------------ */

	function computeSlaDue(receivedIso, level, p) {
		const tz = p.tz || TZ;
		const w = wall(Date.parse(receivedIso), tz);
		const isWeekend = (ymd) => [0, 6].includes(new Date(ymd + "T00:00:00Z").getUTCDay());
		const nextBiz = (ymd) => {
			let x = Date.parse(ymd + "T00:00:00Z");
			do x += DAY;
			while (isWeekend(iso(x).slice(0, 10)));
			return iso(x).slice(0, 10);
		};
		let target;
		if (level === "SBD") target = isWeekend(w.ymd) || w.hm >= (p.sbdCutoff || "14:00") ? nextBiz(w.ymd) : w.ymd;
		else target = nextBiz(w.ymd);
		return iso(wallToUtc(target, p.onSiteBy || "18:00", tz));
	}

	function slaInfo(t) {
		const due = Date.parse(t.slaDue);
		if (t.onSiteAt) {
			const diff = due - Date.parse(t.onSiteAt);
			return diff >= 0
				? { key: "met", label: "SLA met", note: `Engineer on site ${dur(diff)} before due` }
				: { key: "missed", label: "SLA missed", note: `Engineer on site ${dur(diff)} after due` };
		}
		if (t.closed) return { key: "met", label: "SLA met", note: "Closed" };
		const left = due - Date.now();
		if (left < 0) return { key: "breached", label: "SLA breached", note: `Engineer not on site, overdue by ${dur(left)}` };
		if (left < (num(t.atRiskH) || 2) * H) return { key: "risk", label: "SLA at risk", note: `${dur(left)} left to get an engineer on site` };
		return { key: "track", label: "SLA on track", note: `${dur(left)} left to get an engineer on site` };
	}
	/** Dashboard grouping: met, breached (missed or overdue), risk, track */
	function slaClass(t) {
		const k = slaInfo(t).key;
		return k === "missed" ? "breached" : k;
	}

	const stepDef = (n) => STEPS[n - 1];
	const currentTeam = (t) => (t.closed ? null : stepDef(t.step).team);


	const stageOf = (t) => (t.closed ? 11 : t.step);
	const fixed = (v, d) => (v == null ? "–" : Number(v).toFixed(d == null ? 1 : d));
	function isoWeek(ymd) {
		const d = new Date(ymd + "T00:00:00Z");
		const day = (d.getUTCDay() + 6) % 7;
		d.setUTCDate(d.getUTCDate() - day + 3);
		const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
		return 1 + Math.round(((d - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
	}
	const initials = (name) =>
		String(name || "?")
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0].toUpperCase())
			.join("");

	/* ------------------------------------------------------------------ */
	/* Data                                                                */
	/* ------------------------------------------------------------------ */

	/** This page only reads data. Swap load() for a frappe.call to read from DocTypes. */
	const Store = {
		load() {
			try {
				const raw = localStorage.getItem(STORE_KEY);
				if (!raw) return null;
				const s = JSON.parse(raw);
				return s && s.version === 2 && Array.isArray(s.tickets) && Array.isArray(s.projects) ? s : null;
			} catch (e) {
				return null;
			}
		},
	};

	const proj = (code, name, client, tz, priority, sbdCutoff, onSiteBy, atRiskH, sdm, active) => ({ code, name, client, tz, priority, sbdCutoff, onSiteBy, atRiskH, sdm, active: active !== false });
	const DEMO_PROJECTS = [
		proj("PRJ-001", "Branch network refresh", "Halcyon Bank", "Europe/London", "NBD", "14:00", "18:00", 2, "Arvind Menon"),
		proj("PRJ-002", "ATM site support", "Halcyon Bank", "Europe/London", "SBD", "12:00", "17:30", 1.5, "Arvind Menon"),
		proj("PRJ-003", "Warehouse Wi-Fi expansion", "Meridian Logistics", "Asia/Singapore", "SBD", "13:00", "18:00", 2, "Grace Ng"),
		proj("PRJ-004", "POS hardware break-fix", "Northwind Retail", "Asia/Kolkata", "SBD", "15:00", "19:00", 2, "Arvind Menon"),
		proj("PRJ-005", "Clinic desktop rollout", "Aurora Clinics", "Asia/Dubai", "NBD", "14:00", "18:00", 3, "Grace Ng"),
		proj("PRJ-006", "Store network upgrade", "Northwind Retail", "Asia/Kolkata", "NBD", "14:00", "19:00", 3, "Arvind Menon"),
		proj("PRJ-007", "DC smart hands", "Meridian Logistics", "Asia/Kuala_Lumpur", "SBD", "13:00", "18:00", 1.5, "Grace Ng"),
		proj("PRJ-008", "Legacy branch decommission", "Halcyon Bank", "Europe/London", "NBD", "14:00", "18:00", 2, "Arvind Menon", false),
	];
	const DEMO_ENGINEERS = {
		"Europe/London": [["Daniel Okafor", "+44 7700 900412"], ["James Whitfield", "+44 7700 900877"]],
		"Asia/Singapore": [["Wei Ling Tan", "+65 9123 1189"]],
		"Asia/Kolkata": [["Arjun Patel", "+91 98200 41120"], ["Kavya Rao", "+91 98450 22904"]],
		"Asia/Dubai": [["Omar Haddad", "+971 50 412 7781"]],
		"Asia/Kuala_Lumpur": [["Aiman Rahim", "+60 12 334 9902"]],
	};
	const DEMO_TITLES = {
		"PRJ-001": ["Replace branch core switch", "Branch cabling remediation", "Branch switch stack upgrade", "Branch network refresh, floor 2"],
		"PRJ-002": ["ATM network cabinet check", "ATM router swap", "ATM UPS replacement"],
		"PRJ-003": ["Add access points to dock area", "Scanner Wi-Fi drop investigation", "Cold store access point install", "Mezzanine access point survey", "Warehouse Wi-Fi expansion"],
		"PRJ-004": ["Till 4 card reader fault", "POS hardware break-fix: till 2 card reader and scanner"],
		"PRJ-005": ["Image replacement desktops", "Reception PC replacement", "Consulting room printer setup", "Install and image 12 desktops in new consulting rooms"],
		"PRJ-006": ["Replace store access switch", "Re-patch store comms rack", "Store Wi-Fi survey", "Store router upgrade", "Move POS network to new switch", "Install CCTV PoE switch", "Store network upgrade, phase 2"],
		"PRJ-007": ["Rack and stack two servers", "Replace failed DC switch PSU", "Patch new customer cage"],
	};

	/** Demo tickets with the fields the dashboard and drawer read, including a simple history */
	function buildDemo() {
		const st = { version: 2, tickets: [], projects: DEMO_PROJECTS.map((p) => Object.assign({}, p)) };
		const owners = ["Sneha Iyer", "Rahul Menon", "Aisha Khan"];
		const now = Date.now();
		const clamp = (ms) => Math.min(ms, now - 5 * 60000);
		const used = {};
		const add = (code, createdMs, step, extra) => {
			const p = st.projects.find((x) => x.code === code);
			used[code] = (used[code] || 0) + 1;
			const titles = DEMO_TITLES[code] || ["Site visit"];
			const engs = DEMO_ENGINEERS[p.tz] || [["Field engineer", ""]];
			const eng = engs[st.tickets.length % engs.length];
			const t = Object.assign(
				{
					id: "DSP-" + String(st.tickets.length + 1).padStart(4, "0"),
					client: p.client,
					project: p.code,
					title: titles[(used[code] - 1) % titles.length],
					priority: p.priority,
					tz: p.tz,
					receivedTz: p.tz,
					atRiskH: p.atRiskH,
					created: iso(createdMs),
					step: Math.min(step, 10),
					closed: step > 10,
					closedAt: null,
					onSiteAt: null,
					activityAt: null,
					fsoOwner: step > 3 ? owners[st.tickets.length % 3] : "",
					engineer: step >= 4 ? { name: eng[0], phone: eng[1] } : {},
					history: [],
					log: [],
				},
				extra || {}
			);
			if (!t.slaDue) t.slaDue = computeSlaDue(t.created, t.priority, p);
			st.tickets.push(t);
			return t;
		};
		/** Writes history and log entries for every step before the current one */
		const play = (t) => {
			const c = Date.parse(t.created);
			const on = t.onSiteAt ? Date.parse(t.onSiteAt) : null;
			const offs = [0, 0.12 * H, 0.22 * H];
			const after = [7.5, 7.75, 28, 31, 34, 39, 60].map((h) => h * H);
			const last = t.closed ? 10 : t.step - 1;
			for (let n = 1; n <= last; n++) {
				const at = iso(clamp(n <= 3 ? c + offs[n - 1] : on + after[n - 4]));
				const team = n === 1 ? "client" : STEPS[n - 1].team;
				const note = n === 3 ? "FSO owner: " + t.fsoOwner : "";
				t.history.push({ step: n, label: DONE_LABELS[n - 1], team, at, note });
				t.log.push({ at, team, title: DONE_LABELS[n - 1], text: note });
				if (n === 3 && t.engineer.name) t.log.push({ at: iso(clamp(c + 1.75 * H)), team: "fso", title: "Engineer engaged", text: t.engineer.name });
			}
			if (on) t.log.push({ at: t.onSiteAt, team: "fso", title: "Progress: On site", text: "" });
			if (t.closed) t.closedAt = t.history[t.history.length - 1].at;
			t.log.sort((a, b) => a.at.localeCompare(b.at));
			t.updatedAt = t.log.length ? t.log[t.log.length - 1].at : t.created;
		};

		// [project, days ago, received (site time), current step (11 = closed), hours on site before due (negative = SLA missed)]
		[
			["PRJ-005", 86, "12:15", 11, 5], ["PRJ-002", 84, "11:00", 11, 1.5], ["PRJ-006", 83, "13:15", 11, 6],
			["PRJ-003", 70, "13:30", 10, 4], ["PRJ-006", 69, "08:45", 11, 8], ["PRJ-002", 69, "11:45", 11, 1],
			["PRJ-001", 65, "11:15", 11, 7], ["PRJ-006", 65, "10:15", 11, 5], ["PRJ-003", 63, "10:45", 11, 2],
			["PRJ-006", 52, "10:15", 11, 6], ["PRJ-003", 38, "11:30", 11, -1.5], ["PRJ-005", 37, "08:15", 11, 9],
			["PRJ-004", 31, "09:45", 10, 2.5], ["PRJ-007", 31, "09:15", 11, 1.5], ["PRJ-002", 29, "09:00", 11, 2],
			["PRJ-005", 24, "10:00", 11, 6], ["PRJ-003", 23, "08:15", 11, 3], ["PRJ-006", 23, "12:30", 11, 7],
			["PRJ-007", 22, "08:30", 11, -2], ["PRJ-006", 21, "10:00", 10, 4], ["PRJ-001", 16, "12:45", 11, 6],
			["PRJ-006", 10, "08:45", 9, -3], ["PRJ-007", 9, "08:00", 9, 2], ["PRJ-001", 7, "12:30", 10, 5],
			["PRJ-001", 6, "09:40", 10, 6],
		].forEach(([code, days, hm, step, lead]) => {
			const p = st.projects.find((x) => x.code === code);
			const c = tzAt(days, hm, p.tz);
			const t = add(code, c, step);
			const onSite = clamp(Math.max(c + 2.3 * H, Date.parse(t.slaDue) - lead * H));
			t.onSiteAt = iso(onSite);
			t.activityAt = iso(onSite);
			play(t);
		});
		// Live tickets, with SLA due times pinned relative to now so the demo always shows live states
		play(add("PRJ-003", now - 4 * H, 4, { slaDue: iso(now + 1.2 * H), activityAt: iso(now + 0.5 * H) }));
		play(add("PRJ-004", now - 1 * H, 2, { slaDue: iso(now + 6.5 * H), activityAt: iso(now + 4 * H) }));
		const p5 = st.projects.find((x) => x.code === "PRJ-005");
		const t28 = add("PRJ-005", tzAt(2, "07:30", p5.tz), 6);
		t28.onSiteAt = iso(clamp(Date.parse(t28.slaDue) - 9.5 * H));
		t28.activityAt = t28.onSiteAt;
		play(t28);
		t28.log.push({ at: iso(clamp(Date.parse(t28.onSiteAt) + 26.5 * H)), team: "sdc", title: "Discussion note", text: "Spoke with Omar. Asset sheet received. Waiting on signed sign-off from Leena." });
		return st;
	}

	/* ------------------------------------------------------------------ */
	/* Executive dashboard                                                 */
	/* ------------------------------------------------------------------ */

	const PERIODS = [
		["7", "Last 7 days"],
		["30", "Last 30 days"],
		["90", "Last 90 days"],
		["180", "Last 6 months"],
		["365", "Last 12 months"],
		["month", "Month to date"],
		["year", "Year to date"],
		["all", "All time"],
	];
	const GROUPS = [
		["day", "Group by day", "Daily", "days", "day"],
		["week", "Group by week", "Weekly", "weeks", "wk"],
		["month", "Group by month", "Monthly", "months", "month"],
	];
	const SEG_LABEL = { met: "SLA met", track: "On track", risk: "At risk", breached: "Breached" };

	class ExecDashboard {
		constructor(mount) {
			this.loadState();
			const d = this.defaults();
			this.ui = { f: Object.assign({}, d), draft: Object.assign({}, d), chart: "recent", q: "", stage: null, page: 1, drawer: null, pipeOpen: false, dd: null, ddQ: "", ddActive: 0 };
			this.root = document.createElement("div");
			this.root.className = "sdd";
			this.view = document.createElement("div");
			this.drawerHost = document.createElement("div");
			this.toastBox = document.createElement("div");
			this.toastBox.className = "sdd-toasts";
			this.toastBox.setAttribute("aria-live", "polite");
			this.root.append(this.view, this.drawerHost, this.toastBox);
			mount.innerHTML = "";
			mount.appendChild(this.root);
			this.bind();
			this.render();
			this.watchHeader();
		}

		/* ---------- fixed header ---------- */

		/**
		 * Measures what is pinned at the top of the window (for example Frappe's navbar, when the desk
		 * shows one) so the header sticks directly below it, or flush to the top when there is nothing.
		 */
		/** The element that actually scrolls the page: a Frappe container, or null for the window */
		scrollParent() {
			let el = this.root.parentElement;
			while (el && el !== document.body && el !== document.documentElement) {
				const oy = getComputedStyle(el).overflowY;
				if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) return el;
				el = el.parentElement;
			}
			return null;
		}
		/**
		 * Finds anything pinned over the top of the scrolling area (for example Frappe's navbar) so the
		 * header sticks directly below it, or flush to the top of the scrolling area when there is nothing.
		 */
		measureTop() {
			const sp = this.scrollParent();
			const base = sp ? sp.getBoundingClientRect().top : 0;
			let top = base;
			document.querySelectorAll("header, nav, .navbar, .sticky-top, .page-head").forEach((el) => {
				if (this.root.contains(el) || !el.offsetHeight) return;
				const cs = getComputedStyle(el);
				if (cs.position !== "fixed" && cs.position !== "sticky") return;
				if (cs.display === "none" || cs.visibility === "hidden") return;
				const r = el.getBoundingClientRect();
				// only bars pinned at the top edge of the scrolling area and spanning most of its width count
				if (r.top > base + 1 || r.bottom <= base || r.width < window.innerWidth * 0.4) return;
				top = Math.max(top, r.bottom);
			});
			const px = Math.max(0, Math.round(top - base)) + "px";
			if (this.root.style.getPropertyValue("--top") !== px) this.root.style.setProperty("--top", px);
		}
		/** Adds a shadow to the header once the page scrolls under it */
		syncStuck() {
			const head = this.view.querySelector(".sdd-top");
			const body = this.view.querySelector(".sdd-page-wrap");
			if (!head || !body) return;
			const stuck = body.getBoundingClientRect().top < head.getBoundingClientRect().bottom - 1;
			this.stuck = stuck;
			head.classList.toggle("is-stuck", stuck);
		}
		watchHeader() {
			let raf = 0;
			const tick = () => {
				raf = 0;
				if (!this.root.isConnected) return;
				this.measureTop();
				this.syncStuck();
			};
			const schedule = () => {
				if (!raf) raf = requestAnimationFrame(tick);
			};
			// capture catches scrolling inside Frappe's own scroll containers as well as the window
			document.addEventListener("scroll", schedule, { capture: true, passive: true });
			window.addEventListener("resize", schedule, { passive: true });
			if (window.ResizeObserver) new ResizeObserver(schedule).observe(document.body);
			this.scheduleHeader = schedule;
			schedule();
			setTimeout(schedule, 300); // after the desk finishes laying out
		}

		loadState() {
			const s = Store.load();
			this.isDemo = !s;
			this.state = s || buildDemo();
			this.loadedAt = nowIso();
		}
		defaults() {
			return { client: "", project: "", period: "90", group: "week", basis: "received", status: "all" };
		}
		project(code) {
			return this.state.projects.find((p) => p.code === code) || null;
		}
		ticket(id) {
			return this.state.tickets.find((t) => t.id === id) || null;
		}
		refresh() {
			if (this.scheduleHeader) this.scheduleHeader();
			this.loadState();
			if (this.ui.drawer && !this.ticket(this.ui.drawer)) this.ui.drawer = null;
			this.render();
		}

		/* ---------- events ---------- */

		bind() {
			this.root.addEventListener("click", (e) => {
				const el = e.target.closest("[data-action]");
				if (!el || !this.root.contains(el) || el.disabled) return;
				this.handle(el.dataset.action, el, e);
			});
			this.root.addEventListener("change", (e) => {
				const k = e.target.dataset.f;
				if (!k) return;
				this.ui.draft[k] = e.target.value;
				if (k === "client") this.ui.draft.project = "";
				this.render();
			});
			this.root.addEventListener("input", (e) => {
				if (e.target.dataset.ui === "ddq") {
					this.ui.ddQ = e.target.value;
					this.ui.ddActive = 0;
					return this.ddRefreshList();
				}
				if (e.target.dataset.ui !== "q") return;
				this.ui.q = e.target.value;
				this.ui.page = 1;
				this.renderRegistryBody();
			});
			document.addEventListener("keydown", (e) => {
				if (e.key === "Escape" && this.ui.drawer && this.root.isConnected && this.root.offsetParent !== null) this.closeDrawer();
			});
			document.addEventListener("mousedown", (e) => {
				if (this.ui.dd && !e.target.closest(".sdd-dd")) this.ddClose(false);
			});
			this.root.addEventListener("keydown", (e) => {
				if (this.ui.dd && this.ddKey(e)) return;
				if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.matches(".sdd-dd__btn")) {
					e.preventDefault();
					return this.ddOpen(e.target.dataset.key);
				}
				if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-action]')) {
					e.preventDefault();
					this.handle(e.target.dataset.action, e.target, e);
				}
			});
		}

		handle(action, el) {
			const d = el.dataset;
			const ui = this.ui;
			switch (action) {
				case "apply":
					ui.f = Object.assign({}, ui.draft);
					ui.page = 1;
					return this.render();
				case "reset":
					ui.f = this.defaults();
					ui.draft = this.defaults();
					ui.q = "";
					ui.stage = null;
					ui.page = 1;
					return this.render();
				case "chart":
					ui.chart = d.range;
					return this.render();
				case "stage-filter":
					ui.stage = ui.stage === +d.stage ? null : +d.stage;
					ui.page = 1;
					this.render();
					return this.scrollTo(".sdd-registry");
				case "clear-stage":
					ui.stage = null;
					ui.page = 1;
					return this.render();
				case "client-filter": {
					const same = ui.f.client === d.client;
					ui.f.client = ui.draft.client = same ? "" : d.client;
					ui.f.project = ui.draft.project = "";
					ui.page = 1;
					return this.render();
				}
				case "page":
					ui.page = +d.page;
					this.renderRegistryBody();
					return;
				case "open":
					return this.openDrawer(d.id);
				case "close":
					return this.closeDrawer();
				case "pipe-toggle":
					ui.pipeOpen = !ui.pipeOpen;
					return this.renderDrawer();
				case "export":
					return this.exportCsv(false);
				case "audit":
					return this.exportCsv(true);
				case "dd-toggle":
					return this.ui.dd === d.key ? this.ddClose(true) : this.ddOpen(d.key);
				case "dd-pick":
					return this.ddPick(d.key, d.value);
				case "refresh":
					this.refresh();
					return this.toast(this.isDemo ? "Showing demo data. No saved tickets were found." : "Data reloaded", "ok");
			}
		}

		scrollTo(sel) {
			const el = this.view.querySelector(sel);
			if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
		}
		/** One toast at a time: a repeat or new message reuses it and restarts its timer, so rapid clicks never stack */
		toast(msg, kind) {
			clearTimeout(this.toastFade);
			clearTimeout(this.toastGone);
			let el = this.toastEl;
			if (!el || !this.toastBox.contains(el)) {
				el = document.createElement("div");
				this.toastBox.appendChild(el);
				this.toastEl = el;
			}
			el.className = "sdd-toast" + (kind ? " sdd-toast--" + kind : "");
			if (el.textContent !== msg) el.textContent = msg;
			this.toastFade = setTimeout(() => el.classList.add("is-out"), 3400);
			this.toastGone = setTimeout(() => {
				el.remove();
				if (this.toastEl === el) this.toastEl = null;
			}, 3800);
		}

		/* ---------- calculations ---------- */

		periodStart(period) {
			const now = Date.now();
			const today = wall(now, TZ).ymd;
			if (/^\d+$/.test(period)) return now - Number(period) * DAY;
			if (period === "month") return wallToUtc(today.slice(0, 8) + "01", "00:00", TZ);
			if (period === "year") return wallToUtc(today.slice(0, 5) + "01-01", "00:00", TZ);
			return null;
		}
		basisOf(t, basis) {
			return { received: t.created, onsite: t.onSiteAt, activity: t.activityAt, closed: t.closedAt }[basis] || null;
		}
		statusOk(t, status) {
			if (status === "open") return !t.closed;
			if (status === "closed") return t.closed;
			if (status === "breached") return slaClass(t) === "breached";
			if (status === "risk") return slaClass(t) === "risk";
			return true;
		}
		/** Tickets for the client and project filters (no period or status) */
		scoped(f) {
			return this.state.tickets.filter((t) => (!f.client || t.client === f.client) && (!f.project || t.project === f.project));
		}
		inWindow(list, f, from, to) {
			return list.filter((t) => {
				const b = this.basisOf(t, f.basis);
				if (!b) return false;
				const ms = Date.parse(b);
				return (from == null || ms >= from) && (to == null || ms < to);
			});
		}
		tally(list) {
			const c = { met: 0, breached: 0, risk: 0, track: 0, total: list.length };
			list.forEach((t) => c[slaClass(t)]++);
			c.measured = c.met + c.breached;
			c.pctExact = c.measured ? (c.met / c.measured) * 100 : null;
			c.pct = c.pctExact == null ? null : Math.round(c.pctExact);
			c.open = list.filter((t) => !t.closed).length;
			c.closed = list.length - c.open;
			return c;
		}
		avg(list, fn) {
			const v = list.map(fn).filter((x) => x != null && isFinite(x) && x >= 0);
			return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
		}
		firstResponse(t) {
			const h = (t.history || []).find((x) => x.step === 2);
			return h ? Date.parse(h.at) - Date.parse(t.created) : null;
		}
		arrival(t) {
			return t.onSiteAt ? Date.parse(t.onSiteAt) - Date.parse(t.created) : null;
		}
		bucketOf(ms, group) {
			const w = wall(ms, TZ);
			if (group === "day") return w.ymd;
			if (group === "month") return w.ymd.slice(0, 7);
			const d = Date.parse(w.ymd + "T00:00:00Z");
			return iso(d - ((new Date(d).getUTCDay() + 6) % 7) * DAY).slice(0, 10);
		}
		nextBucket(key, group) {
			if (group === "month") {
				let [y, m] = key.split("-").map(Number);
				m += 1;
				if (m > 12) {
					m = 1;
					y += 1;
				}
				return `${y}-${String(m).padStart(2, "0")}`;
			}
			return iso(Date.parse(key + "T00:00:00Z") + (group === "week" ? 7 : 1) * DAY).slice(0, 10);
		}
		bucketLabel(key, group) {
			const d = new Date((group === "month" ? key + "-15" : key) + "T12:00:00Z");
			const mon = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(d);
			if (group === "month") return { short: mon, long: `${mon} ${d.getUTCFullYear()}` };
			if (group === "week") return { short: "W" + isoWeek(key), long: `Week ${isoWeek(key)}, from ${d.getUTCDate()} ${mon}` };
			return { short: `${d.getUTCDate()} ${mon}`, long: `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}` };
		}

		compute() {
			const f = this.ui.f;
			const start = this.periodStart(f.period);
			const scoped = this.scoped(f);
			const windowed = this.inWindow(scoped, f, start, null);
			const ts = windowed.filter((t) => this.statusOk(t, f.status)).sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
			const all = this.tally(ts);

			// previous window of the same length, for the compliance trend
			let prev = null;
			if (/^\d+$/.test(f.period)) {
				const len = Number(f.period) * DAY;
				prev = this.tally(this.inWindow(scoped, f, start - len, start).filter((t) => this.statusOk(t, f.status)));
			}

			// buckets across the window
			const times = ts.map((t) => Date.parse(this.basisOf(t, f.basis)));
			const now = Date.now();
			const first = start != null ? start : times.length ? Math.min(...times) : now;
			const last = Math.max(now, ...(times.length ? times : [now]));
			const keys = [];
			let k = this.bucketOf(first, f.group);
			const endKey = this.bucketOf(last, f.group);
			while (k <= endKey && keys.length < 400) {
				keys.push(k);
				k = this.nextBucket(k, f.group);
			}
			const nowKey = this.bucketOf(now, f.group);
			const buckets = keys.map((key) => {
				const list = ts.filter((t) => this.bucketOf(Date.parse(this.basisOf(t, f.basis)), f.group) === key);
				return Object.assign({ key, list, now: key === nowKey, label: this.bucketLabel(key, f.group) }, { c: this.tally(list) });
			});
			return { f, start, ts, all, prev, buckets, scopedAll: windowed };
		}

		/* ---------- rendering ---------- */

		render() {
			const data = this.compute();
			this.data = data;
			this.view.innerHTML = `${this.renderTop()}
				<div class="sdd-page-wrap">
					${this.renderHead(data)}
					${this.renderFilters(data)}
					${this.renderKpis(data)}
					<section class="sdd-row sdd-row--chart">${this.renderChart(data)}${this.renderRatio(data)}</section>
					${this.renderStageCard(data)}
					${this.renderRegistry(data)}
				</div>`;
			this.renderRegistryBody();
			this.renderDrawer();
		}

		renderTop() {
			return `<header class="sdd-top${this.stuck ? " is-stuck" : ""}">
				<div class="sdd-top__l">
					<span class="sdd-top__icon">${ICON.box}</span>
					<div>
						<div class="sdd-top__title">Service Delivery Dispatch
							${this.isDemo ? `<span class="sdd-badge sdd-badge--amber" title="No saved tickets were found in this browser">Demo data</span>` : `<span class="sdd-badge sdd-badge--ok">Live SLA sync</span>`}
						</div>
					</div>
				</div>
				<div class="sdd-top__r">
					<button class="sdd-sync" data-action="refresh" title="Reload the latest data"><span class="sdd-pulse"></span>Synced: ${fmtFull(this.loadedAt)}</button>
					<button class="sdd-btn" data-action="export">${ICON.download}<span>Export report</span></button>
				</div>
			</header>`;
		}

		renderHead(d) {
			const a = d.all;
			const tone = a.pctExact == null ? "" : a.pctExact >= SLA_TARGET ? "ok" : a.pctExact >= 75 ? "warn" : "bad";
			return `<div class="sdd-head">
				<div>
					<div class="sdd-head__title">
						<h1>Dispatch Performance &amp; SLA Executive Overview</h1>
					</div>
				</div>
				<div class="sdd-head__r">
					<div class="sdd-head__health">
						<span>Global SLA health target</span>
						<b class="is-${tone}">${a.pctExact == null ? "No measured tickets" : `${fixed(a.pctExact)}% (Target &gt;${SLA_TARGET}.0%)`}</b>
					</div>
					<span class="sdd-vr"></span>
					<button class="sdd-btn" data-action="audit">${ICON.download}<span>Export audit report</span></button>
				</div>
			</div>`;
		}

		renderFilters(d) {
			const dirty = JSON.stringify(this.ui.draft) !== JSON.stringify(this.ui.f);
			return `<section class="sdd-card sdd-filters">
				<div class="sdd-filters__grid">${["client", "project", "period", "status"].map((k) => this.renderDd(k)).join("")}</div>
				<div class="sdd-filters__btns">
					<button class="sdd-btn sdd-btn--soft" data-action="reset">Reset</button>
					<button class="sdd-btn sdd-btn--primary${dirty ? " is-dirty" : ""}" data-action="apply"${dirty ? "" : " disabled"} title="${dirty ? "Apply the changed filters" : "Change a filter to apply it"}">Apply filters</button>
				</div>
			</section>`;
		}

		renderKpis(d) {
			const a = d.all;
			const ts = d.ts;
			const pctOf = (n) => (ts.length ? fixed((n / ts.length) * 100) + "%" : "–");
			const clients = new Set(ts.map((t) => t.client)).size;
			const periodLabel = (PERIODS.find((p) => p[0] === d.f.period) || [0, ""])[1].toLowerCase();
			const tone = a.pctExact == null ? "slate" : a.pctExact >= SLA_TARGET ? "ok" : a.pctExact >= 75 ? "warn" : "bad";
			let delta = "";
			if (d.prev && d.prev.pctExact != null && a.pctExact != null) {
				const v = a.pctExact - d.prev.pctExact;
				delta = `<span title="Compared with the previous ${periodLabel.replace("last ", "")}">${v >= 0 ? "+" : ""}${fixed(v)}% vs prev</span>`;
			}
			const risk = ts.filter((t) => slaClass(t) === "risk").sort((x, y) => Date.parse(x.slaDue) - Date.parse(y.slaDue));
			const pay = ts.filter((t) => !t.closed && t.step >= 8);
			const card = (o) => `<div class="sdd-kpi sdd-kpi--${o.tone}">
		<div class="sdd-kpi__top"><span class="sdd-kpi__l">${o.label}</span></div>
		<div class="sdd-kpi__n">${o.value}</div>
		<div class="sdd-kpi__foot"><span>${o.fl}</span>${o.fr || ""}</div>
	</div>`;
			return `<section class="sdd-kpis">
		${card({ tone: "slate", label: "Total tickets", value: ts.length, fl: `In ${periodLabel.replace("last ", "")} window`, fr: `<span>${clients} ${clients === 1 ? "client" : "clients"}</span>` })}
		${card({ tone: "sky", label: "Open active", value: a.open, fl: "Active pipelines", fr: `<span>${pctOf(a.open)}</span>` })}
		${card({ tone: "ok", label: "Closed &amp; paid", value: a.closed, fl: "Reconciled", fr: `<span>${pctOf(a.closed)}</span>` })}
		${card({ tone, label: "SLA compliance", value: a.pct == null ? "–" : a.pct + "%", fl: `${a.met} met of ${a.measured}`, fr: delta })}
		${card({ tone: "bad", label: "SLA breached", value: a.breached, fl: "Missed or overdue", fr: `<span>${a.measured ? fixed((a.breached / a.measured) * 100) + "%" : "–"}</span>` })}
		${card({ tone: "warn", label: "SLA at risk", value: a.risk, fl: risk.length ? `${risk[0].id} at stage ${stageOf(risk[0])}` : "None due soon", fr: risk.length > 1 ? `<span>+${risk.length - 1} more</span>` : "" })}
		${card({ tone: "purple", label: "Payments pending", value: pay.length, fl: "Stages 8 to 10", fr: `<span>${pay.filter((t) => t.step === 10).length} in finance</span>` })}
	</section>`;
		}

		renderChart(d) {
			const g = GROUPS.find((x) => x[0] === d.f.group);
			const recent = this.ui.chart === "recent";
			const shown = recent ? d.buckets.slice(-6) : d.buckets;
			const c = this.tally(shown.flatMap((b) => b.list));
			const max = Math.max(2, ...shown.map((b) => b.list.length));
			const top = Math.ceil(max / 2) * 2;
			const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0].map((v) => (Number.isInteger(v) ? v : v.toFixed(1)));
			const every = Math.ceil(shown.length / 14);
			const vsTarget = c.pctExact == null ? null : c.pctExact - SLA_TARGET;
			const avgResp = this.avg(shown.flatMap((b) => b.list), (t) => this.firstResponse(t));
			const avgArr = this.avg(shown.flatMap((b) => b.list), (t) => this.arrival(t));
			const legend = ["met", "track", "risk", "breached"].map((k) => `<span class="sdd-lchip sdd-lchip--${k}"><i></i>${SEG_LABEL[k]}<b>${c[k]}</b></span>`).join("");
			const bars = shown
				.map((b, i) => {
					const bc = b.c;
					const segs = ["breached", "risk", "track", "met"]
						.filter((k) => bc[k])
						.map((k) => `<span class="sdd-bar__seg sdd-bar__seg--${k}" style="flex-grow:${bc[k]}"></span>`)
						.join("");
					const r = this.avg(b.list, (t) => this.firstResponse(t));
					const ar = this.avg(b.list, (t) => this.arrival(t));
					const tipRows = ["met", "track", "risk", "breached"]
						.filter((k) => bc[k])
						.map((k) => `<div><span><i class="sdd-dot sdd-dot--${k}"></i>${SEG_LABEL[k]}</span><b>${bc[k]} ${bc[k] === 1 ? "ticket" : "tickets"}</b></div>`)
						.join("");
					const tip = b.list.length
						? `<div class="sdd-tip" role="tooltip">
							<div class="sdd-tip__h"><span>${esc(b.label.long)}${b.now ? ' <em>Current</em>' : ""}</span><b class="is-${bc.pct == null ? "sky" : bc.pct >= SLA_TARGET ? "ok" : "warn"}">${bc.pct == null ? "Not measured" : bc.pct + "% met"}</b></div>
							<div class="sdd-tip__rows">${tipRows}</div>
							<div class="sdd-tip__f"><span>First response: <b>${r == null ? "–" : dur(r)}</b></span><span>Arrival: <b>${ar == null ? "–" : dur(ar)}</b></span></div>
						</div>`
						: "";
					return `<div class="sdd-bar${b.now ? " is-now" : ""}${b.list.length ? "" : " is-empty"}" tabindex="${b.list.length ? 0 : -1}" aria-label="${esc(b.label.long)}: ${b.list.length} tickets">
						${tip}
						<div class="sdd-bar__plot"><div class="sdd-bar__stack" style="height:${(b.list.length / top) * 100}%">${segs}</div></div>
						<div class="sdd-bar__x">${i % every === 0 || b.now ? `<span class="sdd-bar__lbl">${b.now ? '<i class="sdd-pulse"></i>' : ""}${esc(b.label.short)}${b.now ? " (Now)" : ""}</span><span class="sdd-bar__n">${b.list.length} tix</span>` : ""}</div>
					</div>`;
				})
				.join("");
			return `<div class="sdd-card sdd-chart">
				<div class="sdd-card__head">
					
					<div class="sdd-seg2" role="group" aria-label="Chart range">
						<button class="${recent ? "is-on" : ""}" data-action="chart" data-range="recent">Last 6 ${g[3]}</button>
						<button class="${recent ? "" : "is-on"}" data-action="chart" data-range="all">Full period</button>
					</div>
				</div>
				<div class="sdd-chart__legend"><div>${legend}</div><span class="sdd-mono sdd-muted">Scale: 0–${top} tickets / ${g[4]}</span></div>
				${d.ts.length
					? `<div class="sdd-plot">
							<div class="sdd-plot__grid">${ticks.map((v) => `<div><span>${v}</span></div>`).join("")}</div>
							<div class="sdd-plot__bars" style="grid-template-columns:repeat(${shown.length}, minmax(0, 1fr))">${bars}</div>
						</div>`
					: `<div class="sdd-empty">No tickets match these filters. Widen the time horizon or reset the filters.</div>`
				}
				<div class="sdd-card__foot">
					<div class="sdd-chart__stats">
						<span>First response: <b class="sdd-mono">${avgResp == null ? "–" : dur(avgResp) + " avg"}</b></span><i>•</i>
						<span>On-site arrival: <b class="sdd-mono">${avgArr == null ? "–" : dur(avgArr) + " avg"}</b></span><i>•</i>
						<span>Clock stop: <b>engineer on site, per project SBD / NBD rules</b></span>
					</div>
					${vsTarget == null ? "" : `<span class="sdd-badge sdd-badge--pill sdd-badge--${vsTarget >= 0 ? "ok" : "bad"}">${ICON.trend}${vsTarget >= 0 ? "Target met" : "Below target"} (${vsTarget >= 0 ? "+" : ""}${fixed(vsTarget)}% vs ${SLA_TARGET}%)</span>`}
				</div>
			</div>`;
		}

		renderRatio(d) {
			const a = d.all;
			const tone = a.pctExact == null ? "" : a.pctExact >= SLA_TARGET ? "ok" : a.pctExact >= 75 ? "warn" : "bad";
			const clients = new Set(d.ts.map((t) => t.client)).size;
			const metW = a.measured ? (a.met / a.measured) * 100 : 0;
			const row = (k, label, n) => `<div class="sdd-rrow sdd-rrow--${k}"><span><i class="sdd-dot sdd-dot--${k}"></i>${label}</span><b class="sdd-mono">${n} ${n === 1 ? "ticket" : "tickets"}</b></div>`;
			const tipRows = ["met", "track", "risk", "breached"]
				.map((k) => `<div><span><i class="sdd-dot sdd-dot--${k}"></i>${SEG_LABEL[k]}</span><b>${a[k]} ${a[k] === 1 ? "ticket" : "tickets"}</b></div>`)
				.join("");
			const tip = `<div class="sdd-tip" role="tooltip">
		<div class="sdd-tip__h"><span>SLA compliance</span><b class="is-${a.pctExact == null ? "sky" : a.pctExact >= SLA_TARGET ? "ok" : "warn"}">${a.pctExact == null ? "Not measured" : fixed(a.pctExact, 2) + "% met"}</b></div>
		<div class="sdd-tip__rows">${tipRows}</div>
		<div class="sdd-tip__f"><span>Measured: <b>${a.measured}</b></span><span>Target: <b>${SLA_TARGET}%</b></span></div>
	</div>`;
			return `<div class="sdd-card sdd-ratio">
		<div class="sdd-ratio__head">
			<div class="sdd-ratio__t"><h3>SLA compliance ratio</h3><b class="sdd-mono is-${tone}">${a.pctExact == null ? "–" : fixed(a.pctExact, 2) + "%"}</b></div>
			<p>${a.met} met / ${a.breached} breached / ${a.risk} at risk</p>
		</div>
		<div class="sdd-ratio__body">
			<div class="sdd-gauge" tabindex="0" aria-label="${a.met} met and ${a.breached} breached out of ${a.measured} measured tickets">
				${tip}
				<div class="sdd-gauge__bar">${a.measured ? `<span class="sdd-gauge__met" style="width:${metW}%"></span><span class="sdd-gauge__bad" style="width:${100 - metW}%"></span>` : ""}</div>
				<span class="sdd-gauge__target" style="left:${SLA_TARGET}%"></span>
				<span class="sdd-gauge__tl" style="left:${SLA_TARGET}%">Target: ${SLA_TARGET}%</span>
			</div>
			<div class="sdd-gauge__scale sdd-mono"><span>0%</span><span>100%</span></div>
			<div class="sdd-rrows">
				${row("met", "Met on-site target", a.met)}
				${row("breached", "Clock stop breached", a.breached)}
				${row("risk", "Approaching SLA limit", a.risk)}
				${row("track", "On track, engineer not on site yet", a.track)}
			</div>
		</div>
		<div class="sdd-card__foot"><span>Audited across ${clients} ${clients === 1 ? "client" : "clients"}</span><span class="sdd-mono sdd-strong">SBD / NBD SLAs</span></div>
	</div>`;
		}

		renderStageCard(d) {
			const total = d.ts.length;
			const counts = STAGES.map((s) => d.ts.filter((t) => stageOf(t) === s.n).length);
			const open = counts.slice(0, 10).reduce((x, y) => x + y, 0);
			const closed = counts[10];
			const sel = this.ui.stage;
			const row = (s) => {
				const n = s.n;
				const c = counts[n - 1];
				const on = sel === n;
				const p = total ? (c / total) * 100 : 0;
				const shown = !total ? "–" : c && p < 1 ? "<1%" : Math.round(p) + "%";
				const sub = (s.team ? TEAMS[s.team].label : "Archived") + (n === CLOCK_STOP_STAGE ? " · SLA clock stop" : "");
				const tip = `${STAGE_SHORT[n - 1]}: ${c} ${c === 1 ? "ticket" : "tickets"}${total ? `, ${shown} of the ${total} in view` : ""}. Select to filter the registry.`;
				const arc = c ? `<circle class="sdd-ring__fg" cx="20" cy="20" r="16.5" pathLength="100" stroke-dasharray="${Math.max(p, 3).toFixed(2)} 100"/>` : "";
				return `<button type="button" class="sdd-st sdd-st--${s.team || "closed"}${on ? " is-active" : ""}${c ? "" : " is-zero"}" data-action="stage-filter" data-stage="${n}" aria-pressed="${on}" title="${esc(tip)}">
					<span class="sdd-st__n">${n === 11 ? ICON.check : n}</span>
					<span class="sdd-st__t"><b>${esc(s.bar || s.title)}</b><span>${esc(sub)}</span></span>
					<span class="sdd-st__r">
						<b class="sdd-st__c">${c}</b>
						<span class="sdd-ring" aria-hidden="true"><svg viewBox="0 0 40 40"><circle class="sdd-ring__bg" cx="20" cy="20" r="16.5"/>${arc}</svg><span class="sdd-ring__v${shown.length > 3 ? " is-long" : ""}">${shown}</span></span>
					</span>
				</button>`;
			};
			const filter = sel
				? `<div class="sdd-stc__filter">
						<span>Filtered by:</span>
						<button type="button" class="sdd-stc__chip" data-action="clear-stage" title="Remove the stage filter">${esc(STAGE_SHORT[sel - 1])}${ICON.x}</button>
						<button type="button" class="sdd-stc__all" data-action="clear-stage">${ICON.refresh}<span>All stages</span></button>
					</div>`
				: "";
			return `<section class="sdd-card sdd-stc">
				<div class="sdd-stc__head">
					<div>
						<div class="sdd-stc__title"><h3>Tickets by workflow stage</h3><span class="sdd-badge sdd-badge--slate sdd-badge--pill">${total} ${total === 1 ? "ticket" : "tickets"}</span></div>
						<p>Where each ticket in view sits today. Select a stage to filter the registry.</p>
					</div>
					${filter}
				</div>
				<div class="sdd-stc__body">
					<div class="sdd-stc__col">${STAGES.slice(0, 6).map(row).join("")}</div>
					<div class="sdd-stc__col">${STAGES.slice(6, 10).map(row).join("")}<div class="sdd-stc__sep"></div>${row(STAGES[10])}</div>
				</div>
				<div class="sdd-stc__foot">
					<span><i class="sdd-stc__dot sdd-stc__dot--open"></i><b>${open} in flight</b> across stages 1 to 10</span>
					<span><i class="sdd-stc__dot sdd-stc__dot--closed"></i><b>${closed} closed</b>${total ? ` <em>(${Math.round((closed / total) * 100)}%)</em>` : ""}</span>
				</div>
			</section>`;
		}

		registryList() {
			const q = this.ui.q.trim().toLowerCase();
			return this.data.ts.filter((t) => {
				if (this.ui.stage && stageOf(t) !== this.ui.stage) return false;
				if (!q) return true;
				const p = this.project(t.project);
				return [t.id, t.client, p ? p.name : t.project, t.title, t.engineer && t.engineer.name, t.fsoOwner].join(" ").toLowerCase().includes(q);
			});
		}

		renderRegistry(d) {
			const st = this.ui.stage;
			return `<section class="sdd-card sdd-registry">
				<div class="sdd-registry__head">
					<div class="sdd-registry__t">
						<h3>Ticket master registry</h3>
						<span class="sdd-badge sdd-badge--slate sdd-badge--pill" data-role="reg-count"></span>
						${st ? `<button class="sdd-badge sdd-badge--sky sdd-badge--pill sdd-chipbtn" data-action="clear-stage" title="Show all stages">Stage ${st}: ${STAGE_SHORT[st - 1]} ${ICON.x}</button>` : ""}
						<span class="sdd-hint">${ICON.info}Click any row to open the ticket drawer</span>
					</div>
					<label class="sdd-search">${ICON.search}<input type="search" data-ui="q" value="${esc(this.ui.q)}" placeholder="Filter tickets by ID, client, engineer…" aria-label="Filter tickets"></label>
				</div>
				<div class="sdd-tablewrap"><table class="sdd-table">
					<thead><tr><th class="c-id">Ticket</th><th class="c-client">Client</th><th class="c-project">Project</th><th class="c-recv">Received</th><th class="c-act">Activity</th><th class="c c-lvl">Level</th><th class="c-due">SLA due by</th><th class="c c-sla">SLA status</th><th class="c-stage">Active stage</th><th class="c-wait">Waiting on</th><th class="c c-action"><span class="sdd-sr">Action</span></th></tr></thead>
					<tbody data-role="reg-body"></tbody>
				</table></div>
				<div class="sdd-registry__foot" data-role="reg-foot"></div>
			</section>`;
		}

		renderRegistryBody() {
			const body = this.view.querySelector('[data-role="reg-body"]');
			if (!body) return;
			const list = this.registryList();
			const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
			this.ui.page = Math.min(Math.max(1, this.ui.page), pages);
			const from = (this.ui.page - 1) * PAGE_SIZE;
			const rows = list.slice(from, from + PAGE_SIZE);
			const pill = { met: ["ok", "Met"], track: ["sky", "On track"], risk: ["warn", "At risk"], breached: ["bad", "Breached"] };
			body.innerHTML = rows.length
				? rows
					.map((t) => {
						const p = this.project(t.project);
						const sc = slaClass(t);
						const team = currentTeam(t);
						const s = stageOf(t);
						const open = this.ui.drawer === t.id;
						return `<tr class="sdd-tr${open ? " is-open" : ""}${sc === "breached" ? " is-breach" : ""}" data-action="open" data-id="${t.id}" role="button" tabindex="0" aria-label="Open ${t.id}">
								<td class="c-id"><span class="sdd-tid">${t.id}${sc === "risk" ? '<i class="sdd-pulse sdd-pulse--warn"></i>' : ""}</span></td>
								<td class="c-client sdd-strong" title="${esc(t.client)}">${esc(t.client)}</td>
								<td class="c-project" title="${esc(p ? p.name : t.project)}">${esc(p ? p.name : t.project)}</td>
								<td class="c-recv sdd-mono sdd-muted">${fmtShort(t.created, t.receivedTz || t.tz)}</td>
								<td class="c-act sdd-mono sdd-muted">${t.activityAt ? fmtDate(t.activityAt, t.tz) : "–"}</td>
								<td class="c c-lvl"><span class="sdd-lvl sdd-lvl--${t.priority}">${t.priority}</span></td>
								<td class="c-due sdd-mono ${sc === "breached" ? "is-bad" : "sdd-dim"}" title="${fmtDue(t.slaDue, t.tz)}">${fmtDue(t.slaDue, t.tz)}</td>
								<td class="c c-sla"><span class="sdd-spill sdd-spill--${pill[sc][0]}"><i></i>${pill[sc][1]}</span></td>
								<td class="c-stage"><span class="sdd-stage sdd-stage--${team || "closed"}"><i></i>${s === 11 ? "Closed" : `${s}. ${STAGE_SHORT[s - 1]}`}</span></td>
								<td class="c-wait sdd-wait sdd-wait--${team || "none"}">${team ? TEAMS[team].label : "–"}</td>
								<td class="c c-action"><span class="sdd-view sdd-view--${sc}">View →</span></td>
							</tr>`;
					})
					.join("")
				: `<tr><td colspan="11" class="sdd-empty-row">No tickets match. Clear the search or the stage filter.</td></tr>`;
			const count = this.view.querySelector('[data-role="reg-count"]');
			if (count) count.textContent = `${list.length} ${list.length === 1 ? "ticket" : "tickets"}${list.length !== this.state.tickets.length ? ` of ${this.state.tickets.length}` : " total"}`;
			const foot = this.view.querySelector('[data-role="reg-foot"]');
			if (foot) {
				const pageBtns = [];
				for (let i = 1; i <= pages; i++) {
					if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - this.ui.page) > 1) {
						if (pageBtns[pageBtns.length - 1] !== "…") pageBtns.push("…");
						continue;
					}
					pageBtns.push(i);
				}
				foot.innerHTML = `<div>Showing <b>${list.length ? from + 1 : 0}</b> to <b>${Math.min(from + PAGE_SIZE, list.length)}</b> of <b>${list.length}</b> tickets</div>
					<div class="sdd-pager">
						<button class="sdd-pg" data-action="page" data-page="${this.ui.page - 1}"${this.ui.page <= 1 ? " disabled" : ""} aria-label="Previous page">‹</button>
						${pageBtns.map((n) => (n === "…" ? `<span class="sdd-pg-gap">…</span>` : `<button class="sdd-pg${n === this.ui.page ? " is-on" : ""}" data-action="page" data-page="${n}" aria-current="${n === this.ui.page}">${n}</button>`)).join("")}
						<button class="sdd-pg" data-action="page" data-page="${this.ui.page + 1}"${this.ui.page >= pages ? " disabled" : ""} aria-label="Next page">›</button>
					</div>`;
			}
		}

		/* ---------- filter dropdowns ---------- */

		/** Options for each filter: an optional "All" row, a counted group, and two-line items with meta */
		ddConfig(key) {
			const dr = this.ui.draft;
			const f = this.ui.f;
			const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
			if (key === "client") {
				const clients = [...new Set(this.state.projects.map((p) => p.client))].sort();
				const active = new Set(this.state.projects.filter((p) => p.active).map((p) => p.client));
				return {
					label: "Client organization",
					search: "Search by client name",
					all: { value: "", label: "All clients", sub: `Company-wide view, ${active.size} active`, meta: plural(this.state.tickets.length, "ticket", "tickets") },
					group: `Clients (${clients.length})`,
					items: clients.map((c) => {
						const ps = this.state.projects.filter((p) => p.client === c);
						const levels = [...new Set(ps.map((p) => p.priority))].sort((a) => (a === "SBD" ? -1 : 1)).join(" and ");
						return { value: c, label: c, sub: `${plural(ps.length, "project", "projects")}, ${levels}${active.has(c) ? "" : ", inactive"}`, meta: plural(this.state.tickets.filter((t) => t.client === c).length, "ticket", "tickets") };
					}),
				};
			}
			if (key === "project") {
				const ps = this.state.projects.filter((p) => !dr.client || p.client === dr.client);
				return {
					label: "Service scope / project",
					search: "Search by project, client or code",
					all: { value: "", label: "All projects", sub: dr.client ? `Every project for ${dr.client}` : "Every project, all clients", meta: "" },
					group: `Projects (${ps.length})`,
					items: ps.map((p) => ({ value: p.code, label: p.name, sub: `${p.client}, ${p.priority}${p.active ? "" : ", inactive"}`, meta: p.code })),
				};
			}
			if (key === "period") {
				const today = fmtDate(nowIso(), TZ);
				return {
					label: "Time horizon",
					items: PERIODS.map(([v, l]) => {
						const s = this.periodStart(v);
						return { value: v, label: l, sub: s == null ? "Every ticket on record" : `${fmtDate(iso(s), TZ)} to ${today}` };
					}),
				};
			}
			// lifecycle status, counted within the applied client, project and period
			const pool = this.inWindow(this.scoped(f), f, this.periodStart(f.period), null);
			const count = (s) => pool.filter((t) => this.statusOk(t, s)).length;
			return {
				label: "Lifecycle status",
				items: [
					["all", "All tickets", "Open and closed"],
					["open", "Open / active", "Still moving through the workflow"],
					["closed", "Closed and paid", "Engineer paid, ticket closed"],
					["breached", "SLA breached / overdue", "Engineer late, or overdue and not on site"],
					["risk", "SLA at risk", "Open and close to the SLA due time"],
				].map(([v, l, s]) => ({ value: v, label: l, sub: s, meta: String(count(v)) })),
			};
		}

		ddFlat(key) {
			const cfg = this.ddConfig(key);
			const q = (this.ui.dd === key ? this.ui.ddQ : "").trim().toLowerCase();
			const hit = (o) => !q || [o.label, o.sub, o.meta].join(" ").toLowerCase().includes(q);
			const all = cfg.all && hit(cfg.all) ? [cfg.all] : [];
			return { cfg, all, items: cfg.items.filter(hit), list: all.concat(cfg.items.filter(hit)) };
		}

		renderDd(key) {
			const cfg = this.ddConfig(key);
			const val = this.ui.draft[key];
			const opts = (cfg.all ? [cfg.all] : []).concat(cfg.items);
			const cur = opts.find((o) => String(o.value) === String(val)) || opts[0];
			const open = this.ui.dd === key;
			const isDefault = String(val) === String(this.defaults()[key]);
			const text = key === "status" ? `${cur.label} (${cur.meta})` : cur.label;
			return `<div class="sdd-fl sdd-dd${open ? " is-open" : ""}" data-dd="${key}">
				<span id="sdd-dd-l-${key}">${cfg.label}</span>
				<button type="button" class="sdd-dd__btn${isDefault ? "" : " is-set"}" data-action="dd-toggle" data-key="${key}" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="sdd-dd-l-${key} sdd-dd-v-${key}">
					<span class="sdd-dd__val" id="sdd-dd-v-${key}">${esc(text)}</span>${ICON.chevron}
				</button>
				${open ? this.renderDdPop(key) : ""}
			</div>`;
		}

		renderDdPop(key) {
			const cfg = this.ddConfig(key);
			return `<div class="sdd-dd__pop" data-role="dd-pop">
				${cfg.search ? `<label class="sdd-dd__search">${ICON.search}<input type="text" data-ui="ddq" value="${esc(this.ui.ddQ)}" placeholder="${esc(cfg.search)}" aria-label="${esc(cfg.search)}" autocomplete="off" spellcheck="false"></label>` : ""}
				<div class="sdd-dd__list" role="listbox" aria-labelledby="sdd-dd-l-${key}" data-role="dd-list">${this.renderDdList(key)}</div>
			</div>`;
		}

		renderDdList(key) {
			const { cfg, all, items, list } = this.ddFlat(key);
			const val = String(this.ui.draft[key]);
			this.ui.ddActive = Math.min(Math.max(0, this.ui.ddActive), Math.max(0, list.length - 1));
			if (!list.length) return `<div class="sdd-dd__empty">No matches for “${esc(this.ui.ddQ.trim())}”</div>`;
			const opt = (o, i) => {
				const sel = String(o.value) === val;
				return `<div class="sdd-dd__opt${sel ? " is-sel" : ""}${i === this.ui.ddActive ? " is-act" : ""}" role="option" aria-selected="${sel}" id="sdd-dd-o-${key}-${i}" data-action="dd-pick" data-key="${key}" data-value="${esc(o.value)}" data-i="${i}">
					<span class="sdd-dd__txt"><b>${esc(o.label)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</span>
					${o.meta ? `<span class="sdd-dd__meta">${esc(o.meta)}</span>` : ""}
					<span class="sdd-dd__tick">${sel ? ICON.check : ""}</span>
				</div>`;
			};
			let i = 0;
			let html = all.map((o) => opt(o, i++)).join("");
			if (cfg.all && all.length && items.length) html += `<div class="sdd-dd__sep" role="separator"></div>`;
			if (cfg.group && items.length) html += `<div class="sdd-dd__group">${esc(cfg.group)}</div>`;
			html += items.map((o) => opt(o, i++)).join("");
			return html;
		}

		ddOpen(key) {
			this.ui.dd = key;
			this.ui.ddQ = "";
			const { list } = this.ddFlat(key);
			this.ui.ddActive = Math.max(0, list.findIndex((o) => String(o.value) === String(this.ui.draft[key])));
			this.render();
			const host = this.view.querySelector(`[data-dd="${key}"]`);
			const pop = host && host.querySelector('[data-role="dd-pop"]');
			if (pop) {
				// keep the panel inside the window on the right-hand filters
				const r = pop.getBoundingClientRect();
				if (r.right > window.innerWidth - 12) pop.classList.add("is-right");
				const input = pop.querySelector('[data-ui="ddq"]');
				(input || host.querySelector(".sdd-dd__btn")).focus({ preventScroll: true });
				this.ddScrollActive();
			}
		}
		ddClose(focusTrigger) {
			const key = this.ui.dd;
			if (!key) return;
			this.ui.dd = null;
			this.ui.ddQ = "";
			this.render();
			if (focusTrigger) {
				const btn = this.view.querySelector(`[data-dd="${key}"] .sdd-dd__btn`);
				if (btn) btn.focus({ preventScroll: true });
			}
		}
		ddPick(key, value) {
			this.ui.draft[key] = value;
			if (key === "client" && value !== this.ui.f.client) this.ui.draft.project = "";
			this.ddClose(true);
		}
		ddRefreshList() {
			const list = this.view.querySelector('[data-role="dd-list"]');
			if (list && this.ui.dd) list.innerHTML = this.renderDdList(this.ui.dd);
			this.ddScrollActive();
		}
		ddScrollActive() {
			const act = this.view.querySelector(".sdd-dd__opt.is-act");
			if (act) act.scrollIntoView({ block: "nearest" });
		}
		/** Keyboard support while a dropdown is open; returns true when the key was handled */
		ddKey(e) {
			const key = this.ui.dd;
			if (!key) return false;
			const { list } = this.ddFlat(key);
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.ddClose(true);
				return true;
			}
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				if (!list.length) return true;
				this.ui.ddActive = (this.ui.ddActive + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
				this.ddRefreshList();
				return true;
			}
			if (e.key === "Home" || e.key === "End") {
				if (e.target.matches('[data-ui="ddq"]')) return false;
				e.preventDefault();
				this.ui.ddActive = e.key === "Home" ? 0 : list.length - 1;
				this.ddRefreshList();
				return true;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				const o = list[this.ui.ddActive];
				if (o) this.ddPick(key, String(o.value));
				return true;
			}
			if (e.key === "Tab") {
				this.ui.dd = null;
				this.ui.ddQ = "";
				this.render();
				return false;
			}
			return false;
		}

		/* ---------- export ---------- */

		exportCsv(audit) {
			const list = audit ? this.data.ts : this.registryList();
			const cell = (v) => {
				const s = String(v == null ? "" : v);
				return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
			};
			let rows;
			if (audit) {
				rows = [["Ticket", "Client", "Project", "Level", "Received", "SLA due", "Engineer on site", "Minutes before due (negative = late)", "SLA result", "Stage"]].concat(
					list.map((t) => {
						const p = this.project(t.project);
						const diff = t.onSiteAt ? Math.round((Date.parse(t.slaDue) - Date.parse(t.onSiteAt)) / 60000) : "";
						return [t.id, t.client, p ? p.name : t.project, t.priority, fmtFull(t.created, t.receivedTz || t.tz), fmtFull(t.slaDue, t.tz), t.onSiteAt ? fmtFull(t.onSiteAt, t.tz) : "", diff, SEG_LABEL[slaClass(t)], STAGE_SHORT[stageOf(t) - 1]];
					})
				);
			} else {
				rows = [["Ticket", "Client", "Project", "Title", "Received", "Activity", "Level", "SLA due by", "SLA status", "Active stage", "Waiting on", "Engineer", "FSO owner"]].concat(
					list.map((t) => {
						const p = this.project(t.project);
						const team = currentTeam(t);
						return [t.id, t.client, p ? p.name : t.project, t.title || "", fmtShort(t.created, t.receivedTz || t.tz), t.activityAt ? fmtDate(t.activityAt, t.tz) : "", t.priority, fmtDue(t.slaDue, t.tz), SEG_LABEL[slaClass(t)], STAGE_SHORT[stageOf(t) - 1], team ? TEAMS[team].label : "", (t.engineer && t.engineer.name) || "", t.fsoOwner || ""];
					})
				);
			}
			const blob = new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${audit ? "sla-audit" : "dispatch-tickets"}-${ymdIn(nowIso(), TZ)}.csv`;
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				URL.revokeObjectURL(a.href);
				a.remove();
			}, 500);
			this.toast(`Exported ${list.length} ${list.length === 1 ? "ticket" : "tickets"}`, "ok");
		}

		/* ---------- ticket drawer ---------- */

		openDrawer(id) {
			if (!this.ticket(id)) return;
			const wasOpen = !!this.ui.drawer;
			if (this.ui.drawer !== id) this.ui.pipeOpen = false;
			this.ui.drawer = id;
			this.renderDrawer();
			this.renderRegistryBody();
			if (!wasOpen) {
				const btn = this.drawerHost.querySelector('[data-action="close"].sdd-icon');
				if (btn) btn.focus({ preventScroll: true });
			}
		}
		closeDrawer() {
			const id = this.ui.drawer;
			this.ui.drawer = null;
			this.renderDrawer();
			this.renderRegistryBody();
			const row = id && this.view.querySelector(`tr[data-id="${id}"]`);
			if (row) row.focus({ preventScroll: true });
		}

		urgency(t) {
			const s = slaInfo(t);
			const due = Date.parse(t.slaDue);
			if (s.key === "met") return ["ok", `SLA met, engineer on site ${dur(due - Date.parse(t.onSiteAt))} early`];
			if (s.key === "missed") return ["bad", `SLA missed, engineer arrived ${dur(Date.parse(t.onSiteAt) - due)} late`];
			if (s.key === "breached") return ["bad", `SLA breached, ${dur(Date.now() - due)} overdue`];
			if (s.key === "risk") return ["warn", `${dur(due - Date.now())} remaining`];
			return ["ok", `${dur(due - Date.now())} remaining`];
		}

		renderDrawer() {
			const t = this.ui.drawer && this.ticket(this.ui.drawer);
			this.ensureDrawerShell();
			if (!t) return this.animateDrawerClosed();
			const p = this.project(t.project);
			const sc = slaClass(t);
			const team = currentTeam(t);
			const cur = stageOf(t);
			const pct = Math.round((cur / 11) * 100);
			const [utone, utext] = this.urgency(t);
			const slaPill = { met: ["ok", "Met"], track: ["sky", "On track"], risk: ["warn", "At risk"], breached: ["bad", slaInfo(t).key === "missed" ? "Missed" : "Breached"] }[sc];
			const doneAt = {};
			(t.history || []).forEach((h) => (doneAt[h.step] = h.at));

			// pipeline
			const visibleTo = this.ui.pipeOpen ? 11 : Math.max(4, Math.min(11, cur + 1));
			const stages = STAGES.filter((s) => s.n <= visibleTo)
				.map((s, idx) => {
					const done = s.n < cur || (s.n === 11 && t.closed);
					const now = s.n === cur && !t.closed;
					const state = done ? "done" : now ? "now" : "todo";
					const owner = s.team ? TEAMS[s.team].label : "System";
					const when = done ? (doneAt[s.n] ? fmtShort(doneAt[s.n], TZ) : s.n === 11 && t.closedAt ? fmtShort(t.closedAt, TZ) : "Done") : now ? "Now" : "Upcoming";
					const desc = s.n === CLOCK_STOP_STAGE ? `${s.desc}. The SLA clock stops when the engineer checks in on site.` : s.desc;
					return `<li class="sdd-pl sdd-pl--${state}" style="--i:${idx}">
						<span class="sdd-pl__mk">${done ? ICON.check : s.n}</span>
						<div class="sdd-pl__b">
							<div class="sdd-pl__top">
								<span class="sdd-pl__t">${s.n}. ${s.n === 11 ? "Closed" : esc(s.title)}${now ? '<em class="sdd-pl__cur">Current</em>' : ""}${s.n === CLOCK_STOP_STAGE ? `<em class="sdd-pl__clock">${ICON.clock}SLA clock stop</em>` : ""}</span>
								<span class="sdd-pl__st sdd-pl__st--${state}">${done ? "Completed" : now ? "In progress" : "Pending"}</span>
							</div>
							<p>${esc(desc)}</p>
							<div class="sdd-pl__meta"><span class="sdd-pl__tags"><span class="sdd-pl__own">${owner}</span><em>${STAGE_NOTE[s.n - 1]}</em></span><span class="sdd-mono">${done ? "✓ " : ""}${when}</span></div>
						</div>
					</li>`;
				})
				.join("");

			// stakeholders
			const people = [
				["Assigned FSO", t.engineer && t.engineer.name, t.engineer && t.engineer.phone, "sky"],
				["Service Delivery Mgr", p && p.sdm, "SDM lead • " + (p ? p.client : ""), "purple"],
				["FSO owner", t.fsoOwner, "Field service operations", "teal"],
				["Site contact", t.contact && t.contact.name, t.contact && (t.contact.phone || t.contact.email), "slate"],
			].filter((x) => x[1]);

			// activity
			const log = (t.log || []).slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

			const due = fmtDue(t.slaDue, t.tz);
			const inner = `
				<div class="sdd-dh">
					<div class="sdd-dh__top">
						<div class="sdd-dh__id">
							<div class="sdd-dh__row">
								<h2>${t.id}</h2>
								<span class="sdd-spill sdd-spill--${slaPill[0]} sdd-spill--lg"><i></i>${slaPill[1]}</span>
								<span class="sdd-lvl sdd-lvl--${t.priority}">${t.priority}</span>
							</div>
							<p>${esc(p ? p.name : t.project)} • ${esc(t.client)}</p>${t.title && (!p || t.title !== p.name) ? `<p class="sdd-dh__act" title="Activity">${esc(t.title)}</p>` : ""}
						</div>
						<div class="sdd-dh__btns">
							<button class="sdd-icon" data-action="close" title="Close (Esc)">${ICON.x}</button>
						</div>
					</div>
				</div>
				<div class="sdd-db">
					<div class="sdd-ov">
						<div><span>Client name</span><b>${esc(t.client)}</b></div>
						<div><span>Project</span><b class="sdd-trunc">${esc(p ? p.name : t.project)}</b></div>
						<div><span>Received at</span><b class="sdd-mono sdd-fw4">${fmtShort(t.created, t.receivedTz || t.tz)}</b></div>
						<div><span>Currently waiting on</span><b class="sdd-ov__wait"><i class="sdd-dot sdd-dot--team-${team || "closed"}"></i>${team ? TEAMS[team].label : "Nobody, ticket closed"}</b></div>
						<div class="sdd-ov__due">
							<div><span>SLA commitment due time</span><b class="sdd-mono">${due}</b></div>
							<span class="sdd-urg sdd-urg--${utone}">${utone === "ok" && !t.onSiteAt ? "⏳ " : ""}${esc(utext)}</span>
						</div>
					</div>

					<div class="sdd-sec">
						<div class="sdd-sec__head">
							<div><h4>11-stage lifecycle pipeline</h4><span class="sdd-mono sdd-chip">Stage ${cur} of 11 (${pct}%)</span></div>
							<span class="sdd-tagx sdd-tagx--sky">${t.closed ? "Closed" : `Active: ${cur}. ${esc(STAGE_SHORT[cur - 1])}`}</span>
						</div>
						<div class="sdd-prog"><span style="width:${pct}%"></span></div>
						<div class="sdd-plbox">
							<ol class="sdd-plist">${stages}</ol>
							<button class="sdd-pl__more" data-action="pipe-toggle" aria-expanded="${this.ui.pipeOpen}">
								${this.ui.pipeOpen ? "Collapse to active stages" : visibleTo < 11 ? `View all 11 stages (${STAGE_SHORT.slice(visibleTo).join(", ")})` : "Show full 11-stage timeline"}
								<span class="${this.ui.pipeOpen ? "is-up" : ""}">${ICON.chevron}</span>
							</button>
						</div>
					</div>

					<div class="sdd-sec">
						<h4>Stakeholders &amp; contacts</h4>
						<div class="sdd-people">${people.length
					? people
						.map(
							([role, name, sub, tone]) => `<div class="sdd-person">
									<span class="sdd-av sdd-av--${tone}">${esc(initials(name))}</span>
									<div><span>${role}</span><b>${esc(name)}</b><em class="${tone === "sky" ? "sdd-mono is-sky" : ""}">${esc(sub || "")}</em></div>
								</div>`
						)
						.join("")
					: `<p class="sdd-muted">No one assigned yet.</p>`
				}</div>
					</div>

					<div class="sdd-sec">
						<h4>Recent ticket activity</h4>
						<div class="sdd-act">${log.length
					? log
						.map(
							(l, i) => `<div class="sdd-act__i">
									<i class="sdd-dot ${i === 0 ? "sdd-dot--track" : "sdd-dot--muted"}"></i>
									<div><b>${esc(l.title)}${l.team && TEAMS[l.team] ? ` <span class="sdd-muted sdd-fw4">by ${TEAMS[l.team].label}</span>` : ""}</b><span>${fmtFull(l.at, TZ)}${l.text ? " • " + esc(l.text) : ""}</span></div>
								</div>`
						)
						.join("")
					: `<p class="sdd-muted">No activity recorded yet.</p>`
				}</div>
					</div>

				</div>
				<div class="sdd-df">
					<span title="${p ? (t.priority === "SBD" ? `Same business day when received before ${esc(p.sbdCutoff)}, otherwise next business day` : "Next business day") : ""}">Contract SLA: <b>${p ? `${t.priority} On-Site by ${esc(p.onSiteBy)} ${tzAbbr(p.tz)}` : t.priority}</b></span>
					<button class="sdd-btn sdd-btn--sm" data-action="close">Dismiss</button>
				</div>`;
			this.mountDrawer(t, inner);
		}

		/* ---------- drawer shell and motion ---------- */

		/** The drawer and backdrop are created once and kept, so opening and closing can animate */
		ensureDrawerShell() {
			if (this.dEl && this.drawerHost.contains(this.dEl)) return;
			this.drawerHost.innerHTML = `<div class="sdd-backdrop" data-action="close" aria-hidden="true"></div><aside class="sdd-drawer" role="dialog" aria-hidden="true" tabindex="-1"></aside>`;
			this.dBack = this.drawerHost.firstElementChild;
			this.dEl = this.drawerHost.lastElementChild;
			this.dEl.addEventListener("transitionend", (e) => {
				if (e.target === this.dEl && e.propertyName === "transform" && !this.dEl.classList.contains("is-open")) this.clearDrawer();
			});
		}
		clearDrawer() {
			if (this.dEl.classList.contains("is-open")) return;
			this.dEl.classList.remove("is-closing");
			this.dEl.innerHTML = "";
			this.dShownId = null;
		}
		mountDrawer(t, inner) {
			const el = this.dEl;
			const back = this.dBack;
			const wasOpen = el.classList.contains("is-open");
			const same = this.dShownId === t.id;
			const oldBody = el.querySelector(".sdd-db");
			const scroll = same && oldBody ? oldBody.scrollTop : 0;
			clearTimeout(this.dTimer);
			el.innerHTML = inner;
			const body = el.querySelector(".sdd-db");
			if (body) body.scrollTop = scroll;
			el.setAttribute("aria-label", `Ticket ${t.id}`);
			el.setAttribute("aria-modal", "true");
			el.setAttribute("aria-hidden", "false");
			el.classList.remove("is-closing");
			back.classList.add("is-open");
			if (!wasOpen) {
				// start from the closed position, then slide in on the next frame
				el.classList.remove("is-swap");
				el.classList.add("is-entering");
				void el.offsetWidth;
				el.classList.add("is-open");
				this.dTimer = setTimeout(() => el.classList.remove("is-entering"), 1000);
			} else if (!same) {
				// another ticket while open: cross-fade the content
				el.classList.remove("is-swap", "is-entering");
				void el.offsetWidth;
				el.classList.add("is-swap");
				this.dTimer = setTimeout(() => el.classList.remove("is-swap"), 450);
			}
			this.dShownId = t.id;
		}
		animateDrawerClosed() {
			const el = this.dEl;
			if (!el.classList.contains("is-open")) return;
			clearTimeout(this.dTimer);
			el.classList.remove("is-open", "is-entering", "is-swap");
			el.classList.add("is-closing");
			el.setAttribute("aria-hidden", "true");
			this.dBack.classList.remove("is-open");
			// fallback for when no transition runs (reduced motion)
			this.dTimer = setTimeout(() => this.clearDrawer(), 420);
		}

	}

	/* ------------------------------------------------------------------ */
	/* Frappe page bootstrap                                               */
	/* ------------------------------------------------------------------ */

	// Page route is "service-delivery" (folder: service_delivery). Both names are handled.
	const pageRef = frappe.pages["service-delivery"] || frappe.pages["service_delivery"];

	pageRef.on_page_load = function (wrapper) {
		const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Service Delivery Dispatch"), single_column: true });
		$(wrapper).addClass("sdd-page");
		$(wrapper).find(".page-head").addClass("sdd-hide");
		$(wrapper).find(".page-body").addClass("sdd-page-body");
		if (!document.getElementById("sdd-fonts")) {
			const link = document.createElement("link");
			link.id = "sdd-fonts";
			link.rel = "stylesheet";
			link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
			document.head.appendChild(link);
		}
		const mount = page.main && page.main[0] ? page.main[0] : page.main;
		wrapper.sdd_dashboard = new ExecDashboard(mount);
	};

	pageRef.on_page_show = function (wrapper) {
		if (wrapper.sdd_dashboard) wrapper.sdd_dashboard.refresh();
	};
})();