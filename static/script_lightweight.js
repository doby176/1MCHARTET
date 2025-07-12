document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app with lightweight-charts...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    loadBinOptions();
    populateEarningsOutcomes();
    
    // Initialize stock forms for all tabs
    document.getElementById('stock-form-simulator').addEventListener('submit', (e) => loadChart(e, 'market-simulator'));
    document.getElementById('stock-form-gap').addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
    document.getElementById('stock-form-events').addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
    
    // Replay control listeners (Market Simulator)
    document.getElementById('play-replay-simulator').addEventListener('click', () => startReplay('simulator'));
    document.getElementById('pause-replay-simulator').addEventListener('click', () => pauseReplay('simulator'));
    document.getElementById('start-over-replay-simulator').addEventListener('click', () => startOverReplay('simulator'));
    document.getElementById('prev-candle-simulator').addEventListener('click', () => prevCandle('simulator'));
    document.getElementById('next-candle-simulator').addEventListener('click', () => nextCandle('simulator'));
    document.getElementById('replay-speed-simulator').addEventListener('change', () => updateReplaySpeed('simulator'));
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
    document.getElementById('ticker-select-simulator').addEventListener('change', () => loadDates('ticker-select-simulator', 'date-simulator'));
    document.getElementById('ticker-select-gap').addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
    document.getElementById('ticker-select-events').addEventListener('change', () => loadDates('ticker-select-events', 'date-events'));
});

// Global chart instances for lightweight-charts
let chartInstances = {};

// Replay globals for Market Simulator
let chartDataSimulator = null;
let replayIntervalSimulator = null;
let currentReplayIndexSimulator = 0;
let isReplayingSimulator = false;
let isPausedSimulator = false;
let aggregatedCandlesSimulator = [];
let timeframeSimulator = 1;
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
let aggregatedCandlesGap = [];
let timeframeGap = 1;

// Replay globals for Events Analysis
let chartDataEvents = null;
let replayIntervalEvents = null;
let currentReplayIndexEvents = 0;
let isReplayingEvents = false;
let isPausedEvents = false;
let aggregatedCandlesEvents = [];
let timeframeEvents = 1;

// Replay globals for Earnings Analysis
let chartDataEarnings = null;
let replayIntervalEarnings = null;
let currentReplayIndexEarnings = 0;
let isReplayingEarnings = false;
let isPausedEarnings = false;
let aggregatedCandlesEarnings = [];
let timeframeEarnings = 1;

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

function createLightweightChart(containerId, data, timeframe) {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error(`Container with ID '${containerId}' not found`);
        return null;
    }
    
    // Clear existing chart
    container.innerHTML = '';
    
    try {
        // Check if LightweightCharts is available
        if (typeof LightweightCharts === 'undefined') {
            throw new Error('LightweightCharts library is not loaded');
        }
        
        // Create chart
        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 400,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#333',
            },
            grid: {
                vertLines: { color: '#e1e1e1' },
                horzLines: { color: '#e1e1e1' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#485c7b',
            },
            rightPriceScale: {
                borderColor: '#485c7b',
            },
        });

        // Create candlestick series
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#00cc00',
            downColor: '#ff0000',
            borderDownColor: '#ff0000',
            borderUpColor: '#00cc00',
            wickDownColor: '#ff0000',
            wickUpColor: '#00cc00',
        });

        // Create volume series
        const volumeSeries = chart.addHistogramSeries({
            color: '#888888',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'volume',
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });

        // Convert data to lightweight-charts format
        const candleData = data.timestamp.map((_, i) => ({
            time: data.timestamp[i],
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            close: data.close[i]
        }));

        const volumeData = data.timestamp.map((_, i) => ({
            time: data.timestamp[i],
            value: data.volume[i],
            color: data.close[i] >= data.open[i] ? '#00cc0080' : '#ff000080'
        }));

        // Set data
        candleSeries.setData(candleData);
        volumeSeries.setData(volumeData);

        // Handle window resize
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== container) return;
            const newRect = entries[0].contentRect;
            chart.applyOptions({ width: newRect.width, height: newRect.height });
        });
        resizeObserver.observe(container);

        // Store chart instance and series
        chartInstances[containerId] = {
            chart,
            candleSeries,
            volumeSeries,
            resizeObserver,
            data: data,
            timeframe: timeframe
        };

        console.log(`✅ Successfully created lightweight chart: ${containerId}`);
        return chartInstances[containerId];
    } catch (error) {
        console.error(`❌ Error creating chart ${containerId}: ${error.message}`);
        container.innerHTML = `<p style="color: red;">Error creating chart: ${error.message}</p>`;
        return null;
    }
}

function updateChartData(containerId, newData) {
    if (!chartInstances[containerId]) {
        console.error(`Chart instance not found for ${containerId}`);
        return;
    }

    try {
        const instance = chartInstances[containerId];
        
        // Convert new data to lightweight-charts format
        const candleData = newData.timestamp.map((_, i) => ({
            time: newData.timestamp[i],
            open: newData.open[i],
            high: newData.high[i],
            low: newData.low[i],
            close: newData.close[i]
        }));

        const volumeData = newData.timestamp.map((_, i) => ({
            time: newData.timestamp[i],
            value: newData.volume[i],
            color: newData.close[i] >= newData.open[i] ? '#00cc0080' : '#ff000080'
        }));

        // Update the series data
        instance.candleSeries.setData(candleData);
        instance.volumeSeries.setData(volumeData);
        
        // Update stored data
        instance.data = newData;
        
        console.log(`✅ Successfully updated chart data for ${containerId}`);
    } catch (error) {
        console.error(`❌ Error updating chart data for ${containerId}: ${error.message}`);
    }
}

function destroyChart(containerId) {
    if (chartInstances[containerId]) {
        try {
            if (chartInstances[containerId].chart) {
                chartInstances[containerId].chart.remove();
            }
            if (chartInstances[containerId].resizeObserver) {
                chartInstances[containerId].resizeObserver.disconnect();
            }
            delete chartInstances[containerId];
            console.log(`✅ Successfully destroyed chart: ${containerId}`);
        } catch (error) {
            console.error(`❌ Error destroying chart ${containerId}: ${error.message}`);
            delete chartInstances[containerId];
        }
    }
}

function renderChart(section, candles, currentCandleIndex = -1, minuteIndex = null) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData) return;
    
    // Convert candles to lightweight-charts format
    const candleData = candles.map((c, i) => {
        let high = c.high;
        let low = c.low;
        let close = c.close;
        
        if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
            high = c.minuteUpdates[minuteIndex].high;
            low = c.minuteUpdates[minuteIndex].low;
            close = c.minuteUpdates[minuteIndex].close;
        }
        
        return {
            time: c.timestamp,
            open: c.open,
            high: high,
            low: low,
            close: close
        };
    });

    const volumeData = candles.map((c, i) => {
        let close = c.close;
        if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
            close = c.minuteUpdates[minuteIndex].close;
        }
        
        return {
            time: c.timestamp,
            value: c.volume,
            color: close >= c.open ? '#00cc0080' : '#ff000080'
        };
    });

    // Update chart data
    const instance = chartInstances[config.chartContainerId];
    if (instance) {
        instance.candleSeries.setData(candleData);
        instance.volumeSeries.setData(volumeData);
    }
}