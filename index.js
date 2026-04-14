const party_consti_url = "src/party_consti3.csv";
const tile_grid_url = "src/tile_grid.csv";
const province_encoding_url = "src/province_encoding.csv";
const region_mapping_url = "src/region_mapping.csv";
const benford_url = "src/benford.json";
const partylist1_url = "src/partylist1.csv";
const consti1_url = "src/consti1.csv";

const chart3PartyNumbers = [1, 2, 3, 4, 5, 7, 8];

const BENFORD_THEORETICAL_PERCENT = {
    1: 30.1,
    2: 17.6,
    3: 12.5,
    4: 9.7,
    5: 7.9,
    6: 6.7,
    7: 5.8,
    8: 5.1,
    9: 4.6,
};

const tileGridMap = document.getElementById("tileGridMap");
const partyLegend = document.getElementById("partyLegend");
const metricSelector = document.getElementById("metricSelector");
const regionFilter = document.getElementById("regionFilter");
const constituencySearch = document.getElementById("constituencySearch");
const constituencyList = document.getElementById("constituencyList");
const benfordChart = document.getElementById("benfordChart");
const benfordTooltip = document.getElementById("benfordTooltip");
const benfordPartyFilter = document.getElementById("benfordPartyFilter");
const mapResetButton = document.getElementById("mapResetButton");
const tileHoverTooltip = document.getElementById("tileHoverTooltip");
const overviewPanel = document.getElementById("overviewPanel");
const landingRotator = document.getElementById("landingRotator");
const detailPopup = document.getElementById("detailPopup");
const popupClose = document.getElementById("popupClose");
const popupTitle = document.getElementById("popupTitle");
const chart3Root = document.getElementById("chart3");
const toggleConstituency = document.getElementById("toggleConstituency");
const togglePartyList = document.getElementById("togglePartyList");
const popupElectionResultList = document.getElementById("popupElectionResultList");
const popupSummaryRows = document.getElementById("popupSummaryRows");

const excludedWinnerPartyLabels = new Set(["Unknown", "ไม่มีข้อมูล"]);

const metricOptions = [
    { key: "winner", label: "สส. เขต" },
    { key: "ballot_difference", label: "ผลต่างของจำนวนบัตรเลือกตั้ง" },
    { key: "turnout", label: "สัดส่วนผู้ออกมาใช้สิทธิ์" },
    { key: "discrepancy", label: "บัตรผี / บัตรหาย" },
    { key: "overall_score", label: "คะแนนรวม" },
];

const overallScoreMetricKeys = ["ballot_difference", "turnout", "discrepancy"];
const popupMetricPanels = [
    {
        metricKey: "turnout",
        containerId: "popupBeeswarmTurnout",
    },
];

const state = {
    selectedMetric: "winner",
    selectedRegion: "all",
    selectedPartyForBenford: "overall",
    searchQuery: "",
    records: [],
    recordByKey: new Map(),
    benfordData: null,
    gridRows: [],
    provincesByAcronym: new Map(),
    provinceThaiNameByAcronym: new Map(),
    provinceThaiNameByCode: new Map(),
    regionByProvinceCode: new Map(),
    regionLabels: new Map(),
    chart3ByConstituency: new Map(),
    chart3SmallPartyNames: new Set(),
    popupVoteTrack: "constituency",
    popupActiveRecordKey: null,
    constituencyVotesByKey: new Map(),
    partyListVotesByKey: new Map(),
    winningRepresentativeNumberByKey: new Map(),
    overallScoreWeights: {
        ballot_difference: 1 / 3,
        turnout: 1 / 3,
        discrepancy: 1 / 3,
    },
    overallScoreDomains: null,
    overallScoreTurnoutMean: null,
    mapView: {
        scale: 1,
        translateX: 0,
        translateY: 0,
        minScale: 0.25,
        maxScale: 6,
        fitPaddingRatio: 0.08,
        hasInitialFit: false,
        pendingRefitRegion: null,
        lastFocusedRegion: "all",
        dragActive: false,
        pointerDown: false,
        pointerId: null,
        pointerStartX: 0,
        pointerStartY: 0,
        lastPointerX: 0,
        lastPointerY: 0,
        suppressClickUntil: 0,
        contentWidth: 0,
        contentHeight: 0,
    },
    mapInteractionBound: false,
    overallScoreRerenderTimerId: null,
};

let hoveredMapTile = null;
let chart4Initialized = false;
let renderChart4CurrentSelection = null;
let chart3NoDataOverlay = null;
let chart3HoverTooltip = null;

function isOverviewLinkedHighlightMetric(metricKey = state.selectedMetric) {
    return metricKey === "ballot_difference" || metricKey === "turnout" || metricKey === "discrepancy" || metricKey === "overall_score";
}

function clearOverviewLinkedHighlight() {
    if (!overviewPanel) {
        return;
    }
    overviewPanel
        .querySelectorAll(".beeswarm-point.is-linked-hover")
        .forEach((element) => {
            element.classList.remove("is-linked-hover");
        });
}

function applyOverviewLinkedHighlight(recordKey) {
    clearOverviewLinkedHighlight();

    if (!overviewPanel || !isOverviewLinkedHighlightMetric() || !recordKey) {
        return;
    }

    const target = overviewPanel.querySelector(`[data-record-key='${recordKey}']`);
    if (!target) {
        return;
    }

    target.classList.add("is-linked-hover");
    if (target.parentNode) {
        target.parentNode.appendChild(target);
    }
}

async function initializeChart3() {
    try {
        if (!chart3Root || typeof d3 === "undefined") {
            return;
        }

        window.addEventListener("resize", () => {
            if (detailPopup.hidden) {
                return;
            }
            const activeRecord = state.popupActiveRecordKey ? state.recordByKey.get(state.popupActiveRecordKey) : null;
            updateChart3ForRecord(activeRecord || null);
        });

        updateChart3ForRecord(null);

    } catch (error) {
        console.error('Error initializing Chart 3:', error);
    }
}

function renderChart3Svg({ barData, averageVotes10Plus, highlightPartyNumber }) {
    if (!chart3Root || typeof d3 === "undefined") {
        return;
    }

    chart3Root.innerHTML = "";
    if (chart3HoverTooltip) {
        chart3HoverTooltip.style.display = "none";
    }

    const width = Math.max(280, chart3Root.clientWidth || 280);
    const height = Math.max(240, chart3Root.clientHeight || 240);
    const margin = { top: 34, right: 16, bottom: 56, left: 58 };
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = Math.max(120, height - margin.top - margin.bottom);

    const maxBarValue = d3.max(barData) || 0;
    const maxLineValue = Number.isFinite(averageVotes10Plus) ? averageVotes10Plus : 0;
    const yMax = Math.max(1, maxBarValue, maxLineValue);

    const labels = chart3PartyNumbers.map((value) => String(value));
    const xScale = d3.scaleBand()
        .domain(labels)
        .range([0, innerWidth])
        .padding(0.2);

    const yScale = d3.scaleLinear()
        .domain([0, yMax])
        .nice()
        .range([innerHeight, 0]);

    const svg = d3.select(chart3Root)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    if (!chart3HoverTooltip) {
        const tooltipHost = chart3Root.parentElement;
        if (tooltipHost) {
            tooltipHost.style.position = "relative";
            chart3HoverTooltip = document.createElement("div");
            chart3HoverTooltip.id = "chart3Tooltip";
            chart3HoverTooltip.style.display = "none";
            tooltipHost.appendChild(chart3HoverTooltip);
        }
    }

    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const showChart3Tooltip = (event, html) => {
        if (!chart3HoverTooltip) {
            return;
        }

        chart3HoverTooltip.innerHTML = html;
        chart3HoverTooltip.style.display = "block";

        const tooltipHost = chart3Root.parentElement;
        if (!tooltipHost) {
            return;
        }

        const hostRect = tooltipHost.getBoundingClientRect();
        const tooltipWidth = chart3HoverTooltip.offsetWidth || 0;
        const tooltipHeight = chart3HoverTooltip.offsetHeight || 0;
        const offsetX = 12;
        const offsetY = 12;
        let left = event.clientX - hostRect.left + offsetX;
        let top = event.clientY - hostRect.top + offsetY;

        const maxLeft = Math.max(8, hostRect.width - tooltipWidth - 8);
        left = Math.max(8, Math.min(maxLeft, left));

        const maxTop = Math.max(8, hostRect.height - tooltipHeight - 8);
        top = Math.max(8, Math.min(maxTop, top));

        chart3HoverTooltip.style.left = `${left}px`;
        chart3HoverTooltip.style.top = `${top}px`;
    };

    const hideChart3Tooltip = () => {
        if (!chart3HoverTooltip) {
            return;
        }
        chart3HoverTooltip.style.display = "none";
    };

    const barFillColors = getChart3BarBackgroundColors(highlightPartyNumber);
    const barBorderColors = getChart3BarBorderColors(highlightPartyNumber);

    chart.append("g")
        .selectAll("rect")
        .data(barData.map((value, index) => ({ value, index })))
        .join("rect")
        .attr("x", (entry) => xScale(labels[entry.index]) || 0)
        .attr("y", (entry) => yScale(entry.value))
        .attr("width", xScale.bandwidth())
        .attr("height", (entry) => Math.max(1, innerHeight - yScale(entry.value)))
        .attr("fill", (entry) => barFillColors[entry.index])
        .attr("stroke", (entry) => barBorderColors[entry.index])
        .attr("stroke-width", 1)
        .attr("rx", 4)
        .on("mouseenter", (event, entry) => {
            const partyLabel = chart3PartyNumbers[entry.index] || "-";
            showChart3Tooltip(event, `
                <strong>พรรคหมายเลข ${partyLabel}</strong>
                <span>คะแนน: ${Number(entry.value).toLocaleString("th-TH")}</span>
            `);
        })
        .on("mousemove", (event, entry) => {
            const partyLabel = chart3PartyNumbers[entry.index] || "-";
            showChart3Tooltip(event, `
                <strong>พรรคหมายเลข ${partyLabel}</strong>
                <span>คะแนน: ${Number(entry.value).toLocaleString("th-TH")}</span>
            `);
        })
        .on("mouseleave", hideChart3Tooltip);

    if (Number.isFinite(averageVotes10Plus)) {
        const y = yScale(averageVotes10Plus);
        chart.append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", y)
            .attr("y2", y)
            .attr("stroke", "#e74c3c")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6 5")
            .on("mouseenter", (event) => {
                showChart3Tooltip(event, `
                    <strong>ค่าเฉลี่ยพรรคเล็ก (10+)</strong>
                    <span>คะแนนเฉลี่ย: ${Number(averageVotes10Plus).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>
                `);
            })
            .on("mousemove", (event) => {
                showChart3Tooltip(event, `
                    <strong>ค่าเฉลี่ยพรรคเล็ก (10+)</strong>
                    <span>คะแนนเฉลี่ย: ${Number(averageVotes10Plus).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>
                `);
            })
            .on("mouseleave", hideChart3Tooltip);
    }

    chart.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSizeOuter(0))
        .selectAll("text")
        .style("font-size", "11px")
        .style("fill", "#4c5c74");

    chart.append("g")
        .call(d3.axisLeft(yScale).ticks(5).tickFormat((value) => Number(value).toLocaleString("th-TH")))
        .selectAll("text")
        .style("font-size", "11px")
        .style("fill", "#010101ff");

    chart.selectAll(".domain, .tick line")
        .attr("stroke", "rgba(220, 228, 239, 0.7)");

    chart.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 44)
        .attr("text-anchor", "middle")
        .attr("fill", "#172233")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .text("หมายเลขพรรค");

    chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -42)
        .attr("text-anchor", "middle")
        .attr("fill", "#172233")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .text("คะแนนโหวต");
}

function getChart3BarBackgroundColors(highlightPartyNumber = null) {
    return chart3PartyNumbers.map((partyNumber) => (
        Number.isInteger(highlightPartyNumber) && partyNumber === highlightPartyNumber
            ? "#187d42ff"
            : "#2b6ad6"
    ));
}

function getChart3BarBorderColors(highlightPartyNumber = null) {
    return chart3PartyNumbers.map((partyNumber) => (
        Number.isInteger(highlightPartyNumber) && partyNumber === highlightPartyNumber
            ? "#187d42ff"
            : "#1d4a99"
    ));
}

function ensureChart3NoDataOverlay() {
    if (!chart3Root) {
        return null;
    }

    const container = chart3Root.parentElement;
    if (!container) {
        return null;
    }

    if (!chart3NoDataOverlay) {
        container.style.position = "relative";

        chart3NoDataOverlay = document.createElement("div");
        chart3NoDataOverlay.style.position = "absolute";
        chart3NoDataOverlay.style.inset = "0";
        chart3NoDataOverlay.style.display = "none";
        chart3NoDataOverlay.style.alignItems = "center";
        chart3NoDataOverlay.style.justifyContent = "center";
        chart3NoDataOverlay.style.background = "rgba(255, 255, 255, 0.86)";
        chart3NoDataOverlay.style.color = "#4c5c74";
        chart3NoDataOverlay.style.fontSize = "1rem";
        chart3NoDataOverlay.style.fontWeight = "700";
        chart3NoDataOverlay.style.borderRadius = "12px";
        chart3NoDataOverlay.style.zIndex = "2";
        container.appendChild(chart3NoDataOverlay);
    }

    return chart3NoDataOverlay;
}

