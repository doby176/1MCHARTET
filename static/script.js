document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing 1MChart app with lightweight-charts V4...');
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
    
    // Initialize chart controls for all sections
    initializeChartControls();
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

// Initialize chart controls for all sections
function initializeChartControls() {
    const sections = ['simulator', 'gap', 'events', 'earnings'];
    
    sections.forEach(section => {
        const zoomInBtn = document.getElementById(`zoom-in-${section}`);
        const zoomOutBtn = document.getElementById(`zoom-out-${section}`);
        const resetZoomBtn = document.getElementById(`reset-zoom-${section}`);
        const fitContentBtn = document.getElementById(`fit-content-${section}`);
        const toggleCrosshairBtn = document.getElementById(`toggle-crosshair-${section}`);
        const toggleVolumeBtn = document.getElementById(`toggle-volume-${section}`);
        const toggleGridBtn = document.getElementById(`toggle-grid-${section}`);
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => zoomChart(section, 'in'));
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => zoomChart(section, 'out'));
        }
        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => zoomChart(section, 'reset'));
        }
        if (fitContentBtn) {
            fitContentBtn.addEventListener('click', () => zoomChart(section, 'fit'));
        }
        if (toggleCrosshairBtn) {
            toggleCrosshairBtn.addEventListener('click', () => toggleCrosshair(section));
        }
        if (toggleVolumeBtn) {
            toggleVolumeBtn.addEventListener('click', () => toggleVolume(section));
        }
        if (toggleGridBtn) {
            toggleGridBtn.addEventListener('click', () => toggleGrid(section));
        }
    });
}

// Chart control functions
function zoomChart(section, action) {
    if (!chartInstances[section] || !chartInstances[section].chart) return;
    
    const chart = chartInstances[section].chart;
    const timeScale = chart.timeScale();
    
    switch (action) {
        case 'in':
            timeScale.zoomIn();
            break;
        case 'out':
            timeScale.zoomOut();
            break;
        case 'reset':
        case 'fit':
            timeScale.fitContent();
            break;
    }
}

function toggleCrosshair(section) {
    if (!chartInstances[section] || !chartInstances[section].chart) return;
    
    const chart = chartInstances[section].chart;
    const currentMode = chartInstances[section].crosshairMode || LightweightCharts.CrosshairMode.Normal;
    const newMode = currentMode === LightweightCharts.CrosshairMode.Normal 
        ? LightweightCharts.CrosshairMode.Hidden 
        : LightweightCharts.CrosshairMode.Normal;
    
    chart.applyOptions({
        crosshair: {
            mode: newMode,
        }
    });
    
    chartInstances[section].crosshairMode = newMode;
    
    // Update button text
    const btn = document.getElementById(`toggle-crosshair-${section}`);
    if (btn) {
        btn.textContent = newMode === LightweightCharts.CrosshairMode.Hidden ? 'Show Crosshair' : 'Hide Crosshair';
        btn.classList.toggle('active', newMode === LightweightCharts.CrosshairMode.Normal);
    }
}

function toggleVolume(section) {
    if (!chartInstances[section] || !chartInstances[section].volumeSeries) return;
    
    const volumeSeries = chartInstances[section].volumeSeries;
    const isVisible = chartInstances[section].volumeVisible !== false;
    
    volumeSeries.applyOptions({
        visible: !isVisible
    });
    
    chartInstances[section].volumeVisible = !isVisible;
    
    // Update button text
    const btn = document.getElementById(`toggle-volume-${section}`);
    if (btn) {
        btn.textContent = isVisible ? 'Show Volume' : 'Hide Volume';
        btn.classList.toggle('active', !isVisible);
    }
}

function toggleGrid(section) {
    if (!chartInstances[section] || !chartInstances[section].chart) return;
    
    const chart = chartInstances[section].chart;
    const isVisible = chartInstances[section].gridVisible !== false;
    
    chart.applyOptions({
        grid: {
            vertLines: { visible: !isVisible },
            horzLines: { visible: !isVisible }
        }
    });
    
    chartInstances[section].gridVisible = !isVisible;
    
    // Update button text
    const btn = document.getElementById(`toggle-grid-${section}`);
    if (btn) {
        btn.textContent = isVisible ? 'Show Grid' : 'Hide Grid';
        btn.classList.toggle('active', !isVisible);
    }
}

// Aggregate candles for different timeframes
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

