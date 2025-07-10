// Global variables for each tab
const tabConfig = {
    '': {
        chartContainerId: 'chart',
        formId: 'chart-form',
        timeframeSelectId: 'timeframe-select',
        playButtonId: 'play-replay',
        pauseButtonId: 'pause-replay',
        startOverButtonId: 'start-over-replay',
        prevButtonId: 'prev-candle',
        nextButtonId: 'next-candle',
        replaySpeedId: 'replay-speed',
        startTimeInputId: 'replay-start-time',
        timestampDisplayId: 'replay-timestamp',
        replayControlsId: 'replay-controls'
    },
    'gap': {
        chartContainerId: 'gap-chart',
        formId: 'gap-chart-form',
        timeframeSelectId: 'gap-timeframe-select',
        playButtonId: 'gap-play-replay',
        pauseButtonId: 'gap-pause-replay',
        startOverButtonId: 'gap-start-over-replay',
        prevButtonId: 'gap-prev-candle',
        nextButtonId: 'gap-next-candle',
        replaySpeedId: 'gap-replay-speed',
        startTimeInputId: 'gap-replay-start-time',
        timestampDisplayId: 'gap-replay-timestamp',
        replayControlsId: 'gap-replay-controls'
    },
    'events': {
        chartContainerId: 'events-chart',
        formId: 'events-chart-form',
        timeframeSelectId: 'events-timeframe-select',
        playButtonId: 'events-play-replay',
        pauseButtonId: 'events-pause-replay',
        startOverButtonId: 'events-start-over-replay',
        prevButtonId: 'events-prev-candle',
        nextButtonId: 'events-next-candle',
        replaySpeedId: 'events-replay-speed',
        startTimeInputId: 'events-replay-start-time',
        timestampDisplayId: 'events-replay-timestamp',
        replayControlsId: 'events-replay-controls'
    },
    'earnings': {
        chartContainerId: 'earnings-chart',
        formId: 'earnings-chart-form',
        timeframeSelectId: 'earnings-timeframe-select',
        playButtonId: 'earnings-play-replay',
        pauseButtonId: 'earnings-pause-replay',
        startOverButtonId: 'earnings-start-over-replay',
        prevButtonId: 'earnings-prev-candle',
        nextButtonId: 'earnings-next-candle',
        replaySpeedId: 'earnings-replay-speed',
        startTimeInputId: 'earnings-replay-start-time',
        timestampDisplayId: 'earnings-replay-timestamp',
        replayControlsId: 'earnings-replay-controls'
    }
};

// Global state for each tab
let chartData = null;
let oneMinData = null;
let currentReplayIndex = 0;
let currentSubIndex = 0;
let isReplaying = false;
let isPaused = false;
let replayInterval = null;
let timeframe = 1;

let gapChartData = null;
let gapOneMinData = null;
let gapCurrentReplayIndex = 0;
let gapCurrentSubIndex = 0;
let gapIsReplaying = false;
let gapIsPaused = false;
let gapReplayInterval = null;
let gapTimeframe = 1;

let eventsChartData = null;
let eventsOneMinData = null;
let eventsCurrentReplayIndex = 0;
let eventsCurrentSubIndex = 0;
let eventsIsReplaying = false;
let eventsIsPaused = false;
let eventsReplayInterval = null;
let eventsTimeframe = 1;

let earningsChartData = null;
let earningsOneMinData = null;
let earningsCurrentReplayIndex = 0;
let earningsCurrentSubIndex = 0;
let earningsIsReplaying = false;
let earningsIsPaused = false;
let earningsReplayInterval = null;
let earningsTimeframe = 1;

