document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    loadBinOptions();
    populateEarningsOutcomes();
    
    // Initialize stock forms for all tabs
    document.getElementById('stock-form').addEventListener('submit', (e) => loadChart(e, 'market-simulator'));
    document.getElementById('stock-form-gap').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis')); // New form handler
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners (Market Simulator)
    document.getElementById('play-replay').addEventListener('click', () => startReplay(''));
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay(''));
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay(''));
    document.getElementById('prev-candle').addEventListener('click', () => prevCandle(''));
    document.getElementById('next-candle').addEventListener('click', () => nextCandle(''));
    document.getElementById('replay-speed').addEventListener('change', () => updateReplaySpeed(''));
    // Trade simulator listeners (exclusive to Market Simulator)
    document.getElementById('buy-trade').addEventListener('click', placeBuyTrade);
    document.getElementById('sell-trade').addEventListener('click', placeSellTrade);

    // Replay control listeners for Gap Analysis
    document.getElementById('play-replay-gap').addEventListener('click', () => startReplay('gap'));
    document.getElementById('pause-replay-gap').addEventListener('click', () => pauseReplay('gap'));
    document.getElementById('start-over-replay-gap').addEventListener('click', () => startOverReplay('gap'));
    document.getElementById('prev-candle-gap').addEventListener('click', () => prevCandle('gap'));
    document.getElementById('next-candle-gap').addEventListener('click', () => nextCandle('gap'));
    document.getElementById('replay-speed-gap').addEventListener('change', () => updateReplaySpeed('gap'));

    // Replay control listeners for Events Analysis
    document.getElementById('play-replay-events').addEventListener('click', () => startReplay('events'));
    document.getElementById('pause-replay-events').addEventListener('click', () => pauseReplay('events'));
    document.getElementById('start-over-replay-events').addEventListener('click', () => startOverReplay('events'));
    document.getElementById('prev-candle-events').addEventListener('click', () => prevCandle('events'));
    document.getElementById('next-candle-events').addEventListener('click', () => nextCandle('events'));
    document.getElementById('replay-speed-events').addEventListener('change', () => updateReplaySpeed('events'));

    // Replay control listeners for Earnings Analysis
    document.getElementById('play-replay-earnings').addEventListener('click', () => startReplay('earnings'));
    document.getElementById('pause-replay-earnings').addEventListener('click', () => pauseReplay('earnings'));
    document.getElementById('start-over-replay-earnings').addEventListener('click', () => startOverReplay('earnings'));
    document.getElementById('prev-candle-earnings').addEventListener('click', () => prevCandle('earnings'));
    document.getElementById('next-candle-earnings').addEventListener('click', () => nextCandle('earnings'));
    document.getElementById('replay-speed-earnings').addEventListener('change', () => updateReplaySpeed('earnings'));

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

    // Initialize ticker selects for all tabs
    document.getElementById('ticker-select').addEventListener('change', () => loadDates('ticker-select', 'date'));
    document.getElementById('ticker-select-gap').addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
    document.getElementById('ticker-select-events').addEventListener('change', () => loadDates('ticker-select-events', 'date-events')); // New
});

// Global variables for each tab
const tabStates = {
    'market-simulator': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        openPosition: null,
        tradeHistory: [],
        candlesPerTimeframe: 1,
        aggregatedCandles: null
    },
    'gap-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        candlesPerTimeframe: 1,
        aggregatedCandles: null
    },
    'events-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        candlesPerTimeframe: 1,
        aggregatedCandles: null
    },
    'earnings-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        candlesPerTimeframe: 1,
        aggregatedCandles: null
    }
};

const POSITION_SIZE = 100;

