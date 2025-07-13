document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    
    // Check if this page has chart containers (only check library on pages that need charts)
    const hasChartContainers = !!(
        document.getElementById('chart-simulator') ||
        document.getElementById('chart-gap') ||
        document.getElementById('chart-events') ||
        document.getElementById('chart-earnings')
    );
    
    if (hasChartContainers) {
        // Only check for LightweightCharts on pages that have chart containers
        if (typeof LightweightCharts === 'undefined') {
            console.error('LightweightCharts library is not loaded!');
            alert('Chart library failed to load. Please refresh the page.');
            return;
        } else {
            console.log('LightweightCharts library loaded successfully');
            // Check version and available methods
            if (LightweightCharts.version) {
                console.log('LightweightCharts version:', LightweightCharts.version);
            }
            // Test if V4 methods are available
            const testChart = document.createElement('div');
            try {
                const tempChart = LightweightCharts.createChart(testChart, { width: 1, height: 1 });
                if (typeof tempChart.addCandlestickSeries === 'function') {
                    console.log('✅ V4 addCandlestickSeries method available');
                } else {
                    console.error('❌ addCandlestickSeries method not available - wrong version?');
                }
                tempChart.remove();
            } catch (e) {
                console.error('Error testing chart methods:', e);
            }
        }
    } else {
        console.log('No chart containers found on this page - skipping chart library check');
    }
    
    // Load data for pages that need it
    if (typeof loadTickers === 'function') loadTickers();
    if (typeof loadYears === 'function') loadYears();
    if (typeof loadEarningsTickers === 'function') loadEarningsTickers();
    if (typeof loadBinOptions === 'function') loadBinOptions();
    if (typeof populateEarningsOutcomes === 'function') populateEarningsOutcomes();
    
    // Initialize chart-related event listeners only on pages that have chart containers
    if (hasChartContainers) {
        // Initialize stock forms for all tabs
        const formSimulator = document.getElementById('stock-form-simulator');
        const formGap = document.getElementById('stock-form-gap');
        const formEvents = document.getElementById('stock-form-events');
        const formGapForm = document.getElementById('gap-form');
        const formEventsForm = document.getElementById('events-form');
        const formEarningsForm = document.getElementById('earnings-form');
        const formGapInsights = document.getElementById('gap-insights-form');
        
        if (formSimulator) formSimulator.addEventListener('submit', (e) => loadChart(e, 'market-simulator'));
        if (formGap) formGap.addEventListener('submit', (e) => loadChart(e, 'gap-analysis'));
        if (formEvents) formEvents.addEventListener('submit', (e) => loadChart(e, 'events-analysis'));
        if (formGapForm) formGapForm.addEventListener('submit', loadGapDates);
        if (formEventsForm) formEventsForm.addEventListener('submit', loadEventDates);
        if (formEarningsForm) formEarningsForm.addEventListener('submit', loadEarningsDates);
        if (formGapInsights) formGapInsights.addEventListener('submit', loadGapInsights);
        
        // Replay control listeners (Market Simulator)
        const playSimulator = document.getElementById('play-replay-simulator');
        const pauseSimulator = document.getElementById('pause-replay-simulator');
        const startOverSimulator = document.getElementById('start-over-replay-simulator');
        const prevSimulator = document.getElementById('prev-candle-simulator');
        const nextSimulator = document.getElementById('next-candle-simulator');
        const speedSimulator = document.getElementById('replay-speed-simulator');
        const buyTrade = document.getElementById('buy-trade');
        const sellTrade = document.getElementById('sell-trade');
        
        if (playSimulator) playSimulator.addEventListener('click', () => startReplay('simulator'));
        if (pauseSimulator) pauseSimulator.addEventListener('click', () => pauseReplay('simulator'));
        if (startOverSimulator) startOverSimulator.addEventListener('click', () => startOverReplay('simulator'));
        if (prevSimulator) prevSimulator.addEventListener('click', () => prevCandle('simulator'));
        if (nextSimulator) nextSimulator.addEventListener('click', () => nextCandle('simulator'));
        if (speedSimulator) speedSimulator.addEventListener('change', () => updateReplaySpeed('simulator'));
        if (buyTrade) buyTrade.addEventListener('click', placeBuyTrade);
        if (sellTrade) sellTrade.addEventListener('click', placeSellTrade);

        // Replay control listeners for Gap Analysis
        const playGap = document.getElementById('play-replay-gap');
        const pauseGap = document.getElementById('pause-replay-gap');
        const startOverGap = document.getElementById('start-over-replay-gap');
        const prevGap = document.getElementById('prev-candle-gap');
        const nextGap = document.getElementById('next-candle-gap');
        const speedGap = document.getElementById('replay-speed-gap');
        
        if (playGap) playGap.addEventListener('click', () => startReplay('gap'));
        if (pauseGap) pauseGap.addEventListener('click', () => pauseReplay('gap'));
        if (startOverGap) startOverGap.addEventListener('click', () => startOverReplay('gap'));
        if (prevGap) prevGap.addEventListener('click', () => prevCandle('gap'));
        if (nextGap) nextGap.addEventListener('click', () => nextCandle('gap'));
        if (speedGap) speedGap.addEventListener('change', () => updateReplaySpeed('gap'));

        // Replay control listeners for Events Analysis
        const playEvents = document.getElementById('play-replay-events');
        const pauseEvents = document.getElementById('pause-replay-events');
        const startOverEvents = document.getElementById('start-over-replay-events');
        const prevEvents = document.getElementById('prev-candle-events');
        const nextEvents = document.getElementById('next-candle-events');
        const speedEvents = document.getElementById('replay-speed-events');
        
        if (playEvents) playEvents.addEventListener('click', () => startReplay('events'));
        if (pauseEvents) pauseEvents.addEventListener('click', () => pauseReplay('events'));
        if (startOverEvents) startOverEvents.addEventListener('click', () => startOverReplay('events'));
        if (prevEvents) prevEvents.addEventListener('click', () => prevCandle('events'));
        if (nextEvents) nextEvents.addEventListener('click', () => nextCandle('events'));
        if (speedEvents) speedEvents.addEventListener('change', () => updateReplaySpeed('events'));

        // Replay control listeners for Earnings Analysis
        const playEarnings = document.getElementById('play-replay-earnings');
        const pauseEarnings = document.getElementById('pause-replay-earnings');
        const startOverEarnings = document.getElementById('start-over-replay-earnings');
        const prevEarnings = document.getElementById('prev-candle-earnings');
        const nextEarnings = document.getElementById('next-candle-earnings');
        const speedEarnings = document.getElementById('replay-speed-earnings');
        
        if (playEarnings) playEarnings.addEventListener('click', () => startReplay('earnings'));
        if (pauseEarnings) pauseEarnings.addEventListener('click', () => pauseReplay('earnings'));
        if (startOverEarnings) startOverEarnings.addEventListener('click', () => startOverReplay('earnings'));
        if (prevEarnings) prevEarnings.addEventListener('click', () => prevCandle('earnings'));
        if (nextEarnings) nextEarnings.addEventListener('click', () => nextCandle('earnings'));
        if (speedEarnings) speedEarnings.addEventListener('change', () => updateReplaySpeed('earnings'));

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
        const tickerSimulator = document.getElementById('ticker-select-simulator');
        const tickerGap = document.getElementById('ticker-select-gap');
        const tickerEvents = document.getElementById('ticker-select-events');
        
        if (tickerSimulator) tickerSimulator.addEventListener('change', () => loadDates('ticker-select-simulator', 'date-simulator'));
        if (tickerGap) tickerGap.addEventListener('change', () => loadDates('ticker-select-gap', 'date-gap'));
        if (tickerEvents) tickerEvents.addEventListener('change', () => loadDates('ticker-select-events', 'date-events'));
    }
});

// Chart instances for TradingView lightweight-charts
let chartInstances = {
    simulator: null,
    gap: null,
    events: null,
    earnings: null
};

// Technical Indicators Storage
let indicatorSeries = {
    simulator: {},
    gap: {},
    events: {},
    earnings: {}
};



// Drawing Tools State
let drawingTools = {
    simulator: { active: null, lines: [], pendingTool: null },
    gap: { active: null, lines: [], pendingTool: null },
    events: { active: null, lines: [], pendingTool: null },
    earnings: { active: null, lines: [], pendingTool: null }
};

// User zoom tracking - to prevent auto-fit during manual zoom
let userZoomState = {
    simulator: false,
    gap: false,
    events: false,
    earnings: false
};

// Chart click handlers for drawing tools
let chartClickHandlers = {
    simulator: null,
    gap: null,
    events: null,
    earnings: null
};

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

