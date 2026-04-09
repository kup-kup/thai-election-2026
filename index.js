const party_consti_url = "src/party_consti1.csv";
const tile_grid_url = "src/tile_grid.csv";
const province_encoding_url = "src/province_encoding.csv";
const region_mapping_url = "src/region_mapping.csv";
const benford_url = "src/benford.json";

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
const dashboardSection = document.getElementById("dashboardSection");
const storyScrollContainer = document.querySelector(".story-scroll");
const landingRotator = document.getElementById("landingRotator");
const detailPopup = document.getElementById("detailPopup");
const popupClose = document.getElementById("popupClose");
const popupSubtitle = document.getElementById("popupSubtitle");

const excludedWinnerPartyLabels = new Set(["Unknown", "ไม่มีข้อมูล"]);

const metricOptions = [
    { key: "winner", label: "สส. เขต" },
    { key: "ballot_difference", label: "ผลต่างของจำนวนบัตรเลือกตั้ง" },
    { key: "turnout", label: "สัดส่วนผู้ออกมาใช้สิทธิ์" },
    { key: "discrepancy", label: "บัตรผี / บัตรหาย" },
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
    regionByProvinceCode: new Map(),
    regionLabels: new Map(),
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
};

let hoveredMapTile = null;

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

    if (tileHoverTooltip) {
        tileHoverTooltip.classList.remove("visible");
        tileHoverTooltip.setAttribute("aria-hidden", "true");
    }
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
            updateHoveredTileTooltipPosition();
        }
        return;
    }

    if (hoveredMapTile) {
        hoveredMapTile.classList.remove("is-hovered");
    }

    hoveredMapTile = tile;
    hoveredMapTile.classList.add("is-hovered");
    updateHoveredTileTooltipPosition();
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

