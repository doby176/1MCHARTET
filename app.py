import redis
import boto3
import os
import time
import json
from flask import Flask, render_template, request, jsonify, session, send_from_directory, redirect, url_for
from flask_limiter import Limiter
from flask_session import Session
# import pandas as pd  # Temporarily disabled due to Python 3.13 compatibility issues
import csv  # Use built-in CSV module instead
import logging
import sqlite3
import uuid
import bcrypt
from werkzeug.exceptions import TooManyRequests
import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime, timezone, timedelta
import pytz

logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)

# Configure Flask session settings
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(os.path.dirname(__file__), 'sessions')
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fallback-secret-key-12345')
app.config['SESSION_COOKIE_NAME'] = 'onemchart_session'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Initialize Flask-Session
Session(app)

# Ensure session directory exists
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)

# Custom key function for Flask-Limiter
def get_session_key():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
        logging.debug(f"New session created with ID: {session['user_id']}")
    return session['user_id']

# Configure Flask-Limiter with Redis
limiter = Limiter(
    get_session_key,
    app=app,
    default_limits=["10 per 12 hours"],
    storage_uri=os.environ.get('REDIS_URL', 'redis://localhost:6379'),
    storage_options={"socket_connect_timeout": 30, "socket_timeout": 30},
    headers_enabled=True
)

# Helper function to check and enforce main site action limits (shared 10 clicks)
def check_main_action_limit():
    """Check if user has exceeded 10 main action clicks per 12 hours (shared across load chart, gaps, events, earnings)"""
    if is_sample_mode():
        return True  # Sample mode uses different limiting
    
    user_id = session.get('user_id')
    if not user_id:
        return True  # No user session, allow
    
    current_time = int(time.time())
    
    # Get current action count for this user
    call_key = f"main_actions_{user_id}"
    
    try:
        # Try to get from Redis first
        redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
        calls_data = redis_client.get(call_key)
        
        if calls_data:
            calls_info = json.loads(calls_data)
            calls_count = calls_info.get('count', 0)
            first_call_time = calls_info.get('first_call', current_time)
        else:
            calls_count = 0
            first_call_time = current_time
        
        # Check if 12 hours have passed since first call
        if current_time - first_call_time > 12 * 60 * 60:  # 12 hours in seconds
            # Reset counter
            calls_count = 0
            first_call_time = current_time
        
        # Check if exceeded limit
        if calls_count >= 10:
            return False
        
        # Increment counter
        calls_count += 1
        calls_info = {
            'count': calls_count,
            'first_call': first_call_time
        }
        
        # Store back to Redis with 12 hour expiration
        redis_client.setex(call_key, 12 * 60 * 60, json.dumps(calls_info))
        
        logging.debug(f"Main action {calls_count}/10 for user {user_id}")
        return True
        
    except Exception as e:
        logging.error(f"Error checking main action limit: {str(e)}")
        # Fallback to allowing the call if Redis is down
        return True

# Helper function to check and enforce gap insights limit (2 clicks)
def check_gap_insights_limit():
    """Check if user has exceeded 2 gap insights clicks per 12 hours"""
    if is_sample_mode():
        return True  # Sample mode uses different limiting
    
    user_id = session.get('user_id')
    if not user_id:
        return True  # No user session, allow
    
    current_time = int(time.time())
    
    # Get current action count for this user
    call_key = f"gap_insights_{user_id}"
    
    try:
        # Try to get from Redis first
        redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
        calls_data = redis_client.get(call_key)
        
        if calls_data:
            calls_info = json.loads(calls_data)
            calls_count = calls_info.get('count', 0)
            first_call_time = calls_info.get('first_call', current_time)
        else:
            calls_count = 0
            first_call_time = current_time
        
        # Check if 12 hours have passed since first call
        if current_time - first_call_time > 12 * 60 * 60:  # 12 hours in seconds
            # Reset counter
            calls_count = 0
            first_call_time = current_time
        
        # Check if exceeded limit
        if calls_count >= 2:
            return False
        
        # Increment counter
        calls_count += 1
        calls_info = {
            'count': calls_count,
            'first_call': first_call_time
        }
        
        # Store back to Redis with 12 hour expiration
        redis_client.setex(call_key, 12 * 60 * 60, json.dumps(calls_info))
        
        logging.debug(f"Gap insights action {calls_count}/2 for user {user_id}")
        return True
        
    except Exception as e:
        logging.error(f"Error checking gap insights limit: {str(e)}")
        # Fallback to allowing the call if Redis is down
        return True

# Helper function to check and enforce sample mode limits ONLY for specific actions
def check_sample_action_limit():
    """Check if sample mode user has exceeded 3 action button clicks per 12 hours"""
    if not is_sample_mode():
        return True  # Not in sample mode, no additional restriction
    
    session_key = get_session_key()
    current_time = int(time.time())
    
    # Get current action count for this session
    call_key = f"sample_actions_{session_key}"
    
    try:
        # Try to get from Redis first
        redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
        calls_data = redis_client.get(call_key)
        
        if calls_data:
            calls_info = json.loads(calls_data)
            calls_count = calls_info.get('count', 0)
            first_call_time = calls_info.get('first_call', current_time)
        else:
            calls_count = 0
            first_call_time = current_time
        
        # Check if 12 hours have passed since first call
        if current_time - first_call_time > 12 * 60 * 60:  # 12 hours in seconds
            # Reset counter
            calls_count = 0
            first_call_time = current_time
        
        # Check if exceeded limit
        if calls_count >= 3:
            return False
        
        # Increment counter
        calls_count += 1
        calls_info = {
            'count': calls_count,
            'first_call': first_call_time
        }
        
        # Store back to Redis with 12 hour expiration
        redis_client.setex(call_key, 12 * 60 * 60, json.dumps(calls_info))
        
        logging.debug(f"Sample mode action {calls_count}/3 for session {session_key}")
        return True
        
    except Exception as e:
        logging.error(f"Error checking sample action limit: {str(e)}")
        # Fallback to allowing the call if Redis is down
        return True

# Helper function to check and enforce sample mode limits
def check_sample_mode_limit():
    """Check if sample mode user has exceeded 3 calls per 12 hours"""
    if not is_sample_mode():
        return True  # Not in sample mode, no additional restriction
    
    session_key = get_session_key()
    current_time = int(time.time())
    
    # Get current call count for this session
    call_key = f"sample_calls_{session_key}"
    
    try:
        # Try to get from Redis first
        redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
        calls_data = redis_client.get(call_key)
        
        if calls_data:
            calls_info = json.loads(calls_data)
            calls_count = calls_info.get('count', 0)
            first_call_time = calls_info.get('first_call', current_time)
        else:
            calls_count = 0
            first_call_time = current_time
        
        # Check if 12 hours have passed since first call
        if current_time - first_call_time > 12 * 60 * 60:  # 12 hours in seconds
            # Reset counter
            calls_count = 0
            first_call_time = current_time
        
        # Check if exceeded limit
        if calls_count >= 3:
            return False
        
        # Increment counter
        calls_count += 1
        calls_info = {
            'count': calls_count,
            'first_call': first_call_time
        }
        
        # Store back to Redis with 12 hour expiration
        redis_client.setex(call_key, 12 * 60 * 60, json.dumps(calls_info))
        
        logging.debug(f"Sample mode call {calls_count}/3 for session {session_key}")
        return True
        
    except Exception as e:
        logging.error(f"Error checking sample mode limit: {str(e)}")
        # Fallback to allowing the call if Redis is down
        return True