function setChart3NoDataOverlayVisible(visible, text = "ไม่พบข้อมูล") {
    const overlay = ensureChart3NoDataOverlay();
    if (!overlay) {
        return;
    }

    overlay.textContent = text;
    overlay.style.display = visible ? "flex" : "none";
}

function updateChart3ForRecord(record) {
    if (!chart3Root) {
        return;
    }

    const emptyBarData = chart3PartyNumbers.map(() => 0);

    if (!record) {
        renderChart3Svg({
            barData: emptyBarData,
            averageVotes10Plus: null,
            highlightPartyNumber: null,
        });
        setChart3NoDataOverlayVisible(true, "ไม่พบข้อมูล");
        return;
    }

    const key = `${record.provinceCode}-${record.district}`;
    const payload = state.chart3ByConstituency.get(key);

    if (!payload) {
        renderChart3Svg({
            barData: emptyBarData,
            averageVotes10Plus: null,
            highlightPartyNumber: null,
        });
        setChart3NoDataOverlayVisible(true, "ไม่พบข้อมูล");
        return;
    }

    const winnerRepresentativeNumber = state.winningRepresentativeNumberByKey.get(key);
    renderChart3Svg({
        barData: [...payload.barData],
        averageVotes10Plus: payload.averageVotes10Plus,
        highlightPartyNumber: winnerRepresentativeNumber,
    });
    setChart3NoDataOverlayVisible(false);
}

