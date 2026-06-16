import os
import json
import time
import re
from datetime import datetime
import urllib.request
import feedparser
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

CACHE_FILE = 'releases_cache.json'
CACHE_EXPIRY_SECONDS = 3600  # Cache for 1 hour by default
FEED_URL = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'

def clean_text(text):
    """Clean extra whitespaces and newlines from text."""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_entry_content(html_content):
    """Split the HTML content of an entry by h3 tags into individual updates."""
    if not html_content:
        return []
        
    soup = BeautifulSoup(html_content, 'html.parser')
    updates = []
    
    current_type = None
    current_html = []
    
    # We want to iterate through all children elements in order
    for element in soup.children:
        # Check if the child is a tag or navigable string
        if element.name == 'h3':
            # If we already have a parsed update, save it
            if current_type:
                html_str = ''.join(str(e) for e in current_html)
                # Parse text representation for tweeting
                temp_soup = BeautifulSoup(html_str, 'html.parser')
                text_content = clean_text(temp_soup.get_text())
                
                updates.append({
                    'type': current_type,
                    'html': html_str,
                    'text': text_content
                })
            
            # Start a new update
            current_type = element.get_text().strip()
            current_html = []
        else:
            # If we have started an update, append content
            if current_type:
                current_html.append(element)
                
    # Save the last update
    if current_type:
        html_str = ''.join(str(e) for e in current_html)
        temp_soup = BeautifulSoup(html_str, 'html.parser')
        text_content = clean_text(temp_soup.get_text())
        
        updates.append({
            'type': current_type,
            'html': html_str,
            'text': text_content
        })
        
    return updates

def fetch_and_parse_feed():
    """Fetch the RSS feed and parse it into structured data."""
    try:
        # Set a user-agent to avoid potential blocks
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            feed_data = response.read()
            
        feed = feedparser.parse(feed_data)
        
        entries = []
        for i, entry in enumerate(feed.entries):
            # The title of the entry is the date (e.g. "June 15, 2026")
            date_str = entry.get('title', 'Unknown Date')
            entry_id = entry.get('id', f'entry-{i}')
            updated_str = entry.get('updated', '')
            link = entry.get('link', 'https://cloud.google.com/bigquery/docs/release-notes')
            
            content_html = ""
            if 'content' in entry and len(entry.content) > 0:
                content_html = entry.content[0].value
            elif 'summary' in entry:
                content_html = entry.summary
                
            updates = parse_entry_content(content_html)
            
            # If BeautifulSoup parsing yielded nothing, create a fallback single update
            if not updates and content_html:
                temp_soup = BeautifulSoup(content_html, 'html.parser')
                updates.append({
                    'type': 'Update',
                    'html': content_html,
                    'text': clean_text(temp_soup.get_text())
                })
                
            # Add an ID to each update
            for idx, update in enumerate(updates):
                update['id'] = f"{entry_id}-u-{idx}"
                
            entries.append({
                'id': entry_id,
                'date': date_str,
                'updated': updated_str,
                'link': link,
                'updates': updates
            })
            
        return {
            'status': 'success',
            'fetched_at': datetime.utcnow().isoformat() + 'Z',
            'entries': entries
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': str(e)
        }

def get_releases(force_refresh=False):
    """Get releases, using cache unless expired or force_refresh is True."""
    # Check if cache file exists
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache_data = json.load(f)
                
            # Check if cache is still fresh
            fetched_time_str = cache_data.get('fetched_at')
            if fetched_time_str:
                # Parse ISO format fetched_at
                if fetched_time_str.endswith('Z'):
                    fetched_time_str = fetched_time_str[:-1]
                fetched_time = datetime.fromisoformat(fetched_time_str)
                age = (datetime.utcnow() - fetched_time).total_seconds()
                
                if age < CACHE_EXPIRY_SECONDS:
                    cache_data['from_cache'] = True
                    return cache_data
        except Exception:
            # If reading cache fails, proceed to fetch fresh
            pass
            
    # Fetch fresh data
    data = fetch_and_parse_feed()
    if data['status'] == 'success':
        # Write to cache
        try:
            with open(CACHE_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            # Non-blocking error if we can't write to cache
            print(f"Error writing cache: {e}")
            
    data['from_cache'] = False
    return data

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    result = get_releases(force_refresh=force_refresh)
    
    if result['status'] == 'error':
        # If fetch fails but cache file exists, return cache as a fallback
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r') as f:
                    cache_data = json.load(f)
                cache_data['from_cache'] = True
                cache_data['warning'] = f"Failed to fetch live feed ({result['message']}). Serving cached data."
                return jsonify(cache_data)
            except Exception:
                pass
        return jsonify(result), 500
        
    return jsonify(result)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
