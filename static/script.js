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
    document.getElementById('pause-replay').addEventListener('click', stopReplay);
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
});

// Global variables for replay
let chartData = null; // Store chart data for replay
let replayInterval = null; // Store interval ID for replay
let currentReplayIndex = 0; // Track current candle index
let isReplaying = false; // Track replay state

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
        // Clear bin filter inputs
        document.getElementById('bin-event-type-select').value = '';
        document.getElementById('bin-select').value = '';
    } else {
        binFilter.classList.add('active');
        // Clear year filter inputs
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
        // Clear ticker-only filter input
        document.getElementById('earnings-ticker-only-select').value = '';
    } else {
        tickerOnlyFilter.classList.add('active');
        // Clear ticker-outcome filter inputs
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
        const response = await fetch('/api/tickers');
        if (response.status === 429) {
            const data = await response.json();
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
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

async function loadEarningsTickers() {
    const tickerSelect = document.getElementById('earnings-ticker-select');
    const tickerOnlySelect = document.getElementById('earnings-ticker-only-select');
    tickerSelect.disabled = true;
    tickerOnlySelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    tickerOnlySelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        console.log('Fetching earnings tickers from /api/tickers');
        const response = await fetch('/api/tickers');
        if (response.status === 429) {
            const data = await response.json();
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            tickerOnlySelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Fetched tickers for earnings:', data.tickers);
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
        console.error('Error loading earnings tickers:', error);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
        tickerOnlySelect.innerHTML = '<option value="">Error loading tickers</option>';
        alert('Failed to load earnings tickers. Please refresh the page or try again later.');
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
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
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
        console.error('Error loading dates:', error);
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
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
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
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
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
        playButton.disabled = false;
        pauseButton.disabled = true;
        document.getElementById('replay-timestamp').textContent = '';

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}`
        });
    } catch (error) {
        console.error('Error loading chart:', error);
        chartContainer.innerHTML = '<p>Failed to load chart. Please try again later.</p>';
        replayControls.style.display = 'none';
    }
}

function startReplay() {
    if (!chartData || isReplaying) return;
    isReplaying = true;
    currentReplayIndex = 0;
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    playButton.disabled = true;
    pauseButton.disabled = false;

    const replaySpeed = parseInt(document.getElementById('replay-speed').value);
    const chartContainer = document.getElementById('plotly-chart');
    const timestampDisplay = document.getElementById('replay-timestamp');

    // Clear existing chart
    Plotly.purge(chartContainer);

    // Initialize traces for replay
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

    // Render initial empty chart
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    // Replay loop
    replayInterval = setInterval(() => {
        if (currentReplayIndex >= chartData.timestamp.length) {
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
        }, [0]); // Update candlestick trace
        Plotly.extendTraces('plotly-chart', {
            x: [[chartData.timestamp[currentReplayIndex]]],
            y: [[chartData.volume[currentReplayIndex]]]
        }, [1]); // Update volume trace

        // Update timestamp display
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[currentReplayIndex].split(' ')[1]}`;

        currentReplayIndex++;
    }, replaySpeed);

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}`
    });
}

function stopReplay() {
    if (!isReplaying) return;
    isReplaying = false;
    clearInterval(replayInterval);
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    playButton.disabled = false;
    pauseButton.disabled = true;

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

    document.getElementById('replay-timestamp').textContent = '';
}

function updateReplaySpeed() {
    if (isReplaying) {
        stopReplay();
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
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
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
        console.error('Error loading gap dates:', error);
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates. Please try again later.</p>';
    }
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    try {
        console.log('Fetching years from /api/years');
        const response = await fetch('/api/years');
        if (response.status === 429) {
            const data = await response.json();
            yearSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Fetched years:', data.years);
        yearSelect.innerHTML = '<option value="">Select year</option>';
        data.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        yearSelect.disabled = false;
    } catch (error) {
        console.error('Error loading years:', error);
        yearSelect.innerHTML = '<option value="">Error loading years</option>';
        alert('Failed to load years. Please refresh the page or try again later.');
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
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
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
        console.error('Error loading event dates:', error);
        eventDatesContainer.innerHTML = '<p>Failed to load event dates. Please try again later.</p>';
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
            earningsDatesContainer.innerHTML = '<p>Please select a ticker迄今

System: ### Updated `index.html` (Chart Container Section)

Replace the `#chart-container` section in your `index.html` file with the following code to include the replay controls:

```html
<div id="chart-container">
    <div id="plotly-chart"></div>
    <div id="replay-controls" style="display: none; text-align: center; margin-top: 10px;">
        <button id="play-replay">Play Replay</button>
        <button id="pause-replay" disabled>Pause</button>
        <label for="replay-speed">Speed:</label>
        <select id="replay-speed">
            <option value="1000">1x (1 second per minute)</option>
            <option value="500">2x (0.5 seconds per minute)</option>
            <option value="250">4x (0.25 seconds per minute)</option>
        </select>
        <span id="replay-timestamp"></span>
    </div>
</div>