function createChart(containerId, chartData, timeframe) {
    console.log(`Creating chart for container: ${containerId}`);
    
    // Check if LightweightCharts is available
    if (typeof LightweightCharts === 'undefined') {
        console.error('LightweightCharts library is not loaded');
        return null;
    }
    
    // Ensure V4 compatibility constants are available
    if (!LightweightCharts.LineStyle) {
        LightweightCharts.LineStyle = { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 };
    }
    if (!LightweightCharts.CrosshairMode) {
        LightweightCharts.CrosshairMode = { Normal: 0, Magnet: 1 };
    }
    if (!LightweightCharts.PriceLineSource) {
        LightweightCharts.PriceLineSource = { LastBar: 0, LastVisible: 1 };
    }
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return null;
    }

    console.log(`Container found: ${containerId}, dimensions: ${container.clientWidth}x${container.clientHeight}`);

    // Clear previous chart
    container.innerHTML = '';

    // Ensure minimum dimensions
    const width = Math.max(container.clientWidth, 600);
    const height = Math.max(container.clientHeight, 400);

    // Create chart title
    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = `${chartData.ticker} ${timeframe}-Minute Chart - ${chartData.date}`;
    container.appendChild(title);

    // Create auto-zoom button
    const autoZoomBtn = document.createElement('button');
    autoZoomBtn.className = 'auto-zoom-btn';
    autoZoomBtn.textContent = '🔍 Auto Fit';
    autoZoomBtn.setAttribute('data-section', containerId.replace('chart-', ''));
    container.appendChild(autoZoomBtn);

    // Create debug spacing button for testing
    const debugSpacingBtn = document.createElement('button');
    debugSpacingBtn.className = 'debug-spacing-btn';
    debugSpacingBtn.textContent = '🔧 Fix Spacing';
    debugSpacingBtn.style.cssText = 'position: absolute; top: 10px; left: 120px; z-index: 1000; background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;';
    debugSpacingBtn.setAttribute('data-section', containerId.replace('chart-', ''));
    container.appendChild(debugSpacingBtn);

    try {
        // Create chart with V4 API
        const chart = LightweightCharts.createChart(container, {
        width: width,
        height: height,
        layout: {
            backgroundColor: '#ffffff',
            textColor: '#333333',
            fontSize: 12,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        },
        grid: {
            vertLines: {
                color: '#e0e0e0',
                style: LightweightCharts.LineStyle.Solid,
                visible: true
            },
            horzLines: {
                color: '#e0e0e0',
                style: LightweightCharts.LineStyle.Solid,
                visible: true
            }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#1a1b2f',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                visible: true,
                labelVisible: true
            },
            horzLine: {
                color: '#1a1b2f',
                width: 1,
                style: LightweightCharts.LineStyle.Dashed,
                visible: true,
                labelVisible: true
            }
        },
        priceScale: {
            borderColor: '#cccccc',
            borderVisible: true,
            position: 'right',
            scaleMargins: {
                top: 0.1,
                bottom: 0.25
            }
        },
        timeScale: {
            borderColor: '#cccccc',
            borderVisible: true,
            timeVisible: true,
            secondsVisible: false,
            barSpacing: 8,  // Fixed bar spacing to prevent thinning
            fixLeftEdge: false,
            fixRightEdge: false,
            lockVisibleTimeRangeOnResize: true,
            rightBarStaysOnScroll: true,
            tickMarkFormatter: (time) => {
                const date = new Date(time * 1000);
                return date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: false 
                });
            }
        },
        rightPriceScale: {
            visible: true,
            borderColor: '#cccccc',
            autoScale: true,
            scaleMargins: {
                top: 0.1,
                bottom: 0.25
            }
        },
        leftPriceScale: {
            visible: false
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true
        },
        handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true
        }
    });

    // Create candlestick series with V4 API
    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00cc00',
        downColor: '#ff0000',
        borderDownColor: '#ff0000',
        borderUpColor: '#00cc00',
        wickDownColor: '#ff0000',
        wickUpColor: '#00cc00',
        borderVisible: true,
        wickVisible: true,
        priceLineVisible: true,
        priceLineSource: LightweightCharts.PriceLineSource.LastBar,
        priceLineWidth: 1,
        priceLineColor: '#1a1b2f',
        priceLineStyle: LightweightCharts.LineStyle.Dotted,
        baseLineVisible: false,
        priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01
        }
    });

    // Create volume series with V4 API
    const volumeSeries = chart.addHistogramSeries({
        color: '#888888',
        priceFormat: {
            type: 'volume'
        },
        priceScaleId: 'volume',
        scaleMargins: {
            top: 0.75,
            bottom: 0
        }
    });
    
    // Configure volume price scale
    chart.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.75,
            bottom: 0,
        },
    });

        // Handle window resize
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== container) return;
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
        });
        resizeObserver.observe(container);

        console.log('Chart created successfully');
        return {
            chart,
            candlestickSeries,
            volumeSeries,
            resizeObserver
        };
    } catch (error) {
        console.error('Error creating chart:', error);
        container.innerHTML = `<p style="color: red;">Error creating chart: ${error.message}</p>`;
        return null;
    }
}

function renderChart(section, candles, currentCandleIndex = -1, minuteIndex = null) {
    console.log(`Rendering chart for section: ${section}, candles length: ${candles.length}`);
    
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    
    if (!chartData) {
        console.error(`No chart data for section: ${section}`);
        return;
    }

    const containerId = config.chartContainerId;
    console.log(`Chart container ID: ${containerId}`);
    
    // Create chart if it doesn't exist
    if (!chartInstances[section]) {
        console.log(`Creating new chart instance for section: ${section}`);
        chartInstances[section] = createChart(containerId, chartData, config.timeframe());
        
        // Set up zoom tracking for this chart
        if (chartInstances[section]) {
            setupChartZoomTracking(section);
            
            // Set up auto-zoom button functionality
            const autoZoomBtn = document.querySelector(`#${containerId} .auto-zoom-btn`);
            if (autoZoomBtn) {
                autoZoomBtn.onclick = () => {
                    if (chartInstances[section] && chartInstances[section].chart) {
                        const chart = chartInstances[section].chart;
                        
                        // Reset both time scale (X-axis) and price scale (Y-axis)
                        console.log(`Auto-fit triggered for ${section} - resetting both axes`);
                        
                        // Reset time scale (horizontal/width)
                        chart.timeScale().fitContent();
                         
                         // Reset price scale (vertical/height) - multiple approaches to ensure it works
                         setTimeout(() => {
                             try {
                                 const priceScale = chart.priceScale('right');
                                 if (priceScale) {
                                     // Method 1: Reset to auto-scale with default margins
                                     priceScale.applyOptions({
                                         autoScale: true,
                                         scaleMargins: {
                                             top: 0.1,
                                             bottom: 0.25
                                         }
                                     });
                                     
                                     // Method 2: Try to fit content if method exists
                                     if (typeof priceScale.fitContent === 'function') {
                                         priceScale.fitContent();
                                     }
                                 }
                                 
                                 // Also reset left price scale if it exists
                                 const leftPriceScale = chart.priceScale('left');
                                 if (leftPriceScale) {
                                     leftPriceScale.applyOptions({
                                         autoScale: true
                                     });
                                     if (typeof leftPriceScale.fitContent === 'function') {
                                         leftPriceScale.fitContent();
                                     }
                                 }
                                 
                                 // Method 3: Force a refresh by re-fitting the time scale which might trigger price scale reset
                                 setTimeout(() => {
                                     chart.timeScale().fitContent();
                                 }, 25);
                                 
                                 console.log('Price scale reset completed');
                             } catch (error) {
                                 console.warn('Error resetting price scale:', error);
                             }
                         }, 50);
                        
                        // Reset zoom state to allow auto-fit during replay
                        userZoomState[section] = false;
                        console.log(`Auto-fit completed for ${section} - both X and Y axes reset`);
                    }
                };
            }

            // Set up debug spacing button functionality
            const debugSpacingBtn = document.querySelector(`#${containerId} .debug-spacing-btn`);
            if (debugSpacingBtn) {
                debugSpacingBtn.onclick = () => {
                    console.log(`Manual spacing fix triggered for ${section}`);
                    manualSpacingFix(section);
                };
            }
            
            // Set up any pending drawing tools
            if (drawingTools[section].pendingTool) {
                const pendingTool = drawingTools[section].pendingTool;
                drawingTools[section].pendingTool = null;
                setupDrawingClickHandler(section, pendingTool);
                console.log(`Set up pending drawing tool: ${pendingTool} for ${section}`);
            }
        }
    }

    if (!chartInstances[section]) {
        console.error(`Failed to create chart instance for section: ${section}`);
        return;
    }

    const { candlestickSeries, volumeSeries } = chartInstances[section];

    // Prepare data for lightweight-charts V4
    const candlestickData = candles.length > 0 ? candles.map((candle, i) => {
        let ohlc = {
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close)
        };

        // Apply minute-level updates for current candle during replay
        if (i === currentCandleIndex && minuteIndex !== null && candle.minuteUpdates[minuteIndex]) {
            const update = candle.minuteUpdates[minuteIndex];
            ohlc.high = parseFloat(update.high);
            ohlc.low = parseFloat(update.low);
            ohlc.close = parseFloat(update.close);
        }

        return ohlc;
    }) : [];

    const volumeData = candles.length > 0 ? candles.map((candle, i) => {
        let volume = candle.volume;
        
        // Apply minute-level updates for current candle during replay
        if (i === currentCandleIndex && minuteIndex !== null && candle.minuteUpdates[minuteIndex]) {
            volume = candle.minuteUpdates[minuteIndex].volume;
        }

        return {
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            value: parseFloat(volume),
            color: candle.close >= candle.open ? '#00cc0040' : '#ff000040'
        };
    }) : [];

    try {
        // Update chart data
        console.log(`Setting candlestick data with ${candlestickData.length} points`);
        candlestickSeries.setData(candlestickData);
        console.log(`Setting volume data with ${volumeData.length} points`);
        volumeSeries.setData(volumeData);

        // Update indicators in real-time for replay (except Bollinger Bands which have issues)
        updateIndicatorsForReplay(section, candlestickData, volumeData);

        // Only auto-fit if user hasn't manually zoomed
        if (!userZoomState[section]) {
            chartInstances[section].chart.timeScale().fitContent();
        }
        
        // Fix chart layout to ensure consistent spacing after rendering
        // Only fix layout if user hasn't manually zoomed to avoid interfering with user zoom
        if (!userZoomState[section]) {
            fixChartLayout(section);
        }
        
        console.log('Chart data updated successfully');
    } catch (error) {
        console.error('Error updating chart data:', error);
    }
}

function destroyChart(section) {
    if (chartInstances[section]) {
        const { chart, resizeObserver } = chartInstances[section];
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        if (chart) {
            chart.remove();
        }
        chartInstances[section] = null;
    }
    // Clear indicators for this section
    indicatorSeries[section] = {};
    drawingTools[section] = { active: null, lines: [], pendingTool: null };
    // Reset user zoom state
    userZoomState[section] = false;
    // Clear click handlers
    chartClickHandlers[section] = null;
}

// Setup chart zoom tracking to detect user interactions
function setupChartZoomTracking(section) {
    if (!chartInstances[section]) return;
    
    const chart = chartInstances[section].chart;
    let userInteracted = false;
    
    // Track user zoom/pan interactions
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        if (userInteracted) {
            userZoomState[section] = true;
            console.log(`User zoom detected for ${section}`);
        }
    });
    
    // Track mouse/touch interactions
    const chartContainer = document.getElementById(getReplayConfig(section).chartContainerId);
    if (chartContainer) {
        ['wheel', 'mousedown', 'touchstart'].forEach(eventType => {
            chartContainer.addEventListener(eventType, () => {
                userInteracted = true;
                setTimeout(() => { userInteracted = false; }, 100);
            });
        });
    }
}



