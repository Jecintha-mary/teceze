frappe.ui.form.on("Sales Target Assignment", {
    refresh(frm) {
        render_target_dashboard(frm);
    },

    sales_person(frm) {
        render_target_dashboard(frm);
    },

    start_date(frm) {
        render_target_dashboard(frm);
    },

    to_date(frm) {
        render_target_dashboard(frm);
    }
});


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