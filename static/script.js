document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    loadBinOptions();
    populateEarningsOutcomes();

    // Initialize forms for remaining tabs
    document.getElementById('stock-form-gap').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);

    // Initialize ticker selects for remaining tabs
    document.getElementById('ticker-select-gap').addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
    document.getElementById('ticker-select-events').addEventListener('change', () => loadDates('ticker-select-events', 'date-events'));

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

    // Set default tab to Nasdaq Gap Insights
    openTab('gap-insights');
});

// Global variables for replay (Gap Analysis, Events Analysis, Earnings Analysis)
let chartDataGap = null;
let replayIntervalGap = null;
let currentReplayIndexGap = 0;
let isReplayingGap = false;
let isPausedGap = false;

let chartDataEvents = null;
let replayIntervalEvents = null;
let currentReplayIndexEvents = 0;
let isReplayingEvents = false;
let isPausedEvents = false;

let chartDataEarnings = null;
let replayIntervalEarnings = null;
let currentReplayIndexEarnings = 0;
let isReplayingEarnings = false;
let isPausedEarnings = false;

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
    const tickerSelectGap = document.getElementById('ticker-select-gap');
    const tickerSelectEvents = document.getElementById('ticker-select-events');
    tickerSelectGap.disabled = true;
    tickerSelectEvents.disabled = true;
    tickerSelectGap.innerHTML = '<option value="">Loading tickers...</option>';
    tickerSelectEvents.innerHTML = '<option value="">Loading tickers...</option>';
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
            tickerSelectGap.innerHTML = `<option value="">${data.error}</option>`;
            tickerSelectEvents.innerHTML = `<option value="">${data.error}</option>`;
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
        tickerSelectGap.innerHTML = '<option value="">Select a ticker</option>';
        tickerSelectEvents.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelectGap.appendChild(option.cloneNode(true));
            tickerSelectEvents.appendChild(option);
        });
        tickerSelectGap.disabled = false;
        tickerSelectEvents.disabled = false;
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelectGap.innerHTML = '<option value="">Error loading tickers</option>';
        tickerSelectEvents.innerHTML = '<option value="">Error loading tickers</option>';
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