// Clear indicators when replay starts so they build up naturally
function clearIndicatorsForReplay(section) {
    const chart = chartInstances[section]?.chart;
    if (!chart) return;
    
    console.log(`Clearing indicators for ${section} before replay starts`);
    
    // Get all active indicators except Bollinger Bands (they're disabled during replay anyway)
    Object.keys(indicatorSeries[section]).forEach(indicatorKey => {
        if (indicatorKey.includes('bollinger') || indicatorKey.includes('_upper') || indicatorKey.includes('_middle') || indicatorKey.includes('_lower')) {
            // Skip Bollinger Bands - they're disabled during replay
            return;
        }
        
        if (indicatorSeries[section][indicatorKey]) {
            try {
                // Clear the data but keep the series for real-time updates
                indicatorSeries[section][indicatorKey].setData([]);
                console.log(`Cleared data for indicator: ${indicatorKey}`);
            } catch (error) {
                console.warn(`Error clearing indicator ${indicatorKey}:`, error);
            }
        }
    });
    
    console.log(`Cleared indicators for ${section} - they will build up during replay`);
}

// Manual spacing fix for debugging - tries different approaches
function manualSpacingFix(section) {
    console.log(`Starting manual spacing fix for ${section}`);
    
    const chart = chartInstances[section]?.chart;
    if (!chart) {
        console.log('No chart instance found');
        return;
    }
    
    const config = getReplayConfig(section);
    const aggregatedCandles = config.aggregatedCandles();
    
    if (!aggregatedCandles || aggregatedCandles.length === 0) {
        console.log('No aggregated candles found');
        return;
    }
    
    console.log(`Found ${aggregatedCandles.length} candles`);
    
    // Try the exact same approach as renderChart function uses during replay
    try {
        const { candlestickSeries, volumeSeries } = chartInstances[section];
        
        // Store current zoom state
        const timeScale = chart.timeScale();
        const visibleRange = userZoomState[section] ? timeScale.getVisibleRange() : null;
        
        console.log('Preparing candlestick data...');
        
        // Use EXACTLY the same data preparation as renderChart
        const candlestickData = aggregatedCandles.map((candle, i) => {
            return {
                time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
                open: parseFloat(candle.open),
                high: parseFloat(candle.high),
                low: parseFloat(candle.low),
                close: parseFloat(candle.close)
            };
        });

        const volumeData = aggregatedCandles.map((candle, i) => {
            return {
                time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
                value: parseFloat(candle.volume),
                color: candle.close >= candle.open ? '#00cc0040' : '#ff000040'
            };
        });
        
        console.log(`Setting candlestick data with ${candlestickData.length} points`);
        candlestickSeries.setData(candlestickData);
        console.log(`Setting volume data with ${volumeData.length} points`);
        volumeSeries.setData(volumeData);
        
        // *** KEY INSIGHT: Follow the EXACT sequence that renderChart uses during replay ***
        console.log('Following renderChart sequence...');
        
        // 1. Update ALL indicators like replay does (this might be the magic!)
        updateIndicatorsForReplay(section, candlestickData, volumeData);
        
        // 2. Only auto-fit if user hasn't manually zoomed (like renderChart)
        if (!userZoomState[section]) {
            console.log('Auto-fitting content');
            timeScale.fitContent();
        }
        
        // 3. Fix chart layout like renderChart does (only if user hasn't zoomed)
        if (!userZoomState[section]) {
            console.log('Applying layout fix');
            fixChartLayout(section);
        }
        
        // 4. Restore user zoom if they had manually zoomed
        if (visibleRange && userZoomState[section]) {
            console.log('Restoring user zoom');
            timeScale.setVisibleRange(visibleRange);
        }
        
        console.log('Manual spacing fix completed successfully');
        
    } catch (error) {
        console.error('Error in manual spacing fix:', error);
    }
}

// Refresh chart data to maintain proper spacing (like replay mechanism does)
function refreshChartDataForSpacing(section) {
    const chart = chartInstances[section]?.chart;
    if (!chart) return;
    
    try {
        const config = getReplayConfig(section);
        const isReplayActive = config && (config.replayIndex !== null && config.replayIndex >= 0 && config.replayIndex < config.totalCandles);
        
        // Don't refresh during active replay - replay handles this itself
        if (isReplayActive) {
            console.log(`Skipping data refresh during active replay for ${section}`);
            return;
        }
        
        // Get current chart data
        const chartData = config.chartData();
        if (!chartData) {
            console.log(`No chart data available for ${section}`);
            return;
        }
        
        // Get all aggregated candles (complete chart)
        const aggregatedCandles = config.aggregatedCandles();
        if (!aggregatedCandles || aggregatedCandles.length === 0) {
            console.log(`No aggregated candles for ${section}`);
            return;
        }
        
        const { candlestickSeries, volumeSeries } = chartInstances[section];
        
        // Prepare fresh data for lightweight-charts (same as replay mechanism)
        const candlestickData = aggregatedCandles.map(candle => ({
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close)
        }));
        
        const volumeData = aggregatedCandles.map(candle => ({
            time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
            value: parseFloat(candle.volume),
            color: candle.close >= candle.open ? '#00cc0040' : '#ff000040'
        }));
        
        // Get current visible range to preserve user zoom
        const timeScale = chart.timeScale();
        const visibleRange = userZoomState[section] ? timeScale.getVisibleRange() : null;
        
        // Re-set the data (this is what replay does that maintains spacing)
        candlestickSeries.setData(candlestickData);
        volumeSeries.setData(volumeData);
        
        // *** Follow the EXACT renderChart sequence ***
        // 1. Update ALL indicators like replay does (this might maintain spacing!)
        updateIndicatorsForReplay(section, candlestickData, volumeData);
        
        // 2. Auto-fit only if user hasn't manually zoomed
        if (!userZoomState[section]) {
            timeScale.fitContent();
        }
        
        // 3. Fix chart layout like renderChart does (only if user hasn't zoomed)
        if (!userZoomState[section]) {
            fixChartLayout(section);
        }
        
        // 4. Restore user zoom if they had manually zoomed
        if (visibleRange && userZoomState[section]) {
            timeScale.setVisibleRange(visibleRange);
        }
        
        console.log(`Refreshed chart data for ${section} to maintain spacing (user zoom: ${userZoomState[section]})`);
    } catch (error) {
        console.warn(`Error refreshing chart data for ${section}:`, error);
    }
}

// Fix chart layout to maintain consistent candle spacing/width
function fixChartLayout(section) {
    const chart = chartInstances[section]?.chart;
    if (!chart) return;
    
    try {
        // Force the chart to maintain consistent bar spacing and layout
        const timeScale = chart.timeScale();
        
        // Get current visible range only if user hasn't manually zoomed
        const visibleRange = !userZoomState[section] ? timeScale.getVisibleRange() : null;
        
        // Apply fixed bar spacing to prevent thinning
        chart.applyOptions({
            timeScale: {
                barSpacing: 8,  // Consistent spacing
                fixLeftEdge: false,
                fixRightEdge: false,
                lockVisibleTimeRangeOnResize: true,
                rightBarStaysOnScroll: true
            }
        });
        
        // Restore the visible range only if user hasn't manually zoomed
        if (visibleRange && !userZoomState[section]) {
            timeScale.setVisibleRange(visibleRange);
        }
        
        console.log(`Fixed chart layout for ${section} (user zoom state: ${userZoomState[section]})`);
    } catch (error) {
        console.warn(`Error fixing chart layout for ${section}:`, error);
    }
}

// Update indicators in real-time during replay (except Bollinger Bands which have issues)
function updateIndicatorsForReplay(section, candlestickData, volumeData) {
    if (!chartInstances[section] || !candlestickData.length) {
        console.log(`No chart instance or data for ${section}, skipping indicator update`);
        return;
    }
    
    console.log(`Updating indicators for ${section} with ${candlestickData.length} candles`);
    
    // Get currently active indicators
    const activeIndicators = Object.keys(indicatorSeries[section]);
    console.log(`Active indicators for ${section}:`, activeIndicators);
    
    if (activeIndicators.length === 0) {
        console.log(`No active indicators for ${section}`);
        return;
    }
    
    activeIndicators.forEach(indicatorKey => {
        // Skip Bollinger Bands during replay - they cause issues
        if (indicatorKey.includes('bollinger') || indicatorKey.includes('_upper') || indicatorKey.includes('_middle') || indicatorKey.includes('_lower')) {
            console.log(`Skipping Bollinger Bands during replay: ${indicatorKey}`);
            return;
        }
        
        const parts = indicatorKey.split('_');
        const indicator = parts[0];
        const period = parts[1] ? parseInt(parts[1]) : null;
        
        // Calculate indicator with current replay data
        let indicatorData = null;
        
        try {
            switch (indicator) {
                case 'sma':
                    if (candlestickData.length >= period) {
                        indicatorData = calculateSMA(candlestickData, period);
                        console.log(`Calculated SMA ${period} with ${indicatorData.length} points`);
                    }
                    break;
                case 'ema':
                    if (candlestickData.length >= period) {
                        indicatorData = calculateEMA(candlestickData, period);
                        console.log(`Calculated EMA ${period} with ${indicatorData.length} points`);
                    }
                    break;
                case 'vwap':
                    indicatorData = calculateVWAP(candlestickData, volumeData);
                    console.log(`Calculated VWAP with ${indicatorData.length} points`);
                    break;
                case 'rsi':
                    if (candlestickData.length >= 14) {
                        const rsiData = calculateRSI(candlestickData, 14);
                        if (candlestickData.length > 0) {
                            const priceRange = Math.max(...candlestickData.map(d => d.high)) - Math.min(...candlestickData.map(d => d.low));
                            const minPrice = Math.min(...candlestickData.map(d => d.low));
                            indicatorData = rsiData.map(d => ({
                                time: d.time,
                                value: minPrice + (d.value / 100) * priceRange * 0.3
                            }));
                        }
                        console.log(`Calculated RSI with ${indicatorData?.length || 0} points`);
                    }
                    break;
                case 'macd':
                    if (candlestickData.length >= 26) {
                        const macdData = calculateMACD(candlestickData, 12, 26, 9);
                        if (macdData.macdLine.length > 0) {
                            const macdRange = Math.max(...macdData.macdLine.map(d => d.value)) - Math.min(...macdData.macdLine.map(d => d.value));
                            const macdMinPrice = Math.min(...candlestickData.map(d => d.low));
                            const macdPriceRange = Math.max(...candlestickData.map(d => d.high)) - macdMinPrice;
                            indicatorData = macdData.macdLine.map(d => ({
                                time: d.time,
                                value: macdMinPrice + (d.value / (macdRange || 1)) * macdPriceRange * 0.2
                            }));
                        }
                        console.log(`Calculated MACD with ${indicatorData?.length || 0} points`);
                    }
                    break;
                case 'stochastic':
                    if (candlestickData.length >= 14) {
                        const stochData = calculateStochastic(candlestickData, 14, 3);
                        if (stochData.stochK.length > 0) {
                            const stochMinPrice = Math.min(...candlestickData.map(d => d.low));
                            const stochPriceRange = Math.max(...candlestickData.map(d => d.high)) - stochMinPrice;
                            indicatorData = stochData.stochK.map(d => ({
                                time: d.time,
                                value: stochMinPrice + (d.value / 100) * stochPriceRange * 0.25
                            }));
                        }
                        console.log(`Calculated Stochastic with ${indicatorData?.length || 0} points`);
                    }
                    break;
            }
            
            if (indicatorData && indicatorData.length > 0 && indicatorSeries[section][indicatorKey]) {
                indicatorSeries[section][indicatorKey].setData(indicatorData);
                console.log(`Updated ${indicatorKey} indicator with ${indicatorData.length} points`);
            } else if (indicatorData && indicatorData.length === 0) {
                console.log(`No data points for ${indicatorKey} - not enough historical data`);
            }
        } catch (error) {
            console.error(`Error updating indicator ${indicatorKey}:`, error);
        }
    });
}



