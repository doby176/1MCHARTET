document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    loadBinOptions();
    populateEarningsOutcomes();
    document.getElementById('stock-form').addEventListener('submit', loadChart);
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners
    document.getElementById('play-replay').addEventListener('click', startReplay);
    document.getElementById('pause-replay').addEventListener('click', pauseReplay);
    document.getElementById('start-over-replay').addEventListener('click', startOverReplay);
    document.getElementById('prev-candle').addEventListener('click', prevCandle);
    document.getElementById('next-candle').addEventListener('click', nextCandle);
    document.getElementById('replay-speed').addEventListener('change', updateReplaySpeed);

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

    // Add input formatting for replay-start-time
    const startTimeInput = document.getElementById('replay-start-time');
    startTimeInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^0-9:]/g, ''); // Allow only digits and colon
        let cursorPosition = e.target.selectionStart;

        // Split into parts before and after the colon
        const parts = value.split(':');
        let hours = parts[0] || '';
        let minutes = parts[1] || '';

        // Handle hours input
        if (hours.length > 2) {
            hours = hours.slice(0, 2); // Limit hours to 2 digits
        }
        if (hours.length === 2 && parseInt(hours) > 23) {
            hours = '23'; // Cap hours at 23
        }

        // Auto-insert colon after valid hours when needed
        if (hours.length >= 1 && !value.includes(':') && (cursorPosition >= hours.length || value.length >= 3)) {
            value = hours + ':';
            cursorPosition = value.length; // Move cursor after colon
        }

        // Handle minutes input
        if (minutes.length > 2) {
            minutes = minutes.slice(0, 2); // Limit minutes to 2 digits
        }
        if (minutes.length === 2 && parseInt(minutes) > 59) {
            minutes = '59'; // Cap minutes at 59
        }

        // Reconstruct value
        value = minutes ? `${hours}:${minutes}` : hours;
        if (value.length > 5) {
            value = value.slice(0, 5); // Limit to HH:MM
        }

        e.target.value = value;

        // Restore cursor position
        if (value.includes(':')) {
            if (cursorPosition <= hours.length) {
                e.target.setSelectionRange(cursorPosition, cursorPosition);
            } else {
                e.target.setSelectionRange(cursorPosition, cursorPosition);
            }
        }
    });

    // Validate on blur to ensure proper format
    startTimeInput.addEventListener('blur', (e) => {
        const value = e.target.value;
        if (value && !value.match(/^[0-2]?[0-9]:[0-5][0-9]$/)) {
            e.target.value = '';
            alert('Please enter a valid time in HH:MM format (e.g., 09:45).');
        } else if (value.match(/^[0-9]:[0-5][0-9]$/)) {
            e.target.value = '0' + value; // Pad single-digit hour on blur
        }
    });
});

// Global variables for replay
let chartData = null; // Store chart data for replay
let replayInterval = null; // Store interval ID for replay
let currentReplayIndex = 0; // Track current candle index
let isReplaying = false; // Track replay state
let isPaused = false; // Track pause state

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
    tickerSelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
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
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option);
        });
        tickerSelect.disabled = false;
        tickerSelect.addEventListener('change', loadDates);
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
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

