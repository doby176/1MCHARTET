const tabStates = {
    'market-simulator': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        candlesPerTimeframe: 1,
        aggregatedCandles: null,
        openPosition: null,
        tradeHistory: []
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
        tickerSelectId: null, // Determined dynamically in loadChart
        dateInputId: 'date-earnings',
        timeframeSelectId: 'timeframe-select-earnings',
        chartContainerId: 'plotly-chart-earnings',
        formId: 'earnings-form',
        restrictHours: true,
        replayControlsId: 'replay-controls-earnings',
        replayPrefix: 'earnings'
    }
};

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

const POSITION_SIZE = 100;

let currentFilterType = 'ticker-outcome';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    initializeTabs();
    loadTickers();
    loadYears();
    loadBinOptions();
    populateEarningsOutcomes();
    setupEventListeners();
});

function initializeTabs() {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.getElementById('market-simulator').classList.add('active');
    document.querySelector('.tab-button[onclick="openTab(\'market-simulator\')"]').classList.add('active');
}

function openTab(tabId) {
    Object.keys(tabStates).forEach(section => {
        if (section !== tabId) {
            pauseReplay(section);
        }
    });
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-button[onclick="openTab('${tabId}')"]`).classList.add('active');
    gtag('event', 'tab_open', {
        'event_category': 'Navigation',
        'event_label': tabId
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
    currentFilterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    document.querySelectorAll('.filter-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${currentFilterType}-filter`).classList.add('active');
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
    const tickerSelects = [
        'ticker-select',
        'ticker-select-gap',
        'ticker-select-events',
        'earnings-ticker-select',
        'earnings-ticker-only-select'
    ].map(id => document.getElementById(id));

    tickerSelects.forEach(select => {
        select.disabled = true;
        select.innerHTML = '<option value="">Loading tickers...</option>';
    });

    try {
        const response = await fetch('/api/tickers', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            tickerSelects.forEach(select => {
                select.innerHTML = `<option value="">${message}</option>`;
            });
            alert(message);
            localStorage.setItem('tickerRateLimitReset', resetTime * 1000);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (!data.tickers || !Array.isArray(data.tickers)) throw new Error('Invalid tickers response');

        tickerSelects.forEach(select => {
            select.innerHTML = '<option value="">Select a ticker</option>';
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                select.appendChild(option);
            });
            select.disabled = false;
        });
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelects.forEach(select => {
            select.innerHTML = '<option value="">Error loading tickers</option>';
        });
        alert('Failed to load tickers: ' + error.message);
    }
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';

    try {
        const response = await fetch('/api/years');
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            yearSelect.innerHTML = `<option value="">${message}</option>`;
            alert(message);
            localStorage.setItem('yearsRateLimitReset', resetTime * 1000);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (!data.years || !Array.isArray(data.years)) throw new Error('Invalid years response');

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
        alert('Failed to load years: ' + error.message);
    }
}

function setupEventListeners() {
    document.getElementById('stock-form').addEventListener('submit', (e) => loadChart(e, 'market-simulator'));
    document.getElementById('stock-form-gap').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
    document.getElementById('earnings-form').addEventListener('submit', (e) => loadChart(e, 'earnings-analysis'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('find-earnings').addEventListener('click', loadEarningsDates);

    document.getElementById('buy-trade').addEventListener('click', placeBuyTrade);
    document.getElementById('sell-trade').addEventListener('click', placeSellTrade);

    ['market-simulator', 'gap-analysis', 'events-analysis', 'earnings-analysis'].forEach(section => {
        const prefix = tabConfig[section].replayPrefix;
        document.getElementById(`play-replay${prefix ? '-' + prefix : ''}`).addEventListener('click', () => startReplay(section));
        document.getElementById(`pause-replay${prefix ? '-' + prefix : ''}`).addEventListener('click', () => pauseReplay(section));
        document.getElementById(`start-over-replay${prefix ? '-' + prefix : ''}`).addEventListener('click', () => startOverReplay(section));
        document.getElementById(`prev-candle${prefix ? '-' + prefix : ''}`).addEventListener('click', () => prevCandle(section));
        document.getElementById(`next-candle${prefix ? '-' + prefix : ''}`).addEventListener('click', () => nextCandle(section));
        document.getElementById(`replay-speed${prefix ? '-' + prefix : ''}`).addEventListener('change', () => updateReplaySpeed(section));
    });

    document.querySelectorAll('input[name="filter-type"]').forEach(radio => {
        radio.addEventListener('change', toggleFilterSection);
    });

    document.querySelectorAll('input[name="earnings-filter-type"]').forEach(radio => {
        radio.addEventListener('change', toggleEarningsFilterSection);
    });

    ['ticker-select', 'ticker-select-gap', 'ticker-select-events'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => loadDates(id, id.replace('ticker-select', 'date')));
    });
}