async function loadChart(event, tabId) {
    event.preventDefault();
    // Map tabId to configuration
    const tabConfig = {
        'gap-analysis': {
            tickerSelectId: 'ticker-select-gap',
            dateInputId: 'date-gap',
            timeframeSelectId: 'timeframe-select-gap',
            chartContainerId: 'plotly-chart-gap',
            formId: 'stock-form-gap',
            restrictHours: true,
            replayControlsId: 'replay-controls-gap',
            replayPrefix: 'gap'
        },
        'events-analysis': {
            tickerSelectId: 'ticker-select-events',
            dateInputId: 'date-events',
            timeframeSelectId: 'timeframe-select-events',
            chartContainerId: 'plotly-chart-events',
            formId: 'stock-form-events',
            restrictHours: false,
            replayControlsId: 'replay-controls-events',
            replayPrefix: 'events'
        },
        'earnings-analysis': {
            tickerSelectId: 'earnings-ticker-select',
            dateInputId: 'date-earnings',
            timeframeSelectId: 'timeframe-select-earnings',
            chartContainerId: 'plotly-chart-earnings',
            formId: 'earnings-form',
            restrictHours: true,
            replayControlsId: 'replay-controls-earnings',
            replayPrefix: 'earnings'
        }
    };

    const config = tabConfig[tabId];
    if (!config) {
        console.error(`Invalid tabId: ${tabId}`);
        return;
    }

    const { tickerSelectId, dateInputId, timeframeSelectId, chartContainerId, formId, restrictHours, replayControlsId, replayPrefix } = config;
    const ticker = document.getElementById(tickerSelectId).value;
    const date = document.getElementById(dateInputId).value;
    const timeframe = document.getElementById(timeframeSelectId).value;
    const chartContainer = document.getElementById(chartContainerId);
    const form = document.getElementById(formId);
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    // Replay controls
    const replayControls = document.getElementById(replayControlsId);
    const playButton = document.getElementById(`play-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${replayPrefix ? '-' + replayPrefix : ''}`);

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem(`chartRateLimitReset_${tabId}`);
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || !date || !timeframe) {
        chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe.</p>';
        replayControls.style.display = 'none';
        return;
    }

    console.log(`Loading chart for ticker=${ticker}, date=${date}, timeframe=${timeframe}, restrict_hours=${restrictHours}, tab=${tabId}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${encodeURIComponent(timeframe)}${restrictHours ? '&restrict_hours=true' : ''}`;
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
            localStorage.setItem(`chartRateLimitReset_${tabId}`, resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Load Chart';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem(`chartRateLimitReset_${tabId}`);
                chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe to generate a chart.</p>';
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

        // Store chart data and reset replay state
        if (replayPrefix === 'gap') {
            chartDataGap = data.chart_data;
            currentReplayIndexGap = 0;
            isReplayingGap = false;
            isPausedGap = false;
            if (replayIntervalGap) clearInterval(replayIntervalGap);
        } else if (replayPrefix === 'events') {
            chartDataEvents = data.chart_data;
            currentReplayIndexEvents = 0;
            isReplayingEvents = false;
            isPausedEvents = false;
            if (replayIntervalEvents) clearInterval(replayIntervalEvents);
        } else if (replayPrefix === 'earnings') {
            chartDataEarnings = data.chart_data;
            currentReplayIndexEarnings = 0;
            isReplayingEarnings = false;
            isPausedEarnings = false;
            if (replayIntervalEarnings) clearInterval(replayIntervalEarnings);
        }

        // Render chart
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
            title: `${data.chart_data.ticker} ${timeframe}-Minute Candlestick Chart - ${data.chart_data.date}${restrictHours ? ' (Regular Hours)' : ''}`,
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

        // Handle replay controls
        replayControls.style.display = 'block';
        playButton.textContent = 'Play Replay';
        playButton.disabled = false;
        pauseButton.disabled = true;
        startOverButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = true;
        document.getElementById(`replay-start-time${replayPrefix ? '-' + replayPrefix : ''}`).value = '';
        document.getElementById(`replay-timestamp${replayPrefix ? '-' + replayPrefix : ''}`).textContent = 'Current Time: --:--:--';

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}_${timeframe}${restrictHours ? '_regular_hours' : ''}`,
            'tab': tabId
        });
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '. Please try again later.</p>';
        replayControls.style.display = 'none';
        alert('Failed to load chart: ' + error.message);
    }
}

function getReplayConfig(section) {
    const configs = {
        'gap': {
            chartData: () => chartDataGap,
            setChartData: (data) => { chartDataGap = data; },
            replayInterval: () => replayIntervalGap,
            setReplayInterval: (interval) => { replayIntervalGap = interval; },
            currentReplayIndex: () => currentReplayIndexGap,
            setCurrentReplayIndex: (index) => { currentReplayIndexGap = index; },
            isReplaying: () => isReplayingGap,
            setIsReplaying: (state) => { isReplayingGap = state; },
            isPaused: () => isPausedGap,
            setIsPaused: (state) => { isPausedGap = state; },
            chartContainerId: 'plotly-chart-gap',
            playButtonId: 'play-replay-gap',
            pauseButtonId: 'pause-replay-gap',
            startOverButtonId: 'start-over-replay-gap',
            prevButtonId: 'prev-candle-gap',
            nextButtonId: 'next-candle-gap',
            startTimeInputId: 'replay-start-time-gap',
            replaySpeedId: 'replay-speed-gap',
            timestampDisplayId: 'replay-timestamp-gap',
            hasTradeSimulator: false
        },
        'events': {
            chartData: () => chartDataEvents,
            setChartData: (data) => { chartDataEvents = data; },
            replayInterval: () => replayIntervalEvents,
            setReplayInterval: (interval) => { replayIntervalEvents = interval; },
            currentReplayIndex: () => currentReplayIndexEvents,
            setCurrentReplayIndex: (index) => { currentReplayIndexEvents = index; },
            isReplaying: () => isReplayingEvents,
            setIsReplaying: (state) => { isReplayingEvents = state; },
            isPaused: () => isPausedEvents,
            setIsPaused: (state) => { isPausedEvents = state; },
            chartContainerId: 'plotly-chart-events',
            playButtonId: 'play-replay-events',
            pauseButtonId: 'pause-replay-events',
            startOverButtonId: 'start-over-replay-events',
            prevButtonId: 'prev-candle-events',
            nextButtonId: 'next-candle-events',
            startTimeInputId: 'replay-start-time-events',
            replaySpeedId: 'replay-speed-events',
            timestampDisplayId: 'replay-timestamp-events',
            hasTradeSimulator: false
        },
        'earnings': {
            chartData: () => chartDataEarnings,
            setChartData: (data) => { chartDataEarnings = data; },
            replayInterval: () => replayIntervalEarnings,
            setReplayInterval: (interval) => { replayIntervalEarnings = interval; },
            currentReplayIndex: () => currentReplayIndexEarnings,
            setCurrentReplayIndex: (index) => { currentReplayIndexEarnings = index; },
            isReplaying: () => isReplayingEarnings,
            setIsReplaying: (state) => { isReplayingEarnings = state; },
            isPaused: () => isPausedEarnings,
            setIsPaused: (state) => { isPausedEarnings = state; },
            chartContainerId: 'plotly-chart-earnings',
            playButtonId: 'play-replay-earnings',
            pauseButtonId: 'pause-replay-earnings',
            startOverButtonId: 'start-over-replay-earnings',
            prevButtonId: 'prev-candle-earnings',
            nextButtonId: 'next-candle-earnings',
            startTimeInputId: 'replay-start-time-earnings',
            replaySpeedId: 'replay-speed-earnings',
            timestampDisplayId: 'replay-timestamp-earnings',
            hasTradeSimulator: false
        }
    };
    return configs[section];
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const startTimeInput = document.getElementById(config.startTimeInputId).value;
    const replaySpeed = parseInt(document.getElementById(config.replaySpeedId).value);
    const chartContainer = document.getElementById(config.chartContainerId);

    // If not paused, determine start index based on user input
    if (!config.isPaused()) {
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const dateStr = chartData.date;
            const targetTime = new Date(`${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            let currentReplayIndex = chartData.timestamp.findIndex(ts => {
                const candleTime = new Date(ts);
                return candleTime.getTime() >= targetTime.getTime();
            });
            if (currentReplayIndex === -1) {
                currentReplayIndex = 0;
                alert('Start time not found in chart data. Starting from first candle.');
            }
            config.setCurrentReplayIndex(currentReplayIndex);
        } else {
            config.setCurrentReplayIndex(0);
        }
    }

    // Prevent starting if already replaying
    if (config.isReplaying() && !config.isPaused()) return;

    config.setIsReplaying(true);
    config.setIsPaused(false);
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;

    // Initialize chart for replay
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: chartData.timestamp.slice(0, config.currentReplayIndex()),
        open: chartData.open.slice(0, config.currentReplayIndex()),
        high: chartData.high.slice(0, config.currentReplayIndex()),
        low: chartData.low.slice(0, config.currentReplayIndex()),
        close: chartData.close.slice(0, config.currentReplayIndex()),
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: chartData.timestamp.slice(0, config.currentReplayIndex()),
        y: chartData.volume.slice(0, config.currentReplayIndex()),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} Candlestick Chart - ${chartData.date} (Replay)`,
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
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp display
    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    // Replay loop
    config.setReplayInterval(setInterval(() => {
        if (config.currentReplayIndex() >= chartData.count) {
            stopReplay(section);
            return;
        }

        // Add next candle
        Plotly.extendTraces(config.chartContainerId, {
            x: [[chartData.timestamp[config.currentReplayIndex()]]],
            open: [[chartData.open[config.currentReplayIndex()]]],
            high: [[chartData.high[config.currentReplayIndex()]]],
            low: [[chartData.low[config.currentReplayIndex()]]],
            close: [[chartData.close[config.currentReplayIndex()]]]
        }, [0]);
        Plotly.extendTraces(config.chartContainerId, {
            x: [[chartData.timestamp[config.currentReplayIndex()]]],
            y: [[chartData.volume[config.currentReplayIndex()]]]
        }, [1]);

        // Update timestamp display and button states
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[config.currentReplayIndex()].split(' ')[1]}`;
        prevButton.disabled = config.currentReplayIndex() <= 0;
        nextButton.disabled = config.currentReplayIndex() + 1 >= chartData.count;
        startOverButton.disabled = config.currentReplayIndex() <= 0;

        config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    }, replaySpeed));

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section}`
    });
}

function pauseReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying()) return;

    config.setIsReplaying(false);
    config.setIsPaused(true);
    clearInterval(config.replayInterval());
    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);

    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);

    // Stop any ongoing replay
    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    // Reset to the beginning
    config.setCurrentReplayIndex(0);

    // Update chart to show no candles (initial state)
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: [],
        open: [],
        high: [],
        low: [],
        close: [],
        type: 'candlestick',
        name: chartData.ticker,
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
        title: `${chartData.ticker} Candlestick Chart - ${chartData.date} (Replay)`,
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
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update button states
    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = chartData.count === 0;

    // Reset timestamp
    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section}`
    });
}

function stopReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying() && !config.isPaused()) return;

    config.setIsReplaying(false);
    config.setIsPaused(false);
    clearInterval(config.replayInterval());
    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const chartData = config.chartData();

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;

    // Restore full chart
    const candlestickTrace = {
        x: chartData.timestamp,
        open: chartData.open,
        high: chartData.high,
        low: chartData.low,
        close: chartData.close,
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: chartData.timestamp,
        y: chartData.volume,
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} Candlestick Chart - ${chartData.date}`,
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
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || config.currentReplayIndex() <= 0) return;

    config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
    updateChartToIndex(section);
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || config.currentReplayIndex() >= chartData.count) return;

    config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    const chartContainer = document.getElementById(config.chartContainerId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);

    // Update chart to show candles up to currentReplayIndex
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: chartData.timestamp.slice(0, config.currentReplayIndex()),
        open: chartData.open.slice(0, config.currentReplayIndex()),
        high: chartData.high.slice(0, config.currentReplayIndex()),
        low: chartData.low.slice(0, config.currentReplayIndex()),
        close: chartData.close.slice(0, config.currentReplayIndex()),
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: chartData.timestamp.slice(0, config.currentReplayIndex()),
        y: chartData.volume.slice(0, config.currentReplayIndex()),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} Candlestick Chart - ${chartData.date} (Replay)`,
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
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp and button states
    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;
    startOverButton.disabled = config.currentReplayIndex() <= 0;

    gtag('event', 'replay_manual_step', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section}`
    });
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDirection = document.getElementById('gap-direction-select').value;
    const gapDatesList = document.getElementById('gap-dates-list');
    const gapDatesContainer = document.getElementById('gap-dates');

    gapDatesList.innerHTML = '';
    gapDatesContainer.innerHTML = '<p>Loading gap dates...</p>';

    if (!gapSize || !day || !gapDirection) {
        gapDatesContainer.innerHTML = '<p>Please select a gap size, day, and direction to view dates with gaps.</p>';
        return;
    }

    const url = `/api/gap_dates?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching gap dates URL:', url);
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
            gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Gap dates error:', data.error);
            gapDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched gap dates:', data.dates);
        gapDatesContainer.innerHTML = `<p>Found ${data.dates.length} gap dates for the selected criteria.</p>`;
        if (data.dates.length === 0) {
            gapDatesList.innerHTML = '<li>No dates found for the selected criteria.</li>';
        } else {
            data.dates.forEach(date => {
                const li = document.createElement('li');
                li.textContent = date;
                gapDatesList.appendChild(li);
            });
        }

        gtag('event', 'gap_dates_load', {
            'event_category': 'Data',
            'event_label': `${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap dates: ' + error.message);
    }
}

async function loadEventDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;
    let url;
    if (filterType === 'year') {
        const eventType = document.getElementById('event-type-select').value;
        const year = document.getElementById('year-select').value;
        if (!eventType || !year) {
            document.getElementById('event-dates').innerHTML = '<p>Please select an event type and year to view dates with events.</p>';
            return;
        }
        url = `/api/event_dates?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
    } else {
        const eventType = document.getElementById('bin-event-type-select').value;
        const bin = document.getElementById('bin-select').value;
        if (!eventType || !bin) {
            document.getElementById('event-dates').innerHTML = '<p>Please select an event type and economic impact range to view dates with events.</p>';
            return;
        }
        url = `/api/event_dates?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
    }

    const eventDatesList = document.getElementById('event-dates-list');
    const eventDatesContainer = document.getElementById('event-dates');
    eventDatesList.innerHTML = '';
    eventDatesContainer.innerHTML = '<p>Loading event dates...</p>';

    console.log('Fetching event dates URL:', url);
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
            eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Event dates error:', data.error);
            eventDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched event dates:', data.dates);
        eventDatesContainer.innerHTML = `<p>Found ${data.dates.length} event dates for the selected criteria.</p>`;
        if (data.dates.length === 0) {
            eventDatesList.innerHTML = '<li>No dates found for the selected criteria.</li>';
        } else {
            data.dates.forEach(date => {
                const li = document.createElement('li');
                li.textContent = date;
                eventDatesList.appendChild(li);
            });
        }

        gtag('event', 'event_dates_load', {
            'event_category': 'Data',
            'event_label': `${filterType}_${url.split('?')[1]}`
        });
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesContainer.innerHTML = '<p>Failed to load event dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    let url;
    if (filterType === 'ticker-outcome') {
        const ticker = document.getElementById('earnings-ticker-select').value;
        const bin = document.getElementById('earnings-bin-select').value;
        if (!ticker || !bin) {
            document.getElementById('earnings-dates').innerHTML = '<p>Please select a ticker and earnings outcome to view earnings dates.</p>';
            return;
        }
        url = `/api/earnings_dates?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`;
    } else {
        const ticker = document.getElementById('earnings-ticker-only-select').value;
        if (!ticker) {
            document.getElementById('earnings-dates').innerHTML = '<p>Please select a ticker to view earnings dates.</p>';
            return;
        }
        url = `/api/earnings_dates?ticker=${encodeURIComponent(ticker)}`;
    }

    const earningsDatesList = document.getElementById('earnings-dates-list');
    const earningsDatesContainer = document.getElementById('earnings-dates');
    earningsDatesList.innerHTML = '';
    earningsDatesContainer.innerHTML = '<p>Loading earnings dates...</p>';

    console.log('Fetching earnings dates URL:', url);
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
            earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Earnings dates error:', data.error);
            earningsDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched earnings dates:', data.dates);
        earningsDatesContainer.innerHTML = `<p>Found ${data.dates.length} earnings dates for the selected criteria.</p>`;
        if (data.dates.length === 0) {
            earningsDatesList.innerHTML = '<li>No dates found for the selected criteria.</li>';
        } else {
            data.dates.forEach(date => {
                const li = document.createElement('li');
                li.textContent = date;
                earningsDatesList.appendChild(li);
            });
        }

        gtag('event', 'earnings_dates_load', {
            'event_category': 'Data',
            'event_label': `${filterType}_${url.split('?')[1]}`
        });
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        earningsDatesContainer.innerHTML = '<p>Failed to load earnings dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-insights-size-select').value;
    const day = document.getElementById('gap-insights-day-select').value;
    const gapDirection = document.getElementById('gap-insights-direction-select').value;
    const resultsContainer = document.getElementById('gap-insights-results');

    if (!gapSize || !day || !gapDirection) {
        resultsContainer.innerHTML = '<p>Please select a gap size, day, and direction to view Nasdaq gap insights and statistics.</p>';
        return;
    }

    const url = `/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching gap insights URL:', url);
    resultsContainer.innerHTML = '<p>Loading insights...</p>';
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
            resultsContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Gap insights error:', data.error);
            resultsContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched gap insights:', data);
        resultsContainer.innerHTML = `
            <h3>Gap Insights: ${gapSize} ${gapDirection} on ${day}</h3>
            <p><strong>Gap Fill Rate:</strong> ${data.fill_rate ? (data.fill_rate * 100).toFixed(2) + '%' : 'N/A'}</p>
            <p><strong>Median Move Before Fill:</strong> ${data.median_move_before_fill ? data.median_move_before_fill.toFixed(2) + '%' : 'N/A'}</p>
            <p><strong>Max Move for Unfilled Gaps:</strong> ${data.max_move_unfilled ? data.max_move_unfilled.toFixed(2) + '%' : 'N/A'}</p>
            <p><strong>Total Gaps Analyzed:</strong> ${data.total_gaps || 'N/A'}</p>
        `;

        gtag('event', 'gap_insights_load', {
            'event_category': 'Data',
            'event_label': `${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        resultsContainer.innerHTML = '<p>Failed to load gap insights: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}

// Add event listeners for replay controls
document.getElementById('play-replay-gap').addEventListener('click', () => startReplay('gap'));
document.getElementById('pause-replay-gap').addEventListener('click', () => pauseReplay('gap'));
document.getElementById('start-over-replay-gap').addEventListener('click', () => startOverReplay('gap'));
document.getElementById('prev-candle-gap').addEventListener('click', () => prevCandle('gap'));
document.getElementById('next-candle-gap').addEventListener('click', () => nextCandle('gap'));

document.getElementById('play-replay-events').addEventListener('click', () => startReplay('events'));
document.getElementById('pause-replay-events').addEventListener('click', () => pauseReplay('events'));
document.getElementById('start-over-replay-events').addEventListener('click', () => startOverReplay('events'));
document.getElementById('prev-candle-events').addEventListener('click', () => prevCandle('events'));
document.getElementById('next-candle-events').addEventListener('click', () => nextCandle('events'));

document.getElementById('play-replay-earnings').addEventListener('click', () => startReplay('earnings'));
document.getElementById('pause-replay-earnings').addEventListener('click', () => pauseReplay('earnings'));
document.getElementById('start-over-replay-earnings').addEventListener('click', () => startOverReplay('earnings'));
document.getElementById('prev-candle-earnings').addEventListener('click', () => prevCandle('earnings'));
document.getElementById('next-candle-earnings').addEventListener('click', () => nextCandle('earnings'));

// Tab switching function (already included in index.html, but ensure it’s called correctly)
function openTab(tabId) {
    console.log(`Opening tab: ${tabId}`);
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        targetTab.style.display = 'block';
    } else {
        console.error(`Tab not found: ${tabId}`);
    }
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`button[onclick="openTab('${tabId}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    gtag('event', 'tab_open', {
        'event_category': 'Navigation',
        'event_label': tabId
    });
}