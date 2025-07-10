import sqlite3
import pandas as pd
from flask import Flask, jsonify, render_template
import logging
import os

app = Flask(__name__)
logging.basicConfig(level=logging.DEBUG)

# Path to SQLite database
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, 'stock_data_test.db')

# Initialize database (for testing, create a sample database)
def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS candles (
            timestamp TEXT,
            ticker TEXT,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER
        )
    ''')
    # Insert sample data (1-minute candles for QQQ on 2025-07-10)
    sample_data = [
        ('2025-07-10 09:30:00', 'QQQ', 400.0, 401.0, 399.5, 400.5, 1000),
        ('2025-07-10 09:31:00', 'QQQ', 400.5, 401.5, 400.0, 401.0, 1200),
        ('2025-07-10 09:32:00', 'QQQ', 401.0, 401.8, 400.5, 401.5, 1100),
        ('2025-07-10 09:33:00', 'QQQ', 401.5, 402.0, 401.0, 401.8, 1300),
        ('2025-07-10 09:34:00', 'QQQ', 401.8, 402.5, 401.5, 402.0, 1400),
        # Add more data as needed for testing
    ]
    cursor.executemany('INSERT INTO candles VALUES (?, ?, ?, ?, ?, ?, ?)', sample_data)
    conn.commit()
    conn.close()
    logging.info("Database initialized with sample data")

# Initialize database
init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chart', methods=['GET'])
def get_chart():
    ticker = 'QQQ'
    date = '2025-07-10'  # Fixed for testing
    try:
        conn = sqlite3.connect(DB_PATH)
        query = """
            SELECT timestamp, open, high, low, close, volume
            FROM candles
            WHERE ticker = ? AND DATE(timestamp) = ?
            ORDER BY timestamp
        """
        df = pd.read_sql_query(query, conn, params=(ticker, date), parse_dates=['timestamp'])
        conn.close()
        if df.empty:
            return jsonify({'error': 'No data available'}), 404
        df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
        chart_data = {
            'timestamp': df['timestamp'].tolist(),
            'open': df['open'].tolist(),
            'high': df['high'].tolist(),
            'low': df['low'].tolist(),
            'close': df['close'].tolist(),
            'volume': df['volume'].tolist(),
            'ticker': ticker,
            'date': date,
            'count': len(df)
        }
        return jsonify({'chart_data': chart_data})
    except Exception as e:
        logging.error(f"Error fetching chart data: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    app.run(debug=True)