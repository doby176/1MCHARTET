document.addEventListener('DOMContentLoaded', () => {
    loadTickers();
    document.getElementById('stock-form').addEventListener('submit', loadChart);
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
});

async function loadTickers() {
    const tickerSelect = document.getElementById('ticker-select');
    tickerSelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Fetched tickers:', data.tickers);
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option);
        });
        tickerSelect.disabled = false;
        tickerSelect.addEventListener('change', loadDates);
    } catch (error) {
        console.error('Error loading tickers:', error);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        alert('Failed to load tickers. Please refresh the page or try again later.');
    }
}

async function loadDates() {
    const tickerSelect = document.getElementById('ticker-select');
    const dateInput = document.getElementById('date');
    dateInput.disabled = true;
    dateInput.value = '';
    const ticker = tickerSelect.value;
    if (!ticker) {
        dateInput.disabled = true;
        return;
    }
    console.log(`Fetching dates for ticker: ${ticker}`);
    try {
        const response = await fetch(`/api/valid_dates?ticker=${encodeURIComponent(ticker)}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error fetching dates:', data.error);
            alert(data.error);
            dateInput.disabled = true;
            return;
        }
        console.log(`Fetched ${data.dates.length} dates for ${ticker}`);
        dateInput.disabled = false;
    } catch (error) {
        console.error('Error loading dates:', error);
        alert('Failed to load dates: ' + error.message);
        dateInput.disabled = true;
    }
}

async function loadChart(event) {
    event.preventDefault();
    const ticker = document.getElementById('ticker-select').value;
    const date = document.getElementById('date').value;
    const chartContainer = document.getElementById('chart-container');
    if (!ticker || !date) {
        alert('Please select a ticker and date.');
        return;
    }
    chartContainer.innerHTML = '<p>Loading chart...</p>';
    try {
        const response = await fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            chartContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        chartContainer.innerHTML = `<img src="${data.chart}" alt="Stock Chart for ${ticker} on ${date}">`;
    } catch (error) {
        console.error('Error loading chart:', error);
        chartContainer.innerHTML = '<p>Failed to load chart. Please try again.</p>';
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDatesContainer = document.getElementById('gap-dates');
    if (!gapSize || !day) {
        alert('Please select a gap size and day of the week.');
        return;
    }
    console.log(`Fetching gaps for gap_size=${gapSize}, day=${day}`);
    gapDatesContainer.innerHTML = '<p>Loading gap dates...</p>';
    try {
        const response = await fetch(`/api/gaps?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            console.error('Error from API:', data.error);
            gapDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (data.dates.length === 0) {
            gapDatesContainer.innerHTML = `<p>${data.message}</p>`;
            return;
        }
        const ul = document.createElement('ul');
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('ticker-select').value = 'QQQ';
                document.getElementById('date').value = date;
                loadChart(new Event('submit')); // Trigger chart load
                gtag('event', 'gap_date_click', {
                    'event_category': 'Gap Analysis',
                    'event_label': `QQQ_${date}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        gapDatesContainer.innerHTML = '';
        gapDatesContainer.appendChild(ul);
    } catch (error) {
        console.error('Error loading gap dates:', error);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates. Please try again.</p>';
    }
}