function getReplayConfig(section) {
    const configs = {
        '': {
            chartData: () => chartData,
            setChartData: (data) => { chartData = data; },
            oneMinData: () => oneMinData,
            setOneMinData: (data) => { oneMinData = data; },
            currentReplayIndex: () => currentReplayIndex,
            setCurrentReplayIndex: (index) => { currentReplayIndex = index; },
            currentSubIndex: () => currentSubIndex,
            setCurrentSubIndex: (index) => { currentSubIndex = index; },
            isReplaying: () => isReplaying,
            setIsReplaying: (value) => { isReplaying = value; },
            isPaused: () => isPaused,
            setIsPaused: (value) => { isPaused = value; },
            replayInterval: () => replayInterval,
            setReplayInterval: (interval) => { replayInterval = interval; },
            timeframe: () => timeframe,
            setTimeframe: (value) => { timeframe = value; },
            chartContainerId: tabConfig[''].chartContainerId,
            formId: tabConfig[''].formId,
            timeframeSelectId: tabConfig[''].timeframeSelectId,
            playButtonId: tabConfig[''].playButtonId,
            pauseButtonId: tabConfig[''].pauseButtonId,
            startOverButtonId: tabConfig[''].startOverButtonId,
            prevButtonId: tabConfig[''].prevButtonId,
            nextButtonId: tabConfig[''].nextButtonId,
            replaySpeedId: tabConfig[''].replaySpeedId,
            startTimeInputId: tabConfig[''].startTimeInputId,
            timestampDisplayId: tabConfig[''].timestampDisplayId,
            replayControlsId: tabConfig[''].replayControlsId
        },
        'gap': {
            chartData: () => gapChartData,
            setChartData: (data) => { gapChartData = data; },
            oneMinData: () => gapOneMinData,
            setOneMinData: (data) => { gapOneMinData = data; },
            currentReplayIndex: () => gapCurrentReplayIndex,
            setCurrentReplayIndex: (index) => { gapCurrentReplayIndex = index; },
            currentSubIndex: () => gapCurrentSubIndex,
            setCurrentSubIndex: (index) => { gapCurrentSubIndex = index; },
            isReplaying: () => gapIsReplaying,
            setIsReplaying: (value) => { gapIsReplaying = value; },
            isPaused: () => gapIsPaused,
            setIsPaused: (value) => { gapIsPaused = value; },
            replayInterval: () => gapReplayInterval,
            setReplayInterval: (interval) => { gapReplayInterval = interval; },
            timeframe: () => gapTimeframe,
            setTimeframe: (value) => { gapTimeframe = value; },
            chartContainerId: tabConfig['gap'].chartContainerId,
            formId: tabConfig['gap'].formId,
            timeframeSelectId: tabConfig['gap'].timeframeSelectId,
            playButtonId: tabConfig['gap'].playButtonId,
            pauseButtonId: tabConfig['gap'].pauseButtonId,
            startOverButtonId: tabConfig['gap'].startOverButtonId,
            prevButtonId: tabConfig['gap'].prevButtonId,
            nextButtonId: tabConfig['gap'].nextButtonId,
            replaySpeedId: tabConfig['gap'].replaySpeedId,
            startTimeInputId: tabConfig['gap'].startTimeInputId,
            timestampDisplayId: tabConfig['gap'].timestampDisplayId,
            replayControlsId: tabConfig['gap'].replayControlsId
        },
        'events': {
            chartData: () => eventsChartData,
            setChartData: (data) => { eventsChartData = data; },
            oneMinData: () => eventsOneMinData,
            setOneMinData: (data) => { eventsOneMinData = data; },
            currentReplayIndex: () => eventsCurrentReplayIndex,
            setCurrentReplayIndex: (index) => { eventsCurrentReplayIndex = index; },
            currentSubIndex: () => eventsCurrentSubIndex,
            setCurrentSubIndex: (index) => { eventsCurrentSubIndex = index; },
            isReplaying: () => eventsIsReplaying,
            setIsReplaying: (value) => { eventsIsReplaying = value; },
            isPaused: () => eventsIsPaused,
            setIsPaused: (value) => { eventsIsPaused = value; },
            replayInterval: () => eventsReplayInterval,
            setReplayInterval: (interval) => { eventsReplayInterval = interval; },
            timeframe: () => eventsTimeframe,
            setTimeframe: (value) => { eventsTimeframe = value; },
            chartContainerId: tabConfig['events'].chartContainerId,
            formId: tabConfig['events'].formId,
            timeframeSelectId: tabConfig['events'].timeframeSelectId,
            playButtonId: tabConfig['events'].playButtonId,
            pauseButtonId: tabConfig['events'].pauseButtonId,
            startOverButtonId: tabConfig['events'].startOverButtonId,
            prevButtonId: tabConfig['events'].prevButtonId,
            nextButtonId: tabConfig['events'].nextButtonId,
            replaySpeedId: tabConfig['events'].replaySpeedId,
            startTimeInputId: tabConfig['events'].startTimeInputId,
            timestampDisplayId: tabConfig['events'].timestampDisplayId,
            replayControlsId: tabConfig['events'].replayControlsId
        },
        'earnings': {
            chartData: () => earningsChartData,
            setChartData: (data) => { earningsChartData = data; },
            oneMinData: () => earningsOneMinData,
            setOneMinData: (data) => { earningsOneMinData = data; },
            currentReplayIndex: () => earningsCurrentReplayIndex,
            setCurrentReplayIndex: (index) => { earningsCurrentReplayIndex = index; },
            currentSubIndex: () => earningsCurrentSubIndex,
            setCurrentSubIndex: (index) => { earningsCurrentSubIndex = index; },
            isReplaying: () => earningsIsReplaying,
            setIsReplaying: (value) => { earningsIsReplaying = value; },
            isPaused: () => earningsIsPaused,
            setIsPaused: (value) => { earningsIsPaused = value; },
            replayInterval: () => earningsReplayInterval,
            setReplayInterval: (interval) => { earningsReplayInterval = interval; },
            timeframe: () => earningsTimeframe,
            setTimeframe: (value) => { earningsTimeframe = value; },
            chartContainerId: tabConfig['earnings'].chartContainerId,
            formId: tabConfig['earnings'].formId,
            timeframeSelectId: tabConfig['earnings'].timeframeSelectId,
            playButtonId: tabConfig['earnings'].playButtonId,
            pauseButtonId: tabConfig['earnings'].pauseButtonId,
            startOverButtonId: tabConfig['earnings'].startOverButtonId,
            prevButtonId: tabConfig['earnings'].prevButtonId,
            nextButtonId: tabConfig['earnings'].nextButtonId,
            replaySpeedId: tabConfig['earnings'].replaySpeedId,
            startTimeInputId: tabConfig['earnings'].startTimeInputId,
            timestampDisplayId: tabConfig['earnings'].timestampDisplayId,
            replayControlsId: tabConfig['earnings'].replayControlsId
        }
    };
    return configs[section] || configs[''];
}

