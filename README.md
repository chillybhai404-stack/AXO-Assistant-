# AXO Assistant — Pydroid 3 / Render

A Flask-backed personal assistant with a simple chat-first interface, local conversation history, inline rich results, voice input and optional AI chat through OpenRouter or another OpenAI-compatible endpoint.

## What is included

- ChatGPT-style chat layout with a compact sidebar, recent conversations and message composer.
- Conversation history saved automatically in the browser's Local Storage.
- Reopen, search, and delete individual conversations; clear all history from Settings.
- Images, maps, weather, Wikipedia cards, news and other structured results appear inside the conversation instead of a separate floating results panel.
- Microphone input using browser speech recognition (Chrome on Android is recommended).
- Optional spoken replies, selectable voice-input language, light/dark/system appearance, and Enter-to-send preference.
- Existing News, API library, Music, Videos and Notes sections are retained.
- Existing `musicLibrary.py` and `videosLibrary.py` are preserved unchanged.
- OpenRouter-compatible AI adapter: a base URL ending in `/v1` is automatically completed with `/chat/completions`.

## Run on Android with Pydroid 3

1. Extract the ZIP.
2. Install dependencies in Pydroid:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and add your keys. The `.env` file is ignored by Git.
4. Run `main.py` in Pydroid 3.
5. Open `http://127.0.0.1:5000` in Chrome on the same phone.

Example `.env` values:

```env
AI_PROVIDER=openrouter
AI_MODEL=openrouter/free
AI_API_URL=https://openrouter.ai/api/v1
AI_API_KEY=your_new_openrouter_key
NEWS_API_KEY=your_newsapi_key
```

The backend appends `/chat/completions` when the AI URL ends in `/v1`. You may also provide the full endpoint explicitly. Keep `.env` private and never commit real keys.

## Deploy on Render

Create a **Web Service** for the GitHub repository.

- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn main:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`

Add these environment variables in Render's Environment settings:

- `AI_PROVIDER` = `openrouter`
- `AI_MODEL` = `openrouter/free`
- `AI_API_URL` = `https://openrouter.ai/api/v1`
- `AI_API_KEY` = your newly generated OpenRouter key
- `NEWS_API_KEY` = your NewsAPI key (optional)

Do not store credentials in `static/app.js`, HTML, or a public GitHub commit. If a key has already been shared or committed publicly, revoke it and create a replacement.

## Local chat storage

Chat conversations and UI preferences are stored in the browser's Local Storage for the current site origin. They survive page refreshes and browser restarts, but they are not synced to another browser or device and can be lost if browser site data is cleared. AI conversation context is sent with each request using recent messages from the currently selected conversation; Local Storage itself is not sent to the server as a database.

## Existing data providers

The command router includes integrations such as Open-Meteo, Wikipedia, Openverse, Wikimedia Commons, NASA Images, Nominatim, USGS, ISS tracking, Frankfurter, Nager.Date, GitHub, Open Library, Gutendex, TheMealDB, DictionaryAPI, REST Countries, Spaceflight News, NASA EONET, GBIF, Datamuse, World Bank, PokéAPI, Open Trivia DB and Sunrise-Sunset. Public providers can change, rate-limit requests or temporarily go offline; not every catalogue entry represents a separate live integration.

Maps use Leaflet, Esri World Imagery and OpenStreetMap tiles. Attribution is shown in the map card. Image results link back to their source; check each item's licence before reusing it outside the app.

## Project files

- `main.py` — Flask routes, command routing and provider adapters
- `api_catalog.py` — API directory
- `config.py` — non-secret configuration and `.env` loader
- `.env.example` — safe environment-variable template
- `musicLibrary.py`, `videosLibrary.py` — preserved media shortcuts
- `templates/index.html` — AXO interface and Settings dialog
- `static/style.css` — responsive theme and interface styles
- `static/app.js` — chat, local history, inline results, settings and voice input

## Notes

- Browser voice input depends on browser support and microphone permission. Typing remains available.
- Edge TTS requires an internet connection; browser speech synthesis is used as a fallback.
- Local Storage is browser-side storage, not encrypted cloud backup. Avoid entering passwords or other secrets into chat.