async function loadChart(event) {
    event.preventDefault();
    const ticker = document.getElementById('ticker-select').value;
    const date = document.getElementById('date').value;
    const chartContainer = document.getElementById('plotly-chart');
    const replayControls = document.getElementById('replay-controls');
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const form = document.getElementById('stock-form');
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

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

    console.log(`Loading chart for ticker=${ticker}, date=${date}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`;
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
                localStorage.removeItem('chartRateLimitReset');
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
        chartData = data.chart_data;
        currentReplayIndex = 0;
        isReplaying = false;
        isPaused = false;
        if (replayInterval) clearInterval(replayInterval);

        // Render full chart initially
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
        Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, {
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
        document.getElementById('replay-start-time').value = '';
        document.getElementById('replay-timestamp').textContent = 'Current Time: --:--:--';

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}`
        });
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '. Please try again later.</p>';
        replayControls.style.display = 'none';
        alert('Failed to load chart: ' + error.message);
    }
}

function startReplay() {
    if (!chartData) return;
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const chartContainer = document.getElementById('plotly-chart');
    const timestampDisplay = document.getElementById('replay-timestamp');
    let startTimeInput = document.getElementById('replay-start-time').value;
    const replaySpeed = parseInt(document.getElementById('replay-speed').value);

    // If not paused, determine start index based on user input
    if (!isPaused) {
        // Normalize input: accept "9:45" or "09:45"
        if (startTimeInput && startTimeInput.match(/^[0-2]?[0-9]:[0-5][0-9]$/)) {
            // Pad single-digit hour if necessary
            if (startTimeInput.length === 4) {
                startTimeInput = '0' + startTimeInput; // e.g., "9:45" → "09:45"
            }
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const dateStr = chartData.date;
            const targetTime = new Date(`${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            currentReplayIndex = chartData.timestamp.findIndex(ts => {
                const candleTime = new Date(ts);
                return candleTime.getTime() >= targetTime.getTime();
            });
            if (currentReplayIndex === -1) {
                currentReplayIndex = 0;
                alert('Start time not found in chart data. Starting from first candle.');
            }
        } else {
            currentReplayIndex = 0;
            if (startTimeInput) {
                alert('Invalid time format. Please use HH:MM (e.g., 09:45). Starting from first candle.');
            }
        }
    }

    // Prevent starting if already replaying
    if (isReplaying && !isPaused) return;

    isReplaying = true;
    isPaused = false;
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = currentReplayIndex <= 0;
    prevButton.disabled = currentReplayIndex <= 0;
    nextButton.disabled = currentReplayIndex >= chartData.count;

    // Always initialize chart for replay, showing only candles up to currentReplayIndex
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: chartData.timestamp.slice(0, currentReplayIndex),
        open: chartData.open.slice(0, currentReplayIndex),
        high: chartData.high.slice(0, currentReplayIndex),
        low: chartData.low.slice(0, currentReplayIndex),
        close: chartData.close.slice(0, currentReplayIndex),
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: chartData.timestamp.slice(0, currentReplayIndex),
        y: chartData.volume.slice(0, currentReplayIndex),
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
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp display
    timestampDisplay.textContent = currentReplayIndex > 0 
        ? `Current Time: ${chartData.timestamp[currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    // Replay loop
    replayInterval = setInterval(() => {
        if (currentReplayIndex >= chartData.count) {
            stopReplay();
            return;
        }

        // Add next candle
        Plotly.extendTraces('plotly-chart', {
            x: [[chartData.timestamp[currentReplayIndex]]],
            open: [[chartData.open[currentReplayIndex]]],
            high: [[chartData.high[currentReplayIndex]]],
            low: [[chartData.low[currentReplayIndex]]],
            close: [[chartData.close[currentReplayIndex]]]
        }, [0]);
        Plotly.extendTraces('plotly-chart', {
            x: [[chartData.timestamp[currentReplayIndex]]],
            y: [[chartData.volume[currentReplayIndex]]]
        }, [1]);

        // Update timestamp display and button states
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[currentReplayIndex].split(' ')[1]}`;
        prevButton.disabled = currentReplayIndex <= 0;
        nextButton.disabled = currentReplayIndex + 1 >= chartData.count;
        startOverButton.disabled = currentReplayIndex <= 0;

        currentReplayIndex++;
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}`
    });
}

function pauseReplay() {
    if (!isReplaying) return;
    isReplaying = false;
    isPaused = true;
    clearInterval(replayInterval);
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = currentReplayIndex <= 0;
}

function startOverReplay() {
    if (!chartData) return;
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const timestampDisplay = document.getElementById('replay-timestamp');
    const chartContainer = document.getElementById('plotly-chart');

    // Stop any ongoing replay
    if (isReplaying || isPaused) {
        clearInterval(replayInterval);
        isReplaying = false;
        isPaused = false;
    }

    // Reset to the beginning
    currentReplayIndex = 0;

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
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

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
        'event_label': `${chartData.ticker}_${chartData.date}`
    });
}

function stopReplay() {
    if (!isReplaying && !isPaused) return;
    isReplaying = false;
    isPaused = false;
    clearInterval(replayInterval);
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');

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
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById('replay-timestamp').textContent = 'Current Time: --:--:--';
}

function prevCandle() {
    if (!chartData || isReplaying || currentReplayIndex <= 0) return;
    currentReplayIndex--;
    updateChartToIndex();
}

function nextCandle() {
    if (!chartData || isReplaying || currentReplayIndex >= chartData.count) return;
    currentReplayIndex++;
    updateChartToIndex();
}

function updateChartToIndex() {
    const chartContainer = document.getElementById('plotly-chart');
    const timestampDisplay = document.getElementById('replay-timestamp');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const startOverButton = document.getElementById('start-over-replay');

    // Update chart to show candles up to currentReplayIndex
    Plotly.purge(chartContainer);
    const candlestickTrace = {
        x: chartData.timestamp.slice(0, currentReplayIndex),
        open: chartData.open.slice(0, currentReplayIndex),
        high: chartData.high.slice(0, currentReplayIndex),
        low: chartData.low.slice(0, currentReplayIndex),
        close: chartData.close.slice(0, currentReplayIndex),
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: chartData.timestamp.slice(0, currentReplayIndex),
        y: chartData.volume.slice(0, currentReplayIndex),
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
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Update timestamp and button states
    timestampDisplay.textContent = currentReplayIndex > 0 
        ? `Current Time: ${chartData.timestamp[currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = currentReplayIndex <= 0;
    nextButton.disabled = currentReplayIndex >= chartData.count;
    startOverButton.disabled = currentReplayIndex <= 0;
}

function updateReplaySpeed() {
    if (isReplaying) {
        pauseReplay();
        startReplay();
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
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked gap date: ${date}`);
                document.getElementById('ticker-select').value = 'QQQ';
                document.getElementById('date').value = date;
                loadChart(new Event('submit'));
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
    const selects = document.querySelectorAll('select');

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
            }, 12 * 60 * 60 * 1000);
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
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked event date: ${date}`);
                document.getElementById('ticker-select').value = 'QQQ';
                document.getElementById('date').value = date;
                loadChart(new Event('submit'));
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
            }, 12 * 60 * 60 * 1000);
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
            console.error('Error from earnings API:', data.error);
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
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked earnings date: ${date}`);
                document.getElementById('ticker-select').value = ticker;
                document.getElementById('date').value = date;
                loadChart(new Event('submit'));
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
            }, 12 * 60 * 60 * 1000);
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