frappe.ui.form.on("Sales Target Assignment", {
    refresh(frm) {
        // render_target_dashboard(frm);
    },

    sales_person(frm) {
        // render_target_dashboard(frm);
        calculate_sales_targets(frm);

    },

    start_date(frm) {
        // render_target_dashboard(frm);
        // calculate_sales_targets(frm);

    },

    to_date(frm) {
        // render_target_dashboard(frm);
        // calculate_sales_targets(frm);

    }
});
var TARGET_TIMES=20
var LEAD_TARGET=100
var CALLS=150
var EMAIL=200

async function calculate_sales_targets(frm) {

    if (!frm.doc.sales_person) {
        return;
    }

    frappe.dom.freeze("Calculating sales targets...");

    try {

        
        // Get Latest Salary Structure Assignment
        

        const salary_assignment = await frappe.db.get_list(
            "Salary Structure Assignment",
            {
                filters: {
                    employee: frm.doc.sales_person,
                    docstatus: 1
                },
                fields: [
                    "name",
                    "ctc",
                    "from_date"
                ],
                order_by: "from_date desc",
                limit: 1
            }
        );

        if (!salary_assignment.length) {
            frappe.msgprint(
                "No submitted Salary Structure Assignment found for this employee."
            );
            return;
        }

        const ctc = flt(salary_assignment[0].ctc);

        if (!ctc) {
            frappe.msgprint(
                "CTC is not available in the Salary Structure Assignment."
            );
            return;
        }

        // Calculate Yearly Target
        
        const yearly_target = ctc * TARGET_TIMES;

        // Calculate Period Targets

        const monthly_target = yearly_target / 12;

        const quarterly_target = yearly_target / 4;

        const half_yearly_target = yearly_target / 2;


        
        // Clear Existing Target Details
        

        frm.clear_table("target_details");


                        
                        add_target_row(
                    frm,
                    "Sales Amount",
                    "Monthly",
                    monthly_target,
                    "Amount",
                    ""
                );

                add_target_row(
                    frm,
                    "Sales Amount",
                    "Quarterly",
                    quarterly_target,
                    "Amount",
                    ""
                );

                add_target_row(
                    frm,
                    "Sales Amount",
                    "Half-Yearly",
                    half_yearly_target,
                    "Amount",
                    ""
                );

                add_target_row(
                    frm,
                    "Sales Amount",
                    "Yearly",
                    yearly_target,
                    "Amount",
                    ""
                );
                add_target_row(
                    frm,
                    "Calls",
                    "Daily",
                    CALLS,
                    "Count",
                    ""
                );

                add_target_row(
                    frm,
                    "Email",
                    "Daily",
                    EMAIL,
                    "Count",
                    ""
                );

                add_target_row(
                    frm,
                    "Lead Generation",
                    "Daily",
                    LEAD_TARGET,
                    "Count",
                    ""
                );
        
        // Refresh Child Table
        

        frm.refresh_field("target_details");


        
        // Show Summary
        

        frappe.show_alert({
            message:
                `CTC: ${format_currency(ctc)}
                 | Yearly Target: ${format_currency(yearly_target)}`,
            indicator: "green"
        });

    } finally {

        frappe.dom.unfreeze();

    }
}


function add_target_row(
    frm,
    target_type,
    period_type,
    target_value,
    uom = "",
    currency = ""
) {
    const row = frm.add_child("target_details");

    row.target_type = target_type;
    row.period_type = period_type;
    row.target_value = flt(target_value);
    row.uom = uom;
    row.currency = currency;
}


// Currency Formatting


