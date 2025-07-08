document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    loadBinOptions();
    populateEarningsOutcomes();
    
    // Form listeners
    document.getElementById('stock-form').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('simulator-stock-form').addEventListener('submit', (e) => loadChart(e, 'market-replay-simulator'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners for gap-analysis
    document.getElementById('play-replay').addEventListener('click', () => startReplay('gap-analysis'));
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay('gap-analysis'));
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay('gap-analysis'));
    document.getElementById('prev-candle').addEventListener('click', () => prevCandle('gap-analysis'));
    document.getElementById('next-candle').addEventListener('click', () => nextCandle('gap-analysis'));
    document.getElementById('replay-speed').addEventListener('change', () => updateReplaySpeed('gap-analysis'));
    document.getElementById('buy-trade').addEventListener('click', () => placeBuyTrade('gap-analysis'));
    document.getElementById('sell-trade').addEventListener('click', () => placeSellTrade('gap-analysis'));
    document.getElementById('trade-toggle').addEventListener('click', () => toggleTradeSummary('gap-analysis'));

    // Replay control listeners for market-replay-simulator
    document.getElementById('simulator-play-replay').addEventListener('click', () => startReplay('market-replay-simulator'));
    document.getElementById('simulator-pause-replay').addEventListener('click', () => pauseReplay('market-replay-simulator'));
    document.getElementById('simulator-start-over-replay').addEventListener('click', () => startOverReplay('market-replay-simulator'));
    document.getElementById('simulator-prev-candle').addEventListener('click', () => prevCandle('market-replay-simulator'));
    document.getElementById('simulator-next-candle').addEventListener('click', () => nextCandle('market-replay-simulator'));
    document.getElementById('simulator-replay-speed').addEventListener('change', () => updateReplaySpeed('market-replay-simulator'));
    document.getElementById('simulator-buy-trade').addEventListener('click', () => placeBuyTrade('market-replay-simulator'));
    document.getElementById('simulator-sell-trade').addEventListener('click', () => placeSellTrade('market-replay-simulator'));
    document.getElementById('simulator-trade-toggle').addEventListener('click', () => toggleTradeSummary('market-replay-simulator'));

    // Handle filter type toggle for events
    const filterRadios = document.querySelectorAll('input[name="filter-type"]');
    filterRadios.forEach(radio => {
        radio.addEventListener('change', toggleFilterSection);
    });

    // Handle filter type toggle for earnings
    const earningsFilterRadios = document.querySelectorAll('input[name="earnings-filter-type"]');
    earningsFilterRadios.forEach(radio => {
        radio.addEventListener('change', toggleEarningsFilterSection);
    });
});

// Global state for each section
const sectionState = {
    'gap-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        openPosition: null,
        tradeHistory: [],
    },
    'market-replay-simulator': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        openPosition: null,
        tradeHistory: [],
    }
};

const POSITION_SIZE = 100; // Fixed number of shares per trade

// Bin options for each event type
const binOptions = {
    CPI: ['<0%', '0-1%', '1-2%', '2-3%', '3-5%', '>5%'],
    PPI: ['<0%', '0-2%', '2-4%', '4-8%', '>8%'],
    NFP: ['<0K', '0-100K', '100-200K', '200-300K', '>300K'],
    FOMC: ['0-1%', '1-2%', '2-3%', '3-4%', '>4%']
};

// Earnings outcome options with explanations
const earningsOutcomes = [
    { value: 'Beat', text: 'Beat (>10%)' },
    { value: 'Slight Beat', text: 'Slight Beat (0% to 10%)' },
    { value: 'Miss', text: 'Miss (<-10%)' },
    { value: 'Slight Miss', text: 'Slight Miss (-10% to 0%)' },
    { value: 'Unknown', text: 'Unknown (data unavailable)' }
];

function openTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`.tab-button[onclick="openTab('${tabName}')"]`).classList.add('active');
    gtag('event', 'tab_switch', {
        'event_category': 'Navigation',
        'event_label': tabName
    });
}

function populateEarningsOutcomes() {
    const earningsBinSelect = document.getElementById('earnings-bin-select');
    earningsBinSelect.innerHTML = '<option value="">Select outcome</option>';
    earningsOutcomes.forEach(outcome => {
        const option = document.createElement('option');
        option.value = outcome.value;
        option.textContent = outcome.text;
        earningsBinSelect.appendChild(option);
    });
}

function toggleFilterSection() {
    const yearFilter = document.getElementById('year-filter');
    const binFilter = document.getElementById('bin-filter');
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;

    yearFilter.classList.remove('active');
    binFilter.classList.remove('active');

    if (filterType === 'year') {
        yearFilter.classList.add('active');
        document.getElementById('bin-event-type-select').value = '';
        document.getElementById('bin-select').value = '';
    } else {
        binFilter.classList.add('active');
        document.getElementById('event-type-select').value = '';
        document.getElementById('year-select').value = '';
    }
}

