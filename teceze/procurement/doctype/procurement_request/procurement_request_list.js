frappe.listview_settings["Procurement Request"] = {

	add_fields: [
		"status",
		"priority"
	],


	get_indicator: function (doc) {

		if (doc.status === "Open") {

			return [
				__("Open"),
				"orange",
				"status,=,Open"
			];

		}

		else if (doc.status === "Pending") {

			return [
				__("Pending"),
				"blue",
				"status,=,Pending"
			];

		}

		else if (doc.status === "Approved") {

			return [
				__("Approved"),
				"green",
				"status,=,Approved"
			];

		}

		else if (doc.status === "Closed") {

			return [
				__("Closed"),
				"gray",
				"status,=,Closed"
			];

		}

		else if (doc.status === "Rejected") {

			return [
				__("Rejected"),
				"red",
				"status,=,Rejected"
			];

		}

	},


	formatters: {

		priority: function(value) {


			if (value === "Urgent") {

				return `<span class="indicator-pill red">${value}</span>`;

			}


			else if (value === "High") {

				return `<span class="indicator-pill orange">${value}</span>`;

			}


			else if (value === "Medium") {

				return `<span class="indicator-pill blue">${value}</span>`;

			}


			else if (value === "Low") {

				return `<span class="indicator-pill green">${value}</span>`;

			}


			return value;

		}

	}

};