// Technical Indicator Calculation Functions
function calculateSMA(data, period) {
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({
            time: data[i].time,
            value: sum / period
        });
    }
    return sma;
}

function calculateEMA(data, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    ema.push({
        time: data[period - 1].time,
        value: sum / period
    });
    
    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
        const emaValue = (data[i].close - ema[ema.length - 1].value) * multiplier + ema[ema.length - 1].value;
        ema.push({
            time: data[i].time,
            value: emaValue
        });
    }
    return ema;
}

function calculateVWAP(candleData, volumeData) {
    const vwap = [];
    let cumulativeTPV = 0; // Typical Price * Volume
    let cumulativeVolume = 0;
    
    for (let i = 0; i < candleData.length; i++) {
        const typicalPrice = (candleData[i].high + candleData[i].low + candleData[i].close) / 3;
        const volume = volumeData[i].value;
        
        cumulativeTPV += typicalPrice * volume;
        cumulativeVolume += volume;
        
        vwap.push({
            time: candleData[i].time,
            value: cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : candleData[i].close
        });
    }
    return vwap;
}

function calculateRSI(data, period = 14) {
    const rsi = [];
    const gains = [];
    const losses = [];
    
    // Calculate price changes
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }
    
    // Calculate initial average gain and loss
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < data.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
        
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        
        rsi.push({
            time: data[i].time,
            value: rsiValue
        });
    }
    return rsi;
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    
    const macdLine = [];
    const startIndex = slowPeriod - fastPeriod;
    
    for (let i = startIndex; i < fastEMA.length; i++) {
        macdLine.push({
            time: fastEMA[i].time,
            value: fastEMA[i].value - slowEMA[i - startIndex].value
        });
    }
    
    const signalLine = calculateEMA(macdLine, signalPeriod);
    const histogram = [];
    
    for (let i = 0; i < signalLine.length; i++) {
        const macdIndex = i + signalPeriod - 1;
        if (macdIndex < macdLine.length) {
            histogram.push({
                time: signalLine[i].time,
                value: macdLine[macdIndex].value - signalLine[i].value
            });
        }
    }
    
    return { macdLine, signalLine, histogram };
}

function calculateBollingerBands(data, period = 20, stdDev = 2) {
    const sma = calculateSMA(data, period);
    const bands = { upper: [], middle: [], lower: [] };
    
    for (let i = 0; i < sma.length; i++) {
        const dataIndex = i + period - 1;
        let sum = 0;
        
        // Calculate standard deviation
        for (let j = 0; j < period; j++) {
            sum += Math.pow(data[dataIndex - j].close - sma[i].value, 2);
        }
        const stdDeviation = Math.sqrt(sum / period);
        
        bands.upper.push({
            time: sma[i].time,
            value: sma[i].value + (stdDev * stdDeviation)
        });
        
        bands.middle.push(sma[i]);
        
        bands.lower.push({
            time: sma[i].time,
            value: sma[i].value - (stdDev * stdDeviation)
        });
    }
    
    return bands;
}

function calculateStochastic(data, kPeriod = 14, dPeriod = 3) {
    const stochK = [];
    const stochD = [];
    
    for (let i = kPeriod - 1; i < data.length; i++) {
        let highest = data[i].high;
        let lowest = data[i].low;
        
        for (let j = 1; j < kPeriod; j++) {
            highest = Math.max(highest, data[i - j].high);
            lowest = Math.min(lowest, data[i - j].low);
        }
        
        const kValue = highest === lowest ? 50 : ((data[i].close - lowest) / (highest - lowest)) * 100;
        stochK.push({
            time: data[i].time,
            value: kValue
        });
    }
    
    // Calculate %D (SMA of %K)
    for (let i = dPeriod - 1; i < stochK.length; i++) {
        let sum = 0;
        for (let j = 0; j < dPeriod; j++) {
            sum += stochK[i - j].value;
        }
        stochD.push({
            time: stochK[i].time,
            value: sum / dPeriod
        });
    }
    
    return { stochK, stochD };
}

// Add Indicator to Chart
function addIndicatorToChart(section, indicator, period, candleData, volumeData) {
    const chart = chartInstances[section]?.chart;
    if (!chart || !candleData.length) return;

    const indicatorKey = `${indicator}_${period || ''}`;
    
    // Remove existing indicator of same type
    if (indicatorSeries[section][indicatorKey]) {
        chart.removeSeries(indicatorSeries[section][indicatorKey]);
        delete indicatorSeries[section][indicatorKey];
    }

    let indicatorData = null;
    let seriesOptions = {};
    
    // Calculate price range for scaling oscillators
    const priceRange = Math.max(...candleData.map(d => d.high)) - Math.min(...candleData.map(d => d.low));
    const minPrice = Math.min(...candleData.map(d => d.low));
    
    switch (indicator) {
        case 'sma':
            indicatorData = calculateSMA(candleData, period);
            let smaColor = '#2196f3'; // Default blue
            if (period === 9) smaColor = '#9c27b0'; // Purple for SMA 9
            else if (period === 20) smaColor = '#ff9800'; // Orange for SMA 20
            else if (period === 50) smaColor = '#2196f3'; // Blue for SMA 50
            
            seriesOptions = {
                color: smaColor,
                lineWidth: 2,
                title: `SMA ${period}`
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            break;
            
        case 'ema':
            indicatorData = calculateEMA(candleData, period);
            seriesOptions = {
                color: period === 20 ? '#e91e63' : '#9c27b0',
                lineWidth: 2,
                title: `EMA ${period}`
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            break;
            
        case 'vwap':
            indicatorData = calculateVWAP(candleData, volumeData);
            seriesOptions = {
                color: '#4caf50',
                lineWidth: 3,
                title: 'VWAP'
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            break;
            
        case 'bollinger':
            // Skip Bollinger Bands if replay is active (they cause display issues during replay)
            const config = getReplayConfig(section);
            const isReplayActive = config && (config.replayIndex !== null && config.replayIndex >= 0 && config.replayIndex < config.totalCandles);
            
            if (isReplayActive) {
                console.log(`Skipping Bollinger Bands during active replay for ${section}`);
                return;
            }
            
            const bbData = calculateBollingerBands(candleData, 20, 2);
            // Add upper band
            indicatorSeries[section][`${indicatorKey}_upper`] = chart.addLineSeries({
                color: '#9e9e9e',
                lineWidth: 1,
                title: 'BB Upper'
            });
            indicatorSeries[section][`${indicatorKey}_upper`].setData(bbData.upper);
            
            // Add middle band (SMA)
            indicatorSeries[section][`${indicatorKey}_middle`] = chart.addLineSeries({
                color: '#607d8b',
                lineWidth: 2,
                title: 'BB Middle'
            });
            indicatorSeries[section][`${indicatorKey}_middle`].setData(bbData.middle);
            
            // Add lower band
            indicatorSeries[section][`${indicatorKey}_lower`] = chart.addLineSeries({
                color: '#9e9e9e',
                lineWidth: 1,
                title: 'BB Lower'
            });
            indicatorSeries[section][`${indicatorKey}_lower`].setData(bbData.lower);
            return; // Don't set data again below
            
        case 'rsi':
            indicatorData = calculateRSI(candleData, 14);
            // Note: RSI should ideally be in a separate pane, but for simplicity, scaling to price range
            indicatorData = indicatorData.map(d => ({
                time: d.time,
                value: minPrice + (d.value / 100) * priceRange * 0.3 // Scale RSI to 30% of price range
            }));
            seriesOptions = {
                color: '#f44336',
                lineWidth: 2,
                title: 'RSI (scaled)'
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            break;
            
        case 'macd':
            const macdData = calculateMACD(candleData, 12, 26, 9);
            // Scale MACD to price range for visibility
            const macdRange = Math.max(...macdData.macdLine.map(d => d.value)) - Math.min(...macdData.macdLine.map(d => d.value));
            const scaledMacd = macdData.macdLine.map(d => ({
                time: d.time,
                value: minPrice + (d.value / macdRange) * priceRange * 0.2
            }));
            
            seriesOptions = {
                color: '#ff5722',
                lineWidth: 2,
                title: 'MACD (scaled)'
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            indicatorData = scaledMacd;
            break;
            
        case 'stochastic':
            const stochData = calculateStochastic(candleData, 14, 3);
            // Scale Stochastic to price range
            const scaledStochK = stochData.stochK.map(d => ({
                time: d.time,
                value: minPrice + (d.value / 100) * priceRange * 0.25
            }));
            
            seriesOptions = {
                color: '#673ab7',
                lineWidth: 2,
                title: 'Stochastic %K (scaled)'
            };
            indicatorSeries[section][indicatorKey] = chart.addLineSeries(seriesOptions);
            indicatorData = scaledStochK;
            break;
    }
    
    if (indicatorData && indicatorSeries[section][indicatorKey]) {
        indicatorSeries[section][indicatorKey].setData(indicatorData);
        
        // Refresh chart data to maintain proper spacing (like replay mechanism does)
        refreshChartDataForSpacing(section);
    }
}

// Remove Indicator from Chart
function removeIndicatorFromChart(section, indicator, period) {
    const chart = chartInstances[section]?.chart;
    if (!chart) return;

    const indicatorKey = `${indicator}_${period || ''}`;
    
    if (indicator === 'bollinger') {
        // Remove all Bollinger Band components
        ['upper', 'middle', 'lower'].forEach(component => {
            const key = `${indicatorKey}_${component}`;
            if (indicatorSeries[section][key]) {
                chart.removeSeries(indicatorSeries[section][key]);
                delete indicatorSeries[section][key];
            }
        });
    } else if (indicatorSeries[section][indicatorKey]) {
        chart.removeSeries(indicatorSeries[section][indicatorKey]);
        delete indicatorSeries[section][indicatorKey];
    }
    
    // Refresh chart data to maintain proper spacing (like replay mechanism does)
    refreshChartDataForSpacing(section);
}

// Handle Indicator Checkbox Changes
function setupIndicatorListeners(section) {
    const indicatorPanel = document.getElementById(`chart-indicators-${section}`);
    if (!indicatorPanel) return;

    // Add event listeners for indicator checkboxes
    const checkboxes = indicatorPanel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const indicator = e.target.dataset.indicator;
            const period = parseInt(e.target.dataset.period) || null;
            const isChecked = e.target.checked;
            
            const config = getReplayConfig(section);
            const chartData = config.chartData();
            
            if (chartData && isChecked) {
                // Convert chart data to format needed for indicators
                const candleData = chartData.timestamp.map((timestamp, i) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    open: parseFloat(chartData.open[i]),
                    high: parseFloat(chartData.high[i]),
                    low: parseFloat(chartData.low[i]),
                    close: parseFloat(chartData.close[i])
                }));
                
                const volumeData = chartData.timestamp.map((timestamp, i) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    value: parseFloat(chartData.volume[i])
                }));
                
                addIndicatorToChart(section, indicator, period, candleData, volumeData);
            } else {
                removeIndicatorFromChart(section, indicator, period);
            }
            
            // Fix chart layout after adding/removing indicator to prevent spacing issues
            // Refresh chart data like replay does to maintain proper spacing
            setTimeout(() => {
                refreshChartDataForSpacing(section);
            }, 100);
        });
    });

    // Add event listeners for drawing tools
    const drawingButtons = indicatorPanel.querySelectorAll('.drawing-tool-btn');
    drawingButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tool = e.target.dataset.tool;
            
            if (tool === 'clear') {
                clearAllDrawings(section);
            } else {
                activateDrawingTool(section, tool);
            }
        });
    });
}

