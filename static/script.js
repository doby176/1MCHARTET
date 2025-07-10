// Global variables for each tab
let chartData = null, rawChartData = null, replayInterval = null, currentReplayIndex = 0, isReplaying = false, isPaused = false;
let chartDataGap = null, rawChartDataGap = null, replayIntervalGap = null, currentReplayIndexGap = 0, isReplayingGap = false, isPausedGap = false;
let chartDataEvents = null, rawChartDataEvents = null, replayIntervalEvents = null, currentReplayIndexEvents = 0, isReplayingEvents = false, isPausedEvents = false;
let chartDataEarnings = null, rawChartDataEarnings = null, replayIntervalEarnings = null, currentReplayIndexEarnings = 0, isReplayingEarnings = false, isPausedEarnings = false;
let openPosition = null;
let tradeHistory = [];

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
        alert('Invalid tab selected');
        return;
    }

    const tickerSelect = document.getElementById(config.tickerSelectId);
    const dateInput = document.getElementById(config.dateInputId);
    const timeframeSelect = document.getElementById(config.timeframeSelectId);
    const ticker = tickerSelect.value;
    const date = dateInput.value;
    const timeframe = parseInt(timeframeSelect.value);
    const replayConfig = getReplayConfig(config.replayPrefix);

    if (!ticker || !date) {
        alert('Please select a ticker and date');
        return;
    }

    console.log(`Loading chart for ${tabId}: ticker=${ticker}, date=${date}, timeframe=${timeframe}, restrict_hours=${config.restrictHours}`);

    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&restrict_hours=${config.restrictHours}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        if (data.message) {
            console.error(`No data available: ${data.message}`);
            alert(`No data available: ${data.message}`);
            return;
        }

        // Validate data structure
        if (!data || !data.ticker || !data.date || !Array.isArray(data.timestamp) || !Array.isArray(data.open) ||
            !Array.isArray(data.high) || !Array.isArray(data.low) || !Array.isArray(data.close) || !Array.isArray(data.volume)) {
            console.error('Invalid data structure received:', data);
            alert('Failed to load chart: Invalid data structure');
            return;
        }

        // Ensure all arrays have the same length
        const expectedLength = data.timestamp.length;
        if (data.open.length !== expectedLength || data.high.length !== expectedLength ||
            data.low.length !== expectedLength || data.close.length !== expectedLength ||
            data.volume.length !== expectedLength) {
            console.error('Data arrays have inconsistent lengths:', {
                timestamp: data.timestamp.length,
                open: data.open.length,
                high: data.high.length,
                low: data.low.length,
                close: data.close.length,
                volume: data.volume.length
            });
            alert('Failed to load chart: Inconsistent data lengths');
            return;
        }

        replayConfig.setRawChartData(data);
        const aggregatedData = aggregateCandles(data, timeframe);
        if (!aggregatedData || !aggregatedData.timestamp || aggregatedData.timestamp.length === 0) {
            console.error('Aggregation failed or returned empty data:', aggregatedData);
            alert('Failed to load chart: No data after aggregation');
            return;
        }
        replayConfig.setChartData(aggregatedData);

        // Render initial chart
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

        // Show replay controls
        document.getElementById(config.replayControlsId).style.display = 'flex';
        // Reset replay state
        replayConfig.setCurrentReplayIndex(0);
        replayConfig.setIsReplaying(false);
        replayConfig.setIsPaused(false);
        if (replayConfig.replayInterval()) {
            clearInterval(replayConfig.replayInterval());
            replayConfig.setReplayInterval(null);
        }
        document.getElementById(replayConfig.playButtonId).disabled = false;
        document.getElementById(replayConfig.pauseButtonId).disabled = true;
        document.getElementById(replayConfig.startOverButtonId).disabled = true;
        document.getElementById(replayConfig.prevButtonId).disabled = true;
        document.getElementById(replayConfig.nextButtonId).disabled = data.timestamp.length <= 1;
        document.getElementById(replayConfig.replayTimestampId).textContent = 'Current Time: --:--:--';
        if (tabId === 'market-simulator') {
            document.getElementById('buy-trade').disabled = true;
            document.getElementById('sell-trade').disabled = true;
            openPosition = null;
            tradeHistory = [];
            updateTradeSummary();
        }

        console.log(`Chart loaded for ${tabId}: ${ticker} on ${date}, ${aggregatedData.timestamp.length} candles`);
        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${tabId}_${ticker}_${date}_${timeframe}`
        });
    } catch (error) {
        console.error(`Error loading chart for ${tabId}:`, error.message);
        alert(`Failed to load chart: ${error.message}`);
    }
}

function aggregateCandles(data, timeframe) {
    if (!data || !data.timestamp || data.timestamp.length === 0) {
        console.error('Invalid data for aggregation:', data);
        return null;
    }
    const aggregated = {
        timestamp: [],
        open: [],
        high: [],
        low: [],
        close: [],
        volume: [],
        ticker: data.ticker,
        date: data.date
    };
    const timestamps = data.timestamp.map(t => new Date(t).getTime());
    const intervalMs = timeframe * 60 * 1000;
    let currentStart = timestamps[0] - (timestamps[0] % intervalMs);

    for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts >= currentStart + intervalMs) {
            const startIdx = i - aggregated.close.length;
            const endIdx = i;
            aggregated.timestamp.push(new Date(currentStart).toISOString());
            aggregated.open.push(data.open[startIdx]);
            aggregated.high.push(Math.max(...data.high.slice(startIdx, endIdx)));
            aggregated.low.push(Math.min(...data.low.slice(startIdx, endIdx)));
            aggregated.close.push(data.close[endIdx - 1]);
            aggregated.volume.push(data.volume.slice(startIdx, endIdx).reduce((sum, v) => sum + v, 0));
            currentStart += intervalMs;
        }
    }
    // Handle remaining candles
    if (timestamps[timestamps.length - 1] >= currentStart) {
        const startIdx = timestamps.length - aggregated.close.length;
        aggregated.timestamp.push(new Date(currentStart).toISOString());
        aggregated.open.push(data.open[startIdx]);
        aggregated.high.push(Math.max(...data.high.slice(startIdx)));
        aggregated.low.push(Math.min(...data.low.slice(startIdx)));
        aggregated.close.push(data.close[timestamps.length - 1]);
        aggregated.volume.push(data.volume.slice(startIdx).reduce((sum, v) => sum + v, 0));
    }
    return aggregated;
}

function updateChartToIndex(section, index) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    const timeframeSelect = document.getElementById(section ? `timeframe-select-${section}` : 'timeframe-select');
    const timeframe = parseInt(timeframeSelect.value);
    
    if (!rawData || !rawData.timestamp || !Array.isArray(rawData.timestamp) || rawData.timestamp.length === 0 || index < 0 || index >= rawData.timestamp.length) {
        console.error(`Invalid data or index for ${section || 'market-simulator'}:`, {
            rawData: rawData,
            index: index,
            timestamp: rawData ? rawData.timestamp : null
        });
        alert('Failed to update chart: Invalid data or index');
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
    if (!aggregatedData || !aggregatedData.timestamp || aggregatedData.timestamp.length === 0) {
        console.error('Aggregation failed in updateChartToIndex:', aggregatedData);
        alert('Failed to update chart: Aggregation error');
        return;
    }

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
    if (!rawData || !rawData.timestamp || !Array.isArray(rawData.timestamp) || rawData.timestamp.length === 0) {
        console.error(`No valid chart data available for replay in ${section || 'market-simulator'}:`, rawData);
        alert('Cannot start replay: No valid chart data');
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
    prevButton.disabled = startIndex <= 0;
    nextButton.disabled = startIndex >= rawData.timestamp.length - 1;
    if (section === '') {
        document.getElementById('buy-trade').disabled = false;
        document.getElementById('sell-trade').disabled = openPosition?.type === 'buy';
    }

    // Start replay
    updateChartToIndex(section, startIndex);
    const intervalMs = 1000 / speed;
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
        'event_label': `${section || 'market-simulator'}_${config.rawChartData()?.ticker || 'unknown'}_${config.rawChartData()?.date || 'unknown'}_${config.currentReplayIndex()}`
    });
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const rawData = config.rawChartData();
    if (!rawData || !rawData.timestamp || !Array.isArray(rawData.timestamp) || rawData.timestamp.length === 0) {
        console.error(`No valid chart data available to restart replay in ${section || 'market-simulator'}`);
        alert('Cannot restart replay: No valid chart data');
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
    nextButton.disabled = rawData.timestamp.length <= 1;
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
    if (!rawData || !rawData.timestamp || !Array.isArray(rawData.timestamp) || rawData.timestamp.length === 0) {
        console.error(`No valid chart data for previous candle in ${section || 'market-simulator'}`);
        alert('Cannot move to previous candle: No valid chart data');
        return;
    }

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
    if (!rawData || !rawData.timestamp || !Array.isArray(rawData.timestamp) || rawData.timestamp.length === 0) {
        console.error(`No valid chart data for next candle in ${section || 'market-simulator'}`);
        alert('Cannot move to next candle: No valid chart data');
        return;
    }

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

function updateTradeSummary() {
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryEl = document.getElementById('trade-history');
    if (openPosition) {
        const currentPrice = chartData.close[chartData.close.length - 1];
        const entryPrice = openPosition.price;
        const quantity = openPosition.quantity;
        const direction = openPosition.type === 'buy' ? 1 : -1;
        const unrealizedPnl = direction * (currentPrice - entryPrice) * quantity;
        positionStatus.textContent = `Open ${openPosition.type.toUpperCase()} Position: ${quantity} shares at $${entryPrice.toFixed(2)}`;
        tradePnl.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
    } else {
        positionStatus.textContent = 'No open position';
        tradePnl.textContent = 'P/L: $0.00';
    }
    if (tradeHistory.length > 0) {
        tradeHistoryEl.innerHTML = 'Trade History:<br>' + tradeHistory.map(t => 
            `${t.type.toUpperCase()} ${t.quantity} shares at $${t.price.toFixed(2)} on ${t.date} at ${t.time} (P/L: $${t.pnl.toFixed(2)})`
        ).join('<br>');
    } else {
        tradeHistoryEl.textContent = 'Trade History: None';
    }
}

function placeBuyTrade() {
    const config = getReplayConfig('');
    const rawData = config.rawChartData();
    if (!rawData || !rawData.close || config.currentReplayIndex() === 0) {
        alert('Cannot place trade: No valid chart data or replay not started');
        return;
    }
    if (openPosition && openPosition.type === 'buy') {
        alert('A buy position is already open');
        return;
    }
    if (openPosition && openPosition.type === 'sell') {
        const exitPrice = rawData.close[config.currentReplayIndex()];
        const quantity = openPosition.quantity;
        const entryPrice = openPosition.price;
        const pnl = (entryPrice - exitPrice) * quantity; // Short position: sell high, buy low
        tradeHistory.push({
            type: 'buy (close short)',
            quantity: quantity,
            price: exitPrice,
            date: rawData.date,
            time: new Date(rawData.timestamp[config.currentReplayIndex()]).toLocaleTimeString('en-US', { hour12: false }),
            pnl: pnl
        });
        openPosition = null;
        updateTradeSummary();
        document.getElementById('sell-trade').disabled = false;
        gtag('event', 'trade_close', {
            'event_category': 'Trade',
            'event_label': `close_short_${rawData.ticker}_${rawData.date}_${exitPrice}`
        });
        return;
    }
    const price = rawData.close[config.currentReplayIndex()];
    openPosition = {
        type: 'buy',
        price: price,
        quantity: 100,
        time: new Date(rawData.timestamp[config.currentReplayIndex()]).toLocaleTimeString('en-US', { hour12: false })
    };
    updateTradeSummary();
    document.getElementById('sell-trade').disabled = false;
    gtag('event', 'trade_open', {
        'event_category': 'Trade',
        'event_label': `buy_${rawData.ticker}_${rawData.date}_${price}`
    });
}

function placeSellTrade() {
    const config = getReplayConfig('');
    const rawData = config.rawChartData();
    if (!rawData || !rawData.close || config.currentReplayIndex() === 0) {
        alert('Cannot place trade: No valid chart data or replay not started');
        return;
    }
    if (openPosition && openPosition.type === 'sell') {
        alert('A sell position is already open');
        return;
    }
    if (openPosition && openPosition.type === 'buy') {
        const exitPrice = rawData.close[config.currentReplayIndex()];
        const quantity = openPosition.quantity;
        const entryPrice = openPosition.price;
        const pnl = (exitPrice - entryPrice) * quantity; // Long position: buy low, sell high
        tradeHistory.push({
            type: 'sell (close long)',
            quantity: quantity,
            price: exitPrice,
            date: rawData.date,
            time: new Date(rawData.timestamp[config.currentReplayIndex()]).toLocaleTimeString('en-US', { hour12: false }),
            pnl: pnl
        });
        openPosition = null;
        updateTradeSummary();
        document.getElementById('sell-trade').disabled = true;
        gtag('event', 'trade_close', {
            'event_category': 'Trade',
            'event_label': `close_long_${rawData.ticker}_${rawData.date}_${exitPrice}`
        });
        return;
    }
    const price = rawData.close[config.currentReplayIndex()];
    openPosition = {
        type: 'sell',
        price: price,
        quantity: 100,
        time: new Date(rawData.timestamp[config.currentReplayIndex()]).toLocaleTimeString('en-US', { hour12: false })
    };
    updateTradeSummary();
    document.getElementById('sell-trade').disabled = false;
    gtag('event', 'trade_open', {
        'event_category': 'Trade',
        'event_label': `sell_${rawData.ticker}_${rawData.date}_${price}`
    });
}

async function loadTickers() {
    const tickerSelects = ['ticker-select', 'ticker-select-gap', 'ticker-select-events', 'earnings-ticker-select', 'earnings-ticker-only-select'];
    try {
        const response = await fetch('/api/tickers', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        console.log('Response status:', response.status);
        if (response.status === 429) {
            const data = await response.json();
            console.error('Rate limit error:', data.error);
            alert(data.error);
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
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
        console.log('Tickers loaded:', data.tickers);
        gtag('event', 'tickers_load', {
            'event_category': 'Data',
            'event_label': 'tickers'
        });
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        alert('Failed to load tickers: ' + error.message);
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
            headers: { 'Accept': 'application/json' }
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
            headers: { 'Accept': 'application/json' }
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
            headers: { 'Accept': 'application/json' }
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
    const dateSelect = document.getElementById('date-earnings');
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
            headers: { 'Accept': 'application/json' }
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
            headers: { 'Accept': 'application/json' }
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

// Initialize forms and event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadTickers();
    loadYears();
    document.getElementById('stock-form').addEventListener('submit', (e) => loadChart(e, 'market-simulator'));
    document.getElementById('stock-form-gap').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
    document.getElementById('stock-form-earnings').addEventListener('submit', (e) => loadChart(e, 'earnings-analysis'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('play-replay').addEventListener('click', () => startReplay(''));
    document.getElementById('pause-replay').addEventListener('click', () => pauseReplay(''));
    document.getElementById('start-over-replay').addEventListener('click', () => startOverReplay(''));
    document.getElementById('prev-candle').addEventListener('click', () => prevCandle(''));
    document.getElementById('next-candle').addEventListener('click', () => nextCandle(''));
    document.getElementById('replay-speed').addEventListener('change', () => updateReplaySpeed(''));
    document.getElementById('buy-trade').addEventListener('click', placeBuyTrade);
    document.getElementById('sell-trade').addEventListener('click', placeSellTrade);
    document.getElementById('play-replay-gap').addEventListener('click', () => startReplay('gap'));
    document.getElementById('pause-replay-gap').addEventListener('click', () => pauseReplay('gap'));
    document.getElementById('start-over-replay-gap').addEventListener('click', () => startOverReplay('gap'));
    document.getElementById('prev-candle-gap').addEventListener('click', () => prevCandle('gap'));
    document.getElementById('next-candle-gap').addEventListener('click', () => nextCandle('gap'));
    document.getElementById('replay-speed-gap').addEventListener('change', () => updateReplaySpeed('gap'));
    document.getElementById('play-replay-events').addEventListener('click', () => startReplay('events'));
    document.getElementById('pause-replay-events').addEventListener('click', () => pauseReplay('events'));
    document.getElementById('start-over-replay-events').addEventListener('click', () => startOverReplay('events'));
    document.getElementById('prev-candle-events').addEventListener('click', () => prevCandle('events'));
    document.getElementById('next-candle-events').addEventListener('click', () => nextCandle('events'));
    document.getElementById('replay-speed-events').addEventListener('change', () => updateReplaySpeed('events'));
    document.getElementById('play-replay-earnings').addEventListener('click', () => startReplay('earnings'));
    document.getElementById('pause-replay-earnings').addEventListener('click', () => pauseReplay('earnings'));
    document.getElementById('start-over-replay-earnings').addEventListener('click', () => startOverReplay('earnings'));
    document.getElementById('prev-candle-earnings').addEventListener('click', () => prevCandle('earnings'));
    document.getElementById('next-candle-earnings').addEventListener('click', () => nextCandle('earnings'));
    document.getElementById('replay-speed-earnings').addEventListener('change', () => updateReplaySpeed('earnings'));

    // Initialize filter toggles
    document.querySelectorAll('input[name="filter-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('year-filter').classList.toggle('active', radio.value === 'year');
            document.getElementById('bin-filter').classList.toggle('active', radio.value === 'bin');
        });
    });
    document.querySelectorAll('input[name="earnings-filter-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('ticker-outcome-filter').classList.toggle('active', radio.value === 'ticker-outcome');
            document.getElementById('ticker-only-filter').classList.toggle('active', radio.value === 'ticker-only');
        });
    });
});