// Create a lightweight-charts chart with maximum interactivity
function createLightweightChart(containerId, ticker, date, timeframe) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return null;
    }
    
    // Clear existing chart
    container.innerHTML = '';
    
    // Create chart with advanced options
    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 600,
        layout: {
            background: { color: '#ffffff' },
            textColor: '#333333',
            fontSize: 12,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        grid: {
            vertLines: { 
                color: '#e1e1e1',
                style: LightweightCharts.LineStyle.Solid,
                visible: true,
            },
            horzLines: { 
                color: '#e1e1e1',
                style: LightweightCharts.LineStyle.Solid,
                visible: true,
            },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#758696',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                visible: true,
                labelVisible: true,
            },
            horzLine: {
                color: '#758696',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                visible: true,
                labelVisible: true,
            },
        },
        rightPriceScale: {
            borderColor: '#cccccc',
            borderVisible: true,
            scaleMargins: {
                top: 0.1,
                bottom: 0.1,
            },
            mode: LightweightCharts.PriceScaleMode.Normal,
            autoScale: true,
            invertScale: false,
            alignLabels: true,
            visible: true,
        },
        leftPriceScale: {
            visible: false,
        },
        timeScale: {
            borderColor: '#cccccc',
            borderVisible: true,
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 12,
            barSpacing: 6,
            minBarSpacing: 2,
            fixLeftEdge: false,
            fixRightEdge: false,
            lockVisibleTimeRangeOnResize: true,
            rightBarStaysOnScroll: true,
            visible: true,
            shiftVisibleRangeOnNewBar: true,
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
        },
        handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
        },
        kineticScroll: {
            touch: true,
            mouse: false,
        },
    });

    // Create candlestick series with enhanced styling
    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00cc00',
        downColor: '#ff0000',
        borderDownColor: '#ff0000',
        borderUpColor: '#00cc00',
        wickDownColor: '#ff0000',
        wickUpColor: '#00cc00',
        priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
        },
        title: `${ticker} ${timeframe}min`,
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
        title: 'Volume',
    });

    // Create a separate price scale for volume
    chart.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.8,
            bottom: 0,
        },
    });

    // Store chart instance and series
    const section = containerId.replace('lightweight-chart-', '');
    chartInstances[section] = {
        chart: chart,
        candlestickSeries: candlestickSeries,
        volumeSeries: volumeSeries,
        container: container,
        ticker: ticker,
        date: date,
        timeframe: timeframe,
        crosshairMode: LightweightCharts.CrosshairMode.Normal,
        volumeVisible: true,
        gridVisible: true,
        tooltip: null,
        priceLines: [],
        markers: [],
    };

    // Add interactive tooltip
    addInteractiveTooltip(section);

    // Add resize handler
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) {
            return;
        }
        const newRect = entries[0].contentRect;
        chart.applyOptions({ 
            width: newRect.width, 
            height: Math.max(300, newRect.height) 
        });
    });
    
    resizeObserver.observe(container);
    chartInstances[section].resizeObserver = resizeObserver;

    // Add click handler for price lines
    chart.subscribeClick((param) => {
        if (param.time) {
            addPriceLine(section, param.seriesData);
        }
    });

    return chartInstances[section];
}

// Add interactive tooltip functionality
function addInteractiveTooltip(section) {
    if (!chartInstances[section]) return;
    
    const chart = chartInstances[section].chart;
    const container = chartInstances[section].container;
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);
    
    chartInstances[section].tooltip = tooltip;
    
    // Subscribe to crosshair move events
    chart.subscribeCrosshairMove((param) => {
        if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
            tooltip.style.display = 'none';
            return;
        }
        
        const candlestickData = param.seriesData.get(chartInstances[section].candlestickSeries);
        const volumeData = param.seriesData.get(chartInstances[section].volumeSeries);
        
        if (candlestickData) {
            const time = new Date(param.time * 1000);
            const timeString = time.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const change = candlestickData.close - candlestickData.open;
            const changePercent = ((change / candlestickData.open) * 100).toFixed(2);
            const changeClass = change >= 0 ? 'positive' : 'negative';
            
            tooltip.innerHTML = `
                <div class="tooltip-title">${chartInstances[section].ticker} - ${timeString}</div>
                <div class="tooltip-value">Open: $${candlestickData.open.toFixed(2)}</div>
                <div class="tooltip-value">High: $${candlestickData.high.toFixed(2)}</div>
                <div class="tooltip-value">Low: $${candlestickData.low.toFixed(2)}</div>
                <div class="tooltip-value">Close: $${candlestickData.close.toFixed(2)}</div>
                <div class="tooltip-value ${changeClass}">Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent}%)</div>
                ${volumeData ? `<div class="tooltip-value">Volume: ${formatVolume(volumeData.value)}</div>` : ''}
            `;
            
            // Position tooltip
            const containerRect = container.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            let left = param.point.x + 10;
            let top = param.point.y - 10;
            
            // Adjust if tooltip goes off screen
            if (left + tooltipRect.width > containerRect.width) {
                left = param.point.x - tooltipRect.width - 10;
            }
            if (top - tooltipRect.height < 0) {
                top = param.point.y + 20;
            }
            
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.display = 'block';
        }
    });
}

// Format volume for display
function formatVolume(volume) {
    if (volume >= 1000000) {
        return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
        return (volume / 1000).toFixed(1) + 'K';
    } else {
        return volume.toString();
    }
}

// Add price line at clicked position
function addPriceLine(section, seriesData) {
    if (!chartInstances[section] || !seriesData) return;
    
    const candlestickData = seriesData.get(chartInstances[section].candlestickSeries);
    if (!candlestickData) return;
    
    const price = candlestickData.close;
    const candlestickSeries = chartInstances[section].candlestickSeries;
    
    // Remove existing price lines (limit to 3)
    if (chartInstances[section].priceLines.length >= 3) {
        const oldLine = chartInstances[section].priceLines.shift();
        candlestickSeries.removePriceLine(oldLine);
    }
    
    // Add new price line
    const priceLine = candlestickSeries.createPriceLine({
        price: price,
        color: '#2962FF',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: `$${price.toFixed(2)}`,
    });
    
    chartInstances[section].priceLines.push(priceLine);
}

// Render chart with data
function renderChart(section, candles, currentCandleIndex = -1, minuteIndex = null) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData || !candles || candles.length === 0) {
        console.warn(`No data to render for section: ${section}`);
        return;
    }
    
    const containerId = `lightweight-chart-${section}`;
    
    // Create chart if it doesn't exist
    if (!chartInstances[section]) {
        createLightweightChart(containerId, chartData.ticker, chartData.date, config.timeframe());
    }
    
    if (!chartInstances[section]) {
        console.error(`Failed to create chart for section: ${section}`);
        return;
    }
    
    const { candlestickSeries, volumeSeries } = chartInstances[section];
    
    // Prepare candlestick data
    const candlestickData = candles.map((candle, i) => {
        let high = candle.high;
        let low = candle.low;
        let close = candle.close;
        
        // Apply minute-by-minute updates for current candle
        if (i === currentCandleIndex && minuteIndex !== null && candle.minuteUpdates[minuteIndex]) {
            const update = candle.minuteUpdates[minuteIndex];
            high = update.high;
            low = update.low;
            close = update.close;
        }
        
        return {
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            open: candle.open,
            high: high,
            low: low,
            close: close,
        };
    });
    
    // Prepare volume data
    const volumeData = candles.map((candle, i) => {
        let volume = candle.volume;
        
        // Apply minute-by-minute updates for current candle
        if (i === currentCandleIndex && minuteIndex !== null && candle.minuteUpdates[minuteIndex]) {
            volume = candle.minuteUpdates[minuteIndex].volume;
        }
        
        return {
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            value: volume,
            color: candle.close >= candle.open ? '#00cc0080' : '#ff000080',
        };
    });
    
    // Update chart data
    candlestickSeries.setData(candlestickData);
    volumeSeries.setData(volumeData);
    
    // Add markers for significant events
    if (currentCandleIndex === -1) {
        addSignificantMarkers(section, candlestickData);
    }
    
    // Fit content to show all data
    chartInstances[section].chart.timeScale().fitContent();
    
    console.log(`Chart rendered for ${section} with ${candlestickData.length} candles`);
}