// Drawing Tools Functions (Enhanced)
function activateDrawingTool(section, tool) {
    // Temporarily disabled - drawing tools require complex overlay system
    // Based on: https://github.com/tradingview/lightweight-charts/issues/1345
    
    const buttons = document.querySelectorAll(`#chart-indicators-${section} .drawing-tool-btn`);
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Show coming soon message
    alert('Drawing tools are coming soon! 📈\n\nLightweight Charts requires a custom overlay system for drawing tools. This feature is being developed and will be available in a future update.');
    
    console.log(`Drawing tool ${tool} clicked for ${section} - showing coming soon message`);
}

function setupDrawingClickHandler(section, tool) {
    if (!chartInstances[section]) {
        console.log(`No chart instance for section: ${section}, deferring click handler setup`);
        return;
    }
    
    const chart = chartInstances[section].chart;
    const chartContainerId = `chart-${section}`;
    const chartContainer = document.getElementById(chartContainerId);
    
    if (!chartContainer) {
        console.error(`Chart container not found: ${chartContainerId}`);
        return;
    }
    
    // Remove existing click handler
    if (chartClickHandlers[section]) {
        chartContainer.removeEventListener('click', chartClickHandlers[section]);
        console.log(`Removed existing click handler for ${section}`);
    }
    
    // Create new click handler
    chartClickHandlers[section] = (event) => {
        console.log(`Drawing click detected for ${section} with tool ${tool}`);
        handleDrawingClick(section, tool, event);
    };
    
    chartContainer.addEventListener('click', chartClickHandlers[section]);
    console.log(`Drawing click handler set up for ${section} with tool ${tool}`);
    
    // Also try to set cursor immediately
    chartContainer.style.cursor = 'crosshair';
    console.log(`Set cursor to crosshair for ${section}`);
}

function handleDrawingClick(section, tool, event) {
    if (!chartInstances[section]) return;
    
    const chart = chartInstances[section].chart;
    const chartContainerId = `chart-${section}`;
    const chartContainer = document.getElementById(chartContainerId);
    
    if (!chartContainer) {
        console.error(`Chart container not found: ${chartContainerId}`);
        return;
    }
    
    const rect = chartContainer.getBoundingClientRect();
    
    // Get click coordinates relative to chart
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to chart coordinates
    const timeScale = chart.timeScale();
    const priceScale = chart.priceScale();
    
    try {
        const time = timeScale.coordinateToTime(x);
        const price = priceScale.coordinateToPrice(y);
        
        if (time && price) {
            drawingTools[section].lines.push({
                tool: tool,
                time: time,
                price: price,
                x: x,
                y: y
            });
            
            // For simplicity, just log the drawing action
            console.log(`Drew ${tool} at time: ${time}, price: ${price.toFixed(2)}`);
            
            // Show visual feedback
            showDrawingFeedback(section, tool, x, y);
            
            // Deactivate drawing tool after use
            deactivateDrawingTool(section);
        }
    } catch (error) {
        console.warn('Error handling drawing click:', error);
    }
}

function showDrawingFeedback(section, tool, x, y) {
    const chartContainerId = `chart-${section}`;
    const chartContainer = document.getElementById(chartContainerId);
    
    if (!chartContainer) return;
    
    // Create visual feedback element
    const feedback = document.createElement('div');
    feedback.className = 'drawing-feedback';
    feedback.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: 8px;
        height: 8px;
        background: #2196f3;
        border-radius: 50%;
        pointer-events: none;
        z-index: 1000;
        animation: drawingPulse 1s ease-out;
    `;
    
    chartContainer.appendChild(feedback);
    
    // Remove feedback after animation
    setTimeout(() => {
        if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback);
        }
    }, 1000);
}

function deactivateDrawingTool(section) {
    const buttons = document.querySelectorAll(`#chart-indicators-${section} .drawing-tool-btn`);
    buttons.forEach(btn => btn.classList.remove('active'));
    
    drawingTools[section].active = null;
    
    // Reset cursor
    const chartContainerId = `chart-${section}`;
    const chartContainer = document.getElementById(chartContainerId);
    if (chartContainer) {
        chartContainer.style.cursor = 'default';
    }
    
    // Remove click handler
    if (chartClickHandlers[section] && chartContainer) {
        chartContainer.removeEventListener('click', chartClickHandlers[section]);
        chartClickHandlers[section] = null;
    }
}

