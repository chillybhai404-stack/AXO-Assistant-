# AXO Assistant — V18 — Pydroid 3 / Render

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

## AXO Local Model Library (V18 update)

- Open **Model library** from the sidebar to see three starter GGUF models. The weights are not bundled in the project; users download a selected file from its publisher when they choose it.
- Search uses the public Hugging Face model API and filters repository names to models whose parameter count can be identified as 14B or smaller. This is a catalogue filter, not a guarantee that every result will run on the current device.
- GGUF files are stored in the browser's Origin Private File System (OPFS), with a small model registry in IndexedDB. Clear browser/site data and the downloaded models may be removed.
- The local runtime uses `@wllama/wllama` 3.13.0 from jsDelivr. An internet connection is required the first time the runtime module/WASM is fetched. Actual model inference is intended to run on-device after the GGUF file has been downloaded.
- The browser build downloads single GGUF files smaller than 1.85 GB and complete split-model groups when every shard is below 1.85 GB. An oversized single-file GGUF cannot be loaded through this browser path. Wllama documents a 2GB ArrayBuffer limit for a single file and supports loading split models from multiple blobs.
- **AI runtime** in Settings supports Auto, Local model only, and API only. Auto prefers a loaded local model and otherwise uses the existing API path. API mode and existing provider settings remain available.
- Local tool use can search the public web, look up Wikipedia, run supported built-in AXO commands, set one-time reminders and create daily/one-time in-app schedules. Schedules run while AXO is open. Account-bound integrations and full connected-account agent workflows should use API mode; the existing API confirmation flow remains unchanged.
- Web search sends the search query to AXO's backend and the public search provider. Normal local-model prompts and chat context are passed to the local browser runtime rather than the AXO server. Review connected-service and public-search privacy before use.
- For responsive local inference, the Flask server adds Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers so Chromium can enable SharedArrayBuffer/threaded WebAssembly where supported. Browsers may still fall back to single-thread mode. WebGPU is runtime/device-dependent.
- The discovery filter is capped at 14B parameters, but a 14B catalogue entry does not imply that it will run on a phone. Memory and storage usage depend on quantization, context length, runtime overhead and other apps. This device-specific limit is not inferred automatically. For larger models, prefer API mode or a suitable native inference runtime.

### Local model starter catalogue

The starter list is metadata-only and points to the publishers' public Hugging Face repositories: Qwen2.5 0.5B Instruct Q4_K_M, Qwen2.5 1.5B Instruct Q4_K_M, and Qwen2.5 Coder 3B Instruct Q3_K_M. Confirm the current repository file list and licence before redistribution; AXO downloads the files for personal use and does not redistribute model weights.

### Testing note

Static checks cover Python compilation and JavaScript syntax. This source bundle has not been run on physical Android hardware here, and the live Hugging Face download, Wllama CDN/WASM initialization, real GGUF inference, OPFS quota behavior, WebGPU availability, and tool-calling quality remain runtime tests to perform after deployment. Local tool calling also depends on the selected model's support for structured tool-call output.


## V19 local-model fixes

- Local inference now enables Wllama Jinja chat templates and uses a mobile-oriented 1536-token context.
- Ordinary chat no longer attaches tool schemas to every request; tool schemas are attached only to clear web/search/weather/reminder/scheduling requests. Empty streams retry once as a non-streaming completion, and real errors are surfaced in chat.
- The previously selected local model auto-loads on startup once first-run setup has completed.
- First-run onboarding now requires downloading and loading one starter GGUF model before setup finishes.
- Downloads and model loading use a centered progress dialog with byte count, percentage and cancel control.
- The chat composer now has an Auto/API/local-model switcher directly below the message input. API mode remains available.
- Static cache version bumped to v19 to avoid stale JS/CSS after deployment.

The browser runtime still cannot be guaranteed to match a native Android inference app such as PocketPal. Multi-threaded WASM depends on browser support and cross-origin isolation; large models remain hardware-dependent. Actual GGUF execution and Android timing require device testing after deployment.


## V20 local inference and onboarding fixes

- Normal local chat no longer attaches function schemas to every prompt; tools are attached only to explicit action/search requests.
- Local chat uses the GGUF Jinja template, streams text, and retries with a non-streaming completion if streaming errors or returns no text.
- Model loading attempts WebGPU acceleration when supported, then retries CPU-only with a smaller context if the mobile GPU cannot allocate the model.
- The first-run onboarding cannot finish until a starter model has downloaded and loaded. The download dialog displays transferred bytes and percentage, and loading has a separate indeterminate state.
- The composer has a Claude-style model selector for Auto, API and downloaded local models. Auto mode can hand live/connected-account actions to the configured API agent.
- Static asset cache is bumped to V20 to prevent old local inference scripts staying in the service worker.

Validation completed in the build environment: JavaScript syntax checks, Python compilation, HTML duplicate-ID checks and ZIP integrity. Actual GGUF loading, Android WebGPU availability, token speed and API tool execution still require on-device testing.
