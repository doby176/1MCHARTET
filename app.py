import redis
import boto3
import os
import time
import json
import requests
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session, send_from_directory, redirect, url_for
from flask_limiter import Limiter
from flask_session import Session
import pandas as pd
import logging
import sqlite3
import uuid
import bcrypt
from werkzeug.exceptions import TooManyRequests

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
    limiter.storage = limiter.storage_memory()
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

        insights = {
            'gap_fill_rate': {
                'median': round(gap_fill_rate, 2),
                'average': round(gap_fill_rate, 2),
                'description': 'Percentage of gaps that close'
            },
            'median_move_before_fill': {
                'median': round(filled_df['move_before_reversal_fill_direction_pct'].median(), 2) if not filled_df.empty else 0,
                'average': round(filled_df['move_before_reversal_fill_direction_pct'].mean(), 2) if not filled_df.empty else 0,
                'description': 'Percentage move before gap closes'
            },
            'median_max_move_unfilled': {
                'median': round(unfilled_df['max_move_gap_direction_first_30min_pct'].median(), 2) if not unfilled_df.empty else 0,
                'average': round(unfilled_df['max_move_gap_direction_first_30min_pct'].mean(), 2) if not unfilled_df.empty else 0,
                'description': '% move in gap direction when price does not close the gap'
            },
            'median_time_to_fill': {
                'median': round(median_time_to_fill, 2) if not pd.isna(median_time_to_fill) else 0,
                'average': round(average_time_to_fill, 2) if not pd.isna(average_time_to_fill) else 0,
                'description': 'Median time in minutes to fill gap'
            },
            'median_time_of_low': {
                'median': minutes_to_time(median_low_minutes),
                'average': minutes_to_time(average_low_minutes),
                'description': 'Median time of the day’s low'
            },
            'median_time_of_high': {
                'median': minutes_to_time(median_high_minutes),
                'average': minutes_to_time(average_high_minutes),
                'description': 'Median time of the day’s high'
            },
            'reversal_after_fill_rate': {
                'median': round(reversal_after_fill_rate, 2),
                'average': round(reversal_after_fill_rate, 2),
                'description': '% of time price reverses after gap is filled'
            },
            'median_move_before_reversal': {
                'median': round(filtered_df['move_before_reversal_fill_direction_pct'].median(), 2) if not filtered_df.empty else 0,
                'average': round(filtered_df['move_before_reversal_fill_direction_pct'].mean(), 2) if not filtered_df.empty else 0,
                'description': 'Median move in gap fill direction before reversal'
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

# Alpha Vantage API configuration
ALPHA_VANTAGE_API_KEY = "9K03GJJCB96AJCO3"
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"

def get_real_time_gap_data(ticker, date):
    """
    Fetches real-time gap data for QQQ using Alpha Vantage API.
    Returns yesterday's close and today's open (if available) to calculate gap.
    """
    try:
        # Construct the Alpha Vantage API URL for daily time series
        params = {
            'function': 'TIME_SERIES_DAILY',
            'symbol': ticker,
            'apikey': ALPHA_VANTAGE_API_KEY,
            'outputsize': 'compact'  # Get last 100 days of data
        }

        response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params)
        response.raise_for_status()  # Raise an exception for HTTP errors
        data = response.json()

        # Check for API errors
        if 'Error Message' in data:
            logging.error(f"Alpha Vantage API error: {data['Error Message']}")
            return {'error': f'Alpha Vantage API error: {data["Error Message"]}'}
        
        if 'Note' in data:
            logging.error(f"Alpha Vantage API note: {data['Note']}")
            return {'error': f'Alpha Vantage API note: {data["Note"]}'}

        if 'Time Series (Daily)' not in data:
            logging.error(f"Alpha Vantage API returned no data for {ticker}")
            return {'error': f'No data available for {ticker} from Alpha Vantage.'}

        # Extract the daily time series data
        daily_data = data['Time Series (Daily)']
        
        # Get today's date and yesterday's date
        today = datetime.now()
        yesterday = today - timedelta(days=1)
        
        # Adjust for weekends (skip Saturday and Sunday)
        while yesterday.weekday() >= 5:  # Saturday (5) or Sunday (6)
            yesterday -= timedelta(days=1)
        
        # Format dates as YYYY-MM-DD (Alpha Vantage format)
        today_str = today.strftime('%Y-%m-%d')
        yesterday_str = yesterday.strftime('%Y-%m-%d')
        
        logging.debug(f"Looking for data - Today: {today_str}, Yesterday: {yesterday_str}")
        logging.debug(f"Available dates: {list(daily_data.keys())[:5]}")
        
        # Get yesterday's close price (most recent available data)
        yesterday_close = None
        yesterday_date_str = None
        
        # First try to get yesterday's data
        if yesterday_str in daily_data:
            yesterday_close = float(daily_data[yesterday_str]['4. close'])
            yesterday_date_str = yesterday_str
            logging.debug(f"Found yesterday's data: {yesterday_str} - Close: {yesterday_close}")
        else:
            # If yesterday's data is not available, use the most recent available date
            available_dates = list(daily_data.keys())
            available_dates.sort(reverse=True)  # Sort in descending order (most recent first)
            
            if available_dates:
                yesterday_date_str = available_dates[0]
                yesterday_close = float(daily_data[yesterday_date_str]['4. close'])
                logging.debug(f"Using most recent available data: {yesterday_date_str} - Close: {yesterday_close}")
        
        if yesterday_close is None:
            logging.error(f"Could not find any data for {ticker}")
            return {'error': f'No data available for {ticker} from Alpha Vantage.'}
        
        # Check if today's data is available (market is open)
        today_open = None
        today_high = None
        today_low = None
        today_close = None
        today_volume = None
        gap_pct = None
        gap_direction = None
        
        if today_str in daily_data:
            today_data = daily_data[today_str]
            today_open = float(today_data['1. open'])
            today_high = float(today_data['2. high'])
            today_low = float(today_data['3. low'])
            today_close = float(today_data['4. close'])
            today_volume = float(today_data['5. volume'])
            
            # Calculate gap percentage
            gap_pct = ((today_open - yesterday_close) / yesterday_close) * 100
            gap_direction = 'Up' if gap_pct > 0 else 'Down'
            
            logging.debug(f"Found today's data: {today_str} - Open: {today_open}, Gap: {gap_pct:.2f}%")
        else:
            logging.debug(f"No data found for today ({today_str}) - market may not be open yet")
        
        return {
            'ticker': ticker,
            'yesterday_date': yesterday_date_str,
            'yesterday_close': round(yesterday_close, 2),
            'today_date': today_str,
            'today_open': round(today_open, 2) if today_open else None,
            'today_high': round(today_high, 2) if today_high else None,
            'today_low': round(today_low, 2) if today_low else None,
            'today_close': round(today_close, 2) if today_close else None,
            'today_volume': int(today_volume) if today_volume else None,
            'gap_pct': round(gap_pct, 2) if gap_pct else None,
            'gap_direction': gap_direction,
            'market_status': 'Open' if today_open else 'Closed',
            'message': f"{ticker} yesterday close: ${yesterday_close:.2f}" + (f" | Today open: ${today_open:.2f} | Gap: {gap_direction} {abs(round(gap_pct, 2))}%" if today_open else " | Market not yet open")
        }
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching real-time gap data from Alpha Vantage: {str(e)}")
        return {'error': f'Failed to fetch real-time gap data from Alpha Vantage: {str(e)}'}
    except Exception as e:
        logging.error(f"Unexpected error in get_real_time_gap_data: {str(e)}")
        return {'error': 'Server error'}

@app.route('/api/real_time_gap', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_real_time_gap():
    ticker = request.args.get('ticker')
    logging.debug(f"Fetching real-time gap for ticker={ticker}")
    if not ticker:
        return jsonify({'error': 'Ticker is required for real-time gap data.'}), 400
    if ticker not in TICKERS:
        return jsonify({'error': 'Invalid ticker'}), 400
    
    try:
        logging.debug(f"Calling get_real_time_gap_data for {ticker}")
        gap_data = get_real_time_gap_data(ticker, None)  # No date parameter needed
        logging.debug(f"Received gap data: {gap_data}")
        
        if 'error' in gap_data:
            logging.error(f"Error in gap data: {gap_data['error']}")
            return jsonify(gap_data), 404
        return jsonify(gap_data)
    except Exception as e:
        logging.error(f"Error processing real-time gap request: {str(e)}")
        return jsonify({'error': 'Server error'}), 500

@app.route('/api/test_alpha_vantage', methods=['GET'])
def test_alpha_vantage():
    """Test endpoint to verify Alpha Vantage API is working"""
    try:
        params = {
            'function': 'TIME_SERIES_DAILY',
            'symbol': 'QQQ',
            'apikey': ALPHA_VANTAGE_API_KEY,
            'outputsize': 'compact'
        }
        
        response = requests.get(ALPHA_VANTAGE_BASE_URL, params=params)
        logging.debug(f"Alpha Vantage test response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if 'Time Series (Daily)' in data:
                available_dates = list(data['Time Series (Daily)'].keys())[:5]
                return jsonify({
                    'status': 'success',
                    'available_dates': available_dates,
                    'api_key': ALPHA_VANTAGE_API_KEY[:10] + '...'  # Show first 10 chars
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'No time series data in response',
                    'response': data
                })
        else:
            return jsonify({
                'status': 'error',
                'message': f'HTTP {response.status_code}',
                'response': response.text
            })
    except Exception as e:
        logging.error(f"Error testing Alpha Vantage: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        })

if __name__ == '__main__':
    app.run(debug=True)