
frappe.treeview_settings["Lead"] = {
    title: __("Lead Qualification Hierarchy"),
    breadcrumb: "CRM",

    // Python method to generate hierarchy
    get_tree_nodes: "teceze.teceze.overrides.lead.get_children",

    // Hierarchy filters
    filters: [
        {
            fieldname: "custom_client_company",
            fieldtype: "Link",
            options: "Client",
            label: __("Client Company"),
            reqd: 1
        },
        {
            fieldname: "service_vertical",
            fieldtype: "Link",
            options: "Service Vertical",
            label: __("Service Vertical"),
            reqd: 1
        },
        {
            fieldname: "custom_region_name",
            fieldtype: "Link",
            options: "Region",
            label: __("Region"),
            reqd: 1
        }
    ],

    onload: function(treeview) {
        console.log("Lead Qualification Hierarchy loaded");

        treeview.page.set_primary_action(
            __("Refresh"),
            function() {
                treeview.make_tree();
            },
            "refresh"
        );
    },

    onrender: function(node) {
        // Render individual hierarchy nodes
    },

    click: function(node) {
        console.log("Selected node:", node);
    }
};