function getMetricValue(record, metricKey) {
    if (!record || !record.metrics) {
        return null;
    }
    return record.metrics[metricKey] ?? null;
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

    if (state.selectedMetric === "turnout") {
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
    if (metricKey === "turnout") {
        return `${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
    }
    return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
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

    const containerRect = container.getBoundingClientRect();
    const localX = event.clientX - containerRect.left;
    const localY = event.clientY - containerRect.top;

    const tooltipWidth = tooltip.offsetWidth || 0;
    const minLeft = 6;
    const maxLeft = Math.max(minLeft, containerRect.width - tooltipWidth - 6);
    const left = Math.max(minLeft, Math.min(maxLeft, localX + 12));

    const minTop = (tooltip.offsetHeight || 24) + 4;
    const top = Math.max(minTop, localY - 10);

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

function renderBallotDifferenceScatter(container) {
    const points = getVisibleRecords()
        .map((record) => {
            const xValue = getMetricValue(record, "party_list_voter_came");
            const yValue = getMetricValue(record, "consti_voters_came");
            return {
                record,
                xValue,
                yValue,
            };
        })
        .filter((entry) => Number.isFinite(entry.xValue) && Number.isFinite(entry.yValue));

    if (points.length === 0) {
        const empty = document.createElement("p");
        empty.className = "overview-empty";
        empty.textContent = "ไม่มีข้อมูลการมาใช้สิทธิ์ที่เปรียบเทียบได้ในภูมิภาคนี้";
        container.appendChild(empty);
        return;
    }

    const plotWrap = document.createElement("div");
    plotWrap.className = "overview-scatter-square";
    container.appendChild(plotWrap);

    const tooltip = ensureOverviewTooltip(plotWrap);
    const wrapWidth = Math.floor(plotWrap.clientWidth || container.clientWidth || 320);
    const wrapHeight = Math.floor(plotWrap.clientHeight || wrapWidth);
    const squareSize = Math.max(220, Math.min(wrapWidth, wrapHeight));
    const margin = { top: 0, right: 12, bottom: 46, left: 180 };
    const innerSize = Math.max(140, squareSize - margin.left - margin.right);

    const minCombined = d3.min(points, (entry) => Math.min(entry.xValue, entry.yValue)) || 0;
    const maxCombined = d3.max(points, (entry) => Math.max(entry.xValue, entry.yValue)) || 1;
    const pad = minCombined === maxCombined ? Math.max(1, Math.abs(maxCombined) * 0.08 || 1) : 0;
    const domainMin = minCombined - pad;
    const domainMax = maxCombined + pad;

    const xScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([0, innerSize]);
    const yScale = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerSize, 0]);

    const svg = d3
        .select(plotWrap)
        .append("svg")
        .attr("class", "overview-scatter-svg")
        .attr("viewBox", `0 0 ${squareSize} ${squareSize}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    chart
        .append("line")
        .attr("class", "overview-diagonal-line")
        .attr("x1", xScale(domainMin))
        .attr("y1", yScale(domainMin))
        .attr("x2", xScale(domainMax))
        .attr("y2", yScale(domainMax));

    const numberFormat = (value) => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 0 });
    const axisNumberFormat = (value) => {
        const absolute = Math.abs(value);
        if (absolute >= 1_000_000) {
            const shortened = (value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1);
            return `${shortened.replace(/\.0$/, "")}M`;
        }
        if (absolute >= 1_000) {
            const shortened = (value / 1_000).toFixed(absolute >= 10_000 ? 0 : 1);
            return `${shortened.replace(/\.0$/, "")}k`;
        }
        return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 0 });
    };

    chart
        .append("g")
        .attr("class", "overview-axis")
        .attr("transform", `translate(0, ${innerSize})`)
        .call(d3.axisBottom(xScale).ticks(5).tickSizeOuter(0).tickFormat(axisNumberFormat));

    chart
        .append("g")
        .attr("class", "overview-axis")
        .call(d3.axisLeft(yScale).ticks(5).tickSizeOuter(0).tickFormat(axisNumberFormat));

    chart
        .append("text")
        .attr("class", "overview-scatter-axis-caption")
        .attr("x", innerSize / 2)
        .attr("y", innerSize + 34)
        .attr("text-anchor", "middle")
        .text("ผู้มาใช้สิทธิ์บัญชีรายชื่อ");

    chart
        .append("text")
        .attr("class", "overview-scatter-axis-caption")
        .attr("transform", "rotate(-90)")
        .attr("x", -(innerSize / 2))
        .attr("y", -34)
        .attr("text-anchor", "middle")
        .text("ผู้มาใช้สิทธิ์แบ่งเขต");

    const pointSelection = chart
        .append("g")
        .selectAll("circle.overview-scatter-point")
        .data(points)
        .join("circle")
        .attr("class", "overview-scatter-point")
        .attr("cx", (entry) => xScale(entry.xValue))
        .attr("cy", (entry) => yScale(entry.yValue))
        .attr("r", 4.1)
        .on("mouseenter", function handleMouseEnter(event, entry) {
            pointSelection.classed("is-hovered", (candidate) => candidate === entry);
            showOverviewTooltip(
                tooltip,
                plotWrap,
                event,
                `${entry.record.provinceName} เขต ${entry.record.district} • บัญชีรายชื่อ ${numberFormat(entry.xValue)} • แบ่งเขต ${numberFormat(entry.yValue)}`
            );
        })
        .on("mousemove", function handleMouseMove(event, entry) {
            showOverviewTooltip(
                tooltip,
                plotWrap,
                event,
                `${entry.record.provinceName} เขต ${entry.record.district} • บัญชีรายชื่อ ${numberFormat(entry.xValue)} • แบ่งเขต ${numberFormat(entry.yValue)}`
            );
        })
        .on("mouseleave", () => {
            pointSelection.classed("is-hovered", false);
            hideOverviewTooltip(tooltip);
        })
        .on("click", (_, entry) => {
            openPopup(entry.record);
        });
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
        .attr("cx", (node) => Math.max(5, Math.min(innerWidth - 5, node.x)))
        .attr("cy", (node) => Math.max(4, Math.min(innerHeight - 4, node.y)))
        .attr("r", 4.2)
        .on("mouseenter", function handleMouseEnter(event, node) {
            pointSelection.classed("is-hovered", (candidate) => candidate.id === node.id);
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
}

function isDashboardSectionInView() {
    if (!dashboardSection) {
        return false;
    }
    const rect = dashboardSection.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const focusY = viewportHeight / 2;
    return rect.top <= focusY && rect.bottom >= focusY;
}

function renderOverviewPanel() {
    if (!overviewPanel) {
        return;
    }

    const shouldFloatBallot = state.selectedMetric === "ballot_difference" && isDashboardSectionInView();
    overviewPanel.classList.toggle("is-floating-ballot", shouldFloatBallot);

    overviewPanel.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "overview-title";
    title.textContent = state.selectedMetric === "winner"
        ? "สรุปจำนวนเขตที่ชนะ"
        : `${getMetricLabel(state.selectedMetric)}`;
    overviewPanel.appendChild(title);

    if (state.selectedMetric === "winner") {
        renderWinnerOverview(overviewPanel);
        return;
    }

    if (state.selectedMetric === "ballot_difference") {
        renderBallotDifferenceScatter(overviewPanel);
        return;
    }

    renderMetricBeeswarm(overviewPanel, state.selectedMetric);
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
                tileGroup.setAttribute("title", `${value.toUpperCase()} (invalid tile code)`);
                mapContent.appendChild(tileGroup);
                continue;
            }

            const acronym = matches[1];
            const district = Number(matches[2]);
            tileText.textContent = String(district);
            const provinceCode = provinceLookup.get(acronym);

            if (!provinceCode) {
                tileGroup.classList.add("no-data");
                tileGroup.setAttribute("title", `${value.toUpperCase()} (province code not found)`);
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
                tileGroup.setAttribute("title", `${value.toUpperCase()} (outside selected region)`);
                mapContent.appendChild(tileGroup);
                continue;
            }

            if (!winner) {
                tileGroup.classList.add("missing");
                tileGroup.setAttribute("title", `${value.toUpperCase()} เขต ${district} (no winner data)`);
                mapContent.appendChild(tileGroup);
                continue;
            }

            const normalized = normalizeWinnerRecord(winner);
            const party = normalized.party;
            const candidate = normalized.candidate;
            const provinceName = normalized.provinceName;
            const record = state.recordByKey.get(`${provinceCode}-${district}`);
            const metricValue = getMetricValue(record, state.selectedMetric);

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

            tileGroup.setAttribute("title", `${provinceName} เขต ${district}\nผู้ชนะ: ${candidate}\nพรรค: ${party}\nคะแนน: ${winner["consti_good_votes"] || winner["คะแนน"] || "-"}`);
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

function renderAll() {
    renderMetricSelector();
    renderRegionFilter();
    renderOverviewPanel();
    renderConstituencyList();
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
        state.mapView.pendingRefitRegion = state.selectedRegion;
        renderAll();
    });

    benfordPartyFilter.addEventListener("change", (event) => {
        state.selectedPartyForBenford = event.target.value;
        renderBenfordChart();
    });

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

    if (storyScrollContainer) {
        storyScrollContainer.addEventListener("scroll", () => {
            if (state.selectedMetric === "ballot_difference" || overviewPanel?.classList.contains("is-floating-ballot")) {
                renderOverviewPanel();
            }
        }, { passive: true });
    }
}