function clearAllDrawings(section) {
    // Show the same coming soon message
    alert('Drawing tools are coming soon! 📈\n\nLightweight Charts requires a custom overlay system for drawing tools. This feature is being developed and will be available in a future update.');
    console.log(`Clear drawings clicked for ${section} - showing coming soon message`);
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
    // Map tabId to configuration
    const tabConfig = {
        'market-simulator': {
            tickerSelectId: 'ticker-select-simulator',
            dateInputId: 'date-simulator',
            timeframeSelectId: 'timeframe-select-simulator',
            chartContainerId: 'chart-simulator',
            formId: 'stock-form-simulator',
            restrictHours: false,
            replayControlsId: 'replay-controls-simulator',
            replayPrefix: 'simulator'
        },
        'gap-analysis': {
            tickerSelectId: 'ticker-select-gap',
            dateInputId: 'date-gap',
            timeframeSelectId: 'timeframe-select-gap',
            chartContainerId: 'chart-gap',
            formId: 'stock-form-gap',
            restrictHours: true,
            replayControlsId: 'replay-controls-gap',
            replayPrefix: 'gap'
        },
        'events-analysis': {
            tickerSelectId: 'ticker-select-events',
            dateInputId: 'date-events',
            timeframeSelectId: 'timeframe-select-events',
            chartContainerId: 'chart-events',
            formId: 'stock-form-events',
            restrictHours: false,
            replayControlsId: 'replay-controls-events',
            replayPrefix: 'events'
        },
        'earnings-analysis': {
            tickerSelectId: 'earnings-ticker-select',
            dateInputId: 'date-gap',
            timeframeSelectId: 'timeframe-select-earnings',
            chartContainerId: 'chart-earnings',
            formId: 'earnings-form',
            restrictHours: true,
            replayControlsId: 'replay-controls-earnings',
            replayPrefix: 'earnings'
        }
    };

    const config = tabConfig[tabId];
    if (!config) {
        console.error(`Invalid tabId: ${tabId}`);
        return;
    }

    const { tickerSelectId, dateInputId, timeframeSelectId, chartContainerId, formId, restrictHours, replayControlsId, replayPrefix } = config;
    const ticker = document.getElementById(tickerSelectId).value;
    const date = document.getElementById(dateInputId).value;
    const timeframe = parseInt(document.getElementById(timeframeSelectId).value);
    const chartContainer = document.getElementById(chartContainerId);
    const form = document.getElementById(formId);
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');
    
    // Determine if we should restrict hours based on ticker and tab
    // QQQ should always be restricted to regular market hours (9:30-16:00) in ALL sections
    // All other tickers follow their section's restrictHours setting
    const shouldRestrictHours = (ticker === 'QQQ') || restrictHours;

    // Replay controls
    const replayControls = document.getElementById(replayControlsId);
    const playButton = document.getElementById(`play-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const pauseButton = document.getElementById(`pause-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const startOverButton = document.getElementById(`start-over-replay${replayPrefix ? '-' + replayPrefix : ''}`);
    const prevButton = document.getElementById(`prev-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const nextButton = document.getElementById(`next-candle${replayPrefix ? '-' + replayPrefix : ''}`);
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem(`chartRateLimitReset_${tabId}`);
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
          }

    if (!ticker || !date || !timeframe) {
        chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe.</p>';
        replayControls.style.display = 'none';
        const indicatorsPanel = document.getElementById(`chart-indicators-${replayPrefix}`);
        if (indicatorsPanel) indicatorsPanel.style.display = 'none';
        if (replayPrefix === 'simulator') {
            const tradingButtonsContainer = document.getElementById('trading-buttons-container');
            if (tradingButtonsContainer) tradingButtonsContainer.style.display = 'none';
        }
        return;
    }

    console.log(`Loading chart for ticker=${ticker}, date=${date}, timeframe=${timeframe}, restrict_hours=${shouldRestrictHours}, tab=${tabId}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}&timeframe=${encodeURIComponent(timeframe)}&replay_mode=${timeframe > 1}${shouldRestrictHours ? '&restrict_hours=true' : ''}`;
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
                chartContainer.innerHTML = '<p>Please select a ticker, date, and timeframe to generate a chart.</p>';
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
            const indicatorsPanel = document.getElementById(`chart-indicators-${replayPrefix}`);
            if (indicatorsPanel) indicatorsPanel.style.display = 'none';
            if (replayPrefix === 'simulator') {
                const tradingButtonsContainer = document.getElementById('trading-buttons-container');
                if (tradingButtonsContainer) tradingButtonsContainer.style.display = 'none';
            }
            return;
        }

        // Store chart data and reset replay state
        if (replayPrefix === 'simulator') { // Market Simulator
            // Destroy existing chart before creating new one
            destroyChart('simulator');
            chartDataSimulator = data.chart_data;
            timeframeSimulator = timeframe;
            aggregatedCandlesSimulator = aggregateCandles(chartDataSimulator, timeframe);
            currentReplayIndexSimulator = 0;
            isReplayingSimulator = false;
            isPausedSimulator = false;
            if (replayIntervalSimulator) clearInterval(replayIntervalSimulator);
            // Reset trade simulator state
            openPosition = null;
            tradeHistory = [];
            updateTradeSummary();
        } else if (replayPrefix === 'gap') {
            // Destroy existing chart before creating new one
            destroyChart('gap');
            chartDataGap = data.chart_data;
            timeframeGap = timeframe;
            aggregatedCandlesGap = aggregateCandles(chartDataGap, timeframe);
            currentReplayIndexGap = 0;
            isReplayingGap = false;
            isPausedGap = false;
            if (replayIntervalGap) clearInterval(replayIntervalGap);
        } else if (replayPrefix === 'events') {
            // Destroy existing chart before creating new one
            destroyChart('events');
            chartDataEvents = data.chart_data;
            timeframeEvents = timeframe;
            aggregatedCandlesEvents = aggregateCandles(chartDataEvents, timeframe);
            currentReplayIndexEvents = 0;
            isReplayingEvents = false;
            isPausedEvents = false;
            if (replayIntervalEvents) clearInterval(replayIntervalEvents);
        } else if (replayPrefix === 'earnings') {
            // Destroy existing chart before creating new one
            destroyChart('earnings');
            chartDataEarnings = data.chart_data;
            timeframeEarnings = timeframe;
            aggregatedCandlesEarnings = aggregateCandles(chartDataEarnings, timeframe);
            currentReplayIndexEarnings = 0;
            isReplayingEarnings = false;
            isPausedEarnings = false;
            if (replayIntervalEarnings) clearInterval(replayIntervalEarnings);
        }

        // Render initial chart - show complete chart for initial view
        const aggregatedCandlesVar = replayPrefix === 'simulator' ? aggregatedCandlesSimulator : 
                                   replayPrefix === 'gap' ? aggregatedCandlesGap :
                                   replayPrefix === 'events' ? aggregatedCandlesEvents :
                                   aggregatedCandlesEarnings;
        
        console.log(`Loading chart for ${replayPrefix}, aggregated candles: ${aggregatedCandlesVar.length}`);
        renderChart(replayPrefix, aggregatedCandlesVar);

        // Handle replay controls
        replayControls.style.display = 'block';
        playButton.textContent = 'Play Replay';
        playButton.disabled = false;
        pauseButton.disabled = true;
        startOverButton.disabled = true;
        prevButton.disabled = true;
        nextButton.disabled = true;
        
        // Show indicators panel and set up listeners
        const indicatorsPanel = document.getElementById(`chart-indicators-${replayPrefix}`);
        if (indicatorsPanel) {
            indicatorsPanel.style.display = 'block';
            setupIndicatorListeners(replayPrefix);
            
            // Re-activate any checked indicators
            const checkboxes = indicatorsPanel.querySelectorAll('input[type="checkbox"]:checked');
            checkboxes.forEach(checkbox => {
                const indicator = checkbox.dataset.indicator;
                const period = parseInt(checkbox.dataset.period) || null;
                
                // Convert chart data to format needed for indicators
                const candleData = data.chart_data.timestamp.map((timestamp, i) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    open: parseFloat(data.chart_data.open[i]),
                    high: parseFloat(data.chart_data.high[i]),
                    low: parseFloat(data.chart_data.low[i]),
                    close: parseFloat(data.chart_data.close[i])
                }));
                
                const volumeData = data.chart_data.timestamp.map((timestamp, i) => ({
                    time: Math.floor(new Date(timestamp).getTime() / 1000),
                    value: parseFloat(data.chart_data.volume[i])
                }));
                
                addIndicatorToChart(replayPrefix, indicator, period, candleData, volumeData);
                console.log(`Re-activated indicator: ${indicator} ${period || ''} for ${replayPrefix}`);
            });
            
            // Refresh chart data after all indicators are added to prevent spacing issues
            refreshChartDataForSpacing(replayPrefix);
        }
        
        if (replayPrefix === 'simulator') { // Market Simulator
            const tradingButtonsContainer = document.getElementById('trading-buttons-container');
            if (tradingButtonsContainer) tradingButtonsContainer.style.display = 'flex';
            if (buyButton) buyButton.disabled = true;
            if (sellButton) sellButton.disabled = true;
        }
        document.getElementById(`replay-start-time${replayPrefix ? '-' + replayPrefix : ''}`).value = '';
        document.getElementById(`replay-timestamp${replayPrefix ? '-' + replayPrefix : ''}`).textContent = 'Current Time: --:--:--';

        gtag('event', 'chart_load', {
            'event_category': 'Chart',
            'event_label': `${ticker}_${date}_${timeframe}${shouldRestrictHours ? '_regular_hours' : ''}`,
            'tab': tabId
        });
    } catch (error) {
        console.error('Error loading chart:', error.message);
        chartContainer.innerHTML = '<p>Failed to load chart: ' + error.message + '. Please try again later.</p>';
        replayControls.style.display = 'none';
        const indicatorsPanel = document.getElementById(`chart-indicators-${replayPrefix}`);
        if (indicatorsPanel) indicatorsPanel.style.display = 'none';
        if (replayPrefix === 'simulator') {
            const tradingButtonsContainer = document.getElementById('trading-buttons-container');
            if (tradingButtonsContainer) tradingButtonsContainer.style.display = 'none';
        }
        alert('Failed to load chart: ' + error.message);
    }
}

function placeBuyTrade() {
    if (!isReplayingSimulator || !chartDataSimulator || currentReplayIndexSimulator <= 0 || currentReplayIndexSimulator > chartDataSimulator.count) return;
    if (openPosition) {
        alert('Close the current position before opening a new one.');
        return;
    }
    openPosition = {
        type: 'buy',
        price: chartDataSimulator.close[currentReplayIndexSimulator - 1],
        shares: POSITION_SIZE,
        timestamp: chartDataSimulator.timestamp[currentReplayIndexSimulator - 1]
    };
    console.log(`Placed buy trade: ${JSON.stringify(openPosition)}`);
    updateTradeSummary();
    gtag('event', 'trade_placed', {
        'event_category': 'Trade Simulator',
        'event_label': `Buy_${chartDataSimulator.ticker}_${chartDataSimulator.date}_${openPosition.timestamp}`
    });
}

function placeSellTrade() {
    if (!isReplayingSimulator || !chartDataSimulator || currentReplayIndexSimulator <= 0 || currentReplayIndexSimulator > chartDataSimulator.count) return;
    if (openPosition) {
        // Close existing position
        const exitPrice = chartDataSimulator.close[currentReplayIndexSimulator - 1];
        const pnl = openPosition.type === 'buy'
            ? (exitPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - exitPrice) * openPosition.shares;
        tradeHistory.push({
            type: openPosition.type,
            entryPrice: openPosition.price,
            exitPrice: exitPrice,
            shares: openPosition.shares,
            timestamp: chartDataSimulator.timestamp[currentReplayIndexSimulator - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        openPosition = null;
        console.log(`Closed position with P/L: $${pnl.toFixed(2)}`);
        updateTradeSummary();
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${tradeHistory[tradeHistory.length - 1].type}_${chartDataSimulator.ticker}_${chartDataSimulator.date}_${tradeHistory[tradeHistory.length - 1].timestamp}`
        });
    } else {
        // Open new sell position
        openPosition = {
            type: 'sell',
            price: chartDataSimulator.close[currentReplayIndexSimulator - 1],
            shares: POSITION_SIZE,
            timestamp: chartDataSimulator.timestamp[currentReplayIndexSimulator - 1]
        };
        console.log(`Placed sell trade: ${JSON.stringify(openPosition)}`);
        updateTradeSummary();
        gtag('event', 'trade_placed', {
            'event_category': 'Trade Simulator',
            'event_label': `Sell_${chartDataSimulator.ticker}_${chartDataSimulator.date}_${openPosition.timestamp}`
        });
    }
}