function initializeChart4() {
    if (chart4Initialized) {
        return;
    }

    const chartRoot = document.getElementById("chart4");
    const tooltip = document.getElementById("chart4Tooltip");

    if (!chartRoot || !tooltip || !toggleConstituency || !togglePartyList || typeof d3 === "undefined") {
        return;
    }

    chart4Initialized = true;

    const CSV_URL = "src/waterfall_long.csv";
    const DEFAULT_SELECTION_KEY = "กรุงเทพมหานคร|1";
    const barDefinitions = [
        { key: "voters_came", label: "จำนวนบัตรทั้งหมด", color: "#2b6ad6" },
        { key: "good_votes", label: "บัตรดี", color: "#187d42ff" },
        { key: "invalid_votes", label: "บัตรเสีย", color: "#f44336" },
        { key: "no_votes", label: "ไม่ประสงค์ออกเสียง", color: "#9e9e9e" },
    ];

    let allRows = [];
    let selectedRowKey = DEFAULT_SELECTION_KEY;
    let selectedRecord = null;

    const parseChart4Number = (value) => {
        if (value == null) {
            return 0;
        }
        const parsed = Number(String(value).replace(/[^\d-]/g, ""));
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const formatChart4Number = (value) => Number(value).toLocaleString("th-TH");

    const getBalanceTooltip = (balance) => {
        const formatted = formatChart4Number(Math.abs(balance));
        return balance > 0
            ? `มีบัตรหายไปจากระบบ ${formatted} ใบ`
            : `มีคนมาใช้สิทธิเกิน ${formatted} ใบ`;
    };

    const rowKey = (row) => `${row.province_name}|${row.constituency}`;
    const normalizeChart4Text = (value) => String(value || "").trim().toLowerCase();

    const findMatchingRowForRecord = (record, track = state.popupVoteTrack) => {
        if (!record) {
            return null;
        }

        const district = Number(record.district);
        if (!Number.isInteger(district)) {
            return null;
        }

        const provinceName = normalizeChart4Text(record.provinceName);
        const directMatch = allRows.find((row) => {
            if (row.vote_track !== track) {
                return false;
            }
            return Number(row.constituency) === district && normalizeChart4Text(row.province_name) === provinceName;
        });
        if (directMatch) {
            return directMatch;
        }

        const provinceCode = Number(record.provinceCode);
        const fallbackProvinceThaiName = state.provinceThaiNameByCode.get(provinceCode);
        const fallbackProvinceName = normalizeChart4Text(fallbackProvinceThaiName);
        if (!fallbackProvinceName) {
            return null;
        }

        return allRows.find((row) => {
            if (row.vote_track !== track) {
                return false;
            }
            return Number(row.constituency) === district && normalizeChart4Text(row.province_name) === fallbackProvinceName;
        }) || null;
    };

    const setSelectedRowFromRecord = (record) => {
        if (!record) {
            return false;
        }

        selectedRecord = record;
        const matchingRow = findMatchingRowForRecord(record, state.popupVoteTrack);
        if (!matchingRow) {
            return false;
        }

        selectedRowKey = rowKey(matchingRow);
        return true;
    };

    const buildWaterfallData = (row) => {
        const values = barDefinitions.map((definition) => ({
            ...definition,
            value: parseChart4Number(row[definition.key]),
            tooltip: `${definition.label}: ${formatChart4Number(parseChart4Number(row[definition.key]))}`,
        }));

        const votersCame = values[0].value;
        const goodVotes = values[1].value;
        const invalidVotes = values[2].value;
        const noVotes = values[3].value;
        const balance = votersCame - (goodVotes + invalidVotes + noVotes);

        const data = [];
        let cumulative = 0;
        values.forEach((entry, index) => {
            const start = index === 0 ? 0 : cumulative;
            const end = index === 0 ? entry.value : cumulative - entry.value;
            cumulative = end;
            data.push({
                ...entry,
                start,
                end,
            });
        });

        if (balance !== 0) {
            data.push({
                key: "balance",
                label: "ส่วนต่าง",
                color: "#9c27b0",
                value: balance,
                start: 0,
                end: balance,
                tooltip: getBalanceTooltip(balance),
            });
        }

        return data;
    };

    const setActiveTrackButton = () => {
        toggleConstituency.classList.toggle("is-active", state.popupVoteTrack === "constituency");
        togglePartyList.classList.toggle("is-active", state.popupVoteTrack === "party_list");
    };

    const ensureSelectedRowKey = () => {
        const filteredRows = allRows.filter((row) => row.vote_track === state.popupVoteTrack);
        if (!filteredRows.length) {
            selectedRowKey = "";
            return;
        }

        if (filteredRows.some((row) => rowKey(row) === selectedRowKey)) {
            return;
        }

        if (selectedRecord && setSelectedRowFromRecord(selectedRecord)) {
            return;
        }

        const matchingDefault = filteredRows.some((row) => rowKey(row) === DEFAULT_SELECTION_KEY);
        if (state.popupVoteTrack === "constituency" && matchingDefault) {
            selectedRowKey = DEFAULT_SELECTION_KEY;
            return;
        }

        selectedRowKey = rowKey(filteredRows[0]);
    };

    const getSelectedRow = () => allRows.find((row) => rowKey(row) === selectedRowKey && row.vote_track === state.popupVoteTrack);

    const renderChart = (row) => {
        chartRoot.innerHTML = "";
        tooltip.style.display = "none";

        const width = chartRoot.clientWidth;
        const height = chartRoot.clientHeight;
        if (width <= 0 || height <= 0) {
            return;
        }

        const margin = { top: 22, right: 14, bottom: 88, left: 58 };
        const innerWidth = Math.max(1, width - margin.left - margin.right);
        const innerHeight = Math.max(1, height - margin.top - margin.bottom);

        const data = buildWaterfallData(row);
        const yDomain = [
            d3.min(data, (entry) => Math.min(entry.start, entry.end, 0)),
            d3.max(data, (entry) => Math.max(entry.start, entry.end, 0)),
        ];

        const xScale = d3.scaleBand()
            .domain(data.map((entry) => entry.label))
            .range([0, innerWidth])
            .padding(0.30);

        const yScale = d3.scaleLinear()
            .domain(yDomain)
            .nice()
            .range([innerHeight, 0]);

        const svg = d3.select(chartRoot)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`);

        const chart = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const yAxis = d3.axisLeft(yScale)
            .ticks(5)
            .tickFormat((value) => d3.format(",d")(value));

        chart.append("g")
            .attr("class", "chart4-axis-y")
            .call(yAxis)
            .selectAll("line")
            .attr("stroke", "#d7d9df");

        chart.append("text")
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight / 2)
            .attr("y", -42)
            .attr("fill", "#172233")
            .attr("font-size", "14px")
            .attr("font-weight", 400)
            .text("คะแนนโหวต");

        chart.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale)
                .tickSizeOuter(0)
                .tickFormat((value) => ({
                    "จำนวนบัตรทั้งหมด": "ทั้งหมด",
                    "บัตรดี": "ดี",
                    "บัตรเสีย": "เสีย",
                    "ไม่ประสงค์ออกเสียง": "งดออกเสียง",
                }[value] || value)))
            .selectAll("text")
            .style("text-anchor", "middle")
            .attr("transform", "rotate(0)")
            .attr("dy", "1.5em")
            .attr("dx", "0")
            .style("font-size", null)
            .style("font-weight", null)
            .style("fill", null);

        chart.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + margin.bottom - 30)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("fill", "#172233")
            .text("ลักษณะของบัตรเลือกตั้ง");

        chart.append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", yScale(0))
            .attr("y2", yScale(0))
            .attr("stroke", "#c8cad0")
            .attr("stroke-width", 1);

        chart.selectAll("rect.chart4-bar")
            .data(data)
            .join("rect")
            .attr("class", "chart4-bar")
            .attr("x", (entry) => xScale(entry.label) || 0)
            .attr("width", xScale.bandwidth())
            .attr("y", (entry) => yScale(Math.max(entry.start, entry.end)))
            .attr("height", (entry) => Math.max(1, Math.abs(yScale(entry.start) - yScale(entry.end))))
            .attr("fill", (entry) => entry.color)
            .attr("rx", 4)
            .on("mouseenter", (event, entry) => {
                tooltip.innerHTML = entry.tooltip;
                tooltip.style.display = "block";
                const [x, y] = d3.pointer(event, chartRoot);
                tooltip.style.left = `${x + 12}px`;
                tooltip.style.top = `${y + 12}px`;
            })
            .on("mousemove", (event) => {
                const [x, y] = d3.pointer(event, chartRoot);
                tooltip.style.left = `${x + 12}px`;
                tooltip.style.top = `${y + 12}px`;
            })
            .on("mouseleave", () => {
                tooltip.style.display = "none";
            });
    };

    const renderSelectedRow = () => {
        const row = getSelectedRow();
        if (row) {
            renderChart(row);
        } else {
            chartRoot.innerHTML = "ไม่พบข้อมูลสำหรับการเลือกนี้";
        }
    };

    const changeTrack = (track) => {
        if (state.popupVoteTrack === track) {
            return;
        }
        state.popupVoteTrack = track;
        setActiveTrackButton();
        ensureSelectedRowKey();
        renderSelectedRow();
        renderPopupElectionResult(selectedRecord);
    };

    toggleConstituency.addEventListener("click", () => changeTrack("constituency"));
    togglePartyList.addEventListener("click", () => changeTrack("party_list"));

    window.addEventListener("resize", () => {
        renderSelectedRow();
    });

    fetch(CSV_URL)
        .then((response) => (response.ok ? response.text() : Promise.reject(response.statusText)))
        .then((text) => {
            allRows = d3.csvParse(text);
            setActiveTrackButton();
            ensureSelectedRowKey();
            renderSelectedRow();
        })
        .catch((error) => {
            console.error("Chart 4 load error:", error);
            chartRoot.textContent = "ไม่สามารถโหลดกราฟได้ขณะนี้";
        });

    renderChart4CurrentSelection = (record) => {
        if (record) {
            selectedRecord = record;
            setSelectedRowFromRecord(record);
        } else {
            ensureSelectedRowKey();
        }
        renderSelectedRow();
    };
}

function getMapSvg() {
    let svg = tileGridMap.querySelector("svg.tile-grid-svg");
    if (!svg) {
        tileGridMap.innerHTML = "";
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("tile-grid-svg");
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("role", "presentation");
        tileGridMap.appendChild(svg);
    }

    let layer = svg.querySelector("g.tile-grid-layer");
    if (!layer) {
        layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.classList.add("tile-grid-layer");
        svg.appendChild(layer);
    }

    return { svg, layer };
}

function getMapContentLayer() {
    return getMapSvg().layer;
}

function applyMapTransform() {
    const layer = getMapContentLayer();
    clampMapTranslation();
    const { scale, translateX, translateY } = state.mapView;
    layer.setAttribute("transform", `translate(${translateX} ${translateY}) scale(${scale})`);
    updateHoveredTileTooltipPosition();
}

function clampMapTranslation() {
    const viewportWidth = tileGridMap.clientWidth;
    const viewportHeight = tileGridMap.clientHeight;
    const contentWidth = state.mapView.contentWidth;
    const contentHeight = state.mapView.contentHeight;
    const { scale } = state.mapView;

    if (!viewportWidth || !viewportHeight || !contentWidth || !contentHeight || !scale) {
        return;
    }

    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;

    if (scaledWidth <= viewportWidth) {
        state.mapView.translateX = (viewportWidth - scaledWidth) / 2;
    } else {
        const minX = viewportWidth - scaledWidth;
        const maxX = 0;
        state.mapView.translateX = Math.min(maxX, Math.max(minX, state.mapView.translateX));
    }

    if (scaledHeight <= viewportHeight) {
        state.mapView.translateY = (viewportHeight - scaledHeight) / 2;
    } else {
        const minY = viewportHeight - scaledHeight;
        const maxY = 0;
        state.mapView.translateY = Math.min(maxY, Math.max(minY, state.mapView.translateY));
    }
}

function fitMapToViewport() {
    const viewportWidth = tileGridMap.clientWidth;
    const viewportHeight = tileGridMap.clientHeight;
    const contentWidth = state.mapView.contentWidth;
    const contentHeight = state.mapView.contentHeight;

    if (!viewportWidth || !viewportHeight || !contentWidth || !contentHeight) {
        return;
    }

    const scaleX = viewportWidth / contentWidth;
    const scaleY = viewportHeight / contentHeight;
    const fitScale = Math.max(0.1, Math.min(scaleX, scaleY) * 0.98);

    state.mapView.scale = fitScale;
    state.mapView.minScale = Math.max(0.1, fitScale * 0.6);
    state.mapView.maxScale = Math.max(3.5, fitScale * 8);
    state.mapView.translateX = (viewportWidth - (contentWidth * fitScale)) / 2;
    state.mapView.translateY = (viewportHeight - (contentHeight * fitScale)) / 2;
    state.mapView.hasInitialFit = true;
    state.mapView.lastFocusedRegion = "all";

    applyMapTransform();
}

function getRenderableRegionTiles(regionKey) {
    const layer = getMapContentLayer();
    const targetRegion = regionKey === "all" ? null : regionKey;
    return [...layer.querySelectorAll(".tile[data-map-tile='constituency']")].filter((tile) => {
        if (!targetRegion) {
            return true;
        }
        return tile.dataset.regionKey === targetRegion;
    });
}

function getTileBounds(tile) {
    const rect = tile.querySelector("rect.tile-rect");
    if (!rect) {
        return null;
    }

    const x = Number(rect.getAttribute("x") || "0");
    const y = Number(rect.getAttribute("y") || "0");
    const width = Number(rect.getAttribute("width") || "0");
    const height = Number(rect.getAttribute("height") || "0");
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
    }

    return {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height,
        width,
        height,
    };
}

function computeTileBounds(tiles) {
    if (!tiles.length) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    tiles.forEach((tile) => {
        const tileBounds = getTileBounds(tile);
        if (!tileBounds) {
            return;
        }
        minX = Math.min(minX, tileBounds.minX);
        minY = Math.min(minY, tileBounds.minY);
        maxX = Math.max(maxX, tileBounds.maxX);
        maxY = Math.max(maxY, tileBounds.maxY);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function fitBoundsInViewport(bounds, regionKey) {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        fitMapToViewport();
        return false;
    }

    const viewportWidth = tileGridMap.clientWidth;
    const viewportHeight = tileGridMap.clientHeight;
    if (!viewportWidth || !viewportHeight) {
        return false;
    }

    const paddingRatio = Math.max(0, Math.min(0.2, state.mapView.fitPaddingRatio));
    const availableWidth = viewportWidth * (1 - (paddingRatio * 2));
    const availableHeight = viewportHeight * (1 - (paddingRatio * 2));
    const scaleX = availableWidth / bounds.width;
    const scaleY = availableHeight / bounds.height;
    const targetScale = Math.min(scaleX, scaleY);

    state.mapView.scale = Math.max(state.mapView.minScale, Math.min(state.mapView.maxScale, targetScale));
    state.mapView.translateX = (viewportWidth - (bounds.width * state.mapView.scale)) / 2 - (bounds.minX * state.mapView.scale);
    state.mapView.translateY = (viewportHeight - (bounds.height * state.mapView.scale)) / 2 - (bounds.minY * state.mapView.scale);
    state.mapView.hasInitialFit = true;
    state.mapView.lastFocusedRegion = regionKey;

    applyMapTransform();
    return true;
}

function focusMapForRegion(regionKey) {
    if (regionKey === "all") {
        fitMapToViewport();
        return;
    }

    const regionTiles = getRenderableRegionTiles(regionKey);
    const bounds = computeTileBounds(regionTiles);
    const focused = fitBoundsInViewport(bounds, regionKey);

    if (!focused) {
        fitMapToViewport();
    }
}

function clearHoveredTile() {
    if (hoveredMapTile) {
        hoveredMapTile.classList.remove("is-hovered");
    }
    hoveredMapTile = null;
    clearOverviewLinkedHighlight();

    if (tileHoverTooltip) {
        tileHoverTooltip.classList.remove("visible");
        tileHoverTooltip.setAttribute("aria-hidden", "true");
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatTileTooltipNumber(value) {
    if (!Number.isFinite(value)) {
        return "-";
    }
    return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatTileTooltipPercent(value) {
    if (!Number.isFinite(value)) {
        return "-";
    }
    return `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
}

function getTileTooltipData(record) {
    if (!record) {
        return {
            title: "-",
            rows: [],
        };
    }

    const metrics = record.metrics || {};
    return {
        title: `${record.provinceName || "-"} เขต ${record.district || "-"}`,
        rows: [
            {
                label: "พรรคผู้ชนะ",
                value: record.party || "ไม่มีข้อมูล",
            },
            {
                label: "ผู้มาใช้สิทธิ์บัญชีรายชื่อ",
                value: formatTileTooltipNumber(metrics.party_list_voter_came),
            },
            {
                label: "ผู้มาใช้สิทธิ์เขต",
                value: formatTileTooltipNumber(metrics.consti_voters_came),
            },
            {
                label: "ผลต่างของจำนวนบัตรเลือกตั้ง",
                value: formatTileTooltipNumber(metrics.ballot_difference),
            },
            {
                label: "สัดส่วนผู้ออกมาใช้สิทธิ์",
                value: formatTileTooltipPercent(metrics.turnout),
            },
            {
                label: "บัตรผี / บัตรหาย",
                value: formatTileTooltipNumber(metrics.discrepancy),
            },
        ],
    };
}

function buildTileTooltipHtml(record) {
    if (!record) {
        return "";
    }

    const tooltipData = getTileTooltipData(record);
    const rowHtml = tooltipData.rows
        .map((row) => `
            <div class="tile-hover-tooltip-row">
                <span class="tile-hover-tooltip-label">${escapeHtml(row.label)}</span>
                <span class="tile-hover-tooltip-value">${escapeHtml(row.value)}</span>
            </div>
        `)
        .join("");

    return `
        <div class="tile-hover-tooltip-title">${escapeHtml(tooltipData.title)}</div>
        <div class="tile-hover-tooltip-rows">${rowHtml}</div>
    `;
}

function updateHoveredTileTooltipPosition() {
    if (!hoveredMapTile || !tileHoverTooltip) {
        return;
    }

    const bounds = getTileBounds(hoveredMapTile);
    if (!bounds) {
        clearHoveredTile();
        return;
    }

    const centroidX = bounds.minX + (bounds.width / 2);
    const centroidY = bounds.minY + (bounds.height / 2);
    const screenX = state.mapView.translateX + (centroidX * state.mapView.scale);
    const screenY = state.mapView.translateY + (centroidY * state.mapView.scale);

    tileHoverTooltip.style.left = `${screenX}px`;
    tileHoverTooltip.style.top = `${screenY}px`;
    tileHoverTooltip.classList.add("visible");
    tileHoverTooltip.setAttribute("aria-hidden", "false");
}

function setHoveredTile(tile) {
    if (!tile || tile === hoveredMapTile) {
        if (tile) {
            if (tileHoverTooltip?.innerHTML.trim()) {
                updateHoveredTileTooltipPosition();
            }
            applyOverviewLinkedHighlight(tile.dataset.recordKey);
        }
        return;
    }

    if (hoveredMapTile) {
        hoveredMapTile.classList.remove("is-hovered");
    }

    hoveredMapTile = tile;
    hoveredMapTile.classList.add("is-hovered");

    const recordKey = tile.dataset.recordKey;
    const record = recordKey ? state.recordByKey.get(recordKey) : null;

    if (tileHoverTooltip) {
        const tooltipHtml = buildTileTooltipHtml(record);
        tileHoverTooltip.innerHTML = tooltipHtml;
        if (tooltipHtml) {
            updateHoveredTileTooltipPosition();
        } else {
            tileHoverTooltip.classList.remove("visible");
            tileHoverTooltip.setAttribute("aria-hidden", "true");
        }
    }

    applyOverviewLinkedHighlight(tile.dataset.recordKey);
}

function bindMapInteractions() {
    if (state.mapInteractionBound) {
        return;
    }
    state.mapInteractionBound = true;

    tileGridMap.addEventListener("wheel", (event) => {
        event.preventDefault();

        const rect = tileGridMap.getBoundingClientRect();
        const { scale, minScale, maxScale, translateX, translateY } = state.mapView;
        const zoomFactor = event.deltaY < 0 ? 1.12 : 0.9;
        const nextScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));

        if (nextScale === scale) {
            return;
        }

        const originX = event.clientX - rect.left;
        const originY = event.clientY - rect.top;
        const worldX = (originX - translateX) / scale;
        const worldY = (originY - translateY) / scale;

        state.mapView.scale = nextScale;
        state.mapView.translateX = originX - (worldX * nextScale);
        state.mapView.translateY = originY - (worldY * nextScale);
        applyMapTransform();
    }, { passive: false });

    tileGridMap.addEventListener("pointerover", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const tile = target.closest(".tile[data-map-tile='constituency']");
        if (!tile || !tileGridMap.contains(tile)) {
            return;
        }
        if (state.mapView.pointerDown || state.mapView.dragActive) {
            return;
        }
        setHoveredTile(tile);
    });

    tileGridMap.addEventListener("pointerout", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const tile = target.closest(".tile[data-map-tile='constituency']");
        if (!tile || tile !== hoveredMapTile) {
            return;
        }

        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Element) {
            const nextTile = nextTarget.closest(".tile[data-map-tile='constituency']");
            if (nextTile && tileGridMap.contains(nextTile)) {
                setHoveredTile(nextTile);
                return;
            }
        }

        clearHoveredTile();
    });

    tileGridMap.addEventListener("click", (event) => {
        if (Date.now() < state.mapView.suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    tileGridMap.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }

        clearHoveredTile();
        state.mapView.pointerDown = true;
        state.mapView.pointerId = event.pointerId;
        state.mapView.dragActive = false;
        state.mapView.pointerStartX = event.clientX;
        state.mapView.pointerStartY = event.clientY;
        state.mapView.lastPointerX = event.clientX;
        state.mapView.lastPointerY = event.clientY;
    });

    tileGridMap.addEventListener("pointermove", (event) => {
        if (!state.mapView.pointerDown || state.mapView.pointerId !== event.pointerId) {
            return;
        }

        if (!state.mapView.dragActive) {
            const movedX = event.clientX - state.mapView.pointerStartX;
            const movedY = event.clientY - state.mapView.pointerStartY;
            const movedDistance = Math.hypot(movedX, movedY);
            if (movedDistance < 4) {
                return;
            }
            state.mapView.dragActive = true;
            tileGridMap.setPointerCapture(event.pointerId);
            tileGridMap.style.cursor = "grabbing";
            clearHoveredTile();
        }

        const deltaX = event.clientX - state.mapView.lastPointerX;
        const deltaY = event.clientY - state.mapView.lastPointerY;
        state.mapView.lastPointerX = event.clientX;
        state.mapView.lastPointerY = event.clientY;
        state.mapView.translateX += deltaX;
        state.mapView.translateY += deltaY;
        applyMapTransform();
    });

    const endDrag = (event) => {
        if (!state.mapView.pointerDown) {
            return;
        }

        if (state.mapView.pointerId !== null && event?.pointerId !== undefined && state.mapView.pointerId !== event.pointerId) {
            return;
        }

        if (state.mapView.dragActive) {
            state.mapView.suppressClickUntil = Date.now() + 80;
        }

        if (state.mapView.pointerId !== null && tileGridMap.hasPointerCapture(state.mapView.pointerId)) {
            try {
                tileGridMap.releasePointerCapture(state.mapView.pointerId);
            } catch (error) {
            }
        }

        state.mapView.pointerDown = false;
        state.mapView.pointerId = null;
        state.mapView.dragActive = false;
        tileGridMap.style.cursor = "grab";
    };

    tileGridMap.addEventListener("pointerup", endDrag);
    tileGridMap.addEventListener("pointercancel", endDrag);
    tileGridMap.addEventListener("pointerleave", endDrag);

    window.addEventListener("resize", () => {
        if (state.mapView.hasInitialFit) {
            const focusedRegion = state.mapView.lastFocusedRegion || "all";
            if (focusedRegion === "all") {
                fitMapToViewport();
            } else {
                focusMapForRegion(focusedRegion);
            }
            updateHoveredTileTooltipPosition();
        }
        renderOverviewPanel();
    });
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const current = text[index];
        const next = text[index + 1];

        if (current === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (current === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((current === "\n" || current === "\r") && !inQuotes) {
            if (current === "\r" && next === "\n") {
                index += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += current;
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows;
}

function toObjects(csvText) {
    const rows = parseCsv(csvText).filter((entry) => entry.some((value) => value.trim() !== ""));
    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1).map((values) => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = (values[index] || "").trim();
        });
        return record;
    });
}

