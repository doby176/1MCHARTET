#!/usr/bin/env python3
"""
Script to scrape all street names from Rishon LeZion official website
and generate JSON format for MainActivity.kt

Usage:
    python3 scrape_rishon_streets.py

Output:
    - rishon_streets.json: Complete list of streets in JSON format
    - rishon_streets_kt.txt: Kotlin code snippet ready to paste into MainActivity.kt
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from html.parser import HTMLParser

def scrape_rishon_streets():
    """Scrape street names from Rishon LeZion website"""
    url = "https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he,en-US;q=0.7,en;q=0.3',
    }
    
    print("Fetching page from Rishon LeZion website...")
    try:
        response = requests.get(url, headers=headers, timeout=60)
        response.raise_for_status()
        print(f"✓ Successfully fetched page (Status: {response.status_code})")
    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching page: {e}")
        print("\nTrying alternative methods...")
        return None
    
    html = response.text
    soup = BeautifulSoup(html, 'html.parser')
    
    streets = []
    
    # Method 1: Look for tables with street data
    tables = soup.find_all('table')
    print(f"Found {len(tables)} tables")
    
    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['td', 'th'])
            for cell in cells:
                text = cell.get_text(strip=True)
                if text and len(text) > 2:
                    # Check if it contains Hebrew characters
                    if re.search(r'[א-ת]', text):
                        streets.append(text)
    
    # Method 2: Look for lists
    lists = soup.find_all(['ul', 'ol'])
    print(f"Found {len(lists)} lists")
    
    for list_elem in lists:
        items = list_elem.find_all('li')
        for item in items:
            text = item.get_text(strip=True)
            if text and len(text) > 2 and re.search(r'[א-ת]', text):
                streets.append(text)
    
    # Method 3: Look for divs/spans with street names
    # Common patterns: רחוב, שדרות, דרך, כיכר
    street_indicators = ['רחוב', 'שדרות', 'דרך', 'כיכר', 'מעבר', 'סמטה']
    for indicator in street_indicators:
        elements = soup.find_all(string=re.compile(indicator))
        for elem in elements:
            parent = elem.parent
            if parent:
                text = parent.get_text(strip=True)
                if text and text not in streets:
                    streets.append(text)
    
    # Method 4: Extract all Hebrew text segments that might be street names
    all_text = soup.get_text()
    # Look for patterns like: רחוב [name], שדרות [name], דרך [name]
    patterns = [
        r'רחוב\s+([א-ת\s]+?)(?:\s|$|,|\.)',
        r'שדרות\s+([א-ת\s]+?)(?:\s|$|,|\.)',
        r'דרך\s+([א-ת\s]+?)(?:\s|$|,|\.)',
        r'כיכר\s+([א-ת\s]+?)(?:\s|$|,|\.)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, all_text)
        for match in matches:
            street_name = match.strip()
            if street_name and len(street_name) > 1:
                streets.append(street_name)
    
    # Clean and deduplicate
    unique_streets = []
    seen = set()
    for street in streets:
        cleaned = street.strip()
        if cleaned and cleaned not in seen and len(cleaned) > 1:
            seen.add(cleaned)
            unique_streets.append(cleaned)
    
    print(f"\n✓ Found {len(unique_streets)} unique street names")
    return unique_streets


def create_street_entries(street_names):
    """Convert street names to JSON entries with English transliteration"""
    entries = []
    
    # Common street name patterns and their English equivalents
    # This is a basic transliteration - you may want to improve this
    transliteration_map = {
        'הרצל': 'Herzl',
        'בן גוריון': 'Ben Gurion',
        'ויצמן': 'Weizmann',
        'רוטשילד': 'Rothschild',
        'נירים': 'Nirim',
        'שלמה אלירז': 'Shlomo Eliraz',
        'אלירז': 'Eliraz',
        'שלמה': 'Shlomo',
    }
    
    for street_he in street_names:
        # Remove common prefixes for matching
        street_clean = street_he.replace('רחוב', '').replace('שדרות', '').replace('דרך', '').replace('כיכר', '').strip()
        
        # Try to find English transliteration
        street_en = transliteration_map.get(street_clean, street_clean)
        
        # Create multiple variations
        entries.append({"en": street_en, "he": street_he})
        
        # Add variations with prefixes
        if 'רחוב' not in street_he and 'שדרות' not in street_he and 'דרך' not in street_he:
            entries.append({"en": f"Rehov {street_en}", "he": f"רחוב {street_he}"})
            entries.append({"en": street_en, "he": street_he})
    
    return entries


def generate_kotlin_code(street_entries):
    """Generate Kotlin code snippet for MainActivity.kt"""
    lines = ['            // RISHON LEZION STREETS - Complete Official List']
    lines.append('            // Scraped from: https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx')
    lines.append('')
    
    # Group entries for better formatting
    for i, entry in enumerate(street_entries):
        en = entry['en'].replace('"', '\\"')
        he = entry['he'].replace('"', '\\"')
        lines.append(f'            {{"en": "{en}", "he": "{he}"}}' + (',' if i < len(street_entries) - 1 else ''))
    
    return '\n'.join(lines)


def main():
    print("=" * 80)
    print("Rishon LeZion Streets Scraper")
    print("=" * 80)
    print()
    
    # Try to install BeautifulSoup4 if not available
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Installing BeautifulSoup4...")
        import subprocess
        subprocess.check_call(['pip', 'install', 'beautifulsoup4', '--quiet'])
        from bs4 import BeautifulSoup
    
    street_names = scrape_rishon_streets()
    
    if not street_names:
        print("\n⚠ Could not scrape streets automatically.")
        print("\nAlternative: Please manually copy the street names from the website")
        print("and save them to a file, then run this script with --manual flag")
        return
    
    print(f"\nSample streets found:")
    for street in street_names[:10]:
        print(f"  - {street}")
    
    # Create JSON entries
    street_entries = create_street_entries(street_names)
    
    # Save to JSON file
    output = {
        "streets": street_entries,
        "source": "https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx",
        "total_count": len(street_entries)
    }
    
    with open('rishon_streets.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Saved {len(street_entries)} street entries to rishon_streets.json")
    
    # Generate Kotlin code
    kotlin_code = generate_kotlin_code(street_entries)
    with open('rishon_streets_kt.txt', 'w', encoding='utf-8') as f:
        f.write(kotlin_code)
    
    print("✓ Generated Kotlin code snippet in rishon_streets_kt.txt")
    print("\nNext steps:")
    print("1. Review rishon_streets.json to verify the data")
    print("2. Copy the contents of rishon_streets_kt.txt")
    print("3. Replace the streets array in MainActivity.kt with the new data")


if __name__ == '__main__':
    main()
