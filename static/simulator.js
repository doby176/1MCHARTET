let chartData = null;
let replayInterval = null;
let currentReplayIndex = 0;
let isReplaying = false;
let isPaused = false;
let aggregatedCandles = [];
let timeframe = 1;

document.addEventListener('DOMContentLoaded', () => {
    // Populate tickers
    populateTickers();
    
    // Event listeners
    document.getElementById('chart-form').addEventListener('submit', loadChart);
    document.getElementById('play-replay').addEventListener('click', startReplay);
    document.getElementById('pause-replay').addEventListener('click', pauseReplay);
    document.getElementById('start-over-replay').addEventListener('click', startOverReplay);
    document.getElementById('prev-candle').addEventListener('click', prevCandle);
    document.getElementById('next-candle').addEventListener('click', nextCandle);
    document.getElementById('replay-speed').addEventListener('change', updateReplaySpeed);
});

async function populateTickers() {
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        const tickerSelect = document.getElementById('ticker-select');
        tickerSelect.innerHTML = '<option value="">Select Ticker</option>' + 
            data.tickers.map(ticker => `<option value="${ticker}">${ticker}</option>`).join('');
    } catch (error) {
        console.error('Error fetching tickers:', error.message);
        document.getElementById('error-message').textContent = 'Failed to load tickers: ' + error.message;
    }
}

