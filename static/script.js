document.addEventListener('DOMContentLoaded', () => {
    // Fetch tickers and years on page load
    fetchTickers();
    fetchYears();
    setupEventListeners();
});

function fetchTickers() {
    fetch('/api/tickers')
        .then(response => response.json())
        .then(data => {
            const tickerSelect = document.getElementById('ticker-select');
            const earningsTickerSelect = document.getElementById('earnings-ticker-select');
            const earningsBinTickerSelect = document.getElementById('earnings-bin-ticker-select');
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                tickerSelect.appendChild(option);
                earningsTickerSelect.appendChild(option.cloneNode(true));
                earningsBinTickerSelect.appendChild(option.cloneNode(true));
            });
        })
        .catch(error => {
            console.error('Error fetching tickers:', error);
            showError('Failed to load tickers. Please try again later.');
        });
}

function fetchYears() {
    fetch('/api/years')
        .then(response => response.json())
        .then(data => {
            const yearSelect = document.getElementById('year-select');
            data.years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error fetching years:', error);
            showError('Failed to load years. Please try again later.');
        });
}

function setupEventListeners() {
    // Stock form submission
    document.getElementById('stock-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const ticker = document.getElementById('ticker-select').value;
        const date = document.getElementById('date').value;
        if (ticker && date) {
            fetchChartData(ticker, date);
        } else {
            showError('Please select a ticker and date.');
        }
    });

    // Populate dates when ticker changes
    document.getElementById('ticker-select').addEventListener('change', (e) => {
        const ticker = e.target.value;
        if (ticker) {
            fetchValidDates(ticker);
        } else {
            document.getElementById('date').value = '';
        }
    });

    // Gap form submission
    document.getElementById('gap-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const gapSize = document.getElementById('gap-size-select').value;
        const day = document.getElementById('day-select').value;
        const gapDirection = document.getElementById('gap-direction-select').value;
        if (gapSize && day && gapDirection) {
            fetchGapDates(gapSize, day, gapDirection);
        } else {
            showError('Please select all gap criteria.');
        }
    });

    // Gap insights form submission
    document.getElementById('gap-insights-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const gapSize = document.getElementById('gap-insights-size-select').value;
        const day = document.getElementById('gap-insights-day-select').value;
        const gapDirection = document.getElementById('gap-insights-direction-select').value;
        if (gapSize && day && gapDirection) {
            fetchGapInsights(gapSize, day, gapDirection);
        } else {
            showError('Please select all gap insights criteria.');
        }
    });

    // Event filter toggle
    document.querySelectorAll('input[name="event-filter-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('event-year-form').classList.toggle('active', e.target.value === 'event-year');
            document.getElementById('event-bin-form').classList.toggle('active', e.target.value === 'event-bin');
        });
    });

    // Event year form submission
    document.getElementById('event-year-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const eventType = document.getElementById('event-type-select').value;
        const year = document.getElementById('year-select').value;
        if (eventType && year) {
            fetchEventDates(eventType, year);
        } else {
            showError('Please select an event type and year.');
        }
    });

    // Event bin form submission
    document.getElementById('event-bin-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const eventType = document.getElementById('event-type-bin-select').value;
        const bin = document.getElementById('bin-select').value;
        if (eventType && bin) {
            fetchEconomicEventDates(eventType, bin);
        } else {
            showError('Please select an event type and economic impact.');
        }
    });

    // Earnings filter toggle
    document.querySelectorAll('input[name="earnings-filter-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('earnings-ticker-form').classList.toggle('active', e.target.value === 'ticker-only');
            document.getElementById('earnings-bin-form').classList.toggle('active', e.target.value === 'ticker-bin');
        });
    });

    // Earnings ticker form submission
    document.getElementById('earnings-ticker-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const ticker = document.getElementById('earnings-ticker-select').value;
        if (ticker) {
            fetchEarningsDates(ticker);
        } else {
            showError('Please select a ticker.');
        }
    });

    // Earnings bin form submission
    document.getElementById('earnings-bin-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const ticker = document.getElementById('earnings-bin-ticker-select').value;
        const bin = document.getElementById('earnings-bin-select').value;
        if (ticker && bin) {
            fetchEarningsDates(ticker, bin);
        } else {
            showError('Please select a ticker and earnings outcome.');
        }
    });
}