async function loadDates(tickerSelectId, dateInputId) {
    const tickerSelect = document.getElementById(tickerSelectId);
    const dateInput = document.getElementById(dateInputId);
    dateInput.disabled = true;
    dateInput.value = '';
    const ticker = tickerSelect.value;
    if (!ticker) return;

    try {
        const response = await fetch(`/api/valid_dates?ticker=${encodeURIComponent(ticker)}`);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            alert(message);
            localStorage.setItem(`datesRateLimitReset_${tickerSelectId}`, resetTime * 1000);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        dateInput.disabled = false;
    } catch (error) {
        console.error('Error loading dates:', error.message);
        alert('Failed to load dates: ' + error.message);
    }
}

async function loadChart(event, tabId) {
    event.preventDefault();
    const config = tabConfig[tabId];
    if (!config) return;

    const ticker = tabId === 'earnings-analysis'
        ? (currentFilterType === 'ticker-outcome'
            ? document.getElementById('earnings-ticker-select').value
            : document.getElementById('earnings-ticker-only-select').value)
        : document.getElementById(config.tickerSelectId).value;
    const date = document.getElementById(config.dateInputId).value;
    const timeframe = document.getElementById(config.timeframeSelectId).value;
    const chartContainer = document.getElementById(config.chartContainerId);
    const form = document.getElementById(config.formId);
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    const rateLimitResetTime = localStorage.getItem(`chartRateLimitReset_${tabId}`);
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()}.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || !date || !timeframe) {
        chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe.</p>';
        document.getElementById(config.replayControlsId).style.display = 'none';
        return;
    }

    try {
        const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${encodeURIComponent(timeframe)}${config.restrictHours ? '&restrict_hours=true' : ''}`;
        const response = await fetch(url);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">${message}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            localStorage.setItem(`chartRateLimitReset_${tabId}`, resetTime * 1000);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Load Chart';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem(`chartRateLimitReset_${tabId}`);
                chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe to generate a chart.</p>';
            }, resetTime * 1000 - Date.now());
            alert(message);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        tabStates[tabId].chartData = data.chart_data;
        tabStates[tabId].currentReplayIndex = 0;
        tabStates[tabId].isReplaying = false;
        tabStates[tabId].isPaused = false;
        tabStates[tabId].candlesPerTimeframe = parseInt(timeframe);
        if (tabId === 'market-simulator') {
            tabStates[tabId].openPosition = null;
            tabStates[tabId].tradeHistory = [];
            updateTradeSummary();
        }
        if (tabStates[tabId].replayInterval) clearInterval(tabStates[tabId].replayInterval);

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
            title: `${data.chart_data.ticker} ${timeframe}-Minute Candlestick Chart - ${data.chart_data.date}${config.restrictHours ? ' (Regular Hours)' : ''}`,
            xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
            yaxis: { title: 'Price', domain: [0.3, 1] },
            yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
            showlegend: true,
            margin: { t: 50, b: 50, l: 50, r: 50 },
            plot_bgcolor: '#ffffff',
            paper_bgcolor: '#ffffff'
        };
        Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

        const replayControls = document.getElementById(config.replayControlsId);
        replayControls.style.display = 'block';
        document.getElementById(`play-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`).disabled = false;
        document.getElementById(`pause-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`).disabled = true;
        document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`).disabled = true;
        document.getElementById(`prev-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`).disabled = true;
        document.getElementById(`next-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`).disabled = true;
        document.getElementById(`replay-start-time${config.replayPrefix ? '-' + config.replayPrefix : ''}`).value = '';
        document.getElementById(`replay-timestamp${config.replayPrefix ? '-' + config.replayPrefix : ''}`).textContent = 'Current Time: --:--:--';
        if (tabId === 'market-simulator') {
            document.getElementById('buy-trade').disabled = true;
            document.getElementById('sell-trade').disabled = true;
        }

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}_${timeframe}${config.restrictHours ? '_regular_hours' : ''}`,
            'tab': tabId
        });
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '</p>';
        document.getElementById(config.replayControlsId).style.display = 'none';
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

    buyButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count || state.openPosition?.type === 'sell';
    sellButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData?.count;

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

    tradeHistoryEl.textContent = state.tradeHistory.length === 0
        ? 'Trade History: None'
        : `Trade History: ${state.tradeHistory.map(trade => `${trade.type.toUpperCase()} ${trade.shares} shares @ $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice.toFixed(2)} at ${trade.timestamp.split(' ')[1]} (P/L: $${trade.pnl.toFixed(2)})`).join('; ')}`;
}

function startReplay(tabId) {
    const state = tabStates[tabId];
    const config = tabConfig[tabId];
    if (!state.chartData) return;

    Object.keys(tabStates).forEach(section => {
        if (section !== tabId) pauseReplay(section);
    });

    const playButton = document.getElementById(`play-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startTimeInput = document.getElementById(`replay-start-time${config.replayPrefix ? '-' + config.replayPrefix : ''}`).value;
    const replaySpeed = parseInt(document.getElementById(`replay-speed${config.replayPrefix ? '-' + config.replayPrefix : ''}`).value);

    if (!state.isPaused) {
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const targetTime = new Date(`${state.chartData.date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            let index = state.chartData.timestamp.findIndex(ts => new Date(ts).getTime() >= targetTime.getTime());
            state.currentReplayIndex = index === -1 ? 0 : index;
            if (index === -1) alert('Start time not found in chart data. Starting from first candle.');
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
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;
    if (tabId === 'market-simulator') updateTradeSummary();

    Plotly.purge(config.chartContainerId);
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
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    timestampDisplay.textContent = state.currentReplayIndex > 0
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= state.chartData.count) {
            stopReplay(tabId);
            return;
        }

        Plotly.extendTraces(config.chartContainerId, {
            x: [[state.chartData.timestamp[state.currentReplayIndex]]],
            open: [[state.chartData.open[state.currentReplayIndex]]],
            high: [[state.chartData.high[state.currentReplayIndex]]],
            low: [[state.chartData.low[state.currentReplayIndex]]],
            close: [[state.chartData.close[state.currentReplayIndex]]]
        }, [0]);
        Plotly.extendTraces(config.chartContainerId, {
            x: [[state.chartData.timestamp[state.currentReplayIndex]]],
            y: [[state.chartData.volume[state.currentReplayIndex]]]
        }, [1]);

        timestampDisplay.textContent = `Current Time: ${state.chartData.timestamp[state.currentReplayIndex].split(' ')[1]}`;
        prevButton.disabled = state.currentReplayIndex <= 0;
        nextButton.disabled = state.currentReplayIndex + 1 >= state.chartData.count;
        startOverButton.disabled = state.currentReplayIndex <= 0;
        if (tabId === 'market-simulator') updateTradeSummary();

        state.currentReplayIndex++;
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}_${tabId}`
    });
}

