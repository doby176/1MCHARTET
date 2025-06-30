import matplotlib
matplotlib.use('Agg')  # Set non-interactive backend for server-side rendering

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

# Set up logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)

# Set up rate limiter (disabled for testing)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Static ticker list
TICKERS = ['QQQ', 'AAPL', 'MSFT', 'TSLA', 'ORCL', 'NVDA', 'MSTR', 'UBER', 'PLTR', 'META']
DB_DIR = "data/db"  # Directory containing database files

# Global variable to store valid tickers
VALID_TICKERS = []

def get_db_path(ticker):
    """Return the database path for a given ticker."""
    if ticker not in TICKERS:
        return None
    return os.path.join(DB_DIR, f"stock_data_{ticker.lower()}.db")

def initialize_tickers():
    """Scan database directory and initialize valid tickers."""
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
    if not VALID_TICKERS:
        logging.warning("No valid ticker databases found, falling back to static list")
        VALID_TICKERS = TICKERS  # Fallback to static list
    VALID_TICKERS = sorted(VALID_TICKERS)
    logging.debug(f"Initialized tickers: {VALID_TICKERS}")

# Run at app startup
with app.app_context():
    initialize_tickers()

@app.route('/')
def index():
    """Render the main index page."""
    logging.debug("Rendering index.html")
    return render_template('index.html')

@app.route('/api/tickers', methods=['GET'])
def get_tickers():
    """Return the precomputed list of available tickers."""
    logging.debug("Returning precomputed tickers")
    return jsonify({'tickers': VALID_TICKERS})

@app.route('/api/valid_dates', methods=['GET'])
def get_valid_dates():
    """Return the list of valid dates for a given ticker."""
    ticker = request.args.get('ticker')
    logging.debug(f"Fetching valid dates for ticker: {ticker}")
    if not ticker or ticker not in TICKERS:
        return jsonify({'error': 'Missing or invalid ticker'}), 400
    db_path = get_db_path(ticker)
    if not db_path or not os.path.exists(db_path):
        return jsonify({'error': f'No database available for {ticker}'}), 404
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT DATE(timestamp) AS date FROM candles WHERE ticker = ?", (ticker,))
        dates = [row[0] for row in cursor.fetchall()]
        conn.close()
        if not dates:
            return jsonify({'error': f'No dates available for {ticker}'}), 404
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error fetching dates for {ticker}: {str(e)}")
        return jsonify({'error': f'Failed to fetch dates for {ticker}'}), 500

@app.route('/api/stock/chart', methods=['GET'])
def get_chart():
    """Generate and return a candlestick chart for the specified ticker and date."""
    try:
        ticker = request.args.get('ticker')
        date = request.args.get('date')
        logging.debug(f"Processing chart request for ticker={ticker}, date={date}, raw query: {request.args}")
        logging.debug(f"Request URL: {request.url}")

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

        # Query database
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
            return jsonify({'error': 'No data available for the selected date'}), 404

        # Ensure required columns
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'error': 'Invalid data format'}), 400

        # Set timestamp as index and sort
        df = df[required_columns].set_index('timestamp').sort_index()

        # Generate chart
        buf = io.BytesIO()
        try:
            mpf.plot(
                df,
                type='candle',
                style='yahoo',
                title=f'{ticker} Candlestick Chart - {date}',
                ylabel='Price',
                volume=True,
                savefig=dict(fname=buf, dpi=150, bbox_inches='tight'),
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

if __name__ == '__main__':
    logging.debug(f"Matplotlib backend: {matplotlib.get_backend()}")
    app.run(debug=True)