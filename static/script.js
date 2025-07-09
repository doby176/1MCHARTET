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
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners for Market Simulator
    document.getElementById('play-replay').addEventListener('click', () => startReplay('market-simulator'));
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay('market-simulator'));
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay('market-simulator'));
    document.getElementById('restart-replay').addEventListener('click', () => startReplay('market-simulator')); // Restart is same as start
    document.getElementById('prev-candle').addEventListener('click', () => prevCandle('market-simulator'));
    document.getElementById('next-candle').addEventListener('click', () => nextCandle('market-simulator'));
    document.getElementById('replay-speed').addEventListener('change', () => updateReplaySpeed('market-simulator'));

    // Replay control listeners for Nasdaq Gap Analysis
    document.getElementById('play-replay-gap').addEventListener('click', () => startReplay('gap-analysis'));
    document.getElementById('pause-replay-gap').addEventListener('click', () => pauseReplay('gap-analysis'));
    document.getElementById('start-over-replay-gap').addEventListener('click', () => startOverReplay('gap-analysis'));
    document.getElementById('restart-replay-gap').addEventListener('click', () => startReplay('gap-analysis'));
    document.getElementById('prev-candle-gap').addEventListener('click', () => prevCandle('gap-analysis'));
    document.getElementById('next-candle-gap').addEventListener('click', () => nextCandle('gap-analysis'));
    document.getElementById('replay-speed-gap').addEventListener('change', () => updateReplaySpeed('gap-analysis'));

    // Replay control listeners for News Event Analysis
    document.getElementById('play-replay-events').addEventListener('click', () => startReplay('events-analysis'));
    document.getElementById('pause-replay-events').addEventListener('click', () => pauseReplay('events-analysis'));
    document.getElementById('start-over-replay-events').addEventListener('click', () => startOverReplay('events-analysis'));
    document.getElementById('restart-replay-events').addEventListener('click', () => startReplay('events-analysis'));
    document.getElementById('prev-candle-events').addEventListener('click', () => prevCandle('events-analysis'));
    document.getElementById('next-candle-events').addEventListener('click', () => nextCandle('events-analysis'));
    document.getElementById('replay-speed-events').addEventListener('change', () => updateReplaySpeed('events-analysis'));

    // Replay control listeners for Earnings Analysis
    document.getElementById('play-replay-earnings').addEventListener('click', () => startReplay('earnings-analysis'));
    document.getElementById('pause-replay-earnings').addEventListener('click', () => pauseReplay('earnings-analysis'));
    document.getElementById('start-over-replay-earnings').addEventListener('click', () => startOverReplay('earnings-analysis'));
    document.getElementById('restart-replay-earnings').addEventListener('click', () => startReplay('earnings-analysis'));
    document.getElementById('prev-candle-earnings').addEventListener('click', () => prevCandle('earnings-analysis'));
    document.getElementById('next-candle-earnings').addEventListener('click', () => nextCandle('earnings-analysis'));
    document.getElementById('replay-speed-earnings').addEventListener('change', () => updateReplaySpeed('earnings-analysis'));

    // Trade simulator listeners (exclusive to Market Simulator)
    document.getElementById('buy-trade').addEventListener('click', placeBuyTrade);
    document.getElementById('sell-trade').addEventListener('click', placeSellTrade);

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

    // Initialize ticker selects for both tabs
    document.getElementById('ticker-select').addEventListener('change', () => loadDates('ticker-select', 'date'));
    document.getElementById('ticker-select-gap').addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
});

// Replay states for each tab
const replayStates = {
    'market-simulator': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false,
        openPosition: null,
        tradeHistory: [],
        POSITION_SIZE: 100
    },
    'gap-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false
    },
    'events-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false
    },
    'earnings-analysis': {
        chartData: null,
        replayInterval: null,
        currentReplayIndex: 0,
        isReplaying: false,
        isPaused: false
    }
};