// Add markers for significant price movements
function addSignificantMarkers(section, candlestickData) {
    if (!chartInstances[section] || candlestickData.length < 2) return;
    
    const candlestickSeries = chartInstances[section].candlestickSeries;
    const markers = [];
    
    // Find significant price movements (>2% change)
    for (let i = 1; i < candlestickData.length; i++) {
        const prev = candlestickData[i - 1];
        const current = candlestickData[i];
        const change = ((current.close - prev.close) / prev.close) * 100;
        
        if (Math.abs(change) > 2) {
            markers.push({
                time: current.time,
                position: change > 0 ? 'belowBar' : 'aboveBar',
                color: change > 0 ? '#00cc00' : '#ff0000',
                shape: change > 0 ? 'arrowUp' : 'arrowDown',
                text: `${change.toFixed(1)}%`,
                size: 1,
            });
        }
    }
    
    if (markers.length > 0) {
        candlestickSeries.setMarkers(markers);
        chartInstances[section].markers = markers;
    }
}

// Update chart data during replay
function updateChartData(section, candles, currentCandleIndex = -1, minuteIndex = null) {
    if (!chartInstances[section]) {
        renderChart(section, candles, currentCandleIndex, minuteIndex);
        return;
    }
    
    const { candlestickSeries, volumeSeries } = chartInstances[section];
    
    // Prepare data for lightweight-charts
    const candlestickData = candles.map((c, i) => {
        let high = c.high;
        let low = c.low;
        let close = c.close;
        
        if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
            high = c.minuteUpdates[minuteIndex].high;
            low = c.minuteUpdates[minuteIndex].low;
            close = c.minuteUpdates[minuteIndex].close;
        }
        
        return {
            time: Math.floor(new Date(c.timestamp).getTime() / 1000),
            open: c.open,
            high: high,
            low: low,
            close: close,
        };
    });
    
    const volumeData = candles.map((c, i) => {
        let volume = c.volume;
        if (i === currentCandleIndex && minuteIndex !== null && c.minuteUpdates[minuteIndex]) {
            volume = c.minuteUpdates[minuteIndex].volume;
        }
        
        return {
            time: Math.floor(new Date(c.timestamp).getTime() / 1000),
            value: volume,
            color: c.close >= c.open ? '#00cc0080' : '#ff000080',
        };
    });
    
    // Update series data
    candlestickSeries.setData(candlestickData);
    volumeSeries.setData(volumeData);
}

