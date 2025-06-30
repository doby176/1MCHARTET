async function loadTickers() {
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        const tickerSelect = document.getElementById('ticker-select');
        if (!tickerSelect) throw new Error('Ticker select element not found');
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading tickers:', error);
        alert('Failed to load tickers. Please try again later.');
    }
}

async function loadValidDates(ticker) {
    const dateInput = document.getElementById('date');
    dateInput.disabled = !ticker;
    dateInput.value = ''; // Clear date input when ticker changes
    dateInput.removeAttribute('min');
    dateInput.removeAttribute('max');
    dateInput.dataset.validDates = '[]'; // Clear valid dates
    if (!ticker) return;

    try {
        const response = await fetch(`/api/valid_dates?ticker=${ticker}`);
        if (!response.ok) {
            if (response.status === 404) {
                alert(`No data available for ${ticker}. Please select another ticker.`);
                return;
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
            alert(`No data available for ${ticker}. Please select another ticker.`);
            return;
        }
        dateInput.setAttribute('min', data.dates[0]);
        dateInput.setAttribute('max', data.dates[data.dates.length - 1]);
        dateInput.dataset.validDates = JSON.stringify(data.dates);
    } catch (error) {
        console.error('Error loading valid dates:', error);
        alert(`Failed to load dates for ${ticker}. Please try another ticker or check back later.`);
    }
}

document.getElementById('stock-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    const ticker = document.getElementById('ticker-select').value;
    const date = document.getElementById('date').value;
    const chartContainer = document.getElementById('chart-container');

    if (!ticker || !date) {
        chartContainer.innerHTML = '<p>Please select a ticker and date.</p>';
        return;
    }

    // Validate date
    const validDates = JSON.parse(document.getElementById('date').dataset.validDates || '[]');
    if (!validDates.includes(date)) {
        chartContainer.innerHTML = '<p>Invalid date. Please choose a valid trading day.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            chartContainer.innerHTML = `<p>Error: ${data.error}</p>`;
            return;
        }
        chartContainer.innerHTML = `<img src="${data.chart}" alt="Stock Chart">`;
    } catch (error) {
        console.error('Error loading chart:', error);
        chartContainer.innerHTML = '<p>Failed to load chart. Please try again.</p>';
    }
});

document.getElementById('ticker-select').addEventListener('change', function() {
    loadValidDates(this.value);
});

window.onload = loadTickers;