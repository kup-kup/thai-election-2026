// Chart 3: Electoral Fraud Detection Analysis
// Joins party_consti1.csv with partylist1.csv and renders mixed chart using PapaParse

let chart3Data = {
    partyConsti1: [],
    partyList1: [],
};

const SMALL_PARTIES = [1, 2, 3, 4, 5, 7, 8];
const LARGE_PARTIES = [10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67];

function parseVoteNumber(str) {
    if (!str) return 0;
    const cleaned = String(str).replace(/[^0-9.-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
}

function getChart3Data(provinceName, constituency) {
    // Step 1: Find winner's party name from party_consti1.csv
    const consensData = chart3Data.partyConsti1.find(
        row => row.province_name === provinceName && parseInt(row.constituency) === constituency
    );
    
    if (!consensData) {
        return null;
    }
    
    const winnerPartyName = consensData.constituency_winner_party;
    
    // Step 2: Find winner's party number (หมายเลข_clean) from partylist1.csv
    const winnerPartyData = chart3Data.partyList1.find(
        row => row.province_clean === provinceName && 
               parseInt(row.เขต) === constituency && 
               row.party_name_clean === winnerPartyName
    );
    
    const winnerNumber = winnerPartyData ? parseInt(winnerPartyData.หมายเลข_clean, 10) : null;
    
    // Step 3: Get votes for target small parties [1,2,3,4,5,7,8]
    const smallPartiesData = SMALL_PARTIES.map(partyNum => {
        const row = chart3Data.partyList1.find(
            r => r.province_clean === provinceName && 
                 parseInt(r.เขต) === constituency && 
                 parseInt(r.หมายเลข_clean) === partyNum
        );
        return {
            partyNumber: partyNum,
            votes: row ? parseVoteNumber(row.คะแนน) : 0
        };
    });
    
    // Step 4: Calculate average for large parties (50 specific party numbers)
    const largePartiesSum = LARGE_PARTIES.reduce((sum, partyNum) => {
        const row = chart3Data.partyList1.find(
            r => r.province_clean === provinceName && 
                 parseInt(r.เขต) === constituency && 
                 parseInt(r.หมายเลข_clean) === partyNum
        );
        return sum + (row ? parseVoteNumber(row.คะแนน) : 0);
    }, 0);
    
    const averageVotes = largePartiesSum / LARGE_PARTIES.length;
    
    return {
        provinceName,
        constituency,
        winnerNumber,
        winnerPartyName,
        smallPartiesData,
        averageVotes: Math.round(averageVotes)
    };
}

function renderChart3(provinceName, constituency) {
    if (!chart3Canvas) {
        console.error('Chart 3 canvas not found');
        return;
    }
    
    const data = getChart3Data(provinceName, constituency);
    
    if (!data) {
        chart3Canvas.style.display = 'none';
        console.warn('No data found for', provinceName, constituency);
        return;
    }
    
    chart3Canvas.style.display = 'block';
    
    // Prepare chart data
    const labels = data.smallPartiesData.map(d => String(d.partyNumber));
    const votes = data.smallPartiesData.map(d => d.votes);
    // Create line data array with repeated average value for every bar
    const averageValue = data.averageVotes;
    const lineData = labels.map(() => averageValue);
    
    // Dynamic coloring: highlight winner's bar in yellow if in [1,2,3,4,5,7,8]
    const barColors = data.smallPartiesData.map(d => 
        d.partyNumber === data.winnerNumber ? '#ffd700' : '#2b6ad6'
    );
    
    // Destroy existing chart instance
    if (chart3Instance) {
        chart3Instance.destroy();
    }
    
    // Create mixed Chart.js chart
    const ctx = chart3Canvas.getContext('2d');
    chart3Instance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'คะแนนแบบบัญชีรายชื่อ',
                    data: votes,
                    backgroundColor: barColors,
                    borderColor: '#1d4a99',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.85,
                    order: 2
                },
                {
                    type: 'line',
                    label: 'ค่าเฉลี่ยคะแนนแบบบัญชีรายชื่อพรรคเล็กเบอร์10ขึ้นไป',
                    data: lineData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'start',
                    labels: {
                        font: { size: 12, family: "'ElectionUI', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
                        color: '#172233',
                        padding: 15,
                        usePointStyle: true
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(23, 34, 51, 0.92)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            // For bar dataset, show custom format
                            if (context.dataset.type === 'bar') {
                                return 'คะแนนแบบบัญชีรายชื่อพรรคที่ ' + context.label + ': ' + context.raw.toLocaleString('th-TH');
                            }
                            // For line dataset, show standard format
                            const value = context.parsed.y;
                            return `${context.dataset.label}: ${value.toLocaleString('th-TH')}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'หมายเลขพรรค',
                        font: { size: 12, weight: 'bold' },
                        color: '#172233',
                    },
                    ticks: {
                        font: { size: 11 },
                        color: '#4c5c74',
                    },
                    grid: {
                        color: 'rgba(220, 228, 239, 0.3)',
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'คะแนนโหวตแบบบัญชีรายชื่อ',
                        font: { size: 12, weight: 'bold' },
                        color: '#172233',
                    },
                    ticks: {
                        font: { size: 11 },
                        color: '#4c5c74',
                        callback: function(value) {
                            return value.toLocaleString('th-TH');
                        }
                    },
                    grid: {
                        color: 'rgba(220, 228, 239, 0.3)',
                    }
                }
            }
        }
    });
}

async function initializeChart3() {
    try {
        const districtSelect = document.getElementById('district-select');
        if (!districtSelect) {
            console.error('District select element not found');
            return;
        }
        
        // Load both CSV files
        const [partyConstiText, partyListText] = await Promise.all([
            fetch('src/party_consti1.csv').then(r => r.text()),
            fetch('src/partylist1.csv').then(r => r.text())
        ]);
        
        // Parse CSVs using PapaParse
        chart3Data.partyConsti1 = Papa.parse(partyConstiText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false
        }).data;
        
        chart3Data.partyList1 = Papa.parse(partyListText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false
        }).data;
        
        // Extract unique province + district combinations with proper sorting
        const districtMap = new Map(); // key: "province|constituency"
        chart3Data.partyConsti1.forEach(row => {
            if (row.province_name && row.constituency) {
                const constituency = parseInt(row.constituency, 10);
                const key = `${row.province_name}|${constituency}`;
                if (!districtMap.has(key)) {
                    districtMap.set(key, {
                        province: row.province_name,
                        constituency: constituency,
                        label: `${row.province_name} เขต ${constituency}`
                    });
                }
            }
        });
        
        // Sort by province name (alphabetically), then by constituency number (numerically)
        const districts = Array.from(districtMap.values())
            .sort((a, b) => {
                // First, compare province names alphabetically (Thai locale)
                if (a.province !== b.province) {
                    return a.province.localeCompare(b.province, 'th');
                }
                // If same province, compare constituency numbers as integers
                return a.constituency - b.constituency;
            })
            .map(d => d.label);
        
        // Populate dropdown
        districtSelect.innerHTML = '';
        districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            districtSelect.appendChild(option);
        });
        
        // Set default selection and render initial chart
        if (districts.length > 0) {
            districtSelect.value = districts[0];
            const [provinceName, districtPart] = districts[0].split(' เขต ');
            const constituency = parseInt(districtPart, 10);
            renderChart3(provinceName, constituency);
        }
        
        // Add dropdown change listener
        districtSelect.addEventListener('change', (event) => {
            const [provinceName, districtPart] = event.target.value.split(' เขต ');
            const constituency = parseInt(districtPart, 10);
            renderChart3(provinceName, constituency);
        });
        
        console.log('Chart 3 initialized successfully with', districts.length, 'districts');
        
    } catch (error) {
        console.error('Error initializing Chart 3:', error);
        const districtSelect = document.getElementById('district-select');
        if (districtSelect) {
            districtSelect.innerHTML = '<option>Error loading data</option>';
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeChart3);
    } else {
        initializeChart3();
    }
});