function toggleEarningsFilterSection() {
    const tickerOutcomeFilter = document.getElementById('ticker-outcome-filter');
    const tickerOnlyFilter = document.getElementById('ticker-only-filter');
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;

    tickerOutcomeFilter.classList.remove('active');
    tickerOnlyFilter.classList.remove('active');

    if (filterType === 'ticker-outcome') {
        tickerOutcomeFilter.classList.add('active');
        document.getElementById('earnings-ticker-only-select').value = '';
    } else {
        tickerOnlyFilter.classList.add('active');
        document.getElementById('earnings-ticker-select').value = '';
        document.getElementById('earnings-bin-select').value = '';
    }
}

function loadBinOptions() {
    const binEventTypeSelect = document.getElementById('bin-event-type-select');
    const binSelect = document.getElementById('bin-select');

    binEventTypeSelect.addEventListener('change', () => {
        const eventType = binEventTypeSelect.value;
        binSelect.innerHTML = '<option value="">Select range</option>';
        if (eventType && binOptions[eventType]) {
            binOptions[eventType].forEach(bin => {
                const option = document.createElement('option');
                option.value = bin;
                option.textContent = bin;
                binSelect.appendChild(option);
            });
            binSelect.disabled = false;
        } else {
            binSelect.disabled = true;
        }
    });
}

async function loadTickers() {
    const tickerSelect = document.getElementById('ticker-select');
    const simulatorTickerSelect = document.getElementById('simulator-ticker-select');
    tickerSelect.disabled = true;
    simulatorTickerSelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    simulatorTickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        console.log('Fetching tickers from /api/tickers');
        const response = await fetch('/api/tickers', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            simulatorTickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Fetched tickers:', data.tickers);
        if (!data.tickers || !Array.isArray(data.tickers)) {
            throw new Error('Invalid response format: tickers array not found');
        }
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        simulatorTickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option.cloneNode(true));
            simulatorTickerSelect.appendChild(option);
        });
        tickerSelect.disabled = false;
        simulatorTickerSelect.disabled = false;
        tickerSelect.addEventListener('change', () => loadDates('ticker-select', 'date'));
        simulatorTickerSelect.addEventListener('change', () => loadDates('simulator-ticker-select', 'simulator-date'));
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        simulatorTickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        alert('Failed to load tickers: ' + error.message + '. Please refresh the page or try again later.');
    }
}

async function loadEarningsTickers() {
    const tickerSelect = document.getElementById('earnings-ticker-select');
    const tickerOnlySelect = document.getElementById('earnings-ticker-only-select');
    tickerSelect.disabled = true;
    tickerOnlySelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    tickerOnlySelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        console.log('Fetching earnings tickers from /api/tickers');
        const response = await fetch('/api/tickers', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            tickerOnlySelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Fetched tickers for earnings:', data.tickers);
        if (!data.tickers || !Array.isArray(data.tickers)) {
            throw new Error('Invalid response format: tickers array not found');
        }
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        tickerOnlySelect.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option.cloneNode(true));
            tickerOnlySelect.appendChild(option);
        });
        tickerSelect.disabled = false;
        tickerOnlySelect.disabled = false;
    } catch (error) {
        console.error('Error loading earnings tickers:', error.message);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        tickerOnlySelect.innerHTML = '<option value="">Error loading tickers</option>';
        alert('Failed to load earnings tickers: ' + error.message + '. Please refresh the page or try again later.');
    }
}

