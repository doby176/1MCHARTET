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
    document.getElementById('stock-form-earnings').addEventListener('submit', (e) => loadChart(e, 'earnings-analysis'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners (Market Simulator)
    document.getElementById('play-replay').addEventListener('click', () => startReplay(''));
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay(''));
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay(''));
    document.getElementById('restart-replay').addEventListener('click', () => restartReplay(''));
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
    document.getElementById('restart-replay-gap').addEventListener('click', () => restartReplay('gap'));
    document.getElementById('prev-candle-gap').addEventListener('click', () => prevCandle('gap'));
    document.getElementById('next-candle-gap').addEventListener('click', () => nextCandle('gap'));
    document.getElementById('replay-speed-gap').addEventListener('change', () => updateReplaySpeed('gap'));

    // Replay control listeners for Events Analysis
    document.getElementById('play-replay-events').addEventListener('click', () => startReplay('events'));
    document.getElementById('pause-replay-events').addEventListener('click', () => pauseReplay('events'));
    document.getElementById('start-over-replay-events').addEventListener('click', () => startOverReplay('events'));
    document.getElementById('restart-replay-events').addEventListener('click', () => restartReplay('events'));
    document.getElementById('prev-candle-events').addEventListener('click', () => prevCandle('events'));
    document.getElementById('next-candle-events').addEventListener('click', () => nextCandle('events'));
    document.getElementById('replay-speed-events').addEventListener('change', () => updateReplaySpeed('events'));

    // Replay control listeners for Earnings Analysis
    document.getElementById('play-replay-earnings').addEventListener('click', () => startReplay('earnings'));
    document.getElementById('pause-replay-earnings').addEventListener('click', () => pauseReplay('earnings'));
    document.getElementById('start-over-replay-earnings').addEventListener('click', () => startOverReplay('earnings'));
    document.getElementById('restart-replay-earnings').addEventListener('click', () => restartReplay('earnings'));
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

    // Initialize ticker selects for date loading
    document.getElementById('ticker-select').addEventListener('change', () => loadDates('ticker-select', 'date'));
    document.getElementById('ticker-select-gap').addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
    document.getElementById('ticker-select-events').addEventListener('change', () => loadDates('ticker-select-events', 'date-events'));
    document.getElementById('earnings-ticker-select').addEventListener('change', () => loadDates('earnings-ticker-select', 'date-earnings'));

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            gtag('event', 'tab_switch', {
                'event_category': 'Navigation',
                'event_label': tab.dataset.tab
            });
        });
    });
});

// Global variables for replay (Market Simulator)
let chartData = null;
let replayInterval = null;
let currentReplayIndex = 0;
let isReplaying = false;
let isPaused = false;
let aggregatedData = null;
let currentMinuteIndex = 0;
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
let aggregatedDataGap = null;
let currentMinuteIndexGap = 0;

// Replay globals for Events Analysis
let chartDataEvents = null;
let replayIntervalEvents = null;
let currentReplayIndexEvents = 0;
let isReplayingEvents = false;
let isPausedEvents = false;
let aggregatedDataEvents = null;
let currentMinuteIndexEvents = 0;

// Replay globals for Earnings Analysis
let chartDataEarnings = null;
let replayIntervalEarnings = null;
let currentReplayIndexEarnings = 0;
let isReplayingEarnings = false;
let isPausedEarnings = false;
let aggregatedDataEarnings = null;
let currentMinuteIndexEarnings = 0;

// Bin options for each event type
const binOptions = {
    CPI: ['<0%', '0-1%', '1-2%', '2-3%', '3-5%', '>5%'],
    PPI: ['<0%', '0-2%', '2-4%', '4-8%', '>8%'],
    NFP: ['<0K', '0-100K', '100-200K', '200-300K', '>300K'],
    FOMC: ['0-1%', '1-2%', '2-3%', '3-4%', '>4%']
};

// Earnings outcome options
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
        option.value = outcome.value.toLowerCase().replace(' ', '-');
        option.textContent = outcome.text;
        earningsBinSelect.appendChild(option);
    });
}

function toggleFilterSection() {
    const eventTypeFilter = document.getElementById('event-type-filter');
    const tickerOnlyFilter = document.getElementById('ticker-only-filter-events');
    const eventTypeSection = document.getElementById('event-type-filter');
    const tickerOnlySection = document.getElementById('ticker-only-filter-events');
    if (eventTypeFilter.checked) {
        eventTypeSection.classList.add('active');
        tickerOnlySection.classList.remove('active');
    } else {
        eventTypeSection.classList.remove('active');
        tickerOnlySection.classList.add('active');
    }
}

function toggleEarningsFilterSection() {
    const tickerOutcomeFilter = document.getElementById('ticker-outcome-filter');
    const tickerOnlyFilter = document.getElementById('ticker-only-filter-earnings');
    const tickerOutcomeSection = document.getElementById('ticker-outcome-filter');
    const tickerOnlySection = document.getElementById('ticker-only-filter');
    if (tickerOutcomeFilter.checked) {
        tickerOutcomeSection.classList.add('active');
        tickerOnlySection.classList.remove('active');
    } else {
        tickerOutcomeSection.classList.remove('active');
        tickerOnlySection.classList.add('active');
    }
}