# Test Redis connection
try:
    redis_client = redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
    redis_client.ping()
    logging.info("Successfully connected to Redis")
except redis.ConnectionError as e:
    logging.error(f"Failed to connect to Redis: {str(e)}")
    # Fallback to in-memory storage for rate limiting
    from flask_limiter.util import get_remote_address
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["10 per 12 hours"],
        storage_uri="memory://",
        headers_enabled=True
    )
    logging.warning("Falling back to in-memory storage for rate limiting")

# Custom error handler for rate limit exceeded
@app.errorhandler(429)
def ratelimit_handler(e):
    logging.info(f"Rate limit exceeded for session: {session.get('user_id')}")
    
    # Check if request is from sample mode
    if is_sample_mode():
        return jsonify({
            'error': 'Sample limit reached: You\'ve used your 3 free API calls. Sign up FREE for 10 calls per 12 hours and full access!'
        }), 429
    
    if request.path == '/api/gap_insights':
        return jsonify({
            'error': 'Rate limit exceeded: You have reached the limit of 3 requests per 12 hours. Please wait and try again later.'
        }), 429
    return jsonify({
        'error': 'Rate limit exceeded: You have reached the limit of 10 requests per 12 hours. Please wait and try again later.'
    }), 429

# Initialize SQLite database for users
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
USER_DB_PATH = os.path.join(DATA_DIR, 'users.db')

def init_user_db():
    try:
        conn = sqlite3.connect(USER_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        logging.info("User database initialized successfully")
    except Exception as e:
        logging.error(f"Error initializing user database: {str(e)}")

# Initialize user database
init_user_db()

# Function to upload users.db to S3
def upload_users_db():
    try:
        aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
        aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
        if not aws_access_key_id or not aws_secret_access_key:
            logging.error("AWS credentials not found in environment variables")
            return
        s3 = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name='us-west-2'
        )
        bucket = os.environ.get("AWS_S3_BUCKET", "onemchart-backup")
        db_path = os.path.join(DATA_DIR, "users.db")
        if not os.path.exists(db_path):
            logging.error(f"users.db not found at {db_path}")
            return
        s3.upload_file(db_path, bucket, "users.db_latest")
        logging.info("Uploaded users.db to s3://%s/users.db_latest", bucket)
    except Exception as e:
        logging.error(f"Failed to upload users.db to S3: {str(e)}")

TICKERS = ['QQQ', 'AAPL', 'MSFT', 'TSLA', 'ORCL', 'NVDA', 'MSTR', 'UBER', 'PLTR', 'META']
DB_DIR = os.path.join(DATA_DIR, "db")
GAP_DATA_PATH = os.path.join(DATA_DIR, "qqq_central_data_updated.csv")
EVENTS_DATA_PATH = os.path.join(DATA_DIR, "news_events.csv")
EARNINGS_DATA_PATH = os.path.join(DATA_DIR, "earnings_data.csv")
ECONOMIC_DATA_BINNED_PATH = os.path.join(DATA_DIR, "economic_data_binned.csv")

QQQ_DB_PATHS = [
    os.path.join(DB_DIR, "stock_data_qqq_part1.db"),
    os.path.join(DB_DIR, "stock_data_qqq_part2.db"),
    os.path.join(DB_DIR, "stock_data_qqq_part3.db")
]

VALID_TICKERS = []

def get_db_paths(ticker):
    if ticker not in TICKERS:
        logging.error(f"Invalid ticker requested: {ticker}")
        return []
    if ticker == 'QQQ':
        return [path for path in QQQ_DB_PATHS if os.path.exists(path)]
    db_path = os.path.join(DB_DIR, f"stock_data_{ticker.lower()}.db")
    return [db_path] if os.path.exists(db_path) else []

def initialize_tickers():
    global VALID_TICKERS
    VALID_TICKERS = []
    logging.debug("Initializing ticker list")
    for ticker in TICKERS:
        db_paths = get_db_paths(ticker)
        if not db_paths:
            logging.warning(f"No database files found for {ticker}")
            continue
        try:
            for db_path in db_paths:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT DISTINCT ticker FROM candles")
                db_tickers = [row[0] for row in cursor.fetchall()]
                if db_tickers and ticker not in VALID_TICKERS:
                    VALID_TICKERS.append(ticker)
                conn.close()
                logging.debug(f"Validated ticker {ticker} in {db_path}")
        except Exception as e:
            logging.warning(f"Could not access database for {ticker}: {str(e)}")
    if not VALID_TICKERS:
        logging.warning("No valid ticker databases found, falling back to static list")
        VALID_TICKERS = TICKERS
    VALID_TICKERS = sorted(VALID_TICKERS)
    logging.debug(f"Initialized tickers: {VALID_TICKERS}")

def is_sample_mode():
    """Check if the request is coming from sample mode based on referrer"""
    referrer = request.headers.get('Referer', '')
    return '/sample' in referrer or request.args.get('sample_mode') == 'true'

def get_sample_tickers():
    """Return limited tickers for sample mode"""
    return ['QQQ', 'NVDA']

def filter_dates_for_sample(dates):
    """Filter dates to only include 2023-2024 for sample mode"""
    if not dates:
        return dates
    
    # Filter to only 2023-2024 dates
    filtered_dates = []
    for date in dates:
        try:
            if '2023-' in date or '2024-' in date:
                filtered_dates.append(date)
        except:
            continue
    
    # Limit to maximum 20 recent dates for sample
    return sorted(filtered_dates, reverse=True)[:20]

def get_sample_gap_bins():
    """Return limited gap bins for sample mode"""
    return ['0.15-0.35%', '0.35-0.5%', '0.5-1%', '1-1.5%', '1.5%+']

def get_sample_years():
    """Return limited years for sample mode"""
    return ['2023', '2024']

def get_sample_event_types():
    """Return limited event types for sample mode"""
    return ['CPI', 'FOMC']

with app.app_context():
    initialize_tickers()

@app.route('/ads.txt')
def serve_ads_txt():
    try:
        return send_from_directory('.', 'ads.txt')
    except Exception as e:
        logging.error(f"Error serving ads.txt: {str(e)}")
        return jsonify({'error': 'Failed to serve ads.txt'}), 404

@app.route('/')
def home():
    logging.debug("Rendering home.html")
    return render_template('home.html')

@app.route('/dashboard')
def index():
    if not session.get('authenticated'):
        return redirect(url_for('login'))
    logging.debug("Rendering index.html")
    return render_template('index.html')

@app.route('/landing')
@limiter.limit("10 per day")
def landing():
    logging.debug("Rendering landing.html")
    return render_template('landing.html')

@app.route('/sample')
def sample():
    """Sample page with limited features for trying without signup"""
    logging.debug("Rendering sample.html")
    return render_template('sample.html')