// Aggregate 1-minute candles into target timeframe candles
function aggregateCandles(chartData, candlesPerTimeframe) {
    const aggregated = {
        timestamp: [],
        open: [],
        high: [],
        low: [],
        close: [],
        volume: [],
        count: 0
    };
    for (let i = 0; i < chartData.count; i += candlesPerTimeframe) {
        const slice = {
            timestamp: chartData.timestamp.slice(i, i + candlesPerTimeframe),
            open: chartData.open.slice(i, i + candlesPerTimeframe),
            high: chartData.high.slice(i, i + candlesPerTimeframe),
            low: chartData.low.slice(i, i + candlesPerTimeframe),
            close: chartData.close.slice(i, i + candlesPerTimeframe),
            volume: chartData.volume.slice(i, i + candlesPerTimeframe)
        };
        if (slice.timestamp.length > 0) {
            aggregated.timestamp.push(slice.timestamp[0]); // Use first timestamp of the group
            aggregated.open.push(slice.open[0]);
            aggregated.high.push(Math.max(...slice.high));
            aggregated.low.push(Math.min(...slice.low));
            aggregated.close.push(slice.close[slice.close.length - 1]);
            aggregated.volume.push(slice.volume.reduce((sum, v) => sum + v, 0));
            aggregated.count++;
        }
    }
    return aggregated;
}

// Get partial candle data up to a specific 1-minute index within a timeframe candle
function getPartialCandle(chartData, startIndex, endIndex) {
    if (endIndex <= startIndex || endIndex > chartData.count) return null;
    const slice = {
        timestamp: chartData.timestamp.slice(startIndex, endIndex),
        open: chartData.open.slice(startIndex, endIndex),
        high: chartData.high.slice(startIndex, endIndex),
        low: chartData.low.slice(startIndex, endIndex),
        close: chartData.close.slice(startIndex, endIndex),
        volume: chartData.volume.slice(startIndex, endIndex)
    };
    return {
        timestamp: slice.timestamp[0],
        open: slice.open[0],
        high: Math.max(...slice.high),
        low: Math.min(...slice.low),
        close: slice.close[slice.close.length - 1],
        volume: slice.volume.reduce((sum, v) => sum + v, 0)
    };
}

// Global variables for replay (Market Simulator)
let chartData = null;
let replayInterval = null;
let currentReplayIndex = 0;
let isReplaying = false;
let isPaused = false;
// Trade simulator globals (Market Simulator only)
let openPosition = null;
let tradeHistory = [];
const POSITION_SIZE = 100;

// Replay globals for Gap Analysis
let chartDataGap = null;
let replayIntervalGap = null;
let currentReplayIndexGap = 0;
let isReplayingGap = false;
let isPausedGap = false;

// Replay globals for Events Analysis
let chartDataEvents = null;
let replayIntervalEvents = null;
let currentReplayIndexEvents = 0;
let isReplayingEvents = false;
let isPausedEvents = false;

