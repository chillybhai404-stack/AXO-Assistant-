# AXO Web — Pydroid 3 Intelligence Build

A browser-based assistant with a local Python/Flask backend and a redesigned holographic command-centre interface. Designed to run on Android in Pydroid 3 and open in Chrome at `http://127.0.0.1:5000`.

## What changed

### Command understanding
AXO now routes common natural-language variants to the same data intent. Examples:

- `What's the weather in Srinagar?`
- `Weather at Srinagar`
- `Show Srinagar in satellite view`
- `Show me pictures of Saturn`
- `Tell me about black holes`
- `Show me today's headlines`
- `Convert 100 USD to INR`
- `Where is the ISS?`
- `Show earthquakes today`
- `Find Python repositories on GitHub`
- `Find books about astronomy`
- `Give me a trivia question`
- `Sunrise in Srinagar`

The router handles weather, image, map, Wikipedia, dictionary, news, earthquake, ISS, currency, holidays, country, public-indicator, GitHub, books, recipes, sunrise/sunset, NASA Earth events, biodiversity, Pokémon and trivia requests before trying the optional general AI endpoint.

### Visual interface
- Dark cinematic interface with a reactive gold holographic core.
- Core states for idle, voice listening, processing and spoken response.
- Weather, Wikipedia, image galleries, maps, news and structured data render inline inside the chat message that requested them.
- Chat mode shows user messages, a live thinking indicator, the answer, result cards and source identities in one conversation thread.
- Node mode keeps voice requests and spoken answers off the chat transcript.
- Satellite-first Leaflet map with street-map toggle.
- Image cards open their original source pages in a new tab.
- Responsive layout for Android screens and desktop browsers.

### Public data and image providers
Live integrations include:
- Open-Meteo weather and geocoding
- Wikipedia REST and MediaWiki search
- Openverse, Wikimedia Commons and NASA Image and Video Library
- Nominatim geocoding and Leaflet maps
- Esri World Imagery satellite tiles and OpenStreetMap street tiles
- NewsAPI when configured, with a keyless Google News RSS fallback
- USGS earthquakes
- Where the ISS at
- Frankfurter currency rates
- Nager.Date public holidays
- GitHub public repository search
- Open Library and Gutendex book discovery
- TheMealDB recipe search (its free development/test key `1` is used)
- Free Dictionary API
- REST Countries
- Spaceflight News API
- NASA EONET natural events
- GBIF species taxonomy
- World Bank indicators
- Datamuse word relations
- Sunrise-Sunset
- PokéAPI and Open Trivia DB

The API Atlas contains **116 documented endpoint/capability entries across 28 provider families**. These are catalogue entries, not 116 separate servers or guarantees that every endpoint is called automatically. The live command router integrates the sources listed above. Providers have different quotas and terms; a few free development tiers use a public test key or may ask you to register. The atlas links to each provider's documentation.

## Install on Pydroid 3

1. Extract the ZIP into a folder on your phone.
2. Open Pydroid 3 and install the Python packages:
   ```bash
   pip install flask requests
   ```
3. Open `main.py` in Pydroid 3 and tap **Run**.
4. Keep the Python process running and open Chrome on the same device:
   `http://127.0.0.1:5000`

Stop the backend by stopping the running script in Pydroid 3.

## NewsAPI configuration

`config.py` is the private local configuration file. The supplied V4 project currently has a non-placeholder `NEWS_API_KEY` value in that file, so AXO attempts NewsAPI first. The key itself is intentionally not copied into this README. Keep `config.py` private and do not publish it or share screenshots containing the key.

The News page now labels the provider that actually returned the stories. When NewsAPI rejects the key, returns no results, or is unavailable, AXO falls back to Google News RSS and shows a diagnostic note explaining why. RSS is keyless and can return different categories or article availability.

## Optional general AI endpoint

The public-data command engine does not require an AI key. For open-ended conversation, configure a compatible provider in `config.py`:

```python
AI_API_URL = "https://your-provider.example/api/chat"
AI_API_KEY = "your-provider-key"
AI_MODEL = "your-model-name"
```

The adapter expects a chat-style JSON request and supports common response fields. Different providers may need a small adapter change. Keep credentials in the Python backend and never place them in `static/app.js`.

## Voice and maps

- Voice input uses browser Speech Recognition. Chrome on Android may request microphone permission; typing always remains available.
- Spoken replies use browser Speech Synthesis.
- Leaflet is loaded from a CDN. A network connection is needed for the map library and map tiles.
- Satellite tiles are supplied by Esri World Imagery; coverage and maximum zoom vary by region. Street tiles use OpenStreetMap.
- Geocoding uses the public Nominatim service with a local result cache and a request delay. Its public service is rate-limited; avoid rapid repeated map searches.
- Map providers require visible attribution. The map displays Esri and OpenStreetMap attribution.
- Image results may include Creative Commons or public-domain media. Check the original source page and licence before reusing an image outside the app.

## Preserved project assets

- `musicLibrary.py` is kept unchanged, including the original `stealth`, `march`, `skyfall`, and `wolf` URLs.
- `videosLibrary.py` is kept unchanged, including all original topic shortcuts.
- Original NewsAPI support is retained, with a fallback feed.
- Existing local notes, calculator, website shortcuts, and optional AI adapter remain available.

## Files

- `main.py` — Flask routes, command understanding and API adapters
- `api_catalog.py` — 116 API endpoint/capability directory entries
- `config.py` — private optional provider settings
- `musicLibrary.py` — saved music links
- `videosLibrary.py` — saved video shortcuts
- `templates/index.html` — command-centre interface
- `static/style.css` — holographic visual system and responsive layout
- `static/app.js` — voice interaction, result cards, maps and API atlas

## Notes

- Public APIs can change, rate-limit requests or temporarily go offline. AXO reports provider errors rather than inventing results.
- Free access does not mean unlimited access or permission to bulk-download data.
- Keep `config.py` private. Do not expose the local Flask development server to the public internet.


## AXU Voice

AXO uses the AXU Voice profile: masculine British English (`en-GB-RyanNeural`) with a slightly slower pace and lower pitch. Install the additional dependency with `pip install -r requirements.txt`. Neural speech requires an internet connection. If the TTS service is unavailable, the browser falls back to its installed British English speech voice.


## AXO Chat and Node modes

- **Chat** keeps the user message, live processing indicator, concise answer, maps, images, news and result cards together in one conversation. Sources appear as labelled chips with provider favicons where available.
- **Node** is voice-only: spoken commands get spoken answers without printing the transcript or result. The particle field reacts to the live microphone signal. Its level is relative dBFS, not calibrated sound-pressure decibels.
- The API directory downloads the current public-apis GitHub README when online, caches it on-device, and falls back to the 116 bundled endpoint entries when no directory cache exists. Directory listings are not all integrated endpoints; inspect Auth / No-key labels and provider terms.
- Voice input uses the browser Speech Recognition API. In Chat mode, voice commands appear in the conversation just like typed commands. In Node mode, they remain voice-only.

Keep `config.py` local and do not commit it. Put your own refreshed NewsAPI key there.