// Destroy chart instance
function destroyChart(section) {
    if (chartInstances[section]) {
        if (chartInstances[section].chart) {
            chartInstances[section].chart.remove();
        }
        if (chartInstances[section].resizeObserver) {
            chartInstances[section].resizeObserver.disconnect();
        }
        if (chartInstances[section].tooltip) {
            chartInstances[section].tooltip.remove();
        }
        delete chartInstances[section];
    }
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
    const tickerSelectSimulator = document.getElementById('ticker-select-simulator');
    const tickerSelectGap = document.getElementById('ticker-select-gap');
    const tickerSelectEvents = document.getElementById('ticker-select-events');
    tickerSelectSimulator.disabled = true;
    tickerSelectGap.disabled = true;
    tickerSelectEvents.disabled = true;
    tickerSelectSimulator.innerHTML = '<option value="">Loading tickers...</option>';
    tickerSelectGap.innerHTML = '<option value="">Loading tickers...</option>';
    tickerSelectEvents.innerHTML = '<option value="">Loading tickers...</option>';
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
            tickerSelectSimulator.innerHTML = `<option value="">${data.error}</option>`;
            tickerSelectGap.innerHTML = `<option value="">${data.error}</option>`;
            tickerSelectEvents.innerHTML = `<option value="">${data.error}</option>`;
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
        tickerSelectSimulator.innerHTML = '<option value="">Select a ticker</option>';
        tickerSelectGap.innerHTML = '<option value="">Select a ticker</option>';
        tickerSelectEvents.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelectSimulator.appendChild(option.cloneNode(true));
            tickerSelectGap.appendChild(option.cloneNode(true));
            tickerSelectEvents.appendChild(option);
        });
        tickerSelectSimulator.disabled = false;
        tickerSelectGap.disabled = false;
        tickerSelectEvents.disabled = false;
    } catch (error) {
        console.error('Error loading tickers:', error.message);
        tickerSelectSimulator.innerHTML = '<option value="">Error loading tickers</option>';
        tickerSelectGap.innerHTML = '<option value="">Error loading tickers</option>';
        tickerSelectEvents.innerHTML = '<option value="">Error loading tickers</option>';
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
    const ticker = tickerSelect.value;

    if (!ticker) {
        dateInput.disabled = true;
        return;
    }

    dateInput.disabled = true;
    try {
        console.log(`Fetching dates for ticker: ${ticker}`);
        const response = await fetch(`/api/tickers/${encodeURIComponent(ticker)}/dates`, {
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
            return;
        }
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Fetched dates:', data.dates);
        if (!data.dates || !Array.isArray(data.dates)) {
            throw new Error('Invalid response format: dates array not found');
        }
        
        // Set min and max dates
        const dates = data.dates.sort();
        if (dates.length > 0) {
            dateInput.min = dates[0];
            dateInput.max = dates[dates.length - 1];
            dateInput.disabled = false;
        }
    } catch (error) {
        console.error('Error loading dates:', error.message);
        alert('Failed to load dates: ' + error.message + '. Please try again.');
    }
}

async function loadChart(event, tabId) {
    event.preventDefault();
    
    const replayPrefix = tabId === 'market-simulator' ? 'simulator' : 
                        tabId === 'gap-analysis' ? 'gap' :
                        tabId === 'events-analysis' ? 'events' : 'earnings';
    
    const config = {
        'market-simulator': {
            tickerSelectId: 'ticker-select-simulator',
            dateInputId: 'date-simulator',
            timeframeSelectId: 'timeframe-select-simulator',
            chartContainerId: 'lightweight-chart-simulator',
            formId: 'stock-form-simulator',
            restrictHours: false,
            replayControlsId: 'replay-controls-simulator',
        },
        'gap-analysis': {
            tickerSelectId: 'ticker-select-gap',
            dateInputId: 'date-gap',
            timeframeSelectId: 'timeframe-select-gap',
            chartContainerId: 'lightweight-chart-gap',
            formId: 'stock-form-gap',
            restrictHours: true,
            replayControlsId: 'replay-controls-gap',
        },
        'events-analysis': {
            tickerSelectId: 'ticker-select-events',
            dateInputId: 'date-events',
            timeframeSelectId: 'timeframe-select-events',
            chartContainerId: 'lightweight-chart-events',
            formId: 'stock-form-events',
            restrictHours: false,
            replayControlsId: 'replay-controls-events',
        },
        'earnings-analysis': {
            tickerSelectId: 'earnings-ticker-select',
            dateInputId: 'date-gap',
            timeframeSelectId: 'timeframe-select-earnings',
            chartContainerId: 'lightweight-chart-earnings',
            formId: 'earnings-form',
            restrictHours: true,
            replayControlsId: 'replay-controls-earnings',
        }
    }[tabId];

    if (!config) {
        console.error('Invalid tab ID:', tabId);
        return;
    }

    const { tickerSelectId, dateInputId, timeframeSelectId, chartContainerId, formId, restrictHours, replayControlsId } = config;
    
    const ticker = document.getElementById(tickerSelectId).value;
    const date = document.getElementById(dateInputId).value;
    const timeframe = parseInt(document.getElementById(timeframeSelectId).value);
    const chartContainer = document.getElementById(chartContainerId);
    const replayControls = document.getElementById(replayControlsId);
    const button = document.querySelector(`#${formId} button[type="submit"]`);
    const inputs = document.querySelectorAll(`#${formId} input, #${formId} select`);

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem(`chartRateLimitReset_${tabId}`);
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        const resetTime = new Date(parseInt(rateLimitResetTime)).toLocaleTimeString();
        const errorMsg = `Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${resetTime} to try again.`;
        
        if (chartContainer) {
            chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">${errorMsg}</p>`;
        }
        
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || !date || !timeframe) {
        if (chartContainer) {
            chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe.</p>';
        }
        replayControls.style.display = 'none';
        return;
    }

    console.log(`Loading chart for ticker=${ticker}, date=${date}, timeframe=${timeframe}, restrict_hours=${restrictHours}, tab=${tabId}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${encodeURIComponent(timeframe)}&replay_mode=${timeframe > 1}${restrictHours ? '&restrict_hours=true' : ''}`;
    console.log('Fetching URL:', url);
    
    if (chartContainer) {
        chartContainer.innerHTML = '<p>Loading chart...</p>';
    }
    
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
            if (chartContainer) {
                chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            }
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            
            // Set rate limit reset time
            localStorage.setItem(`chartRateLimitReset_${tabId}`, (Date.now() + 12 * 60 * 60 * 1000).toString());
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Load Chart';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem(`chartRateLimitReset_${tabId}`);
                if (chartContainer) {
                    chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe to generate a chart.</p>';
                }
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.error) {
            console.error('Chart error:', data.error);
            if (chartContainer) {
                chartContainer.innerHTML = `<p>${data.error}</p>`;
            }
            replayControls.style.display = 'none';
            return;
        }
        
        console.log('Chart data loaded successfully:', data);
        
        // Store chart data globally based on section
        if (replayPrefix === 'simulator') {
            chartDataSimulator = data;
            aggregatedCandlesSimulator = aggregateCandles(data, timeframe);
            timeframeSimulator = timeframe;
            currentReplayIndexSimulator = 0;
            isReplayingSimulator = false;
            isPausedSimulator = false;
            if (replayIntervalSimulator) clearInterval(replayIntervalSimulator);
        } else if (replayPrefix === 'gap') {
            chartDataGap = data;
            aggregatedCandlesGap = aggregateCandles(data, timeframe);
            timeframeGap = timeframe;
            currentReplayIndexGap = 0;
            isReplayingGap = false;
            isPausedGap = false;
            if (replayIntervalGap) clearInterval(replayIntervalGap);
        } else if (replayPrefix === 'events') {
            chartDataEvents = data;
            aggregatedCandlesEvents = aggregateCandles(data, timeframe);
            timeframeEvents = timeframe;
            currentReplayIndexEvents = 0;
            isReplayingEvents = false;
            isPausedEvents = false;
            if (replayIntervalEvents) clearInterval(replayIntervalEvents);
        } else if (replayPrefix === 'earnings') {
            chartDataEarnings = data;
            aggregatedCandlesEarnings = aggregateCandles(data, timeframe);
            timeframeEarnings = timeframe;
            currentReplayIndexEarnings = 0;
            isReplayingEarnings = false;
            isPausedEarnings = false;
            if (replayIntervalEarnings) clearInterval(replayIntervalEarnings);
        }

        // Clear existing chart container and render new chart
        if (chartContainer) {
            chartContainer.innerHTML = `<div class="chart-controls">
                <button id="zoom-in-${replayPrefix}" class="chart-control-btn">Zoom In</button>
                <button id="zoom-out-${replayPrefix}" class="chart-control-btn">Zoom Out</button>
                <button id="reset-zoom-${replayPrefix}" class="chart-control-btn">Reset Zoom</button>
                <button id="fit-content-${replayPrefix}" class="chart-control-btn">Fit Content</button>
                <button id="toggle-crosshair-${replayPrefix}" class="chart-control-btn">Toggle Crosshair</button>
                <button id="toggle-volume-${replayPrefix}" class="chart-control-btn">Toggle Volume</button>
                <button id="toggle-grid-${replayPrefix}" class="chart-control-btn">Toggle Grid</button>
            </div>
            <div id="lightweight-chart-${replayPrefix}"></div>`;
        }
        
        // Reinitialize chart controls for this section
        initializeChartControls();
        
        // Render initial chart - show complete chart for initial view
        const aggregatedCandlesVar = replayPrefix === 'simulator' ? aggregatedCandlesSimulator : 
                                   replayPrefix === 'gap' ? aggregatedCandlesGap :
                                   replayPrefix === 'events' ? aggregatedCandlesEvents :
                                   aggregatedCandlesEarnings;
        
        renderChart(replayPrefix, aggregatedCandlesVar);
        
        // Show replay controls
        replayControls.style.display = 'flex';
        
        // Update replay control buttons
        document.getElementById(`play-replay-${replayPrefix}`).disabled = false;
        document.getElementById(`start-over-replay-${replayPrefix}`).disabled = false;
        document.getElementById(`next-candle-${replayPrefix}`).disabled = false;
        document.getElementById(`prev-candle-${replayPrefix}`).disabled = true;
        
        // Enable trade buttons for simulator
        if (replayPrefix === 'simulator') {
            document.getElementById('buy-trade').disabled = false;
            document.getElementById('sell-trade').disabled = false;
            // Reset trade simulator
            openPosition = null;
            tradeHistory = [];
            updateTradeSummary();
        }
        
        console.log(`Chart loaded successfully for ${replayPrefix}`);
        
    } catch (error) {
        console.error('Error loading chart:', error.message);
        if (chartContainer) {
            chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '. Please try again later.</p>';
        }
        replayControls.style.display = 'none';
        alert('Failed to load chart: ' + error.message);
    }
}