// Replay globals for Earnings Analysis
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
    const tickerSelect = document.getElementById('ticker-select');
    const tickerSelectGap = document.getElementById('ticker-select-gap');
    const tickerSelectEvents = document.getElementById('ticker-select-events'); // New
    tickerSelect.disabled = true;
    tickerSelectGap.disabled = true;
    tickerSelectEvents.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
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
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
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
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        tickerSelectGap.innerHTML = '<option value="">Select a ticker</option>';
        tickerSelectEvents.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option.cloneNode(true));
            tickerSelectGap.appendChild(option.cloneNode(true));
            tickerSelectEvents.appendChild(option); // New
        });
        tickerSelect.disabled = false;
        tickerSelectGap.disabled = false;
        tickerSelectEvents.disabled = false;
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
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
    const tabConfig = {
        'market-simulator': {
            tickerSelectId: 'ticker-select',
            dateInputId: 'date',
            timeframeSelectId: 'timeframe-select',
            chartContainerId: 'plotly-chart',
            formId: 'stock-form',
            restrictHours: false,
            replayControlsId: 'replay-controls',
            replayPrefix: ''
        },
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
            dateInputId: 'date-gap',
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
    const timeframe = parseInt(document.getElementById(timeframeSelectId).value);
    const chartContainer = document.getElementById(chartContainerId);
    const form = document.getElementById(formId);
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    const state = tabStates[tabId];
    const replayControls = document.getElementById(replayControlsId);
    const playButton = document.getElementById(`play-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    let buyButton, sellButton;
    if (tabId === 'market-simulator') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

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
    chartContainer.innerHTML = '<p>Loading chart...</p>';
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        if (response.status === 429) {
            const data = await response.json();
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
            chartContainer.innerHTML = `<p>${data.error}</p>`;
            replayControls.style.display = 'none';
            return;
        }

        // Store chart data and reset replay state
        state.chartData = data.chart_data;
        state.candlesPerTimeframe = data.chart_data.candles_per_timeframe;
        state.aggregatedCandles = aggregateCandles(state.chartData, state.candlesPerTimeframe);
        state.currentReplayIndex = 0;
        state.isReplaying = false;
        state.isPaused = false;
        if (state.replayInterval) clearInterval(state.replayInterval);
        if (tabId === 'market-simulator') {
            state.openPosition = null;
            state.tradeHistory = [];
            updateTradeSummary();
        }

        // Render full chart using aggregated candles
        const candlestickTrace = {
            x: state.aggregatedCandles.timestamp,
            open: state.aggregatedCandles.open,
            high: state.aggregatedCandles.high,
            low: state.aggregatedCandles.low,
            close: state.aggregatedCandles.close,
            type: 'candlestick',
            name: state.chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        const volumeTrace = {
            x: state.aggregatedCandles.timestamp,
            y: state.aggregatedCandles.volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        const layout = {
            title: `${state.chartData.ticker} ${timeframe}-Minute Candlestick Chart - ${state.chartData.date}${restrictHours ? ' (Regular Hours)' : ''}`,
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
        nextButton.disabled = state.chartData.count === 0;
        if (tabId === 'market-simulator') {
            buyButton.disabled = true;
            sellButton.disabled = true;
        }
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


function placeBuyTrade() {
    const state = tabStates['market-simulator'];
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
    console.log(`Placed buy trade: ${JSON.stringify(state.openPosition)}`);
    updateTradeSummary();
    gtag('event', 'trade_placed', {
        'event_category': 'Trade Simulator',
        'event_label': `Buy_${state.chartData.ticker}_${state.chartData.date}_${state.openPosition.timestamp}`
    });
}

function placeSellTrade() {
    const state = tabStates['market-simulator'];
    if (!state.isReplaying || !state.chartData || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count) return;
    if (state.openPosition) {
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
        console.log(`Closed position with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary();
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`
        });
    } else {
        state.openPosition = {
            type: 'sell',
            price: state.chartData.close[state.currentReplayIndex - 1],
            shares: POSITION_SIZE,
            timestamp: state.chartData.timestamp[state.currentReplayIndex - 1]
        };
        console.log(`Placed sell trade: ${JSON.stringify(state.openPosition)}`);
        updateTradeSummary();
        gtag('event', 'trade_placed', {
            'event_category': 'Trade Simulator',
            'event_label': `Sell_${state.chartData.ticker}_${state.chartData.date}_${state.openPosition.timestamp}`
        });
    }
}

function updateTradeSummary() {
    const state = tabStates['market-simulator'];
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryEl = document.getElementById('trade-history');
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    buyButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
    sellButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;

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

    if (state.tradeHistory.length === 0) {
        tradeHistoryEl.textContent = 'Trade History: None';
    } else {
        const historyText = state.tradeHistory.map(trade =>
            `${trade.type.toUpperCase()} ${trade.shares} shares @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} at ${trade.timestamp.split(' ')[1]} (P/L: $${trade.pnl.toFixed(2)})`
        ).join('; ');
        tradeHistoryEl.textContent = `Trade History: ${historyText}`;
    }
}

function getReplayConfig(section) {
    return tabStates[section];
}

function startReplay(section) {
    const state = getReplayConfig(section);
    const chartData = state.chartData;
    if (!chartData) return;

    const playButton = document.getElementById(`play-replay${section ? '-' + section : ''}`);
    const pauseButton = document.getElementById(`pause-replay${section ? '-' + section : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${section ? '-' + section : ''}`);
    const prevButton = document.getElementById(`prev-candle${section ? '-' + section : ''}`);
    const nextButton = document.getElementById(`next-candle${section ? '-' + section : ''}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${section ? '-' + section : ''}`);
    const startTimeInput = document.getElementById(`replay-start-time${section ? '-' + section : ''}`).value;
    const replaySpeed = parseInt(document.getElementById(`replay-speed${section ? '-' + section : ''}`).value);
    const chartContainer = document.getElementById(section === '' ? 'plotly-chart' : `plotly-chart-${section}`);
    let buyButton, sellButton;
    if (section === '') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (!state.isPaused) {
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
            state.currentReplayIndex = currentReplayIndex;
        } else {
            state.currentReplayIndex = 0;
        }
    }

    if (state.isReplaying && !state.isPaused) return;

    state.isReplaying = true;
    state.isPaused = false;
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= chartData.count;
    if (section === '') {
        buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > chartData.count;
        sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > chartData.count;
        updateTradeSummary();
    }

    // Initialize chart for replay
    Plotly.purge(chartContainer);
    const candlestickTrace = { x: [], open: [], high: [], low: [], close: [], type: 'candlestick', name: chartData.ticker, increasing: { line: { color: '#00cc00' } }, decreasing: { line: { color: '#ff0000' } } };
    const volumeTrace = { x: [], y: [], type: 'bar', name: 'Volume', yaxis: 'y2', marker: { color: '#888888' } };
    const layout = {
        title: `${chartData.ticker} ${chartData.timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update initial candles
    updateChartToIndex(section);

    // Replay loop
    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= chartData.count) {
            stopReplay(section);
            return;
        }

        state.currentReplayIndex++;
        updateChartToIndex(section);
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section || 'simulator'}`
    });
}


function pauseReplay(section) {
    const state = getReplayConfig(section);
    if (!state.isReplaying) return;

    state.isReplaying = false;
    state.isPaused = true;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(`play-replay${section ? '-' + section : ''}`);
    const pauseButton = document.getElementById(`pause-replay${section ? '-' + section : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${section ? '-' + section : ''}`);
    let buyButton, sellButton;
    if (section === '') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
        updateTradeSummary();
    }

    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    if (section === '') {
        buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
        sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;
    }
}

function startOverReplay(section) {
    const state = getReplayConfig(section);
    const chartData = state.chartData;
    if (!chartData) return;

    const playButton = document.getElementById(`play-replay${section ? '-' + section : ''}`);
    const pauseButton = document.getElementById(`pause-replay${section ? '-' + section : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${section ? '-' + section : ''}`);
    const prevButton = document.getElementById(`prev-candle${section ? '-' + section : ''}`);
    const nextButton = document.getElementById(`next-candle${section ? '-' + section : ''}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${section ? '-' + section : ''}`);
    const chartContainer = document.getElementById(section === '' ? 'plotly-chart' : `plotly-chart-${section}`);
    let buyButton, sellButton;
    if (section === '') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (state.isReplaying || state.isPaused) {
        clearInterval(state.replayInterval);
        state.isReplaying = false;
        state.isPaused = false;
    }

    state.currentReplayIndex = 0;

    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: [], open: [], high: [], low: [], close: [],
        type: 'candlestick', name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } }, decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: [], y: [],
        type: 'bar', name: 'Volume', yaxis: 'y2', marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} ${chartData.timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = chartData.count === 0;
    if (section === '') {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section || 'simulator'}`
    });
}

