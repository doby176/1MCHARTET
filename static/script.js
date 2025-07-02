document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing app...');
    loadTickers();
    loadYears();
    loadEarningsTickers();
    document.getElementById('stock-form').addEventListener('submit', loadChart);
    document.getElementById('gap-form').addEventListener('submit', loadGapDates);
    document.getElementById('events-form').addEventListener('submit', loadEventDates);
    document.getElementById('earnings-form').addEventListener('submit', loadEarningsDates);
    document.getElementById('gap-insights-form').addEventListener('submit', loadGapInsights);
});

async function loadTickers() {
    const tickerSelect = document.getElementById('ticker-select');
    tickerSelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        const response = await fetch('/api/tickers');
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
    tickerSelect.disabled = true;
    tickerSelect.innerHTML = '<option value="">Loading tickers...</option>';
    try {
        const response = await fetch('/api/tickers');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Fetched tickers for earnings:', data.tickers);
        tickerSelect.innerHTML = '<option value="">Select a ticker</option>';
        data.tickers.forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.textContent = ticker;
            tickerSelect.appendChild(option);
        });
        tickerSelect.disabled = false;
    } catch (error) {
        console.error('Error loading earnings tickers:', error);
        tickerSelect.innerHTML = '<option value="">Error loading tickers</option>';
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
        const response = await fetch(`/api/valid_dates?ticker=${encodeURIComponent(ticker)}`);
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
    const chartContainer = document.getElementById('chart-container');
    if (!ticker || !date) {
        alert('Please select a ticker and date.');
        return;
    }
    console.log(`Loading chart for ticker=${ticker}, date=${date}`);
    chartContainer.innerHTML = '<p>Loading chart...</p>';
    try {
        const response = await fetch(`/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            console.error('Chart error:', data.error);
            chartContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        chartContainer.innerHTML = `<img src="${data.chart}" alt="Stock Chart for ${ticker} on ${date}">`;
    } catch (error) {
        console.error('Error loading chart:', error);
        chartContainer.innerHTML = '<p>Failed to load chart. Please try again.</p>';
    }
}

async function loadGapDates(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-size-select').value;
    const day = document.getElementById('day-select').value;
    const gapDirection = document.getElementById('gap-direction-select').value;
    const gapDatesContainer = document.getElementById('gap-dates');
    if (!gapSize || !day || !gapDirection) {
        alert('Please select a gap size, day of the week, and gap direction.');
        return;
    }
    console.log(`Fetching gaps for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    gapDatesContainer.innerHTML = '<p>Loading gap dates...</p>';
    try {
        const encodedGapSize = encodeURIComponent(gapSize);
        console.log(`Encoded gap_size: ${encodedGapSize}`);
        const response = await fetch(`/api/gaps?gap_size=${encodedGapSize}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`);
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
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates. Please try again.</p>';
    }
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    try {
        const response = await fetch('/api/years');
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
    const eventType = document.getElementById('event-type-select').value;
    const year = document.getElementById('year-select').value;
    const eventDatesContainer = document.getElementById('event-dates');
    if (!eventType || !year) {
        alert('Please select an event type and year.');
        return;
    }
    console.log(`Fetching events for event_type=${eventType}, year=${year}`);
    eventDatesContainer.innerHTML = '<p>Loading event dates...</p>';
    try {
        const response = await fetch(`/api/events?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
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
                    'event_category': 'Events Analysis',
                    'event_label': `QQQ_${date}_${eventType}`
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
        eventDatesContainer.innerHTML = '<p>Failed to load event dates. Please try again.</p>';
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const ticker = document.getElementById('earnings-ticker-select').value;
    const earningsDatesContainer = document.getElementById('earnings-dates');
    if (!ticker) {
        alert('Please select a ticker.');
        return;
    }
    console.log(`Fetching earnings for ticker=${ticker}`);
    earningsDatesContainer.innerHTML = '<p>Loading earnings dates...</p>';
    try {
        const response = await fetch(`/api/earnings?ticker=${encodeURIComponent(ticker)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Earnings API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from earnings APIaline:', data.error);
            earningsDatesContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        if (!data.dates || data.dates.length === 0) {
            console.log('No earnings dates found:', data.message || 'No dates returned');
            earningsDatesContainer.innerHTML = `<p>${data.message || 'No earnings found for the selected ticker'}</p>`;
            return;
        }
        console.log(`Rendering ${data.dates.length} earnings dates:`, data.dates);
        const ul = document.createElement('ul');
        data.dates.forEach(date => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = date;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                console.log(`Clicked earnings date: ${date}`);
                document.getElementById('ticker-select').value = ticker;
                document.getElementById('date').value = date;
                loadChart(new Event('submit'));
                gtag('event', 'earnings_date_click', {
                    'event_category': 'Earnings Analysis',
                    'event_label': `${ticker}_${date}`
                });
            });
            li.appendChild(link);
            ul.appendChild(li);
        });
        earningsDatesContainer.innerHTML = '';
        earningsDatesContainer.appendChild(ul);
        console.log('Earnings dates rendered successfully');
    } catch (error) {
        console.error('Error loading earnings dates:', error);
        earningsDatesContainer.innerHTML = '<p>Failed to load earnings dates. Please try again.</p>';
    }
}

async function loadGapInsights(event) {
    event.preventDefault();
    const gapSize = document.getElementById('gap-insights-size-select').value;
    const day = document.getElementById('gap-insights-day-select').value;
    const gapDirection = document.getElementById('gap-insights-direction-select').value;
    const insightsContainer = document.getElementById('gap-insights-results');
    
    if (!gapSize || !day || !gapDirection) {
        alert('Please select a gap size, day of the week, and gap direction.');
        return;
    }
    
    console.log(`Fetching gap insights for gap_size=${gapSize}, day=${day}, gap_direction=${gapDirection}`);
    insightsContainer.innerHTML = '<p>Loading gap insights...</p>';
    
    try {
        const encodedGapSize = encodeURIComponent(gapSize);
        const response = await fetch(`/api/gap_insights?gap_size=${encodedGapSize}&day=${encodeURIComponent(day)}&gap_direction=${encodeURIComponent(gapDirection)}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
        }
        const data = await response.json();
        console.log('Gap Insights API response:', JSON.stringify(data, null, 2));
        
        if (data.error) {
            console.error('Error from gap insights API:', data.error);
            insightsContainer.innerHTML = `<p>${data.error}</p>`;
            return;
        }
        
        if (!data.insights || Object.keys(data.insights).length === 0) {
            console.log('No insights found:', data.message || 'No data returned');
            insightsContainer.innerHTML = `<p>${data.message || 'No insights found for the selected criteria'}</p>`;
            return;
        }
        
        console.log(`Rendering gap insights:`, data.insights);
        const medianExplanation = "The median is used instead of the average because it is less affected by extreme values, providing a more robust measure of typical price behavior.";
        const insightsDiv = document.createElement('div');
        insightsDiv.innerHTML = `
            <h3>Gap Statistics</h3>
            <p><strong>Gap Fill Rate:</strong> <span title="${medianExplanation}">Median</span>: ${data.insights.gap_fill_rate.median}% (Average: ${data.insights.gap_fill_rate.average}%) - ${data.insights.gap_fill_rate.description}</p>
            <p><strong><span title="${medianExplanation}">Median</span> Move In Gap Direction Before Fill:</strong> <span title="${medianExplanation}">Median</span>: ${data.insights.median_move_before_fill.median}% (Average: ${data.insights.median_move_before_fill.average}%) - ${data.insights.median_move_before_fill.description}</p>
            <p><strong><span title="${medianExplanation}">Median</span> Max Move Unfilled Gaps:</strong> <span title="${medianExplanation}">Median</span>: ${data.insights.median_max_move_unfilled.median}% (Average: ${data.insights.median_max_move_unfilled.average}%) - ${data.insights.median_max_move_unfilled.description}</p>
        `;
        insightsContainer.innerHTML = '';
        insightsContainer.appendChild(insightsDiv);
        
        gtag('event', 'gap_insights_view', {
            'event_category': 'Gap Insights',
            'event_label': `QQQ_${gapSize}_${day}_${gapDirection}`
        });
        
        console.log('Gap insights rendered successfully');
    } catch (error) {
        console.error('Error loading gap insights:', error);
        insightsContainer.innerHTML = '<p>Failed to load gap insights. Please try again.</p>';
    }
}