@app.route('/api/sample/gap_bins', methods=['GET'])
def get_sample_gap_bins_api():
    """Return limited gap bins for sample mode"""
    logging.debug("Returning sample gap bins")
    return jsonify({'gap_bins': get_sample_gap_bins()})

@app.route('/register')
def register():
    """Registration page route"""
    logging.debug("Rendering landing.html for registration")
    return render_template('landing.html')

@app.route('/signup', methods=['POST'])
@limiter.limit("10 per day")
def signup():
    try:
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        logging.debug(f"Received signup: username={username}, email={email}, password={'*' * len(password) if password else 'None'}")

        if not username or not email or not password:
            logging.debug("Signup failed: Missing fields")
            return render_template('landing.html', error="All fields are required.")

        import re
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            logging.debug("Signup failed: Invalid email format")
            return render_template('landing.html', error="Invalid email format.")

        if len(password) < 8:
            logging.debug("Signup failed: Password too short")
            return render_template('landing.html', error="Password must be at least 8 characters long.")

        conn = sqlite3.connect(USER_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            conn.close()
            logging.debug("Signup failed: Email already registered")
            return render_template('landing.html', error="Email already registered.")

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)", 
                       (username, email, password_hash))
        conn.commit()
        conn.close()

        session['authenticated'] = True
        session['username'] = username
        session['email'] = email
        logging.info(f"User signed up and logged in: {email}")
        upload_users_db()
        return redirect(url_for('index'))
    except Exception as e:
        logging.error(f"Error processing signup: {str(e)}")
        return render_template('landing.html', error="An error occurred. Please try again.")

@app.route('/login')
@limiter.limit("10 per day")
def login():
    logging.debug("Rendering login.html")
    return render_template('login.html')