// Trading functionality for Market Simulator
function placeBuyTrade() {
    const config = getReplayConfig('simulator');
    const chartData = config.chartData();
    
    if (!chartData || config.currentReplayIndex() >= chartData.close.length) {
        alert('No current price data available for trade');
        return;
    }
    
    const currentPrice = chartData.close[config.currentReplayIndex()];
    const timestamp = chartData.timestamp[config.currentReplayIndex()];
    
    if (openPosition) {
        if (openPosition.type === 'long') {
            alert('You already have a long position open');
            return;
        }
        // Close short position
        closePosition(currentPrice, timestamp);
    } else {
        // Open long position
        openPosition = {
            type: 'long',
            entryPrice: currentPrice,
            entryTime: timestamp,
            shares: POSITION_SIZE
        };
        console.log('Opened long position:', openPosition);
    }
    
    updateTradeSummary();
}

function placeSellTrade() {
    const config = getReplayConfig('simulator');
    const chartData = config.chartData();
    
    if (!chartData || config.currentReplayIndex() >= chartData.close.length) {
        alert('No current price data available for trade');
        return;
    }
    
    const currentPrice = chartData.close[config.currentReplayIndex()];
    const timestamp = chartData.timestamp[config.currentReplayIndex()];
    
    if (openPosition) {
        if (openPosition.type === 'short') {
            alert('You already have a short position open');
            return;
        }
        // Close long position
        closePosition(currentPrice, timestamp);
    } else {
        // Open short position
        openPosition = {
            type: 'short',
            entryPrice: currentPrice,
            entryTime: timestamp,
            shares: POSITION_SIZE
        };
        console.log('Opened short position:', openPosition);
    }
    
    updateTradeSummary();
}

function closePosition(currentPrice, timestamp) {
    if (!openPosition) return;
    
    const pnl = openPosition.type === 'long' 
        ? (currentPrice - openPosition.entryPrice) * openPosition.shares
        : (openPosition.entryPrice - currentPrice) * openPosition.shares;
    
    const trade = {
        type: openPosition.type,
        entryPrice: openPosition.entryPrice,
        exitPrice: currentPrice,
        entryTime: openPosition.entryTime,
        exitTime: timestamp,
        shares: openPosition.shares,
        pnl: pnl
    };
    
    tradeHistory.push(trade);
    openPosition = null;
    
    console.log('Closed position:', trade);
    updateTradeHistory();
}

function updateTradeSummary() {
    const positionStatusElement = document.getElementById('position-status');
    const tradePnlElement = document.getElementById('trade-pnl');
    
    if (openPosition) {
        const config = getReplayConfig('simulator');
        const chartData = config.chartData();
        const currentPrice = chartData ? chartData.close[config.currentReplayIndex()] : 0;
        
        const unrealizedPnl = openPosition.type === 'long' 
            ? (currentPrice - openPosition.entryPrice) * openPosition.shares
            : (openPosition.entryPrice - currentPrice) * openPosition.shares;
        
        positionStatusElement.textContent = `${openPosition.type.toUpperCase()} ${openPosition.shares} shares @ $${openPosition.entryPrice.toFixed(2)}`;
        tradePnlElement.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
        tradePnlElement.className = unrealizedPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    } else {
        positionStatusElement.textContent = 'No open position';
        const totalPnl = tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0);
        tradePnlElement.textContent = `Total P/L: $${totalPnl.toFixed(2)}`;
        tradePnlElement.className = totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    }
}