function pauseReplay(tabId) {
    const state = tabStates[tabId];
    const config = tabConfig[tabId];
    if (!state.isReplaying) return;

    state.isReplaying = false;
    state.isPaused = true;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(`play-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    if (tabId === 'market-simulator') updateTradeSummary();
}

function startOverReplay(tabId) {
    const state = tabStates[tabId];
    const config = tabConfig[tabId];
    if (!state.chartData) return;

    if (state.isReplaying || state.isPaused) {
        clearInterval(state.replayInterval);
        state.isReplaying = false;
        state.isPaused = false;
    }

    state.currentReplayIndex = 0;

    const playButton = document.getElementById(`play-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${config.replayPrefix ? '-' + config.replayPrefix : ''}`);

    Plotly.purge(config.chartContainerId);
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
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = state.chartData.count === 0;
    timestampDisplay.textContent = 'Current Time: --:--:--';
    if (tabId === 'market-simulator') updateTradeSummary();

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}_${tabId}`
    });
}

function stopReplay(tabId) {
    const state = tabStates[tabId];
    const config = tabConfig[tabId];
    if (!state.isReplaying && !state.isPaused) return;

    state.isReplaying = false;
    state.isPaused = false;
    clearInterval(state.replayInterval);

    const playButton = document.getElementById(`play-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const timestampDisplay = document.getElementById(`replay-timestamp${config.replayPrefix ? '-' + config.replayPrefix : ''}`);

    if (tabId === 'market-simulator' && state.openPosition && state.currentReplayIndex > 0 && state.currentReplayIndex <= state.chartData.count) {
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
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`
        });
    }

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
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    timestampDisplay.textContent = 'Current Time: --:--:--';
    if (tabId === 'market-simulator') updateTradeSummary();
}

