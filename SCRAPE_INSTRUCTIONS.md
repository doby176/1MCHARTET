# Instructions for Scraping Rishon LeZion Streets

## Option 1: Run the Scraping Script (Recommended)

1. **Install dependencies:**
   ```bash
   pip install requests beautifulsoup4
   ```

2. **Run the scraper:**
   ```bash
   python3 scrape_rishon_streets.py
   ```

3. **The script will:**
   - Fetch the page from https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx
   - Extract all street names
   - Generate `rishon_streets.json` with the complete list
   - Generate `rishon_streets_kt.txt` with Kotlin code ready to paste

4. **Update MainActivity.kt:**
   - Open `rishon_streets_kt.txt`
   - Copy all the content
   - In `MainActivity.kt`, find the `getStreetsJSON()` function
   - Replace the entire `"streets": [...]` array with the new content

## Option 2: Manual Extraction

If the scraper doesn't work, you can manually extract the data:

1. **Open the website:**
   https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx

2. **View page source** (Right-click → View Page Source)

3. **Look for street data** in one of these formats:
   - HTML tables (`<table>` tags)
   - Lists (`<ul>` or `<ol>` tags)
   - JavaScript arrays/objects
   - JSON data embedded in the page

4. **Extract street names** and create entries in this format:
   ```json
   {"en": "Street Name English", "he": "שם רחוב בעברית"}
   ```

5. **Update MainActivity.kt** with the complete list

## Option 3: Browser Developer Tools

1. Open the website in Chrome/Firefox
2. Press F12 to open Developer Tools
3. Go to Network tab
4. Reload the page
5. Look for API calls or JSON responses that contain street data
6. Copy the JSON data and convert it to the required format

## Format Requirements

Each street entry should be in this format:
```json
{"en": "English Name", "he": "Hebrew Name"}
```

Include variations:
- With/without "Rehov" prefix
- With/without "Sderot" prefix  
- With/without "Derech" prefix
- Common misspellings or OCR variations

## After Updating

1. Rebuild the Android app
2. Test the address scanner with various labels
3. Verify that street names are correctly recognized
