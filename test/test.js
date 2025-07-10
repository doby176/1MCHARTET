const state = {
    chartData: null,
    replayData: null,
    replayInterval: null,
    currentReplayIndex: 0,
    isReplaying: false,
    isPaused: false,
    candlesPerTimeframe: 1
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing test app...');
    loadTickers();
    setupEventListeners();
});

function loadTickers() {
    fetch('/api/tickers')
        .then(response => response.json())
        .then(data => {
            const tickerSelect = document.getElementById('ticker-select');
            tickerSelect.innerHTML = '<option value="">Select Ticker</option>';
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                tickerSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading tickers:', error);
            document.getElementById('plotly-chart').innerHTML = '<p>Failed to load tickers.</p>';
        });
}

function setupEventListeners() {
    document.getElementById('stock-form').addEventListener('submit', (event) => loadChart(event));
    document.getElementById('play-replay').addEventListener('click', () => startReplay());
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay());
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay());
    document.getElementById('prev-candle').addEventListener('click', () => prevCandle());
    document.getElementById('next-candle').addEventListener('click', () => nextCandle());
    document.getElementById('replay-speed').addEventListener('change', () => updateReplaySpeed());
}

async function loadChart(event) {
    event.preventDefault();
    const ticker = document.getElementById('ticker-select').value;
    const date = document.getElementById('date').value;
    const timeframe = document.getElementById('timeframe-select').value;
    const chartContainer = document.getElementById('plotly-chart');
    const form = document.getElementById('stock-form');
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    if (!ticker || !date || !timeframe) {
        chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe.</p>';
        document.getElementById('replay-controls').style.display = 'none';
        return;
    }

    try {
        const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${encodeURIComponent(timeframe)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        state.chartData = data.chart_data;
        state.replayData = data.replay_data;
        state.currentReplayIndex = 0;
        state.isReplaying = false;
        state.isPaused = false;
        state.candlesPerTimeframe = parseInt(timeframe);
        if (state.replayInterval) clearInterval(state.replayInterval);

        // Render full chart with aggregated data
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
            title: `${data.chart_data.ticker} ${timeframe}-Minute Candlestick Chart - ${data.chart_data.date}`,
            xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
            yaxis: { title: 'Price', domain: [0.3, 1] },
            yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
            showlegend: true,
            margin: { t: 50, b: 50, l: 50, r: 50 },
            plot_bgcolor: '#ffffff',
            paper_bgcolor: '#ffffff'
        };
        Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

        document.getElementById('replay-controls').style.display = 'block';
        document.getElementById('play-replay').disabled = false;
        document.getElementById('pause-replay').disabled = true;
        document.getElementById('start-over-replay').disabled = true;
        document.getElementById('prev-candle').disabled = true;
        document.getElementById('next-candle').disabled = true;
        document.getElementById('replay-start-time').value = '';
        document.getElementById('replay-timestamp').textContent = 'Current Time: --:--:--';
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '</p>';
        document.getElementById('replay-controls').style.display = 'none';
        alert('Failed to load chart: ' + error.message);
    }
}

