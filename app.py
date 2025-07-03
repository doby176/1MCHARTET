import matplotlib
matplotlib.use('Agg')

from flask import Flask, render_template, request, jsonify, session
from flask_limiter import Limiter
from flask_session import Session
import pandas as pd
import mplfinance as mpf
import io
import base64
import logging
import sqlite3
import os
import uuid
from werkzeug.exceptions import TooManyRequests

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)

# Configure Flask-Session
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(__file__), 'sessions')
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key')
Session(app)

# Ensure session directory exists
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

# Custom key function for Flask-Limiter
def get_session_key():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        logging.debug(f"New session created with ID: {session['user_id']}")
    return session['user_id']

# Configure Flask-Limiter with new rate limit
limiter = Limiter(
    get_session_key,
    app=app,
    default_limits=["10 per 12 hours"],  # Updated to 10 requests per 12 hours
    storage_uri="memory://",
    headers_enabled=True
)

# Custom error handler for rate limit exceeded
@app.errorhandler(429)
def ratelimit_handler(e):
    logging.info(f"Rate limit exceeded for session: {session.get('user_id')}")
    return jsonify({
        'error': 'Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait and try again later.'
    }), 429

TICKERS = ['QQQ', 'AAPL', 'MSFT', 'TSLA', 'ORCL', 'NVDA', 'MSTR', 'UBER', 'PLTR', 'META']
DB_DIR = os.path.join(os.path.dirname(__file__), "data", "db")
GAP_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "qqq_central_data_updated.csv")
EVENTS_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "news_events.csv")
EARNINGS_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "earnings_data.csv")

VALID_TICKERS = []

def get_db_path(ticker):
    if ticker not in TICKERS:
        logging.error(f"Invalid ticker requested: {ticker}")
        return None
    db_path = os.path.join(DB_DIR, f"stock_data_{ticker.lower()}.db")
    logging.debug(f"Checking database path for {ticker}: {db_path}")
    return db_path

def initialize_tickers():
    global VALID_TICKERS
    VALID_TICKERS = []
    logging.debug("Initializing ticker list")
    for ticker in TICKERS:
        db_path = get_db_path(ticker)
        if db_path and os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT DISTINCT ticker FROM candles")
                db_tickers = [row[0] for row in cursor.fetchall()]
                if db_tickers:
                    VALID_TICKERS.append(ticker)
                conn.close()
                logging.debug(f"Validated ticker: {ticker}")
            except Exception as e:
                logging.warning(f"Could not access database for {ticker}: {str(e)}")
        else:
            logging.warning(f"Database file not found for {ticker}: {db_path}")
    if not VALID_TICKERS:
        logging.warning("No valid ticker databases found, falling back to static list")
        VALID_TICKERS = TICKERS
    VALID_TICKERS = sorted(VALID_TICKERS)
    logging.debug(f"Initialized tickers: {VALID_TICKERS}")

with app.app_context():
    initialize_tickers()

@app.route('/')
@limiter.limit("10 per 12 hours")
def index():
    logging.debug("Rendering index.html")
    return render_template('index.html')