function parseNumber(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }
    const cleaned = String(rawValue).replace(/,/g, "").replace(/%/g, "").trim();
    if (!cleaned) {
        return null;
    }
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
}

function firstAvailableNumber(record, keys) {
    for (const key of keys) {
        const value = parseNumber(record[key]);
        if (value !== null) {
            return value;
        }
    }
    return null;
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.text();
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.json();
}

function makePartyColor(partyName) {
    const colorMap = {
        "ภูมิใจไทย": "#13008f",
        "ประชาชน": "#f08000",
        "เพื่อไทย": "#d50000",
        "กล้าธรรม": "#00b050",
        "ประชาธิปัตย์": "#37a1ecff",
        "ไทรวมพลัง": "#ed603cff",
        "ประชาชาติ": "#d6b44eff",
        "พลังประชารัฐ": "#00531aff",
        "เศรษฐกิจ": "#ffd900ff",
        "รวมไทยสร้างชาติ": "#010057ff",
        "ไทยสร้างไทย": "#6f00d0ff",
    };
    const defaultColor = "#888888ff";
    return colorMap[partyName] || defaultColor;
}

function buildProvinceLookup(provinceRows) {
    const lookup = new Map();
    provinceRows.forEach((row) => {
        const acronym = (row.acronym_en || "").toLowerCase();
        const code = Number(row.code);
        if (acronym && Number.isInteger(code)) {
            lookup.set(acronym, code);
        }
    });
    return lookup;
}

function buildProvinceThaiNameLookup(provinceRows) {
    const lookup = new Map();
    provinceRows.forEach((row) => {
        const acronym = (row.acronym_en || "").toLowerCase();
        const thaiName = (row.name_th || "").trim();
        if (acronym && thaiName) {
            lookup.set(acronym, thaiName);
        }
    });
    return lookup;
}

function buildProvinceThaiNameByCodeLookup(provinceRows) {
    const lookup = new Map();
    provinceRows.forEach((row) => {
        const code = Number(row.code);
        const thaiName = (row.name_th || "").trim();
        if (Number.isInteger(code) && thaiName) {
            lookup.set(code, thaiName);
        }
    });
    return lookup;
}

function buildRegionLookup(regionRows) {
    const lookup = new Map();
    const labelLookup = new Map();
    regionRows.forEach((row) => {
        const provinceCode = Number(row.province_code);
        if (!Number.isInteger(provinceCode)) {
            return;
        }
        const regionKey = (row.region_key || "").trim().toLowerCase();
        const regionLabel = (row.region_label || regionKey || "-").trim();
        lookup.set(provinceCode, regionKey || "unknown");
        labelLookup.set(regionKey || "unknown", regionLabel);
    });
    return { lookup, labelLookup };
}

function buildWinnerLookup(winnerRows) {
    const lookup = new Map();
    winnerRows.forEach((row) => {
        const provinceCode = Number(row["province_code"] || row["รหัสจังหวัด"]);
        const district = Number(row["constituency"] || row["เขต"]);
        if (Number.isInteger(provinceCode) && Number.isInteger(district)) {
            lookup.set(`${provinceCode}-${district}`, row);
        }
    });
    return lookup;
}

function getRawMetricValue(record, metricKey) {
    if (!record || !record.metrics) {
        return null;
    }
    return record.metrics[metricKey] ?? null;
}

function computeMetricMean(records, metricKey) {
    const values = records
        .map((record) => getRawMetricValue(record, metricKey))
        .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
        return null;
    }

    return d3.mean(values);
}

function getOverallScoreComponentValue(record, metricKey, turnoutMean = state.overallScoreTurnoutMean) {
    const rawValue = getRawMetricValue(record, metricKey);
    if (!Number.isFinite(rawValue)) {
        return null;
    }

    if (metricKey === "turnout") {
        if (!Number.isFinite(turnoutMean)) {
            return null;
        }
        return Math.abs(rawValue - turnoutMean);
    }

    return rawValue;
}

function computeGlobalMetricDomain(records, metricKey, valueAccessor = getRawMetricValue) {
    const values = records
        .map((record) => valueAccessor(record, metricKey))
        .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
        return null;
    }

    return {
        min: Math.min(...values),
        max: Math.max(...values),
    };
}

function computeOverallScoreDomains(records = state.records, turnoutMean = state.overallScoreTurnoutMean) {
    const domains = {};
    overallScoreMetricKeys.forEach((metricKey) => {
        domains[metricKey] = computeGlobalMetricDomain(
            records,
            metricKey,
            (record, key) => getOverallScoreComponentValue(record, key, turnoutMean)
        );
    });
    return domains;
}

function normalizeMetricByDomain(value, domain) {
    if (!Number.isFinite(value) || !domain) {
        return null;
    }

    const { min, max } = domain;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
    }

    if (max === min) {
        return 0.5;
    }

    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized));
}

function getOverallScore(record) {
    if (!record) {
        return null;
    }

    const weights = state.overallScoreWeights;
    const domains = state.overallScoreDomains || {};

    let weightedSum = 0;
    let availableWeight = 0;

    overallScoreMetricKeys.forEach((metricKey) => {
        const metricWeight = Number(weights[metricKey]) || 0;
        if (metricWeight <= 0) {
            return;
        }

        const componentValue = getOverallScoreComponentValue(record, metricKey);
        const normalized = normalizeMetricByDomain(componentValue, domains[metricKey]);
        if (!Number.isFinite(normalized)) {
            return;
        }

        weightedSum += normalized * metricWeight;
        availableWeight += metricWeight;
    });

    if (availableWeight <= 0) {
        return null;
    }

    return (weightedSum / availableWeight) * 100;
}

function getMetricValue(record, metricKey) {
    if (metricKey === "overall_score") {
        return getOverallScore(record);
    }
    return getRawMetricValue(record, metricKey);
}

function formatMetricValueForList(record) {
    if (!record) {
        return "-";
    }

    if (state.selectedMetric === "winner") {
        return record.party || "ไม่มีข้อมูล";
    }

    const metricValue = getMetricValue(record, state.selectedMetric);
    if (!Number.isFinite(metricValue)) {
        return "-";
    }

    if (state.selectedMetric === "turnout" || state.selectedMetric === "overall_score") {
        return `${metricValue.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
    }

    return metricValue.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function normalizeWinnerRecord(row) {
    const partyListGhost = firstAvailableNumber(row, ["5partylist_ghost"]);
    const constiGhost = firstAvailableNumber(row, ["5consti_ghost"]);
    const partyListVoterCame = firstAvailableNumber(row, ["party_list_voter_came"]);
    const constiVotersCame = firstAvailableNumber(row, ["consti_voters_came"]);

    return {
        party: row["constituency_winner_party"] || row["แบ่งเขต_พรรค"] || row["พรรค"] || "Unknown",
        candidate: row["constituency_winner_candidate"] || row["แบ่งเขต_ผู้ชนะ"] || row["ผู้ชนะ"] || "Unknown",
        provinceName: row["province_name"] || row["จังหวัด"] || "-",
        votes: firstAvailableNumber(row, ["consti_good_votes", "คะแนน"]),
        metrics: {
            ballot_difference: firstAvailableNumber(row, ["2diff_came"]),
            turnout: firstAvailableNumber(row, ["3consti_pct_came", "3consti_pct_มาใช้สิท"]),
            discrepancy: (partyListGhost === null && constiGhost === null)
                ? null
                : Math.abs(partyListGhost || 0) + Math.abs(constiGhost || 0),
            party_list_voter_came: partyListVoterCame,
            consti_voters_came: constiVotersCame,
            lower_number_tendency: null,
        },
    };
}

function getRegionList() {
    const ordered = [
        { key: "all", label: "ทุกภูมิภาค" },
        { key: "bangkok", label: "กรุงเทพมหานคร" },
        { key: "north", label: "ภาคเหนือ" },
        { key: "northeast", label: "ภาคตะวันออกเฉียงเหนือ" },
        { key: "central", label: "ภาคกลาง" },
        { key: "east", label: "ภาคตะวันออก" },
        { key: "west", label: "ภาคตะวันตก" },
        { key: "south", label: "ภาคใต้" },
    ];
    return ordered.filter((entry) => entry.key === "all" || state.regionLabels.has(entry.key));
}

function isRecordInRegion(record) {
    if (!record) {
        return false;
    }
    if (state.selectedRegion === "all") {
        return true;
    }
    return record.regionKey === state.selectedRegion;
}

function getVisibleRecords() {
    return state.records.filter((record) => isRecordInRegion(record));
}

function getMetricScale(metricKey) {
    const values = getVisibleRecords()
        .map((record) => getMetricValue(record, metricKey))
        .filter((value) => Number.isFinite(value));
    if (values.length === 0) {
        return null;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const top = max === min ? min + 1 : max;
    return d3.scaleLinear().domain([min, top]).range([0.25, 1]);
}

function getMetricColor(value, scale) {
    if (!Number.isFinite(value) || !scale) {
        return "#d7dee7";
    }
    const intensity = scale(value);
    return d3.interpolateRgb("#e9eef5", "#1347aa")(intensity);
}

function renderLegend(partyCountMap, partyColorMap) {
    partyLegend.innerHTML = "";
    const sorted = [...partyCountMap.entries()].sort((left, right) => right[1] - left[1]);

    sorted.forEach(([partyName, count]) => {
        const pill = document.createElement("div");
        pill.className = "party-pill";

        const dot = document.createElement("span");
        dot.className = "party-dot";
        dot.style.backgroundColor = partyColorMap.get(partyName);

        const label = document.createElement("span");
        label.textContent = `${partyName} (${count})`;

        pill.append(dot, label);
        partyLegend.appendChild(pill);
    });
}

function renderMetricLegend() {
    partyLegend.innerHTML = "";
    const currentLabel = metricOptions.find((entry) => entry.key === state.selectedMetric)?.label || state.selectedMetric;
    const item = document.createElement("div");
    item.className = "party-pill";
    item.textContent = `Metric mode: ${currentLabel}`;
    partyLegend.appendChild(item);
}

function getMetricLabel(metricKey) {
    return metricOptions.find((entry) => entry.key === metricKey)?.label || metricKey;
}

function formatOverviewMetricValue(metricKey, value) {
    if (!Number.isFinite(value)) {
        return "-";
    }
    if (metricKey === "turnout" || metricKey === "overall_score") {
        return `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
    }
    return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function buildConstituencyVoteLookup(constiRows) {
    const lookup = new Map();

    constiRows.forEach((row) => {
        const provinceCode = Number(row["รหัสจังหวัด"] || row["province_code"]);
        const district = Number(row["เขต"] || row["constituency"]);
        const party = (row["พรรค"] || "ไม่มีข้อมูล").trim() || "ไม่มีข้อมูล";
        const votes = parseNumber(row["คะแนน"]);
        const candidate = (row["ชื่อผู้สมัคร"] || "").trim();
        const number = Number(row["หมายเลข"]);

        if (!Number.isInteger(provinceCode) || !Number.isInteger(district) || !Number.isFinite(votes)) {
            return;
        }

        const key = `${provinceCode}-${district}`;
        if (!lookup.has(key)) {
            lookup.set(key, []);
        }

        lookup.get(key).push({
            party,
            candidate,
            votes,
            number: Number.isInteger(number) ? number : null,
        });
    });

    lookup.forEach((rows) => {
        rows.sort((left, right) => right.votes - left.votes);
    });

    return lookup;
}

function buildPartyListVoteLookup(partyListRows) {
    const lookup = new Map();

    partyListRows.forEach((row) => {
        const provinceCode = Number(row["รหัสจังหวัด"]);
        const district = Number(row["เขต"]);
        const party = (row["party_name_clean"] || "ไม่มีข้อมูล").trim() || "ไม่มีข้อมูล";
        const votes = parseNumber(row["คะแนน"]);
        const number = Number(row["หมายเลข_clean"]);

        if (!Number.isInteger(provinceCode) || !Number.isInteger(district) || !Number.isFinite(votes)) {
            return;
        }

        const key = `${provinceCode}-${district}`;
        if (!lookup.has(key)) {
            lookup.set(key, []);
        }

        lookup.get(key).push({
            party,
            candidate: "",
            votes,
            number: Number.isInteger(number) ? number : null,
        });
    });

    lookup.forEach((rows) => {
        rows.sort((left, right) => right.votes - left.votes);
    });

    return lookup;
}

function buildWinningRepresentativeNumberLookup(constiVoteLookup) {
    const lookup = new Map();

    constiVoteLookup.forEach((rows, key) => {
        const winner = rows.find((row) => Number.isFinite(row.votes));
        lookup.set(key, Number.isInteger(winner?.number) ? winner.number : null);
    });

    return lookup;
}

function buildSmallPartyNameSet(partyListRows, constiVoteLookup) {
    const winnerPartyNames = new Set();
    const eligiblePartyNames = new Set();

    constiVoteLookup.forEach((rows) => {
        const winner = rows.find((row) => Number.isFinite(row.votes));
        const winnerParty = (winner?.party || "").trim();
        if (winnerParty) {
            winnerPartyNames.add(winnerParty);
        }
    });

    partyListRows.forEach((row) => {
        const partyNumber = Number(row["หมายเลข_clean"]);
        const partyName = (row["party_name_clean"] || "").trim();
        if (Number.isInteger(partyNumber) && partyNumber >= 10 && partyName) {
            eligiblePartyNames.add(partyName);
        }
    });

    const smallPartyNames = new Set();
    eligiblePartyNames.forEach((partyName) => {
        if (!winnerPartyNames.has(partyName)) {
            smallPartyNames.add(partyName);
        }
    });

    return smallPartyNames;
}

function getPopupVoteRowsForRecord(record) {
    if (!record) {
        return [];
    }
    const key = `${record.provinceCode}-${record.district}`;
    if (state.popupVoteTrack === "party_list") {
        return state.partyListVotesByKey.get(key) || [];
    }
    return state.constituencyVotesByKey.get(key) || [];
}

function renderPopupElectionResult(record) {
    if (!popupElectionResultList) {
        return;
    }

    popupElectionResultList.innerHTML = "";
    const rows = getPopupVoteRowsForRecord(record);

    if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "popup-election-empty";
        empty.textContent = "ไม่พบข้อมูลผลคะแนน";
        popupElectionResultList.appendChild(empty);
        return;
    }

    rows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "popup-election-row";

        const main = document.createElement("div");
        main.className = "popup-election-row-main";

        const dot = document.createElement("span");
        dot.className = "popup-election-dot";
        dot.style.backgroundColor = makePartyColor(row.party);

        const textWrap = document.createElement("div");

        const label = document.createElement("div");
        label.className = "popup-election-label";
        label.textContent = row.party;

        const sub = document.createElement("div");
        sub.className = "popup-election-sub";
        if (state.popupVoteTrack === "constituency") {
            const numberText = Number.isInteger(row.number) ? `หมายเลข ${row.number}` : "หมายเลข -";
            const candidateText = row.candidate || "-";
            sub.textContent = `${numberText} • ${candidateText}`;
        } else {
            const numberText = Number.isInteger(row.number) ? `หมายเลขพรรค ${row.number}` : "หมายเลขพรรค -";
            sub.textContent = numberText;
        }

        textWrap.append(label, sub);
        main.append(dot, textWrap);

        const votes = document.createElement("div");
        votes.className = "popup-election-votes";
        votes.textContent = Number(row.votes).toLocaleString("th-TH");

        item.append(main, votes);
        popupElectionResultList.appendChild(item);
    });
}

