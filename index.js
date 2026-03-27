const summary_winners_url = "https://raw.githubusercontent.com/killernay/election-69-OCR-result/refs/heads/main/data/csv/summary_winners.csv";
const tile_grid_url = "src/tile_grid.csv";
const province_encoding_url = "src/province_encoding.csv";

const statusCard = document.getElementById("statusCard");
const tileGridMap = document.getElementById("tileGridMap");
const partyLegend = document.getElementById("partyLegend");

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

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.text();
}

function makePartyColor(partyName) {
    colorMap = {
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
    }
    defaultColor = "#888888ff"
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

function renderTileGrid(gridRows, winnerLookup, provinceLookup) {
    const columns = gridRows.reduce((max, row) => Math.max(max, row.length), 0);
    tileGridMap.style.gridTemplateColumns = `repeat(${columns}, var(--tile-size))`;
    tileGridMap.innerHTML = "";

    const partyCountMap = new Map();
    const partyColorMap = new Map();
    let totalMapped = 0;

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

            if (!winner) {
                tile.classList.add("no-data");
                tile.title = `${winner?.จังหวัด || value.toUpperCase()} เขต ${district} (no winner data)`;
                tileGridMap.appendChild(tile);
                continue;
            }

            const party = winner["พรรค"] || "Unknown";
            const candidate = winner["ผู้ชนะ"] || "Unknown";
            const provinceName = winner["จังหวัด"] || value.toUpperCase();

            if (!partyColorMap.has(party)) {
                partyColorMap.set(party, makePartyColor(party));
            }

            tile.style.backgroundColor = partyColorMap.get(party);
            tile.title = `${provinceName} เขต ${district}\nผู้ชนะ: ${candidate}\nพรรค: ${party}\nคะแนน: ${winner["คะแนน"] || "-"}`;
            partyCountMap.set(party, (partyCountMap.get(party) || 0) + 1);
            totalMapped += 1;

            tileGridMap.appendChild(tile);
        }
    });

    renderLegend(partyCountMap, partyColorMap);
    statusCard.textContent = `Loaded ${totalMapped} constituency tiles from tile grid.`;
}

async function loadData() {
    try {
        statusCard.textContent = "Loading election map data...";

        const [winnerCsv, tileGridCsv, provinceCsv] = await Promise.all([
            fetchText(summary_winners_url),
            fetchText(tile_grid_url),
            fetchText(province_encoding_url),
        ]);

        const winnerRows = toObjects(winnerCsv);
        const gridRows = parseCsv(tileGridCsv);
        const provinceRows = toObjects(provinceCsv);

        const winnerLookup = buildWinnerLookup(winnerRows);
        const provinceLookup = buildProvinceLookup(provinceRows);

        renderTileGrid(gridRows, winnerLookup, provinceLookup);
    } catch (error) {
        console.error(error);
        statusCard.textContent = "Failed to load map data. Please run this app via a local web server.";
        statusCard.classList.add("error");
    }
}

document.addEventListener("DOMContentLoaded", loadData);