async function loadBinOptions() {
    const eventTypeSelect = document.getElementById('event-type');
    eventTypeSelect.addEventListener('change', async () => {
        const eventType = eventTypeSelect.value;
        const eventBinSelect = document.getElementById('event-bin');
        eventBinSelect.innerHTML = '<option value="">Select outcome</option>';
        if (eventType && binOptions[eventType]) {
            binOptions[eventType].forEach(bin => {
                const option = document.createElement('option');
                option.value = bin;
                option.textContent = bin;
                eventBinSelect.appendChild(option);
            });
        }
    });
}

async function loadTickers() {
    try {
        const response = await fetch('/api/tickers');
        const data = await response.json();
        if (data.error) {
            console.error('Error loading tickers:', data.error);
            alert('Failed to load tickers: ' + data.error);
            return;
        }
        const tickerSelects = [
            'ticker-select',
            'ticker-select-gap',
            'ticker-select-gap-dates',
            'ticker-select-events',
            'ticker-select-event-dates',
            'ticker-select-event-dates-only',
            'earnings-ticker-select',
            'earnings-ticker-only-select'
        ];
        tickerSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select a ticker</option>';
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error loading tickers:', error);
        alert('Failed to load tickers. Please try again later.');
    }
}

async function loadEarningsTickers() {
    try {
        const response = await fetch('/api/earnings/tickers');
        const data = await response.json();
        if (data.error) {
            console.error('Error loading earnings tickers:', data.error);
            alert('Failed to load earnings tickers: ' + data.error);
            return;
        }
        const earningsTickerSelects = ['earnings-ticker-select', 'earnings-ticker-only-select'];
        earningsTickerSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Select a ticker</option>';
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error loading earnings tickers:', error);
        alert('Failed to load earnings tickers. Please try again later.');
    }
}

async function loadDates(tickerSelectId, dateInputId) {
    const ticker = document.getElementById(tickerSelectId).value;
    const dateInput = document.getElementById(dateInputId);
    dateInput.value = '';
    dateInput.disabled = true;
    if (!ticker) return;
    try {
        const response = await fetch(`/api/valid_dates?ticker=${encodeURIComponent(ticker)}`);
        const data = await response.json();
        if (data.error) {
            console.error('Error loading dates:', data.error);
            alert('Failed to load dates: ' + data.error);
            return;
        }
        dateInput.disabled = false;
        dateInput.setAttribute('min', data.dates[0] || '');
        dateInput.setAttribute('max', data.dates[data.dates.length - 1] || '');
    } catch (error) {
        console.error('Error loading dates:', error);
        alert('Failed to load dates. Please try again later.');
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const ticker = document.getElementById('ticker-select-gap-dates').value;
    const gapType = document.getElementById('gap-type').value;
    const gapDatesList = document.getElementById('gap-dates-list');
    gapDatesList.innerHTML = '';
    document.getElementById('gap-dates').innerHTML = '<p>Loading gap dates...</p>';
    if (!ticker || !gapType) {
        document.getElementById('gap-dates').innerHTML = '<p>Please select a ticker and gap type.</p>';
        return;
    }
    try {
        const response = await fetch(`/api/gaps?ticker=${encodeURIComponent(ticker)}&gap_type=${encodeURIComponent(gapType)}`);
        const data = await response.json();
        if (data.error) {
            console.error('Error loading gap dates:', data.error);
            document.getElementById('gap-dates').innerHTML = `<p>${data.error}</p>`;
            return;
        }
        document.getElementById('gap-dates').innerHTML = '';
        if (data.dates.length === 0) {
            gapDatesList.innerHTML = '<li>No gap dates found.</li>';
            return;
        }
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('ticker-select-gap').value = ticker;
                document.getElementById('date-gap').value = date;
                document.getElementById('stock-form-gap').dispatchEvent(new Event('submit'));
            });
            gapDatesList.appendChild(li);
        });
        gtag('event', 'gap_dates_load', {
            'event_category': 'Gap Analysis',
            'event_label': `${ticker}_${gapType}`
        });
    } catch (error) {
        console.error('Error loading gap dates:', error);
        document.getElementById('gap-dates').innerHTML = '<p>Failed to load gap dates. Please try again later.</p>';
        alert('Failed to load gap dates: ' + error.message);
    }
}

async function loadYears() {
    try {
        const response = await fetch('/api/years');
        const data = await response.json();
        if (data.error) {
            console.error('Error loading years:', data.error);
            alert('Failed to load years: ' + data.error);
            return;
        }
        const yearSelect = document.getElementById('year-select');
        yearSelect.innerHTML = '<option value="">Select a year</option>';
        data.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading years:', error);
        alert('Failed to load years. Please try again later.');
    }
}

