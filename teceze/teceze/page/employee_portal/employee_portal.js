frappe.pages["employee-portal"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: "Employee Portal",
		single_column: true,
	});

	load_my_files();
};


function load_my_files() {
	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "File",
			fields: [
				"name",
				"file_name",
				"file_url",
				"is_private",
				"creation"
			],
			filters: {
				file_name: ["like", "%.pdf"]
			},
			order_by: "creation desc",
			limit_page_length: 10
		},
		callback: function (r) {
			if (r.message) {
				render_my_files(r.message);
			}
		}
	});
}


function render_my_files(files) {
	const container = document.getElementById("my-files-list");

	if (!container) {
		return;
	}

	if (!files.length) {
		container.innerHTML = `
			<div class="text-muted text-center">
				No PDF files found.
			</div>
		`;
		return;
	}

	container.innerHTML = files.map(file => `
		<div class="my-file-item">

			<div class="my-file-info">

				<div class="my-file-icon">
					📄
				</div>

				<div>
					<div class="my-file-name">
						${frappe.utils.escape_html(file.file_name)}
					</div>

					<div class="my-file-type">
						PDF Document
					</div>
				</div>

			</div>

			<a
				href="${file.file_url}"
				target="_blank"
				class="btn btn-sm btn-default my-file-open"
			>
				Open
			</a>

		</div>
	`).join("");
}