function updateTradeHistory() {
    const tableBody = document.getElementById('trade-history-tbody');
    const table = document.getElementById('trade-history-table');
    const emptyMessage = document.getElementById('trade-history-empty');
    
    if (tradeHistory.length === 0) {
        table.style.display = 'none';
        emptyMessage.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    emptyMessage.style.display = 'none';
    
    tableBody.innerHTML = '';
    tradeHistory.forEach(trade => {
        const row = document.createElement('tr');
        const pnlClass = trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        
        row.innerHTML = `
            <td>${trade.type.toUpperCase()}</td>
            <td>$${trade.entryPrice.toFixed(2)}</td>
            <td>$${trade.exitPrice.toFixed(2)}</td>
            <td>${trade.shares}</td>
            <td>${new Date(trade.exitTime).toLocaleTimeString()}</td>
            <td class="${pnlClass}">$${trade.pnl.toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

function getReplayConfig(section) {
    switch (section) {
        case 'simulator':
            return {
                chartData: () => chartDataSimulator,
                currentReplayIndex: () => currentReplayIndexSimulator,
                setCurrentReplayIndex: (index) => { currentReplayIndexSimulator = index; },
                replayInterval: () => replayIntervalSimulator,
                setReplayInterval: (interval) => { replayIntervalSimulator = interval; },
                isReplaying: () => isReplayingSimulator,
                setIsReplaying: (playing) => { isReplayingSimulator = playing; },
                isPaused: () => isPausedSimulator,
                setIsPaused: (paused) => { isPausedSimulator = paused; },
                aggregatedCandles: () => aggregatedCandlesSimulator,
                setAggregatedCandles: (candles) => { aggregatedCandlesSimulator = candles; },
                timeframe: () => timeframeSimulator,
                setTimeframe: (tf) => { timeframeSimulator = tf; },
                chartContainerId: 'lightweight-chart-simulator',
                playButtonId: 'play-replay-simulator',
                pauseButtonId: 'pause-replay-simulator',
                startOverButtonId: 'start-over-replay-simulator',
                nextButtonId: 'next-candle-simulator',
                prevButtonId: 'prev-candle-simulator',
                speedSelectId: 'replay-speed-simulator',
                timestampDisplayId: 'replay-timestamp-simulator',
            };
        case 'gap':
            return {
                chartData: () => chartDataGap,
                currentReplayIndex: () => currentReplayIndexGap,
                setCurrentReplayIndex: (index) => { currentReplayIndexGap = index; },
                replayInterval: () => replayIntervalGap,
                setReplayInterval: (interval) => { replayIntervalGap = interval; },
                isReplaying: () => isReplayingGap,
                setIsReplaying: (playing) => { isReplayingGap = playing; },
                isPaused: () => isPausedGap,
                setIsPaused: (paused) => { isPausedGap = paused; },
                aggregatedCandles: () => aggregatedCandlesGap,
                setAggregatedCandles: (candles) => { aggregatedCandlesGap = candles; },
                timeframe: () => timeframeGap,
                setTimeframe: (tf) => { timeframeGap = tf; },
                chartContainerId: 'lightweight-chart-gap',
                playButtonId: 'play-replay-gap',
                pauseButtonId: 'pause-replay-gap',
                startOverButtonId: 'start-over-replay-gap',
                nextButtonId: 'next-candle-gap',
                prevButtonId: 'prev-candle-gap',
                speedSelectId: 'replay-speed-gap',
                timestampDisplayId: 'replay-timestamp-gap',
            };
        case 'events':
            return {
                chartData: () => chartDataEvents,
                currentReplayIndex: () => currentReplayIndexEvents,
                setCurrentReplayIndex: (index) => { currentReplayIndexEvents = index; },
                replayInterval: () => replayIntervalEvents,
                setReplayInterval: (interval) => { replayIntervalEvents = interval; },
                isReplaying: () => isReplayingEvents,
                setIsReplaying: (playing) => { isReplayingEvents = playing; },
                isPaused: () => isPausedEvents,
                setIsPaused: (paused) => { isPausedEvents = paused; },
                aggregatedCandles: () => aggregatedCandlesEvents,
                setAggregatedCandles: (candles) => { aggregatedCandlesEvents = candles; },
                timeframe: () => timeframeEvents,
                setTimeframe: (tf) => { timeframeEvents = tf; },
                chartContainerId: 'lightweight-chart-events',
                playButtonId: 'play-replay-events',
                pauseButtonId: 'pause-replay-events',
                startOverButtonId: 'start-over-replay-events',
                nextButtonId: 'next-candle-events',
                prevButtonId: 'prev-candle-events',
                speedSelectId: 'replay-speed-events',
                timestampDisplayId: 'replay-timestamp-events',
            };
        case 'earnings':
            return {
                chartData: () => chartDataEarnings,
                currentReplayIndex: () => currentReplayIndexEarnings,
                setCurrentReplayIndex: (index) => { currentReplayIndexEarnings = index; },
                replayInterval: () => replayIntervalEarnings,
                setReplayInterval: (interval) => { replayIntervalEarnings = interval; },
                isReplaying: () => isReplayingEarnings,
                setIsReplaying: (playing) => { isReplayingEarnings = playing; },
                isPaused: () => isPausedEarnings,
                setIsPaused: (paused) => { isPausedEarnings = paused; },
                aggregatedCandles: () => aggregatedCandlesEarnings,
                setAggregatedCandles: (candles) => { aggregatedCandlesEarnings = candles; },
                timeframe: () => timeframeEarnings,
                setTimeframe: (tf) => { timeframeEarnings = tf; },
                chartContainerId: 'lightweight-chart-earnings',
                playButtonId: 'play-replay-earnings',
                pauseButtonId: 'pause-replay-earnings',
                startOverButtonId: 'start-over-replay-earnings',
                nextButtonId: 'next-candle-earnings',
                prevButtonId: 'prev-candle-earnings',
                speedSelectId: 'replay-speed-earnings',
                timestampDisplayId: 'replay-timestamp-earnings',
            };
        default:
            throw new Error(`Unknown section: ${section}`);
    }
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData) {
        alert('No chart data available for replay');
        return;
    }
    
    if (config.isReplaying()) {
        return; // Already playing
    }
    
    config.setIsReplaying(true);
    config.setIsPaused(false);
    
    // Update button states
    document.getElementById(config.playButtonId).disabled = true;
    document.getElementById(config.pauseButtonId).disabled = false;
    document.getElementById(config.startOverButtonId).disabled = false;
    
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    
    // Show current state
    let minuteIndex = config.currentReplayIndex() % config.timeframe();
    let candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());

    if (candleIndex > 0 || minuteIndex > 0) {
        updateChartData(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = config.currentReplayIndex() > 0 
            ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
            : 'Current Time: --:--:--';
    } else {
        if (!chartInstances[section]) {
            renderChart(section, []);
        }
        timestampDisplay.textContent = 'Current Time: --:--:--';
    }

    // Start replay interval
    const speed = parseInt(document.getElementById(config.speedSelectId).value);
    config.setReplayInterval(setInterval(() => {
        config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
        minuteIndex = config.currentReplayIndex() % config.timeframe();
        candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());

        // Update chart data efficiently
        updateChartData(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[config.currentReplayIndex()].split(' ')[1]}`;

        prevButton.disabled = config.currentReplayIndex() <= 0;
        nextButton.disabled = config.currentReplayIndex() >= chartData.timestamp.length - 1;
        
        // Update trade summary for simulator
        if (section === 'simulator') {
            updateTradeSummary();
        }

        // Check if replay is complete
        if (config.currentReplayIndex() >= chartData.timestamp.length - 1) {
            stopReplay(section);
        }
    }, speed));
}