function renderPopupMetricBeeswarm(container, metricKey, selectedRecordKey) {
    if (!container) {
        return;
    }

    container.innerHTML = "";

    const points = state.records
        .map((record) => ({
            record,
            value: getMetricValue(record, metricKey),
        }))
        .filter((entry) => Number.isFinite(entry.value));

    if (!points.length) {
        const empty = document.createElement("p");
        empty.className = "overview-empty";
        empty.textContent = "ไม่มีข้อมูล";
        container.appendChild(empty);
        return;
    }

    const width = Math.max(220, Math.floor(container.clientWidth || 260));
    const height = Math.max(82, Math.floor(container.clientHeight || 92));
    const isVerticalTurnout = metricKey === "turnout";
    const margin = isVerticalTurnout
        ? { top: 10, right: 12, bottom: 18, left: 62 }
        : { top: 8, right: 12, bottom: 20, left: 12 };
    const innerWidth = Math.max(100, width - margin.left - margin.right);
    const innerHeight = Math.max(40, height - margin.top - margin.bottom);
    const centerY = innerHeight / 2;
    const centerX = innerWidth / 2;

    const minValue = d3.min(points, (entry) => entry.value) || 0;
    const maxValue = d3.max(points, (entry) => entry.value) || 0;
    const pad = minValue === maxValue ? Math.max(1, Math.abs(minValue) * 0.08 || 1) : 0;

    const valueScale = d3
        .scaleLinear()
        .domain([minValue - pad, maxValue + pad])
        .nice()
        .range(isVerticalTurnout ? [innerHeight, 0] : [0, innerWidth]);

    const nodes = points.map((entry, index) => ({
        id: index,
        record: entry.record,
        value: entry.value,
        x: isVerticalTurnout ? centerX : valueScale(entry.value),
        y: isVerticalTurnout ? valueScale(entry.value) : centerY,
    }));

    const simulation = d3
        .forceSimulation(nodes)
        .force("x", isVerticalTurnout
            ? d3.forceX(centerX).strength(0.15)
            : d3.forceX((node) => valueScale(node.value)).strength(1))
        .force("y", isVerticalTurnout
            ? d3.forceY((node) => valueScale(node.value)).strength(1)
            : d3.forceY(centerY).strength(0.15))
        .force("collide", d3.forceCollide(4.6))
        .stop();

    for (let tick = 0; tick < 180; tick += 1) {
        simulation.tick();
    }

    const svg = d3
        .select(container)
        .append("svg")
        .attr("class", "popup-beeswarm-svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    if (isVerticalTurnout) {
        const axis = d3
            .axisLeft(valueScale)
            .ticks(4)
            .tickFormat((value) => formatOverviewMetricValue(metricKey, Number(value)));

        chart
            .append("g")
            .attr("class", "overview-axis")
            .call(axis);
    } else {
        const axis = d3
            .axisBottom(valueScale)
            .ticks(4)
            .tickFormat((value) => formatOverviewMetricValue(metricKey, Number(value)));

        chart
            .append("g")
            .attr("class", "overview-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(axis);
    }

    const pointLayer = chart.append("g");
    pointLayer
        .selectAll("circle.beeswarm-point")
        .data(nodes)
        .join("circle")
        .attr("class", (node) => {
            const recordKey = node.record.key || `${node.record.provinceCode}-${node.record.district}`;
            return `beeswarm-point${recordKey === selectedRecordKey ? " is-linked-hover" : ""}`;
        })
        .attr("cx", (node) => Math.max(4, Math.min(innerWidth - 4, node.x)))
        .attr("cy", (node) => Math.max(4, Math.min(innerHeight - 4, node.y)))
        .attr("r", 4.2);

    if (selectedRecordKey) {
        const selectedPoint = pointLayer.select("circle.beeswarm-point.is-linked-hover");
        if (!selectedPoint.empty() && selectedPoint.node()?.parentNode) {
            selectedPoint.node().parentNode.appendChild(selectedPoint.node());
        }
    }
}

function renderPopupMetricPanels(record) {
    const tooltipData = getTileTooltipData(record);

    if (popupSummaryRows) {
        popupSummaryRows.innerHTML = tooltipData.rows
            .map((row) => `
                <div class="popup-summary-row">
                    <span class="popup-summary-label">${escapeHtml(row.label)}</span>
                    ${row.label === "พรรคผู้ชนะ"
        ? `<span class="popup-summary-value popup-summary-value-with-dot"><span class="popup-election-dot" style="background-color: ${escapeHtml(makePartyColor(row.value))}"></span><span>${escapeHtml(row.value)}</span></span>`
        : `<span class="popup-summary-value">${escapeHtml(row.value)}</span>`}
                </div>
            `)
            .join("");
    }

    const selectedRecordKey = record?.key || null;

    popupMetricPanels.forEach((panel) => {
        const container = document.getElementById(panel.containerId);
        const valueLabel = panel.valueId ? document.getElementById(panel.valueId) : null;

        if (valueLabel) {
            const currentValue = record ? getMetricValue(record, panel.metricKey) : null;
            valueLabel.textContent = formatOverviewMetricValue(panel.metricKey, currentValue);
        }

        renderPopupMetricBeeswarm(container, panel.metricKey, selectedRecordKey);
    });
}

function updateOverallScoreWeights(changedMetricKey, nextWeight) {
    const constrained = Math.max(0, Math.min(1, Number(nextWeight) || 0));
    const previous = { ...state.overallScoreWeights };
    const next = { ...previous, [changedMetricKey]: constrained };

    const otherKeys = overallScoreMetricKeys.filter((metricKey) => metricKey !== changedMetricKey);
    const remainder = 1 - constrained;
    const previousOtherSum = otherKeys.reduce((sum, metricKey) => sum + Math.max(0, Number(previous[metricKey]) || 0), 0);

    if (otherKeys.length === 0) {
        state.overallScoreWeights = { [changedMetricKey]: 1 };
        return;
    }

    if (previousOtherSum > 0) {
        otherKeys.forEach((metricKey) => {
            const oldWeight = Math.max(0, Number(previous[metricKey]) || 0);
            next[metricKey] = (oldWeight / previousOtherSum) * remainder;
        });
    } else {
        const equalWeight = remainder / otherKeys.length;
        otherKeys.forEach((metricKey) => {
            next[metricKey] = equalWeight;
        });
    }

    const total = overallScoreMetricKeys.reduce((sum, metricKey) => sum + (Number(next[metricKey]) || 0), 0);
    const correctionKey = otherKeys[0] || changedMetricKey;
    next[correctionKey] = (Number(next[correctionKey]) || 0) + (1 - total);

    const normalizedTotal = overallScoreMetricKeys.reduce((sum, metricKey) => sum + (Number(next[metricKey]) || 0), 0);
    if (normalizedTotal > 0) {
        overallScoreMetricKeys.forEach((metricKey) => {
            next[metricKey] = Math.max(0, (Number(next[metricKey]) || 0) / normalizedTotal);
        });
    }

    state.overallScoreWeights = next;
}

function clearOverallScoreRerenderTimer() {
    if (state.overallScoreRerenderTimerId !== null) {
        window.clearTimeout(state.overallScoreRerenderTimerId);
        state.overallScoreRerenderTimerId = null;
    }
}

function scheduleOverallScoreRerender(delayMs = 80) {
    clearOverallScoreRerenderTimer();
    state.overallScoreRerenderTimerId = window.setTimeout(() => {
        state.overallScoreRerenderTimerId = null;
        rerenderForOverallScoreChange({ refreshOverview: true });
    }, delayMs);
}

function rerenderForOverallScoreChange({ refreshOverview = false } = {}) {
    if (refreshOverview) {
        renderOverviewPanel();
    }
    renderConstituencyList();
    renderTileGrid(state.gridRows, state.winnerLookup, state.provincesByAcronym);
}

function syncOverallScoreControlValues(container = overviewPanel) {
    if (!container) {
        return;
    }

    const controls = container.querySelector(".overall-score-controls");
    if (!controls) {
        return;
    }

    overallScoreMetricKeys.forEach((metricKey) => {
        const weightValue = Number(state.overallScoreWeights[metricKey]) || 0;
        const row = controls.querySelector(`.overall-score-row[data-metric-key='${metricKey}']`);
        if (!row) {
            return;
        }

        const valueLabel = row.querySelector(".overall-score-value");
        if (valueLabel) {
            valueLabel.textContent = `${(weightValue * 100).toFixed(0)}%`;
        }

        const slider = row.querySelector(".overall-score-slider");
        if (slider) {
            slider.value = String(Math.round(weightValue * 100));
        }
    });
}

function renderOverallScoreControls(container) {
    const controls = document.createElement("div");
    controls.className = "overall-score-controls";

    // const subtitle = document.createElement("p");
    // subtitle.className = "overall-score-subtitle";
    // subtitle.textContent = "ปรับค่าน้ำหนักขององค์ประกอบให้รวมกันเท่ากับ 100%";
    // controls.appendChild(subtitle);

    overallScoreMetricKeys.forEach((metricKey) => {
        const row = document.createElement("div");
        row.className = "overall-score-row";
        row.dataset.metricKey = metricKey;

        const header = document.createElement("div");
        header.className = "overall-score-row-header";

        const label = document.createElement("span");
        label.className = "overall-score-label";
        label.textContent = metricKey === "turnout"
            ? "สัดส่วนผู้ออกมาใช้สิทธิ์ต่างจากปกติ"
            : getMetricLabel(metricKey);

        const weightValue = Number(state.overallScoreWeights[metricKey]) || 0;
        const valueLabel = document.createElement("span");
        valueLabel.className = "overall-score-value";
        valueLabel.textContent = `${(weightValue * 100).toFixed(0)}%`;

        header.append(label, valueLabel);

        const slider = document.createElement("input");
        slider.className = "overall-score-slider";
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "1";
        slider.value = String(Math.round(weightValue * 100));
        slider.addEventListener("input", (event) => {
            const sliderValue = Number(event.target.value) / 100;
            updateOverallScoreWeights(metricKey, sliderValue);
            syncOverallScoreControlValues(container);
            rerenderForOverallScoreChange({ refreshOverview: false });
        });

        const commitUpdate = () => {
            clearOverallScoreRerenderTimer();
            rerenderForOverallScoreChange({ refreshOverview: true });
        };

        slider.addEventListener("change", commitUpdate);
        slider.addEventListener("pointerup", commitUpdate);

        row.append(header, slider);
        controls.appendChild(row);
    });

    container.appendChild(controls);
}

const textMeasureCanvas = document.createElement("canvas");
const textMeasureContext = textMeasureCanvas.getContext("2d");

function measureTextWidth(text, font = "700 12px ElectionUI") {
    if (!textMeasureContext) {
        return text.length * 8;
    }
    textMeasureContext.font = font;
    return textMeasureContext.measureText(text).width;
}

function truncateTextToWidth(text, maxWidth, font = "700 12px ElectionUI") {
    if (!text) {
        return "";
    }

    if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
        return "…";
    }

    const ellipsis = "…";
    const ellipsisWidth = measureTextWidth(ellipsis, font);
    if (maxWidth <= ellipsisWidth) {
        return ellipsis;
    }

    if (measureTextWidth(text, font) <= maxWidth) {
        return text;
    }

    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const sample = `${text.slice(0, mid)}${ellipsis}`;
        if (measureTextWidth(sample, font) <= maxWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    const safeLength = Math.max(1, low);
    return `${text.slice(0, safeLength)}${ellipsis}`;
}

function ensureOverviewTooltip(container) {
    let tooltip = container.querySelector(".overview-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "overview-tooltip";
        tooltip.setAttribute("aria-hidden", "true");
        container.appendChild(tooltip);
    }
    return tooltip;
}

function hideOverviewTooltip(tooltip) {
    if (!tooltip) {
        return;
    }
    tooltip.classList.remove("visible");
    tooltip.setAttribute("aria-hidden", "true");
}

function showOverviewTooltip(tooltip, container, event, content) {
    if (!tooltip || !container) {
        return;
    }
    tooltip.textContent = content;
    tooltip.classList.add("visible");
    tooltip.setAttribute("aria-hidden", "false");
    const tooltipWidth = tooltip.offsetWidth || 0;
    const tooltipHeight = tooltip.offsetHeight || 24;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const edgePadding = 8;
    const offsetX = 14;
    const offsetY = 12;

    let left = event.clientX + offsetX;
    let top = event.clientY - tooltipHeight - offsetY;

    const maxLeft = Math.max(edgePadding, viewportWidth - tooltipWidth - edgePadding);
    left = Math.max(edgePadding, Math.min(maxLeft, left));

    if (top < edgePadding) {
        top = event.clientY + offsetY;
    }
    const maxTop = Math.max(edgePadding, viewportHeight - tooltipHeight - edgePadding);
    top = Math.max(edgePadding, Math.min(maxTop, top));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function renderWinnerOverview(container) {
    const countsByParty = new Map();

    getVisibleRecords().forEach((record) => {
        const partyName = String(record.party || "").trim();
        if (!partyName || excludedWinnerPartyLabels.has(partyName)) {
            return;
        }
        countsByParty.set(partyName, (countsByParty.get(partyName) || 0) + 1);
    });

    const sortedParties = [...countsByParty.entries()].sort((left, right) => right[1] - left[1]);
    if (sortedParties.length === 0) {
        const empty = document.createElement("p");
        empty.className = "overview-empty";
        empty.textContent = "ไม่มีข้อมูลพรรคที่สรุปได้ในภูมิภาคนี้";
        container.appendChild(empty);
        return;
    }

    const plotWrap = document.createElement("div");
    plotWrap.className = "overview-winner-bar";
    container.appendChild(plotWrap);

    const width = Math.max(280, Math.floor(plotWrap.clientWidth || container.clientWidth || 320));
    const containerHeight = Math.max(220, Math.floor(plotWrap.clientHeight || (container.clientHeight - 44) || 260));
    const margin = { top: 8, right: 8, bottom: 8, left: 10 };
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = Math.max(120, containerHeight - margin.top - margin.bottom);
    const barSlotHeight = innerHeight / 10;
    const barHeight = Math.max(8, barSlotHeight * 0.78);
    const chartInnerHeight = Math.max(innerHeight, sortedParties.length * barSlotHeight);
    const chartHeight = Math.ceil(chartInnerHeight + margin.top + margin.bottom);

    const xMax = d3.max(sortedParties, (entry) => entry[1]) || 1;
    const xScale = d3.scaleLinear().domain([0, xMax]).nice().range([0, innerWidth]);

    const rows = sortedParties.map(([partyName, count], index) => {
        const y = (index * barSlotHeight) + ((barSlotHeight - barHeight) / 2);
        return {
            partyName,
            count,
            y,
            barHeight,
            barWidth: xScale(count),
        };
    });

    const svg = d3
        .select(plotWrap)
        .append("svg")
        .attr("class", "overview-winner-bar-svg")
        .attr("width", width)
        .attr("height", chartHeight)
        .attr("viewBox", `0 0 ${width} ${chartHeight}`)
        .attr("preserveAspectRatio", "xMinYMin meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    chart
        .append("g")
        .selectAll("rect.overview-winner-bar-rect")
        .data(rows)
        .join("rect")
        .attr("class", "overview-winner-bar-rect")
        .attr("x", 0)
        .attr("y", (entry) => entry.y)
        .attr("height", (entry) => entry.barHeight)
        .attr("width", (entry) => entry.barWidth)
        .attr("fill", (entry) => makePartyColor(entry.partyName));

    const labelFont = "700 16px ElectionUI";
    const labelData = rows.map((row) => {
        const { partyName, count, barWidth } = row;
        const fullLabel = `${partyName}: ${count.toLocaleString("th-TH")}`;
        const fullLabelWidth = measureTextWidth(fullLabel, labelFont);
        const insidePadding = 8;
        const outsidePadding = 6;
        const placeInside = barWidth >= (fullLabelWidth + (insidePadding * 2));
        const labelX = placeInside ? Math.max(insidePadding, barWidth - insidePadding) : (barWidth + outsidePadding);
        const maxWidth = placeInside
            ? Math.max(8, barWidth - (insidePadding * 2))
            : Math.max(8, innerWidth - labelX - 2);

        return {
            partyName,
            count,
            barWidth,
            y: row.y,
            barHeight: row.barHeight,
            labelText: truncateTextToWidth(fullLabel, maxWidth, labelFont),
            labelX,
            placeInside,
        };
    });

    chart
        .append("g")
        .selectAll("text.overview-winner-bar-label")
        .data(labelData)
        .join("text")
        .attr("class", (entry) => `overview-winner-bar-label ${entry.placeInside ? "is-inside" : "is-outside"}`)
        .attr("x", (entry) => entry.labelX)
        .attr("y", (entry) => entry.y + (entry.barHeight / 2))
        .attr("text-anchor", (entry) => (entry.placeInside ? "end" : "start"))
        .attr("dominant-baseline", "middle")
        .text((entry) => entry.labelText);
}

function renderMetricBeeswarm(container, metricKey) {
    const points = getVisibleRecords()
        .map((record) => ({
            record,
            value: getMetricValue(record, metricKey),
        }))
        .filter((entry) => Number.isFinite(entry.value));

    if (points.length === 0) {
        const empty = document.createElement("p");
        empty.className = "overview-empty";
        empty.textContent = "ไม่มีข้อมูลตัวเลขสำหรับภูมิภาคนี้";
        container.appendChild(empty);
        return;
    }

    const plotWrap = document.createElement("div");
    plotWrap.className = "overview-beeswarm";
    container.appendChild(plotWrap);

    const tooltip = ensureOverviewTooltip(plotWrap);

    const width = Math.max(240, Math.floor(plotWrap.clientWidth || container.clientWidth || 300));
    const height = Math.max(220, Math.floor(plotWrap.clientHeight || 280));
    const margin = { top: 8, right: 12, bottom: 16, left: 50 };
    const innerWidth = Math.max(140, width - margin.left - margin.right);
    const innerHeight = Math.max(140, height - margin.top - margin.bottom);

    const minValue = d3.min(points, (entry) => entry.value) || 0;
    const maxValue = d3.max(points, (entry) => entry.value) || 0;
    const pad = minValue === maxValue ? Math.max(1, Math.abs(minValue) * 0.08 || 1) : 0;

    const yScale = d3
        .scaleLinear()
        .domain([minValue - pad, maxValue + pad])
        .nice()
        .range([innerHeight, 0]);

    const nodes = points.map((entry, index) => ({
        id: index,
        record: entry.record,
        value: entry.value,
        x: innerWidth / 2,
        y: yScale(entry.value),
    }));

    const simulation = d3
        .forceSimulation(nodes)
        .force("x", d3.forceX(innerWidth / 2).strength(0.06))
        .force("y", d3.forceY((node) => yScale(node.value)).strength(1))
        .force("collide", d3.forceCollide(4.6))
        .stop();

    for (let tick = 0; tick < 220; tick += 1) {
        simulation.tick();
    }

    const svg = d3
        .select(plotWrap)
        .append("svg")
        .attr("class", "overview-beeswarm-svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    const yAxis = d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((value) => formatOverviewMetricValue(metricKey, Number(value)));

    chart.append("g").attr("class", "overview-axis").call(yAxis);

    const pointSelection = chart
        .append("g")
        .selectAll("circle.beeswarm-point")
        .data(nodes)
        .join("circle")
        .attr("class", "beeswarm-point")
        .attr("data-record-key", (node) => node.record.key || `${node.record.provinceCode}-${node.record.district}`)
        .attr("cx", (node) => Math.max(5, Math.min(innerWidth - 5, node.x)))
        .attr("cy", (node) => Math.max(4, Math.min(innerHeight - 4, node.y)))
        .attr("r", 4.2)
        .on("mouseenter", function handleMouseEnter(event, node) {
            pointSelection.classed("is-hovered", (candidate) => candidate.id === node.id);
            if (this.parentNode) {
                this.parentNode.appendChild(this);
            }
            showOverviewTooltip(
                tooltip,
                plotWrap,
                event,
                `${node.record.provinceName} เขต ${node.record.district} • ${formatOverviewMetricValue(metricKey, node.value)}`
            );
        })
        .on("mousemove", function handleMouseMove(event, node) {
            showOverviewTooltip(
                tooltip,
                plotWrap,
                event,
                `${node.record.provinceName} เขต ${node.record.district} • ${formatOverviewMetricValue(metricKey, node.value)}`
            );
        })
        .on("mouseleave", () => {
            pointSelection.classed("is-hovered", false);
            hideOverviewTooltip(tooltip);
        })
        .on("click", (_, node) => {
            openPopup(node.record);
        });

    plotWrap.addEventListener("mouseleave", () => {
        pointSelection.classed("is-hovered", false);
        hideOverviewTooltip(tooltip);
        if (!hoveredMapTile) {
            clearOverviewLinkedHighlight();
        }
    });
}

function renderOverviewPanel() {
    if (!overviewPanel) {
        return;
    }

    overviewPanel.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "overview-title";
    title.textContent = state.selectedMetric === "winner"
        ? "สรุปจำนวนเขตที่ชนะ"
        : `${getMetricLabel(state.selectedMetric)}`;

    const metricsWithTooltips = ["ballot_difference", "turnout", "discrepancy"];
    const hasTooltip = metricsWithTooltips.includes(state.selectedMetric);

    if (hasTooltip) {
        const titleRow = document.createElement("div");
        titleRow.className = "overview-title-row";

        const helpTrigger = document.createElement("span");
        helpTrigger.className = "info-icon";
        helpTrigger.setAttribute("aria-hidden", "true");
        helpTrigger.textContent = "?";
        helpTrigger.style.marginLeft = "8px";

        const tooltipId = {
            "ballot_difference": "tooltip-ballot-difference",
            "turnout": "tooltip-turnout",
            "discrepancy": "tooltip-discrepancy",
            "overall_score": "tooltip-overall-score"
        }[state.selectedMetric];

        if (tooltipId && document.getElementById(tooltipId)) {
            const tooltip = document.getElementById(tooltipId);
            
            helpTrigger.addEventListener("mouseenter", () => {
                tooltip.style.display = "block";
                positionMetricTooltip(helpTrigger, tooltip);
            });
            
            helpTrigger.addEventListener("mouseleave", () => {
                setTimeout(() => {
                    if (!tooltip.matches(":hover")) {
                        tooltip.style.display = "none";
                    }
                }, 100);
            });
            
            tooltip.addEventListener("mouseenter", () => {
                tooltip.style.display = "block";
            });
            
            tooltip.addEventListener("mouseleave", () => {
                tooltip.style.display = "none";
            });
        }

        titleRow.append(title, helpTrigger);
        overviewPanel.appendChild(titleRow);
    } else {
        overviewPanel.appendChild(title);
    }

    if (state.selectedMetric === "winner") {
        renderWinnerOverview(overviewPanel);
        clearOverviewLinkedHighlight();
        return;
    }

    if (state.selectedMetric === "overall_score") {
        renderOverallScoreControls(overviewPanel);
        renderMetricBeeswarm(overviewPanel, state.selectedMetric);
        applyOverviewLinkedHighlight(hoveredMapTile?.dataset.recordKey);
        return;
    }

    renderMetricBeeswarm(overviewPanel, state.selectedMetric);
    applyOverviewLinkedHighlight(hoveredMapTile?.dataset.recordKey);
}

function openPopup(record) {
    if (!record) {
        return;
    }
    state.popupActiveRecordKey = record.key || `${record.provinceCode}-${record.district}`;
    popupTitle.textContent = `${record.provinceName} เขต ${record.district}`;
    detailPopup.hidden = false;

    renderPopupMetricPanels(record);
    renderPopupElectionResult(record);

    updateChart3ForRecord(record);

    window.requestAnimationFrame(() => {
        if (detailPopup.hidden) {
            return;
        }

        renderPopupMetricPanels(record);

        if (typeof renderChart4CurrentSelection === "function") {
            renderChart4CurrentSelection(record);
        }
    });
}

function closePopup() {
    detailPopup.hidden = true;
}

function positionBenfordTooltip() {
    const benfordInfoIcon = document.getElementById("benford-info-icon");
    const benfordInfoTooltip = document.getElementById("benford-info-tooltip");
    
    if (!benfordInfoIcon || !benfordInfoTooltip) return;

    const iconRect = benfordInfoIcon.getBoundingClientRect();
    const tooltipRect = benfordInfoTooltip.getBoundingClientRect();
    
    // Default position: below and to the right of icon
    let top = iconRect.bottom + 12;
    let left = iconRect.left;
    
    // Check if tooltip would overflow right side of screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 16;
    }
    
    // Check if tooltip would overflow bottom of screen
    if (top + tooltipRect.height > window.innerHeight) {
        top = iconRect.top - tooltipRect.height - 12;
    }
    
    // Ensure tooltip doesn't go above screen
    if (top < 0) {
        top = 8;
    }
    
    // Ensure tooltip doesn't go to the left of screen
    if (left < 0) {
        left = 8;
    }
    
    benfordInfoTooltip.style.top = `${top}px`;
    benfordInfoTooltip.style.left = `${left}px`;
}

function renderConstituencyList() {
    const keyword = state.searchQuery.trim().toLowerCase();
    constituencyList.innerHTML = "";

    const filtered = state.records.filter((record) => {
        if (!isRecordInRegion(record)) {
            return false;
        }
        if (!keyword) {
            return true;
        }
        const haystack = `${record.provinceName} ${record.tileCode} ${record.candidate} ${record.party}`.toLowerCase();
        return haystack.includes(keyword);
    });

    if (state.selectedMetric !== "winner") {
        filtered.sort((left, right) => {
            const leftValue = getMetricValue(left, state.selectedMetric);
            const rightValue = getMetricValue(right, state.selectedMetric);
            const leftFinite = Number.isFinite(leftValue);
            const rightFinite = Number.isFinite(rightValue);

            if (!leftFinite && !rightFinite) {
                return 0;
            }
            if (!leftFinite) {
                return 1;
            }
            if (!rightFinite) {
                return -1;
            }
            return rightValue - leftValue;
        });
    }

    filtered.forEach((record) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "constituency-item";
        if (record.isMissingData) {
            card.classList.add("missing");
        }
        const rightLabel = formatMetricValueForList(record);
        card.innerHTML = `<span class="constituency-item-left"><span class="constituency-province">${record.provinceName}</span><span class="constituency-district">เขต ${record.district}</span></span><span class="constituency-item-right">${rightLabel}</span>`;
        card.addEventListener("click", () => openPopup(record));
        constituencyList.appendChild(card);
    });
}

function renderMetricSelector() {
    metricSelector.innerHTML = "";
    for (let index = 0; index < metricOptions.length; index += 2) {
        const row = document.createElement("div");
        row.className = "metric-row";

        const pair = metricOptions.slice(index, index + 2);
        pair.forEach((option) => {
            const button = document.createElement("button");
            const isSelected = option.key === state.selectedMetric;
            button.type = "button";
            button.className = "metric-option";
            if (isSelected) {
                button.classList.add("active");
            }
            button.textContent = option.label;
            button.title = option.label;
            button.setAttribute("aria-pressed", isSelected ? "true" : "false");
            button.addEventListener("click", () => {
                state.selectedMetric = option.key;
                renderAll();
            });
            row.appendChild(button);
        });

        metricSelector.appendChild(row);
    }
}

function positionMetricTooltip(icon, tooltip) {
    const iconRect = icon.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Default position: below and to the right of icon
    let top = iconRect.bottom + 12;
    let left = iconRect.left;
    
    // Check if tooltip would overflow right side of screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 16;
    }
    
    // Check if tooltip would overflow bottom of screen
    if (top + tooltipRect.height > window.innerHeight) {
        top = iconRect.top - tooltipRect.height - 12;
    }
    
    // Ensure tooltip doesn't go above screen
    if (top < 0) {
        top = 8;
    }
    
    // Ensure tooltip doesn't go to the left of screen
    if (left < 0) {
        left = 8;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

function renderRegionFilter() {
    const current = state.selectedRegion;
    regionFilter.innerHTML = "";

    getRegionList().forEach((region) => {
        const option = document.createElement("option");
        option.value = region.key;
        option.textContent = region.label;
        regionFilter.appendChild(option);
    });

    regionFilter.value = current;
}

function renderBenfordFilter() {
    const parties = Object.keys(state.benfordData?.parties || {}).sort();
    benfordPartyFilter.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "overall";
    allOption.textContent = "ทุกพรรค";
    benfordPartyFilter.appendChild(allOption);

    parties.forEach((party) => {
        const option = document.createElement("option");
        option.value = party;
        option.textContent = party;
        benfordPartyFilter.appendChild(option);
    });

    if (state.selectedPartyForBenford !== "overall" && !parties.includes(state.selectedPartyForBenford)) {
        state.selectedPartyForBenford = "overall";
    }

    benfordPartyFilter.value = state.selectedPartyForBenford;
}

function computeBenfordData() {
    const digits = d3.range(1, 10);

    const selectedData = state.selectedPartyForBenford === "overall"
        ? state.benfordData?.overall
        : state.benfordData?.parties?.[state.selectedPartyForBenford];

    const distributionByDigit = new Map(
        (selectedData?.distribution || []).map((entry) => [Number(entry.digit), entry])
    );

    return digits.map((digit) => {
        const entry = distributionByDigit.get(digit);
        const actualRatio = Number(entry?.actual_ratio) || 0;
        const theoreticalPct = BENFORD_THEORETICAL_PERCENT[digit] || 0;
        const actualPct = actualRatio * 100;
        const difference = actualPct - theoreticalPct;

        return {
            digit,
            expected: Number(entry?.expected) || 0,
            actual: Number(entry?.actual) || 0,
            actualPct: Number.isFinite(actualPct) ? actualPct : 0,
            theoreticalPct: theoreticalPct,
            difference: Number.isFinite(difference) ? difference : 0,
        };
    });
}

function renderBenfordChart() {
    const data = computeBenfordData();
    benfordChart.innerHTML = "";

    const width = benfordChart.clientWidth;
    const height = benfordChart.clientHeight;
    const margin = { top: 22, right: 16, bottom: 36, left: 42 };
    const innerWidth = Math.max(300, width - margin.left - margin.right);
    const innerHeight = Math.max(220, height - margin.top - margin.bottom);

    const svg = d3
        .select(benfordChart)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    const xScale = d3.scaleBand().domain(data.map((entry) => String(entry.digit))).range([0, innerWidth]).padding(0.22);
    const maxY = Math.max(1, d3.max(data, (entry) => Math.max(entry.actual, entry.expected)) || 1);
    const yScale = d3.scaleLinear().domain([0, maxY]).nice().range([innerHeight, 0]);

    chart
        .append("g")
        .selectAll("rect.expected")
        .data(data)
        .join("rect")
        .attr("x", (entry) => xScale(String(entry.digit)) || 0)
        .attr("y", (entry) => yScale(entry.expected))
        .attr("width", xScale.bandwidth())
        .attr("height", (entry) => innerHeight - yScale(entry.expected))
        .attr("fill", "#d5dce8")
        .on("mouseenter", (event, entry) => {
            benfordTooltip.innerHTML = `
                <strong>Digit ${entry.digit}</strong>
                <span>Actual: ${entry.actualPct.toFixed(1)}%</span>
                <span>Benford: ${entry.theoreticalPct.toFixed(1)}%</span>
                <span>Difference: ${entry.difference.toFixed(1)}</span>
            `;
            const [x, y] = d3.pointer(event, benfordChart);
            benfordTooltip.style.left = `${x + 12}px`;
            benfordTooltip.style.top = `${y + 12}px`;
            benfordTooltip.classList.add("visible");
        })
        .on("mousemove", (event) => {
            const [x, y] = d3.pointer(event, benfordChart);
            benfordTooltip.style.left = `${x + 12}px`;
            benfordTooltip.style.top = `${y + 12}px`;
        })
        .on("mouseleave", () => {
            benfordTooltip.classList.remove("visible");
        });

    chart
        .append("g")
        .selectAll("rect.actual")
        .data(data)
        .join("rect")
        .attr("x", (entry) => (xScale(String(entry.digit)) || 0) + xScale.bandwidth() * 0.18)
        .attr("y", (entry) => yScale(entry.actual))
        .attr("width", xScale.bandwidth() * 0.64)
        .attr("height", (entry) => innerHeight - yScale(entry.actual))
        .attr("fill", "#3367d6")
        .on("mouseenter", (event, entry) => {
            benfordTooltip.innerHTML = `
                <strong>Digit ${entry.digit}</strong>
                <span>Actual: ${entry.actualPct.toFixed(1)}%</span>
                <span>Benford: ${entry.theoreticalPct.toFixed(1)}%</span>
                <span>Difference: ${entry.difference.toFixed(1)}</span>
            `;
            const [x, y] = d3.pointer(event, benfordChart);
            benfordTooltip.style.left = `${x + 12}px`;
            benfordTooltip.style.top = `${y + 12}px`;
            benfordTooltip.classList.add("visible");
        })
        .on("mousemove", (event) => {
            const [x, y] = d3.pointer(event, benfordChart);
            benfordTooltip.style.left = `${x + 12}px`;
            benfordTooltip.style.top = `${y + 12}px`;
        })
        .on("mouseleave", () => {
            benfordTooltip.classList.remove("visible");
        });

    chart
        .append("g")
        .attr("transform", `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSizeOuter(0));

    chart.append("g").call(d3.axisLeft(yScale).ticks(5));
}

function renderTileGrid(gridRows, winnerLookup, provinceLookup) {
    const columns = gridRows.reduce((max, row) => Math.max(max, row.length), 0);
    const rows = gridRows.length;
    const { svg, layer: mapContent } = getMapSvg();
    mapContent.innerHTML = "";

    const partyCountMap = new Map();
    const partyColorMap = new Map();
    const metricScale = getMetricScale(state.selectedMetric);

    document.documentElement.style.setProperty("--tile-size", state.selectedRegion === "all" ? "25px" : "30px");
    const rootStyles = getComputedStyle(document.documentElement);
    const tileSize = Number.parseFloat(rootStyles.getPropertyValue("--tile-size")) || 25;
    const tileGap = Number.parseFloat(rootStyles.getPropertyValue("--gap")) || 4;
    const contentWidth = Math.max(1, (columns * tileSize) + (Math.max(0, columns - 1) * tileGap));
    const contentHeight = Math.max(1, (rows * tileSize) + (Math.max(0, rows - 1) * tileGap));

    svg.setAttribute("width", String(contentWidth));
    svg.setAttribute("height", String(contentHeight));
    svg.setAttribute("viewBox", `0 0 ${contentWidth} ${contentHeight}`);

    state.mapView.contentWidth = contentWidth;
    state.mapView.contentHeight = contentHeight;
    clearHoveredTile();

    const createSvgNode = (name) => document.createElementNS("http://www.w3.org/2000/svg", name);

    gridRows.forEach((row, rowIndex) => {
        for (let column = 0; column < columns; column += 1) {
            const value = (row[column] || "").trim().toLowerCase();
            const x = column * (tileSize + tileGap);
            const y = rowIndex * (tileSize + tileGap);

            if (!value) {
                continue;
            }

            const provinceLabelMatches = value.match(/^([a-z]+)$/);
            if (provinceLabelMatches) {
                const acronym = provinceLabelMatches[1];
                const thaiName = state.provinceThaiNameByAcronym.get(acronym) || acronym.toUpperCase();
                const label = createSvgNode("text");
                label.classList.add("province-label-text");
                label.setAttribute("x", String(x));
                label.setAttribute("y", String(y + tileSize));
                label.textContent = thaiName;
                mapContent.appendChild(label);
                continue;
            }

            const matches = value.match(/^([a-z]+)(\d+)$/);
            const tileGroup = createSvgNode("g");
            tileGroup.classList.add("tile");

            const tileRect = createSvgNode("rect");
            tileRect.classList.add("tile-rect");
            tileRect.setAttribute("x", String(x));
            tileRect.setAttribute("y", String(y));
            tileRect.setAttribute("width", String(tileSize));
            tileRect.setAttribute("height", String(tileSize));
            tileRect.setAttribute("rx", "6");

            const tileText = createSvgNode("text");
            tileText.classList.add("tile-number");
            tileText.setAttribute("x", String(x + (tileSize / 2)));
            tileText.setAttribute("y", String(y + (tileSize / 2)));

            tileGroup.append(tileRect, tileText);

            if (!matches) {
                tileGroup.classList.add("no-data");
                tileText.textContent = value.toUpperCase().slice(0, 2);
                mapContent.appendChild(tileGroup);
                continue;
            }

            const acronym = matches[1];
            const district = Number(matches[2]);
            tileText.textContent = String(district);
            const provinceCode = provinceLookup.get(acronym);

            if (!provinceCode) {
                tileGroup.classList.add("no-data");
                mapContent.appendChild(tileGroup);
                continue;
            }

            tileGroup.dataset.mapTile = "constituency";

            const winner = winnerLookup.get(`${provinceCode}-${district}`);
            const regionKey = state.regionByProvinceCode.get(provinceCode) || "unknown";
            const inRegion = state.selectedRegion === "all" || regionKey === state.selectedRegion;

            tileGroup.dataset.regionKey = regionKey;

            if (!inRegion) {
                tileGroup.classList.add("missing");
                mapContent.appendChild(tileGroup);
                continue;
            }

            if (!winner) {
                tileGroup.classList.add("missing");
                mapContent.appendChild(tileGroup);
                continue;
            }

            const normalized = normalizeWinnerRecord(winner);
            const party = normalized.party;
            const candidate = normalized.candidate;
            const provinceName = normalized.provinceName;
            const record = state.recordByKey.get(`${provinceCode}-${district}`);
            const metricValue = getMetricValue(record, state.selectedMetric);

            if (record?.key) {
                tileGroup.dataset.recordKey = record.key;
            }

            if (state.selectedMetric === "winner") {
                if (!partyColorMap.has(party)) {
                    partyColorMap.set(party, makePartyColor(party));
                }
                tileRect.style.fill = partyColorMap.get(party);
                partyCountMap.set(party, (partyCountMap.get(party) || 0) + 1);
            } else if (Number.isFinite(metricValue)) {
                tileRect.style.fill = getMetricColor(metricValue, metricScale);
            } else {
                tileGroup.classList.add("missing");
                tileRect.style.fill = "#d7dee7";
            }

            if (record) {
                tileGroup.addEventListener("click", () => openPopup(record));
            }

            mapContent.appendChild(tileGroup);
        }
    });

    if (state.selectedMetric === "winner") {
        renderLegend(partyCountMap, partyColorMap);
    } else {
        renderMetricLegend();
    }

    bindMapInteractions();
    if (state.mapView.pendingRefitRegion !== null) {
        const targetRegion = state.mapView.pendingRefitRegion;
        state.mapView.pendingRefitRegion = null;
        focusMapForRegion(targetRegion);
    } else if (!state.mapView.hasInitialFit) {
        fitMapToViewport();
    } else {
        applyMapTransform();
    }

}

function buildConstituencyRecords(gridRows, winnerLookup, provinceLookup) {
    const records = [];
    gridRows.forEach((row) => {
        row.forEach((rawValue) => {
            const value = (rawValue || "").trim().toLowerCase();
            const matches = value.match(/^([a-z]+)(\d+)$/);
            if (!matches) {
                return;
            }
            const acronym = matches[1];
            const district = Number(matches[2]);
            const provinceCode = provinceLookup.get(acronym);
            if (!Number.isInteger(provinceCode)) {
                return;
            }

            const winner = winnerLookup.get(`${provinceCode}-${district}`);
            const normalized = winner ? normalizeWinnerRecord(winner) : null;
            const regionKey = state.regionByProvinceCode.get(provinceCode) || "unknown";
            const regionLabel = state.regionLabels.get(regionKey) || regionKey;

            records.push({
                key: `${provinceCode}-${district}`,
                tileCode: value,
                provinceCode,
                district,
                provinceName: normalized?.provinceName || value.toUpperCase(),
                party: normalized?.party || "ไม่มีข้อมูล",
                candidate: normalized?.candidate || "ไม่มีข้อมูล",
                votes: normalized?.votes ?? null,
                firstDigit: null,
                metrics: normalized?.metrics || {
                    ballot_difference: null,
                    turnout: null,
                    discrepancy: null,
                    party_list_voter_came: null,
                    consti_voters_came: null,
                    lower_number_tendency: null,
                },
                regionKey,
                regionLabel,
                isMissingData: !winner,
                type: "constituency",
            });
        });
    });
    return records;
}

function buildPartyListRecords(partyListCsv) {
    const rows = toObjects(partyListCsv);
    const records = [];

    rows.forEach((row) => {
        const provinceCode = Number(row["รหัสจังหวัด"] || "");
        const provinceName = row["province_clean"] || "";
        const district = Number(row["เขต"] || "");
        const partyName = row["party_name_clean"] || "Unknown";
        const votes = parseNumber(row["คะแนน"] || "");
        const firstDigit = Number(row["First_digit"] || row["First_Digit"] || "");

        if (!Number.isInteger(provinceCode) || votes === null || !Number.isInteger(firstDigit) || firstDigit < 1 || firstDigit > 9) {
            return;
        }

        const regionKey = state.regionByProvinceCode.get(provinceCode) || "unknown";
        const regionLabel = state.regionLabels.get(regionKey) || regionKey;

        records.push({
            provinceCode,
            district,
            provinceName,
            party: partyName,
            candidate: "",
            votes,
            firstDigit,
            metrics: {
                ballot_difference: null,
                turnout: null,
                discrepancy: null,
                party_list_voter_came: null,
                consti_voters_came: null,
                lower_number_tendency: null,
            },
            regionKey,
            regionLabel,
            isMissingData: false,
            type: "partylist",
        });
    });

    return records;
}

function buildChart3ConstituencyLookup(partyListRows, smallPartyNames = new Set()) {
    const grouped = new Map();
    const partyNumberSet = new Set(chart3PartyNumbers);

    partyListRows.forEach((row) => {
        const provinceCode = Number(row["รหัสจังหวัด"]);
        const district = Number(row["เขต"]);
        const partyNumber = Number(row["หมายเลข_clean"]);
        const partyName = (row["party_name_clean"] || "").trim();
        const votes = parseNumber(row["คะแนน"]);

        if (!Number.isInteger(provinceCode) || !Number.isInteger(district) || !Number.isInteger(partyNumber) || votes === null) {
            return;
        }

        const key = `${provinceCode}-${district}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                barsByPartyNumber: new Map(),
                sum10Plus: 0,
                count10Plus: 0,
            });
        }

        const entry = grouped.get(key);
        if (partyNumberSet.has(partyNumber)) {
            entry.barsByPartyNumber.set(partyNumber, votes);
        }

        if (partyNumber >= 10 && partyName && smallPartyNames.has(partyName)) {
            entry.sum10Plus += votes;
            entry.count10Plus += 1;
        }
    });

    const lookup = new Map();
    grouped.forEach((entry, key) => {
        lookup.set(key, {
            barData: chart3PartyNumbers.map((partyNumber) => entry.barsByPartyNumber.get(partyNumber) || 0),
            averageVotes10Plus: entry.count10Plus > 0 ? (entry.sum10Plus / entry.count10Plus) : null,
        });
    });

    return lookup;
}