async function loadDates(tickerSelectId, dateInputId) {
    const tickerSelect = document.getElementById(tickerSelectId);
    const dateInput = document.getElementById(dateInputId);
    dateInput.disabled = true;
    dateInput.value = '';
    const ticker = tickerSelect.value;
    if (!ticker) {
        dateInput.disabled = true;
        return;
    }
    console.log(`Fetching dates for ticker: ${ticker}`);
    try {
        const url = `/api/valid_dates?ticker=${encodeURIComponent(ticker)}`;
        console.log('Fetching URL:', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            alert(data.error);
            dateInput.disabled = true;
            return;
        }
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
        console.error('Error loading dates:', error.message);
        alert('Failed to load dates: ' + error.message);
        dateInput.disabled = true;
    }
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    try {
        console.log('Fetching years from /api/years');
        const response = await fetch('/api/years', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            yearSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Fetched years:', data.years);
        if (!data.years || !Array.isArray(data.years)) {
            throw new Error('Invalid response format: years array not found');
        }
        yearSelect.innerHTML = '<option value="">Select year</option>';
        data.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        yearSelect.disabled = false;
    } catch (error) {
        console.error('Error loading years:', error.message);
        yearSelect.innerHTML = '<option value="">Error loading years</option>';
        alert('Failed to load years: ' + error.message + '. Please refresh the page or try again later.');
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const direction = document.getElementById('gap-direction-select').value;
    const gapDatesDiv = document.getElementById('gap-dates');
    const tickerSelect = document.getElementById('ticker-select');
    const dateInput = document.getElementById('date');

    if (!gapSize && !day && !direction) {
        gapDatesDiv.innerHTML = '<p>Please select at least one filter to view gap dates.</p>';
        tickerSelect.disabled = true;
        dateInput.disabled = true;
        return;
    }

    console.log(`Fetching gap dates with gap_size=${gapSize}, day=${day}, direction=${direction}`);
    const params = new URLSearchParams();
    if (gapSize) params.append('gap_size', gapSize);
    if (day) params.append('day', day);
    if (direction) params.append('direction', direction);
    const url = `/api/gap_dates?${params.toString()}`;
    console.log('Fetching URL:', url);
    gapDatesDiv.innerHTML = '<p>Loading gap dates...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            gapDatesDiv.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            tickerSelect.disabled = true;
            dateInput.disabled = true;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error fetching gap dates:', data.error);
            gapDatesDiv.innerHTML = `<p>${data.error}</p>`;
            tickerSelect.disabled = true;
            dateInput.disabled = true;
            return;
        }
        console.log('Fetched gap dates:', data.dates);
        if (data.dates.length === 0) {
            gapDatesDiv.innerHTML = '<p>No gap dates found for the selected filters.</p>';
            tickerSelect.disabled = true;
            dateInput.disabled = true;
            return;
        }
        const ul = document.createElement('ul');
        data.dates.forEach(dateObj => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = `${dateObj.date} (${dateObj.gap_size}%, ${dateObj.direction})`;
            a.addEventListener('click', () => {
                tickerSelect.value = 'QQQ';
                dateInput.value = dateObj.date;
                document.getElementById('stock-form').dispatchEvent(new Event('submit'));
            });
            li.appendChild(a);
            ul.appendChild(li);
        });
        gapDatesDiv.innerHTML = '';
        gapDatesDiv.appendChild(ul);
        tickerSelect.disabled = false;
        dateInput.disabled = false;
        gtag('event', 'gap_dates_load', {
            'event_category': 'Gap Analysis',
            'event_label': `gap_size=${gapSize}_day=${day}_direction=${direction}`
        });
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesDiv.innerHTML = '<p>Failed to load gap dates: ' + error.message + '. Please try again later.</p>';
        tickerSelect.disabled = true;
        dateInput.disabled = true;
        alert('Failed to load gap dates: ' + error.message);
    }
}