function prevCandle(tabId) {
    const state = tabStates[tabId];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex <= 0) return;

    state.currentReplayIndex--;
    updateChartToIndex(tabId);
}

function nextCandle(tabId) {
    const state = tabStates[tabId];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex >= state.chartData.count) return;

    state.currentReplayIndex++;
    updateChartToIndex(tabId);
}

function updateChartToIndex(tabId) {
    const state = tabStates[tabId];
    const config = tabConfig[tabId];
    const chartContainer = document.getElementById(config.chartContainerId);
    const timestampDisplay = document.getElementById(`replay-timestamp${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${config.replayPrefix ? '-' + config.replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${config.replayPrefix ? '-' + config.replayPrefix : ''}`);

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
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], layout, { responsive: true });

    timestampDisplay.textContent = state.currentReplayIndex > 0
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    if (tabId === 'market-simulator') updateTradeSummary();
}

function updateReplaySpeed(tabId) {
    const state = tabStates[tabId];
    if (state.isReplaying) {
        pauseReplay(tabId);
        startReplay(tabId);
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDirection = document.getElementById('gap-direction-select').value;
    const ticker = document.getElementById('ticker-select-gap').value;
    const gapDatesContainer = document.getElementById('gap-dates');
    const form = document.getElementById('gap-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');

    const rateLimitResetTime = localStorage.getItem('gapDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()}.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection || !ticker) {
        gapDatesContainer.innerHTML = '<p>Please select a gap size, day, direction, and ticker.</p>';
        return;
    }

    try {
        const url = `/api/gaps?ticker=${encodeURIComponent(ticker)}&gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
        const response = await fetch(url);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${message}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            localStorage.setItem('gapDatesRateLimitReset', resetTime * 1000);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Gap Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('gapDatesRateLimitReset');
                gapDatesContainer.innerHTML = '<p>Please select a gap size, day of the week, direction, and ticker to view gap dates.</p>';
            }, resetTime * 1000 - Date.now());
            alert(message);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.dates || data.dates.length === 0) {
            gapDatesContainer.innerHTML = `<p>No gaps found for ${ticker} with the selected criteria.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.id = 'gap-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openTab('gap-analysis');
                document.getElementById('ticker-select-gap').value = ticker;
                document.getElementById('date-gap').value = date;
                loadChart(new Event('submit'), 'gap-analysis');
                gtag('event', 'gap_date_click', {
                    'event_category': 'Gap Analysis',
                    'event_label': `${ticker}_${date}_${gapDirection}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        gapDatesContainer.innerHTML = '';
        gapDatesContainer.appendChild(ul);
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates: ' + error.message + '</p>';
        alert('Failed to load gap dates: ' + error.message);
    }
}

async function loadEventDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="filter-type"]:checked').value;
    const eventDatesContainer = document.getElementById('event-dates');
    const form = document.getElementById('events-form');
    const button = form.querySelector('button[type="submit"]');
    const selects = form.querySelectorAll('select');
    const ticker = document.getElementById('ticker-select-events').value;

    const rateLimitResetTime = localStorage.getItem('eventDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()}.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    let url, eventType, year, bin;
    if (filterType === 'year') {
        eventType = document.getElementById('event-type-select').value;
        year = document.getElementById('year-select').value;
        if (!eventType || !year || !ticker) {
            eventDatesContainer.innerHTML = '<p>Please select an event type, year, and ticker.</p>';
            return;
        }
        url = `/api/events?ticker=${encodeURIComponent(ticker)}&event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
    } else {
        eventType = document.getElementById('bin-event-type-select').value;
        bin = document.getElementById('bin-select').value;
        if (!eventType || !bin || !ticker) {
            eventDatesContainer.innerHTML = '<p>Please select an event type, economic impact range, and ticker.</p>';
            return;
        }
        url = `/api/economic_events?ticker=${encodeURIComponent(ticker)}&event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
    }

    try {
        const response = await fetch(url);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${message}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            localStorage.setItem('eventDatesRateLimitReset', resetTime * 1000);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Event Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('eventDatesRateLimitReset');
                eventDatesContainer.innerHTML = '<p>Select filters to view dates with events.</p>';
            }, resetTime * 1000 - Date.now());
            alert(message);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.dates || data.dates.length === 0) {
            eventDatesContainer.innerHTML = `<p>No events found for ${ticker} with the selected criteria.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.id = 'event-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openTab('events-analysis');
                document.getElementById('ticker-select-events').value = ticker;
                document.getElementById('date-events').value = date;
                loadChart(new Event('submit'), 'events-analysis');
                gtag('event', 'event_date_click', {
                    'event_category': 'Event Analysis',
                    'event_label': `${ticker}_${date}_${eventType}${bin ? '_' + bin : ''}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        eventDatesContainer.innerHTML = '';
        eventDatesContainer.appendChild(ul);
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesContainer.innerHTML = '<p>Failed to load event dates: ' + error.message + '</p>';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const earningsDatesContainer = document.getElementById('earnings-dates');
    const form = document.getElementById('earnings-form');
    const button = form.querySelector('button[id="find-earnings"]');
    const selects = form.querySelectorAll('select');

    const rateLimitResetTime = localStorage.getItem('earningsDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()}.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    const ticker = currentFilterType === 'ticker-outcome'
        ? document.getElementById('earnings-ticker-select').value
        : document.getElementById('earnings-ticker-only-select').value;
    const bin = currentFilterType === 'ticker-outcome' ? document.getElementById('earnings-bin-select').value : '';

    if (!ticker) {
        earningsDatesContainer.innerHTML = '<p>Please select a ticker.</p>';
        return;
    }

    try {
        const url = bin
            ? `/api/earnings_by_bin?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`
            : `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${message}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            localStorage.setItem('earningsDatesRateLimitReset', resetTime * 1000);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Earnings Dates';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('earningsDatesRateLimitReset');
                earningsDatesContainer.innerHTML = '<p>Select a ticker and optionally an earnings outcome to view earnings dates.</p>';
            }, resetTime * 1000 - Date.now());
            alert(message);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.dates || data.dates.length === 0) {
            earningsDatesContainer.innerHTML = `<p>No earnings found for ${ticker}${bin ? ' with outcome ' + bin : ''}.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.id = 'earnings-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                openTab('earnings-analysis');
                document.getElementById(currentFilterType === 'ticker-outcome' ? 'earnings-ticker-select' : 'earnings-ticker-only-select').value = ticker;
                document.getElementById('date-earnings').value = date;
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
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        earningsDatesContainer.innerHTML = '<p>Failed to load earnings dates: ' + error.message + '</p>';
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

    const rateLimitResetTime = localStorage.getItem('gapInsightsRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()}.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        selects.forEach(select => select.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection) {
        insightsContainer.innerHTML = '<p>Please select a gap size, day of the week, and gap direction.</p>';
        return;
    }

    try {
        const url = `/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
        const response = await fetch(url);
        if (response.status === 429) {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const message = `Rate limit exceeded. Please wait until ${new Date(parseInt(resetTime) * 1000).toLocaleTimeString()}.`;
            insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">${message}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            localStorage.setItem('gapInsightsRateLimitReset', resetTime * 1000);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Get Insights';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('gapInsightsRateLimitReset');
                insightsContainer.innerHTML = '<p>Select a gap size, day of the week, and gap direction to view gap insights.</p>';
            }, resetTime * 1000 - Date.now());
            alert(message);
            return;
        }

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.insights || Object.keys(data.insights).length === 0) {
            insightsContainer.innerHTML = '<p>No gap insights found for the selected criteria.</p>';
            return;
        }

        const insights = data.insights;
        const container = document.createElement('div');
        container.className = 'insights-container';
        container.innerHTML = `<h3>QQQ Gap Insights for ${gapSize} ${gapDirection} gaps on ${day}</h3>`;

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

        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `QQQ_${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        insightsContainer.innerHTML = '<p>Failed to load gap insights: ' + error.message + '</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}