function renderAll() {
    renderMetricSelector();
    renderRegionFilter();
    renderOverviewPanel();
    renderConstituencyList();
    renderTileGrid(state.gridRows, state.winnerLookup, state.provincesByAcronym);
    renderBenfordChart();
}

function initLandingRotator() {
    if (!landingRotator) {
        return;
    }

    const phrases = [
        "ซื้อเสียง?",
        "บัตรผี?",
        "บัตรหาย?",
        "เรื่องจริงหรือไม่?",
        "ลองหาด้วยตัวคุณเอง"
    ];

    const animateLandingRotator = () => {
        landingRotator.classList.remove("is-animating");
        void landingRotator.offsetWidth;
        landingRotator.classList.add("is-animating");
    };

    let phraseIndex = 0;
    landingRotator.textContent = phrases[phraseIndex];
    animateLandingRotator();

    setInterval(() => {
        phraseIndex = (phraseIndex + 1) % phrases.length;
        landingRotator.textContent = phrases[phraseIndex];
        animateLandingRotator();
    }, 2400);
}

function bindEvents() {
    constituencySearch.addEventListener("input", (event) => {
        state.searchQuery = event.target.value || "";
        renderConstituencyList();
    });

    regionFilter.addEventListener("change", (event) => {
        state.selectedRegion = event.target.value;
        state.mapView.pendingRefitRegion = state.selectedRegion;
        renderAll();
    });

    benfordPartyFilter.addEventListener("change", (event) => {
        state.selectedPartyForBenford = event.target.value;
        renderBenfordChart();
    });

    // Benford Info Icon Tooltip - Hover Interaction
    const benfordInfoIcon = document.getElementById("benford-info-icon");
    const benfordInfoTooltip = document.getElementById("benford-info-tooltip");

    if (benfordInfoIcon && benfordInfoTooltip) {
        // Show tooltip on mouseenter
        benfordInfoIcon.addEventListener("mouseenter", () => {
            benfordInfoTooltip.style.display = "block";
            benfordInfoTooltip.setAttribute("aria-hidden", "false");
            positionBenfordTooltip();
        });

        // Hide tooltip on mouseleave (with delay to allow moving to tooltip)
        benfordInfoIcon.addEventListener("mouseleave", () => {
            setTimeout(() => {
                if (!benfordInfoTooltip.matches(":hover")) {
                    benfordInfoTooltip.style.display = "none";
                    benfordInfoTooltip.setAttribute("aria-hidden", "true");
                }
            }, 100);
        });

        // Keep tooltip visible when hovering over it
        benfordInfoTooltip.addEventListener("mouseenter", () => {
            benfordInfoTooltip.style.display = "block";
        });

        // Hide tooltip when leaving it
        benfordInfoTooltip.addEventListener("mouseleave", () => {
            benfordInfoTooltip.style.display = "none";
            benfordInfoTooltip.setAttribute("aria-hidden", "true");
        });

        // Reposition on window resize
        window.addEventListener("resize", () => {
            if (benfordInfoTooltip.style.display === "block") {
                positionBenfordTooltip();
            }
        });
    }

    if (mapResetButton) {
        mapResetButton.addEventListener("click", () => {
            fitMapToViewport();
        });
    }

    popupClose.addEventListener("click", closePopup);
    detailPopup.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.closePopup === "true") {
            closePopup();
        }
    });

}