async function loadEventDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;
    const eventType = filterType === 'year' 
        ? document.getElementById('event-type-select').value 
        : document.getElementById('bin-event-type-select').value;
    const year = document.getElementById('year-select').value;
    const bin = document.getElementById('bin-select').value;
    const eventDatesDiv = document.getElementById('event-dates');

    if (!eventType && (filterType === 'year' ? !year : !bin)) {
        eventDatesDiv.innerHTML = '<p>Please select an event type and a year or economic impact range.</p>';
        return;
    }

    console.log(`Fetching event dates with event_type=${eventType}, ${filterType}=${filterType === 'year' ? year : bin}`);
    const params = new URLSearchParams();
    if (eventType) params.append('event_type', eventType);
    if (filterType === 'year' && year) params.append('year', year);
    if (filterType === 'bin' && bin) params.append('bin', bin);
    const url = `/api/event_dates?${params.toString()}`;
    console.log('Fetching URL:', url);
    eventDatesDiv.innerHTML = '<p>Loading event dates...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            eventDatesDiv.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error fetching event dates:', data.error);
            eventDatesDiv.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched event dates:', data.dates);
        if (data.dates.length === 0) {
            eventDatesDiv.innerHTML = '<p>No event dates found for the selected filters.</p>';
            return;
        }
        const ul = document.createElement('ul');
        data.dates.forEach(dateObj => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = dateObj.date;
            a.addEventListener('click', () => {
                document.getElementById('ticker-select').value = 'QQQ';
                document.getElementById('date').value = dateObj.date;
                document.getElementById('stock-form').dispatchEvent(new Event('submit'));
            });
            li.appendChild(a);
            ul.appendChild(li);
        });
        eventDatesDiv.innerHTML = '';
        eventDatesDiv.appendChild(ul);
        gtag('event', 'event_dates_load', {
            'event_category': 'Event Analysis',
            'event_label': `event_type=${eventType}_${filterType}=${filterType === 'year' ? year : bin}`
        });
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesDiv.innerHTML = '<p>Failed to load event dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    const ticker = filterType === 'ticker-outcome' 
        ? document.getElementById('earnings-ticker-select').value 
        : document.getElementById('earnings-ticker-only-select').value;
    const outcome = document.getElementById('earnings-bin-select').value;
    const earningsDatesDiv = document.getElementById('earnings-dates');

    if (!ticker) {
        earningsDatesDiv.innerHTML = '<p>Please select a ticker to view earnings dates.</p>';
        return;
    }

    console.log(`Fetching earnings dates with ticker=${ticker}, outcome=${outcome}`);
    const params = new URLSearchParams();
    params.append('ticker', ticker);
    if (filterType === 'ticker-outcome' && outcome) params.append('outcome', outcome);
    const url = `/api/earnings_dates?${params.toString()}`;
    console.log('Fetching URL:', url);
    earningsDatesDiv.innerHTML = '<p>Loading earnings dates...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            earningsDatesDiv.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error fetching earnings dates:', data.error);
            earningsDatesDiv.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched earnings dates:', data.dates);
        if (data.dates.length === 0) {
            earningsDatesDiv.innerHTML = '<p>No earnings dates found for the selected filters.</p>';
            return;
        }
        const ul = document.createElement('ul');
        data.dates.forEach(dateObj => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = dateObj.date + (dateObj.outcome ? ` (${dateObj.outcome})` : '');
            a.addEventListener('click', () => {
                document.getElementById('ticker-select').value = ticker;
                document.getElementById('date').value = dateObj.date;
                document.getElementById('stock-form').dispatchEvent(new Event('submit'));
            });
            li.appendChild(a);
            ul.appendChild(li);
        });
        earningsDatesDiv.innerHTML = '';
        earningsDatesDiv.appendChild(ul);
        gtag('event', 'earnings_dates_load', {
            'event_category': 'Earnings Analysis',
            'event_label': `ticker=${ticker}_outcome=${outcome}`
        });
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        earningsDatesDiv.innerHTML = '<p>Failed to load earnings dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-insights-size-select').value;
    const day = document.getElementById('gap-insights-day-select').value;
    const direction = document.getElementById('gap-insights-direction-select').value;
    const gapInsightsDiv = document.getElementById('gap-insights-results');

    if (!gapSize && !day && !direction) {
        gapInsightsDiv.innerHTML = '<p>Please select at least one filter to view gap insights.</p>';
        return;
    }

    console.log(`Fetching gap insights with gap_size=${gapSize}, day=${day}, direction=${direction}`);
    const params = new URLSearchParams();
    if (gapSize) params.append('gap_size', gapSize);
    if (day) params.append('day', day);
    if (direction) params.append('direction', direction);
    const url = `/api/gap_insights?${params.toString()}`;
    console.log('Fetching URL:', url);
    gapInsightsDiv.innerHTML = '<p>Loading gap insights...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            gapInsightsDiv.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error fetching gap insights:', data.error);
            gapInsightsDiv.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched gap insights:', data);
        const container = document.createElement('div');
        container.className = 'insights-container';
        if (data.count === 0) {
            container.innerHTML = '<p>No gap insights found for the selected filters.</p>';
        } else {
            const countDiv = document.createElement('div');
            countDiv.className = 'insight-metric';
            countDiv.innerHTML = `
                <span class="metric-name">Total Gaps</span>
                <span class="metric-median">${data.count}</span>
                <span class="metric-description">Total number of gaps matching the filters.</span>
            `;
            const avgSizeDiv = document.createElement('div');
            avgSizeDiv.className = 'insight-metric';
            avgSizeDiv.innerHTML = `
                <span class="metric-name">Average Gap Size</span>
                <span class="metric-median">${data.avg_gap_size.toFixed(2)}%</span>
                <span class="metric-description">Average size of gaps as a percentage.</span>
            `;
            const fillRateDiv = document.createElement('div');
            fillRateDiv.className = 'insight-metric';
            fillRateDiv.innerHTML = `
                <span class="metric-name">Fill Rate</span>
                <span class="metric-median">${(data.fill_rate * 100).toFixed(2)}%</span>
                <span class="metric-description">Percentage of gaps that filled on the same day.</span>
            `;
            const avgTimeDiv = document.createElement('div');
            avgTimeDiv.className = 'insight-metric';
            avgTimeDiv.innerHTML = `
                <span class="metric-name">Average Time to Fill</span>
                <span class="metric-median">${data.avg_time_to_fill.toFixed(2)} hours</span>
                <span class="metric-description">Average time taken for gaps to fill.</span>
            `;
            const row = document.createElement('div');
            row.className = 'insights-row four-metrics';
            row.appendChild(countDiv);
            row.appendChild(avgSizeDiv);
            row.appendChild(fillRateDiv);
            row.appendChild(avgTimeDiv);
            container.appendChild(row);
        }
        gapInsightsDiv.innerHTML = '';
        gapInsightsDiv.appendChild(container);
        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `gap_size=${gapSize}_day=${day}_direction=${direction}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        gapInsightsDiv.innerHTML = '<p>Failed to load gap insights: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}

async function loadChart(event, section) {
    event.preventDefault();
    const tickerSelectId = section === 'gap-analysis' ? 'ticker-select' : 'simulator-ticker-select';
    const dateInputId = section === 'gap-analysis' ? 'date' : 'simulator-date';
    const chartContainerId = section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart';
    const replayControlsId = section === 'gap-analysis' ? 'replay-controls' : 'simulator-replay-controls';
    const ticker = document.getElementById(tickerSelectId).value;
    const date = document.getElementById(dateInputId).value;
    const chartContainer = document.getElementById(chartContainerId);
    const replayControls = document.getElementById(replayControlsId);
    const playButton = document.getElementById(section === 'gap-analysis' ? 'play-replay' : 'simulator-play-replay');
    const pauseButton = document.getElementById(section === 'gap-analysis' ? 'pause-replay' : 'simulator-pause-replay');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
    const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');
    const form = document.getElementById(section === 'gap-analysis' ? 'stock-form' : 'simulator-stock-form');
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    // Determine if the chart is loaded from the gap analysis section
    const isGapAnalysis = section === 'gap-analysis';

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('chartRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || !date) {
        chartContainer.innerHTML = '<p>Please select a ticker and date.</p>';
        replayControls.style.display = 'none';
        return;
    }

    console.log(`Loading chart for ticker=${ticker}, date=${date}, restrict_hours=${isGapAnalysis}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}${isGapAnalysis ? '&restrict_hours=true' : ''}`;
    console.log('Fetching URL:', url);
    chartContainer.innerHTML = '<p>Loading chart...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('chartRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Load Chart';
                inputs.forEach(input => input.disabled = false);
                chartContainer.innerHTML = '<p>Please select a ticker and date to generate a chart.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Chart error:', data.error);
            chartContainer.innerHTML = `<p>${data.error}</p>`;
            replayControls.style.display = 'none';
            return;
        }

        // Store chart data for replay
        sectionState[section].chartData = data.chart_data;
        sectionState[section].currentReplayIndex = 0;
        sectionState[section].isReplaying = false;
        sectionState[section].isPaused = false;
        if (sectionState[section].replayInterval) clearInterval(sectionState[section].replayInterval);

        // Reset trade simulator state
        sectionState[section].openPosition = null;
        sectionState[section].tradeHistory = [];
        updateTradeSummary(section);

        // Render full chart initially
        const candlestickTrace = {
            x: data.chart_data.timestamp,
            open: data.chart_data.open,
            high: data.chart_data.high,
            low: data.chart_data.low,
            close: data.chart_data.close,
            type: 'candlestick',
            name: data.chart_data.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        const volumeTrace = {
            x: data.chart_data.timestamp,
            y: data.chart_data.volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        const layout = {
            title: `${data.chart_data.ticker} Candlestick Chart - ${data.chart_data.date}${isGapAnalysis ? ' (Regular Hours)' : ''}`,
            xaxis: {
                title: 'Time',
                type: 'date',
                rangeslider: { visible: false },
                tickformat: '%H:%M'
            },
            yaxis: {
                title: 'Price',
                domain: [0.3, 1]
            },
            yaxis2: {
                title: 'Volume',
                domain: [0, 0.25],
                anchor: 'x'
            },
            showlegend: true,
            margin: { t: 50, b: 50, l: 50, r: 50 },
            plot_bgcolor: '#ffffff',
            paper_bgcolor: '#ffffff'
        };
        Plotly.newPlot(chartContainerId, [candlestickTrace, volumeTrace], layout, {
            responsive: true
        });

        // Show replay controls
        replayControls.style.display = 'block';
        playButton.textContent = 'Play Replay';
        playButton.disabled = false;
        pauseButton.disabled = true;
        startOverButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = true;
        buyButton.disabled = true;
        sellButton.disabled = true;
        document.getElementById(section === 'gap-analysis' ? 'replay-start-time' : 'simulator-replay-start-time').value = isGapAnalysis ? '09:30' : '';
        document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp').textContent = 'Current Time: --:--:--';

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}${isGapAnalysis ? '_regular_hours' : ''}`,
            'section': section
        });
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '. Please try again later.</p>';
        replayControls.style.display = 'none';
        alert('Failed to load chart: ' + error.message);
    }
}