function updateTradeSummary() {
    const positionStatus = document.getElementById('position-status');
    const tradePnl = document.getElementById('trade-pnl');
    const tradeHistoryTable = document.getElementById('trade-history-table');
    const tradeHistoryTbody = document.getElementById('trade-history-tbody');
    const tradeHistoryEmpty = document.getElementById('trade-history-empty');
    const buyButton = document.getElementById('buy-trade');
    const sellButton = document.getElementById('sell-trade');

    if (!positionStatus || !tradePnl || !tradeHistoryTable || !tradeHistoryTbody || !tradeHistoryEmpty || !buyButton || !sellButton) return;

    // Update button states
    buyButton.disabled = !isReplayingSimulator || currentReplayIndexSimulator <= 0 || currentReplayIndexSimulator > chartDataSimulator.count || openPosition?.type === 'sell';
    sellButton.disabled = !isReplayingSimulator || currentReplayIndexSimulator <= 0 || currentReplayIndexSimulator > chartDataSimulator.count;

    // Update position status
    if (openPosition) {
        const currentPrice = currentReplayIndexSimulator > 0 ? chartDataSimulator.close[currentReplayIndexSimulator - 1] : openPosition.price;
        const unrealizedPnl = openPosition.type === 'buy'
            ? (currentPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - currentPrice) * openPosition.shares;
        positionStatus.textContent = `Open ${openPosition.type.toUpperCase()} Position: ${openPosition.shares} shares @ $${openPosition.price.toFixed(2)}`;
        tradePnl.textContent = `Unrealized P/L: $${unrealizedPnl.toFixed(2)}`;
    } else {
        positionStatus.textContent = 'No open position';
        tradePnl.textContent = `Realized P/L: $${tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2)}`;
    }

    // Update trade history table
    if (tradeHistory.length === 0) {
        tradeHistoryTable.style.display = 'none';
        tradeHistoryEmpty.style.display = 'block';
    } else {
        tradeHistoryTable.style.display = 'table';
        tradeHistoryEmpty.style.display = 'none';
        
        // Clear existing rows
        tradeHistoryTbody.innerHTML = '';
        
        // Add each trade as a table row
        tradeHistory.forEach((trade, index) => {
            const row = document.createElement('tr');
            const pnlClass = trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            
            row.innerHTML = `
                <td>${trade.type.toUpperCase()}</td>
                <td>$${trade.entryPrice.toFixed(2)}</td>
                <td>$${trade.exitPrice.toFixed(2)}</td>
                <td>${trade.shares}</td>
                <td>${trade.timestamp.split(' ')[1]}</td>
                <td class="${pnlClass}">$${trade.pnl.toFixed(2)}</td>
            `;
            
            tradeHistoryTbody.appendChild(row);
        });
    }
}

function getReplayConfig(section) {
    const configs = {
        'simulator': { // Market Simulator
            chartData: () => chartDataSimulator,
            setChartData: (data) => { chartDataSimulator = data; },
            replayInterval: () => replayIntervalSimulator,
            setReplayInterval: (interval) => { replayIntervalSimulator = interval; },
            currentReplayIndex: () => currentReplayIndexSimulator,
            setCurrentReplayIndex: (index) => { currentReplayIndexSimulator = index; },
            isReplaying: () => isReplayingSimulator,
            setIsReplaying: (state) => { isReplayingSimulator = state; },
            isPaused: () => isPausedSimulator,
            setIsPaused: (state) => { isPausedSimulator = state; },
            aggregatedCandles: () => aggregatedCandlesSimulator,
            setAggregatedCandles: (candles) => { aggregatedCandlesSimulator = candles; },
            timeframe: () => timeframeSimulator,
            setTimeframe: (tf) => { timeframeSimulator = tf; },
            chartContainerId: 'chart-simulator',
            playButtonId: 'play-replay-simulator',
            pauseButtonId: 'pause-replay-simulator',
            startOverButtonId: 'start-over-replay-simulator',
            prevButtonId: 'prev-candle-simulator',
            nextButtonId: 'next-candle-simulator',
            startTimeInputId: 'replay-start-time-simulator',
            replaySpeedId: 'replay-speed-simulator',
            timestampDisplayId: 'replay-timestamp-simulator',
            hasTradeSimulator: true
        },
        'gap': {
            chartData: () => chartDataGap,
            setChartData: (data) => { chartDataGap = data; },
            replayInterval: () => replayIntervalGap,
            setReplayInterval: (interval) => { replayIntervalGap = interval; },
            currentReplayIndex: () => currentReplayIndexGap,
            setCurrentReplayIndex: (index) => { currentReplayIndexGap = index; },
            isReplaying: () => isReplayingGap,
            setIsReplaying: (state) => { isReplayingGap = state; },
            isPaused: () => isPausedGap,
            setIsPaused: (state) => { isPausedGap = state; },
            aggregatedCandles: () => aggregatedCandlesGap,
            setAggregatedCandles: (candles) => { aggregatedCandlesGap = candles; },
            timeframe: () => timeframeGap,
            setTimeframe: (tf) => { timeframeGap = tf; },
            chartContainerId: 'chart-gap',
            playButtonId: 'play-replay-gap',
            pauseButtonId: 'pause-replay-gap',
            startOverButtonId: 'start-over-replay-gap',
            prevButtonId: 'prev-candle-gap',
            nextButtonId: 'next-candle-gap',
            startTimeInputId: 'replay-start-time-gap',
            replaySpeedId: 'replay-speed-gap',
            timestampDisplayId: 'replay-timestamp-gap',
            hasTradeSimulator: false
        },
        'events': {
            chartData: () => chartDataEvents,
            setChartData: (data) => { chartDataEvents = data; },
            replayInterval: () => replayIntervalEvents,
            setReplayInterval: (interval) => { replayIntervalEvents = interval; },
            currentReplayIndex: () => currentReplayIndexEvents,
            setCurrentReplayIndex: (index) => { currentReplayIndexEvents = index; },
            isReplaying: () => isReplayingEvents,
            setIsReplaying: (state) => { isReplayingEvents = state; },
            isPaused: () => isPausedEvents,
            setIsPaused: (state) => { isPausedEvents = state; },
            aggregatedCandles: () => aggregatedCandlesEvents,
            setAggregatedCandles: (candles) => { aggregatedCandlesEvents = candles; },
            timeframe: () => timeframeEvents,
            setTimeframe: (tf) => { timeframeEvents = tf; },
            chartContainerId: 'chart-events',
            playButtonId: 'play-replay-events',
            pauseButtonId: 'pause-replay-events',
            startOverButtonId: 'start-over-replay-events',
            prevButtonId: 'prev-candle-events',
            nextButtonId: 'next-candle-events',
            startTimeInputId: 'replay-start-time-events',
            replaySpeedId: 'replay-speed-events',
            timestampDisplayId: 'replay-timestamp-events',
            hasTradeSimulator: false
        },
        'earnings': {
            chartData: () => chartDataEarnings,
            setChartData: (data) => { chartDataEarnings = data; },
            replayInterval: () => replayIntervalEarnings,
            setReplayInterval: (interval) => { replayIntervalEarnings = interval; },
            currentReplayIndex: () => currentReplayIndexEarnings,
            setCurrentReplayIndex: (index) => { currentReplayIndexEarnings = index; },
            isReplaying: () => isReplayingEarnings,
            setIsReplaying: (state) => { isReplayingEarnings = state; },
            isPaused: () => isPausedEarnings,
            setIsPaused: (state) => { isPausedEarnings = state; },
            aggregatedCandles: () => aggregatedCandlesEarnings,
            setAggregatedCandles: (candles) => { aggregatedCandlesEarnings = candles; },
            timeframe: () => timeframeEarnings,
            setTimeframe: (tf) => { timeframeEarnings = tf; },
            chartContainerId: 'chart-earnings',
            playButtonId: 'play-replay-earnings',
            pauseButtonId: 'pause-replay-earnings',
            startOverButtonId: 'start-over-replay-earnings',
            prevButtonId: 'prev-candle-earnings',
            nextButtonId: 'next-candle-earnings',
            startTimeInputId: 'replay-start-time-earnings',
            replaySpeedId: 'replay-speed-earnings',
            timestampDisplayId: 'replay-timestamp-earnings',
            hasTradeSimulator: false
        }
    };
    return configs[section];
}

// Set initial zoom for replay to show normal-sized candles instead of huge ones
function setInitialReplayZoom(section) {
    const chart = chartInstances[section]?.chart;
    if (!chart) return;
    
    try {
        const config = getReplayConfig(section);
        const chartData = config.chartData();
        
        console.log(`Setting initial replay zoom for ${section}`);
        
        // Set reasonable bar spacing for normal-sized candles
        chart.applyOptions({
            timeScale: {
                barSpacing: 8,  // Normal spacing, not auto-fitted to huge size
                fixLeftEdge: false,
                fixRightEdge: false,
                lockVisibleTimeRangeOnResize: true,
                rightBarStaysOnScroll: true
            }
        });
        
        // Calculate a reasonable visible time range that would show ~80-100 candles
        // This ensures candles start at normal size instead of taking half the screen
        if (chartData && chartData.timestamp && chartData.timestamp.length > 0) {
            const startTimestamp = Math.floor(new Date(chartData.timestamp[0]).getTime() / 1000);
            const timeframe = config.timeframe();
            
            // Show space for about 80 candles worth of time (this makes individual candles normal-sized)
            const candleWidthInSeconds = timeframe * 60; // timeframe is in minutes
            const visibleRangeInSeconds = 80 * candleWidthInSeconds;
            const endTimestamp = startTimestamp + visibleRangeInSeconds;
            
            chart.timeScale().setVisibleRange({
                from: startTimestamp,
                to: endTimestamp
            });
            
            console.log(`Set initial visible range: ${visibleRangeInSeconds / 60} minutes (${80} candles width)`);
        }
        
        console.log(`Initial replay zoom set for ${section} - candles should be normal size`);
        
        // Temporarily set user zoom state to prevent auto-fit from overriding our initial zoom
        // This will be reset to false after a few seconds to allow normal auto-fit behavior
        userZoomState[section] = true;
        setTimeout(() => {
            userZoomState[section] = false;
            console.log(`Reset zoom state for ${section} - auto-fit now enabled`);
        }, 3000); // 3 seconds should be enough for replay to get going
        
    } catch (error) {
        console.warn(`Error setting initial replay zoom for ${section}:`, error);
    }
}

function startReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;
    
    // Reset zoom state when starting replay to enable auto-fit
    userZoomState[section] = false;
    
    // Clear all indicators before starting replay so they build up naturally
    clearIndicatorsForReplay(section);

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const startTimeInput = document.getElementById(config.startTimeInputId).value;
    const replaySpeed = parseInt(document.getElementById(config.replaySpeedId).value);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    // Determine start index based on user input
    if (!config.isPaused()) {
        if (startTimeInput && startTimeInput.match(/^[0-9]{1,2}:[0-5][0-9]$/)) {
            const [hours, minutes] = startTimeInput.split(':').map(Number);
            // Validate time ranges
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                const targetTime = new Date(`${chartData.date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
                let currentReplayIndex = chartData.timestamp.findIndex(ts => {
                    const candleTime = new Date(ts);
                    return candleTime.getTime() >= targetTime.getTime();
                });
                if (currentReplayIndex === -1) {
                    currentReplayIndex = 0;
                    alert('Start time not found in chart data. Starting from first candle.');
                }
                config.setCurrentReplayIndex(currentReplayIndex);
            } else {
                config.setCurrentReplayIndex(0);
                alert('Invalid time format. Please enter time in HH:MM format (e.g., 9:30 or 09:30).');
            }
        } else if (startTimeInput && startTimeInput.trim() !== '') {
            config.setCurrentReplayIndex(0);
            alert('Invalid time format. Please enter time in HH:MM format (e.g., 9:30 or 09:30).');
        } else {
            config.setCurrentReplayIndex(0);
        }
    }

    config.setIsReplaying(true);
    config.setIsPaused(false);
    playButton.textContent = 'Play Replay';
    playButton.disabled = true;
    pauseButton.disabled = false;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count;
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count;
        updateTradeSummary();
    }

    // Initial render
    let minuteIndex = config.currentReplayIndex() % config.timeframe();
    let candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());

    if (candleIndex > 0 || minuteIndex > 0) {
        renderChart(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = config.currentReplayIndex() > 0 
            ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
            : 'Current Time: --:--:--';
    } else {
        renderChart(section, []);
        timestampDisplay.textContent = 'Current Time: --:--:--';
    }
    
    // Set initial zoom for replay to show candles at normal size (not huge)
    setInitialReplayZoom(section);

    config.setReplayInterval(setInterval(() => {
        if (config.currentReplayIndex() >= chartData.count) {
            stopReplay(section);
            return;
        }

        candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());
        minuteIndex = config.currentReplayIndex() % config.timeframe();

        // Render only up to the current candle, with minute-by-minute updates for the current candle only
        renderChart(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);
        timestampDisplay.textContent = `Current Time: ${chartData.timestamp[config.currentReplayIndex()].split(' ')[1]}`;

        prevButton.disabled = config.currentReplayIndex() <= 0;
        nextButton.disabled = config.currentReplayIndex() + 1 >= chartData.count;
        startOverButton.disabled = config.currentReplayIndex() <= 0;
        if (config.hasTradeSimulator) {
            buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count || openPosition?.type === 'sell';
            sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count;
            updateTradeSummary();
        }

        config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
        if (config.currentReplayIndex() % config.timeframe() === 0) {
            minuteIndex = 0;
        }
    }, replaySpeed));

    gtag('event', 'replay_start', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section || 'simulator'}`
    });
}

function pauseReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying()) return;

    config.setIsReplaying(false);
    config.setIsPaused(true);
    clearInterval(config.replayInterval());
    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
        updateTradeSummary();
    }

    playButton.textContent = 'Resume Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > config.chartData().count || openPosition?.type === 'sell';
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > config.chartData().count;
    }
}

function startOverReplay(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData) return;
    
    // Reset zoom state when starting over to enable auto-fit
    userZoomState[section] = false;
    
    // Clear all indicators before starting over so they build up naturally (like play replay)
    clearIndicatorsForReplay(section);

    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    // Stop any ongoing replay
    if (config.isReplaying() || config.isPaused()) {
        clearInterval(config.replayInterval());
        config.setIsReplaying(false);
        config.setIsPaused(false);
    }

    // Reset to the beginning
    config.setCurrentReplayIndex(0);

    // Destroy current chart and recreate it
    destroyChart(section);
    
    // Update chart to show no candles (initial state)
    renderChart(section, []);
    
    // Set initial zoom for start over to show normal-sized candles
    setInitialReplayZoom(section);
    
    // Re-setup indicators that were active
    const indicatorsPanel = document.getElementById(`chart-indicators-${section}`);
    if (indicatorsPanel) {
        setupIndicatorListeners(section);
    }

    // Update button states
    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = config.aggregatedCandles().length === 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    // Reset timestamp
    timestampDisplay.textContent = 'Current Time: --:--:--';

    gtag('event', 'replay_start_over', {
        'event_category': 'Chart',
        'event_label': `${chartData.ticker}_${chartData.date}_${section || 'simulator'}`
    });
}

function stopReplay(section) {
    const config = getReplayConfig(section);
    if (!config.isReplaying() && !config.isPaused()) return;

    config.setIsReplaying(false);
    config.setIsPaused(false);
    clearInterval(config.replayInterval());
    const playButton = document.getElementById(config.playButtonId);
    const pauseButton = document.getElementById(config.pauseButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const chartData = config.chartData();
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    // Close open position if any (only for Market Simulator)
    if (config.hasTradeSimulator && openPosition && config.currentReplayIndex() > 0 && config.currentReplayIndex() <= chartData.count) {
        const exitPrice = chartData.close[config.currentReplayIndex() - 1];
        const pnl = openPosition.type === 'buy'
            ? (exitPrice - openPosition.price) * openPosition.shares
            : (openPosition.price - exitPrice) * openPosition.shares;
        tradeHistory.push({
            type: openPosition.type,
            entryPrice: openPosition.price,
            exitPrice: exitPrice,
            shares: openPosition.shares,
            timestamp: chartData.timestamp[config.currentReplayIndex() - 1],
            pnl: parseFloat(pnl.toFixed(2))
        });
        openPosition = null;
        console.log(`Closed position at replay end with P/L: $${pnl.toFixed(2)}`);
        gtag('event', 'trade_closed', {
            'event_category': 'Trade Simulator',
            'event_label': `${tradeHistory[tradeHistory.length - 1].type}_${chartData.ticker}_${chartData.date}_${tradeHistory[tradeHistory.length - 1].timestamp}`
        });
    }

    playButton.textContent = 'Play Replay';
    playButton.disabled = false;
    pauseButton.disabled = true;
    startOverButton.disabled = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    if (config.hasTradeSimulator) {
        buyButton.disabled = true;
        sellButton.disabled = true;
        updateTradeSummary();
    }

    // Destroy current chart and recreate it with full data
    destroyChart(section);
    
    // Restore full chart
    renderChart(section, config.aggregatedCandles());

    document.getElementById(config.timestampDisplayId).textContent = 'Current Time: --:--:--';
}

function prevCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || config.currentReplayIndex() <= 0) return;

    config.setCurrentReplayIndex(config.currentReplayIndex() - 1);
    updateChartToIndex(section);
}

function nextCandle(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    if (!chartData || config.isReplaying() || config.currentReplayIndex() >= chartData.count) return;

    config.setCurrentReplayIndex(config.currentReplayIndex() + 1);
    updateChartToIndex(section);
}

function updateChartToIndex(section) {
    const config = getReplayConfig(section);
    const chartData = config.chartData();
    const timestampDisplay = document.getElementById(config.timestampDisplayId);
    const prevButton = document.getElementById(config.prevButtonId);
    const nextButton = document.getElementById(config.nextButtonId);
    const startOverButton = document.getElementById(config.startOverButtonId);
    let buyButton, sellButton;
    if (config.hasTradeSimulator) {
        buyButton = document.getElementById('buy-trade');
        sellButton = document.getElementById('sell-trade');
    }

    const candleIndex = Math.floor(config.currentReplayIndex() / config.timeframe());
    const minuteIndex = config.currentReplayIndex() % config.timeframe();
    renderChart(section, config.aggregatedCandles().slice(0, candleIndex + (minuteIndex > 0 ? 1 : 0)), candleIndex, minuteIndex > 0 ? minuteIndex - 1 : null);

    // Update timestamp and button states
    timestampDisplay.textContent = config.currentReplayIndex() > 0 
        ? `Current Time: ${chartData.timestamp[config.currentReplayIndex() - 1].split(' ')[1]}`
        : 'Current Time: --:--:--';
    prevButton.disabled = config.currentReplayIndex() <= 0;
    nextButton.disabled = config.currentReplayIndex() >= chartData.count;
    startOverButton.disabled = config.currentReplayIndex() <= 0;
    if (config.hasTradeSimulator) {
        buyButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count || openPosition?.type === 'sell';
        sellButton.disabled = config.currentReplayIndex() <= 0 || config.currentReplayIndex() > chartData.count;
        updateTradeSummary();
    }
}

function updateReplaySpeed(section) {
    const config = getReplayConfig(section);
    if (config.isReplaying()) {
        pauseReplay(section);
        startReplay(section);
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
        ul.id = 'gap-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked gap date: ${date}`);
                openTab('gap-analysis');
                document.getElementById('ticker-select-gap').value = 'QQQ';
                document.getElementById('date-gap').value = date;
                loadChart(new Event('submit'), 'gap-analysis');
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
    const selects = form.querySelectorAll('select');

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
            }, 1000);
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
        ul.id = 'event-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked event date: ${date}`);
                openTab('events-analysis');
                document.getElementById('ticker-select-events').value = 'QQQ';
                document.getElementById('date-events').value = date;
                loadChart(new Event('submit'), 'events-analysis');
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
            }, 1000);
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
            console.error('Error from earnings data:', data.error);
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
        ul.id = 'earnings-dates-list';
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked earnings date: ${date}`);
                openTab('earnings-analysis');
                document.getElementById('earnings-ticker-select').value = ticker;
                document.getElementById('date-gap').value = date;
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
            }, 1000);
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

function openTab(tabName) {
    console.log(`Opening tab: ${tabName}`);
    const tabs = document.getElementsByClassName('tab-content');
    const buttons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
        buttons[i].classList.remove('active');
    }
    document.getElementById(tabName).style.display = 'block';
    const activeButton = Array.from(buttons).find(button => button.getAttribute('onclick').includes(tabName));
    if (activeButton) {
        activeButton.classList.add('active');
    }
    gtag('event', 'tab_open', {
        'event_category': 'Navigation',
        'event_label': tabName
    });
}