function pauseReplay(section) {
    const config = getReplayConfig(section);
    
    if (!config.isReplaying()) {
        return; // Not playing
    }
    
    clearInterval(config.replayInterval());
    config.setIsReplaying(false);
    config.setIsPaused(true);
    
    // Update button states
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    
    // Stop current replay
    if (config.isReplaying()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
    }
    
    // Reset state
    config.setCurrentReplayIndex(0);
    config.setIsPaused(false);
    
    // Update button states
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
    document.getElementById(config.prevButtonId).disabled = true;
    document.getElementById(config.nextButtonId).disabled = false;
    
    // Reset chart to show full data
    renderChart(section, config.aggregatedCandles());
    
    // Reset trade simulator
    if (section === 'simulator') {
        openPosition = null;
        tradeHistory = [];
        updateTradeSummary();
    }
    
    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function stopReplay(section) {
    const config = getReplayConfig(section);
    
    if (config.replayInterval()) {
        clearInterval(config.replayInterval());
        config.setReplayInterval(null);
    }
    
    config.setIsReplaying(false);
    config.setIsPaused(false);
    
    // Update button states
    document.getElementById(config.playButtonId).disabled = false;
    document.getElementById(config.pauseButtonId).disabled = true;
    document.getElementById(config.nextButtonId).disabled = true;
    
    // Restore full chart
    renderChart(section, config.aggregatedCandles());
    
    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData || config.currentReplayIndex() <= 0) {
        return;
    }
    
    config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
    updateChartToIndex(section);
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData || config.currentReplayIndex() >= chartData.timestamp.length - 1) {
        return;
    }
    
    config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData) {
        return;
    }
    
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    
    const candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());
    const minuteIndex = config.currentReplayIndex() % config.timeframe();
    
    updateChartData(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
    
    // Update timestamp and button states
    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.timestamp.length - 1;
    
    // Update trade summary for simulator
    if (section === 'simulator') {
        updateTradeSummary();
    }
}