async function loadEventDates(event) {
    event.preventDefault();
    const eventTypeFilter = document.getElementById('event-type-filter').checked;
    const ticker = eventTypeFilter
        ? document.getElementById('ticker-select-event-dates').value
        : document.getElementById('ticker-select-event-dates-only').value;
    const eventType = eventTypeFilter ? document.getElementById('event-type').value : '';
    const eventBin = eventTypeFilter ? document.getElementById('event-bin').value : '';
    const eventsDatesList = document.getElementById('events-dates-list');
    eventsDatesList.innerHTML = '';
    document.getElementById('events-dates').innerHTML = '<p>Loading event dates...</p>';
    if (!ticker || (eventTypeFilter && (!eventType || !eventBin))) {
        document.getElementById('events-dates').innerHTML = '<p>Please select a ticker and, if filtering by event type, an event type and outcome.</p>';
        return;
    }
    try {
        const url = eventTypeFilter
            ? `/api/events?ticker=${encodeURIComponent(ticker)}&event_type=${encodeURIComponent(eventType)}&event_bin=${encodeURIComponent(eventBin)}`
            : `/api/events?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
            console.error('Error loading event dates:', data.error);
            document.getElementById('events-dates').innerHTML = `<p>${data.error}</p>`;
            return;
        }
        document.getElementById('events-dates').innerHTML = '';
        if (data.dates.length === 0) {
            eventsDatesList.innerHTML = '<li>No event dates found.</li>';
            return;
        }
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('ticker-select-events').value = ticker;
                document.getElementById('date-events').value = date;
                document.getElementById('stock-form-events').dispatchEvent(new Event('submit'));
            });
            eventsDatesList.appendChild(li);
        });
        gtag('event', 'event_dates_load', {
            'event_category': 'Events Analysis',
            'event_label': `${ticker}_${eventType || 'all'}_${eventBin || 'all'}`
        });
    } catch (error) {
        console.error('Error loading event dates:', error);
        document.getElementById('events-dates').innerHTML = '<p>Failed to load event dates. Please try again later.</p>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const tickerOutcomeFilter = document.getElementById('ticker-outcome-filter').checked;
    const ticker = tickerOutcomeFilter
        ? document.getElementById('earnings-ticker-select').value
        : document.getElementById('earnings-ticker-only-select').value;
    const bin = tickerOutcomeFilter ? document.getElementById('earnings-bin-select').value : '';
    const earningsDatesList = document.getElementById('earnings-dates-list');
    earningsDatesList.innerHTML = '';
    document.getElementById('earnings-dates').innerHTML = '<p>Loading earnings dates...</p>';
    if (!ticker) {
        document.getElementById('earnings-dates').innerHTML = '<p>Please select a ticker.</p>';
        return;
    }
    try {
        const url = tickerOutcomeFilter
            ? `/api/earnings?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`
            : `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
            console.error('Error loading earnings dates:', data.error);
            document.getElementById('earnings-dates').innerHTML = `<p>${data.error}</p>`;
            return;
        }
        document.getElementById('earnings-dates').innerHTML = '';
        if (data.dates.length === 0) {
            earningsDatesList.innerHTML = '<li>No earnings dates found.</li>';
            return;
        }
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('earnings-ticker-select').value = ticker;
                document.getElementById('date-earnings').value = date;
                document.getElementById('stock-form-earnings').dispatchEvent(new Event('submit'));
            });
            earningsDatesList.appendChild(li);
        });
        gtag('event', 'earnings_dates_load', {
            'event_category': 'Earnings Analysis',
            'event_label': `${ticker}_${bin || 'all'}`
        });
    } catch (error) {
        console.error('Error loading earnings dates:', error);
        document.getElementById('earnings-dates').innerHTML = '<p>Failed to load earnings dates. Please try again later.</p>';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const year = document.getElementById('year-select').value;
    const gapType = document.getElementById('gap-type-insights').value;
    const gapInsightsList = document.getElementById('gap-insights-list');
    gapInsightsList.innerHTML = '';
    document.getElementById('gap-insights').innerHTML = '<p>Loading gap insights...</p>';
    if (!year || !gapType) {
        document.getElementById('gap-insights').innerHTML = '<p>Please select a year and gap type.</p>';
        return;
    }
    try {
        const response = await fetch(`/api/gap_insights?year=${encodeURIComponent(year)}&gap_type=${encodeURIComponent(gapType)}`);
        const data = await response.json();
        if (data.error) {
            console.error('Error loading gap insights:', data.error);
            document.getElementById('gap-insights').innerHTML = `<p>${data.error}</p>`;
            return;
        }
        document.getElementById('gap-insights').innerHTML = '';
        if (data.insights.length === 0) {
            gapInsightsList.innerHTML = '<li>No insights available for the selected year and gap type.</li>';
            return;
        }
        data.insights.forEach(insight => {
            const li = document.createElement('li');
            li.textContent = insight;
            gapInsightsList.appendChild(li);
        });
        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `${year}_${gapType}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error);
        document.getElementById('gap-insights').innerHTML = '<p>Failed to load gap insights. Please try again later.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}

// Function to aggregate 1-minute data into specified timeframe (1m, 2m, 3m, 5m, 10m)
function aggregateCandles(data, timeframe) {
    if (timeframe === 1) {
        return {
            timestamp: data.timestamp,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume,
            count: data.count,
            minuteIndices: data.timestamp.map((_, i) => [i]),
            ticker: data.ticker,
            date: data.date
        };
    }

    const aggregated = {
        timestamp: [],
        open: [],
        high: [],
        low: [],
        close: [],
        volume: [],
        minuteIndices: [],
        ticker: data.ticker,
        date: data.date
    };

    const startDate = new Date(data.date + 'T09:30:00');
    const endDate = new Date(data.date + 'T16:00:00');
    let currentTime = new Date(startDate);
    let currentIndices = [];

    while (currentTime <= endDate) {
        const windowEnd = new Date(currentTime.getTime() + timeframe * 60 * 1000);
        const windowData = data.timestamp.reduce((acc, ts, i) => {
            const candleTime = new Date(ts);
            if (candleTime >= currentTime && candleTime < windowEnd) {
                acc.indices.push(i);
                acc.candles.push({
                    open: data.open[i],
                    high: data.high[i],
                    low: data.low[i],
                    close: data.close[i],
                    volume: data.volume[i]
                });
            }
            return acc;
        }, { indices: [], candles: [] });

        if (windowData.candles.length > 0) {
            aggregated.timestamp.push(currentTime.toISOString().replace('T', ' ').substring(0, 19));
            aggregated.open.push(windowData.candles[0].open);
            aggregated.high.push(Math.max(...windowData.candles.map(c => c.high)));
            aggregated.low.push(Math.min(...windowData.candles.map(c => c.low)));
            aggregated.close.push(windowData.candles[windowData.candles.length - 1].close);
            aggregated.volume.push(windowData.candles.reduce((sum, c) => sum + c.volume, 0));
            aggregated.minuteIndices.push(windowData.indices);
        }

        currentTime = windowEnd;
    }

    aggregated.count = aggregated.timestamp.length;
    return aggregated;
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
            dateInputId: 'date-earnings',
            timeframeSelectId: 'timeframe-select-earnings',
            chartContainerId: 'plotly-chart-earnings',
            formId: 'stock-form-earnings',
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
    const restartButton = document.getElementById(`restart-replay${replayPrefix ? '-' + replayPrefix : ''}`);
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

        // Aggregate data for the selected timeframe
        const aggregatedChartData = aggregateCandles(data.chart_data, timeframe);

        // Store chart data and reset replay state
        if (replayPrefix === '') {
            chartData = data.chart_data;
            aggregatedData = aggregatedChartData;
            currentReplayIndex = 0;
            currentMinuteIndex = 0;
            isReplaying = false;
            isPaused = false;
            if (replayInterval) clearInterval(replayInterval);
            // Reset trade simulator state
            openPosition = null;
            tradeHistory = [];
            updateTradeSummary();
        } else if (replayPrefix === 'gap') {
            chartDataGap = data.chart_data;
            aggregatedDataGap = aggregatedChartData;
            currentReplayIndexGap = 0;
            currentMinuteIndexGap = 0;
            isReplayingGap = false;
            isPausedGap = false;
            if (replayIntervalGap) clearInterval(replayIntervalGap);
        } else if (replayPrefix === 'events') {
            chartDataEvents = data.chart_data;
            aggregatedDataEvents = aggregatedChartData;
            currentReplayIndexEvents = 0;
            currentMinuteIndexEvents = 0;
            isReplayingEvents = false;
            isPausedEvents = false;
            if (replayIntervalEvents) clearInterval(replayIntervalEvents);
        } else if (replayPrefix === 'earnings') {
            chartDataEarnings = data.chart_data;
            aggregatedDataEarnings = aggregatedChartData;
            currentReplayIndexEarnings = 0;
            currentMinuteIndexEarnings = 0;
            isReplayingEarnings = false;
            isPausedEarnings = false;
            if (replayIntervalEarnings) clearInterval(replayIntervalEarnings);
        }

        // Render initial chart (no candles until replay starts)
        Plotly.newPlot(chartContainerId, [], {
            title: `${data.chart_data.ticker} ${timeframe}-Minute Candlestick Chart - ${data.chart_data.date}${restrictHours ? ' (Regular Hours)' : ''}`,
            xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
            yaxis: { title: 'Price', domain: [0.3, 1] },
            yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
            showlegend: true,
            margin: { t: 50, b: 50, l: 50, r: 50 },
            plot_bgcolor: '#ffffff',
            paper_bgcolor: '#ffffff'
        }, { responsive: true });

        // Handle replay controls
        replayControls.style.display = 'block';
        playButton.textContent = 'Play';
        playButton.disabled = false;
        pauseButton.disabled = true;
        startOverButton.disabled = true;
        restartButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = aggregatedChartData.count === 0;
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
    if (!isReplaying || !aggregatedData || currentReplayIndex <= 0 || currentReplayIndex > aggregatedData.count) return;
    if (openPosition) {
        alert('Close the current position before opening a new one.');
        return;
    }
    openPosition = {
        type: 'buy',
        price: aggregatedData.close[currentReplayIndex - 1],
        shares: POSITION_SIZE,
        timestamp: aggregatedData.timestamp[currentReplayIndex - 1]
    };
    console.log(`Placed buy trade: ${JSON.stringify(openPosition)}`);
    updateTradeSummary();
    gtag('event', 'trade_placed', {
        'event_category': 'Trade Simulator',
        'event_label': `Buy_${aggregatedData.ticker}_${aggregatedData.date}_${openPosition.timestamp}`
    });
}

function placeSellTrade() {
    if (!isReplaying || !aggregatedData || currentReplayIndex <= 0 || currentReplayIndex > aggregatedData.count) return;
    if (openPosition) {
        const exitPrice = aggregatedData.close[currentReplayIndex - 1];
        const pnl = openPosition.type === 'buy'
            ? (exitPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - exitPrice) * openPosition.shares;
        tradeHistory.push({
            type: openPosition.type,
            entryPrice: openPosition.price,
            exitPrice: exitPrice,
            shares: openPosition.shares,
            timestamp: aggregatedData.timestamp[currentReplayIndex - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        openPosition = null;
        console.log(`Closed position with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary();
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${tradeHistory[tradeHistory.length - 1].type}_${aggregatedData.ticker}_${aggregatedData.date}_${tradeHistory[tradeHistory.length - 1].timestamp}`
        });
    } else {
        openPosition = {
            type: 'sell',
            price: aggregatedData.close[currentReplayIndex - 1],
            shares: POSITION_SIZE,
            timestamp: aggregatedData.timestamp[currentReplayIndex - 1]
        };
        console.log(`Placed sell trade: ${JSON.stringify(openPosition)}`);
        updateTradeSummary();
        gtag('event', 'trade_placed', {
            'event_category': 'Trade Simulator',
            'event_label': `Sell_${aggregatedData.ticker}_${aggregatedData.date}_${openPosition.timestamp}`
        });
    }
}

function updateTradeSummary() {
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryEl = document.getElementById('trade-history');
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    buyButton.disabled = !isReplaying || currentReplayIndex <= 0 || currentReplayIndex > aggregatedData.count || openPosition?.type === 'sell';
    sellButton.disabled = !isReplaying || currentReplayIndex <= 0 || currentReplayIndex > aggregatedData.count;

    if (openPosition) {
        const currentPrice = currentReplayIndex > 0 ? aggregatedData.close[currentReplayIndex - 1] : openPosition.price;
        const unrealizedPnl = openPosition.type === 'buy'
            ? (currentPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - currentPrice) * openPosition.shares;
        positionStatus.textContent = `Open ${openPosition.type.toUpperCase()} Position: ${openPosition.shares} shares @ $${openPosition.price.toFixed(2)}`;
        tradePnl.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
    } else {
        positionStatus.textContent = 'No open position';
        tradePnl.textContent = `Realized P/L: $${tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2)}`;
    }

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
            aggregatedData: () => aggregatedData,
            setChartData: (data) => { chartData = data; },
            setAggregatedData: (data) => { aggregatedData = data; },
            replayInterval: () => replayInterval,
            setReplayInterval: (interval) => { replayInterval = interval; },
            currentReplayIndex: () => currentReplayIndex,
            setCurrentReplayIndex: (index) => { currentReplayIndex = index; },
            currentMinuteIndex: () => currentMinuteIndex,
            setCurrentMinuteIndex: (index) => { currentMinuteIndex = index; },
            isReplaying: () => isReplaying,
            setIsReplaying: (state) => { isReplaying = state; },
            isPaused: () => isPaused,
            setIsPaused: (state) => { isPaused = state; },
            chartContainerId: 'plotly-chart',
            playButtonId: 'play-replay',
            pauseButtonId: 'pause-replay',
            startOverButtonId: 'start-over-replay',
            restartButtonId: 'restart-replay',
            prevButtonId: 'prev-candle',
            nextButtonId: 'next-candle',
            startTimeInputId: 'replay-start-time',
            replaySpeedId: 'replay-speed',
            timestampDisplayId: 'replay-timestamp',
            timeframeSelectId: 'timeframe-select',
            hasTradeSimulator: true
        },
        'gap': {
            chartData: () => chartDataGap,
            aggregatedData: () => aggregatedDataGap,
            setChartData: (data) => { chartDataGap = data; },
            setAggregatedData: (data) => { aggregatedDataGap = data; },
            replayInterval: () => replayIntervalGap,
            setReplayInterval: (interval) => { replayIntervalGap = interval; },
            currentReplayIndex: () => currentReplayIndexGap,
            setCurrentReplayIndex: (index) => { currentReplayIndexGap = index; },
            currentMinuteIndex: () => currentMinuteIndexGap,
            setCurrentMinuteIndex: (index) => { currentMinuteIndexGap = index; },
            isReplaying: () => isReplayingGap,
            setIsReplaying: (state) => { isReplayingGap = state; },
            isPaused: () => isPausedGap,
            setIsPaused: (state) => { isPausedGap = state; },
            chartContainerId: 'plotly-chart-gap',
            playButtonId: 'play-replay-gap',
            pauseButtonId: 'pause-replay-gap',
            startOverButtonId: 'start-over-replay-gap',
            restartButtonId: 'restart-replay-gap',
            prevButtonId: 'prev-candle-gap',
            nextButtonId: 'next-candle-gap',
            startTimeInputId: 'replay-start-time-gap',
            replaySpeedId: 'replay-speed-gap',
            timestampDisplayId: 'replay-timestamp-gap',
            timeframeSelectId: 'timeframe-select-gap',
            hasTradeSimulator: false
        },
        'events': {
            chartData: () => chartDataEvents,
            aggregatedData: () => aggregatedDataEvents,
            setChartData: (data) => { chartDataEvents = data; },
            setAggregatedData: (data) => { aggregatedDataEvents = data; },
            replayInterval: () => replayIntervalEvents,
            setReplayInterval: (interval) => { replayIntervalEvents = interval; },
            currentReplayIndex: () => currentReplayIndexEvents,
            setCurrentReplayIndex: (index) => { currentReplayIndexEvents = index; },
            currentMinuteIndex: () => currentMinuteIndexEvents,
            setCurrentMinuteIndex: (index) => { currentMinuteIndexEvents = index; },
            isReplaying: () => isReplayingEvents,
            setIsReplaying: (state) => { isReplayingEvents = state; },
            isPaused: () => isPausedEvents,
            setIsPaused: (state) => { isPausedEvents = state; },
            chartContainerId: 'plotly-chart-events',
            playButtonId: 'play-replay-events',
            pauseButtonId: 'pause-replay-events',
            startOverButtonId: 'start-over-replay-events',
            restartButtonId: 'restart-replay-events',
            prevButtonId: 'prev-candle-events',
            nextButtonId: 'next-candle-events',
            startTimeInputId: 'replay-start-time-events',
            replaySpeedId: 'replay-speed-events',
            timestampDisplayId: 'replay-timestamp-events',
            timeframeSelectId: 'timeframe-select-events',
            hasTradeSimulator: false
        },
        'earnings': {
            chartData: () => chartDataEarnings,
            aggregatedData: () => aggregatedDataEarnings,
            setChartData: (data) => { chartDataEarnings = data; },
            setAggregatedData: (data) => { aggregatedDataEarnings = data; },
            replayInterval: () => replayIntervalEarnings,
            setReplayInterval: (interval) => { replayIntervalEarnings = interval; },
            currentReplayIndex: () => currentReplayIndexEarnings,
            setCurrentReplayIndex: (index) => { currentReplayIndexEarnings = index; },
            currentMinuteIndex: () => currentMinuteIndexEarnings,
            setCurrentMinuteIndex: (index) => { currentMinuteIndexEarnings = index; },
            isReplaying: () => isReplayingEarnings,
            setIsReplaying: (state) => { isReplayingEarnings = state; },
            isPaused: () => isPausedEarnings,
            setIsPaused: (state) => { isPausedEarnings = state; },
            chartContainerId: 'plotly-chart-earnings',
            playButtonId: 'play-replay-earnings',
            pauseButtonId: 'pause-replay-earnings',
            startOverButtonId: 'start-over-replay-earnings',
            restartButtonId: 'restart-replay-earnings',
            prevButtonId: 'prev-candle-earnings',
            nextButtonId: 'next-candle-earnings',
            startTimeInputId: 'replay-start-time-earnings',
            replaySpeedId: 'replay-speed-earnings',
            timestampDisplayId: 'replay-timestamp-earnings',
            timeframeSelectId: 'timeframe-select-earnings',
            hasTradeSimulator: false
        }
    };
    return configs[section];
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    const aggregatedData = config.aggregatedData();
    if (!chartData || !aggregatedData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(config.restartButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const startTimeInput = document.getElementById(config.startTimeInputId).value;
    const replaySpeed = parseInt(document.getElementById(config.replaySpeedId).value);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    // If not paused, determine start index based on user input
    if (!config.isPaused()) {
        let startIndex = 0;
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const dateStr = aggregatedData.date;
            const targetTime = new Date(`${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            startIndex = aggregatedData.timestamp.findIndex(ts => {
                const candleTime = new Date(ts);
                return candleTime.getTime() >= targetTime.getTime();
            });
            if (startIndex === -1) {
                startIndex = 0;
                alert('Start time not found in chart data. Starting from first candle.');
            }
        }
        config.setCurrentReplayIndex(startIndex);
        config.setCurrentMinuteIndex(startIndex > 0 ? aggregatedData.minuteIndices[startIndex][0] : 0);
    }

    if (config.isReplaying() && !config.isPaused()) return;

    config.setIsReplaying(true);
    config.setIsPaused(false);
    playButton.textContent = 'Play';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    restartButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= aggregatedData.count;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count;
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count;
        updateTradeSummary();
    }

    // Initialize chart
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        open: aggregatedData.open.slice(0, config.currentReplayIndex()),
        high: aggregatedData.high.slice(0, config.currentReplayIndex()),
        low: aggregatedData.low.slice(0, config.currentReplayIndex()),
        close: aggregatedData.close.slice(0, config.currentReplayIndex()),
        type: 'candlestick',
        name: aggregatedData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        y: aggregatedData.volume.slice(0, config.currentReplayIndex()),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${aggregatedData.ticker} ${document.getElementById(config.timeframeSelectId).value}-Minute Candlestick Chart - ${aggregatedData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp
    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${aggregatedData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    if (config.hasTradeSimulator) updateTradeSummary();

    // Replay loop (incremental minute-by-minute updates)
    config.setReplayInterval(setInterval(() => {
        if (config.currentMinuteIndex() >= chartData.count) {
            pauseReplay(section);
            return;
        }

        const timeframe = parseInt(document.getElementById(config.timeframeSelectId).value);
        const currentCandleIndex = aggregatedData.minuteIndices.findIndex(indices => indices.includes(config.currentMinuteIndex()));
        let nextCandleData;

        if (currentCandleIndex >= 0 && currentCandleIndex < aggregatedData.count) {
            const indices = aggregatedData.minuteIndices[currentCandleIndex];
            const currentIndexInCandle = indices.indexOf(config.currentMinuteIndex());
            if (currentIndexInCandle >= 0 && currentIndexInCandle < indices.length - 1) {
                // Update within the current aggregated candle
                const candleIndices = indices.slice(0, currentIndexInCandle + 1);
                nextCandleData = {
                    x: [aggregatedData.timestamp[currentCandleIndex]],
                    open: [aggregatedData.open[currentCandleIndex]],
                    high: [Math.max(...candleIndices.map(i => chartData.high[i]))],
                    low: [Math.min(...candleIndices.map(i => chartData.low[i]))],
                    close: [chartData.close[candleIndices[candleIndices.length - 1]]],
                    volume: [candleIndices.reduce((sum, i) => sum + chartData.volume[i], 0)]
                };
            } else if (currentCandleIndex === config.currentReplayIndex()) {
                // Move to next aggregated candle
                config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
                nextCandleData = {
                    x: [aggregatedData.timestamp[currentCandleIndex]],
                    open: [aggregatedData.open[currentCandleIndex]],
                    high: [aggregatedData.high[currentCandleIndex]],
                    low: [aggregatedData.low[currentCandleIndex]],
                    close: [aggregatedData.close[currentCandleIndex]],
                    volume: [aggregatedData.volume[currentCandleIndex]]
                };
            }
        }

        if (nextCandleData) {
            if (config.currentReplayIndex() <= currentCandleIndex + 1) {
                Plotly.extendTraces(config.chartContainerId, {
                    x: [nextCandleData.x],
                    open: [nextCandleData.open],
                    high: [nextCandleData.high],
                    low: [nextCandleData.low],
                    close: [nextCandleData.close]
                }, [0]);
                Plotly.extendTraces(config.chartContainerId, {
                    x: [nextCandleData.x],
                    y: [nextCandleData.volume]
                }, [1]);
            }
            timestampDisplay.textContent = `Current Time: ${chartData.timestamp[config.currentMinuteIndex()].split(' ')[1]}`;
        }

        prevButton.disabled = config.currentReplayIndex() <= 0;
        nextButton.disabled = config.currentReplayIndex() >= aggregatedData.count;
        startOverButton.disabled = config.currentReplayIndex() <= 0;
        restartButton.disabled = config.currentReplayIndex() <= 0;
        if (config.hasTradeSimulator) {
            buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count || openPosition?.type === 'sell';
            sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count;
            updateTradeSummary();
        }

        config.setCurrentMinuteIndex(config.currentMinuteIndex() + 1);
    }, replaySpeed));

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${aggregatedData.ticker}_${aggregatedData.date}_${section || 'simulator'}`
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
    const restartButton = document.getElementById(config.restartButtonId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
        updateTradeSummary();
    }

    playButton.textContent = 'Resume';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    restartButton.disabled = config.currentReplayIndex() <= 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > config.aggregatedData().count || openPosition?.type === 'sell';
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > config.aggregatedData().count;
    }
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const aggregatedData = config.aggregatedData();
    if (!aggregatedData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(config.restartButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    config.setCurrentReplayIndex(0);
    config.setCurrentMinuteIndex(0);

    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: [],
        open: [],
        high: [],
        low: [],
        close: [],
        type: 'candlestick',
        name: aggregatedData.ticker,
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
        title: `${aggregatedData.ticker} ${document.getElementById(config.timeframeSelectId).value}-Minute Candlestick Chart - ${aggregatedData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    restartButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = aggregatedData.count === 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${aggregatedData.ticker}_${aggregatedData.date}_${section || 'simulator'}`
    });
}

function restartReplay(section) {
    const config = getReplayConfig(section);
    const aggregatedData = config.aggregatedData();
    if (!aggregatedData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(config.restartButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
        openPosition = null;
        tradeHistory = [];
        updateTradeSummary();
    }

    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    config.setCurrentReplayIndex(0);
    config.setCurrentMinuteIndex(0);

    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: [],
        open: [],
        high: [],
        low: [],
        close: [],
        type: 'candlestick',
        name: aggregatedData.ticker,
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
        title: `${aggregatedData.ticker} ${document.getElementById(config.timeframeSelectId).value}-Minute Candlestick Chart - ${aggregatedData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    restartButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = aggregatedData.count === 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_restart', {
        'event_category': 'Chart',
        'event_label': `${aggregatedData.ticker}_${aggregatedData.date}_${section || 'simulator'}`
    });
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const aggregatedData = config.aggregatedData();
    if (!aggregatedData || config.currentReplayIndex() <= 0) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(config.restartButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
    config.setCurrentMinuteIndex(config.currentReplayIndex() > 0 ? aggregatedData.minuteIndices[config.currentReplayIndex() - 1][0] : 0);

    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        open: aggregatedData.open.slice(0, config.currentReplayIndex()),
        high: aggregatedData.high.slice(0, config.currentReplayIndex()),
        low: aggregatedData.low.slice(0, config.currentReplayIndex()),
        close: aggregatedData.close.slice(0, config.currentReplayIndex()),
        type: 'candlestick',
        name: aggregatedData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        y: aggregatedData.volume.slice(0, config.currentReplayIndex()),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${aggregatedData.ticker} ${document.getElementById(config.timeframeSelectId).value}-Minute Candlestick Chart - ${aggregatedData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    restartButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= aggregatedData.count;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count || openPosition?.type === 'sell';
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count;
        updateTradeSummary();
    }

    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${aggregatedData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    gtag('event', 'replay_prev_candle', {
        'event_category': 'Chart',
        'event_label': `${aggregatedData.ticker}_${aggregatedData.date}_${section || 'simulator'}`
    });
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const aggregatedData = config.aggregatedData();
    if (!aggregatedData || config.currentReplayIndex() >= aggregatedData.count) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(config.restartButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    config.setCurrentMinuteIndex(config.currentReplayIndex() > 0 ? aggregatedData.minuteIndices[config.currentReplayIndex() - 1][0] : 0);

    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        open: aggregatedData.open.slice(0, config.currentReplayIndex()),
        high: aggregatedData.high.slice(0, config.currentReplayIndex()),
        low: aggregatedData.low.slice(0, config.currentReplayIndex()),
        close: aggregatedData.close.slice(0, config.currentReplayIndex()),
        type: 'candlestick',
        name: aggregatedData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: aggregatedData.timestamp.slice(0, config.currentReplayIndex()),
        y: aggregatedData.volume.slice(0, config.currentReplayIndex()),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${aggregatedData.ticker} ${document.getElementById(config.timeframeSelectId).value}-Minute Candlestick Chart - ${aggregatedData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M', rangeslider: { visible: false } },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    restartButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= aggregatedData.count;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count || openPosition?.type === 'sell';
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > aggregatedData.count;
        updateTradeSummary();
    }

    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${aggregatedData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    gtag('event', 'replay_next_candle', {
        'event_category': 'Chart',
        'event_label': `${aggregatedData.ticker}_${aggregatedData.date}_${section || 'simulator'}`
    });
}

function updateReplaySpeed(section) {
    const config = getReplayConfig(section);
    if (config.isReplaying()) {
        clearInterval(config.replayInterval());
        const replaySpeed = parseInt(document.getElementById(config.replaySpeedId).value);
        config.setReplayInterval(setInterval(() => {
            if (config.currentMinuteIndex() >= config.chartData().count) {
                pauseReplay(section);
                return;
            }

            const aggregatedData = config.aggregatedData();
            const timeframe = parseInt(document.getElementById(config.timeframeSelectId).value);
            const currentCandleIndex = aggregatedData.minuteIndices.findIndex(indices => indices.includes(config.currentMinuteIndex()));
            let nextCandleData;

            if (currentCandleIndex >= 0 && currentCandleIndex < aggregatedData.count) {
                const indices = aggregatedData.minuteIndices[currentCandleIndex];
                const currentIndexInCandle = indices.indexOf(config.currentMinuteIndex());
                                if (currentIndexInCandle >= 0 && currentIndexInCandle < indices.length - 1) {
                    // Update within the current aggregated candle
                    const candleIndices = indices.slice(0, currentIndexInCandle + 1);
                    nextCandleData = {
                        x: [aggregatedData.timestamp[currentCandleIndex]],
                        open: [aggregatedData.open[currentCandleIndex]],
                        high: [Math.max(...candleIndices.map(i => config.chartData().high[i]))],
                        low: [Math.min(...candleIndices.map(i => config.chartData().low[i]))],
                        close: [config.chartData().close[candleIndices[candleIndices.length - 1]]],
                        volume: [candleIndices.reduce((sum, i) => sum + config.chartData().volume[i], 0)]
                    };
                } else {
                    // Move to next aggregated candle
                    config.setCurrentReplayIndex(currentCandleIndex + 1);
                    if (config.currentReplayIndex() < aggregatedData.count) {
                        nextCandleData = {
                            x: [aggregatedData.timestamp[config.currentReplayIndex()]],
                            open: [aggregatedData.open[config.currentReplayIndex()]],
                            high: [aggregatedData.high[config.currentReplayIndex()]],
                            low: [aggregatedData.low[config.currentReplayIndex()]],
                            close: [aggregatedData.close[config.currentReplayIndex()]],
                            volume: [aggregatedData.volume[config.currentReplayIndex()]]
                        };
                    }
                }
            }

            if (nextCandleData) {
                if (config.currentReplayIndex() <= currentCandleIndex + 1) {
                    Plotly.extendTraces(config.chartContainerId, {
                        x: [nextCandleData.x],
                        open: [nextCandleData.open],
                        high: [nextCandleData.high],
                        low: [nextCandleData.low],
                        close: [nextCandleData.close]
                    }, [0]);
                    Plotly.extendTraces(config.chartContainerId, {
                        x: [nextCandleData.x],
                        y: [nextCandleData.volume]
                    }, [1]);
                }
                document.getElementById(config.timestampDisplayId).textContent = 
                    `Current Time: ${config.chartData().timestamp[config.currentMinuteIndex()].split(' ')[1]}`;
            }

            const prevButton = document.getElementById(config.prevButtonId);
            const nextButton = document.getElementById(config.nextButtonId);
            const startOverButton = document.getElementById(config.startOverButtonId);
            const restartButton = document.getElementById(`restart-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
            let buyButton, sellButton;
            if (config.hasTradeSimulator) {
                buyButton = document.getElementById('buy-trade');
                sellButton = document.getElementById('sell-trade');
                updateTradeSummary();
            }

            prevButton.disabled = config.currentReplayIndex() <= 0;
            nextButton.disabled = config.currentReplayIndex() >= aggregatedData.count;
            startOverButton.disabled = config.currentReplayIndex() <= 0;
            restartButton.disabled = config.currentReplayIndex() <= 0;
            if (config.hasTradeSimulator) {
                buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() >= aggregatedData.count || openPosition?.type === 'sell';
                sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() >= aggregatedData.count;
            }

            config.setCurrentMinuteIndex(config.currentMinuteIndex() + 1);
        }, replaySpeed));
    }

    gtag('event', 'replay_speed_change', {
        'event_category': 'Chart',
        'event_label': `${config.aggregatedData().ticker}_${config.aggregatedData().date}_${section || 'simulator'}_${replaySpeed}`
    });
}

function restartReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const restartButton = document.getElementById(`restart-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const chartContainer = document.getElementById(config.chartContainerId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
        // Reset trade simulator state
        openPosition = null;
        tradeHistory = [];
    }

    // Stop any ongoing replay
    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    // Reset indices
    config.setCurrentReplayIndex(0);
    config.setCurrentMinuteIndex(0);

    // Reset aggregated data
    config.setAggregatedData(null);

    // Clear chart
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
    restartButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = chartData.count === 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    // Reset timestamp
    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_restart', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section || 'simulator'}`
    });
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