@app.route('/login', methods=['POST'])
@limiter.limit("10 per day")
def login_post():
    try:
        email = request.form.get('email')
        password = request.form.get('password')
        logging.debug(f"Received login attempt for email: {email}")

        if not email or not password:
            return render_template('login.html', error="Email and password are required.")

        conn = sqlite3.connect(USER_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT username, email, password_hash FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()

        if not user:
            return render_template('login.html', error="Invalid email or password.")

        username, stored_email, password_hash = user
        if not bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8')):
            return render_template('login.html', error="Invalid email or password.")

        session['authenticated'] = True
        session['username'] = username
        session['email'] = email
        logging.info(f"User logged in: {email}")
        upload_users_db()
        return redirect(url_for('index'))
    except Exception as e:
        logging.error(f"Error processing login: {str(e)}")
        return render_template('login.html', error="An error occurred. Please try again.")

@app.route('/logout')
def logout():
    session.pop('authenticated', None)
    session.pop('username', None)
    session.pop('email', None)
    logging.debug("User logged out")
    return redirect(url_for('home'))

@app.route('/api/tickers', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_tickers():
    if is_sample_mode():
        logging.debug("Returning sample tickers (limited)")
        return jsonify({'tickers': get_sample_tickers()})
    else:
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
    db_paths = get_db_paths(ticker)
    if not db_paths:
        logging.error(f"No database available for {ticker}")
        return jsonify({'error': f'No database available for {ticker}'}), 404
    try:
        dates = set()
        for db_path in db_paths:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT DATE(timestamp) AS date FROM candles WHERE ticker = ?", (ticker,))
            dates.update(row[0] for row in cursor.fetchall())
            conn.close()
        logging.debug(f"Found {len(dates)} dates for {ticker}")
        if not dates:
            logging.warning(f"No dates available for {ticker}")
            return jsonify({'error': f'No dates available for {ticker}'}), 404
        
        # Filter dates for sample mode
        dates_list = sorted(dates)
        if is_sample_mode():
            dates_list = filter_dates_for_sample(dates_list)
            logging.debug(f"Filtered to {len(dates_list)} dates for sample mode")
        
        return jsonify({'dates': dates_list})
    except Exception as e:
        logging.error(f"Error fetching dates for {ticker}: {str(e)}")
        return jsonify({'error': f'Failed to fetch dates for {ticker}'}), 500

@app.route('/api/stock/chart', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_chart():
    # Check action limits for button clicks
    if is_sample_mode():
        # Sample mode - check sample action limit
        sample_action = request.args.get('sample_action')
        if sample_action == 'load_chart':
            if not check_sample_action_limit():
                logging.info(f"Sample mode action limit exceeded for session: {session.get('user_id')}")
                return jsonify({
                    'error': 'Sample limit reached: You\'ve used your 3 free action buttons. Sign up FREE for unlimited access!',
                    'limit_reached': True
                }), 429
    else:
        # Main site - check main action limit
        main_action = request.args.get('main_action')
        if main_action == 'load_chart':
            if not check_main_action_limit():
                logging.info(f"Main action limit exceeded for user: {session.get('user_id')}")
                return jsonify({
                    'error': 'Action limit reached: You\'ve used your 10 free action buttons. Please wait 12 hours or upgrade your plan.',
                    'limit_reached': True
                }), 429
    
    try:
        ticker = request.args.get('ticker')
        date = request.args.get('date')
        timeframe = request.args.get('timeframe', '1')  # Default to 1 minute
        restrict_hours = request.args.get('restrict_hours', 'false').lower() == 'true'
        replay_mode = request.args.get('replay_mode', 'false').lower() == 'true'
        logging.debug(f"Processing chart request for ticker={ticker}, date={date}, timeframe={timeframe}, restrict_hours={restrict_hours}, replay_mode={replay_mode}")
        if not ticker or not date or not timeframe:
            return jsonify({'error': 'Missing ticker, date, or timeframe'}), 400
        if ticker not in TICKERS:
            return jsonify({'error': 'Invalid ticker'}), 400
        try:
            timeframe = int(timeframe)
            if timeframe not in [1, 2, 3, 5, 10, 15, 30, 60, 240]:
                return jsonify({'error': 'Invalid timeframe. Must be 1, 2, 3, 5, 10, 15, 30, 60 or 240 minutes.'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid timeframe format'}), 400
        try:
            target_date = pd.to_datetime(date).date()
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
        db_paths = get_db_paths(ticker)
        if not db_paths:
            return jsonify({'error': f'No database available for {ticker}'}), 404
        try:
            df_list = []
            query = """
                SELECT timestamp, open, high, low, close, volume
                FROM candles
                WHERE ticker = ? AND DATE(timestamp) = ?
                ORDER BY timestamp
            """
            for db_path in db_paths:
                conn = sqlite3.connect(db_path)
                df = pd.read_sql_query(query, conn, params=(ticker, str(target_date)), parse_dates=['timestamp'])
                df_list.append(df)
                conn.close()
            df = pd.concat(df_list, ignore_index=True)
            df = df.sort_values('timestamp')
            logging.debug(f"Loaded data shape for {ticker} on {date}: {df.shape}")

            # Filter to regular market hours (9:30 AM to 4:00 PM) if restrict_hours is True
            if restrict_hours:
                df['time'] = df['timestamp'].dt.time
                start_time = pd.to_datetime('09:30:00').time()
                end_time = pd.to_datetime('16:00:00').time()
                df = df[(df['time'] >= start_time) & (df['time'] <= end_time)]
                df = df.drop(columns=['time'])  # Remove temporary time column
                logging.debug(f"Filtered to regular hours, new shape: {df.shape}")

            # For replay mode, always return 1-minute data for client-side aggregation
            # For non-replay mode, resample to the requested timeframe if not 1 minute
            if not replay_mode and timeframe > 1:
                df.set_index('timestamp', inplace=True)
                df = df.resample(f'{timeframe}T').agg({
                    'open': 'first',
                    'high': 'max',
                    'low': 'min',
                    'close': 'last',
                    'volume': 'sum'
                }).dropna()
                df.reset_index(inplace=True)
                logging.debug(f"Resampled data to {timeframe}-minute timeframe, new shape: {df.shape}")

        except Exception as e:
            logging.error(f"Error querying database for {ticker}: {str(e)}")
            return jsonify({'error': 'Database query failed'}), 500
        if df.empty:
            return jsonify({'error': 'No data available for the selected date. Try another date.'}), 404
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'error': 'Invalid data format'}), 400

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
            'count': len(df)  # Update count to reflect filtered/resampled data
        }
        return jsonify({'chart_data': chart_data})
    except Exception as e:
        logging.error(f"Unexpected error in get_chart: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/gaps', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_gaps():
    # Check action limits for button clicks
    if is_sample_mode():
        # Sample mode - check sample action limit
        sample_action = request.args.get('sample_action')
        if sample_action == 'find_gap_dates':
            if not check_sample_action_limit():
                logging.info(f"Sample mode action limit exceeded for session: {session.get('user_id')}")
                return jsonify({
                    'error': 'Sample limit reached: You\'ve used your 3 free action buttons. Sign up FREE for unlimited access!',
                    'limit_reached': True
                }), 429
    else:
        # Main site - check main action limit
        main_action = request.args.get('main_action')
        if main_action == 'find_gap_dates':
            if not check_main_action_limit():
                logging.info(f"Main action limit exceeded for user: {session.get('user_id')}")
                return jsonify({
                    'error': 'Action limit reached: You\'ve used your 10 free action buttons. Please wait 12 hours or upgrade your plan.',
                    'limit_reached': True
                }), 429
    
    try:
        gap_size = request.args.get('gap_size')
        day = request.args.get('day')
        gap_direction = request.args.get('gap_direction')
        logging.debug(f"Fetching gaps for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
        if not os.path.exists(GAP_DATA_PATH):
            logging.error(f"Gap data file not found: {GAP_DATA_PATH}")
            return jsonify({'error': 'Gap data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(GAP_DATA_PATH)
            logging.debug(f"Loaded gap data with shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error reading gap data file {GAP_DATA_PATH}: {str(e)}")
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
        
        # Filter dates for sample mode
        if is_sample_mode():
            dates = filter_dates_for_sample(dates)
            logging.debug(f"Filtered to {len(dates)} gap dates for sample mode")
        
        logging.debug(f"Found {len(dates)} gap dates")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing gaps: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/gap_insights', methods=['GET'])
@limiter.limit("3 per 12 hours")
def get_gap_insights():
    # Check gap insights action limit (separate 2-click limit)
    if not is_sample_mode():
        # Main site - check gap insights limit
        main_action = request.args.get('main_action')
        if main_action == 'get_insights':
            if not check_gap_insights_limit():
                logging.info(f"Gap insights limit exceeded for user: {session.get('user_id')}")
                return jsonify({
                    'error': 'Gap Insights limit reached: You\'ve used your 2 free Gap Insights. Please wait 12 hours or upgrade your plan.',
                    'limit_reached': True
                }), 429
    
    try:
        gap_size = request.args.get('gap_size')
        day = request.args.get('day')
        gap_direction = request.args.get('gap_direction')
        logging.debug(f"Fetching gap insights for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
        
        # Get current QQQ market data for price calculations
        qqq_data = scrape_qqq_data()
        current_open_price = None
        current_prev_close = None
        
        if qqq_data and 'Open' in qqq_data and 'Prev Close' in qqq_data:
            try:
                current_open_price = float(qqq_data['Open'])
                current_prev_close = float(qqq_data['Prev Close'])
                logging.debug(f"Current QQQ Open: ${current_open_price}, Prev Close: ${current_prev_close}")
            except (ValueError, TypeError) as e:
                logging.warning(f"Could not parse QQQ prices: {e}")
        if not os.path.exists(GAP_DATA_PATH):
            logging.error(f"Gap data file not found: {GAP_DATA_PATH}")
            return jsonify({'error': 'Gap data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(GAP_DATA_PATH)
            logging.debug(f"Loaded gap data with shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error reading gap data file {GAP_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load gap data: {str(e)}'}), 500
        required_columns = [
            'gap_size_bin', 'day_of_week', 'gap_direction', 'filled',
            'move_before_reversal_fill_direction_pct', 'max_move_gap_direction_first_30min_pct',
            'time_of_low', 'time_of_high', 'reversal_after_fill', 'time_to_fill_minutes'
        ]
        if not all(col in df.columns for col in required_columns):
            logging.error("Invalid gap data format: missing required columns")
            return jsonify({'error': 'Invalid gap data format'}), 400
        filtered_df = df[
            (df['gap_size_bin'] == gap_size) &
            (df['day_of_week'] == day) &
            (df['gap_direction'] == gap_direction)
        ].copy()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if filtered_df.empty:
            logging.debug(f"No data found for gap_size={gap_size}, day={day}, gap_direction={gap_direction}")
            return jsonify({'insights': {}, 'message': 'No data found for the selected criteria'})
        
        gap_fill_rate = filtered_df['filled'].mean() * 100
        filled_df = filtered_df[filtered_df['filled'] == True]
        unfilled_df = filtered_df[filtered_df['filled'] == False]
        reversal_after_fill_rate = filtered_df['reversal_after_fill'].mean() * 100 if not filtered_df.empty else 0
        median_time_to_fill = filled_df['time_to_fill_minutes'].median() if not filled_df.empty else 0
        average_time_to_fill = filled_df['time_to_fill_minutes'].mean() if not filled_df.empty else 0

        def time_to_minutes(t):
            try:
                h, m = map(int, t.split(':')[:2])
                return h * 60 + m
            except:
                return pd.NaT

        filtered_df.loc[:, 'time_of_low_minutes'] = filtered_df['time_of_low'].apply(time_to_minutes)
        filtered_df.loc[:, 'time_of_high_minutes'] = filtered_df['time_of_high'].apply(time_to_minutes)

        def minutes_to_time(minutes):
            if pd.isna(minutes):
                return "N/A"
            hours = int(minutes // 60)
            mins = int(minutes % 60)
            return f"{hours:02d}:{mins:02d}"

        median_low_minutes = filtered_df['time_of_low_minutes'].median()
        average_low_minutes = filtered_df['time_of_low_minutes'].mean()
        median_high_minutes = filtered_df['time_of_high_minutes'].median()
        average_high_minutes = filtered_df['time_of_high_minutes'].mean()

        # Calculate price-based metrics
        def calculate_price_levels(percentage, base_price, direction='up'):
            """Calculate price levels from percentage moves"""
            if not base_price or pd.isna(percentage):
                return None
            
            if direction == 'up':
                return base_price + (percentage / 100 * base_price)
            else:
                return base_price - (percentage / 100 * base_price)

        # Get the key metrics for price calculations
        median_move_before_fill_pct = filled_df['move_before_reversal_fill_direction_pct'].median() if not filled_df.empty else 0
        average_move_before_fill_pct = filled_df['move_before_reversal_fill_direction_pct'].mean() if not filled_df.empty else 0
        median_max_move_unfilled_pct = unfilled_df['max_move_gap_direction_first_30min_pct'].median() if not unfilled_df.empty else 0
        average_max_move_unfilled_pct = unfilled_df['max_move_gap_direction_first_30min_pct'].mean() if not unfilled_df.empty else 0
        median_move_before_reversal_pct = filtered_df['move_before_reversal_fill_direction_pct'].median() if not filtered_df.empty else 0
        average_move_before_reversal_pct = filtered_df['move_before_reversal_fill_direction_pct'].mean() if not filtered_df.empty else 0

        # Calculate price levels from Open Price
        median_move_before_fill_price = calculate_price_levels(median_move_before_fill_pct, current_open_price, gap_direction) if current_open_price else None
        average_move_before_fill_price = calculate_price_levels(average_move_before_fill_pct, current_open_price, gap_direction) if current_open_price else None
        median_max_move_unfilled_price = calculate_price_levels(median_max_move_unfilled_pct, current_open_price, gap_direction) if current_open_price else None
        average_max_move_unfilled_price = calculate_price_levels(average_max_move_unfilled_pct, current_open_price, gap_direction) if current_open_price else None

        # Calculate price levels from Yesterday Close (for reversal)
        # For gap up: reversal = yesterday close - percentage
        # For gap down: reversal = yesterday close + percentage
        reversal_direction = 'down' if gap_direction == 'up' else 'up'
        median_move_before_reversal_price = calculate_price_levels(median_move_before_reversal_pct, current_prev_close, reversal_direction) if current_prev_close else None
        average_move_before_reversal_price = calculate_price_levels(average_move_before_reversal_pct, current_prev_close, reversal_direction) if current_prev_close else None

        # Check if today's gap matches the selected filters
        today_gap_direction = None
        today_gap_size_bin = None
        
        if qqq_data and 'Gap Value' in qqq_data and qqq_data['Gap Value'] is not None:
            today_gap_value = qqq_data['Gap Value']
            today_gap_direction = 'up' if today_gap_value > 0 else 'down'
            
            # Determine today's gap size bin
            abs_gap = abs(today_gap_value)
            if abs_gap >= 0.15 and abs_gap < 0.35:
                today_gap_size_bin = '0.15-0.35%'
            elif abs_gap >= 0.35 and abs_gap < 0.5:
                today_gap_size_bin = '0.35-0.5%'
            elif abs_gap >= 0.5 and abs_gap < 1.0:
                today_gap_size_bin = '0.5-1%'
            elif abs_gap >= 1.0 and abs_gap < 1.5:
                today_gap_size_bin = '1-1.5%'
            elif abs_gap >= 1.5:
                today_gap_size_bin = '1.5%+'
        
        # Get current day of week
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        today = datetime.now()
        today_day = days[today.weekday()]
        
        # Check if filters match today's conditions
        filters_match_today = (
            today_gap_direction and 
            today_gap_size_bin and 
            gap_direction == today_gap_direction and 
            gap_size == today_gap_size_bin and 
            day == today_day
        )

        insights = {
            'gap_fill_rate': {
                'average': round(gap_fill_rate, 2),
                'description': 'Percentage of gaps that close'
            },
            'median_move_before_fill': {
                'median': round(median_move_before_fill_pct, 2) if not pd.isna(median_move_before_fill_pct) else 0,
                'average': round(average_move_before_fill_pct, 2) if not pd.isna(average_move_before_fill_pct) else 0,
                'description': 'Percentage move before gap closes',
                'median_price': round(median_move_before_fill_price, 2) if (median_move_before_fill_price and filters_match_today) else None,
                'average_price': round(average_move_before_fill_price, 2) if (average_move_before_fill_price and filters_match_today) else None,
                'price_description': f'Price level from today\'s open (${current_open_price})' if (current_open_price and filters_match_today) else 'Price calculations only available when filters match today\'s gap',
                'zone_title': 'SHORT ZONE' if gap_direction == 'up' else 'LONG ZONE'
            },
            'median_max_move_unfilled': {
                'median': round(median_max_move_unfilled_pct, 2) if not pd.isna(median_max_move_unfilled_pct) else 0,
                'average': round(average_max_move_unfilled_pct, 2) if not pd.isna(average_max_move_unfilled_pct) else 0,
                'description': '% move in gap direction when price does not close the gap',
                'median_price': round(median_max_move_unfilled_price, 2) if (median_max_move_unfilled_price and filters_match_today) else None,
                'average_price': round(average_max_move_unfilled_price, 2) if (average_max_move_unfilled_price and filters_match_today) else None,
                'price_description': f'Price level from today\'s open (${current_open_price})' if (current_open_price and filters_match_today) else 'Price calculations only available when filters match today\'s gap',
                'zone_title': 'STOP OUT Zone'
            },
            'median_time_to_fill': {
                'median': round(median_time_to_fill, 2) if not pd.isna(median_time_to_fill) else 0,
                'average': round(average_time_to_fill, 2) if not pd.isna(average_time_to_fill) else 0,
                'description': 'Median time in minutes to fill gap'
            },
            'median_time_of_low': {
                'median': minutes_to_time(median_low_minutes),
                'average': minutes_to_time(average_low_minutes),
                'description': 'Median time of the day\'s low'
            },
            'median_time_of_high': {
                'median': minutes_to_time(median_high_minutes),
                'average': minutes_to_time(average_high_minutes),
                'description': 'Median time of the day\'s high'
            },
            'reversal_after_fill_rate': {
                'average': round(reversal_after_fill_rate, 2),
                'description': '% of time price reverses after gap is filled'
            },
            'median_move_before_reversal': {
                'median': round(median_move_before_reversal_pct, 2) if not pd.isna(median_move_before_reversal_pct) else 0,
                'average': round(average_move_before_reversal_pct, 2) if not pd.isna(average_move_before_reversal_pct) else 0,
                'description': 'Median move in gap fill direction before reversal',
                'median_price': round(median_move_before_reversal_price, 2) if (median_move_before_reversal_price and filters_match_today) else None,
                'average_price': round(average_move_before_reversal_price, 2) if (average_move_before_reversal_price and filters_match_today) else None,
                'price_description': f'Price level from yesterday\'s close (${current_prev_close})' if (current_prev_close and filters_match_today) else 'Price calculations only available when filters match today\'s gap',
                'zone_title': 'LONG ZONE' if gap_direction == 'up' else 'SHORT ZONE'
            },
            'market_data': {
                'current_open': current_open_price,
                'current_prev_close': current_prev_close,
                'gap_direction': gap_direction,
                'filters_match_today': filters_match_today,
                'today_gap_direction': today_gap_direction,
                'today_gap_size_bin': today_gap_size_bin,
                'today_day': today_day
            }
        }
        logging.debug(f"Computed insights: {insights}")
        return jsonify({'insights': insights})
    except Exception as e:
        logging.error(f"Error processing gap insights: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/years', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_years():
    if is_sample_mode():
        # Sample mode - return limited years
        return jsonify({'years': get_sample_years()})
    
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
            
            # Filter years for sample mode
            if is_sample_mode():
                sample_years = [int(year) for year in get_sample_years()]
                years = [year for year in years if year in sample_years]
                logging.debug(f"Filtered to sample years: {years}")
            
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
    # Check action limits for button clicks
    if is_sample_mode():
        # Sample mode - check sample action limit
        sample_action = request.args.get('sample_action')
        if sample_action == 'find_event_dates':
            if not check_sample_action_limit():
                logging.info(f"Sample mode action limit exceeded for session: {session.get('user_id')}")
                return jsonify({
                    'error': 'Sample limit reached: You\'ve used your 3 free action buttons. Sign up FREE for unlimited access!',
                    'limit_reached': True
                }), 429
    else:
        # Main site - check main action limit
        main_action = request.args.get('main_action')
        if main_action == 'find_event_dates':
            if not check_main_action_limit():
                logging.info(f"Main action limit exceeded for user: {session.get('user_id')}")
                return jsonify({
                    'error': 'Action limit reached: You\'ve used your 10 free action buttons. Please wait 12 hours or upgrade your plan.',
                    'limit_reached': True
                }), 429
    
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
        
        # Filter event types for sample mode
        if is_sample_mode():
            sample_event_types = get_sample_event_types()
            filtered_df = filtered_df[filtered_df['event_type'].isin(sample_event_types)]
            logging.debug(f"Filtered to sample event types: {sample_event_types}")
        dates = filtered_df['date'].dt.strftime('%Y-%m-%d').tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No events found for event_type={event_type}, year={year}")
            return jsonify({'dates': [], 'message': 'No events found for the selected criteria'})
        
        # Filter dates for sample mode
        if is_sample_mode():
            dates = filter_dates_for_sample(dates)
            logging.debug(f"Filtered to {len(dates)} event dates for sample mode")
        
        logging.debug(f"Found {len(dates)} event dates")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing events: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/economic_events', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_economic_events():
    try:
        event_type = request.args.get('event_type')
        bin_range = request.args.get('bin')
        logging.debug(f"Fetching economic events for event_type={event_type}, bin={bin_range}")
        if not os.path.exists(ECONOMIC_DATA_BINNED_PATH):
            logging.error(f"Economic data binned file not found: {ECONOMIC_DATA_BINNED_PATH}")
            return jsonify({'error': 'Economic data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(ECONOMIC_DATA_BINNED_PATH)
            df['date'] = pd.to_datetime(df['date'])
            logging.debug(f"Loaded economic data with shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error reading economic data file {ECONOMIC_DATA_BINNED_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load economic data: {str(e)}'}), 500
        if 'date' not in df.columns or 'event_type' not in df.columns or 'bin' not in df.columns:
            logging.error("Invalid economic data format: missing required columns")
            return jsonify({'error': 'Invalid economic data format'}), 400
        filtered_df = df
        if event_type:
            filtered_df = filtered_df[filtered_df['event_type'] == event_type]
        if bin_range:
            filtered_df = filtered_df[filtered_df['bin'] == bin_range]
        dates = filtered_df['date'].dt.strftime('%Y-%m-%d').tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No events found for event_type={event_type}, bin={bin_range}")
            return jsonify({'dates': [], 'message': 'No events found for the selected criteria'})
        logging.debug(f"Found {len(dates)} economic event dates")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing economic events: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/earnings', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_earnings():
    # Check action limits for button clicks
    if not is_sample_mode():
        # Main site - check main action limit
        main_action = request.args.get('main_action')
        if main_action == 'find_earnings_dates':
            if not check_main_action_limit():
                logging.info(f"Main action limit exceeded for user: {session.get('user_id')}")
                return jsonify({
                    'error': 'Action limit reached: You\'ve used your 10 free action buttons. Please wait 12 hours or upgrade your plan.',
                    'limit_reached': True
                }), 429
    
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
        logging.debug(f"Found {len(dates)} earnings dates")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing earnings: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/earnings_by_bin', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_earnings_by_bin():
    try:
        ticker = request.args.get('ticker')
        bin_value = request.args.get('bin')
        logging.debug(f"Fetching earnings for ticker={ticker}, bin={bin_value}")
        if not os.path.exists(EARNINGS_DATA_PATH):
            logging.error(f"Earnings data file not found: {EARNINGS_DATA_PATH}")
            return jsonify({'error': 'Earnings data file not found. Please contact support.'}), 404
        try:
            df = pd.read_csv(EARNINGS_DATA_PATH)
            df['earnings_date'] = pd.to_datetime(df['earnings_date'])
            logging.debug(f"Loaded earnings data with shape: {df.shape}")
        except Exception as e:
            logging.error(f"Error reading earnings data file {EARNINGS_DATA_PATH}: {str(e)}")
            return jsonify({'error': f'Failed to load earnings data: {str(e)}'}), 500
        if 'ticker' not in df.columns or 'earnings_date' not in df.columns or 'bin' not in df.columns:
            logging.error("Invalid earnings data format: missing required columns")
            return jsonify({'error': 'Invalid earnings data format'}), 400
        if not ticker or not bin_value:
            logging.error("Missing ticker or bin parameter")
            return jsonify({'error': 'Ticker and bin are required'}), 400
        if ticker not in TICKERS:
            logging.error(f"Invalid ticker requested: {ticker}")
            return jsonify({'error': 'Invalid ticker'}), 400
        valid_bins = ['Beat', 'Slight Beat', 'Miss', 'Slight Miss', 'Unknown']
        if bin_value not in valid_bins:
            logging.error(f"Invalid bin requested: {bin_value}")
            return jsonify({'error': 'Invalid bin'}), 400
        filtered_df = df[(df['ticker'] == ticker) & (df['bin'] == bin_value)]
        dates = filtered_df['earnings_date'].dt.strftime('%Y-%m-%d').tolist()
        logging.debug(f"Filtered DataFrame shape: {filtered_df.shape}")
        if not dates:
            logging.debug(f"No earnings found for ticker={ticker}, bin={bin_value}")
            return jsonify({'dates': [], 'message': f'No earnings found for {ticker} with bin {bin_value}'})
        logging.debug(f"Found {len(dates)} earnings dates")
        return jsonify({'dates': sorted(dates)})
    except Exception as e:
        logging.error(f"Error processing earnings by bin: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/news_event_insights', methods=['GET'])
@limiter.limit("20 per 12 hours")
def get_news_event_insights():
    """API endpoint to get news event insights from event_analysis_metrics.csv"""
    try:
        event_type = request.args.get('event_type')
        bin_value = request.args.get('bin')
        
        # Check if main action limit is reached (for Get Insights button)
        if not check_main_action_limit():
            return jsonify({
                'error': 'Action limit exceeded: You have reached the limit of 10 main actions per 12 hours. Please wait 12 hours or upgrade your plan.',
                'limit_reached': True
            }), 429
        
        logging.debug(f"Fetching news event insights for event_type={event_type}, bin={bin_value}")
        
        # Path to the event analysis metrics CSV file
        event_metrics_path = os.path.join(os.path.dirname(__file__), 'data', 'event_analysis_metrics.csv')
        
        if not os.path.exists(event_metrics_path):
            logging.error(f"Event analysis metrics file not found: {event_metrics_path}")
            return jsonify({'error': 'Event analysis data file not found. Please contact support.'}), 404
        
        # Read CSV data using built-in csv module
        try:
            with open(event_metrics_path, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                data = list(reader)
            logging.debug(f"Loaded event analysis data with {len(data)} rows")
        except Exception as e:
            logging.error(f"Error reading event analysis data file {event_metrics_path}: {str(e)}")
            return jsonify({'error': f'Failed to load event analysis data: {str(e)}'}), 500
        
        # Validate required columns
        required_columns = [
            'event_type', 'bin', 'percent_move_830_831', 'direction', 
            'percent_move_930_959_extreme', 'direction_930_959_extreme',
            'percent_move_930_1030_x', 'direction_930_1030_x', 
            'touched_premarket_level_x', 'percent_move_same_direction', 
            'percent_move_opposite_direction', 'touched_premarket_level', 
            'returned_to_opposite_level'
        ]
        
        if not data:
            return jsonify({'error': 'Event analysis data file is empty'}), 400
        
        missing_columns = [col for col in required_columns if col not in data[0].keys()]
        if missing_columns:
            logging.error(f"Invalid event analysis data format: missing columns {missing_columns}")
            return jsonify({'error': f'Invalid event analysis data format: missing columns {missing_columns}'}), 400
        
        # Filter data based on parameters
        filtered_data = data
        if event_type:
            filtered_data = [row for row in filtered_data if row['event_type'] == event_type]
        
        if bin_value:
            filtered_data = [row for row in filtered_data if row['bin'] == bin_value]
        
        if not filtered_data:
            logging.debug(f"No event analysis data found for event_type={event_type}, bin={bin_value}")
            return jsonify({'insights': {}, 'message': f'No event analysis data found for the selected criteria'})
        
        logging.debug(f"Filtered data rows: {len(filtered_data)}")
        
        # Helper function to calculate median
        def calculate_median(values):
            if not values:
                return 0
            sorted_values = sorted(values)
            n = len(sorted_values)
            if n % 2 == 0:
                return (sorted_values[n//2 - 1] + sorted_values[n//2]) / 2
            else:
                return sorted_values[n//2]
        
        # Helper function to calculate mean
        def calculate_mean(values):
            if not values:
                return 0
            return sum(values) / len(values)
        
        # Helper function to parse numeric values safely
        def safe_float(value):
            try:
                return float(value) if value and value.strip() else None
            except (ValueError, TypeError):
                return None
        
        # Calculate insights for each metric
        insights = {}
        
        # 1. 8:30-8:31 PRE MARKET reaction to data release move % (only moves above 0.1%)
        pm_moves = [safe_float(row['percent_move_830_831']) for row in filtered_data 
                   if safe_float(row['percent_move_830_831']) is not None and safe_float(row['percent_move_830_831']) > 0.1]
        pm_directions = [row['direction'] for row in filtered_data 
                        if safe_float(row['percent_move_830_831']) is not None and safe_float(row['percent_move_830_831']) > 0.1]
        
        if pm_moves:
            insights['premarket_reaction'] = {
                'median': round(calculate_median(pm_moves), 2),
                'average': round(calculate_mean(pm_moves), 2),
                'description': '8:30-8:31 PRE MARKET reaction to data release move % (moves > 0.1%)',
                'direction_bias': 'Up' if pm_directions.count('Up') > pm_directions.count('Down') else 'Down',
                'up_count': pm_directions.count('Up'),
                'down_count': pm_directions.count('Down'),
                'total_count': len(pm_directions)
            }
        
        # 2. Move between 9:30 - 10:00 to highest high or lowest low
        extreme_moves = [safe_float(row['percent_move_930_959_extreme']) for row in filtered_data if safe_float(row['percent_move_930_959_extreme']) is not None]
        extreme_directions = [row['direction_930_959_extreme'] for row in filtered_data if row['direction_930_959_extreme']]
        
        if extreme_moves:
            insights['extreme_moves_930_1000'] = {
                'median': round(calculate_median(extreme_moves), 2),
                'average': round(calculate_mean(extreme_moves), 2),
                'description': 'Move between 9:30 - 10:00 to highest high or lowest low',
                'direction_bias': 'Up' if extreme_directions.count('Up') > extreme_directions.count('Down') else 'Down',
                'up_count': extreme_directions.count('Up'),
                'down_count': extreme_directions.count('Down'),
                'total_count': len(extreme_directions)
            }
        
        # 3. Move between 9:30 - 10:30 close, no extreme moves
        regular_moves = [safe_float(row['percent_move_930_1030_x']) for row in filtered_data if safe_float(row['percent_move_930_1030_x']) is not None]
        regular_directions = [row['direction_930_1030_x'] for row in filtered_data if row['direction_930_1030_x']]
        
        if regular_moves:
            insights['regular_moves_930_1030'] = {
                'median': round(calculate_median(regular_moves), 2),
                'average': round(calculate_mean(regular_moves), 2),
                'description': 'Move between 9:30 - 10:30 close, no extreme moves',
                'direction_bias': 'Up' if regular_directions.count('Up') > regular_directions.count('Down') else 'Down',
                'up_count': regular_directions.count('Up'),
                'down_count': regular_directions.count('Down'),
                'total_count': len(regular_directions)
            }
        
        # 4. First touch of pre market low or high and subsequent moves
        touch_levels = [row['touched_premarket_level_x'] for row in filtered_data if row['touched_premarket_level_x']]
        same_direction_moves = [safe_float(row['percent_move_same_direction']) for row in filtered_data if safe_float(row['percent_move_same_direction']) is not None]
        opposite_direction_moves = [safe_float(row['percent_move_opposite_direction']) for row in filtered_data if safe_float(row['percent_move_opposite_direction']) is not None]
        
        if touch_levels:
            insights['premarket_level_touch'] = {
                'median': round(calculate_median(same_direction_moves), 2) if same_direction_moves else None,
                'average': round(calculate_mean(same_direction_moves), 2) if same_direction_moves else None,
                'description': 'First touch of pre market low or high - move in direction of touch',
                'touch_bias': 'High' if touch_levels.count('High') > touch_levels.count('Low') else 'Low',
                'high_count': touch_levels.count('High'),
                'low_count': touch_levels.count('Low'),
                'total_count': len(touch_levels),
                'opposite_median': round(calculate_median(opposite_direction_moves), 2) if opposite_direction_moves else None,
                'opposite_average': round(calculate_mean(opposite_direction_moves), 2) if opposite_direction_moves else None,
                'opposite_description': 'Move opposite to touch direction (reversal)'
            }
        
        # 4b. 60-minute moves after touching pre-market level (if columns exist)
        if 'percent_move_same_direction_60min' in data[0] and 'percent_move_opposite_direction_60min' in data[0]:
            same_direction_60min = [safe_float(row['percent_move_same_direction_60min']) for row in filtered_data if safe_float(row['percent_move_same_direction_60min']) is not None]
            opposite_direction_60min = [safe_float(row['percent_move_opposite_direction_60min']) for row in filtered_data if safe_float(row['percent_move_opposite_direction_60min']) is not None]
            
            if same_direction_60min or opposite_direction_60min:
                insights['moves_after_touch_60min'] = {
                    'trend_median': round(calculate_median(same_direction_60min), 2) if same_direction_60min else None,
                    'trend_average': round(calculate_mean(same_direction_60min), 2) if same_direction_60min else None,
                    'trend_description': '60-minute move in same direction as gap (trend continuation)',
                    'reversal_median': round(calculate_median(opposite_direction_60min), 2) if opposite_direction_60min else None,
                    'reversal_average': round(calculate_mean(opposite_direction_60min), 2) if opposite_direction_60min else None,
                    'reversal_description': '60-minute move opposite to gap direction (reversal)',
                    'trend_count': len(same_direction_60min),
                    'reversal_count': len(opposite_direction_60min)
                }
        
        # 5. % of price return to pre market high or low after hit the pre market high or low in other direction
        return_levels = [row['touched_premarket_level'] for row in filtered_data if row['touched_premarket_level']]
        returned_to_opposite = [row['returned_to_opposite_level'] for row in filtered_data if row['returned_to_opposite_level']]
        
        if return_levels and returned_to_opposite:
            return_rate = (returned_to_opposite.count('Yes') / len(returned_to_opposite)) * 100
            insights['return_to_opposite_level'] = {
                'average': round(return_rate, 1),
                'description': '% of time market reversal after hitting pre market high/low',
                'return_count': returned_to_opposite.count('Yes'),
                'no_return_count': returned_to_opposite.count('No'),
                'total_count': len(returned_to_opposite)
            }
        
        logging.debug(f"Calculated insights: {list(insights.keys())}")
        
        return jsonify({
            'insights': insights,
            'event_type': event_type,
            'bin': bin_value,
            'data_points': len(filtered_data)
        })
        
    except Exception as e:
        logging.error(f"Error processing news event insights: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

# Global cache for QQQ data to prevent multiple scraping
qqq_data_cache = {
    'data': None,
    'timestamp': None,
    'market_date': None  # Store the market date the data represents
}

def is_market_open():
    """Check if US market is currently open (9:31 AM - 4:00 PM ET, Mon-Fri)"""
    et_tz = pytz.timezone('US/Eastern')
    now_et = datetime.now(et_tz)
    
    # Check if it's a weekday (Monday = 0, Sunday = 6)
    if now_et.weekday() >= 5:  # Saturday or Sunday
        return False
    
    # Check if it's within market hours (9:31 AM - 4:00 PM ET)
    # We use 9:31 AM to ensure market data is updated
    market_open = now_et.replace(hour=9, minute=31, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    
    return market_open <= now_et <= market_close

def get_market_date():
    """Get the current market date (today if market is open, previous trading day if closed)"""
    et_tz = pytz.timezone('US/Eastern')
    now_et = datetime.now(et_tz)
    
    # If market is closed, we need yesterday's data
    if not is_market_open():
        # Go back to previous trading day
        days_back = 1
        while days_back <= 7:  # Look back up to 7 days
            prev_day = now_et - timedelta(days=days_back)
            if prev_day.weekday() < 5:  # Monday-Friday
                return prev_day.strftime('%Y-%m-%d')
            days_back += 1
        return now_et.strftime('%Y-%m-%d')  # Fallback
    
    return now_et.strftime('%Y-%m-%d')

def should_refresh_qqq_data():
    """Determine if we need to refresh QQQ data - once per day at 9:31 AM ET"""
    current_market_date = get_market_date()
    
    # If we don't have cached data, we need to scrape
    if not qqq_data_cache['data'] or not qqq_data_cache['market_date']:
        return True
    
    # If the cached data is for a different market date, we need fresh data
    if qqq_data_cache['market_date'] != current_market_date:
        return True
    
    # If we already have today's data, don't scrape again
    return False

def scrape_qqq_data():
    """Scrape QQQ data from CNBC website with market-aware caching"""
    global qqq_data_cache
    
    # Check if we need to refresh based on market conditions
    if not should_refresh_qqq_data():
        logging.info("Returning cached QQQ data (market-aware cache)")
        return qqq_data_cache['data']
    
    try:
        logging.info("Performing single QQQ data scrape from CNBC")
        url = "https://www.cnbc.com/quotes/QQQ"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find the Summary section with Key Stats
        summary_section = soup.find('div', class_='Summary-subsection')
        if not summary_section:
            return None
        
        # Look for the Key Stats title
        key_stats_title = summary_section.find('h3', class_='Summary-title', string=lambda text: text and 'KEY STATS' in text.upper())
        if not key_stats_title:
            return None
        
        # Find the stats list
        stats_list = summary_section.find('ul', class_='Summary-data')
        if not stats_list:
            return None
        
        # Extract the data
        data = {}
        stats_items = stats_list.find_all('li', class_='Summary-stat')
        
        for item in stats_items:
            label_elem = item.find('span', class_='Summary-label')
            value_elem = item.find('span', class_='Summary-value')
            
            if label_elem and value_elem:
                label = label_elem.get_text(strip=True)
                value = value_elem.get_text(strip=True)
                
                if label in ['Open', 'Prev Close']:
                    data[label] = value
        
        # Calculate gap percentage if we have both Open and Prev Close
        if 'Open' in data and 'Prev Close' in data:
            try:
                open_price = float(data['Open'])
                prev_close = float(data['Prev Close'])
                gap_percentage = ((open_price - prev_close) / prev_close) * 100
                data['Gap %'] = f"{gap_percentage:.2f}%"
                data['Gap Value'] = gap_percentage  # Store numeric value for calculations
            except (ValueError, ZeroDivisionError):
                data['Gap %'] = "N/A"
                data['Gap Value'] = None
        
        # Cache the data with market date
        qqq_data_cache['data'] = data
        qqq_data_cache['timestamp'] = time.time()
        qqq_data_cache['market_date'] = get_market_date()
        
        logging.info(f"QQQ data scraped and cached successfully for market date: {qqq_data_cache['market_date']}")
        return data
        
    except Exception as e:
        logging.error(f"Error scraping QQQ data: {str(e)}")
        return None

@app.route('/api/qqq_data', methods=['GET'])
@limiter.limit("10 per hour")
def get_qqq_data():
    """API endpoint to get current QQQ data"""
    try:
        data = scrape_qqq_data()
        if data:
            return jsonify({
                'success': True,
                'data': data
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch QQQ data'
            }), 500
    except Exception as e:
        logging.error(f"Error in QQQ data API: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Server error'
        }), 500

if __name__ == '__main__':
    app.run(debug=True)