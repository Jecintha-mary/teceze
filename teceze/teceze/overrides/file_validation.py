import mimetypes
import os

import filetype
import frappe
from frappe import _

def check_file(file_name, content, doctype, docname):
	file_name = file_name or ""
	mime = mimetypes.guess_type(file_name)[0]
	ext = (mime and mimetypes.guess_extension(mime)) or os.path.splitext(file_name)[1]
	file_type = ext.lstrip(".").upper() or None
	allowed = (frappe.get_system_settings("allowed_file_extensions") or "").splitlines()
	content = (content.encode() if isinstance(content, str) else content) or b""
	kind = filetype.guess(content)  

	if allowed and file_type not in allowed:
		reason = _("File type {0} is not allowed. Allowed types: {1}").format(file_type or _("(none)"), ", ".join(allowed))
	elif mime and filetype.get_type(mime=mime) and getattr(kind, "mime", None) != mime:
		reason = _("{0} is not a valid {1} file.").format(file_name, file_type)
	else:
		return

	actual = kind.extension.upper() if kind else "UNKNOWN"   
	frappe.log_error(
		title=f"File upload rejected: uploaded as {file_type}, actual {actual} - {file_name}",
		message=(
			f"User: {frappe.session.user}\nIP: {getattr(frappe.local, 'request_ip', None)}\n"
			f"Attached to: {doctype} {docname}\nFile: {file_name}\n"
			f"Uploaded as: {file_type}\nActual content: {actual} (starts with {content[:40]!r})\nReason: {reason}"
		),
		reference_doctype=doctype,
		reference_name=docname,
	)
	frappe.throw(reason, title=_("Invalid File"))


def validate_upload_request():
	file = frappe.request.files.get("file")
	if file:
		check_file(file.filename, file.stream.read(8192), frappe.form_dict.doctype, frappe.form_dict.docname)
		file.stream.seek(0) 

def validate_uploaded_file(doc, method=None):
	if not frappe.request or doc.is_folder or (doc.file_url or "").startswith(("http://", "https://")):
		return
	check_file(doc.file_name, doc.get_content(), doc.attached_to_doctype, doc.attached_to_name)
