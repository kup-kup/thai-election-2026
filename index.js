const summary_winners_url = "https://raw.githubusercontent.com/killernay/election-69-OCR-result/refs/heads/main/data/csv/summary_winners.csv";
const tile_grid_url = "src/tile_grid.csv";
const province_encoding_url = "src/province_encoding.csv";
const region_mapping_url = "src/region_mapping.csv";

const statusCard = document.getElementById("statusCard");
const tileGridMap = document.getElementById("tileGridMap");
const partyLegend = document.getElementById("partyLegend");
const metricSelector = document.getElementById("metricSelector");
const regionFilter = document.getElementById("regionFilter");
const constituencySearch = document.getElementById("constituencySearch");
const constituencyList = document.getElementById("constituencyList");
const topNPanel = document.getElementById("topNPanel");
const topNInput = document.getElementById("topNInput");
const topNList = document.getElementById("topNList");
const topNValueLabel = document.getElementById("topNValueLabel");
const benfordChart = document.getElementById("benfordChart");
const benfordPartyFilter = document.getElementById("benfordPartyFilter");
const landingRotator = document.getElementById("landingRotator");
const detailPopup = document.getElementById("detailPopup");
const popupClose = document.getElementById("popupClose");
const popupSubtitle = document.getElementById("popupSubtitle");

const metricOptions = [
    { key: "winner", label: "Constituency winner" },
    { key: "ballot_difference", label: "Difference between 2 ballot counts" },
    { key: "turnout", label: "Voter turnout percentage" },
    { key: "discrepancy", label: "Turnout vs valid+invalid discrepancy" },
    { key: "lower_number_tendency", label: "Lower-number partylist tendency" },
];

const state = {
    selectedMetric: "winner",
    selectedRegion: "all",
    selectedPartyForBenford: "overall",
    searchQuery: "",
    topN: 5,
    records: [],
    gridRows: [],
    provincesByAcronym: new Map(),
    regionByProvinceCode: new Map(),
    regionLabels: new Map(),
};

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
        const provinceCode = Number(row["รหัสจังหวัด"]);
        const district = Number(row["เขต"]);
        if (Number.isInteger(provinceCode) && Number.isInteger(district)) {
            lookup.set(`${provinceCode}-${district}`, row);
        }
    });
    return lookup;
}

function getMetricValue(record, metricKey) {
    if (!record || !record.metrics) {
        return null;
    }
    return record.metrics[metricKey] ?? null;
}

function normalizeWinnerRecord(row) {
    return {
        party: row["พรรค"] || "Unknown",
        candidate: row["ผู้ชนะ"] || "Unknown",
        provinceName: row["จังหวัด"] || "-",
        votes: parseNumber(row["คะแนน"]),
        metrics: {
            ballot_difference: firstAvailableNumber(row, ["ผลต่างบัตรสองใบ", "ballot_difference", "ballotCountDifference"]),
            turnout: firstAvailableNumber(row, ["ร้อยละผู้มาใช้สิทธิ", "turnout_pct", "turnoutPercentage"]),
            discrepancy: firstAvailableNumber(row, ["ผลต่างผู้มาใช้สิทธิและบัตร", "turnout_vote_discrepancy", "turnoutDiscrepancy"]),
            lower_number_tendency: firstAvailableNumber(row, ["แนวโน้มเลือกผู้สมัครเบอร์ต่ำ", "lower_number_tendency", "lowerNumberBias"]),
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

function openPopup(record) {
    if (!record) {
        return;
    }
    popupSubtitle.textContent = `${record.provinceName} เขต ${record.district}`;
    detailPopup.hidden = false;
}

function closePopup() {
    detailPopup.hidden = true;
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

    filtered.forEach((record) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "constituency-item";
        if (record.isMissingData) {
            card.classList.add("missing");
        }
        card.innerHTML = `<strong>${record.provinceName} เขต ${record.district}</strong><div class="meta">${record.party || "ไม่มีข้อมูล"}</div>`;
        card.addEventListener("click", () => openPopup(record));
        constituencyList.appendChild(card);
    });
}

function renderTopN() {
    const hidePanel = state.selectedMetric === "winner";
    topNPanel.hidden = hidePanel;
    if (hidePanel) {
        return;
    }

    const topNValue = Math.min(Math.max(Number(topNInput.value) || 5, 1), 20);
    state.topN = topNValue;
    topNValueLabel.textContent = String(topNValue);

    const ranked = getVisibleRecords()
        .map((record) => ({
            record,
            value: getMetricValue(record, state.selectedMetric),
        }))
        .filter((entry) => Number.isFinite(entry.value))
        .sort((a, b) => b.value - a.value)
        .slice(0, topNValue);

    topNList.innerHTML = "";
    if (ranked.length === 0) {
        const li = document.createElement("li");
        li.textContent = "ยังไม่มีข้อมูลสำหรับ metric นี้";
        topNList.appendChild(li);
        return;
    }

    ranked.forEach((entry) => {
        const li = document.createElement("li");
        li.textContent = `${entry.record.provinceName} เขต ${entry.record.district}: ${entry.value}`;
        topNList.appendChild(li);
    });
}

function renderMetricSelector() {
    metricSelector.innerHTML = "";
    metricOptions.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "metric-option";
        if (option.key === state.selectedMetric) {
            button.classList.add("active");
        }
        button.textContent = option.label;
        button.addEventListener("click", () => {
            state.selectedMetric = option.key;
            renderAll();
        });
        metricSelector.appendChild(button);
    });
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
    const parties = [...new Set(state.records.map((record) => record.party).filter((party) => party && party !== "Unknown"))].sort();
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
    benfordPartyFilter.value = state.selectedPartyForBenford;
}