function stopReplay(section) {
    const state = getReplayConfig(section);
    if (!state.isReplaying && !state.isPaused) return;

    state.isReplaying = false;
    state.isPaused = false;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(`play-replay${section ? '-' + section : ''}`);
    const pauseButton = document.getElementById(`pause-replay${section ? '-' + section : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${section ? '-' + section : ''}`);
    const prevButton = document.getElementById(`prev-candle${section ? '-' + section : ''}`);
    const nextButton = document.getElementById(`next-candle${section ? '-' + section : ''}`);
    const chartContainer = document.getElementById(section === '' ? 'plotly-chart' : `plotly-chart-${section}`);
    const chartData = state.chartData;
    let buyButton, sellButton;
    if (section === '') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (section === '' && state.openPosition && state.currentReplayIndex > 0 && state.currentReplayIndex <= chartData.count) {
        const exitPrice = chartData.close[state.currentReplayIndex - 1];
        const pnl = state.openPosition.type === 'buy'
            ? (exitPrice - state.openPosition.price) * state.openPosition.shares
            : (state.openPosition.price - exitPrice) * state.openPosition.shares;
        state.tradeHistory.push({
            type: state.openPosition.type,
            entryPrice: state.openPosition.price,
            exitPrice: exitPrice,
            shares: state.openPosition.shares,
            timestamp: chartData.timestamp[state.currentReplayIndex - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        state.openPosition = null;
        console.log(`Closed position at replay end with P/L: $${pnl.toFixed(2)}`);
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${chartData.ticker}_${chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`
        });
    }

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    if (section === '') {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    const candlestickTrace = {
        x: state.aggregatedCandles.timestamp,
        open: state.aggregatedCandles.open,
        high: state.aggregatedCandles.high,
        low: state.aggregatedCandles.low,
        close: state.aggregatedCandles.close,
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: state.aggregatedCandles.timestamp,
        y: state.aggregatedCandles.volume,
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} ${chartData.timeframe}-Minute Candlestick Chart - ${chartData.date}`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer, [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById(`replay-timestamp${section ? '-' + section : ''}`).textContent = 'Current Time: --:--:--';
}

function prevCandle(section) {
    const state = getReplayConfig(section);
    const chartData = state.chartData;
    if (!chartData || state.isReplaying || state.currentReplayIndex <= 0) return;

    state.currentReplayIndex--;
    updateChartToIndex(section);
}

function nextCandle(section) {
    const state = getReplayConfig(section);
    const chartData = state.chartData;
    if (!chartData || state.isReplaying || state.currentReplayIndex >= chartData.count) return;

    state.currentReplayIndex++;
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const state = getReplayConfig(section);
    const chartData = state.chartData;
    const aggregatedCandles = state.aggregatedCandles;
    const candlesPerTimeframe = state.candlesPerTimeframe;
    const chartContainer = document.getElementById(section === '' ? 'plotly-chart' : `plotly-chart-${section}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${section ? '-' + section : ''}`);
    const prevButton = document.getElementById(`prev-candle${section ? '-' + section : ''}`);
    const nextButton = document.getElementById(`next-candle${section ? '-' + section : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${section ? '-' + section : ''}`);
    let buyButton, sellButton;
    if (section === '') {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    // Calculate completed timeframe candles
    const completedCandleIndex = Math.floor((state.currentReplayIndex - 1) / candlesPerTimeframe);
    const currentCandleStartIndex = completedCandleIndex * candlesPerTimeframe;
    const currentCandleEndIndex = Math.min(state.currentReplayIndex, chartData.count);

    // Prepare traces
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

    // Add completed timeframe candles
    for (let i = 0; i < completedCandleIndex; i++) {
        candlestickTrace.x.push(aggregatedCandles.timestamp[i]);
        candlestickTrace.open.push(aggregatedCandles.open[i]);
        candlestickTrace.high.push(aggregatedCandles.high[i]);
        candlestickTrace.low.push(aggregatedCandles.low[i]);
        candlestickTrace.close.push(aggregatedCandles.close[i]);
        volumeTrace.x.push(aggregatedCandles.timestamp[i]);
        volumeTrace.y.push(aggregatedCandles.volume[i]);
    }

    // Add partial current timeframe candle if applicable
    if (currentCandleStartIndex < chartData.count && state.currentReplayIndex > 0) {
        const partialCandle = getPartialCandle(chartData, currentCandleStartIndex, currentCandleEndIndex);
        if (partialCandle) {
            candlestickTrace.x.push(partialCandle.timestamp);
            candlestickTrace.open.push(partialCandle.open);
            candlestickTrace.high.push(partialCandle.high);
            candlestickTrace.low.push(partialCandle.low);
            candlestickTrace.close.push(partialCandle.close);
            volumeTrace.x.push(partialCandle.timestamp);
            volumeTrace.y.push(partialCandle.volume);
        }
    }

    Plotly.purge(chartContainer);
    const layout = {
        title: `${chartData.ticker} ${chartData.timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(chartContainer, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp and button states
    timestampDisplay.textContent = state.currentReplayIndex > 0
        ? `Current Time: ${chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= chartData.count;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    if (section === '') {
        buyButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > chartData.count || state.openPosition?.type === 'sell';
        sellButton.disabled = state.currentReplayIndex <= 0 || state.currentReplayIndex > chartData.count;
        updateTradeSummary();
    }
}

function updateReplaySpeed(section) {
    const state = getReplayConfig(section);
    if (state.isReplaying) {
        pauseReplay(section);
        startReplay(section);
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDirection = document.getElementById('gap-direction-select').value;
    const gapDatesContainer = document.getElementById('gap-dates');
    const form = document.getElementById('gap-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('gapDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection) {
        gapDatesContainer.innerHTML = '<p>Please select a gap size, day of the week, and gap direction.</p>';
        return;
    }

    console.log(`Fetching gaps for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    const url = `/api/gaps?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching URL:', url);
    gapDatesContainer.innerHTML = '<p>Loading gap dates...</p>';
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
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('gapDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Gap Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('gapDatesRateLimitReset');
                gapDatesContainer.innerHTML = '<p>Please select a gap size, day of the week, and gap direction to view gap dates.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Gap API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from gap API:', data.error);
            gapDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (!data.dates || data.dates.length === 0) {
            console.log('No gap dates found:', data.message || 'No dates returned');
            gapDatesContainer.innerHTML = `<p>${data.message || 'No gaps found for the selected criteria'}</p>`;
            return;
        }
        console.log(`Rendering ${data.dates.length} gap dates:`, data.dates);
        const ul = document.createElement('ul');
        ul.id = 'gap-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked gap date: ${date}`);
                openTab('gap-analysis');
                document.getElementById('ticker-select-gap').value = 'QQQ';
                document.getElementById('date-gap').value = date;
                loadChart(new Event('submit'), 'gap-analysis');
                gtag('event', 'gap_date_click', {
                    'event_category': 'Gap Analysis',
                    'event_label': `QQQ_${date}_${gapDirection}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        gapDatesContainer.innerHTML = '';
        gapDatesContainer.appendChild(ul);
        console.log('Gap dates rendered successfully');
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap dates: ' + error.message);
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

async function loadEventDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;
    const eventDatesContainer = document.getElementById('event-dates');
    const form = document.getElementById('events-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('eventDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    let url;
    let eventType;
    let year;
    let bin;

    if (filterType === 'year') {
        eventType = document.getElementById('event-type-select').value;
        year = document.getElementById('year-select').value;
        if (!eventType || !year) {
            eventDatesContainer.innerHTML = '<p>Please select an event type and year.</p>';
            return;
        }
        url = `/api/events?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
    } else {
        eventType = document.getElementById('bin-event-type-select').value;
        bin = document.getElementById('bin-select').value;
        if (!eventType || !bin) {
            eventDatesContainer.innerHTML = '<p>Please select an event type and economic impact range.</p>';
            return;
        }
        url = `/api/economic_events?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
    }

    console.log(`Fetching events for filterType=${filterType}, event_type=${eventType}, year=${year}, bin=${bin}`);
    console.log('Fetching URL:', url);
    eventDatesContainer.innerHTML = '<p>Loading event dates...</p>';
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
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('eventDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Event Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('eventDatesRateLimitReset');
                eventDatesContainer.innerHTML = '<p>Select filters to view dates with events.</p>';
            }, 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Event API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from event API:', data.error);
            eventDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (!data.dates || data.dates.length === 0) {
            console.log('No event dates found:', data.message || 'No dates returned');
            eventDatesContainer.innerHTML = `<p>${data.message || 'No events found for the selected criteria'}</p>`;
            return;
        }
        console.log(`Rendering ${data.dates.length} event dates:`, data.dates);
        const ul = document.createElement('ul');
        ul.id = 'event-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked event date: ${date}`);
                openTab('events-analysis');
                document.getElementById('ticker-select-events').value = 'QQQ'; // Updated
                document.getElementById('date-events').value = date; // Updated
                loadChart(new Event('submit'), 'events-analysis');
                gtag('event', 'event_date_click', {
                    'event_category': 'Event Analysis',
                    'event_label': `QQQ_${date}_${eventType}${bin ? '_' + bin : ''}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        eventDatesContainer.innerHTML = '';
        eventDatesContainer.appendChild(ul);
        console.log('Event dates rendered successfully');
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesContainer.innerHTML = '<p>Failed to load event dates: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    const earningsDatesContainer = document.getElementById('earnings-dates');
    const form = document.getElementById('earnings-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('earningsDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    let url;
    let ticker;
    let bin;

    if (filterType === 'ticker-outcome') {
        ticker = document.getElementById('earnings-ticker-select').value;
        bin = document.getElementById('earnings-bin-select').value;
        if (!ticker || !bin) {
            earningsDatesContainer.innerHTML = '<p>Please select a ticker and earnings outcome.</p>';
            return;
        }
        url = `/api/earnings_by_bin?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`;
    } else {
        ticker = document.getElementById('earnings-ticker-only-select').value;
        if (!ticker) {
            earningsDatesContainer.innerHTML = '<p>Please select a ticker.</p>';
            return;
        }
        url = `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
    }

    console.log(`Fetching earnings for filterType=${filterType}, ticker=${ticker}, bin=${bin}`);
    console.log('Fetching URL:', url);
    earningsDatesContainer.innerHTML = '<p>Loading earnings dates...</p>';
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
            earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('earningsDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Earnings Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('earningsDatesRateLimitReset');
                earningsDatesContainer.innerHTML = '<p>Select a ticker and optionally an earnings outcome to view earnings dates.</p>';
            }, 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Earnings API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from earnings data:', data.error);
            earningsDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (!data.dates || data.dates.length === 0) {
            console.log('No earnings dates found:', data.message || 'No dates returned');
            earningsDatesContainer.innerHTML = `<p>${data.message || `No earnings found for ${ticker}${bin ? ' with outcome ' + bin : ''}`}</p>`;
            return;
        }
        console.log(`Rendering ${data.dates.length} earnings dates:`, data.dates);
        const ul = document.createElement('ul');
        ul.id = 'earnings-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked earnings date: ${date}`);
                openTab('earnings-analysis');
                document.getElementById('earnings-ticker-select').value = ticker;
                document.getElementById('date-gap').value = date;
                loadChart(new Event('submit'), 'earnings-analysis');
                gtag('event', 'earnings_date_click', {
                    'event_category': 'Earnings Analysis',
                    'event_label': `${ticker}_${date}${bin ? '_' + bin : ''}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        earningsDatesContainer.innerHTML = '';
        earningsDatesContainer.appendChild(ul);
        console.log('Earnings dates rendered successfully');
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
    const insightsContainer = document.getElementById('gap-insights-results');
    const form = document.getElementById('gap-insights-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('gapInsightsRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 3 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection) {
        insightsContainer.innerHTML = '<p>Please select a gap size, day of the week, and gap direction.</p>';
        return;
    }
    console.log(`Fetching gap insights for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    const url = `/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching URL:', url);
    insightsContainer.innerHTML = '<p>Loading gap insights...</p>';
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
            insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('gapInsightsRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Get Insights';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('gapInsightsRateLimitReset');
                insightsContainer.innerHTML = '<p>Select a gap size, day of the week, and gap direction to view gap insights.</p>';
            }, 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Gap insights API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from gap insights API:', data.error);
            insightsContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (!data.insights || Object.keys(data.insights).length === 0) {
            console.log('No gap insights found:', data.message || 'No insights returned');
            insightsContainer.innerHTML = `<p>${data.message || 'No gap insights found for the selected criteria'}</p>`;
            return;
        }
        console.log('Rendering gap insights:', data.insights);

        const insights = data.insights;
        const container = document.createElement('div');
        container.className = 'insights-container';
        container.innerHTML = `<h3>QQQ Gap Insights for ${gapSize} ${gapDirection} gaps on ${day}</h3>`;

        // First row: 4 metrics
        const row1 = document.createElement('div');
        row1.className = 'insights-row four-metrics';
        ['gap_fill_rate', 'median_move_before_fill', 'median_max_move_unfilled', 'median_time_to_fill'].forEach(key => {
            const metric = document.createElement('div');
            metric.className = 'insight-metric';
            metric.innerHTML = `
                <div class="metric-name tooltip" title="${insights[key].description}">${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div class="metric-median tooltip" title="The median is often preferred over the average (mean) when dealing with data that contains outliers or is skewed because it provides a more accurate representation of the central tendency in such cases.">${insights[key].median}${key.includes('rate') ? '%' : key.includes('time') ? '' : '%'}</div>
                <div class="metric-average">Avg: ${insights[key].average}${key.includes('rate') ? '%' : key.includes('time') ? '' : '%'}</div>
                <div class="metric-description">${insights[key].description}</div>
            `;
            row1.appendChild(metric);
        });
        container.appendChild(row1);

        // Second row: 2 metrics
        const row2 = document.createElement('div');
        row2.className = 'insights-row two-metrics';
        ['reversal_after_fill_rate', 'median_move_before_reversal'].forEach(key => {
            const metric = document.createElement('div');
            metric.className = 'insight-metric';
            metric.innerHTML = `
                <div class="metric-name tooltip" title="${insights[key].description}">${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div class="metric-median tooltip" title="The median is often preferred over the average (mean) when dealing with data that contains outliers or is skewed because it provides a more accurate representation of the central tendency in such cases.">${insights[key].median}${key.includes('rate') ? '%' : key.includes('time') ? '' : '%'}</div>
                <div class="metric-average">Avg: ${insights[key].average}${key.includes('rate') ? '%' : key.includes('time') ? '' : '%'}</div>
                <div class="metric-description">${insights[key].description}</div>
            `;
            row2.appendChild(metric);
        });
        container.appendChild(row2);

        // Third row: 2 metrics
        const row3 = document.createElement('div');
        row3.className = 'insights-row two-metrics';
        ['median_time_of_low', 'median_time_of_high'].forEach(key => {
            const metric = document.createElement('div');
            metric.className = 'insight-metric';
            metric.innerHTML = `
                <div class="metric-name tooltip" title="${insights[key].description}">${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div class="metric-median">${insights[key].median}</div>
                <div class="metric-description">${insights[key].description}</div>
            `;
            row3.appendChild(metric);
        });
        container.appendChild(row3);

        insightsContainer.innerHTML = '';
        insightsContainer.appendChild(container);
        console.log('Gap insights rendered successfully');

        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `QQQ_${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        insightsContainer.innerHTML = '<p>Failed to load gap insights: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}

function openTab(tabName) {
    console.log(`Opening tab: ${tabName}`);
    const tabs = document.getElementsByClassName('tab-content');
    const buttons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
        buttons[i].classList.remove('active');
    }
    document.getElementById(tabName).style.display = 'block';
    const activeButton = Array.from(buttons).find(button => button.getAttribute('onclick').includes(tabName));
    if (activeButton) {
        activeButton.classList.add('active');
    }
    gtag('event', 'tab_open', {
        'event_category': 'Navigation',
        'event_label': tabName
    });
}