// Tab configuration for chart loading
const tabConfig = {
    'market-simulator': {
        tickerSelectId: 'ticker-select',
        dateInputId: 'date',
        chartContainerId: 'plotly-chart',
        formId: 'stock-form',
        replayControlsId: 'replay-controls',
        restrictHours: false
    },
    'gap-analysis': {
        tickerSelectId: 'ticker-select-gap',
        dateInputId: 'date-gap',
        chartContainerId: 'plotly-chart-gap',
        formId: 'stock-form-gap',
        replayControlsId: 'replay-controls-gap',
        restrictHours: true
    },
    'events-analysis': {
        tickerSelectId: 'ticker-select-gap', // Reuse gap ticker select
        dateInputId: 'date-gap', // Reuse gap date input
        chartContainerId: 'plotly-chart-events',
        formId: 'stock-form-gap', // Reuse gap form
        replayControlsId: 'replay-controls-events',
        restrictHours: true
    },
    'earnings-analysis': {
        tickerSelectId: 'earnings-ticker-select', // Use earnings ticker select
        dateInputId: 'date-gap', // Reuse gap date input
        chartContainerId: 'plotly-chart-earnings',
        formId: 'stock-form-gap', // Reuse gap form
        replayControlsId: 'replay-controls-earnings',
        restrictHours: true
    }
};

// Helper function to get replay element IDs
function getReplayElementId(baseId, tabId) {
    const suffix = {
        'market-simulator': '',
        'gap-analysis': '-gap',
        'events-analysis': '-events',
        'earnings-analysis': '-earnings'
    };
    return baseId + suffix[tabId];
}

// Bin options for each event type (unchanged)
const binOptions = {
    CPI: ['<0%', '0-1%', '1-2%', '2-3%', '3-5%', '>5%'],
    PPI: ['<0%', '0-2%', '2-4%', '4-8%', '>8%'],
    NFP: ['<0K', '0-100K', '100-200K', '200-300K', '>300K'],
    FOMC: ['0-1%', '1-2%', '2-3%', '3-4%', '>4%']
};