function aggregateCandles(replayData, timeframe, endIndex) {
    if (timeframe <= 1) {
        return {
            timestamp: replayData.timestamp.slice(0, endIndex),
            open: replayData.open.slice(0, endIndex),
            high: replayData.high.slice(0, endIndex),
            low: replayData.low.slice(0, endIndex),
            close: replayData.close.slice(0, endIndex),
            volume: replayData.volume.slice(0, endIndex)
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

    for (let i = 0; i < endIndex && i < replayData.count; i += timeframe) {
        const sliceEnd = Math.min(i + timeframe, endIndex);
        const sliceTimestamp = replayData.timestamp[sliceEnd - 1];
        const sliceOpen = replayData.open[i];
        const sliceHigh = Math.max(...replayData.high.slice(i, sliceEnd));
        const sliceLow = Math.min(...replayData.low.slice(i, sliceEnd));
        const sliceClose = replayData.close[sliceEnd - 1];
        const sliceVolume = replayData.volume.slice(i, sliceEnd).reduce((sum, v) => sum + v, 0);

        aggregated.timestamp.push(sliceTimestamp);
        aggregated.open.push(sliceOpen);
        aggregated.high.push(sliceHigh);
        aggregated.low.push(sliceLow);
        aggregated.close.push(sliceClose);
        aggregated.volume.push(sliceVolume);
    }

    return aggregated;
}

function startReplay() {
    if (!state.chartData || !state.replayData) return;

    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const timestampDisplay = document.getElementById('replay-timestamp');
    const startTimeInput = document.getElementById('replay-start-time').value;
    const replaySpeed = parseInt(document.getElementById('replay-speed').value);

    if (!state.isPaused) {
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const targetTime = new Date(`${state.chartData.date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            let index = state.replayData.timestamp.findIndex(ts => new Date(ts).getTime() >= targetTime.getTime());
            state.currentReplayIndex = index === -1 ? 0 : index;
            if (index === -1) alert('Start time not found in replay data. Starting from first candle.');
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
    nextButton.disabled = state.currentReplayIndex >= state.replayData.count;

    // Initialize chart with no data
    Plotly.purge('plotly-chart');
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
        title: `${state.chartData.ticker} ${state.candlesPerTimeframe}-Minute Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    timestampDisplay.textContent = 'Current Time: --:--:--';

    state.replayInterval = setInterval(() => {
        if (state.currentReplayIndex >= state.replayData.count) {
            stopReplay();
            return;
        }

        // Aggregate 1-minute data up to current index
        const aggregated = aggregateCandles(state.replayData, state.candlesPerTimeframe, state.currentReplayIndex + 1);

        // Update chart with aggregated data
        Plotly.purge('plotly-chart');
        const candlestickTrace = {
            x: aggregated.timestamp,
            open: aggregated.open,
            high: aggregated.high,
            low: aggregated.low,
            close: aggregated.close,
            type: 'candlestick',
            name: state.chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        const volumeTrace = {
            x: aggregated.timestamp,
            y: aggregated.volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

        timestampDisplay.textContent = state.currentReplayIndex > 0
            ? `Current Time: ${state.replayData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
            : 'Current Time: --:--:--';
        prevButton.disabled = state.currentReplayIndex <= 0;
        nextButton.disabled = state.currentReplayIndex + 1 >= state.replayData.count;
        startOverButton.disabled = state.currentReplayIndex <= 0;

        state.currentReplayIndex++;
    }, replaySpeed);
}

function pauseReplay() {
    if (!state.isReplaying) return;

    state.isReplaying = false;
    state.isPaused = true;
    clearInterval(state.replayInterval);
    document.getElementById('play-replay').textContent = 'Resume Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
    document.getElementById('start-over-replay').disabled = state.currentReplayIndex <= 0;
}

function startOverReplay() {
    if (!state.chartData || !state.replayData) return;

    if (state.isReplaying || state.isPaused) {
        clearInterval(state.replayInterval);
        state.isReplaying = false;
        state.isPaused = false;
    }

    state.currentReplayIndex = 0;

    Plotly.purge('plotly-chart');
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
        title: `${state.chartData.ticker} ${state.candlesPerTimeframe}-Minute Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById('play-replay').textContent = 'Play Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
    document.getElementById('start-over-replay').disabled = true;
    document.getElementById('prev-candle').disabled = true;
    document.getElementById('next-candle').disabled = state.replayData.count === 0;
    document.getElementById('replay-timestamp').textContent = 'Current Time: --:--:--';
}

function stopReplay() {
    if (!state.isReplaying && !state.isPaused) return;

    state.isReplaying = false;
    state.isPaused = false;
    clearInterval(state.replayInterval);

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
        title: `${state.chartData.ticker} ${state.candlesPerTimeframe}-Minute Candlestick Chart - ${state.chartData.date}`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById('play-replay').textContent = 'Play Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
    document.getElementById('start-over-replay').disabled = true;
    document.getElementById('prev-candle').disabled = true;
    document.getElementById('next-candle').disabled = true;
    document.getElementById('replay-timestamp').textContent = 'Current Time: --:--:--';
}

function prevCandle() {
    if (!state.replayData || state.isReplaying || state.currentReplayIndex <= 0) return;

    state.currentReplayIndex = Math.max(0, state.currentReplayIndex - 1);
    updateChartToIndex();
}

function nextCandle() {
    if (!state.replayData || state.isReplaying || state.currentReplayIndex >= state.replayData.count) return;

    state.currentReplayIndex++;
    updateChartToIndex();
}

function updateChartToIndex() {
    const aggregated = aggregateCandles(state.replayData, state.candlesPerTimeframe, state.currentReplayIndex);

    Plotly.purge('plotly-chart');
    const candlestickTrace = {
        x: aggregated.timestamp,
        open: aggregated.open,
        high: aggregated.high,
        low: aggregated.low,
        close: aggregated.close,
        type: 'candlestick',
        name: state.chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: aggregated.timestamp,
        y: aggregated.volume,
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${state.chartData.ticker} ${state.candlesPerTimeframe}-Minute Candlestick Chart - ${state.chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot('plotly-chart', [candlestickTrace, volumeTrace], layout, { responsive: true });

    document.getElementById('replay-timestamp').textContent = state.currentReplayIndex > 0
        ? `Current Time: ${state.replayData.timestamp[state.currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    document.getElementById('prev-candle').disabled = state.currentReplayIndex <= 0;
    document.getElementById('next-candle').disabled = state.currentReplayIndex >= state.replayData.count;
    document.getElementById('start-over-replay').disabled = state.currentReplayIndex <= 0;
}

function updateReplaySpeed() {
    if (state.isReplaying) {
        pauseReplay();
        startReplay();
    }
}