# AXO Assistant — V16 — Pydroid 3 / Render

A Flask-backed personal assistant with a chat-first interface, local conversation history, inline rich results, voice input and optional AI chat through OpenRouter, Google Gemini, OpenAI, Groq or a custom OpenAI-compatible endpoint.

## What is included

- ChatGPT-style chat layout with a compact sidebar, recent conversations and message composer.
- Conversation history saved automatically in the browser's Local Storage.
- Reopen, search, and delete individual conversations; clear all history from Settings.
- Images, maps, weather, Wikipedia cards, news and other structured results appear inside the conversation instead of a separate floating results panel.
- Microphone input using browser speech recognition (Chrome on Android is recommended).
- First-visit name setup, local-time greetings, optional spoken greeting and original welcome chime.
- Full-page Settings with profile, theme/accent/text size, compact/reduced-motion options, voice controls, media/search defaults, notification preference, AI provider/model selection, and integration shortcuts.
- Optional spoken replies, selectable voice-input language, light/dark/system appearance, and Enter-to-send preference.
- One-tap shortcuts for Google Workspace, Microsoft 365, team/project tools, developer platforms, AI services, media services and Firebase Console (website shortcuts, not account-level OAuth integrations).
- Display-only “show me …” search results are kept separate from “play …” and “watch …” actions.
- Existing News, API library, Music, Videos and Notes sections are retained.
- Existing `musicLibrary.py` and `videosLibrary.py` are preserved unchanged.
- Shared AI adapter for browser-saved keys and private environment keys, with provider detection, model listing, clear error messages, and a fallback to known model defaults if a selected model ID is unavailable.

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

The AI adapter appends `/chat/completions` when a custom API URL ends in `/v1`; you may also provide the full endpoint explicitly. AXO has built-in defaults for the supported providers. You can choose a model or fetch available model IDs from Settings → AI & API. Keep `.env` private and never commit real keys.

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
- `templates/index.html` — AXO interface and full-page Settings
- `static/style.css` — responsive theme and interface styles
- `static/app.js` — chat, local history, inline results, settings and voice input

## Notes

- Browser voice input depends on browser support and microphone permission. Typing remains available.
- Browsers and Android WebViews may block sound or automatic tabs until the user interacts with the page. AXO retries its greeting on first interaction; allow pop-ups for automatic link opening. A third-party search page may require the user to press Play itself.
- Chat history, preferences and connection keys are browser-local; they do not sync automatically. Saved API/integration keys are not encrypted by Local Storage. Clear them from Settings → Data before using a shared device.
- Edge TTS requires an internet connection; browser speech synthesis is used as a fallback.
- Local Storage is browser-side storage, not encrypted cloud backup. Avoid entering passwords or other secrets into chat.


## AXO v16 updates

- ChatGPT, Claude and Gemini are available as browser-based links in Apps and Settings. They do not need an AXO API key to open. The optional context handoff copies only recent chat messages, saved AXO notes and approved memories after the user taps the relevant button; the user pastes the copied text into the external site. AXO cannot read or control private conversations inside those services.
- Questions such as “what is …?” and “who is …?” now try Wikipedia first without an AI key. If Wikipedia has no usable result, AXO tries the public DuckDuckGo HTML search endpoint. If both public sources fail, the request can continue to the configured AI provider.
- Public web search now returns source-linked result cards when the anonymous search endpoint returns usable records, with a selected-engine browser link as a fallback.
- Settings includes a plugin gallery with public endpoints for books, definitions, related words, GitHub repositories, TV, anime, country facts, species and spaceflight news. Add a built-in plugin, enter a query and press Run to call its fixed public endpoint directly without an AXO AI key. Natural-language tool selection still needs an AI provider key. Custom plugin endpoints remain HTTPS-only.
- Privacy details and an expanded About AXO / AXO Bots guide explain browser storage, credential handling, public lookups, external AI handoff, server storage, bots, tools and the limits of browser shortcuts.

### Browser AI and privacy notes

The browser AI handoff is a manual copy-and-open convenience, not a deep integration or API connection. It cannot automatically transfer live Firebase, Gmail or third-party account contents. Review the context before pasting it into an external AI service. Local browser storage, including saved credentials in this build, is not encrypted by AXO. Use a private device and clear keys before handing the device to someone else.

### Public search behaviour

The encyclopedia path is source-first: a clear Wikipedia summary is shown with its source link. If unavailable, AXO tries public search. Search providers can change their HTML, throttle requests or block automated access; when no result cards are returned AXO falls back to the chosen search-engine page or configured AI connection where available. Check original sources for important claims.

### User data files

The release ZIP intentionally excludes `notes.json` and any `.env` file so saved personal notes and local secrets are not bundled into a code archive. The app will recreate its notes file when a note is saved. Keep a private backup of any existing `notes.json` you need to preserve; do not commit it to GitHub.