async function loadChart(event, tabId) {
    event.preventDefault();
    const config = getReplayConfig(tabId);
    const form = document.getElementById(config.formId);
    const formData = new FormData(form);
    const ticker = formData.get('ticker') || 'AAPL';
    const date = formData.get('date') || '2025-07-11';
    const timeframe = parseInt(formData.get('timeframe')) || 1;
    const replayPrefix = tabId ? `${tabId}-` : '';

    try {
        const response = await fetch(`/api/stock/chart?ticker=${ticker}&date=${date}&timeframe=${timeframe}`);
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }

        config.setChartData(data.chart_data.higher_tf);
        config.setOneMinData(data.chart_data.one_min);
        config.setCurrentReplayIndex(0);
        config.setCurrentSubIndex(0);
        config.setTimeframe(timeframe);
        config.setIsReplaying(false);
        config.setIsPaused(false);
        if (config.replayInterval()) {
            clearInterval(config.replayInterval());
            config.setReplayInterval(null);
        }

        const chartData = config.chartData();
        Plotly.newPlot(config.chartContainerId, [
            {
                x: chartData.timestamp,
                open: chartData.open,
                high: chartData.high,
                low: chartData.low,
                close: chartData.close,
                type: 'candlestick',
                name: chartData.ticker,
                increasing: { line: { color: '#00cc00' } },
                decreasing: { line: { color: '#ff0000' } }
            },
            {
                x: chartData.timestamp,
                y: chartData.volume,
                type: 'bar',
                name: 'Volume',
                yaxis: 'y2',
                marker: { color: '#888888' }
            }
        ], {
            title: `${chartData.ticker} ${timeframe}-Minute Candlestick Chart - ${chartData.date}`,
            xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M' },
            yaxis: { title: 'Price', domain: [0.3, 1] },
            yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
            showlegend: true,
            margin: { t: 50, b: 50, l: 50, r: 50 }
        }, { responsive: true });

        const replayControls = document.getElementById(config.replayControlsId);
        replayControls.style.display = 'block';
        document.getElementById(config.playButtonId).textContent = 'Play Replay';
        document.getElementById(config.playButtonId).disabled = false;
        document.getElementById(config.pauseButtonId).disabled = true;
        document.getElementById(config.startOverButtonId).disabled = true;
        document.getElementById(config.prevButtonId).disabled = true;
        document.getElementById(config.nextButtonId).disabled = chartData.count === 0;
        document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
    } catch (error) {
        console.error('Error loading chart:', error);
        alert('Failed to load chart data.');
    }
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    const oneMinData = config.oneMinData();
    const timeframe = config.timeframe();
    if (!chartData) return;

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const startTimeInput = document.getElementById(config.startTimeInputId).value;
    const replaySpeed = parseInt(document.getElementById(config.replaySpeedId).value);

    if (!config.isPaused()) {
        if (startTimeInput && startTimeInput.match(/^[0-2][0-9]:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            const targetTime = new Date(`${chartData.date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
            let currentReplayIndex = chartData.timestamp.findIndex(ts => new Date(ts).getTime() >= targetTime.getTime());
            if (currentReplayIndex === -1) {
                currentReplayIndex = 0;
                alert('Start time not found in chart data. Starting from first candle.');
            }
            config.setCurrentReplayIndex(currentReplayIndex);
            config.setCurrentSubIndex(0);
        } else {
            config.setCurrentReplayIndex(0);
            config.setCurrentSubIndex(0);
        }
    }

    if (config.isReplaying() && !config.isPaused()) return;

    config.setIsReplaying(true);
    config.setIsPaused(false);
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;

    Plotly.purge(config.chartContainerId);
    Plotly.newPlot(config.chartContainerId, [
        {
            x: [],
            open: [],
            high: [],
            low: [],
            close: [],
            type: 'candlestick',
            name: chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        },
        {
            x: [],
            y: [],
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        }
    ], {
        title: `${chartData.ticker} ${timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 }
    }, { responsive: true });

    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';

    config.setReplayInterval(setInterval(() => {
        if (config.currentReplayIndex() >= chartData.count) {
            stopReplay(section);
            return;
        }

        if (timeframe === 1) {
            Plotly.extendTraces(config.chartContainerId, {
                x: [[chartData.timestamp[config.currentReplayIndex()]]],
                open: [[chartData.open[config.currentReplayIndex()]]],
                high: [[chartData.high[config.currentReplayIndex()]]],
                low: [[chartData.low[config.currentReplayIndex()]]],
                close: [[chartData.close[config.currentReplayIndex()]]]
            }, [0]);
            Plotly.extendTraces(config.chartContainerId, {
                x: [[chartData.timestamp[config.currentReplayIndex()]]],
                y: [[chartData.volume[config.currentReplayIndex()]]]
            }, [1]);
            timestampDisplay.textContent = `Current Time: ${chartData.timestamp[config.currentReplayIndex()].split(' ')[1]}`;
            config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
        } else {
            const oneMinIndex = config.currentReplayIndex() * timeframe + config.currentSubIndex();
            if (oneMinIndex >= oneMinData.length) {
                config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
                config.setCurrentSubIndex(0);
                stopReplay(section);
                return;
            }

            const oneMinCandle = oneMinData[oneMinIndex];
            if (config.currentSubIndex() === 0) {
                Plotly.extendTraces(config.chartContainerId, {
                    x: [[oneMinCandle.timestamp]],
                    open: [[oneMinCandle.open]],
                    high: [[oneMinCandle.high]],
                    low: [[oneMinCandle.low]],
                    close: [[oneMinCandle.close]]
                }, [0]);
                Plotly.extendTraces(config.chartContainerId, {
                    x: [[oneMinCandle.timestamp]],
                    y: [[oneMinCandle.volume]]
                }, [1]);
            } else {
                const currentHigherTfIndex = Math.floor(config.currentReplayIndex());
                Plotly.restyle(config.chartContainerId, {
                    high: [[Math.max(chartData.high[currentHigherTfIndex], oneMinCandle.high)]],
                    low: [[Math.min(chartData.low[currentHigherTfIndex], oneMinCandle.low)]],
                    close: [[oneMinCandle.close]]
                }, [0], [currentHigherTfIndex]);
                Plotly.extendTraces(config.chartContainerId, {
                    x: [[oneMinCandle.timestamp]],
                    y: [[oneMinCandle.volume]]
                }, [1]);
            }

            timestampDisplay.textContent = `Current Time: ${oneMinCandle.timestamp.split(' ')[1]}`;
            config.setCurrentSubIndex(config.currentSubIndex() + 1);
            if (config.currentSubIndex() >= timeframe) {
                config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
                config.setCurrentSubIndex(0);
            }
        }

        prevButton.disabled = config.currentReplayIndex() <= 0 && config.currentSubIndex() <= 0;
        nextButton.disabled = config.currentReplayIndex() >= chartData.count;
        startOverButton.disabled = config.currentReplayIndex() <= 0 && config.currentSubIndex() <= 0;
    }, replaySpeed / (timeframe === 1 ? 1 : timeframe)));
}

function pauseReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying()) return;

    config.setIsReplaying(false);
    config.setIsPaused(true);
    clearInterval(config.replayInterval());
    config.setReplayInterval(null);

    document.getElementById(config.playButtonId).textContent = 'Resume Replay';
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;

    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setReplayInterval(null);
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    config.setCurrentReplayIndex(0);
    config.setCurrentSubIndex(0);

    Plotly.purge(config.chartContainerId);
    Plotly.newPlot(config.chartContainerId, [
        {
            x: [],
            open: [],
            high: [],
            low: [],
            close: [],
            type: 'candlestick',
            name: chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        },
        {
            x: [],
            y: [],
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        }
    ], {
        title: `${chartData.ticker} ${config.timeframe()}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 }
    }, { responsive: true });

    document.getElementById(config.playButtonId).textContent = 'Play Replay';
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
    document.getElementById(config.startOverButtonId).disabled = true;
    document.getElementById(config.prevButtonId).disabled = true;
    document.getElementById(config.nextButtonId).disabled = chartData.count === 0;
    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function stopReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || (!config.isReplaying() && !config.isPaused())) return;

    config.setIsReplaying(false);
    config.setIsPaused(false);
    clearInterval(config.replayInterval());
    config.setReplayInterval(null);

    document.getElementById(config.playButtonId).textContent = 'Play Replay';
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
    document.getElementById(config.startOverButtonId).disabled = true;
    document.getElementById(config.prevButtonId).disabled = true;
    document.getElementById(config.nextButtonId).disabled = true;

    Plotly.newPlot(config.chartContainerId, [
        {
            x: chartData.timestamp,
            open: chartData.open,
            high: chartData.high,
            low: chartData.low,
            close: chartData.close,
            type: 'candlestick',
            name: chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        },
        {
            x: chartData.timestamp,
            y: chartData.volume,
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        }
    ], {
        title: `${chartData.ticker} ${config.timeframe()}-Minute Candlestick Chart - ${chartData.date}`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 }
    }, { responsive: true });

    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || (config.currentReplayIndex() <= 0 && config.currentSubIndex() <= 0)) return;

    if (config.timeframe() === 1) {
        config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
    } else {
        config.setCurrentSubIndex(config.currentSubIndex() - 1);
        if (config.currentSubIndex() < 0) {
            config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
            config.setCurrentSubIndex(config.timeframe() - 1);
        }
    }
    updateChartToIndex(section);
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || config.currentReplayIndex() >= chartData.count) return;

    if (config.timeframe() === 1) {
        config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    } else {
        config.setCurrentSubIndex(config.currentSubIndex() + 1);
        if (config.currentSubIndex() >= config.timeframe()) {
            config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
            config.setCurrentSubIndex(0);
        }
    }
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    const oneMinData = config.oneMinData();
    const timeframe = config.timeframe();
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);

    Plotly.purge(config.chartContainerId);
    let candlestickTrace, volumeTrace;
    if (timeframe === 1) {
        candlestickTrace = {
            x: chartData.timestamp.slice(0, config.currentReplayIndex()),
            open: chartData.open.slice(0, config.currentReplayIndex()),
            high: chartData.high.slice(0, config.currentReplayIndex()),
            low: chartData.low.slice(0, config.currentReplayIndex()),
            close: chartData.close.slice(0, config.currentReplayIndex()),
            type: 'candlestick',
            name: chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        volumeTrace = {
            x: chartData.timestamp.slice(0, config.currentReplayIndex()),
            y: chartData.volume.slice(0, config.currentReplayIndex()),
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        timestampDisplay.textContent = config.currentReplayIndex() > 0
            ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
            : 'Current Time: --:--:--';
    } else {
        const oneMinIndex = config.currentReplayIndex() * timeframe + config.currentSubIndex();
        const oneMinSlice = oneMinData.slice(0, oneMinIndex);
        candlestickTrace = {
            x: oneMinSlice.map(d => d.timestamp),
            open: oneMinSlice.map(d => d.open),
            high: oneMinSlice.map(d => d.high),
            low: oneMinSlice.map(d => d.low),
            close: oneMinSlice.map(d => d.close),
            type: 'candlestick',
            name: chartData.ticker,
            increasing: { line: { color: '#00cc00' } },
            decreasing: { line: { color: '#ff0000' } }
        };
        volumeTrace = {
            x: oneMinSlice.map(d => d.timestamp),
            y: oneMinSlice.map(d => d.volume),
            type: 'bar',
            name: 'Volume',
            yaxis: 'y2',
            marker: { color: '#888888' }
        };
        timestampDisplay.textContent = oneMinIndex > 0
            ? `Current Time: ${oneMinData[oneMinIndex - 1].timestamp.split(' ')[1]}`
            : 'Current Time: --:--:--';
    }

    Plotly.newPlot(config.chartContainerId, [candlestickTrace, volumeTrace], {
        title: `${chartData.ticker} ${timeframe}-Minute Candlestick Chart - ${chartData.date} (Replay)`,
        xaxis: { title: 'Time', type: 'date', tickformat: '%H:%M' },
        yaxis: { title: 'Price', domain: [0.3, 1] },
        yaxis2: { title: 'Volume', domain: [0, 0.25], anchor: 'x' },
        showlegend: true,
        margin: { t: 50, b: 50, l: 50, r: 50 }
    }, { responsive: true });

    prevButton.disabled = config.currentReplayIndex() <= 0 && config.currentSubIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;
    startOverButton.disabled = config.currentReplayIndex() <= 0 && config.currentSubIndex() <= 0;
}

// Event listeners for each tab
document.addEventListener('DOMContentLoaded', () => {
    Object.keys(tabConfig).forEach(tabId => {
        const config = getReplayConfig(tabId);
        const form = document.getElementById(config.formId);
        if (form) {
            form.addEventListener('submit', (e) => loadChart(e, tabId));
        }
        document.getElementById(config.playButtonId)?.addEventListener('click', () => startReplay(tabId));
        document.getElementById(config.pauseButtonId)?.addEventListener('click', () => pauseReplay(tabId));
        document.getElementById(config.startOverButtonId)?.addEventListener('click', () => startOverReplay(tabId));
        document.getElementById(config.prevButtonId)?.addEventListener('click', () => prevCandle(tabId));
        document.getElementById(config.nextButtonId)?.addEventListener('click', () => nextCandle(tabId));
        document.getElementById(config.replaySpeedId)?.addEventListener('change', () => {
            if (config.isReplaying()) {
                pauseReplay(tabId);
                startReplay(tabId);
            }
        });
    });
});