// Earnings outcome options with explanations (unchanged)
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
    tickerSelect.disabled = true;
    tickerSelectGap.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    tickerSelectGap.innerHTML = '<option value="">Loading tickers...</option>';
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
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option.cloneNode(true));
            tickerSelectGap.appendChild(option);
        });
        tickerSelect.disabled = false;
        tickerSelectGap.disabled = false;
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        tickerSelectGap.innerHTML = '<option value="">Error loading tickers</option>';
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
    const config = tabConfig[tabId];
    if (!config) {
        console.error(`Invalid tabId: ${tabId}`);
        return;
    }

    const { tickerSelectId, dateInputId, chartContainerId, formId, replayControlsId, restrictHours } = config;
    const ticker = document.getElementById(tickerSelectId).value;
    const date = document.getElementById(dateInputId).value;
    const chartContainer = document.getElementById(chartContainerId);
    const form = document.getElementById(formId);
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');
    const replayControls = document.getElementById(replayControlsId);

    // Replay control elements
    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    const prevButton = document.getElementById(getReplayElementId('prev-candle', tabId));
    const nextButton = document.getElementById(getReplayElementId('next-candle', tabId));

    // Trade buttons (only for Market Simulator)
    const buyButton = tabId === 'market-simulator' ? document.getElementById('buy-trade') : null;
    const sellButton = tabId === 'market-simulator' ? document.getElementById('sell-trade') : null;

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem(`chartRateLimitReset_${tabId}`);
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

    console.log(`Loading chart for ticker=${ticker}, date=${date}, restrict_hours=${restrictHours}, tab=${tabId}`);
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

        // Store chart data and reset replay state
        replayStates[tabId].chartData = data.chart_data;
        replayStates[tabId].currentReplayIndex = 0;
        replayStates[tabId].isReplaying = false;
        replayStates[tabId].isPaused = false;
        if (replayStates[tabId].replayInterval) clearInterval(replayStates[tabId].replayInterval);

        // Reset trade simulator state (only for Market Simulator)
        if (tabId === 'market-simulator') {
            replayStates[tabId].openPosition = null;
            replayStates[tabId].tradeHistory = [];
            updateTradeSummary();
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
            title: `${data.chart_data.ticker} Candlestick Chart - ${data.chart_data.date}${restrictHours ? ' (Regular Hours)' : ''}`,
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
        restartButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = true;
        document.getElementById(getReplayElementId('replay-start-time', tabId)).value = '';
        document.getElementById(getReplayElementId('replay-timestamp', tabId)).textContent = 'Current Time: --:--:--';

        // Handle trade buttons (only for Market Simulator)
        if (tabId === 'market-simulator') {
            buyButton.disabled = true;
            sellButton.disabled = true;
        }

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}${restrictHours ? '_regular_hours' : ''}`,
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
    const state = replayStates['market-simulator'];
    if (!state.isReplaying || !state.chartData || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count) return;
    if (state.openPosition) {
        alert('Close the current position before opening a new one.');
        return;
    }
    state.openPosition = {
        type: 'buy',
        price: state.chartData.close[state.currentReplayIndex - 1],
        shares: state.POSITION_SIZE,
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
    const state = replayStates['market-simulator'];
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
        console.log(`Closed position with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary();
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`
        });
    } else {
        // Open new sell position
        state.openPosition = {
            type: 'sell',
            price: state.chartData.close[state.currentReplayIndex - 1],
            shares: state.POSITION_SIZE,
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
    const state = replayStates['market-simulator'];
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryEl = document.getElementById('trade-history');
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    // Update button states
    buyButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count || state.openPosition?.type === 'sell';
    sellButton.disabled = !state.isReplaying || state.currentReplayIndex <= 0 || state.currentReplayIndex > state.chartData.count;

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

function startReplay(tabId) {
    const state = replayStates[tabId];
    const config = tabConfig[tabId];
    if (!state.chartData || !config) return;

    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    const prevButton = document.getElementById(getReplayElementId('prev-candle', tabId));
    const nextButton = document.getElementById(getReplayElementId('next-candle', tabId));
    const chartContainer = document.getElementById(config.chartContainerId);
    const timestampDisplay = document.getElementById(getReplayElementId('replay-timestamp', tabId));
    const startTimeInput = document.getElementById(getReplayElementId('replay-start-time', tabId)).value;
    const replaySpeed = parseInt(document.getElementById(getReplayElementId('replay-speed', tabId)).value);

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
    restartButton.disabled = false;
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;

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
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)${config.restrictHours ? ' (Regular Hours)' : ''}`,
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

    // Update timestamp display and trade summary (if Market Simulator)
    timestampDisplay.textContent = state.currentReplayIndex > 0 
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    if (tabId === 'market-simulator') updateTradeSummary();

    // Replay loop
    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= state.chartData.count) {
            stopReplay(tabId);
            return;
        }

        // Add next candle
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

        // Update timestamp display and button states
        timestampDisplay.textContent = `Current Time: ${state.chartData.timestamp[state.currentReplayIndex].split(' ')[1]}`;
        prevButton.disabled = state.currentReplayIndex <= 0;
        nextButton.disabled = state.currentReplayIndex + 1 >= state.chartData.count;
        startOverButton.disabled = state.currentReplayIndex <= 0;
        restartButton.disabled = false;
        if (tabId === 'market-simulator') updateTradeSummary();

        state.currentReplayIndex++;
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}`,
        'tab': tabId
    });
}

function pauseReplay(tabId) {
    const state = replayStates[tabId];
    if (!state.isReplaying) return;
    state.isReplaying = false;
    state.isPaused = true;
    clearInterval(state.replayInterval);
    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    restartButton.disabled = false;
    if (tabId === 'market-simulator') updateTradeSummary();
}

function startOverReplay(tabId) {
    const state = replayStates[tabId];
    const config = tabConfig[tabId];
    if (!state.chartData || !config) return;

    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    const prevButton = document.getElementById(getReplayElementId('prev-candle', tabId));
    const nextButton = document.getElementById(getReplayElementId('next-candle', tabId));
    const timestampDisplay = document.getElementById(getReplayElementId('replay-timestamp', tabId));
    const chartContainer = document.getElementById(config.chartContainerId);

    // Stop any ongoing replay
    if (state.isReplaying || state.isPaused) {
        clearInterval(state.replayInterval);
        state.isReplaying = false;
        state.isPaused = false;
    }

    // Reset to the beginning
    state.currentReplayIndex = 0;

    // Update chart to show no candles (initial state)
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
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)${config.restrictHours ? ' (Regular Hours)' : ''}`,
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
    nextButton.disabled = state.chartData.count === 0;

    // Reset timestamp and trade summary (if Market Simulator)
    timestampDisplay.textContent = 'Current Time: --:--:--';
    if (tabId === 'market-simulator') updateTradeSummary();

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}`,
        'tab': tabId
    });
}

function stopReplay(tabId) {
    const state = replayStates[tabId];
    const config = tabConfig[tabId];
    if (!state.isReplaying && !state.isPaused) return;
    state.isReplaying = false;
    state.isPaused = false;
    clearInterval(state.replayInterval);

    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    const prevButton = document.getElementById(getReplayElementId('prev-candle', tabId));
    const nextButton = document.getElementById(getReplayElementId('next-candle', tabId));
    const chartContainer = document.getElementById(config.chartContainerId);
    const timestampDisplay = document.getElementById(getReplayElementId('replay-timestamp', tabId));

    // Close open position if any (only for Market Simulator)
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
        console.log(`Closed position at replay end with P/L: $${pnl.toFixed(2)}`);
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${state.tradeHistory[state.tradeHistory.length - 1].type}_${state.chartData.ticker}_${state.chartData.date}_${state.tradeHistory[state.tradeHistory.length - 1].timestamp}`
        });
    }

    // Update button states
    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    restartButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;

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
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date}${config.restrictHours ? ' (Regular Hours)' : ''}`,
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

    timestampDisplay.textContent = 'Current Time: --:--:--';
    if (tabId === 'market-simulator') updateTradeSummary();
}

function prevCandle(tabId) {
    const state = replayStates[tabId];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex <= 0) return;
    state.currentReplayIndex--;
    updateChartToIndex(tabId);
}

function nextCandle(tabId) {
    const state = replayStates[tabId];
    if (!state.chartData || state.isReplaying || state.currentReplayIndex >= state.chartData.count) return;
    state.currentReplayIndex++;
    updateChartToIndex(tabId);
}

function updateChartToIndex(tabId) {
    const state = replayStates[tabId];
    const config = tabConfig[tabId];
    if (!state.chartData || !config) return;

    const playButton = document.getElementById(getReplayElementId('play-replay', tabId));
    const pauseButton = document.getElementById(getReplayElementId('pause-replay', tabId));
    const startOverButton = document.getElementById(getReplayElementId('start-over-replay', tabId));
    const restartButton = document.getElementById(getReplayElementId('restart-replay', tabId));
    const prevButton = document.getElementById(getReplayElementId('prev-candle', tabId));
    const nextButton = document.getElementById(getReplayElementId('next-candle', tabId));
    const timestampDisplay = document.getElementById(getReplayElementId('replay-timestamp', tabId));
    const chartContainer = document.getElementById(config.chartContainerId);

    // Update chart to current index
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
        title: `${state.chartData.ticker} Candlestick Chart - ${state.chartData.date} (Replay)${config.restrictHours ? ' (Regular Hours)' : ''}`,
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
    playButton.disabled = state.isReplaying;
    pauseButton.disabled = !state.isReplaying;
    startOverButton.disabled = state.currentReplayIndex <= 0;
    restartButton.disabled = state.currentReplayIndex <= 0;
    prevButton.disabled = state.currentReplayIndex <= 0;
    nextButton.disabled = state.currentReplayIndex >= state.chartData.count;

    // Update timestamp
    timestampDisplay.textContent = state.currentReplayIndex > 0 
        ? `Current Time: ${state.chartData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    // Update trade summary (only for Market Simulator)
    if (tabId === 'market-simulator') updateTradeSummary();

    gtag('event', 'replay_step', {
        'event_category': 'Chart',
        'event_label': `${state.chartData.ticker}_${state.chartData.date}_${state.currentReplayIndex}`,
        'tab': tabId
    });
}