function placeBuyTrade(section) {
    const state = sectionState[section];
    if (!state.isReplaying || !state.chartData || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count) return;
    if (state.openPosition) {
        alert('Close the current position before opening a new one.');
        return;
    }
    state.openPosition = {
        type: 'buy',
        price: state.chartData.close[state.currentReplayIndex - 1],
        shares: POSITION_SIZE,
        timestamp: state.chartData.timestamp[state.currentReplayIndex - 1]
    };
    console.log(`Placed buy trade in ${section}: ${JSON.stringify(state.openPosition)}`);
    updateTradeSummary(section);
    gtag('event', 'trade_placed', {
        'event_category': 'Trade Simulator',
        'event_label': `Buy_${state.chartData.ticker}_${state.chartData.date}_${state.openPosition.timestamp}`,
        'section': section
    });
}

function placeSellTrade(section) {
    const state = sectionState[section];
    if (!state.isReplaying || !state.chartData || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count) return;
    if (state.openPosition) {
        // Close existing position
        const exitPrice = state.chartData.close[state.currentReplayIndex - 1];
        const pnl = state.openPosition.type === 'buy'
            ? (exitPrice - state.openPosition.price) * state.openPosition.shares
            : (state.openPosition.price - exitPrice) * state.openPosition.shares;
        state.tradeHistory.push({
            type: state.openPosition.type,
            entryPrice: state.openPosition.price,
            exitPrice: exitPrice,
            shares: state.openPosition.shares,
            timestamp: state.chartData.timestamp[state.currentReplayIndex - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        state.openPosition = null;
        console.log(`Closed position in ${section} with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary(section);
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`,
            'section': section
        });
    } else {
        // Open new sell position
        state.openPosition = {
            type: 'sell',
            price: state.chartData.close[state.currentReplayIndex - 1],
            shares: POSITION_SIZE,
            timestamp: state.chartData.timestamp[state.currentReplayIndex - 1]
        };
        console.log(`Placed sell trade in ${section}: ${JSON.stringify(state.openPosition)}`);
        updateTradeSummary(section);
        gtag('event', 'trade_placed', {
            'event_category': 'Trade Simulator',
            'event_label': `Sell_${state.chartData.ticker}_${state.chartData.date}_${state.openPosition.timestamp}`,
            'section': section
        });
    }
}

function updateTradeSummary(section) {
    const state = sectionState[section];
    const positionStatus = document.getElementById(section === 'gap-analysis' ? 'position-status' : 'simulator-position-status');
    const tradePnl = document.getElementById(section === 'gap-analysis' ? 'trade-pnl' : 'simulator-trade-pnl');
    const tradeHistoryEl = document.getElementById(section === 'gap-analysis' ? 'trade-history' : 'simulator-trade-history');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');

    // Update button states
    buyButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count || state.openPosition?.type === 'sell';
    sellButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count;

    // Update position status
    if (state.openPosition) {
        const currentPrice = state.currentReplayIndex > 0 ? state.chartData.close[state.currentReplayIndex - 1] : state.openPosition.price;
        const unrealizedPnl = state.openPosition.type === 'buy'
            ? (currentPrice - state.openPosition.price) * state.openPosition.shares
            : (state.openPosition.price - currentPrice) * state.openPosition.shares;
        positionStatus.textContent = `Open ${state.openPosition.type.toUpperCase()} Position: ${state.openPosition.shares} shares @ $${state.openPosition.price.toFixed(2)}`;
        tradePnl.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
    } else {
        positionStatus.textContent = 'No open position';
        tradePnl.textContent = `Realized P/L: $${state.tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2)}`;
    }

    // Update trade history
    if (state.tradeHistory.length === 0) {
        tradeHistoryEl.textContent = 'Trade History: None';
    } else {
        const historyText = state.tradeHistory.map(trade => 
            `${trade.type.toUpperCase()} ${trade.shares} shares @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} at ${trade.timestamp.split(' ')[1]} (P/L: $${trade.pnl.toFixed(2)})`
        ).join('; ');
        tradeHistoryEl.textContent = `Trade History: ${historyText}`;
    }
}

function toggleTradeSummary(section) {
    const tradeSummary = document.getElementById(section === 'gap-analysis' ? 'trade-summary' : 'simulator-trade-summary');
    const toggleButton = document.getElementById(section === 'gap-analysis' ? 'trade-toggle' : 'simulator-trade-toggle');
    tradeSummary.classList.toggle('collapsed');
    toggleButton.textContent = tradeSummary.classList.contains('collapsed') 
        ? 'Show Trade Summary' 
        : 'Hide Trade Summary';
}

function startReplay(section) {
    const state = sectionState[section];
    if (!state.chartData) return;
    const playButton = document.getElementById(section === 'gap-analysis' ? 'play-replay' : 'simulator-play-replay');
    const pauseButton = document.getElementById(section === 'gap-analysis' ? 'pause-replay' : 'simulator-pause-replay');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
    const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');
    const chartContainer = document.getElementById(section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart');
    const timestampDisplay = document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp');
    const startTimeInput = document.getElementById(section === 'gap-analysis' ? 'replay-start-time' : 'simulator-replay-start-time').value;
    const replaySpeed = parseInt(document.getElementById(section === 'gap-analysis' ? 'replay-speed' : 'simulator-replay-speed').value);

    // If not paused, determine start index based on user input
    if (!state.isPaused) {
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const dateStr = state.chartData.date;
            const targetTime = new Date(`${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            state.currentReplayIndex = state.chartData.timestamp.findIndex(ts => {
                const candleTime = new Date(ts);
                return candleTime.getTime() >= targetTime.getTime();
            });
            if (state.currentReplayIndex === -1) {
                state.currentReplayIndex = 0;
                alert('Start time not found in chart data. Starting from first candle.');
            }
        } else {
            state.currentReplayIndex = 0;
        }
    }

    // Prevent starting if already replaying
    if (state.isReplaying && !state.isPaused) return;

    state.isReplaying = true;
    state.isPaused = false;
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;
    buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;
    sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;

    // Initialize chart for replay
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: state.chartData.timestamp.slice(0, state.currentReplayIndex),
        open: state.chartData.open.slice(0, state.currentReplayIndex),
        high: state.chartData.high.slice(0, state.currentReplayIndex),
        low: state.chartData.low.slice(0, state.currentReplayIndex),
        close: state.chartData.close.slice(0, state.currentReplayIndex),
        type: 'candlestick',
        name: state.chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: state.chartData.timestamp.slice(0, state.currentReplayIndex),
        y: state.chartData.volume.slice(0, state.currentReplayIndex),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: {
            title: 'Time',
            type: 'date',
            rangeslider: { visible: false },
            tickformat: '%H:%M'
        },
        yaxis: {
            title: 'Price',
            domain: [0.3, 1]
        },
        yaxis2: {
            title: 'Volume',
            domain: [0, 0.25],
            anchor: 'x'
        },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer.id, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp display and trade summary
    timestampDisplay.textContent = state.currentReplayIndex > 0 
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    updateTradeSummary(section);

    // Replay loop
    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= state.chartData.count) {
            stopReplay(section);
            return;
        }

        // Add next candle
        Plotly.extendTraces(chartContainer.id, {
            x: [[state.chartData.timestamp[state.currentReplayIndex]]],
            open: [[state.chartData.open[state.currentReplayIndex]]],
            high: [[state.chartData.high[state.currentReplayIndex]]],
            low: [[state.chartData.low[state.currentReplayIndex]]],
            close: [[state.chartData.close[state.currentReplayIndex]]]
        }, [0]);
        Plotly.extendTraces(chartContainer.id, {
            x: [[state.chartData.timestamp[state.currentReplayIndex]]],
            y: [[state.chartData.volume[state.currentReplayIndex]]]
        }, [1]);

        // Update timestamp display and button states
        timestampDisplay.textContent = `Current Time: ${state.chartData.timestamp[state.currentReplayIndex].split(' ')[1]}`;
        prevButton.disabled = state.currentReplayIndex <= 0;
        nextButton.disabled = state.currentReplayIndex + 1 >= state.chartData.count;
        startOverButton.disabled = state.currentReplayIndex <= 0;
        buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
        sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;
        updateTradeSummary(section);

        state.currentReplayIndex++;
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}`,
        'section': section
    });
}

function pauseReplay(section) {
    const state = sectionState[section];
    if (!state.isReplaying) return;
    state.isReplaying = false;
    state.isPaused = true;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(section === 'gap-analysis' ? 'play-replay' : 'simulator-play-replay');
    const pauseButton = document.getElementById(section === 'gap-analysis' ? 'pause-replay' : 'simulator-pause-replay');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');
    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count || state.openPosition?.type === 'sell';
    sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count;
    updateTradeSummary(section);
}

function startOverReplay(section) {
    const state = sectionState[section];
    if (!state.chartData) return;
    const playButton = document.getElementById(section === 'gap-analysis' ? 'play-replay' : 'simulator-play-replay');
    const pauseButton = document.getElementById(section === 'gap-analysis' ? 'pause-replay' : 'simulator-pause-replay');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
    const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');
    const timestampDisplay = document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp');
    const chartContainer = document.getElementById(section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart');

    // Stop any ongoing replay
    if (state.isReplaying || state.isPaused) {
        clearInterval(state.replayInterval);
        state.isReplaying = false;
        state.isPaused = false;
    }

    // Reset to the beginning
    state.currentReplayIndex = 0;

    // Update chart to show no candles
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: [],
        open: [],
        high: [],
        low: [],
        close: [],
        type: 'candlestick',
        name: state.chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: [],
        y: [],
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: {
            title: 'Time',
            type: 'date',
            rangeslider: { visible: false },
            tickformat: '%H:%M'
        },
        yaxis: {
            title: 'Price',
            domain: [0.3, 1]
        },
        yaxis2: {
            title: 'Volume',
            domain: [0, 0.25],
            anchor: 'x'
        },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer.id, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update button states
    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = state.chartData.count === 0;
    buyButton.disabled = true;
    sellButton.disabled = true;

    // Reset timestamp and trade summary
    timestampDisplay.textContent = 'Current Time: --:--:--';
    updateTradeSummary(section);

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}`,
        'section': section
    });
}

function stopReplay(section) {
    const state = sectionState[section];
    if (!state.isReplaying && !state.isPaused) return;
    state.isReplaying = false;
    state.isPaused = false;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(section === 'gap-analysis' ? 'play-replay' : 'simulator-play-replay');
    const pauseButton = document.getElementById(section === 'gap-analysis' ? 'pause-replay' : 'simulator-pause-replay');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
    const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');
    const chartContainer = document.getElementById(section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart');

    // Close open position if any
    if (state.openPosition && state.currentReplayIndex > 0 && state.currentReplayIndex <= state.chartData.count) {
        const exitPrice = state.chartData.close[state.currentReplayIndex - 1];
        const pnl = state.openPosition.type === 'buy'
            ? (exitPrice - state.openPosition.price) * state.openPosition.shares
            : (state.openPosition.price - exitPrice) * state.openPosition.shares;
        state.tradeHistory.push({
            type: state.openPosition.type,
            entryPrice: state.openPosition.price,
            exitPrice: exitPrice,
            shares: state.openPosition.shares,
            timestamp: state.chartData.timestamp[state.currentReplayIndex - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        state.openPosition = null;
        console.log(`Closed position at replay end in ${section} with P/L: $${pnl.toFixed(2)}`);
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`,
            'section': section
        });
    }

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    buyButton.disabled = true;
    sellButton.disabled = true;

    // Restore full chart
    const candlestickTrace = {
        x: state.chartData.timestamp,
        open: state.chartData.open,
        high: state.chartData.high,
        low: state.chartData.low,
        close: state.chartData.close,
        type: 'candlestick',
        name: state.chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: state.chartData.timestamp,
        y: state.chartData.volume,
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date}`,
        xaxis: {
            title: 'Time',
            type: 'date',
            rangeslider: { visible: false },
            tickformat: '%H:%M'
        },
        yaxis: {
            title: 'Price',
            domain: [0.3, 1]
        },
        yaxis2: {
            title: 'Volume',
            domain: [0, 0.25],
            anchor: 'x'
        },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer.id, [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp').textContent = 'Current Time: --:--:--';
    updateTradeSummary(section);
}

function prevCandle(section) {
    const state = sectionState[section];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex <= 0) return;
    state.currentReplayIndex--;
    updateChartToIndex(section);
}

function nextCandle(section) {
    const state = sectionState[section];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex >= state.chartData.count) return;
    state.currentReplayIndex++;
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const state = sectionState[section];
    const chartContainer = document.getElementById(section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart');
    const timestampDisplay = document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp');
    const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
    const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
    const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
    const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
    const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');

    // Update chart to show candles up to currentReplayIndex
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: state.chartData.timestamp.slice(0, state.currentReplayIndex),
        open: state.chartData.open.slice(0, state.currentReplayIndex),
        high: state.chartData.high.slice(0, state.currentReplayIndex),
        low: state.chartData.low.slice(0, state.currentReplayIndex),
        close: state.chartData.close.slice(0, state.currentReplayIndex),
        type: 'candlestick',
        name: state.chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: state.chartData.timestamp.slice(0, state.currentReplayIndex),
        y: state.chartData.volume.slice(0, state.currentReplayIndex),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: {
            title: 'Time',
            type: 'date',
            rangeslider: { visible: false },
            tickformat: '%H:%M'
        },
        yaxis: {
            title: 'Price',
            domain: [0.3, 1]
        },
        yaxis2: {
            title: 'Volume',
            domain: [0, 0.25],
            anchor: 'x'
        },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer.id, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp display and button states
    timestampDisplay.textContent = state.currentReplayIndex > 0 
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
    sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;
    updateTradeSummary(section);
}

function updateReplaySpeed(section) {
    const state = sectionState[section];
    if (state.isReplaying && !state.isPaused) {
        clearInterval(state.replayInterval);
        const replaySpeed = parseInt(document.getElementById(section === 'gap-analysis' ? 'replay-speed' : 'simulator-replay-speed').value);
        state.replayInterval = setInterval(() => {
            if (state.currentReplayIndex >= state.chartData.count) {
                stopReplay(section);
                return;
            }

            const chartContainer = document.getElementById(section === 'gap-analysis' ? 'plotly-chart' : 'simulator-plotly-chart');
            const timestampDisplay = document.getElementById(section === 'gap-analysis' ? 'replay-timestamp' : 'simulator-replay-timestamp');
            const prevButton = document.getElementById(section === 'gap-analysis' ? 'prev-candle' : 'simulator-prev-candle');
            const nextButton = document.getElementById(section === 'gap-analysis' ? 'next-candle' : 'simulator-next-candle');
            const startOverButton = document.getElementById(section === 'gap-analysis' ? 'start-over-replay' : 'simulator-start-over-replay');
            const buyButton = document.getElementById(section === 'gap-analysis' ? 'buy-trade' : 'simulator-buy-trade');
            const sellButton = document.getElementById(section === 'gap-analysis' ? 'sell-trade' : 'simulator-sell-trade');

            // Add next candle
            Plotly.extendTraces(chartContainer.id, {
                x: [[state.chartData.timestamp[state.currentReplayIndex]]],
                open: [[state.chartData.open[state.currentReplayIndex]]],
                high: [[state.chartData.high[state.currentReplayIndex]]],
                low: [[state.chartData.low[state.currentReplayIndex]]],
                close: [[state.chartData.close[state.currentReplayIndex]]]
            }, [0]);
            Plotly.extendTraces(chartContainer.id, {
                x: [[state.chartData.timestamp[state.currentReplayIndex]]],
                y: [[state.chartData.volume[state.currentReplayIndex]]]
            }, [1]);

            // Update timestamp display and button states
            timestampDisplay.textContent = `Current Time: ${state.chartData.timestamp[state.currentReplayIndex].split(' ')[1]}`;
            prevButton.disabled = state.currentReplayIndex <= 0;
            nextButton.disabled = state.currentReplayIndex + 1 >= state.chartData.count;
            startOverButton.disabled = state.currentReplayIndex <= 0;
            buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
            sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;
            updateTradeSummary(section);

            state.currentReplayIndex++;
        }, replaySpeed);
    }
}