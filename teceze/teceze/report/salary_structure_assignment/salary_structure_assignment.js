frappe.query_reports["Salary Structure Assignment"] = {

    filters: [

        {
            fieldname: "employee",
            label: "Employee ID",
            fieldtype: "Link",
            options: "Employee"
        },

        {
            fieldname: "employee_name",
            label: "Employee Name",
            fieldtype: "Data"
        },

        {
            fieldname: "department",
            label: "Department",
            fieldtype: "Link",
            options: "Department"
        },

        {
            fieldname: "designation",
            label: "Designation",
            fieldtype: "Link",
            options: "Designation"
        },

        {
            fieldname: "employee_status",
            label: "Employee Status",
            fieldtype: "Select",
            options: [
                "Active",
                "Inactive",
                "All"
            ],
            default: "Active"
        },

        {
            fieldname: "from_date",
            label: "From Date",
            fieldtype: "Date"
        }
    ],

    formatter: function (
        value,
        row,
        column,
        data,
        default_formatter
    ) {

        value = default_formatter(
            value,
            row,
            column,
            data
        );

        if (!data) {
            return value;
        }

        if (
            column.fieldtype === "Currency" &&
            typeof value === "string"
        ) {
            value = value.replace(/\.00(?=<|$)/, "");
        }

        if (column.fieldname === "net_pay") {
            return `<span style="
                color: #0284c7;
                font-weight: 700;
            ">${value}</span>`;
        }

        return value;
    }
};