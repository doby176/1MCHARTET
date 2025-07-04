document.addEventListener('DOMContentLoaded', function() {
    const stockForm = document.getElementById('stock-form');
    const tickerSelect = document.getElementById('ticker-select');
    const dateInput = document.getElementById('date');
    const plotlyChart = document.getElementById('plotly-chart');
    const gapForm = document.getElementById('gap-form');
    const gapDatesDiv = document.getElementById('gap-dates');
    const gapInsightsForm = document.getElementById('gap-insights-form');
    const gapInsightsResults = document.getElementById('gap-insights-results');
    const eventsForm = document.getElementById('events-form');
    const eventDatesDiv = document.getElementById('event-dates');
    const earningsForm = document.getElementById('earnings-form');
    const earningsDatesDiv = document.getElementById('earnings-dates');
    const yearSelect = document.getElementById('year-select');
    const binSelect = document.getElementById('bin-select');
    const earningsBinSelect = document.getElementById('earnings-bin-select');
    const earningsTickerSelect = document.getElementById('earnings-ticker-select');
    const earningsBinTickerSelect = document.getElementById('earnings-bin-ticker-select');

    // Initialize filter toggles for events
    const eventFilterRadios = document.querySelectorAll('input[name="filter-type"]');
    const yearFilterSection = document.getElementById('year-filter');
    const binFilterSection = document.getElementById('bin-filter');

    // Initialize filter toggles for earnings
    const earningsFilterRadios = document.querySelectorAll('input[name="earnings-filter-type"]');
    const tickerFilterSection = document.getElementById('ticker-filter');
    const earningsBinFilterSection = document.getElementById('earnings-bin-filter');

    let currentTicker = '';
    let availableDates = [];

    // Fetch tickers for stock form and earnings form
    fetch('/api/tickers')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch tickers');
            return response.json();
        })
        .then(data => {
            data.tickers.forEach(ticker => {
                const option = document.createElement('option');
                option.value = ticker;
                option.textContent = ticker;
                tickerSelect.appendChild(option);
                const earningsOption = document.createElement('option');
                earningsOption.value = ticker;
                earningsOption.textContent = ticker;
                earningsTickerSelect.appendChild(earningsOption);
                const earningsBinOption = document.createElement('option');
                earningsBinOption.value = ticker;
                earningsBinOption.textContent = ticker;
                earningsBinTickerSelect.appendChild(earningsBinOption);
            });
        })
        .catch(error => {
            console.error('Error fetching tickers:', error);
            alert('Failed to load tickers. Please try again later.');
        });

    // Fetch years for events form
    fetch('/api/years')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch years');
            return response.json();
        })
        .then(data => {
            data.years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error fetching years:', error);
            alert('Failed to load years. Please try again later.');
        });

    // Fetch bins for economic events when event type is selected
    document.getElementById('bin-event-type-select').addEventListener('change', function() {
        const eventType = this.value;
        binSelect.innerHTML = '<option value="">Select range</option>';
        if (eventType) {
            fetch(`/api/economic_bins?event_type=${encodeURIComponent(eventType)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch bins');
                    return response.json();
                })
                .then(data => {
                    data.bins.forEach(bin => {
                        const option = document.createElement('option');
                        option.value = bin;
                        option.textContent = bin;
                        binSelect.appendChild(option);
                    });
                })
                .catch(error => {
                    console.error('Error fetching economic bins:', error);
                    alert('Failed to load economic impact ranges. Please try again.');
                });
        }
    });

    // Fetch bins for earnings when ticker is selected in bin filter
    earningsBinTickerSelect.addEventListener('change', function() {
        const ticker = this.value;
        earningsBinSelect.innerHTML = '<option value="">Select range</option>';
        if (ticker) {
            fetch(`/api/earnings_bins?ticker=${encodeURIComponent(ticker)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch earnings bins');
                    return response.json();
                })
                .then(data => {
                    // Filter out 'Unknown' bin if not needed, or include it based on your preference
                    data.bins.forEach(bin => {
                        if (bin !== 'Unknown') { // Optionally exclude 'Unknown'
                            const option = document.createElement('option');
                            option.value = bin;
                            option.textContent = bin;
                            earningsBinSelect.appendChild(option);
                        }
                    });
                })
                .catch(error => {
                    console.error('Error fetching earnings bins:', error);
                    alert('Failed to load earnings impact ranges. Please try again.');
                });
        }
    });

    // Toggle event filter sections
    eventFilterRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            yearFilterSection.classList.toggle('active', this.value === 'year');
            binFilterSection.classList.toggle('active', this.value === 'bin');
        });
    });

    // Toggle earnings filter sections
    earningsFilterRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            tickerFilterSection.classList.toggle('active', this.value === 'ticker');
            earningsBinFilterSection.classList.toggle('active', this.value === 'bin');
        });
    });

    // Update available dates when ticker changes
    tickerSelect.addEventListener('change', function() {
        currentTicker = this.value;
        dateInput.value = '';
        availableDates = [];
        dateInput.disabled = !currentTicker;
        if (currentTicker) {
            fetch(`/api/valid_dates?ticker=${encodeURIComponent(currentTicker)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch dates');
                    return response.json();
                })
                .then(data => {
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
                    availableDates = data.dates;
                    dateInput.min = availableDates[0];
                    dateInput.max = availableDates[availableDates.length - 1];
                })
                .catch(error => {
                    console.error('Error fetching dates:', error);
                    alert('Failed to load dates. Please try again later.');
                });
        }
    });

    // Validate date input
    dateInput.addEventListener('change', function() {
        if (this.value && availableDates.length > 0 && !availableDates.includes(this.value)) {
            alert('Selected date is not available for this ticker. Please choose another date.');
            this.value = '';
        }
    });

    // Handle stock form submission
    stockForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const ticker = tickerSelect.value;
        const date = dateInput.value;
        if (!ticker || !date) {
            alert('Please select a ticker and date.');
            return;
        }
        fetch(`/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch chart data');
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    plotlyChart.innerHTML = '';
                    return;
                }
                const chartData = data.chart_data;
                const trace = {
                    x: chartData.timestamp,
                    open: chartData.open,
                    high: chartData.high,
                    low: chartData.low,
                    close: chartData.close,
                    type: 'candlestick',
                    xaxis: 'x',
                    yaxis: 'y'
                };
                const layout = {
                    title: `${chartData.ticker} 1-Minute Chart - ${chartData.date}`,
                    xaxis: {
                        title: 'Time',
                        type: 'date',
                        tickformat: '%H:%M',
                        rangeslider: { visible: false }
                    },
                    yaxis: { title: 'Price ($)' },
                    showlegend: false
                };
                Plotly.newPlot('plotly-chart', [trace], layout);
            })
            .catch(error => {
                console.error('Error fetching chart data:', error);
                alert('Failed to load chart. Please try again later.');
                plotlyChart.innerHTML = '';
            });
    });

    // Handle gap form submission
    gapForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const gapSize = document.getElementById('gap-size-select').value;
        const day = document.getElementById('day-select').value;
        const gapDirection = document.getElementById('gap-direction-select').value;
        if (!gapSize || !day || !gapDirection) {
            alert('Please select gap size, day, and direction.');
            return;
        }
        fetch(`/api/gaps?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch gap dates');
                return response.json();
            })
            .then(data => {
                gapDatesDiv.innerHTML = '';
                if (data.dates.length === 0) {
                    gapDatesDiv.innerHTML = `<p>${data.message || 'No gaps found for the selected criteria.'}</p>`;
                    return;
                }
                const ul = document.createElement('ul');
                data.dates.forEach(date => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="#" onclick="document.getElementById('ticker-select').value='QQQ';document.getElementById('date').value='${date}';document.getElementById('stock-form').dispatchEvent(new Event('submit'));return false;">${date}</a>`;
                    ul.appendChild(li);
                });
                gapDatesDiv.appendChild(ul);
            })
            .catch(error => {
                console.error('Error fetching gap dates:', error);
                alert('Failed to load gap dates. Please try again later.');
                gapDatesDiv.innerHTML = '<p>Error loading gap dates.</p>';
            });
    });

    // Handle gap insights form submission
    gapInsightsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const gapSize = document.getElementById('gap-insights-size-select').value;
        const day = document.getElementById('gap-insights-day-select').value;
        const gapDirection = document.getElementById('gap-insights-direction-select').value;
        if (!gapSize || !day || !gapDirection) {
            alert('Please select gap size, day, and direction.');
            return;
        }
        fetch(`/api/gap_insights?gap_size=${encodeURIComponent(gapSize)}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch gap insights');
                return response.json();
            })
            .then(data => {
                gapInsightsResults.innerHTML = '';
                if (data.error || Object.keys(data.insights).length === 0) {
                    gapInsightsResults.innerHTML = `<p>${data.message || 'No insights available for the selected criteria.'}</p>`;
                    return;
                }
                const insights = data.insights;
                const ul = document.createElement('ul');
                for (const [key, value] of Object.entries(insights)) {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${value.description}:</strong> Median: ${value.median}, Average: ${value.average}`;
                    ul.appendChild(li);
                }
                gapInsightsResults.appendChild(ul);
            })
            .catch(error => {
                console.error('Error fetching gap insights:', error);
                alert('Failed to load gap insights. Please try again later.');
                gapInsightsResults.innerHTML = '<p>Error loading insights.</p>';
            });
    });

    // Handle events form submission
    eventsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const filterType = document.querySelector('input[name="filter-type"]:checked').value;
        let url = '';
        if (filterType === 'year') {
            const eventType = document.getElementById('event-type-select').value;
            const year = yearSelect.value;
            if (!eventType || !year) {
                alert('Please select an event type and year.');
                return;
            }
            url = `/api/events?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
        } else {
            const eventType = document.getElementById('bin-event-type-select').value;
            const bin = binSelect.value;
            if (!eventType || !bin) {
                alert('Please select an event type and economic impact range.');
                return;
            }
            url = `/api/economic_events?event_type=${encodeURIComponent(eventType)}&bin=${encodeURIComponent(bin)}`;
        }
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch event dates');
                return response.json();
            })
            .then(data => {
                eventDatesDiv.innerHTML = '';
                if (data.dates.length === 0) {
                    eventDatesDiv.innerHTML = `<p>${data.message || 'No events found for the selected criteria.'}</p>`;
                    return;
                }
                const ul = document.createElement('ul');
                data.dates.forEach(date => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="#" onclick="document.getElementById('ticker-select').value='QQQ';document.getElementById('date').value='${date}';document.getElementById('stock-form').dispatchEvent(new Event('submit'));return false;">${date}</a>`;
                    ul.appendChild(li);
                });
                eventDatesDiv.appendChild(ul);
            })
            .catch(error => {
                console.error('Error fetching event dates:', error);
                alert('Failed to load event dates. Please try again later.');
                eventDatesDiv.innerHTML = '<p>Error loading event dates.</p>';
            });
    });

    // Handle earnings form submission
    earningsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const filterType = document.querySelector('input[name="earnings-filter-type"]:checked').value;
        let url = '';
        let ticker = '';
        if (filterType === 'ticker') {
            ticker = earningsTickerSelect.value;
            if (!ticker) {
                alert('Please select a ticker.');
                return;
            }
            url = `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
        } else {
            ticker = earningsBinTickerSelect.value;
            const bin = earningsBinSelect.value;
            if (!ticker || !bin) {
                alert('Please select a ticker and earnings impact range.');
                return;
            }
            url = `/api/earnings?ticker=${encodeURIComponent(ticker)}&bin=${encodeURIComponent(bin)}`;
        }
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch earnings dates');
                return response.json();
            })
            .then(data => {
                earningsDatesDiv.innerHTML = '';
                if (data.dates.length === 0) {
                    earningsDatesDiv.innerHTML = `<p>${data.message || 'No earnings found for the selected criteria.'}</p>`;
                    return;
                }
                const ul = document.createElement('ul');
                data.dates.forEach(date => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="#" onclick="document.getElementById('ticker-select').value='${ticker}';document.getElementById('date').value='${date}';document.getElementById('stock-form').dispatchEvent(new Event('submit'));return false;">${date}</a>`;
                    ul.appendChild(li);
                });
                earningsDatesDiv.appendChild(ul);
            })
            .catch(error => {
                console.error('Error fetching earnings dates:', error);
                alert('Failed to load earnings dates. Please try again later.');
                earningsDatesDiv.innerHTML = '<p>Error loading earnings dates.</p>';
            });
    });
});