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
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
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
    document.getElementById('ticker-select-events').addEventListener('change', () => loadDates('ticker-select-events', 'date-events'));
});

// Global variables for replay (Market Simulator)
let chartData = null;
let rawChartData = null; // Store raw 1-minute data
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
let rawChartDataGap = null;
let replayIntervalGap = null;
let currentReplayIndexGap = 0;
let isReplayingGap = false;
let isPausedGap = false;

// Replay globals for Events Analysis
let chartDataEvents = null;
let rawChartDataEvents = null;
let replayIntervalEvents = null;
let currentReplayIndexEvents = 0;
let isReplayingEvents = false;
let isPausedEvents = false;

// Replay globals for Earnings Analysis
let chartDataEarnings = null;
let rawChartDataEarnings = null;
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
    const tickerSelectEvents = document.getElementById('ticker-select-events');
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
            tickerSelectEvents.appendChild(option);
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

// Function to aggregate 1-minute candles to higher timeframes
function aggregateCandles(rawData, timeframe) {
    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) {
        return {
            timestamp: [],
            open: [],
            high: [],
            low: [],
            close: [],
            volume: [],
            ticker: rawData.ticker,
            date: rawData.date,
            count: 0
        };
    }

    const df = {
        timestamp: rawData.timestamp.map(ts => new Date(ts)),
        open: rawData.open,
        high: rawData.high,
        low: rawData.low,
        close: rawData.close,
        volume: rawData.volume
    };

    if (timeframe === 1) {
        return {
            timestamp: df.timestamp.map(ts => ts.toISOString().replace('T', ' ').substring(0, 19)),
            open: df.open,
            high: df.high,
            low: df.low,
            close: df.close,
            volume: df.volume,
            ticker: rawData.ticker,
            date: rawData.date,
            count: df.timestamp.length
        };
    }

    const aggregated = {
        timestamp: [],
        open: [],
        high: [],
        low: [],
        close: [],
        volume: []
    };

    let currentCandle = null;
    const timeframeMs = timeframe * 60 * 1000;

    for (let i = 0; i < df.timestamp.length; i++) {
        const ts = df.timestamp[i];
        const candleStart = new Date(Math.floor(ts.getTime() / timeframeMs) * timeframeMs);

        if (!currentCandle || candleStart.getTime() !== currentCandle.startTime.getTime()) {
            if (currentCandle) {
                aggregated.timestamp.push(currentCandle.startTime.toISOString().replace('T', ' ').substring(0, 19));
                aggregated.open.push(currentCandle.open);
                aggregated.high.push(currentCandle.high);
                aggregated.low.push(currentCandle.low);
                aggregated.close.push(currentCandle.close);
                aggregated.volume.push(currentCandle.volume);
            }
            currentCandle = {
                startTime: candleStart,
                open: df.open[i],
                high: df.high[i],
                low: df.low[i],
                close: df.close[i],
                volume: df.volume[i]
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, df.high[i]);
            currentCandle.low = Math.min(currentCandle.low, df.low[i]);
            currentCandle.close = df.close[i];
            currentCandle.volume += df.volume[i];
        }
    }

    if (currentCandle) {
        aggregated.timestamp.push(currentCandle.startTime.toISOString().replace('T', ' ').substring(0, 19));
        aggregated.open.push(currentCandle.open);
        aggregated.high.push(currentCandle.high);
        aggregated.low.push(currentCandle.low);
        aggregated.close.push(currentCandle.close);
        aggregated.volume.push(currentCandle.volume);
    }

    return {
        timestamp: aggregated.timestamp,
        open: aggregated.open,
        high: aggregated.high,
        low: aggregated.low,
        close: aggregated.close,
        volume: aggregated.volume,
        ticker: rawData.ticker,
        date: rawData.date,
        count: aggregated.timestamp.length
    };
}