function updateReplaySpeed(tabId) {
    const state = replayStates[tabId];
    if (!state.isReplaying || state.isPaused) return;
    clearInterval(state.replayInterval);
    const replaySpeed = parseInt(document.getElementById(getReplayElementId('replay-speed', tabId)).value);
    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= state.chartData.count) {
            stopReplay(tabId);
            return;
        }
        nextCandle(tabId);
    }, replaySpeed);
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
    const gapDirection = document.getElementById('gap-direction-select').value;
    const gapDatesList = document.getElementById('gap-dates-list');
    const gapDatesContainer = document.getElementById('gap-dates');
    const button = document.getElementById('gap-form').querySelector('button[type="submit"]');
    const inputs = document.getElementById('gap-form').querySelectorAll('select, input');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('gapDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection) {
        gapDatesContainer.innerHTML = '<p>Please select a gap size, day, and gap direction.</p>';
        gapDatesList.innerHTML = '';
        return;
    }

    console.log(`Loading gap dates for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    const url = `/api/gap_dates?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching URL:', url);
    gapDatesContainer.innerHTML = '<p>Loading gap dates...</p>';
    gapDatesList.innerHTML = '';
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
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('gapDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Gap Dates';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem('gapDatesRateLimitReset');
                gapDatesContainer.innerHTML = '<p>Please select a gap size, day, and direction to view dates with gaps.</p>';
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
            console.error('Error fetching gap dates:', data.error);
            gapDatesContainer.innerHTML = `<p>${data.error}</p>`;
            gapDatesList.innerHTML = '';
            return;
        }
        console.log('Fetched gap dates:', data.dates);
        if (!data.dates || data.dates.length === 0) {
            gapDatesContainer.innerHTML = '<p>No gap dates found for the selected criteria.</p>';
            gapDatesList.innerHTML = '';
            return;
        }
        gapDatesContainer.innerHTML = '';
        gapDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('date-gap').value = date;
                const tickerSelect = document.getElementById('ticker-select-gap');
                if (tickerSelect.value) {
                    loadChart(new Event('submit'), 'gap-analysis');
                } else {
                    alert('Please select a ticker to load the chart.');
                }
            });
            gapDatesList.appendChild(li);
        });
        gapDatesContainer.appendChild(gapDatesList);

        gtag('event', 'gap_dates_load', {
            'event_category': 'Gap Analysis',
            'event_label': `${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates: ' + error.message + '. Please try again later.</p>';
        gapDatesList.innerHTML = '';
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
    const eventDatesList = document.getElementById('event-dates-list');
    const eventDatesContainer = document.getElementById('event-dates');
    const button = document.getElementById('events-form').querySelector('button[type="submit"]');
    const inputs = document.getElementById('events-form').querySelectorAll('select, input');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('eventDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!eventType || (filterType === 'year' && !year) || (filterType === 'bin' && !bin)) {
        eventDatesContainer.innerHTML = '<p>Please select an event type and ' + (filterType === 'year' ? 'year' : 'economic impact range') + '.</p>';
        eventDatesList.innerHTML = '';
        return;
    }

    console.log(`Loading event dates for event_type=${eventType}, filter=${filterType}, ${filterType === 'year' ? 'year=' + year : 'bin=' + bin}`);
    const url = filterType === 'year'
        ? `/api/event_dates?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`
        : `/api/event_dates?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
    console.log('Fetching URL:', url);
    eventDatesContainer.innerHTML = '<p>Loading event dates...</p>';
    eventDatesList.innerHTML = '';
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
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('eventDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Event Dates';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem('eventDatesRateLimitReset');
                eventDatesContainer.innerHTML = '<p>Please select filters to view dates with events.</p>';
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
            console.error('Error fetching event dates:', data.error);
            eventDatesContainer.innerHTML = `<p>${data.error}</p>`;
            eventDatesList.innerHTML = '';
            return;
        }
        console.log('Fetched event dates:', data.dates);
        if (!data.dates || data.dates.length === 0) {
            eventDatesContainer.innerHTML = '<p>No event dates found for the selected criteria.</p>';
            eventDatesList.innerHTML = '';
            return;
        }
        eventDatesContainer.innerHTML = '';
        eventDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('date-gap').value = date;
                const tickerSelect = document.getElementById('ticker-select-gap');
                if (tickerSelect.value) {
                    loadChart(new Event('submit'), 'events-analysis');
                } else {
                    alert('Please select a ticker to load the chart.');
                }
            });
            eventDatesList.appendChild(li);
        });
        eventDatesContainer.appendChild(eventDatesList);

        gtag('event', 'event_dates_load', {
            'event_category': 'Events Analysis',
            'event_label': `${eventType}_${filterType === 'year' ? year : bin}`
        });
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesContainer.innerHTML = '<p>Failed to load event dates: ' + error.message + '. Please try again later.</p>';
        eventDatesList.innerHTML = '';
        alert('Failed to load event dates: ' + error.message);
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    const ticker = filterType === 'ticker-outcome'
        ? document.getElementById('earnings-ticker-select').value
        : document.getElementById('earnings-ticker-only-select').value;
    const bin = document.getElementById('earnings-bin-select').value;
    const earningsDatesList = document.getElementById('earnings-dates-list');
    const earningsDatesContainer = document.getElementById('earnings-dates');
    const button = document.getElementById('earnings-form').querySelector('button[type="submit"]');
    const inputs = document.getElementById('earnings-form').querySelectorAll('select, input');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('earningsDatesRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        earningsDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || (filterType === 'ticker-outcome' && !bin)) {
        earningsDatesContainer.innerHTML = '<p>Please select a ticker and ' + (filterType === 'ticker-outcome' ? 'earnings outcome' : '') + '.</p>';
        earningsDatesList.innerHTML = '';
        return;
    }

    console.log(`Loading earnings dates for ticker=${ticker}, filter=${filterType}${filterType === 'ticker-outcome' ? ', bin=' + bin : ''}`);
    const url = filterType === 'ticker-outcome'
        ? `/api/earnings_dates?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`
        : `/api/earnings_dates?ticker=${encodeURIComponent(ticker)}`;
    console.log('Fetching URL:', url);
    earningsDatesContainer.innerHTML = '<p>Loading earnings dates...</p>';
    earningsDatesList.innerHTML = '';
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
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('earningsDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Earnings Dates';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem('earningsDatesRateLimitReset');
                earningsDatesContainer.innerHTML = '<p>Please select a ticker and optionally an earnings outcome to view earnings dates.</p>';
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
            console.error('Error fetching earnings dates:', data.error);
            earningsDatesContainer.innerHTML = `<p>${data.error}</p>`;
            earningsDatesList.innerHTML = '';
            return;
        }
        console.log('Fetched earnings dates:', data.dates);
        if (!data.dates || data.dates.length === 0) {
            earningsDatesContainer.innerHTML = '<p>No earnings dates found for the selected criteria.</p>';
            earningsDatesList.innerHTML = '';
            return;
        }
        earningsDatesContainer.innerHTML = '';
        earningsDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.textContent = date;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                document.getElementById('date-gap').value = date;
                document.getElementById('ticker-select-gap').value = ticker; // Auto-select the ticker
                loadChart(new Event('submit'), 'earnings-analysis');
            });
            earningsDatesList.appendChild(li);
        });
        earningsDatesContainer.appendChild(earningsDatesList);

        gtag('event', 'earnings_dates_load', {
            'event_category': 'Earnings Analysis',
            'event_label': `${ticker}_${filterType === 'ticker-outcome' ? bin : 'all'}`
        });
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        earningsDatesContainer.innerHTML = '<p>Failed to load earnings dates: ' + error.message + '. Please try again later.</p>';
        earningsDatesList.innerHTML = '';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-insights-size-select').value;
    const day = document.getElementById('gap-insights-day-select').value;
    const gapDirection = document.getElementById('gap-insights-direction-select').value;
    const gapInsightsResults = document.getElementById('gap-insights-results');
    const button = document.getElementById('gap-insights-form').querySelector('button[type="submit"]');
    const inputs = document.getElementById('gap-insights-form').querySelectorAll('select, input');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('gapInsightsRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        gapInsightsResults.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!gapSize || !day || !gapDirection) {
        gapInsightsResults.innerHTML = '<p>Please select a gap size, day, and gap direction.</p>';
        return;
    }

    console.log(`Loading gap insights for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    const url = `/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`;
    console.log('Fetching URL:', url);
    gapInsightsResults.innerHTML = '<p>Loading gap insights...</p>';
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
            gapInsightsResults.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('gapInsightsRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Get Insights';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem('gapInsightsRateLimitReset');
                gapInsightsResults.innerHTML = '<p>Please select a gap size, day, and direction to view Nasdaq gap insights and statistics.</p>';
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
            console.error('Error fetching gap insights:', data.error);
            gapInsightsResults.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        console.log('Fetched gap insights:', data);
        const totalGaps = data.total_gaps || 0;
        const filledGaps = data.filled_gaps || 0;
        const fillRate = totalGaps > 0 ? ((filledGaps / totalGaps) * 100).toFixed(2) : '0.00';
        const medianMoveBeforeFill = data.median_move_before_fill ? data.median_move_before_fill.toFixed(2) : 'N/A';
        const medianFillTime = data.median_fill_time ? data.median_fill_time.toFixed(2) : 'N/A';
        const maxAdverseMove = data.max_adverse_move ? data.max_adverse_move.toFixed(2) : 'N/A';
        const maxUnfilledMove = data.max_unfilled_move ? data.max_unfilled_move.toFixed(2) : 'N/A';

        gapInsightsResults.innerHTML = `
            <h3>Gap Insights: ${gapSize} ${gapDirection} gaps on ${day}</h3>
            <p><strong>Total Gaps:</strong> ${totalGaps}</p>
            <p><strong>Number of Gaps Filled:</strong> ${filledGaps}</p>
            <p><strong>Fill Rate:</strong> ${fillRate}%</p>
            <p><strong>Median Move Before Fill:</strong> ${medianMoveBeforeFill}%</p>
            <p><strong>Median Fill Time:</strong> ${medianFillTime} minutes</p>
            <p><strong>Median Max Adverse Move:</strong> ${maxAdverseMove}%</p>
            <p><strong>Median Max Move for Unfilled Gaps:</strong> ${maxUnfilledMove}%</p>
        `;
        if (totalGaps > 0) {
            const chartData = {
                x: data.dates,
                y: data.gap_sizes,
                type: 'bar',
                name: 'Gap Sizes',
                marker: { color: '#007bff' }
            };
            const layout = {
                title: `Gap Sizes for ${gapSize} ${gapDirection} gaps on ${day}`,
                xaxis: { title: 'Date', type: 'date' },
                yaxis: { title: 'Gap Size (%)' },
                margin: { t: 50, b: 50, l: 50, r: 50 },
                plot_bgcolor: '#ffffff',
                paper_bgcolor: '#ffffff'
            };
            Plotly.newPlot('gap-insights-results', [chartData], layout, { responsive: true });
        }

        gtag('event', 'gap_insights_load', {
            'event_category': 'Gap Insights',
            'event_label': `${gapSize}_${day}_${gapDirection}`
        });
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        gapInsightsResults.innerHTML = '<p>Failed to load gap insights: ' + error.message + '. Please try again later.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}