@app.route('/api/tickers', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_tickers():
    logging.debug("Returning precomputed tickers")
    return jsonify({'tickers': VALID_TICKERS})

@app.route('/api/valid_dates', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_valid_dates():
    ticker = request.args.get('ticker')
    logging.debug(f"Fetching valid dates for ticker: {ticker}")
    if not ticker or ticker not in TICKERS:
        logging.error(f"Invalid ticker requested: {ticker}")
        return jsonify({'error': 'Missing or invalid ticker'}), 400
    db_path = get_db_path(ticker)
    if not db_path or not os.path.exists(db_path):
        logging.error(f"No database available for {ticker}: {db_path}")
        return jsonify({'error': f'No database available for {ticker}'}), 404
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT DATE(timestamp) AS date FROM candles WHERE ticker = ?", (ticker,))
        dates = [row[0] for row in cursor.fetchall()]
        conn.close()
        logging.debug(f"Found {len(dates)} dates for {ticker}")
        if not dates:
            logging.warning(f"No dates available for {ticker}")
            return jsonify({'error': f'No dates available for {ticker}'}), 404
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error fetching dates for {ticker}: {str(e)}")
        return jsonify({'error': f'Failed to fetch dates for {ticker}'}), 500

@app.route('/api/stock/chart', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_chart():
    try:
        ticker = request.args.get('ticker')
        date = request.args.get('date')
        logging.debug(f"Processing chart request for ticker={ticker}, date={date}")
        if not ticker or not date:
            return jsonify({'error': 'Missing ticker or date'}), 400
        if ticker not in TICKERS:
            return jsonify({'error': 'Invalid ticker'}), 400
        try:
            target_date = pd.to_datetime(date).date()
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
        db_path = get_db_path(ticker)
        if not db_path or not os.path.exists(db_path):
            return jsonify({'error': f'No database available for {ticker}'}), 404
        try:
            conn = sqlite3.connect(db_path)
            query = """
                SELECT timestamp, open, high, low, close, volume
                FROM candles
                WHERE ticker = ? AND DATE(timestamp) = ?
            """
            df = pd.read_sql_query(query, conn, params=(ticker, str(target_date)), parse_dates=['timestamp'])
            conn.close()
            logging.debug(f"Loaded data shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error querying database for {ticker}: {str(e)}")
            return jsonify({'error': 'Database query failed'}), 500
        if df.empty:
            return jsonify({'error': 'No data available for the selected date. Try another date.'}), 404
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'error': 'Invalid data format'}), 400
        df = df[required_columns].set_index('timestamp').sort_index()
        buf = io.BytesIO()
        try:
            mpf.plot(
                df,
                type='candle',
                style='yahoo',
                title=f'{ticker} Candlestick Chart - {date}',
                ylabel='Price',
                volume=True,
                savefig=dict(fname=buf, dpi=100, bbox_inches='tight'),
                warn_too_much_data=10000
            )
            buf.seek(0)
            img = base64.b64encode(buf.getvalue()).decode('utf-8')
            buf.close()
        except Exception as e:
            logging.error(f"Error generating chart for {ticker}: {str(e)}")
            return jsonify({'error': 'Failed to generate chart'}), 500
        return jsonify({'chart': f'data:image/png;base64,{img}'})
    except Exception as e:
        logging.error(f"Unexpected error in get_chart: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/gaps', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_gaps():
    try:
        gap_size = request.args.get('gap_size')
        day = request.args.get('day')
        gap_direction = request.args.get('gap_direction')
        logging.debug(f"Fetching gaps for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        logging.debug(f"Checking data directory: {data_dir}")
        if os.path.exists(data_dir):
            logging.debug(f"Directory contents: {os.listdir(data_dir)}")
        else:
            logging.error(f"Data directory not found: {data_dir}")
            return jsonify({'error': 'Gap data directory not found. Please contact support.'}), 404
        csv_file = None
        for f in os.listdir(data_dir):
            if f.lower() == 'qqq_central_data_updated.csv':
                csv_file = os.path.join(data_dir, f)
                logging.debug(f"Found CSV file: {csv_file}")
                break
        if not csv_file or not os.path.exists(csv_file):
            logging.error(f"Gap data file not found in directory: {data_dir}")
            return jsonify({'error': 'Gap data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(csv_file)
            logging.debug(f"Loaded gap data with shape: {df.shape}")
            logging.debug(f"Unique gap_size_bin values: {df['gap_size_bin'].unique().tolist()}")
            logging.debug(f"Unique day_of_week values: {df['day_of_week'].unique().tolist()}")
            logging.debug(f"Unique gap_direction values: {df['gap_direction'].unique().tolist()}")
        except Exception as e:
            logging.error(f"Error reading gap data file {csv_file}: {str(e)}")
            return jsonify({'error': f'Failed to load gap data: {str(e)}'}), 500
        if 'date' not in df.columns or 'gap_size_bin' not in df.columns or 'day_of_week' not in df.columns or 'gap_direction' not in df.columns:
            logging.error("Invalid gap data format: missing required columns")
            return jsonify({'error': 'Invalid gap data format'}), 400
        filtered_df = df[
            (df['gap_size_bin'] == gap_size) &
            (df['day_of_week'] == day) &
            (df['gap_direction'] == gap_direction)
        ]
        dates = filtered_df['date'].tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No gaps found for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
            return jsonify({'dates': [], 'message': 'No gaps found for the selected criteria'})
        logging.debug(f"Found {len(dates)} gap dates for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing gaps: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/gap_insights', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_gap_insights():
    try:
        gap_size = request.args.get('gap_size')
        day = request.args.get('day')
        gap_direction = request.args.get('gap_direction')
        logging.debug(f"Fetching gap insights for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
        if not os.path.exists(GAP_DATA_PATH):
            logging.error(f"Gap data file not found: {GAP_DATA_PATH}")
            return jsonify({'error': 'Gap data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(GAP_DATA_PATH)
            logging.debug(f"Loaded gap data with shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error reading gap data file {GAP_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load gap data: {str(e)}'}), 500
        required_columns = ['gap_size_bin', 'day_of_week', 'gap_direction', 'filled', 
                          'move_before_reversal_fill_direction_pct', 'max_move_gap_direction_first_30min_pct']
        if not all(col in df.columns for col in required_columns):
            logging.error("Invalid gap data format: missing required columns")
            return jsonify({'error': 'Invalid gap data format'}), 400
        filtered_df = df[
            (df['gap_size_bin'] == gap_size) &
            (df['day_of_week'] == day) &
            (df['gap_direction'] == gap_direction)
        ]
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if filtered_df.empty:
            logging.debug(f"No data found for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
            return jsonify({'insights': {}, 'message': 'No data found for the selected criteria'})
        gap_fill_rate = filtered_df['filled'].mean() * 100
        filled_df = filtered_df[filtered_df['filled'] == True]
        unfilled_df = filtered_df[filtered_df['filled'] == False]
        insights = {
            'gap_fill_rate': {
                'median': round(gap_fill_rate, 2),
                'average': round(gap_fill_rate, 2),
                'description': '% of time the price closes the gap'
            },
            'median_move_before_fill': {
                'median': round(filled_df['move_before_reversal_fill_direction_pct'].median(), 2) if not filled_df.empty else 0,
                'average': round(filled_df['move_before_reversal_fill_direction_pct'].mean(), 2) if not filled_df.empty else 0,
                'description': 'Average % move before the price fills the gap'
            },
            'median_max_move_unfilled': {
                'median': round(unfilled_df['max_move_gap_direction_first_30min_pct'].median(), 2) if not unfilled_df.empty else 0,
                'average': round(unfilled_df['max_move_gap_direction_first_30min_pct'].mean(), 2) if not unfilled_df.empty else 0,
                'description': '% move in gap direction in first 30 minutes when the price does not close the gap'
            },
            'sample_size': len(filtered_df)
        }
        logging.debug(f"Computed insights: {insights}")
        return jsonify({'insights': insights})
    except Exception as e:
        logging.error(f"Error processing gap insights: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/years', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_years():
    try:
        logging.debug("Fetching unique years from news_events.csv")
        if not os.path.exists(EVENTS_DATA_PATH):
            logging.error(f"Events data file not found: {EVENTS_DATA_PATH}")
            return jsonify({'error': 'Events data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(EVENTS_DATA_PATH)
            logging.debug(f"Loaded events data with shape: {df.shape}")
            if 'date' not in df.columns:
                logging.error("Invalid events data format: missing 'date' column")
                return jsonify({'error': 'Invalid events data format'}), 400
            df['date'] = pd.to_datetime(df['date'])
            years = sorted(df['date'].dt.year.unique().tolist())
            logging.debug(f"Found years: {years}")
            return jsonify({'years': years})
        except Exception as e:
            logging.error(f"Error reading events data file {EVENTS_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load events data: {str(e)}'}), 500
    except Exception as e:
        logging.error(f"Error fetching years: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/events', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_events():
    try:
        event_type = request.args.get('event_type')
        year = request.args.get('year')
        logging.debug(f"Fetching events for event_type={event_type}, year={year}")
        if not os.path.exists(EVENTS_DATA_PATH):
            logging.error(f"Events data file not found: {EVENTS_DATA_PATH}")
            return jsonify({'error': 'Events data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(EVENTS_DATA_PATH)
            logging.debug(f"Loaded events data with shape: {df.shape}")
            logging.debug(f"Unique event_type values: {df['event_type'].unique().tolist()}")
        except Exception as e:
            logging.error(f"Error reading events data file {EVENTS_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load events data: {str(e)}'}), 500
        if 'date' not in df.columns or 'event_type' not in df.columns:
            logging.error("Invalid events data format: missing required columns")
            return jsonify({'error': 'Invalid events data format'}), 400
        df['date'] = pd.to_datetime(df['date'])
        filtered_df = df
        if event_type:
            filtered_df = filtered_df[filtered_df['event_type'] == event_type]
        if year:
            try:
                year = int(year)
                filtered_df = filtered_df[filtered_df['date'].dt.year == year]
            except ValueError:
                logging.error(f"Invalid year format: {year}")
                return jsonify({'error': 'Invalid year format'}), 400
        dates = filtered_df['date'].dt.strftime('%Y-%m-%d').tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No events found for event_type={event_type}, year={year}")
            return jsonify({'dates': [], 'message': 'No events found for the selected criteria'})
        logging.debug(f"Found {len(dates)} event dates for event_type={event_type}, year={year}")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing events: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/earnings', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_earnings():
    try:
        ticker = request.args.get('ticker')
        logging.debug(f"Fetching earnings for ticker={ticker}")
        if not os.path.exists(EARNINGS_DATA_PATH):
            logging.error(f"Earnings data file not found: {EARNINGS_DATA_PATH}")
            return jsonify({'error': 'Earnings data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(EARNINGS_DATA_PATH)
            df['earnings_date'] = pd.to_datetime(df['earnings_date'])
            logging.debug(f"Loaded earnings data with shape: {df.shape}")
            logging.debug(f"Unique tickers: {df['ticker'].unique().tolist()}")
        except Exception as e:
            logging.error(f"Error reading earnings data file {EARNINGS_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load earnings data: {str(e)}'}), 500
        if 'ticker' not in df.columns or 'earnings_date' not in df.columns:
            logging.error("Invalid earnings data format: missing required columns")
            return jsonify({'error': 'Invalid earnings data format'}), 400
        if ticker:
            filtered_df = df[df['ticker'] == ticker]
        else:
            logging.error("No ticker provided for earnings query")
            return jsonify({'error': 'Ticker is required'}), 400
        dates = filtered_df['earnings_date'].dt.strftime('%Y-%m-%d').tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No earnings found for ticker={ticker}")
            return jsonify({'dates': [], 'message': f'No earnings found for {ticker}'})
        logging.debug(f"Found {len(dates)} earnings dates for ticker={ticker}")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing earnings: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    logging.debug(f"Matplotlib backend: {matplotlib.get_backend()}")
    app.run(debug=True)