async function loadChart(event, tabId) {
    event.preventDefault();
    // Map tabId to configuration
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

    // Replay controls
    const replayControls = document.getElementById(replayControlsId);
    const playButton = document.getElementById(`play-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

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
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}${restrictHours ? '&restrict_hours=true' : ''}`;
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

        // Store raw 1-minute data and aggregated data
        const rawData = data.chart_data;
        if (replayPrefix === '') {
            rawChartData = rawData;
            chartData = aggregateCandles(rawData, timeframe);
            currentReplayIndex = 0;
            isReplaying = false;
            isPaused = false;
            if (replayInterval) clearInterval(replayInterval);
            openPosition = null;
            tradeHistory = [];
            updateTradeSummary();
        } else if (replayPrefix === 'gap') {
            rawChartDataGap = rawData;
            chartDataGap = aggregateCandles(rawData, timeframe);
            currentReplayIndexGap = 0;
            isReplayingGap = false;
            isPausedGap = false;
            if (replayIntervalGap) clearInterval(replayIntervalGap);
        } else if (replayPrefix === 'events') {
            rawChartDataEvents = rawData;
            chartDataEvents = aggregateCandles(rawData, timeframe);
            currentReplayIndexEvents = 0;
            isReplayingEvents = false;
            isPausedEvents = false;
            if (replayIntervalEvents) clearInterval(replayIntervalEvents);
        } else if (replayPrefix === 'earnings') {
            rawChartDataEarnings = rawData;
            chartDataEarnings = aggregateCandles(rawData, timeframe);
            currentReplayIndexEarnings = 0;
            isReplayingEarnings = false;
            isPausedEarnings = false;
            if (replayIntervalEarnings) clearInterval(replayIntervalEarnings);
        }

        // Render chart with aggregated data
        const candlestickTrace = {
            x: chartData[replayPrefix].timestamp,
            open: chartData[replayPrefix].open,
            high: chartData[replayPrefix].high,
            low: chartData[replayPrefix].low,
            close: chartData[replayPrefix].close,
            type: 'candlestick',
            name: chartData[replayPrefix].ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        const volumeTrace = {
            x: chartData[replayPrefix].timestamp,
            y: chartData[replayPrefix].volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        const layout = {
            title: `${chartData[replayPrefix].ticker} ${timeframe}-Minute Candlestick Chart - ${chartData[replayPrefix].date}${restrictHours ? ' (Regular Hours)' : ''}`,
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
        if (replayPrefix === '') {
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
    if (!isReplaying || !chartData || currentReplayIndex <= 0 || currentReplayIndex > chartData.count) return;
    if (openPosition) {
        alert('Close the current position before opening a new one.');
        return;
    }
    openPosition = {
        type: 'buy',
        price: chartData.close[currentReplayIndex - 1],
        shares: POSITION_SIZE,
        timestamp: chartData.timestamp[currentReplayIndex - 1]
    };
    console.log(`Placed buy trade: ${JSON.stringify(openPosition)}`);
    updateTradeSummary();
    gtag('event', 'trade_placed', {
        'event_category': 'Trade Simulator',
        'event_label': `Buy_${chartData.ticker}_${chartData.date}_${openPosition.timestamp}`
    });
}

function placeSellTrade() {
    if (!isReplaying || !chartData || currentReplayIndex <= 0 || currentReplayIndex > chartData.count) return;
    if (openPosition) {
        // Close existing position
        const exitPrice = chartData.close[currentReplayIndex - 1];
        const pnl = openPosition.type === 'buy'
            ? (exitPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - exitPrice) * openPosition.shares;
        tradeHistory.push({
            type: openPosition.type,
            entryPrice: openPosition.price,
            exitPrice: exitPrice,
            shares: openPosition.shares,
            timestamp: chartData.timestamp[currentReplayIndex - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        openPosition = null;
        console.log(`Closed position with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary();
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${tradeHistory[tradeHistory.length - 1].type}_${chartData.ticker}_${chartData.date}_${tradeHistory[tradeHistory.length - 1].timestamp}`
        });
    } else {
        // Open new sell position
        openPosition = {
            type: 'sell',
            price: chartData.close[currentReplayIndex - 1],
            shares: POSITION_SIZE,
            timestamp: chartData.timestamp[currentReplayIndex - 1]
        };
        console.log(`Placed sell trade: ${JSON.stringify(openPosition)}`);
        updateTradeSummary();
        gtag('event', 'trade_placed', {
            'event_category': 'Trade Simulator',
            'event_label': `Sell_${chartData.ticker}_${chartData.date}_${openPosition.timestamp}`
        });
    }
}

function updateTradeSummary() {
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryEl = document.getElementById('trade-history');
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    // Update button states
    buyButton.disabled = !isReplaying || currentReplayIndex <= 0 || currentReplayIndex > chartData.count || openPosition?.type === 'sell';
    sellButton.disabled = !isReplaying || currentReplayIndex <= 0 || currentReplayIndex > chartData.count;

    // Update position status
    if (openPosition) {
        const currentPrice = currentReplayIndex > 0 ? chartData.close[currentReplayIndex - 1] : openPosition.price;
        const unrealizedPnl = openPosition.type === 'buy'
            ? (currentPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - currentPrice) * openPosition.shares;
        positionStatus.textContent = `Open ${openPosition.type.toUpperCase()} Position: ${openPosition.shares} shares @ $${openPosition.price.toFixed(2)}`;
        tradePnl.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
    } else {
        positionStatus.textContent = 'No open position';
        tradePnl.textContent = `Realized P/L: $${tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2)}`;
    }

    // Update trade history
    if (tradeHistory.length === 0) {
        tradeHistoryEl.textContent = 'Trade History: None';
    } else {
        const historyText = tradeHistory.map(trade => 
            `${trade.type.toUpperCase()} ${trade.shares} shares @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} at ${trade.timestamp.split(' ')[1]} (P/L: $${trade.pnl.toFixed(2)})`
        ).join('; ');
        tradeHistoryEl.textContent = `Trade History: ${historyText}`;
    }
}

function getReplayConfig(section) {
    const configs = {
        '': {
            chartData: () => chartData,
            rawChartData: () => rawChartData,
            setChartData: (data) => { chartData = data; },
            setRawChartData: (data) => { rawChartData = data; },
            replayInterval: () => replayInterval,
            setReplayInterval: (interval) => { replayInterval = interval; },
            currentReplayIndex: () => currentReplayIndex,
            setCurrentReplayIndex: (index) => { currentReplayIndex = index; },
            isReplaying: () => isReplaying,
            setIsReplaying: (state) => { isReplaying = state; },
            isPaused: () => isPaused,
            setIsPaused: (state) => { isPaused = state; },
            chartContainerId: 'plotly-chart',
            playButtonId: 'play-replay',
            pauseButtonId: 'pause-replay',
                       startOverButtonId: 'start-over-replay',
            prevButtonId: 'prev-candle',
            nextButtonId: 'next-candle',
            replaySpeedId: 'replay-speed',
            replayStartTimeId: 'replay-start-time',
            replayTimestampId: 'replay-timestamp',
            restrictHours: false
        },
        'gap': {
            chartData: () => chartDataGap,
            rawChartData: () => rawChartDataGap,
            setChartData: (data) => { chartDataGap = data; },
            setRawChartData: (data) => { rawChartDataGap = data; },
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
            replaySpeedId: 'replay-speed-gap',
            replayStartTimeId: 'replay-start-time-gap',
            replayTimestampId: 'replay-timestamp-gap',
            restrictHours: true
        },
        'events': {
            chartData: () => chartDataEvents,
            rawChartData: () => rawChartDataEvents,
            setChartData: (data) => { chartDataEvents = data; },
            setRawChartData: (data) => { rawChartDataEvents = data; },
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
            replaySpeedId: 'replay-speed-events',
            replayStartTimeId: 'replay-start-time-events',
            replayTimestampId: 'replay-timestamp-events',
            restrictHours: false
        },
        'earnings': {
            chartData: () => chartDataEarnings,
            rawChartData: () => rawChartDataEarnings,
            setChartData: (data) => { chartDataEarnings = data; },
            setRawChartData: (data) => { rawChartDataEarnings = data; },
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
            replaySpeedId: 'replay-speed-earnings',
            replayStartTimeId: 'replay-start-time-earnings',
            replayTimestampId: 'replay-timestamp-earnings',
            restrictHours: true
        }
    };
    return configs[section] || configs[''];
}

function updateReplaySpeed(section) {
    const config = getReplayConfig(section);
    const speedSelect = document.getElementById(config.replaySpeedId);
    const speed = parseFloat(speedSelect.value);
    console.log(`Updating replay speed for ${section || 'market-simulator'} to ${speed}x`);

    // If replay is active, restart with new speed
    if (config.isReplaying()) {
        config.setIsReplaying(false);
        if (config.replayInterval()) {
            clearInterval(config.replayInterval());
            config.setReplayInterval(null);
        }
        startReplay(section);
    }
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) {
        console.error(`No chart data available for replay in ${section || 'market-simulator'}`);
        return;
    }

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const startTimeInput = document.getElementById(config.replayStartTimeId);
    const timeframeSelect = document.getElementById(section ? `timeframe-select-${section}` : 'timeframe-select');
    const timeframe = parseInt(timeframeSelect.value);
    const speedSelect = document.getElementById(config.replaySpeedId);
    const speed = parseFloat(speedSelect.value);

    // Parse start time if provided
    let startIndex = 0;
    if (startTimeInput.value) {
        const startTime = new Date(`${rawData.date} ${startTimeInput.value}`);
        startIndex = rawData.timestamp.findIndex(ts => new Date(ts) >= startTime);
        if (startIndex === -1) {
            alert('Start time is after the last available data point. Starting from the beginning.');
            startIndex = 0;
        }
    }

    config.setCurrentReplayIndex(startIndex);
    config.setIsReplaying(true);
    config.setIsPaused(false);

    // Update UI
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = false;
    prevButton.disabled = false;
    nextButton.disabled = false;
    if (section === '') {
        document.getElementById('buy-trade').disabled = false;
        document.getElementById('sell-trade').disabled = openPosition?.type === 'buy';
    }

    // Start replay
    updateChartToIndex(section, startIndex);
    const intervalMs = 1000 / speed; // Adjust interval based on speed (1x = 1000ms per minute)
    config.setReplayInterval(setInterval(() => {
        let currentIndex = config.currentReplayIndex();
        if (currentIndex >= rawData.timestamp.length - 1) {
            config.setIsReplaying(false);
            clearInterval(config.replayInterval());
            config.setReplayInterval(null);
            playButton.disabled = true;
            pauseButton.disabled = true;
            startOverButton.disabled = false;
            prevButton.disabled = false;
            nextButton.disabled = true;
            if (section === '') {
                document.getElementById('buy-trade').disabled = true;
                document.getElementById('sell-trade').disabled = true;
            }
            console.log(`Replay ended for ${section || 'market-simulator'}`);
            return;
        }
        config.setCurrentReplayIndex(currentIndex + 1);
        updateChartToIndex(section, currentIndex + 1);
    }, intervalMs));

    console.log(`Started replay for ${section || 'market-simulator'} at speed ${speed}x from index ${startIndex}`);
    gtag('event', 'replay_start', {
        'event_category': 'Replay',
        'event_label': `${section || 'market-simulator'}_${rawData.ticker}_${rawData.date}_${startTimeInput.value || 'beginning'}`,
        'speed': speed
    });
}

function pauseReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying() || config.isPaused()) return;

    config.setIsPaused(true);
    if (config.replayInterval()) {
        clearInterval(config.replayInterval());
        config.setReplayInterval(null);
    }

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    playButton.disabled = false;
    pauseButton.disabled = true;

    console.log(`Paused replay for ${section || 'market-simulator'} at index ${config.currentReplayIndex()}`);
    gtag('event', 'replay_pause', {
        'event_category': 'Replay',
        'event_label': `${section || 'market-simulator'}_${config.rawChartData().ticker}_${config.rawChartData().date}_${config.currentReplayIndex()}`
    });
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) {
        console.error(`No chart data available to restart replay in ${section || 'market-simulator'}`);
        return;
    }

    config.setCurrentReplayIndex(0);
    config.setIsReplaying(false);
    config.setIsPaused(false);
    if (config.replayInterval()) {
        clearInterval(config.replayInterval());
        config.setReplayInterval(null);
    }

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    if (section === '') {
        document.getElementById('buy-trade').disabled = true;
        document.getElementById('sell-trade').disabled = true;
        openPosition = null;
        tradeHistory = [];
        updateTradeSummary();
    }
    document.getElementById(config.replayTimestampId).textContent = 'Current Time: --:--:--';

    // Reset chart to empty
    Plotly.newPlot(config.chartContainerId, [], {
        title: `${rawData.ticker} ${section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Market Simulator'} - Select timeframe and load chart`,
        xaxis: { title: 'Time' },
        yaxis: { title: 'Price' },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' }
    });

    console.log(`Restarted replay for ${section || 'market-simulator'}`);
    gtag('event', 'replay_start_over', {
        'event_category': 'Replay',
        'event_label': `${section || 'market-simulator'}_${rawData.ticker}_${rawData.date}`
    });
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) return;

    let currentIndex = config.currentReplayIndex();
    if (currentIndex > 0) {
        config.setCurrentReplayIndex(currentIndex - 1);
        updateChartToIndex(section, currentIndex - 1);
        console.log(`Moved to previous candle for ${section || 'market-simulator'}, index ${currentIndex - 1}`);
        gtag('event', 'replay_prev_candle', {
            'event_category': 'Replay',
            'event_label': `${section || 'market-simulator'}_${rawData.ticker}_${rawData.date}_${currentIndex - 1}`
        });
    }

    // Update button states
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= rawData.timestamp.length - 1;
    if (section === '') {
        document.getElementById('buy-trade').disabled = config.currentReplayIndex() <= 0;
        document.getElementById('sell-trade').disabled = config.currentReplayIndex() <= 0 || openPosition?.type === 'buy';
        updateTradeSummary();
    }
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    if (!rawData || !rawData.timestamp || rawData.timestamp.length === 0) return;

    let currentIndex = config.currentReplayIndex();
    if (currentIndex < rawData.timestamp.length - 1) {
        config.setCurrentReplayIndex(currentIndex + 1);
        updateChartToIndex(section, currentIndex + 1);
        console.log(`Moved to next candle for ${section || 'market-simulator'}, index ${currentIndex + 1}`);
        gtag('event', 'replay_next_candle', {
            'event_category': 'Replay',
            'event_label': `${section || 'market-simulator'}_${rawData.ticker}_${rawData.date}_${currentIndex + 1}`
        });
    }

    // Update button states
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= rawData.timestamp.length - 1;
    if (section === '') {
        document.getElementById('buy-trade').disabled = config.currentReplayIndex() <= 0;
        document.getElementById('sell-trade').disabled = config.currentReplayIndex() <= 0 || openPosition?.type === 'buy';
        updateTradeSummary();
    }
}

function updateChartToIndex(section, index) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    const timeframeSelect = document.getElementById(section ? `timeframe-select-${section}` : 'timeframe-select');
    const timeframe = parseInt(timeframeSelect.value);
    if (!rawData || !rawData.timestamp || index < 0 || index >= rawData.timestamp.length) {
        console.error(`Invalid data or index for ${section || 'market-simulator'}: index=${index}`);
        return;
    }

    // Slice raw data up to the current index
    const slicedData = {
        timestamp: rawData.timestamp.slice(0, index + 1),
        open: rawData.open.slice(0, index + 1),
        high: rawData.high.slice(0, index + 1),
        low: rawData.low.slice(0, index + 1),
        close: rawData.close.slice(0, index + 1),
        volume: rawData.volume.slice(0, index + 1),
        ticker: rawData.ticker,
        date: rawData.date
    };

    // Aggregate to the selected timeframe
    const aggregatedData = aggregateCandles(slicedData, timeframe);

    // Update chart
    const candlestickTrace = {
        x: aggregatedData.timestamp,
        open: aggregatedData.open,
        high: aggregatedData.high,
        low: aggregatedData.low,
        close: aggregatedData.close,
        type: 'candlestick',
        name: aggregatedData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: aggregatedData.timestamp,
        y: aggregatedData.volume,
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${aggregatedData.ticker} ${timeframe}-Minute Candlestick Chart - ${aggregatedData.date}${config.restrictHours ? ' (Regular Hours)' : ''}`,
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

    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, {
        responsive: true
    });

    // Update current time display
    const currentTime = new Date(rawData.timestamp[index]).toLocaleTimeString('en-US', { hour12: false });
    document.getElementById(config.replayTimestampId).textContent = `Current Time: ${currentTime}`;

    if (section === '') {
        updateTradeSummary();
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size').value;
    const gapDirection = document.getElementById('gap-direction').value;
    const dayOfWeek = document.getElementById('day-of-week').value;
    const dateSelect = document.getElementById('date-gap');
    dateSelect.disabled = true;
    dateSelect.innerHTML = '<option value="">Loading dates...</option>';
    console.log(`Fetching gap dates for gap_size=${gapSize}, gap_direction=${gapDirection}, day=${dayOfWeek}`);
    try {
        const url = `/api/gaps?gap_size=${encodeURIComponent(gapSize)}&gap_direction=${encodeURIComponent(gapDirection)}&day=${encodeURIComponent(dayOfWeek)}`;
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
            dateSelect.innerHTML = `<option value="">${data.error}</option>`;
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.message) {
            console.log('No gap dates found:', data.message);
            dateSelect.innerHTML = `<option value="">${data.message}</option>`;
            dateSelect.disabled = true;
            return;
        }
        console.log(`Fetched ${data.dates.length} gap dates`);
        dateSelect.innerHTML = '<option value="">Select a date</option>';
        data.dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date;
            dateSelect.appendChild(option);
        });
        dateSelect.disabled = false;
        gtag('event', 'gap_dates_load', {
            'event_category': 'Gap Analysis',
            'event_label': `${gapSize}_${gapDirection}_${dayOfWeek}`
        });
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        dateSelect.innerHTML = '<option value="">Error loading dates</option>';
        alert('Failed to load gap dates: ' + error.message);
    }
}

async function loadEventDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;
    const dateSelect = document.getElementById('date-events');
    dateSelect.disabled = true;
    dateSelect.innerHTML = '<option value="">Loading dates...</option>';
    let url;
    if (filterType === 'year') {
        const year = document.getElementById('year-select').value;
        const eventType = document.getElementById('event-type-select').value;
        console.log(`Fetching event dates for event_type=${eventType}, year=${year}`);
        url = `/api/events?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
    } else {
        const eventType = document.getElementById('bin-event-type-select').value;
        const bin = document.getElementById('bin-select').value;
        console.log(`Fetching economic event dates for event_type=${eventType}, bin=${bin}`);
        url = `/api/economic_events?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
    }
    console.log('Fetching URL:', url);
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
            alert(data.error);
            dateSelect.innerHTML = `<option value="">${data.error}</option>`;
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.message) {
            console.log('No event dates found:', data.message);
            dateSelect.innerHTML = `<option value="">${data.message}</option>`;
            dateSelect.disabled = true;
            return;
        }
        console.log(`Fetched ${data.dates.length} event dates`);
        dateSelect.innerHTML = '<option value="">Select a date</option>';
        data.dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date;
            dateSelect.appendChild(option);
        });
        dateSelect.disabled = false;
        gtag('event', 'event_dates_load', {
            'event_category': 'Events Analysis',
            'event_label': filterType === 'year' ? `year_${document.getElementById('year-select').value}_${document.getElementById('event-type-select').value}` : `bin_${document.getElementById('bin-event-type-select').value}_${document.getElementById('bin-select').value}`
        });
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        dateSelect.innerHTML = '<option value="">Error loading dates</option>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    const dateSelect = document.getElementById('date-gap');
    dateSelect.disabled = true;
    dateSelect.innerHTML = '<option value="">Loading dates...</option>';
    let url;
    if (filterType === 'ticker-outcome') {
        const ticker = document.getElementById('earnings-ticker-select').value;
        const bin = document.getElementById('earnings-bin-select').value;
        console.log(`Fetching earnings dates for ticker=${ticker}, bin=${bin}`);
        url = `/api/earnings_by_bin?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`;
    } else {
        const ticker = document.getElementById('earnings-ticker-only-select').value;
        console.log(`Fetching earnings dates for ticker=${ticker}`);
        url = `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
    }
    console.log('Fetching URL:', url);
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
            alert(data.error);
            dateSelect.innerHTML = `<option value="">${data.error}</option>`;
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.message) {
            console.log('No earnings dates found:', data.message);
            dateSelect.innerHTML = `<option value="">${data.message}</option>`;
            dateSelect.disabled = true;
            return;
        }
        console.log(`Fetched ${data.dates.length} earnings dates`);
        dateSelect.innerHTML = '<option value="">Select a date</option>';
        data.dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date;
            dateSelect.appendChild(option);
        });
        dateSelect.disabled = false;
        gtag('event', 'earnings_dates_load', {
            'event_category': 'Earnings Analysis',
            'event_label': filterType === 'ticker-outcome' ? `${document.getElementById('earnings-ticker-select').value}_${document.getElementById('earnings-bin-select').value}` : `${document.getElementById('earnings-ticker-only-select').value}`
        });
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        dateSelect.innerHTML = '<option value="">Error loading dates</option>';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-insights').value;
    const gapDirection = document.getElementById('gap-direction-insights').value;
    const dayOfWeek = document.getElementById('day-of-week-insights').value;
    const insightsContainer = document.getElementById('gap-insights-results');
    insightsContainer.innerHTML = '<p>Loading insights...</p>';
    console.log(`Fetching gap insights for gap_size=${gapSize}, gap_direction=${gapDirection}, day=${dayOfWeek}`);
    try {
        const url = `/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&gap_direction=${encodeURIComponent(gapDirection)}&day=${encodeURIComponent(dayOfWeek)}`;
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
            insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.message) {
            console.log('No insights found:', data.message);
            insightsContainer.innerHTML = `<p>${data.message}</p>`;
            return;
        }
        console.log('Fetched gap insights:', data.insights);
        insightsContainer.innerHTML = '';
        for (const [key, value] of Object.entries(data.insights)) {
            const insightDiv = document.createElement('div');
            insightDiv.innerHTML = `
                <h3>${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h3>
                <p>Median: ${value.median}</p>
                <p>Average: ${value.average}</p>
                <p>${value.description}</p>
            `;
            insightsContainer.appendChild(insightDiv);
        }
        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `${gapSize}_${gapDirection}_${dayOfWeek}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        insightsContainer.innerHTML = '<p>Failed to load insights: ' + error.message + '</p>';
        alert('Failed to load gap insights: ' + error.message);
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
        if (data.error) {
            console.error('Error fetching years:', data.error);
            yearSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        console.log(`Fetched ${data.years.length} years`);
        yearSelect.innerHTML = '<option value="">Select a year</option>';
        data.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        yearSelect.disabled = false;
        gtag('event', 'years_load', {
            'event_category': 'Events Analysis',
            'event_label': 'load_years'
        });
    } catch (error) {
        console.error('Error loading years:', error.message);
        yearSelect.innerHTML = '<option value="">Error loading years</option>';
        alert('Failed to load years: ' + error.message);
    }
}