function updateReplaySpeed(section) {
    const config = getReplayConfig(section);
    
    if (config.isReplaying()) {
        // Restart with new speed
        pauseReplay(section);
        startReplay(section);
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDirection = document.getElementById('gap-direction-select').value;
    const gapDatesList = document.getElementById('gap-dates-list');
    
    if (!gapSize || !day || !gapDirection) {
        gapDatesList.innerHTML = '';
        document.getElementById('gap-dates').innerHTML = '<p>Please select gap size, day, and direction.</p>';
        return;
    }
    
    gapDatesList.innerHTML = '<li>Loading gap dates...</li>';
    
    try {
        console.log(`Fetching gap dates for size=${gapSize}, day=${day}, direction=${gapDirection}`);
        const response = await fetch(`/api/gap/dates?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`, {
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
            gapDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            alert(data.error);
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Fetched gap dates:', data);
        
        if (data.error) {
            gapDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            return;
        }
        
        if (!data.dates || data.dates.length === 0) {
            gapDatesList.innerHTML = '<li>No gap dates found for the selected criteria.</li>';
            return;
        }
        
        gapDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#" onclick="setGapDate('${date}')">${date}</a>`;
            gapDatesList.appendChild(li);
        });
        
    } catch (error) {
        console.error('Error loading gap dates:', error.message);
        gapDatesList.innerHTML = '<li style="color: red;">Error loading gap dates. Please try again.</li>';
        alert('Failed to load gap dates: ' + error.message);
    }
}

function setGapDate(date) {
    const dateInput = document.getElementById('date-gap');
    dateInput.value = date;
    console.log(`Set gap date to: ${date}`);
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    
    try {
        console.log('Fetching years from /api/events/years');
        const response = await fetch('/api/events/years', {
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
    const eventDatesList = document.getElementById('event-dates-list');
    
    let eventType, year, bin;
    
    if (filterType === 'year') {
        eventType = document.getElementById('event-type-select').value;
        year = document.getElementById('year-select').value;
        
        if (!eventType || !year) {
            eventDatesList.innerHTML = '';
            document.getElementById('event-dates').innerHTML = '<p>Please select event type and year.</p>';
            return;
        }
    } else {
        eventType = document.getElementById('bin-event-type-select').value;
        bin = document.getElementById('bin-select').value;
        
        if (!eventType || !bin) {
            eventDatesList.innerHTML = '';
            document.getElementById('event-dates').innerHTML = '<p>Please select event type and economic impact range.</p>';
            return;
        }
    }
    
    eventDatesList.innerHTML = '<li>Loading event dates...</li>';
    
    try {
        let url;
        if (filterType === 'year') {
            url = `/api/events/dates?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
        } else {
            url = `/api/events/dates?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
        }
        
        console.log(`Fetching event dates from: ${url}`);
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
            eventDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            alert(data.error);
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Fetched event dates:', data);
        
        if (data.error) {
            eventDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            return;
        }
        
        if (!data.dates || data.dates.length === 0) {
            eventDatesList.innerHTML = '<li>No event dates found for the selected criteria.</li>';
            return;
        }
        
        eventDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#" onclick="setEventDate('${date}')">${date}</a>`;
            eventDatesList.appendChild(li);
        });
        
    } catch (error) {
        console.error('Error loading event dates:', error.message);
        eventDatesList.innerHTML = '<li style="color: red;">Error loading event dates. Please try again.</li>';
        alert('Failed to load event dates: ' + error.message);
    }
}

function setEventDate(date) {
    const dateInput = document.getElementById('date-events');
    dateInput.value = date;
    console.log(`Set event date to: ${date}`);
}

async function loadEarningsDates(event) {
    event.preventDefault();
    
    const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
    const earningsDatesList = document.getElementById('earnings-dates-list');
    
    let ticker, bin;
    
    if (filterType === 'ticker-outcome') {
        ticker = document.getElementById('earnings-ticker-select').value;
        bin = document.getElementById('earnings-bin-select').value;
        
        if (!ticker || !bin) {
            earningsDatesList.innerHTML = '';
            document.getElementById('earnings-dates').innerHTML = '<p>Please select ticker and earnings outcome.</p>';
            return;
        }
    } else {
        ticker = document.getElementById('earnings-ticker-only-select').value;
        
        if (!ticker) {
            earningsDatesList.innerHTML = '';
            document.getElementById('earnings-dates').innerHTML = '<p>Please select ticker.</p>';
            return;
        }
    }
    
    earningsDatesList.innerHTML = '<li>Loading earnings dates...</li>';
    
    try {
        let url;
        if (filterType === 'ticker-outcome') {
            url = `/api/earnings/dates?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`;
        } else {
            url = `/api/earnings/dates?ticker=${encodeURIComponent(ticker)}`;
        }
        
        console.log(`Fetching earnings dates from: ${url}`);
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
            earningsDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            alert(data.error);
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Fetched earnings dates:', data);
        
        if (data.error) {
            earningsDatesList.innerHTML = `<li style="color: red;">${data.error}</li>`;
            return;
        }
        
        if (!data.dates || data.dates.length === 0) {
            earningsDatesList.innerHTML = '<li>No earnings dates found for the selected criteria.</li>';
            return;
        }
        
        earningsDatesList.innerHTML = '';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#" onclick="setEarningsDate('${date}')">${date}</a>`;
            earningsDatesList.appendChild(li);
        });
        
    } catch (error) {
        console.error('Error loading earnings dates:', error.message);
        earningsDatesList.innerHTML = '<li style="color: red;">Error loading earnings dates. Please try again.</li>';
        alert('Failed to load earnings dates: ' + error.message);
    }
}

function setEarningsDate(date) {
    const dateInput = document.getElementById('date-gap');
    dateInput.value = date;
    console.log(`Set earnings date to: ${date}`);
}

async function loadGapInsights(event) {
    event.preventDefault();
    
    const gapSize = document.getElementById('gap-insights-size-select').value;
    const day = document.getElementById('gap-insights-day-select').value;
    const gapDirection = document.getElementById('gap-insights-direction-select').value;
    const resultsDiv = document.getElementById('gap-insights-results');
    
    if (!gapSize || !day || !gapDirection) {
        resultsDiv.innerHTML = '<p>Please select gap size, day, and direction.</p>';
        return;
    }
    
    resultsDiv.innerHTML = '<p>Loading gap insights...</p>';
    
    try {
        console.log(`Fetching gap insights for size=${gapSize}, day=${day}, direction=${gapDirection}`);
        const response = await fetch(`/api/gap/insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`, {
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
            resultsDiv.innerHTML = `<p style="color: red;">${data.error}</p>`;
            alert(data.error);
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Fetched gap insights:', data);
        
        if (data.error) {
            resultsDiv.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }
        
        // Display insights
        let insightsHTML = '<div class="insights-container">';
        insightsHTML += '<h3>Gap Insights</h3>';
        
        if (data.insights) {
            Object.entries(data.insights).forEach(([key, value]) => {
                insightsHTML += `<div class="insight-metric">`;
                insightsHTML += `<div class="metric-name">${key.replace(/_/g, ' ').toUpperCase()}</div>`;
                insightsHTML += `<div class="metric-value">${value}</div>`;
                insightsHTML += `</div>`;
            });
        }
        
        insightsHTML += '</div>';
        resultsDiv.innerHTML = insightsHTML;
        
    } catch (error) {
        console.error('Error loading gap insights:', error.message);
        resultsDiv.innerHTML = '<p style="color: red;">Error loading gap insights. Please try again.</p>';
        alert('Failed to load gap insights: ' + error.message);
    }
}

function openTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    const activeButton = document.querySelector(`button[onclick="openTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

console.log('1MChart script loaded with lightweight-charts V4 integration complete!');