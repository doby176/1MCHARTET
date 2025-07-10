@app.route('/api/stock/chart', methods=['GET'])
@limiter.limit("10 per 12 hours")
def get_chart():
    try:
        ticker = request.args.get('ticker')
        date = request.args.get('date')
        timeframe = request.args.get('timeframe', '1')  # Default to 1 minute
        restrict_hours = request.args.get('restrict_hours', 'false').lower() == 'true'
        logging.debug(f"Processing chart request for ticker={ticker}, date={date}, timeframe={timeframe}, restrict_hours={restrict_hours}")
        if not ticker or not date or not timeframe:
            return jsonify({'error': 'Missing ticker, date, or timeframe'}), 400
        if ticker not in TICKERS:
            return jsonify({'error': 'Invalid ticker'}), 400
        try:
            timeframe = int(timeframe)
            if timeframe not in [1, 2, 3, 5, 10]:
                return jsonify({'error': 'Invalid timeframe. Must be 1, 2, 3, 5, or 10 minutes.'}), 400
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

            # Keep a copy of 1-minute data
            df_one_min = df.copy()

            # Resample to the requested timeframe if not 1 minute
            if timeframe > 1:
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

        # Format timestamps for both datasets
        df_one_min['timestamp'] = df_one_min['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
        df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')

        # Prepare response with both 1-minute and higher timeframe data
        chart_data = {
            'one_min': {
                'timestamp': df_one_min['timestamp'].tolist(),
                'open': df_one_min['open'].tolist(),
                'high': df_one_min['high'].tolist(),
                'low': df_one_min['low'].tolist(),
                'close': df_one_min['close'].tolist(),
                'volume': df_one_min['volume'].tolist()
            },
            'higher_tf': {
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
        }
        return jsonify({'chart_data': chart_data})
    except Exception as e:
        logging.error(f"Unexpected error in get_chart: {str(e)}")
        return jsonify({'error': 'Server error'}), 500