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
        console.log('Fetching tickers from /api/tickers');
        const response = await fetch('/api/tickers');
        if (response.status === 429) {
            const data = await response.json();
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
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
        console.log('Fetching earnings tickers from /api/tickers');
        const response = await fetch('/api/tickers');
        if (response.status === 429) {
            const data = await response.json();
            tickerSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
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
        const url = `/api/valid_dates?ticker=${encodeURIComponent(ticker)}`;
        console.log('Fetching URL:', url);
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
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
    const form = document.getElementById('stock-form');
    const button = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('select, input');

    // Check rate limit state
    const rateLimitResetTime = localStorage.getItem('chartRateLimitReset');
    if (rateLimitResetTime && Date.now() < parseInt(rateLimitResetTime)) {
        chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
        button.disabled = true;
        button.textContent = 'Rate Limit Exceeded';
        inputs.forEach(input => input.disabled = true);
        return;
    }

    if (!ticker || !date) {
        chartContainer.innerHTML = '<p>Please select a ticker and date.</p>';
        return;
    }
    console.log(`Loading chart for ticker=${ticker}, date=${date}`);
    const url = `/api/stock/chart?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`;
    console.log('Fetching URL:', url);
    chartContainer.innerHTML = '<p>Loading chart...</p>';
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
            chartContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            inputs.forEach(input => input.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('chartRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Generate Chart';
                inputs.forEach(input => input.disabled = false);
                localStorage.removeItem('chartRateLimitReset');
                chartContainer.innerHTML = '<p>Please select a ticker and date to generate a chart.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
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
        chartContainer.innerHTML = '<p>Failed to load chart. Please try again later.</p>';
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
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
            gapDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('gapDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Gaps';
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
        gapDatesContainer.innerHTML = '<p>Failed to load gap dates. Please try again later.</p>';
    }
}

async function loadYears() {
    const yearSelect = document.getElementById('year-select');
    yearSelect.disabled = true;
    yearSelect.innerHTML = '<option value="">Loading years...</option>';
    try {
        console.log('Fetching years from /api/years');
        const response = await fetch('/api/years');
        if (response.status === 429) {
            const data = await response.json();
            yearSelect.innerHTML = `<option value="">${data.error}</option>`;
            alert(data.error);
            return;
        }
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

    if (!eventType || !year) {
        eventDatesContainer.innerHTML = '<p>Please select an event type and year.</p>';
        return;
    }
    console.log(`Fetching events for event_type=${eventType}, year=${year}`);
    const url = `/api/events?event_type=${encodeURIComponent(eventType)}&year=${encodeURIComponent(year)}`;
    console.log('Fetching URL:', url);
    eventDatesContainer.innerHTML = '<p>Loading event dates...</p>';
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            const data = await response.json();
            eventDatesContainer.innerHTML = `<p style="color: red; font-weight: bold;">${data.error}</p>`;
            button.disabled = true;
            button.textContent = 'Rate Limit Exceeded';
            selects.forEach(select => select.disabled = true);
            const resetTime = Date.now() + 12 * 60 * 60 * 1000;
            localStorage.setItem('eventDatesRateLimitReset', resetTime);
            setTimeout(() => {
                button.disabled = false;
                button.textContent = 'Find Events';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('eventDatesRateLimitReset');
                eventDatesContainer.innerHTML = '<p>Please select an event type and year to view event dates.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
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
        eventDatesContainer.innerHTML = '<p>Failed to load event dates. Please try again later.</p>';
    }
}

async function loadEarningsDates(event) {
    event.preventDefault();
    const ticker = document.getElementById('earnings-ticker-select').value;
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

    if (!ticker) {
        earningsDatesContainer.innerHTML = '<p>Please select a ticker.</p>';
        return;
    }
    console.log(`Fetching earnings for ticker=${ticker}`);
    const url = `/api/earnings?ticker=${encodeURIComponent(ticker)}`;
    console.log('Fetching URL:', url);
    earningsDatesContainer.innerHTML = '<p>Loading earnings dates...</p>';
    try {
        const response = await fetch(url);
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
                button.textContent = 'Find Earnings';
                selects.forEach(select => select.disabled = false);
                localStorage.removeItem('earningsDatesRateLimitReset');
                earningsDatesContainer.innerHTML = '<p>Please select a ticker to view earnings dates.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Earnings API response:', JSON.stringify(data, null, 2));
        if (data.error) {
            console.error('Error from earnings API:', data.error);
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
        earningsDatesContainer.innerHTML = '<p>Failed to load earnings dates. Please try again later.</p>';
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
        insightsContainer.innerHTML = `<p style="color: red; font-weight: bold;">Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait until ${new Date(parseInt(rateLimitResetTime)).toLocaleTimeString()} to try again.</p>`;
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
        const response = await fetch(url);
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
                insightsContainer.innerHTML = '<p>Select a gap size, day, and direction to view QQQ gap insights and statistics.</p>';
            }, 12 * 60 * 60 * 1000);
            alert(data.error);
            return;
        }
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
        insightsDiv.className = 'insights-container';
        insightsDiv.innerHTML = `
            <h3>Gap Statistics</h3>
            <div class="insights-row">
                <div class="insight-metric">
                    <div class="metric-name">Gap Fill Rate</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.gap_fill_rate.median}%</div>
                    <div class="metric-description">Percentage of gaps that close</div>
                </div>
                <div class="insight-metric">
                    <div class="metric-name">Median Move In Gap Direction Before Fill</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_move_before_fill.median}%</div>
                    <div class="metric-average">Average: ${data.insights.median_move_before_fill.average}%</div>
                    <div class="metric-description">Percentage move before gap closes</div>
                </div>
                <div class="insight-metric">
                    <div class="metric-name">Median Max Move Unfilled Gaps</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_max_move_unfilled.median}%</div>
                    <div class="metric-average">Average: ${data.insights.median_max_move_unfilled.average}%</div>
                    <div class="metric-description">% move in gap direction when price does not close the gap</div>
                </div>
                <div class="insight-metric">
                    <div class="metric-name">Median Time to Fill Gap</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_time_to_fill.median} min</div>
                    <div class="metric-average">Average: ${data.insights.median_time_to_fill.average} min</div>
                    <div class="metric-description">Median time in minutes to fill gap</div>
                </div>
            </div>
            <div class="insights-row two-metrics">
                <div class="insight-metric">
                    <div class="metric-name">Median Time of Low of Day</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_time_of_low.median}</div>
                    <div class="metric-average">Average: ${data.insights.median_time_of_low.average}</div>
                    <div class="metric-description">Median time of the day’s low</div>
                </div>
                <div class="insight-metric">
                    <div class="metric-name">Median Time of High of Day</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_time_of_high.median}</div>
                    <div class="metric-average">Average: ${data.insights.median_time_of_high.average}</div>
                    <div class="metric-description">Median time of the day’s high</div>
                </div>
            </div>
            <div class="insights-row two-metrics">
                <div class="insight-metric">
                    <div class="metric-name">Reversal After Fill Back To Low/High Of Day</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.reversal_after_fill_rate.median}%</div>
                    <div class="metric-description">% of time price reverses after gap is filled</div>
                </div>
                <div class="insight-metric">
                    <div class="metric-name">Median Move In Gap Fill Direction Before Reversal</div>
                    <div class="metric-median tooltip" title="${medianExplanation}">${data.insights.median_move_before_reversal.median}%</div>
                    <div class="metric-average">Average: ${data.insights.median_move_before_reversal.average}%</div>
                    <div class="metric-description">Median move in gap fill direction before reversal</div>
                </div>
            </div>
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
        insightsContainer.innerHTML = '<p>Failed to load gap insights. Please try again later.</p>';
    }
}