function computeBenfordData() {
    const digits = d3.range(1, 10);
    const selected = state.records.filter((record) => {
        if (!isRecordInRegion(record)) {
            return false;
        }
        if (state.selectedPartyForBenford === "overall") {
            return true;
        }
        return record.party === state.selectedPartyForBenford;
    });

    const leadingDigits = selected
        .map((record) => {
            const votes = record.votes;
            if (!Number.isFinite(votes) || votes <= 0) {
                return null;
            }
            return Number(String(Math.floor(votes))[0]);
        })
        .filter((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9);

    const total = leadingDigits.length;
    const counter = new Map();
    leadingDigits.forEach((digit) => {
        counter.set(digit, (counter.get(digit) || 0) + 1);
    });

    return digits.map((digit) => {
        const expectedRatio = Math.log10(1 + 1 / digit);
        const expected = total * expectedRatio;
        const actual = counter.get(digit) || 0;
        return { digit, expected, actual };
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
        .attr("fill", "#d5dce8");

    chart
        .append("g")
        .selectAll("rect.actual")
        .data(data)
        .join("rect")
        .attr("x", (entry) => (xScale(String(entry.digit)) || 0) + xScale.bandwidth() * 0.18)
        .attr("y", (entry) => yScale(entry.actual))
        .attr("width", xScale.bandwidth() * 0.64)
        .attr("height", (entry) => innerHeight - yScale(entry.actual))
        .attr("fill", "#3367d6");

    chart
        .append("g")
        .attr("transform", `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSizeOuter(0));

    chart.append("g").call(d3.axisLeft(yScale).ticks(5));
}

function renderTileGrid(gridRows, winnerLookup, provinceLookup) {
    const columns = gridRows.reduce((max, row) => Math.max(max, row.length), 0);
    tileGridMap.style.gridTemplateColumns = `repeat(${columns}, var(--tile-size))`;
    tileGridMap.innerHTML = "";

    const partyCountMap = new Map();
    const partyColorMap = new Map();
    let totalMapped = 0;
    const metricScale = getMetricScale(state.selectedMetric);

    document.documentElement.style.setProperty("--tile-size", state.selectedRegion === "all" ? "25px" : "30px");

    gridRows.forEach((row) => {
        for (let column = 0; column < columns; column += 1) {
            const value = (row[column] || "").trim().toLowerCase();
            const tile = document.createElement("div");

            if (!value) {
                tile.className = "tile empty";
                tileGridMap.appendChild(tile);
                continue;
            }

            const matches = value.match(/^([a-z]+)(\d+)$/);
            tile.className = "tile";
            tile.textContent = value;

            if (!matches) {
                tile.classList.add("no-data");
                tile.title = `${value.toUpperCase()} (invalid tile code)`;
                tileGridMap.appendChild(tile);
                continue;
            }

            const acronym = matches[1];
            const district = Number(matches[2]);
            const provinceCode = provinceLookup.get(acronym);

            if (!provinceCode) {
                tile.classList.add("no-data");
                tile.title = `${value.toUpperCase()} (province code not found)`;
                tileGridMap.appendChild(tile);
                continue;
            }

            const winner = winnerLookup.get(`${provinceCode}-${district}`);
            const regionKey = state.regionByProvinceCode.get(provinceCode) || "unknown";
            const inRegion = state.selectedRegion === "all" || regionKey === state.selectedRegion;

            if (!inRegion) {
                tile.classList.add("missing");
                tile.title = `${value.toUpperCase()} (outside selected region)`;
                tileGridMap.appendChild(tile);
                continue;
            }

            if (!winner) {
                tile.classList.add("missing");
                tile.title = `${winner?.จังหวัด || value.toUpperCase()} เขต ${district} (no winner data)`;
                tileGridMap.appendChild(tile);
                continue;
            }

            const normalized = normalizeWinnerRecord(winner);
            const party = normalized.party;
            const candidate = normalized.candidate;
            const provinceName = normalized.provinceName;
            const record = state.records.find((entry) => entry.provinceCode === provinceCode && entry.district === district);
            const metricValue = getMetricValue(record, state.selectedMetric);

            if (state.selectedMetric === "winner") {
                if (!partyColorMap.has(party)) {
                    partyColorMap.set(party, makePartyColor(party));
                }
                tile.style.backgroundColor = partyColorMap.get(party);
                partyCountMap.set(party, (partyCountMap.get(party) || 0) + 1);
            } else if (Number.isFinite(metricValue)) {
                tile.style.backgroundColor = getMetricColor(metricValue, metricScale);
            } else {
                tile.classList.add("missing");
                tile.style.backgroundColor = "#d7dee7";
            }

            tile.title = `${provinceName} เขต ${district}\nผู้ชนะ: ${candidate}\nพรรค: ${party}\nคะแนน: ${winner["คะแนน"] || "-"}`;
            tile.addEventListener("click", () => openPopup(record));
            totalMapped += 1;

            tileGridMap.appendChild(tile);
        }
    });

    if (state.selectedMetric === "winner") {
        renderLegend(partyCountMap, partyColorMap);
    } else {
        renderMetricLegend();
    }
    statusCard.textContent = `Loaded ${totalMapped} constituency tiles from tile grid.`;
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
                tileCode: value,
                provinceCode,
                district,
                provinceName: normalized?.provinceName || value.toUpperCase(),
                party: normalized?.party || "ไม่มีข้อมูล",
                candidate: normalized?.candidate || "ไม่มีข้อมูล",
                votes: normalized?.votes ?? null,
                metrics: normalized?.metrics || {
                    ballot_difference: null,
                    turnout: null,
                    discrepancy: null,
                    lower_number_tendency: null,
                },
                regionKey,
                regionLabel,
                isMissingData: !winner,
            });
        });
    });
    return records;
}

function renderAll() {
    renderMetricSelector();
    renderRegionFilter();
    renderConstituencyList();
    renderTopN();
    renderTileGrid(state.gridRows, state.winnerLookup, state.provincesByAcronym);
    renderBenfordChart();
}

function initLandingRotator() {
    const phrases = ["ข่าวลือมากมาย", "เรื่องจริงหรือไม่", "ลองหาด้วยตัวคุณเอง"];
    let phraseIndex = 0;
    setInterval(() => {
        phraseIndex = (phraseIndex + 1) % phrases.length;
        landingRotator.textContent = phrases[phraseIndex];
    }, 2400);
}

function bindEvents() {
    constituencySearch.addEventListener("input", (event) => {
        state.searchQuery = event.target.value || "";
        renderConstituencyList();
    });

    regionFilter.addEventListener("change", (event) => {
        state.selectedRegion = event.target.value;
        renderAll();
    });

    topNInput.addEventListener("change", () => {
        renderTopN();
    });

    benfordPartyFilter.addEventListener("change", (event) => {
        state.selectedPartyForBenford = event.target.value;
        renderBenfordChart();
    });

    popupClose.addEventListener("click", closePopup);
    detailPopup.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.closePopup === "true") {
            closePopup();
        }
    });
}

async function loadData() {
    try {
        statusCard.textContent = "Loading election map data...";

        const [winnerCsv, tileGridCsv, provinceCsv, regionCsv] = await Promise.all([
            fetchText(summary_winners_url),
            fetchText(tile_grid_url),
            fetchText(province_encoding_url),
            fetchText(region_mapping_url),
        ]);

        const winnerRows = toObjects(winnerCsv);
        const gridRows = parseCsv(tileGridCsv).filter((row) => row.length > 0);
        const provinceRows = toObjects(provinceCsv);
        const regionRows = toObjects(regionCsv);

        state.winnerLookup = buildWinnerLookup(winnerRows);
        state.provincesByAcronym = buildProvinceLookup(provinceRows);
        state.gridRows = gridRows;

        const regionBundle = buildRegionLookup(regionRows);
        state.regionByProvinceCode = regionBundle.lookup;
        state.regionLabels = regionBundle.labelLookup;
        state.records = buildConstituencyRecords(gridRows, state.winnerLookup, state.provincesByAcronym);

        renderBenfordFilter();
        renderAll();

    } catch (error) {
        console.error(error);
        statusCard.textContent = "Failed to load map data. Please run this app via a local web server.";
        statusCard.classList.add("error");
    }
}

function initApp() {
    detailPopup.hidden = true;
    bindEvents();
    initLandingRotator();
    loadData();
}

document.addEventListener("DOMContentLoaded", initApp);