async function loadChart(event) {
    event.preventDefault();
    timeframe = parseInt(document.getElementById('timeframe-select').value);
    const ticker = document.getElementById('ticker-select').value;
    const date = document.getElementById('date').value;
    const chartContainer = document.getElementById('chart-container');
    const errorMessage = document.getElementById('error-message');
    
    if (!ticker || !date || !timeframe) {
        errorMessage.textContent = 'Please select a ticker, date, and timeframe.';
        return;
    }

    chartContainer.innerHTML = '<p>Loading chart...</p>';
    errorMessage.textContent = '';

    try {
        const response = await fetch(`/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${timeframe}&restrict_hours=false&replay_mode=${timeframe > 1}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            chartContainer.innerHTML = `<p>${data.error}</p>`;
            errorMessage.textContent = data.error;
            return;
        }

        chartData = data.chart_data;
        aggregatedCandles = aggregateCandles(chartData, timeframe);
        currentReplayIndex = 0;
        isReplaying = false;
        isPaused = false;
        if (replayInterval) clearInterval(replayInterval);

        renderChart([]);
        document.getElementById('replay-controls').style.display = 'block';
        document.getElementById('play-replay').disabled = false;
        document.getElementById('pause-replay').disabled = true;
        document.getElementById('start-over-replay').disabled = true;
        document.getElementById('prev-candle').disabled = true;
        document.getElementById('next-candle').disabled = aggregatedCandles.length === 0;
        document.getElementById('timestamp').textContent = 'Current Time: --:--:--';
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = `<p>Failed to load chart: ${error.message}</p>`;
        errorMessage.textContent = 'Failed to load chart: ' + error.message;
    }
}

function aggregateCandles(data, timeframe) {
    if (timeframe === 1) {
        return data.timestamp.map((_, i) => ({
            timestamp: data.timestamp[i],
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            close: data.close[i],
            volume: data.volume[i],
            minuteUpdates: []
        }));
    }

    const candles = [];
    let currentCandle = null;
    let minuteCount = 0;

    for (let i = 0; i < data.timestamp.length; i++) {
        if (minuteCount === 0) {
            currentCandle = {
                timestamp: data.timestamp[i],
                open: data.open[i],
                high: data.high[i],
                low: data.low[i],
                close: data.close[i],
                volume: data.volume[i],
                minuteUpdates: []
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, data.high[i]);
            currentCandle.low = Math.min(currentCandle.low, data.low[i]);
            currentCandle.close = data.close[i];
            currentCandle.volume += data.volume[i];
            currentCandle.minuteUpdates.push({
                timestamp: data.timestamp[i],
                high: currentCandle.high,
                low: currentCandle.low,
                close: currentCandle.close,
                volume: currentCandle.volume
            });
        }

        minuteCount++;
        if (minuteCount === timeframe) {
            candles.push(currentCandle);
            minuteCount = 0;
        }
    }

    if (currentCandle && minuteCount > 0) {
        candles.push(currentCandle);
    }

    return candles;
}

function renderChart(candles, currentCandleIndex = -1, minuteIndex = null) {
    const candlestickTrace = {
        x: candles.map(c => c.timestamp), // Always use the candle's starting timestamp
        open: candles.map(c => c.open),
        high: candles.map((c, i) => {
            if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
                return c.minuteUpdates[minuteIndex].high;
            }
            return c.high;
        }),
        low: candles.map((c, i) => {
            if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
                return c.minuteUpdates[minuteIndex].low;
            }
            return c.low;
        }),
        close: candles.map((c, i) => {
            if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
                return c.minuteUpdates[minuteIndex].close;
            }
            return c.close;
        }),
        type: 'candlestick',
        name: chartData.ticker,
        increasing: { line: { color: '#00cc00' } },
        decreasing: { line: { color: '#ff0000' } }
    };
    const volumeTrace = {
        x: candles.map(c => c.timestamp), // Always use the candle's starting timestamp
        y: candles.map((c, i) => {
            if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
                return c.minuteUpdates[minuteIndex].volume;
            }
            return c.volume;
        }),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: { color: '#888888' }
    };
    const layout = {
        title: `${chartData.ticker} ${timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', rangeslider: { visible: false }, tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 },
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };
    Plotly.newPlot('chart-container', [candlestickTrace, volumeTrace], layout, { responsive: true });
}

function startReplay() {
    if (!chartData || isReplaying) return;
    isReplaying = true;
    isPaused = false;
    const startTimeInput = document.getElementById('replay-start-time').value;
    const replaySpeed = parseInt(document.getElementById('replay-speed').value);
    const playButton = document.getElementById('play-replay');
    const pauseButton = document.getElementById('pause-replay');
    const startOverButton = document.getElementById('start-over-replay');
    const prevButton = document.getElementById('prev-candle');
    const nextButton = document.getElementById('next-candle');
    const timestampDisplay = document.getElementById('timestamp');

    // Determine start index
    if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
        const [hours, minutes] = startTimeInput.split(':').map(Number);
        const targetTime = new Date(`${chartData.date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
        currentReplayIndex = chartData.timestamp.findIndex(ts => new Date(ts).getTime() >= targetTime.getTime());
        if (currentReplayIndex === -1) {
            currentReplayIndex = 0;
            alert('Start time not found. Starting from first candle.');
        }
    } else {
        currentReplayIndex = 0;
    }

    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = currentReplayIndex <= 0;
    prevButton.disabled = currentReplayIndex <= 0;
    nextButton.disabled = currentReplayIndex >= chartData.count;

    let minuteIndex = currentReplayIndex % timeframe;
    let candleIndex = Math.floor(currentReplayIndex / timeframe);

    // Initial render
    if (candleIndex > 0 || minuteIndex > 0) {
        renderChart(aggregatedCandles.slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[currentReplayIndex].split(' ')[1]}`;
    } else {
        renderChart([]);
        timestampDisplay.textContent = 'Current Time: --:--:--';
    }

    replayInterval = setInterval(() => {
        if (currentReplayIndex >= chartData.count) {
            stopReplay();
            return;
        }

        candleIndex = Math.floor(currentReplayIndex / timeframe);
        minuteIndex = currentReplayIndex % timeframe;

        // Render only up to the current candle, with minute-by-minute updates for the current candle only
        renderChart(aggregatedCandles.slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[currentReplayIndex].split(' ')[1]}`;

        prevButton.disabled = currentReplayIndex <= 0;
        nextButton.disabled = currentReplayIndex + 1 >= chartData.count;
        startOverButton.disabled = currentReplayIndex <= 0;

        currentReplayIndex++;
        if (currentReplayIndex % timeframe === 0) {
            minuteIndex = 0;
        }
    }, replaySpeed);
}

function pauseReplay() {
    if (!isReplaying) return;
    isReplaying = false;
    isPaused = true;
    clearInterval(replayInterval);
    document.getElementById('play-replay').textContent = 'Resume Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
}

function startOverReplay() {
    if (!chartData) return;
    clearInterval(replayInterval);
    isReplaying = false;
    isPaused = false;
    currentReplayIndex = 0;
    renderChart([]);
    document.getElementById('play-replay').textContent = 'Play Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
    document.getElementById('start-over-replay').disabled = true;
    document.getElementById('prev-candle').disabled = true;
    document.getElementById('next-candle').disabled = aggregatedCandles.length === 0;
    document.getElementById('timestamp').textContent = 'Current Time: --:--:--';
}

function stopReplay() {
    isReplaying = false;
    isPaused = false;
    clearInterval(replayInterval);
    renderChart(aggregatedCandles);
    document.getElementById('play-replay').textContent = 'Play Replay';
    document.getElementById('play-replay').disabled = false;
    document.getElementById('pause-replay').disabled = true;
    document.getElementById('start-over-replay').disabled = true;
    document.getElementById('prev-candle').disabled = true;
    document.getElementById('next-candle').disabled = true;
    document.getElementById('timestamp').textContent = 'Current Time: --:--:--';
}

function prevCandle() {
    if (!chartData || isReplaying || currentReplayIndex <= 0) return;
    currentReplayIndex--;
    const candleIndex = Math.floor(currentReplayIndex / timeframe);
    const minuteIndex = currentReplayIndex % timeframe;
    renderChart(aggregatedCandles.slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
    document.getElementById('timestamp').textContent = currentReplayIndex > 0 
        ? `Current Time: ${chartData.timestamp[currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    document.getElementById('prev-candle').disabled = currentReplayIndex <= 0;
    document.getElementById('next-candle').disabled = currentReplayIndex >= chartData.count;
    document.getElementById('start-over-replay').disabled = currentReplayIndex <= 0;
}

function nextCandle() {
    if (!chartData || isReplaying || currentReplayIndex >= chartData.count) return;
    currentReplayIndex++;
    const candleIndex = Math.floor(currentReplayIndex / timeframe);
    const minuteIndex = currentReplayIndex % timeframe;
    renderChart(aggregatedCandles.slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
    document.getElementById('timestamp').textContent = currentReplayIndex > 0 
        ? `Current Time: ${chartData.timestamp[currentReplayIndex - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    document.getElementById('prev-candle').disabled = currentReplayIndex <= 0;
    document.getElementById('next-candle').disabled = currentReplayIndex >= chartData.count;
    document.getElementById('start-over-replay').disabled = currentReplayIndex <= 0;
}

function updateReplaySpeed() {
    if (isReplaying) {
        pauseReplay();
        startReplay();
    }
}