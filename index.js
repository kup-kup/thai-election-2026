const summary_winners_url = "https://raw.githubusercontent.com/killernay/election-69-OCR-result/refs/heads/main/data/csv/summary_winners.csv";

// Fetch data from the CSV URL
async function fetchSummaryWinners() {
    try {
        const response = await fetch(summary_winners_url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvData = await response.text();
        return csvData;
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

// Parse CSV data
function parseCSV(csvData) {
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, index) => {
            obj[header.trim()] = values[index]?.trim();
        });
        return obj;
    });
    return data;
}

// Load and process data
async function loadData() {
    const csvData = await fetchSummaryWinners();
    if (csvData) {
        const winners = parseCSV(csvData);
        console.log('Winners data:', winners);
        return winners;
    }
    return null;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', loadData);