function fetchValidDates(ticker) {
    fetch(`/api/valid_dates?ticker=${ticker}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
                document.getElementById('date').value = '';
            } else {
                const dateInput = document.getElementById('date');
                dateInput.value = '';
                dateInput.min = data.dates[0];
                dateInput.max = data.dates[data.dates.length - 1];
            }
        })
        .catch(error => {
            console.error('Error fetching valid dates:', error);
            showError('Failed to load valid dates. Please try again later.');
        });
}

function fetchChartData(ticker, date) {
    fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
                document.getElementById('plotly-chart').innerHTML = '';
            } else {
                plotChart(data.chart_data);
            }
        })
        .catch(error => {
            console.error('Error fetching chart data:', error);
            showError('Failed to load chart data. Please try again later.');
        });
}

function fetchGapDates(gapSize, day, gapDirection) {
    fetch(`/api/gaps?gap_size=${encodeURIComponent(gapSize)}&day=${day}&gap_direction=${gapDirection}`)
        .then(response => response.json())
        .then(data => {
            const gapDatesDiv = document.getElementById('gap-dates');
            if (data.error) {
                showError(data.error);
                gapDatesDiv.innerHTML = '<p>Error loading gap dates. Please try again.</p>';
            } else if (data.dates.length === 0) {
                gapDatesDiv.innerHTML = `<p>${data.message}</p>`;
            } else {
                gapDatesDiv.innerHTML = '<p>Click a date to load the chart:</p><ul>' + 
                    data.dates.map(date => `<li><a href="#" onclick="loadChartForDate('QQQ', '${date}')">${date}</a></li>`).join('') + 
                    '</ul>';
            }
        })
        .catch(error => {
            console.error('Error fetching gap dates:', error);
            showError('Failed to load gap dates. Please try again later.');
        });
}

function fetchGapInsights(gapSize, day, gapDirection) {
    fetch(`/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${day}&gap_direction=${gapDirection}`)
        .then(response => {
            if (response.status === 429) {
                return response.json().then(data => {
                    throw new Error(data.error);
                });
            }
            return response.json();
        })
        .then(data => {
            const insightsDiv = document.getElementById('insights-results');
            if (data.error) {
                showError(data.error);
                insightsDiv.innerHTML = '<p>Error loading insights. Please try again.</p>';
            } else if (Object.keys(data.insights).length === 0) {
                insightsDiv.innerHTML = `<p>${data.message}</p>`;
            } else {
                insightsDiv.innerHTML = '<h3>Gap Insights</h3><ul>' + 
                    Object.entries(data.insights).map(([key, value]) => 
                        `<li><strong>${value.description}:</strong> Median: ${value.median}, Average: ${value.average}</li>`
                    ).join('') + '</ul>';
            }
        })
        .catch(error => {
            console.error('Error fetching gap insights:', error);
            showError(error.message || 'Failed to load gap insights. Please try again later.');
        });
}

function fetchEventDates(eventType, year) {
    fetch(`/api/events?event_type=${eventType}&year=${year}`)
        .then(response => response.json())
        .then(data => {
            const eventDatesDiv = document.getElementById('event-dates');
            if (data.error) {
                showError(data.error);
                eventDatesDiv.innerHTML = '<p>Error loading event dates. Please try again.</p>';
            } else if (data.dates.length === 0) {
                eventDatesDiv.innerHTML = `<p>${data.message}</p>`;
            } else {
                eventDatesDiv.innerHTML = '<p>Click a date to load the chart:</p><ul>' + 
                    data.dates.map(date => `<li><a href="#" onclick="loadChartForDate('QQQ', '${date}')">${date}</a></li>`).join('') + 
                    '</ul>';
            }
        })
        .catch(error => {
            console.error('Error fetching event dates:', error);
            showError('Failed to load event dates. Please try again later.');
        });
}

function fetchEconomicEventDates(eventType, bin) {
    fetch(`/api/economic_events?event_type=${eventType}&bin=${bin}`)
        .then(response => response.json())
        .then(data => {
            const eventDatesDiv = document.getElementById('event-dates');
            if (data.error) {
                showError(data.error);
                eventDatesDiv.innerHTML = '<p>Error loading event dates. Please try again.</p>';
            } else if (data.dates.length === 0) {
                eventDatesDiv.innerHTML = `<p>${data.message}</p>`;
            } else {
                eventDatesDiv.innerHTML = '<p>Click a date to load the chart:</p><ul>' + 
                    data.dates.map(date => `<li><a href="#" onclick="loadChartForDate('QQQ', '${date}')">${date}</a></li>`).join('') + 
                    '</ul>';
            }
        })
        .catch(error => {
            console.error('Error fetching economic event dates:', error);
            showError('Failed to load economic event dates. Please try again later.');
        });
}

function fetchEarningsDates(ticker, bin = '') {
    const url = bin ? `/api/earnings?ticker=${ticker}&bin=${encodeURIComponent(bin)}` : `/api/earnings?ticker=${ticker}`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            const earningsDatesDiv = document.getElementById('earnings-dates');
            if (data.error) {
                showError(data.error);
                earningsDatesDiv.innerHTML = '<p>Error loading earnings dates. Please try again.</p>';
            } else if (data.dates.length === 0) {
                earningsDatesDiv.innerHTML = `<p>${data.message}</p>`;
            } else {
                earningsDatesDiv.innerHTML = '<p>Click a date to load the chart:</p><ul>' + 
                    data.dates.map(date => `<li><a href="#" onclick="loadChartForDate('${ticker}', '${date}')">${date}</a></li>`).join('') + 
                    '</ul>';
            }
        })
        .catch(error => {
            console.error('Error fetching earnings dates:', error);
            showError('Failed to load earnings dates. Please try again later.');
        });
}

function loadChartForDate(ticker, date) {
    document.getElementById('ticker-select').value = ticker;
    document.getElementById('date').value = date;
    fetchChartData(ticker, date);
}

function plotChart(data) {
    const trace1 = {
        x: data.timestamp,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        type: 'candlestick',
        xaxis: 'x',
        yaxis: 'y'
    };

    const trace2 = {
        x: data.timestamp,
        y: data.volume,
        type: 'bar',
        xaxis: 'x',
        yaxis: 'y2',
        marker: {
            color: 'rgba(0, 0, 255, 0.5)'
        }
    };

    const layout = {
        title: `${data.ticker} 1-Minute Chart - ${data.date}`,
        xaxis: {
            title: 'Time',
            type: 'date',
            rangeslider: { visible: false }
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
        showlegend: false,
        margin: { t: 50, b: 50, l: 50, r: 50 }
    };

    Plotly.newPlot('plotly-chart', [trace1, trace2], layout);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function openTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`button[onclick="openTab('${tabName}')"]`).classList.add('active');
}