async function loadData() {
    try {
        const [winnerCsv, tileGridCsv, provinceCsv, regionCsv, benfordData] = await Promise.all([
            fetchText(party_consti_url),
            fetchText(tile_grid_url),
            fetchText(province_encoding_url),
            fetchText(region_mapping_url),
            fetchJson(benford_url),
        ]);

        const winnerRows = toObjects(winnerCsv);
        const gridRows = parseCsv(tileGridCsv).filter((row) => row.length > 0);
        const provinceRows = toObjects(provinceCsv);
        const regionRows = toObjects(regionCsv);

        state.winnerLookup = buildWinnerLookup(winnerRows);
        state.provincesByAcronym = buildProvinceLookup(provinceRows);
        state.provinceThaiNameByAcronym = buildProvinceThaiNameLookup(provinceRows);
        state.gridRows = gridRows;
        state.benfordData = benfordData;

        const regionBundle = buildRegionLookup(regionRows);
        state.regionByProvinceCode = regionBundle.lookup;
        state.regionLabels = regionBundle.labelLookup;

        // Build records
        const constituencyRecords = buildConstituencyRecords(gridRows, state.winnerLookup, state.provincesByAcronym);
        state.records = constituencyRecords;
        state.recordByKey = new Map(
            constituencyRecords.map((record) => [`${record.provinceCode}-${record.district}`, record])
        );

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
}

document.addEventListener("DOMContentLoaded", initApp);