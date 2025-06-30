import matplotlib
matplotlib.use('Agg')

from flask import Flask, render_template, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import pandas as pd
import mplfinance as mpf
import io
import base64
import logging
import sqlite3
import os

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["5 per hour"],
    storage_uri="memory://",
    headers_enabled=True,
    on_breach=lambda request_limit: jsonify({
        'error': 'Rate limit exceeded: 5 requests per hour allowed. Please wait and try again.'
    }, 429)
)

TICKERS = ['QQQ', 'AAPL', 'MSFT', 'TSLA', 'ORCL', 'NVDA', 'MSTR', 'UBER', 'PLTR', 'META']
DB_DIR = "data/db"
GAP_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "qqq_central_data_updated.csv")

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
@limiter.limit("5 per hour")
def index():
    logging.debug("Rendering index.html")
    return render_template('index.html')

@app.route('/api/tickers', methods=['GET'])
@limiter.limit("5 per hour")
def get_tickers():
    logging.debug("Returning precomputed tickers")
    return jsonify({'tickers': VALID_TICKERS})

@app.route('/api/valid_dates', methods=['GET'])
@limiter.limit("5 per hour")
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
@limiter.limit("5 per hour")
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
        logging.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/gaps', methods=['GET'])
@limiter.limit("5 per hour")
def get_gaps():
    try:
        gap_size = request.args.get('gap_size')
        day = request.args.get('day')
        logging.debug(f"Fetching gaps for gap_size={gap_size}, day={day}")
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
        except Exception as e:
            logging.error(f"Error reading gap data file {csv_file}: {str(e)}")
            return jsonify({'error': f'Failed to load gap data: {str(e)}'}), 500
        if 'date' not in df.columns or 'gap_size_bin' not in df.columns or 'day_of_week' not in df.columns:
            logging.error("Invalid gap data format: missing required columns")
            return jsonify({'error': 'Invalid gap data format'}), 400
        filtered_df = df[(df['gap_size_bin'] == gap_size) & (df['day_of_week'] == day)]
        dates = filtered_df['date'].tolist()
        if not dates:
            logging.debug(f"No gaps found for gap_size={gap_size}, day={day}")
            return jsonify({'dates': [], 'message': 'No gaps found for the selected criteria'})
        logging.debug(f"Found {len(dates)} gap dates for gap_size={gap_size}, day={day}")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing gaps: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    logging.debug(f"Matplotlib backend: {matplotlib.get_backend()}")
    app.run(debug=True)