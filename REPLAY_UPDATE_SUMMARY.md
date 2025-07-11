# Replay Feature Update Summary

## Overview
Updated the website's replay functionality to match the behavior shown in the new simulator files (`simulator.html` and `simulator.js`). The main change is how data is aggregated and displayed during replay, especially for timeframes larger than 1 minute.

## Key Changes Made

### 1. Backend Changes (`app.py`)

#### New `replay_mode` Parameter
- Added support for `replay_mode` parameter in `/api/stock/chart` endpoint
- When `replay_mode=true`, the API returns raw 1-minute data instead of pre-aggregated data
- This allows the frontend to perform client-side aggregation with minute-by-minute updates

```python
replay_mode = request.args.get('replay_mode', 'false').lower() == 'true'

# For replay mode, always return 1-minute data for client-side aggregation
# For non-replay mode, resample to the requested timeframe if not 1 minute
if not replay_mode and timeframe > 1:
    # Server-side resampling for static charts
```

### 2. Frontend Changes (`static/script.js`)

#### New Aggregation Logic
- Added `aggregateCandles()` function that groups 1-minute data into larger timeframes
- Tracks minute-by-minute updates within each aggregated candle
- Supports incremental building of candles during replay

#### Enhanced Replay Functionality
- **1-minute timeframe**: Shows each minute as a separate candle (same as before)
- **Larger timeframes (2,3,5,10 minutes)**: Shows aggregated candles building up minute by minute
  - Displays the candle's starting timestamp consistently
  - Updates high, low, close, and volume incrementally as each minute is added
  - Shows partial candle states during replay

#### New Chart Rendering
- Added `renderChart()` function that handles incremental candle updates
- Supports showing partial states of candles as they build up
- Uses minute-by-minute updates stored in `minuteUpdates` arrays

#### Updated Global Variables
For each section (Market Simulator, Gap Analysis, Events Analysis, Earnings Analysis):
- Added `aggregatedCandles[Section]` arrays to store processed candle data
- Added `timeframe[Section]` variables to track current timeframe
- Updated replay logic to work with aggregated data

### 3. API Integration
- Updated `loadChart()` function to call API with `replay_mode=${timeframe > 1}`
- When timeframe > 1: requests 1-minute data and aggregates client-side
- When timeframe = 1: works same as before

## How It Works Now

### For 1-Minute Timeframe:
1. API returns 1-minute data
2. Each minute shows as a separate candle
3. Replay advances one minute at a time
4. Same behavior as before

### For Larger Timeframes (2,3,5,10 minutes):
1. API returns raw 1-minute data
2. Frontend aggregates into larger candles using `aggregateCandles()`
3. During replay:
   - Shows candles building up minute by minute
   - Updates high/low/close/volume incrementally
   - Maintains consistent timestamps (candle start time)
   - Provides realistic view of how candles form in real trading

## Example: 5-Minute Timeframe Replay
- API fetches 1-minute data for the entire day
- Frontend creates 5-minute aggregated candles
- During replay:
  - Minute 1: Shows new 5-min candle with first minute's data
  - Minute 2: Updates same candle with higher high/lower low/new close
  - Minute 3: Continues updating the same candle
  - Minute 4: Further updates
  - Minute 5: Completes the 5-minute candle
  - Minute 6: Starts building the next 5-minute candle

## Updated Sections
All chart sections now use the new replay logic:
- ✅ Market Simulator
- ✅ Nasdaq Gap Analysis  
- ✅ News Event Analysis
- ✅ Earnings Analysis
- ⚠️ Nasdaq Gap Insights (no charts, so no changes needed)

## Benefits
1. **More Realistic Replay**: Shows how candles actually form in real-time trading
2. **Better Learning**: Users can see price action development within larger timeframes
3. **Consistent Experience**: Same behavior across all timeframes and sections
4. **Improved Performance**: Client-side aggregation reduces server load

## Files Modified
- `app.py`: Added replay_mode parameter support
- `static/script.js`: Complete rewrite with new aggregation and replay logic
- `templates/index.html`: Already had all necessary timeframe selectors

## Backward Compatibility
- Static charts (non-replay) continue to work as before
- 1-minute timeframe replay unchanged
- All existing features preserved