async function loadData() {
    try {
        const [winnerCsv, tileGridCsv, provinceCsv, regionCsv, benfordData, partyListCsv, constiCsv] = await Promise.all([
            fetchText(party_consti_url),
            fetchText(tile_grid_url),
            fetchText(province_encoding_url),
            fetchText(region_mapping_url),
            fetchJson(benford_url),
            fetchText(partylist1_url),
            fetchText(consti1_url),
        ]);

        const winnerRows = toObjects(winnerCsv);
        const gridRows = parseCsv(tileGridCsv).filter((row) => row.length > 0);
        const provinceRows = toObjects(provinceCsv);
        const regionRows = toObjects(regionCsv);
        const partyListRows = toObjects(partyListCsv);
        const constiRows = toObjects(constiCsv);

        state.winnerLookup = buildWinnerLookup(winnerRows);
        state.provincesByAcronym = buildProvinceLookup(provinceRows);
        state.provinceThaiNameByAcronym = buildProvinceThaiNameLookup(provinceRows);
        state.provinceThaiNameByCode = buildProvinceThaiNameByCodeLookup(provinceRows);
        state.gridRows = gridRows;
        state.benfordData = benfordData;
        state.constituencyVotesByKey = buildConstituencyVoteLookup(constiRows);
        state.partyListVotesByKey = buildPartyListVoteLookup(partyListRows);
        state.winningRepresentativeNumberByKey = buildWinningRepresentativeNumberLookup(state.constituencyVotesByKey);
        state.chart3SmallPartyNames = buildSmallPartyNameSet(partyListRows, state.constituencyVotesByKey);
        state.chart3ByConstituency = buildChart3ConstituencyLookup(partyListRows, state.chart3SmallPartyNames);

        const regionBundle = buildRegionLookup(regionRows);
        state.regionByProvinceCode = regionBundle.lookup;
        state.regionLabels = regionBundle.labelLookup;

        // Build records
        const constituencyRecords = buildConstituencyRecords(gridRows, state.winnerLookup, state.provincesByAcronym);
        state.records = constituencyRecords;
        state.recordByKey = new Map(
            constituencyRecords.map((record) => [`${record.provinceCode}-${record.district}`, record])
        );
        state.overallScoreTurnoutMean = computeMetricMean(constituencyRecords, "turnout");
        state.overallScoreDomains = computeOverallScoreDomains(constituencyRecords, state.overallScoreTurnoutMean);

        renderBenfordFilter();
        renderAll();

    } catch (error) {
        console.error(error);
    }
}

function initApp() {
    detailPopup.hidden = true;
    bindEvents();
    initLandingRotator();
    loadData();
    initializeChart3();
    initializeChart4();
}

document.addEventListener("DOMContentLoaded", initApp);