function format_currency(value) {

    return frappe.format(
        value,
        {
            fieldtype: "Currency",
            currency: "INR"
        }
    );

}
function render_target_dashboard(frm) {

    const wrapper = frm.fields_dict.dashboard.$wrapper;

    wrapper.html(`
        <div style="
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        ">

            <div style="
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 20px;
            ">
                Target Dashboard
            </div>

            <div style="
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 20px;
            ">

                <div style="
                    background: white;
                    border-radius: 10px;
                    padding: 15px;
                    border: 1px solid #e5e7eb;
                ">
                    <div id="sales-target-gauge"
                         style="width:100%; height:280px;">
                    </div>
                </div>

                <div style="
                    background: white;
                    border-radius: 10px;
                    padding: 15px;
                    border: 1px solid #e5e7eb;
                ">
                    <div id="calls-target-gauge"
                         style="width:100%; height:280px;">
                    </div>
                </div>

                <div style="
                    background: white;
                    border-radius: 10px;
                    padding: 15px;
                    border: 1px solid #e5e7eb;
                ">
                    <div id="overall-target-gauge"
                         style="width:100%; height:280px;">
                    </div>
                </div>

            </div>

            

        </div>
    `);


    // Load ECharts if not already loaded
    if (!window.echarts) {

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js";

        script.onload = function () {
            create_target_gauges();
        };

        document.head.appendChild(script);

    } else {

        create_target_gauges();

    }
}


function create_target_gauges() {

    // -----------------------------
    // FAKE DATA
    // -----------------------------

    const sales_completion = 72;

    const calls_completion = 81;

    const overall_completion = 76;


    // -----------------------------
    // SALES GAUGE
    // -----------------------------

    const sales_chart = echarts.init(
        document.getElementById("sales-target-gauge")
    );

    sales_chart.setOption({

        series: [{
            type: "gauge",

            startAngle: 210,
            endAngle: -30,

            min: 0,
            max: 100,

            progress: {
                show: true,
                width: 18
            },

            axisLine: {
                lineStyle: {
                    width: 18
                }
            },

            pointer: {
                show: true,
                length: "60%",
                width: 5
            },

            axisTick: {
                show: false
            },

            splitLine: {
                show: false
            },

            axisLabel: {
                show: false
            },

            anchor: {
                show: true
            },

            title: {
                show: true,
                offsetCenter: [0, "55%"],
                fontSize: 15
            },

            detail: {
                valueAnimation: true,
                fontSize: 32,
                offsetCenter: [0, "5%"],
                formatter: "{value}%"
            },

            data: [{
                value: sales_completion,
                name: "Sales Target"
            }]
        }]
    });


    // -----------------------------
    // CALL GAUGE
    // -----------------------------

    const calls_chart = echarts.init(
        document.getElementById("calls-target-gauge")
    );

    calls_chart.setOption({

        series: [{
            type: "gauge",

            startAngle: 210,
            endAngle: -30,

            min: 0,
            max: 100,

            progress: {
                show: true,
                width: 18
            },

            axisLine: {
                lineStyle: {
                    width: 18
                }
            },

            pointer: {
                show: true,
                length: "60%",
                width: 5
            },

            axisTick: {
                show: false
            },

            splitLine: {
                show: false
            },

            axisLabel: {
                show: false
            },

            anchor: {
                show: true
            },

            title: {
                show: true,
                offsetCenter: [0, "55%"],
                fontSize: 15
            },

            detail: {
                valueAnimation: true,
                fontSize: 32,
                offsetCenter: [0, "5%"],
                formatter: "{value}%"
            },

            data: [{
                value: calls_completion,
                name: "Call Target"
            }]
        }]
    });


    // -----------------------------
    // OVERALL GAUGE
    // -----------------------------

    const overall_chart = echarts.init(
        document.getElementById("overall-target-gauge")
    );

    overall_chart.setOption({

        series: [{
            type: "gauge",

            startAngle: 210,
            endAngle: -30,

            min: 0,
            max: 100,

            progress: {
                show: true,
                width: 18
            },

            axisLine: {
                lineStyle: {
                    width: 18
                }
            },

            pointer: {
                show: true,
                length: "60%",
                width: 5
            },

            axisTick: {
                show: false
            },

            splitLine: {
                show: false
            },

            axisLabel: {
                show: false
            },

            anchor: {
                show: true
            },

            title: {
                show: true,
                offsetCenter: [0, "55%"],
                fontSize: 15
            },

            detail: {
                valueAnimation: true,
                fontSize: 32,
                offsetCenter: [0, "5%"],
                formatter: "{value}%"
            },

            data: [{
                value: overall_completion,
                name: "Overall"
            }]
        }]
    });


    // Resize charts when window changes
    window.addEventListener("resize", function () {

        sales_chart.resize();
        calls_chart.resize();
        overall_chart.resize();

    });
}