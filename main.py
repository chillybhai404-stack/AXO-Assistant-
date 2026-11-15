"""AXO Web Assistant — expanded Flask backend for Pydroid 3.

Core commands work without an AI key. Public-data providers are called only
when needed; requests are bounded, results normalized, and provider failures
fall back cleanly. Keep private keys in config.py / environment variables.
"""
from __future__ import annotations

import ast
import asyncio
import json
import operator
import re
import os
import time
import threading
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import requests
from flask import Flask, jsonify, render_template, request, Response, send_from_directory

import agent
import apps_catalog
import musicLibrary
import videosLibrary
import config
from api_catalog import API_CATALOG

BASE_DIR = Path(__file__).resolve().parent
NOTES_FILE = BASE_DIR / "notes.json"
LIBRARY_FILE = BASE_DIR / "library.json"
app = Flask(__name__)
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "AXOWebPydroid/3.0 (personal educational assistant)",
    "Accept": "application/json, text/plain, */*",
})
HTTP_TIMEOUT = 14
NOMINATIM_LAST_CALL = 0.0
NOMINATIM_LOCK = threading.Lock()
NOMINATIM_CACHE: dict[str, dict] = {}
WEATHER_CACHE: dict[str, tuple[float, dict]] = {}
IMAGE_CACHE: dict[str, tuple[float, list]] = {}
WIKI_CACHE: dict[str, tuple[float, dict]] = {}


def get_config(name: str, default=""):
    return getattr(config, name, None) or os.getenv(name, default)


def india_now():
    try:
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except Exception:
        return datetime.now()


# ---------------------------------------------------------------------------
# Editable media library (saved in library.json, defaults come from the .py files)
# ---------------------------------------------------------------------------
def load_library():
    lib = {"music": dict(musicLibrary.music), "videos": dict(videosLibrary.videos)}
    try:
        data = json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
        for kind in ("music", "videos"):
            extra = data.get(kind, {})
            if isinstance(extra, dict):
                lib[kind].update({str(k).lower(): str(v) for k, v in extra.items()})
        for kind in ("music", "videos"):
            for gone in data.get("deleted_" + kind, []):
                lib[kind].pop(gone, None)
    except Exception:
        pass
    return lib


def save_library_item(kind, name, url=None):
    try:
        data = json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    data.setdefault(kind, {})
    data.setdefault("deleted_" + kind, [])
    if url is None:  # delete
        data[kind].pop(name, None)
        if name not in data["deleted_" + kind]:
            data["deleted_" + kind].append(name)
    else:
        data[kind][name] = url
        if name in data["deleted_" + kind]:
            data["deleted_" + kind].remove(name)
    LIBRARY_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


PLATFORMS = {
    "youtube": ("https://www.youtube.com/results?search_query={q}", "https://www.youtube.com"),
    "youtube music": ("https://music.youtube.com/search?q={q}", "https://music.youtube.com"),
    "facebook": ("https://www.facebook.com/search/videos/?q={q}", "https://www.facebook.com"),
    "instagram": ("https://www.instagram.com/explore/tags/{qt}/", "https://www.instagram.com"),
    "spotify": ("https://open.spotify.com/search/{q}", "https://open.spotify.com"),
    "jiosaavn": ("https://www.jiosaavn.com/search/{q}", "https://www.jiosaavn.com"),
    "gaana": ("https://gaana.com/search/{q}", "https://gaana.com"),
    "soundcloud": ("https://soundcloud.com/search?q={q}", "https://soundcloud.com"),
    "apple music": ("https://music.apple.com/search?term={q}", "https://music.apple.com"),
    "netflix": ("https://www.netflix.com/search?q={q}", "https://www.netflix.com"),
    "tiktok": ("https://www.tiktok.com/search?q={q}", "https://www.tiktok.com"),
    "twitter": ("https://x.com/search?q={q}", "https://x.com"),
    "x": ("https://x.com/search?q={q}", "https://x.com"),
    "google": ("https://www.google.com/search?q={q}", "https://www.google.com"),
    "whatsapp": ("https://web.whatsapp.com", "https://web.whatsapp.com"),
    "gmail": ("https://mail.google.com", "https://mail.google.com"),
}


def platform_url(platform, query):
    platform = (platform or "youtube").lower().strip()
    tpl = PLATFORMS.get(platform, PLATFORMS["youtube"])[0]
    return tpl.format(q=quote_plus(query), qt=re.sub(r"\W+", "", query))


def web_search_url(query, engine="google"):
    q = quote_plus(str(query or "").strip())
    engines = {
        "google": f"https://www.google.com/search?q={q}",
        "bing": f"https://www.bing.com/search?q={q}",
        "duckduckgo": f"https://duckduckgo.com/?q={q}",
    }
    return engines.get(str(engine or "google").lower(), engines["google"])


def split_platform(key):
    """'skyfall on facebook' -> ('skyfall', 'facebook')"""
    for name in sorted(PLATFORMS, key=len, reverse=True):
        m = re.search(rf"\s+(?:on|in|at|from|using|via)\s+{re.escape(name)}$", key)
        if m:
            return key[:m.start()].strip(), name
    return key, None


def load_notes():
    try:
        if NOTES_FILE.exists():
            data = json.loads(NOTES_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        pass
    return []


def save_notes(notes):
    NOTES_FILE.write_text(json.dumps(notes, ensure_ascii=False, indent=2), encoding="utf-8")


def make_result(reply, action=None, news=None, images=None, map_data=None, cards=None, source="local", intent=None):
    result = {"reply": str(reply), "source": source}
    if action:
        result["action"] = action
    if news is not None:
        result["news"] = news
    if images is not None:
        result["images"] = images
    if map_data is not None:
        result["map"] = map_data
    if cards is not None:
        result["cards"] = cards
    if intent:
        result["intent"] = intent
    return result


def get_json(url, params=None, timeout=HTTP_TIMEOUT):
    response = SESSION.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    return response.json()


def safe_calculate(expression: str):
    allowed = {
        ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod, ast.Pow: operator.pow, ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    def evaluate(node):
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in allowed:
            left, right = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Pow) and (abs(right) > 8 or abs(left) > 1_000_000):
                raise ValueError("That exponent is too large.")
            return allowed[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in allowed:
            return allowed[type(node.op)](evaluate(node.operand))
        raise ValueError("Use only numbers and +, -, *, /, //, %, and **.")
    result = evaluate(ast.parse(expression, mode="eval"))
    if isinstance(result, float) and (result != result or abs(result) == float("inf")):
        raise ValueError("That calculation produced an invalid number.")
    return result


# ---------------------------------------------------------------------------
# Search normalization / intent extraction
# ---------------------------------------------------------------------------
FILLER = re.compile(
    r"^(?:(?:hey\s+)?jarvis[\s,:-]*)?(?:(?:can you|could you|would you|please|"
    r"tell me|show me|find me|search for|look up|i want to know|what is|what's|"
    r"who is|who's|give me|explain|about)\s+)+",
    re.I,
)


def clean_query(value: str) -> str:
    value = re.sub(r"[?!.,]+$", "", str(value or "").strip())
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"^(?:the|a|an)\s+", "", value, flags=re.I)
    return value[:180].strip()


def extract_subject(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return clean_query(match.group(1))
    cleaned = FILLER.sub("", text.strip())
    cleaned = re.sub(r"^(?:weather|forecast|temperature|images?|pictures?|photos?|"
                     r"wikipedia|wiki|information|details|map|maps|locate|location)\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"^(?:in|at|for|of|about)\s+", "", cleaned, flags=re.I)
    return clean_query(cleaned)


def detect_location_query(text: str, kind: str) -> str:
    base = r"(?:weather|forecast|temperature|rain|snow|humidity|wind|map|maps|satellite|location|locate|show)"
    patterns = [
        rf"\b{base}\b\s+(?:like\s+)?(?:in|at|for|of)\s+(.+)$",
        rf"\b(?:in|at|over|around|near)\s+(.+?)\s+(?:weather|forecast|map|satellite)\b",
        r"\b(?:show|find|locate|map|where is|where's)\s+(?:me\s+)?(?:the\s+)?(.+?)(?:\s+on\s+(?:the\s+)?map)?$",
    ]
    if kind == "weather":
        patterns = [
            r"\b(?:weather|forecast|temperature|rain|snow|humidity|wind)\b(?:\s+(?:like|today|tomorrow|now|currently))?\s+(?:in|at|for|of)\s+(.+)$",
            r"\b(?:in|at|for)\s+(.+?)\s+(?:weather|forecast|temperature)\b",
            r"\b(?:weather|forecast|temperature)\s+(.+)$",
            r"\bwill it (?:rain|snow)\s+(?:in|at)\s+(.+)$",
        ]
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.I)
        if m:
            candidate = clean_query(m.group(1))
            candidate = re.sub(r"\s+(?:today|tomorrow|right now|now)$", "", candidate, flags=re.I)
            if candidate:
                return candidate
    return ""


# ---------------------------------------------------------------------------
# News: NewsAPI first, then keyless Google News RSS fallback
# ---------------------------------------------------------------------------
NEWS_TOPICS = {
    "general": "HEADLINES", "business": "BUSINESS", "technology": "TECHNOLOGY",
    "science": "SCIENCE", "sports": "SPORTS", "entertainment": "ENTERTAINMENT",
    "health": "HEALTH",
}


def fetch_google_news(category="general", query=None):
    topic = NEWS_TOPICS.get(category, "HEADLINES")
    if query:
        url = "https://news.google.com/rss/search"
        params = {"q": query, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
    else:
        url = f"https://news.google.com/rss/headlines/section/topic/{topic}"
        params = {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
    try:
        response = SESSION.get(url, params=params, timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        articles = []
        for item in root.findall(".//item")[:10]:
            title = item.findtext("title") or ""
            link = item.findtext("link") or ""
            if not title or not link:
                continue
            source_node = item.find("source")
            articles.append({
                "title": title, "source": source_node.text if source_node is not None else "Google News",
                "description": "", "url": link, "image": "",
                "published": item.findtext("pubDate") or "",
            })
        return articles, None
    except (requests.RequestException, ET.ParseError) as exc:
        return None, f"Keyless news feed unavailable: {exc}"


def fetch_news(category="general"):
    category = str(category or "general").lower().strip()
    if category not in NEWS_TOPICS:
        category = "general"
    api_key = get_config("NEWS_API_KEY")
    articles = None
    if api_key and "PASTE" not in api_key:
        try:
            response = SESSION.get(
                "https://newsapi.org/v2/top-headlines",
                params={"country": "in", "category": category, "pageSize": 10, "apiKey": api_key},
                timeout=HTTP_TIMEOUT,
            )
            data = response.json()
            if response.ok and data.get("status") == "ok":
                articles = [{
                    "title": x.get("title") or "Untitled",
                    "source": (x.get("source") or {}).get("name") or "News source",
                    "description": x.get("description") or "", "url": x.get("url") or "",
                    "image": x.get("urlToImage") or "", "published": x.get("publishedAt") or "",
                } for x in data.get("articles", []) if x.get("title")]
        except (requests.RequestException, ValueError, TypeError):
            articles = None
    if articles:
        return articles, None
    fallback, error = fetch_google_news(category)
    if fallback:
        return fallback, None
    if error:
        return None, error
    return [], None


# ---------------------------------------------------------------------------
# Location, maps and weather
# ---------------------------------------------------------------------------
def geocode_location(query: str):
    global NOMINATIM_LAST_CALL
    query = clean_query(query)
    key = query.lower()
    if not key:
        raise ValueError("Tell me the place name.")
    if key in NOMINATIM_CACHE:
        return NOMINATIM_CACHE[key]
    with NOMINATIM_LOCK:
        wait = 1.05 - (time.monotonic() - NOMINATIM_LAST_CALL)
        if wait > 0:
            time.sleep(wait)
        response = SESSION.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1},
            headers={"User-Agent": "AXOWebPydroid/3.0 (personal educational project)"},
            timeout=HTTP_TIMEOUT,
        )
        NOMINATIM_LAST_CALL = time.monotonic()
        response.raise_for_status()
        items = response.json()
    if not items:
        raise ValueError(f"I couldn't find a mapped place called {query}. Try adding its district or country.")
    item = items[0]
    result = {
        "name": item.get("name") or query,
        "display_name": item.get("display_name") or query,
        "lat": float(item["lat"]), "lon": float(item["lon"]),
        "type": item.get("type", ""), "osm_type": item.get("osm_type", ""),
        "osm_id": item.get("osm_id"),
        "address": item.get("address", {}),
    }
    NOMINATIM_CACHE[key] = result
    return result


def geocode_weather_location(query: str):
    data = get_json("https://geocoding-api.open-meteo.com/v1/search",
                    {"name": query, "count": 5, "language": "en", "format": "json"})
    results = data.get("results") or []
    if not results:
        raise ValueError(f"I couldn't identify {query} as a place. Try a nearby city.")
    # Prefer a populated locality and the first relevant exact match.
    item = results[0]
    return {
        "name": item.get("name") or query,
        "display_name": ", ".join(x for x in [item.get("name"), item.get("admin1"), item.get("country")] if x),
        "lat": float(item["latitude"]), "lon": float(item["longitude"]),
        "timezone": item.get("timezone", "auto"), "country": item.get("country", ""),
    }


WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Drizzle",
    55: "Dense drizzle", 56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Slight rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain",
    67: "Heavy freezing rain", 71: "Slight snow", 73: "Snow", 75: "Heavy snow",
    77: "Snow grains", 80: "Rain showers", 81: "Moderate rain showers",
    82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
}


def get_weather(location: str):
    place = geocode_weather_location(location)
    cache_key = f"{place['lat']:.3f},{place['lon']:.3f}"
    cached = WEATHER_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < 600:
        forecast = cached[1]
    else:
        raw = get_json("https://api.open-meteo.com/v1/forecast", {
            "latitude": place["lat"], "longitude": place["lon"],
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,weather_code",
            "forecast_days": 3, "timezone": place.get("timezone") or "auto",
        })
        current = raw.get("current", {})
        daily = raw.get("daily", {})
        forecast = {
            "temperature": current.get("temperature_2m"),
            "feels_like": current.get("apparent_temperature"),
            "humidity": current.get("relative_humidity_2m"),
            "wind": current.get("wind_speed_10m"),
            "precipitation": current.get("precipitation"),
            "condition": WEATHER_CODES.get(current.get("weather_code"), "Current conditions"),
            "is_day": current.get("is_day", 1),
            "high": (daily.get("temperature_2m_max") or [None])[0],
            "low": (daily.get("temperature_2m_min") or [None])[0],
            "rain_chance": (daily.get("precipitation_probability_max") or [None])[0],
            "sunrise": (daily.get("sunrise") or [""])[0],
            "sunset": (daily.get("sunset") or [""])[0],
            "updated": current.get("time", ""),
            "timezone": raw.get("timezone", place.get("timezone", "auto")),
        }
        WEATHER_CACHE[cache_key] = (time.time(), forecast)
    forecast["location"] = place["display_name"]
    forecast["lat"] = place["lat"]
    forecast["lon"] = place["lon"]
    return forecast


# ---------------------------------------------------------------------------
# Wikipedia and visual search
# ---------------------------------------------------------------------------
def wikipedia_search(query: str):
    key = query.lower().strip()
    cached = WIKI_CACHE.get(key)
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    # REST summary is quick and returns a thumbnail when a page is unambiguous.
    slug = quote_plus(query.replace(" ", "_"))
    try:
        summary = get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}")
        if summary.get("extract") and summary.get("type") not in ("disambiguation", "not_found"):
            result = {
                "title": summary.get("title") or query, "extract": summary.get("extract"),
                "url": (summary.get("content_urls") or {}).get("desktop", {}).get("page")
                       or f"https://en.wikipedia.org/wiki/{slug}",
                "image": (summary.get("thumbnail") or {}).get("source", ""),
                "description": summary.get("description", ""),
            }
            WIKI_CACHE[key] = (time.time(), result)
            return result
    except (requests.RequestException, ValueError):
        pass
    # Search API fallback handles redirects and ambiguous titles.
    data = get_json("https://en.wikipedia.org/w/api.php", {
        "action": "query", "generator": "search", "gsrsearch": query, "gsrlimit": 5,
        "prop": "extracts|pageimages|info", "exintro": 1, "explaintext": 1,
        "inprop": "url", "pithumbsize": 900, "format": "json", "formatversion": 2,
    })
    pages = (data.get("query") or {}).get("pages") or []
    if not pages:
        raise ValueError(f"No Wikipedia article found for {query}.")
    page = pages[0]
    extract = page.get("extract") or ""
    if not extract:
        raise ValueError(f"Wikipedia found {page.get('title', query)}, but its summary is unavailable.")
    result = {
        "title": page.get("title") or query, "extract": extract[:1800],
        "url": page.get("fullurl") or f"https://en.wikipedia.org/wiki/{quote_plus(page.get('title', query).replace(' ', '_'))}",
        "image": (page.get("thumbnail") or {}).get("source", ""), "description": "Wikipedia article",
    }
    WIKI_CACHE[key] = (time.time(), result)
    return result


def search_images(query: str, limit=12):
    key = query.lower().strip()
    cached = IMAGE_CACHE.get(key)
    if cached and time.time() - cached[0] < 1800:
        return cached[1]
    results = []
    seen = set()

    # Openverse: anonymous image search for openly licensed media.
    try:
        data = get_json("https://api.openverse.org/v1/images/", {"q": query, "page_size": 8})
        for item in data.get("results", []):
            src = item.get("thumbnail") or item.get("url")
            if not src or src in seen:
                continue
            seen.add(src)
            results.append({
                "title": item.get("title") or "Untitled image", "image": src,
                "url": item.get("foreign_landing_url") or item.get("url") or src,
                "source": item.get("source") or "Openverse",
                "creator": item.get("creator") or "", "license": item.get("license") or "See source",
            })
    except (requests.RequestException, ValueError, TypeError):
        pass

    # Wikimedia Commons: robust general and location photography fallback.
    try:
        data = get_json("https://commons.wikimedia.org/w/api.php", {
            "action": "query", "generator": "search", "gsrsearch": query,
            "gsrnamespace": 6, "gsrlimit": 8, "prop": "imageinfo",
            "iiprop": "url|extmetadata", "iiurlwidth": 1000,
            "format": "json", "formatversion": 2,
        })
        for page in (data.get("query") or {}).get("pages", []):
            info = ((page.get("imageinfo") or [{}])[0])
            src = info.get("thumburl") or info.get("url")
            if not src or src in seen:
                continue
            seen.add(src)
            meta = info.get("extmetadata") or {}
            license_name = (meta.get("LicenseShortName") or {}).get("value", "See source")
            results.append({
                "title": page.get("title", "").replace("File:", ""),
                "image": src, "url": info.get("descriptionurl") or info.get("url") or src,
                "source": "Wikimedia Commons", "creator": (meta.get("Artist") or {}).get("value", ""),
                "license": re.sub("<[^>]+>", "", license_name),
            })
    except (requests.RequestException, ValueError, TypeError):
        pass

    # NASA public image/video library. Useful especially for astronomy queries.
    try:
        data = get_json("https://images-api.nasa.gov/search", {
            "q": query, "media_type": "image", "page_size": 6,
        })
        for item in (data.get("collection") or {}).get("items", []):
            data_items = item.get("data") or [{}]
            links = item.get("links") or []
            src = next((x.get("href") for x in links if x.get("rel") == "preview"), "")
            if not src:
                continue
            if src in seen:
                continue
            seen.add(src)
            meta = data_items[0]
            results.append({
                "title": meta.get("title") or "NASA image",
                "image": src, "url": meta.get("nasa_id") and f"https://images.nasa.gov/details/{meta['nasa_id']}" or src,
                "source": "NASA", "creator": meta.get("photographer") or "",
                "license": "NASA public media",
            })
    except (requests.RequestException, ValueError, TypeError):
        pass

    results = results[:limit]
    IMAGE_CACHE[key] = (time.time(), results)
    return results


# ---------------------------------------------------------------------------
# Additional public-data integrations
# ---------------------------------------------------------------------------
def get_earthquakes():
    data = get_json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
    items = []
    for feature in (data.get("features") or [])[:8]:
        prop = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        items.append({
            "title": prop.get("place") or "Unknown location",
            "magnitude": prop.get("mag"), "time": prop.get("time"),
            "url": prop.get("url"), "lat": coords[1] if len(coords) > 1 else None,
            "lon": coords[0] if len(coords) > 1 else None,
        })
    return items


def get_iss():
    data = get_json("https://api.wheretheiss.at/v1/satellites/25544")
    return {
        "latitude": data.get("latitude"), "longitude": data.get("longitude"),
        "altitude_km": data.get("altitude"), "velocity_kmh": data.get("velocity"),
        "visibility": data.get("visibility"), "timestamp": data.get("timestamp"),
        "url": "https://www.n2yo.com/?s=25544",
    }


def get_github(query):
    data = get_json("https://api.github.com/search/repositories", {
        "q": query, "sort": "stars", "order": "desc", "per_page": 6,
    })
    return [{
        "title": x.get("full_name"), "description": x.get("description") or "No description",
        "url": x.get("html_url"), "stars": x.get("stargazers_count", 0),
        "language": x.get("language") or "—",
    } for x in data.get("items", [])]


def get_books(query):
    data = get_json("https://openlibrary.org/search.json", {"q": query, "limit": 8})
    return [{
        "title": x.get("title") or "Untitled",
        "description": ", ".join(x.get("author_name", [])[:2]) or "Unknown author",
        "url": "https://openlibrary.org" + x.get("key", ""),
        "image": f"https://covers.openlibrary.org/b/id/{x.get('cover_i')}-M.jpg" if x.get("cover_i") else "",
        "year": x.get("first_publish_year"),
    } for x in data.get("docs", [])[:8]]


def get_recipe(query):
    data = get_json("https://www.themealdb.com/api/json/v1/1/search.php", {"s": query})
    meals = data.get("meals") or []
    return [{
        "title": x.get("strMeal"), "description": x.get("strCategory") or "Recipe",
        "image": x.get("strMealThumb") or "", "url": x.get("strSource") or x.get("strYoutube") or "",
        "area": x.get("strArea") or "",
    } for x in meals[:6]]


def get_currency(amount, from_code, to_code):
    raw = get_json(f"https://api.frankfurter.dev/v2/rate/{from_code}/{to_code}")
    rate = raw.get("rate")
    if rate is None:
        raise ValueError("That currency pair isn't available.")
    return {"amount": amount, "from": from_code.upper(), "to": to_code.upper(),
            "rate": rate, "converted": round(amount * float(rate), 2),
            "date": raw.get("date") or ""}


def get_holidays(year=None, country="IN"):
    year = year or india_now().year
    return get_json(f"https://date.nager.at/api/v3/PublicHolidays/{year}/{country}")


def get_dictionary(word):
    data = get_json(f"https://api.dictionaryapi.dev/api/v2/entries/en/{quote_plus(word)}")
    if not data:
        raise ValueError(f"No dictionary entry found for {word}.")
    item = data[0]
    meanings = []
    for meaning in item.get("meanings", [])[:4]:
        defs = [d.get("definition") for d in meaning.get("definitions", [])[:2] if d.get("definition")]
        meanings.append({"part": meaning.get("partOfSpeech", ""), "definitions": defs})
    return {"word": item.get("word") or word, "phonetic": item.get("phonetic") or "",
            "meanings": meanings, "audio": next((p.get("audio") for p in item.get("phonetics", []) if p.get("audio")), "")}


def get_country(query):
    data = get_json(f"https://restcountries.com/v3.1/name/{quote_plus(query)}", {"fields": "name,capital,region,subregion,population,area,currencies,languages,flags,maps"})
    if not data:
        raise ValueError("No matching country.")
    x = data[0]
    return {
        "name": (x.get("name") or {}).get("common") or query,
        "capital": ", ".join(x.get("capital") or []) or "—",
        "region": x.get("region") or "—", "population": x.get("population"),
        "area": x.get("area"), "flag": (x.get("flags") or {}).get("png") or "",
        "map": (x.get("maps") or {}).get("googleMaps") or "",
        "languages": ", ".join((x.get("languages") or {}).values()),
    }


def get_space_news(query=""):
    params = {"limit": 6, "search": query} if query else {"limit": 6}
    data = get_json("https://api.spaceflightnewsapi.net/v4/articles/", params)
    return [{
        "title": x.get("title"), "description": x.get("summary") or "",
        "url": x.get("url"), "image": x.get("image_url") or "",
        "source": x.get("news_site") or "Spaceflight News",
        "published": x.get("published_at") or "",
    } for x in data.get("results", [])[:6]]


def get_natural_events():
    data = get_json("https://eonet.gsfc.nasa.gov/api/v3/events", {"status": "open", "limit": 12})
    items = []
    for event in data.get("events", [])[:12]:
        geometry = event.get("geometry") or []
        coords = (geometry[-1].get("coordinates") if geometry else None) or []
        items.append({
            "title": event.get("title") or "Natural event",
            "description": ", ".join(c.get("title", "") for c in event.get("categories", [])),
            "url": ((event.get("sources") or [{}])[0].get("url") or ""),
            "date": geometry[-1].get("date", "") if geometry else "",
            "lat": coords[1] if len(coords) > 1 else None,
            "lon": coords[0] if len(coords) > 1 else None,
        })
    return items


def get_pokemon(name):
    data = get_json(f"https://pokeapi.co/api/v2/pokemon/{quote_plus(name.lower())}")
    return {
        "name": data.get("name", name).title(),
        "image": ((data.get("sprites") or {}).get("other") or {}).get("official-artwork", {}).get("front_default")
                 or (data.get("sprites") or {}).get("front_default") or "",
        "height": data.get("height"), "weight": data.get("weight"),
        "types": ", ".join(x["type"]["name"] for x in data.get("types", [])),
        "abilities": ", ".join(x["ability"]["name"] for x in data.get("abilities", [])[:4]),
        "stats": [{"name": x["stat"]["name"], "value": x["base_stat"]} for x in data.get("stats", [])],
        "url": f"https://pokeapi.co/api/v2/pokemon/{quote_plus(name.lower())}",
    }


def get_trivia():
    data = get_json("https://opentdb.com/api.php", {"amount": 1, "type": "multiple"})
    questions = data.get("results") or []
    if not questions:
        raise ValueError("The trivia service returned no question.")
    item = questions[0]
    return {
        "question": item.get("question", ""),
        "answer": item.get("correct_answer", ""),
        "options": item.get("incorrect_answers", []) + [item.get("correct_answer", "")],
        "category": item.get("category", ""),
        "difficulty": item.get("difficulty", ""),
    }


def get_word_relations(query, relation="ml"):
    data = get_json("https://api.datamuse.com/words", {"rel_" + relation: query, "max": 10})
    return [{"title": x.get("word", ""), "description": f"Score: {x.get('score', 0)}"} for x in data[:10]]


def get_gutendex(query):
    data = get_json("https://gutendex.com/books/", {"search": query, "page_size": 8})
    return [{
        "title": x.get("title") or "Untitled",
        "description": ", ".join(a.get("name", "") for a in x.get("authors", [])[:2]) or "Public-domain author",
        "url": x.get("formats", {}).get("text/html") or x.get("formats", {}).get("application/epub+zip") or "",
        "image": x.get("formats", {}).get("image/jpeg") or "",
        "year": x.get("copyright"),
    } for x in data.get("results", [])[:8]]


def get_species(query):
    data = get_json("https://api.gbif.org/v1/species/match", {"name": query})
    if not data.get("canonicalName") and not data.get("scientificName"):
        raise ValueError(f"No biodiversity taxonomy match found for {query}.")
    return {
        "title": data.get("canonicalName") or data.get("scientificName") or query,
        "scientific_name": data.get("scientificName") or query,
        "rank": data.get("rank") or "—", "kingdom": data.get("kingdom") or "—",
        "phylum": data.get("phylum") or "—", "class": data.get("class") or "—",
        "status": data.get("status") or "—", "url": f"https://www.gbif.org/species/{data.get('usageKey')}" if data.get("usageKey") else "https://www.gbif.org/",
    }


def get_world_bank_indicator(country_name, indicator):
    country_data = get_json(f"https://restcountries.com/v3.1/name/{quote_plus(country_name)}", {"fields": "name,cca2"})
    if not country_data:
        raise ValueError(f"Couldn't identify country {country_name}.")
    country = country_data[0]
    code = country.get("cca2")
    name = (country.get("name") or {}).get("common") or country_name
    payload = get_json(f"https://api.worldbank.org/v2/country/{code}/indicator/{indicator}",
                       {"format": "json", "per_page": 5})
    records = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []
    record = next((x for x in records if x.get("value") is not None), None)
    if not record:
        raise ValueError(f"No recent value is available for {name} in this indicator.")
    return {"country": name, "indicator": record.get("indicator", {}).get("value", indicator),
            "value": record.get("value"), "year": record.get("date"), "url": f"https://data.worldbank.org/indicator/{indicator}?locations={code}"}


def get_sun_times(location):
    place = geocode_weather_location(location)
    data = get_json("https://api.sunrise-sunset.org/json", {
        "lat": place["lat"], "lng": place["lon"], "formatted": 0,
    })
    results = data.get("results") or {}
    if data.get("status") != "OK":
        raise ValueError("Sunrise and sunset times are not available for that location.")
    return {"location": place["display_name"], "sunrise": results.get("sunrise"),
            "sunset": results.get("sunset"), "solar_noon": results.get("solar_noon"),
            "day_length": results.get("day_length")}


def get_fun_data(kind, query=""):
    endpoints = {
        "pokemon": ("https://pokeapi.co/api/v2/pokemon/" + quote_plus(query.lower()), "pokemon"),
        "dog": ("https://dog.ceo/api/breeds/image/random", "dog"),
        "cat": ("https://api.thecatapi.com/v1/images/search", "cat"),
        "joke": ("https://official-joke-api.appspot.com/random_joke", "joke"),
        "trivia": ("https://opentdb.com/api.php?amount=1&type=multiple", "trivia"),
    }
    url, _ = endpoints[kind]
    return get_json(url)


# ---------------------------------------------------------------------------
# Optional external AI (fallback only for open-ended questions)
# ---------------------------------------------------------------------------
def ask_external_ai(message: str, history=None):
    """Use the same provider adapter for Render/Pydroid keys and browser keys."""
    provider = str(get_config("AI_PROVIDER", "openrouter") or "openrouter").strip().lower()
    endpoint = str(get_config("AI_API_URL", "") or "").strip()
    api_key = str(get_config("AI_API_KEY", "") or "").strip()
    model = str(get_config("AI_MODEL", "") or "").strip()
    if not api_key:
        return None, "AI API is not configured. Add a provider key in Settings → AI & API or set AI_API_KEY in your private environment."
    try:
        answer = agent.chat_text(
            {"provider": provider, "url": endpoint, "key": api_key, "model": model},
            message, history, "the user",
        )
        return answer, None
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        detail = str(exc)
        if status == 401 or "401" in detail:
            detail = "The API key was rejected (401). Check the key and provider."
        elif status == 402 or "402" in detail:
            detail = "The provider requires available credits for this model (402). Try a free model or another provider."
        elif status == 403 or "403" in detail:
            detail = "The provider denied this request (403). Check account access and model permissions."
        elif status == 429 or "429" in detail:
            detail = "The AI provider is rate-limiting this key or its free quota is exhausted (429). Wait for the limit to reset or choose another model."
        return None, "AI connection failed: " + detail[:220]


# ---------------------------------------------------------------------------
# Deterministic intent router
# ---------------------------------------------------------------------------
WEBSITES = {
    "google": "https://www.google.com", "youtube": "https://www.youtube.com",
    "facebook": "https://www.facebook.com", "linkedin": "https://www.linkedin.com",
    "instagram": "https://www.instagram.com", "github": "https://github.com",
    "wikipedia": "https://www.wikipedia.org", "gmail": "https://mail.google.com",
    "maps": "https://maps.google.com", "netlify": "https://www.netlify.com",
    "render": "https://render.com", "google calendar": "https://calendar.google.com",
    "calendar": "https://calendar.google.com", "google drive": "https://drive.google.com",
    "drive": "https://drive.google.com", "discord": "https://discord.com/app",
    "notion": "https://www.notion.so", "canva": "https://www.canva.com",
    "figma": "https://www.figma.com", "dropbox": "https://www.dropbox.com",
    "microsoft 365": "https://www.microsoft.com/microsoft-365",
    "chatgpt": "https://chatgpt.com", "claude": "https://claude.ai",
    "gemini": "https://gemini.google.com", "perplexity": "https://www.perplexity.ai",
    "google docs": "https://docs.google.com", "docs": "https://docs.google.com",
    "google sheets": "https://sheets.google.com", "sheets": "https://sheets.google.com",
    "google slides": "https://slides.google.com", "slides": "https://slides.google.com",
    "google keep": "https://keep.google.com", "keep": "https://keep.google.com",
    "outlook": "https://outlook.live.com", "onedrive": "https://onedrive.live.com",
    "slack": "https://slack.com", "trello": "https://trello.com",
    "linear": "https://linear.app", "gitlab": "https://gitlab.com",
    "vercel": "https://vercel.com", "replit": "https://replit.com",
    "stackblitz": "https://stackblitz.com", "codepen": "https://codepen.io",
    "hugging face": "https://huggingface.co", "huggingface": "https://huggingface.co",
    "kaggle": "https://www.kaggle.com", "pinterest": "https://www.pinterest.com",
    "reddit": "https://www.reddit.com", "spotify": "https://open.spotify.com",
    "youtube music": "https://music.youtube.com", "jiosaavn": "https://www.jiosaavn.com",
    "apple music": "https://music.apple.com", "firebase": "https://console.firebase.google.com",
}


def handle_weather(text):
    location = detect_location_query(text, "weather")
    if not location:
        return make_result("Which city or place should I check the weather for?", intent="weather")
    data = get_weather(location)
    return make_result(
        f"Weather for {data['location']}: {data['temperature']}°C, {data['condition'].lower()}. "
        f"Feels like {data['feels_like']}°C. Today's high {data['high']}°C and low {data['low']}°C. "
        f"Humidity {data['humidity']}%, wind {data['wind']} km/h, rain chance {data['rain_chance']}%.",
        cards=[{"type": "weather", **data}], intent="weather",
    )


def handle_map(text):
    location = detect_location_query(text, "map")
    if not location:
        # remove conversational wrappers for bare "show Srinagar"
        location = extract_subject(text, [
            r"\b(?:show|map|locate|find|where is|where's)\s+(?:me\s+)?(?:the\s+)?(.+)$",
            r"\b(?:satellite view of|satellite map of|map of)\s+(.+)$",
        ])
    location = re.sub(r"\s+in\s+satellite view$", "", location, flags=re.I)
    location = re.sub(r"\s+(?:satellite view|satellite map|on map|map view)$", "", location, flags=re.I)
    location = re.sub(r"^(?:a\s+)?(?:satellite\s+)?map\s+of\s+", "", location, flags=re.I)
    location = re.sub(r"\s+in\s*$", "", location, flags=re.I)
    place = geocode_location(location)
    return make_result(
        f"Located {place['display_name']}. Opening the interactive map view.",
        map_data={k: place[k] for k in ("name", "display_name", "lat", "lon", "type")},
        intent="map",
    )


def handle_images(text):
    query = extract_subject(text, [
        r"\b(?:images?|pictures?|photos?|photographs?)\s+(?:of|for|about)\s+(.+)$",
        r"\b(?:show|find|search|display)\s+(?:me\s+)?(?:images?|pictures?|photos?)\s+(?:of|for|about)?\s*(.+)$",
        r"\b(.+?)\s+(?:images?|pictures?|photos?)$",
    ])
    if not query:
        query = clean_query(text)
    images = search_images(query)
    if not images:
        raise ValueError(f"I couldn't find images for {query}. Try a shorter search.")
    return make_result(f"I found {len(images)} image results for {query}.", images=images, intent="images")


def knowledge_query(text):
    patterns = [
        r"\bwhat\s+(?:is|are|was|were)\s+(.+)$",
        r"\bwho\s+(?:is|was|are|were)\s+(.+)$",
        r"\b(?:tell me about|explain|give me information about|information about)\s+(.+)$",
        r"\bdefine\s+(.+)$",
    ]
    return extract_subject(text, patterns)


def lookup_knowledge(query, explicit_wikipedia=False):
    """Source-first knowledge lookup: Wikipedia, then anonymous web search.

    Returning None lets the configured AI API be the final fallback in
    /api/chat. No provider key is needed for the two public source lookups.
    """
    query = clean_query(query)
    if not query or query.lower() in {"it", "this", "that", "they", "them", "he", "she"}:
        return None
    try:
        data = wikipedia_search(query)
        return make_result(data["extract"], cards=[{"type": "wiki", **data}], source="wikipedia", intent="wikipedia")
    except (requests.RequestException, ValueError, KeyError, TypeError) as wiki_error:
        try:
            results = agent.web_search(query)
        except Exception:
            results = []
        if results:
            note = f"I couldn't find a clear Wikipedia article for {query}. Here are public web search results."
            return make_result(note, cards=[{"type": "web_search", "query": query, "items": results}], source="web_search", intent="web_search")
        if explicit_wikipedia:
            return make_result(
                f"I couldn't find a Wikipedia article or public search results for {query}."
                + " Add an AI provider key for another answer source, or try a different search phrase.",
                source="local", intent="lookup_unavailable",
            )
        return None


def handle_wikipedia(text):
    query = extract_subject(text, [r"\b(?:wikipedia|wiki)\s+(?:article\s+)?(?:about\s+)?(.+)$"])
    if not query:
        query = clean_query(text)
    return lookup_knowledge(query, explicit_wikipedia=True)


def process_local_command(message: str, prefs=None):
    text = message.strip()
    lower = re.sub(r"\s+", " ", text.lower()).strip(" ?!.,;:")
    if not text:
        return make_result("I'm listening. Give me a command.")

    if lower in ("help", "commands", "what can you do", "show commands"):
        return make_result(
            "I can check weather, search Wikipedia and images, open satellite maps, find news, "
            "track earthquakes and the ISS, map locations, search images, space and Earth events, convert currencies, "
            "find holidays, search GitHub and books, explore species, trivia, words and world indicators, "
            "look up recipes, definitions and country facts, play your saved music, open videos, "
            "calculate, manage notes, and open websites. Try: “What's the weather in Srinagar?” or "
            "“Show me pictures of Saturn”.", intent="help"
        )
    if lower in ("hi", "hello", "hey", "hello jarvis", "hey jarvis"):
        return make_result("Hello. AXO is online. I'm ready.", intent="greeting")
    if "who are you" in lower or "your name" in lower:
        return make_result("I'm AXO, your personal assistant running through Python and your browser.", intent="identity")
    if lower in ("time", "what time is it", "what's the time", "what is the time", "tell me the time") or "current time" in lower:
        return make_result("It's " + india_now().strftime("%I:%M %p") + " IST.", intent="time")
    if lower in ("date", "today", "what is the date", "what's the date") or "today's date" in lower:
        return make_result("Today is " + india_now().strftime("%A, %d %B %Y") + ".", intent="date")

    calc_match = re.match(r"^(?:calculate|calc)\s+(.+)$", text, flags=re.I)
    if calc_match:
        try:
            return make_result(f"The answer is {safe_calculate(calc_match.group(1))}.", intent="calculator")
        except Exception as exc:
            return make_result(f"I couldn't calculate that: {exc}", intent="calculator")

    note_match = re.match(r"^(?:remember|note|save a note)\s+(.+)$", text, flags=re.I)
    if note_match:
        notes = load_notes()
        notes.append({"text": note_match.group(1).strip()[:500], "created": india_now().isoformat(timespec="minutes")})
        save_notes(notes)
        return make_result("Saved that note on this device.", intent="notes")
    if lower in ("show notes", "list notes", "my notes"):
        notes = load_notes()
        return make_result("You don't have any saved notes yet." if not notes else
                           "Your saved notes:\n" + "\n".join(f"{i}. {n.get('text','')}" for i, n in enumerate(notes, 1)),
                           intent="notes")
    if lower in ("clear notes", "delete all notes"):
        save_notes([])
        return make_result("All local notes have been cleared.", intent="notes")

    # Media shortcuts are deliberately checked before open/search intents.
    media_text = re.sub(r"[!?.,]", " ", lower)
    media_text = re.sub(r"\s+", " ", media_text).strip()
    lib = load_library()
    prefs = prefs or {}
    default_platform = str(prefs.get("platform") or "youtube").lower()
    default_video_platform = str(prefs.get("video_platform") or "youtube").lower()

    contacts = prefs.get("contacts") or {}
    m_call = re.match(r"^(?:call|phone|dial|ring)\s+(.+)$", media_text)
    if m_call:
        try:
            num = apps_catalog.resolve_contact(m_call.group(1), contacts)
            return make_result(f"Calling {m_call.group(1)}. Tap call in your dialer.", apps_catalog.contact_action("call", num), intent="call")
        except ValueError as exc:
            return make_result(str(exc), intent="call")
    m_open = re.match(r"^(?:open|launch|start|run)\s+(.+)$", media_text)
    if m_open:
        key = apps_catalog.find_app(m_open.group(1))
        if key:
            return make_result(f"Opening {apps_catalog.APPS[key][0]}.", apps_catalog.app_action(key), intent="open")

    # "open youtube" / "open facebook" -> open the site itself
    site = media_text[5:].strip() if media_text.startswith("open ") else None
    if site and site in PLATFORMS and site not in lib["music"]:
        return make_result(f"Opening {site.title()}.",
                           {"type": "open_url", "url": PLATFORMS[site][1], "label": f"OPEN {site.upper()}", "auto": True},
                           intent="open")

    music_prefixes = ("play me ", "play song ", "play the song ", "play track ", "play the track ",
                      "play music ", "play the music ", "play ", "listen to ", "listen ",
                      "open song ", "open the song ", "open music ", "open the music ")
    music_key = next((media_text[len(x):].strip() for x in music_prefixes if media_text.startswith(x)), None)
    if music_key is None and media_text.startswith("open ") and media_text[5:].strip() in lib["music"]:
        music_key = media_text[5:].strip()
    if music_key is None and media_text in lib["music"]:
        music_key = media_text
    if music_key is not None and not music_key.startswith(("video ", "the video ")):
        music_key = re.sub(r"^(the song|song|music|the music)\s+", "", music_key).strip()
        music_key, platform = split_platform(music_key)
        matched = music_key if music_key in lib["music"] else next(
            (name for name in lib["music"] if music_key and (music_key in name or name in music_key)), None)
        if matched and not platform:
            return make_result(f"Playing {matched}.",
                               {"type": "open_url", "url": lib["music"][matched], "label": f"PLAY {matched.upper()}", "auto": True},
                               intent="music")
        if music_key:
            target = platform or default_platform
            q = music_key if platform else music_key + " song"
            return make_result(f"Playing {music_key} on {target.title()}.",
                               {"type": "open_url", "url": platform_url(target, q), "label": f"PLAY {music_key.upper()}", "auto": True},
                               intent="music")

    video_prefixes = ("watch video ", "watch the video ", "play video ", "watch ", "video ")
    video_key = next((media_text[len(x):].strip() for x in video_prefixes if media_text.startswith(x)), None)
    if video_key is not None and video_key:
        video_key, platform = split_platform(video_key)
        matched = video_key if video_key in lib["videos"] else next(
            (name for name in lib["videos"] if video_key and (video_key in name or name in video_key)), None)
        if matched and not platform:
            return make_result(f"Opening {matched}.",
                               {"type": "open_url", "url": lib["videos"][matched], "label": f"WATCH {matched.upper()}", "auto": True},
                               intent="video")
        target = platform or default_video_platform
        return make_result(f"Searching {video_key} on {target.title()}.",
                           {"type": "open_url", "url": platform_url(target, video_key), "label": f"WATCH {video_key.upper()}", "auto": True},
                           intent="video")

    if re.search(r"\b(species|scientific name|taxonomy|identify species)\b", lower):
        query = extract_subject(text, [r"\b(?:species|taxonomy|scientific name|identify species)\s+(?:of|for)?\s*(.+)$"])
        data = get_species(query)
        return make_result(f"{data['title']} is classified in kingdom {data['kingdom']} ({data['rank']}).",
                           cards=[{"type": "species", **data}], intent="biodiversity")

    # Weather phrase parsing accepts both "weather in Srinagar" and
    # "what's the weather in Srinagar?" plus reversed variants.
    if re.search(r"\b(weather|forecast|temperature|rain|snow|humidity|wind)\b", lower):
        return handle_weather(text)

    # Images explicitly requested; NASA terms can also be asked via "show images".
    if re.search(r"\b(images?|pictures?|photos?|photographs?)\b", lower):
        return handle_images(text)

    # Dictionary lookup has precedence over general "what is" encyclopedia searches.
    if re.search(r"\b(define|definition|dictionary|meaning of)\b", lower):
        word = extract_subject(text, [r"\b(?:define|definition of|dictionary|meaning of)\s+(.+)$"])
        if word:
            data = get_dictionary(word)
            reply = "; ".join(f"{m['part']}: {', '.join(m['definitions'])}" for m in data["meanings"])
            return make_result(f"{data['word']}: {reply}", cards=[{"type": "dictionary", **data}], intent="dictionary")

    # Common knowledge questions try Wikipedia first, even with no AI API key.
    # If Wikipedia has no usable page, the public web-search fallback is tried;
    # only if that also has no result does /api/chat continue to the AI provider.
    if re.search(r"\b(?:what\s+(?:is|are|was|were)|who\s+(?:is|was|are|were)|tell me about|explain)\b", lower):
        query = knowledge_query(text)
        if query:
            result = lookup_knowledge(query)
            if result is not None:
                return result

    if re.search(r"\b(iss|space station|international space station)\b", lower):
        data = get_iss()
        return make_result(f"The ISS is currently at {data['latitude']:.2f}° latitude, {data['longitude']:.2f}° longitude, moving at about {data['velocity_kmh']:.0f} km/h.",
                           cards=[{"type": "iss", **data}], intent="iss")

    if re.search(r"\b(satellite view|satellite map|map of|maps for|locate|where is|where's)\b", lower):
        return handle_map(text)
    if re.match(r"^map\s+", lower):
        return handle_map(text)

    # Public indicators (World Bank): GDP, population, life expectancy,
    # internet use and CO2 are widely used stable indicator identifiers.
    wb_match = re.search(r"\b(gdp per capita|gdp|population|life expectancy|internet users|internet access|co2 emissions)\b.*?\b(?:of|in|for)\s+([a-z][a-z .'-]+)$", lower)
    if wb_match:
        indicator_map = {
            "gdp": "NY.GDP.MKTP.CD", "gdp per capita": "NY.GDP.PCAP.CD",
            "population": "SP.POP.TOTL", "life expectancy": "SP.DYN.LE00.IN",
            "internet users": "IT.NET.USER.ZS", "internet access": "IT.NET.USER.ZS",
            "co2 emissions": "EN.ATM.CO2E.PC",
        }
        label = wb_match.group(1)
        country_name = clean_query(wb_match.group(2))
        data = get_world_bank_indicator(country_name, indicator_map[label])
        value = data["value"]
        display = f"{value:,.0f}" if isinstance(value, (int, float)) else str(value)
        return make_result(f"{data['indicator']} for {data['country']}: {display} ({data['year']}).",
                           cards=[{"type": "world_bank", **data}], intent="world_bank")

    if re.search(r"\b(wikipedia|wiki)\b", lower):
        # Keep general questions for the conversational AI; only explicit
        # encyclopedia requests should be intercepted by the local wiki tool.
        query = extract_subject(text, [
            r"\b(?:wikipedia|wiki)\s+(?:article\s+)?(?:about\s+)?(.+)$",
        ])
        if query:
            return handle_wikipedia(text)

    if "news" in lower or "headlines" in lower or "what's happening" in lower or "whats happening" in lower:
        category = next((c for c in ("business", "entertainment", "health", "science", "sports", "technology") if c in lower), "general")
        query = None
        if " in " in lower:
            query = lower.split(" in ", 1)[1].strip()
        articles, error = fetch_news(category)
        if error:
            return make_result("The news feeds are temporarily unavailable. " + error, intent="news")
        if not articles:
            return make_result("There aren't any headlines in the feed right now. Try another category or refresh shortly.", news=[], intent="news")
        return make_result(f"Here are the latest {category} headlines.", news=articles, intent="news")

    if "earthquake" in lower or "seismic" in lower:
        items = get_earthquakes()
        if not items:
            return make_result("No earthquake events were returned in the past day.", cards=[], intent="earthquakes")
        summary = f"USGS lists {len(items)} recent events in its past-day feed. The strongest shown is magnitude {max([x.get('magnitude') or 0 for x in items]):.1f}."
        return make_result(summary, cards=[{"type": "earthquakes", "items": items}], intent="earthquakes")

    if "github" in lower and re.search(r"\b(search|find|repo|repository|repositories)\b", lower):
        query = extract_subject(text, [r"\b(?:github|repositories|repos?)\s+(?:for|about|on)?\s*(.+)$",
                                       r"\b(?:search|find)\s+(?:github\s+)?(.+)$"])
        results = get_github(query or "python")
        return make_result(f"Found {len(results)} GitHub repositories for {query}.", cards=[{"type": "github", "items": results}], intent="github")

    if re.search(r"\b(public domain books|gutenberg|project gutenberg)\b", lower):
        query = extract_subject(text, [r"\b(?:public domain books|gutenberg|project gutenberg)\s*(?:about|on|by)?\s*(.*)$"])
        results = get_gutendex(query or "popular")
        return make_result(f"Found {len(results)} public-domain books.",
                           cards=[{"type": "books", "items": results}], intent="public_books")

    if re.search(r"\b(book|books|author|novel)\b", lower):
        query = extract_subject(text, [r"\b(?:books?|novels?)\s+(?:about|on|by|for)?\s*(.+)$",
                                       r"\b(?:find|search)\s+(?:me\s+)?books?\s+(?:about|on|by)?\s*(.+)$"])
        if query.lower() in ("", "books", "book"):
            query = "popular"
        results = get_books(query)
        return make_result(f"Found {len(results)} books matching {query}.", cards=[{"type": "books", "items": results}], intent="books")

    if re.search(r"\b(recipe|recipes|cook|cooking|meal)\b", lower):
        query = extract_subject(text, [r"\b(?:recipe|recipes|cook|make)\s+(?:for|with)?\s*(.+)$"])
        results = get_recipe(query or "chicken")
        return make_result(f"Found {len(results)} recipes.", cards=[{"type": "recipes", "items": results}], intent="recipes")

    if "holiday" in lower or "public holidays" in lower:
        holidays = get_holidays()
        upcoming = [x for x in holidays if x.get("date", "") >= india_now().date().isoformat()][:8]
        return make_result(f"I found {len(holidays)} public holidays for India in {india_now().year}.",
                           cards=[{"type": "holidays", "items": upcoming}], intent="holidays")

    currency_match = re.search(
        r"\b(?:(?:convert|exchange)\s+)?([0-9]+(?:\.[0-9]+)?)\s*([A-Z]{3})\s+(?:to|into|in)\s+([A-Z]{3})\b",
        text, flags=re.I)
    currency_names = {"rupees": "INR", "rupee": "INR", "inr": "INR", "dollars": "USD",
                      "dollar": "USD", "usd": "USD", "euros": "EUR", "euro": "EUR", "eur": "EUR",
                      "pounds": "GBP", "pound": "GBP", "gbp": "GBP", "yen": "JPY", "jpy": "JPY"}
    if currency_match:
        data = get_currency(float(currency_match.group(1)), currency_match.group(2), currency_match.group(3))
        return make_result(f"{data['amount']:g} {data['from']} is approximately {data['converted']:g} {data['to']} (rate date {data['date']}).",
                           cards=[{"type": "currency", **data}], intent="currency")
    name_match = re.search(r"\b([0-9]+(?:\.[0-9]+)?)\s*(rupees?|dollars?|euros?|pounds?|yen)\s+(?:to|in)\s+(rupees?|dollars?|euros?|pounds?|yen)\b", lower)
    if name_match:
        data = get_currency(float(name_match.group(1)), currency_names[name_match.group(2)], currency_names[name_match.group(3)])
        return make_result(f"{data['amount']:g} {data['from']} is approximately {data['converted']:g} {data['to']}.",
                           cards=[{"type": "currency", **data}], intent="currency")

    country_match = re.search(r"\b(?:country facts|tell me about the country|country info|capital and population of)\s+(.+)$", text, re.I)
    if country_match:
        data = get_country(clean_query(country_match.group(1)))
        return make_result(f"{data['name']}: capital {data['capital']}, region {data['region']}, population {data['population']:,}.",
                           cards=[{"type": "country", **data}], intent="country")

    if re.search(r"\b(sunrise|sunset|daylight|solar noon)\b", lower):
        location = detect_location_query(text, "weather")
        if not location:
            location = extract_subject(text, [r"\b(?:sunrise|sunset|daylight|solar noon)\s+(?:in|at|for)\s+(.+)$"])
        data = get_sun_times(location)
        return make_result(f"For {data['location']}, sunrise is {data['sunrise']}, sunset is {data['sunset']} (UTC).",
                           cards=[{"type": "sun_times", **data}], intent="sun_times")

    if re.search(r"\b(natural events|wildfires|wildfire|volcanoes|volcano|floods|flood|storms|hurricanes)\b", lower):
        items = get_natural_events()
        return make_result(f"NASA EONET returned {len(items)} currently open natural-event records.",
                           cards=[{"type": "natural_events", "items": items}], intent="earth_observation")

    pokemon_match = re.search(r"\b(?:pokemon|pok[eé]mon)\s+([a-z0-9-]+)\b", lower)
    if pokemon_match:
        data = get_pokemon(pokemon_match.group(1))
        return make_result(f"{data['name']} is a {data['types']} Pokémon. Height {data['height']}, weight {data['weight']}.",
                           cards=[{"type": "pokemon", **data}], intent="pokemon")

    if re.search(r"\b(trivia|quiz me|random question|give me a question)\b", lower):
        data = get_trivia()
        return make_result(f"Here's a {data['difficulty']} trivia question from {data['category']}.",
                           cards=[{"type": "trivia", **data}], intent="trivia")

    relation_match = re.search(r"\b(?:synonyms?|words like|similar words|rhymes? with|words that rhyme with)\s+(.+)$", lower)
    if relation_match:
        phrase = relation_match.group(0)
        relation = "rhy" if "rhyme" in phrase else "syn" if "synonym" in phrase else "ml"
        query = clean_query(relation_match.group(1))
        items = get_word_relations(query, relation)
        return make_result(f"Here are word suggestions related to {query}.",
                           cards=[{"type": "word_relations", "items": items}], intent="word_relations")

    if re.search(r"\b(space news|spaceflight|rocket launches|space launches)\b", lower):
        query = extract_subject(text, [r"\b(?:space news|spaceflight news)\s*(?:about|for)?\s*(.*)$"])
        articles = get_space_news(query)
        return make_result(f"Here are {len(articles)} recent spaceflight stories.", news=articles, intent="space_news")

    # Search the public web for useful results before falling back to a browser link.
    search_match = re.match(r"^(?:please\s+)?(?:search(?:\s+the\s+web)?|google|web search)(?:\s+(?:for|about))?\s+(.+)$", text, flags=re.I)
    if search_match:
        query = clean_query(search_match.group(1))
        try:
            results = agent.web_search(query)
        except Exception:
            results = []
        if results:
            return make_result(f"Here are public web results for {query}.", cards=[{"type": "web_search", "query": query, "items": results}], source="web_search", intent="web_search")
        engine = (prefs or {}).get("search_engine", "google")
        return make_result(f"I couldn't retrieve result cards right now. Opening {engine.title()} search for {query}.",
                           {"type": "open_url", "url": web_search_url(query, engine), "label": "OPEN SEARCH", "auto": True},
                           source="browser_search", intent="web_search")

    if lower.startswith("open "):
        target = text[5:].strip()
        key = target.lower()
        if key in WEBSITES:
            return make_result("Opening " + target + ".", {"type": "open_url", "url": WEBSITES[key], "auto": True}, intent="open")
        if "." in target and " " not in target:
            url = target if target.startswith(("http://", "https://")) else "https://" + target
            return make_result("Opening " + target + ".", {"type": "open_url", "url": url, "auto": True}, intent="open")
        return make_result("I couldn't find a saved shortcut, so here's a web search.",
                           {"type": "open_url", "url": "https://www.google.com/search?q=" + quote_plus(target), "auto": True}, intent="open")

    # A display request for a saved song/video or a named movie must never
    # start playback; return a normal search link without automatic navigation.
    display_match = re.match(r"^(?:show me|show|find me|look up)\s+(.+)$", text, flags=re.I)
    if display_match:
        query = display_match.group(1).strip()
        query_key = re.sub(r"[^a-z0-9 ]", "", query.lower()).strip()
        media_title = any(query_key == name or name in query_key or query_key in name
                          for name in list(lib["music"]) + list(lib["videos"]) if query_key)
        media_display = media_title or bool(re.search(r"\b(movie|film|trailer|song|track|album|music video|video)\b", lower))
        if media_display and not re.search(r"\b(images?|pictures?|photos?)\b", lower):
            engine = (prefs or {}).get("search_engine", "google")
            return make_result(
                f"Here are search results for {query}.",
                {"type": "open_url", "url": web_search_url(query, engine), "label": "VIEW SEARCH RESULTS", "auto": False},
                intent="web_search",
            )

    # Smart default: common "show <place>" phrasing becomes a map.
    if re.match(r"^show\s+(?:me\s+)?[a-z]", lower):
        return handle_map(text)
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/status")
def status():
    server_provider = str(get_config("AI_PROVIDER", "openrouter") or "openrouter").lower().replace("-", "_")
    server_has_key = bool(get_config("AI_API_KEY"))
    server_has_endpoint = bool(get_config("AI_API_URL") or server_provider in {"openrouter", "openai", "gemini", "groq"})
    return jsonify({
        "ok": True,
        # Known providers have built-in endpoint/model defaults; a separate
        # AI_MODEL environment variable is optional for those providers.
        "ai_configured": bool(server_has_key and server_has_endpoint),
        "news_configured": bool(get_config("NEWS_API_KEY") and "PASTE" not in get_config("NEWS_API_KEY")),
        "news_fallback": "Google News RSS",
        "music_count": len(load_library()["music"]), "video_count": len(load_library()["videos"]),
        "api_catalog_count": len(API_CATALOG),
        "integrations": ["Open-Meteo", "Wikipedia", "Openverse", "Wikimedia Commons", "NASA Images",
                         "Nominatim", "USGS", "ISS", "Frankfurter", "Nager.Date", "GitHub",
                         "Open Library", "Gutendex", "TheMealDB", "DictionaryAPI", "REST Countries",
                         "Spaceflight News", "NASA EONET", "GBIF", "Datamuse", "World Bank", "PokéAPI",
                         "Open Trivia DB", "Sunrise-Sunset"],
    })


@app.get("/api/voice")
def voice_profile():
    return jsonify({
        "ok": True,
        "name": "AXU Voice",
        "locale": "en-GB",
        "voice": "en-GB-RyanNeural",
        "style": "calm, composed, masculine British English",
        "rate": "-5%",
        "pitch": "-8Hz",
    })


@app.post("/api/tts")
def text_to_speech():
    """Generate AXU Voice audio. Uses Edge neural TTS; browser speech is the fallback."""
    payload = request.get_json(silent=True) or {}
    text = re.sub(r"\s+", " ", str(payload.get("text", "")).strip())[:650]
    if not text:
        return jsonify({"ok": False, "error": "Text is empty."}), 400
    try:
        import edge_tts

        async def synthesize():
            allowed = {"en-GB-RyanNeural", "en-GB-SoniaNeural", "en-IN-PrabhatNeural",
                       "en-IN-NeerjaNeural", "en-US-GuyNeural", "en-US-JennyNeural",
                       "hi-IN-MadhurNeural", "hi-IN-SwaraNeural", "ur-PK-AsadNeural", "ur-PK-UzmaNeural", "ur-IN-GulNeural", "ur-IN-SalmanNeural"}
            voice = str(payload.get("voice") or "en-GB-RyanNeural")
            voice = voice if voice in allowed else "en-GB-RyanNeural"
            try:
                rate_pct = max(-40, min(40, int(payload.get("rate", -5))))
            except (TypeError, ValueError):
                rate_pct = -5
            communicator = edge_tts.Communicate(
                text,
                voice=voice,
                rate=f"{rate_pct:+d}%",
                pitch="-8Hz" if "Ryan" in voice or "Guy" in voice or "Prabhat" in voice else "+0Hz",
            )
            chunks = []
            async for chunk in communicator.stream():
                if chunk.get("type") == "audio":
                    chunks.append(chunk.get("data", b""))
            return b"".join(chunks)

        audio_data = asyncio.run(synthesize())
        if not audio_data:
            raise RuntimeError("The voice service returned no audio.")
        return Response(audio_data, mimetype="audio/mpeg", headers={"Cache-Control": "no-store"})
    except Exception as exc:
        app.logger.warning("AXU Voice TTS unavailable: %s", exc)
        return jsonify({"ok": False, "error": "Neural voice is unavailable; use browser voice fallback."}), 503


@app.route("/api/library", methods=["GET", "POST", "DELETE"])
def library():
    if request.method == "GET":
        return jsonify(load_library())
    payload = request.get_json(silent=True) or {}
    kind = "videos" if str(payload.get("type", "")).startswith("video") else "music"
    name = re.sub(r"\s+", " ", str(payload.get("name", "")).strip().lower())[:60]
    if not name:
        return jsonify({"ok": False, "error": "Give it a name."}), 400
    if request.method == "DELETE":
        save_library_item(kind, name)
        return jsonify({"ok": True})
    url = str(payload.get("url", "")).strip()
    if not re.match(r"^https?://", url, re.I):
        return jsonify({"ok": False, "error": "Link must start with http:// or https://"}), 400
    save_library_item(kind, name, url[:600])
    return jsonify({"ok": True, **load_library()})


def _ai_from(payload):
    ai = payload.get("ai") if isinstance(payload.get("ai"), dict) else {}
    if not str(ai.get("key") or "").strip():
        raise ValueError("Add an AI key in Settings > AI & API first.")
    return ai


@app.get("/workflow")
def workflow_page():
    return Response((Path(__file__).parent / "templates" / "workflow.html").read_text(encoding="utf-8"), mimetype="text/html")


@app.post("/api/workflow")
def workflow_route():
    p = request.get_json(silent=True) or {}
    prompt = str(p.get("prompt", "")).strip()[:400]
    if not prompt:
        return jsonify({"ok": False, "error": "Describe the workflow first."}), 400
    ai = p.get("ai") if isinstance(p.get("ai"), dict) else {}
    try:
        if p.get("template"):
            t = agent._wf_templates(str(p["template"]))
            if t: return jsonify({"ok": True, "title": t[0], "nodes": t[1]})
        return jsonify({"ok": True, **agent.make_workflow(ai, prompt, p.get("current"), bool(p.get("edit")))})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/workflow/step")
def workflow_step():
    p = request.get_json(silent=True) or {}
    integ = p.get("integrations") if isinstance(p.get("integrations"), dict) else {}
    ai = p.get("ai") if isinstance(p.get("ai"), dict) else {}
    try:
        out, branch = agent.run_wf_step(p.get("node") or {}, str(p.get("ctx", ""))[:4000], integ, ai)
        return jsonify({"ok": True, "output": out, "branch": branch})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:220]})


@app.post("/api/make-file")
def make_file_route():
    p = request.get_json(silent=True) or {}
    try:
        import base64
        name, data, mime = agent.make_file(_ai_from(p), "sheet" if p.get("kind") == "sheet" else "doc", str(p.get("prompt", ""))[:600])
        return jsonify({"ok": True, "name": name, "mime": mime, "b64": base64.b64encode(data).decode()})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/vision")
def vision_route():
    p = request.get_json(silent=True) or {}
    try:
        return jsonify({"ok": True, "reply": agent.vision(_ai_from(p), p.get("image", ""), str(p.get("question", "")))})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/study")
def study_route():
    p = request.get_json(silent=True) or {}
    try:
        text = str(p.get("text", ""))
        if p.get("pdf"): text = agent.pdf_text(p["pdf"])
        return jsonify({"ok": True, "data": agent.study(_ai_from(p), text, str(p.get("mode", "summary")))})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/braindump")
def braindump_route():
    p = request.get_json(silent=True) or {}
    try:
        return jsonify({"ok": True, "data": agent.braindump(_ai_from(p), str(p.get("text", "")), india_now().strftime("%A %Y-%m-%d %H:%M"))})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/translate")
def translate_route():
    p = request.get_json(silent=True) or {}
    ai = p.get("ai") if isinstance(p.get("ai"), dict) else {}
    try:
        return jsonify({"ok": True, "text": agent.translate(ai, str(p.get("text", "")), str(p.get("from", "en"))[:2], str(p.get("to", "en"))[:2])})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400


@app.post("/api/watch")
def watch_route():
    p = request.get_json(silent=True) or {}
    integ = p.get("integrations") if isinstance(p.get("integrations"), dict) else {}
    return jsonify({"ok": True, "snap": agent.watch_snapshot(integ, p.get("biz") or {})})


@app.get("/sw.js")
def service_worker():
    resp = send_from_directory(str(BASE_DIR / "static"), "sw.js", mimetype="application/javascript")
    resp.headers["Service-Worker-Allowed"] = "/"; resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(str(BASE_DIR / "static"), "manifest.webmanifest", mimetype="application/manifest+json")


@app.get("/api/apps")
def apps_route():
    return jsonify({"ok": True, "apps": apps_catalog.catalog()})


@app.get("/api/apis")
def api_catalog_route():
    return jsonify({"ok": True, "count": len(API_CATALOG), "items": API_CATALOG})


# Fixed public endpoints only: the browser cannot supply an arbitrary URL.
BUILTIN_PLUGIN_ENDPOINTS = {
    "Open Library": {"url": "https://openlibrary.org/search.json?q={query}", "params": ["query"]},
    "Dictionary Lookup": {"url": "https://api.dictionaryapi.dev/api/v2/entries/en/{word}", "params": ["word"]},
    "Word Explorer": {"url": "https://api.datamuse.com/words?ml={word}", "params": ["word"]},
    "GitHub Repositories": {"url": "https://api.github.com/search/repositories?q={query}", "params": ["query"]},
    "TV & Shows": {"url": "https://api.tvmaze.com/search/shows?q={query}", "params": ["query"]},
    "Anime Explorer": {"url": "https://api.jikan.moe/v4/anime?q={query}", "params": ["query"]},
    "Country Facts": {"url": "https://restcountries.com/v3.1/name/{country}", "params": ["country"]},
    "Species Finder": {"url": "https://api.inaturalist.org/v1/taxa/autocomplete?q={query}", "params": ["query"]},
    "Spaceflight News": {"url": "https://api.spaceflightnewsapi.net/v4/articles/?search={query}", "params": ["query"]},
}


@app.post("/api/plugin-run")
def plugin_run_route():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    query = str(payload.get("query", "")).strip()
    plugin = BUILTIN_PLUGIN_ENDPOINTS.get(name)
    if not plugin:
        return jsonify({"ok": False, "error": "That built-in plugin is not available."}), 404
    if not query:
        return jsonify({"ok": False, "error": "Enter something to search for."}), 400
    if len(query) > 120:
        return jsonify({"ok": False, "error": "Search text must be 120 characters or fewer."}), 400
    args = {plugin["params"][0]: query}
    try:
        output = agent.run_plugin({"url": plugin["url"], "method": "GET", "header": ""}, args)
        return jsonify({"ok": True, "name": name, "output": str(output)[:2500], "source": plugin["url"].split("/", 3)[2]})
    except Exception as exc:
        return jsonify({"ok": False, "error": f"{name} could not return results: {str(exc)[:180]}"}), 503


@app.route("/api/notes", methods=["GET", "POST", "DELETE"])
def notes_route():
    if request.method == "GET":
        return jsonify({"ok": True, "notes": load_notes()})
    if request.method == "DELETE":
        save_notes([])
        return jsonify({"ok": True})
    payload = request.get_json(silent=True) or {}
    note_text = str(payload.get("text", "")).strip()
    if not note_text:
        return jsonify({"ok": False, "error": "Note cannot be empty."}), 400
    notes = load_notes()
    notes.append({"text": note_text[:500], "created": india_now().isoformat(timespec="minutes")})
    save_notes(notes)
    return jsonify({"ok": True, "note": notes[-1]})


@app.get("/api/news")
def news_route():
    category = request.args.get("category", "general")
    articles, error = fetch_news(category)
    if error:
        return jsonify({"ok": False, "error": error}), 503
    return jsonify({"ok": True, "articles": articles or [], "provider": "NewsAPI" if get_config("NEWS_API_KEY") and "PASTE" not in get_config("NEWS_API_KEY") else "Google News RSS"})


@app.post("/api/chat")
def chat_route():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    history = payload.get("history", [])
    if not message:
        return jsonify({"ok": False, "error": "Message is empty."}), 400
    ai = payload.get("ai") if isinstance(payload.get("ai"), dict) else {}
    integ = payload.get("integrations") if isinstance(payload.get("integrations"), dict) else {}
    prefs = payload.get("prefs") if isinstance(payload.get("prefs"), dict) else {}

    if re.fullmatch(r"(my |the |show |open )*(orders? |sales |shop |restaurant )?(dashboard|summary|report)( of| for)?( my| the| today'?s)*( orders?| sales)?|(today'?s |my )?(sales|orders|revenue)( summary| today)?|how are my (orders|sales)", re.sub(r"[!?.,]", "", message.lower()).strip()) and (integ.get("firebase") or {}).get("service_account"):
        try:
            txt, charts = agent.orders_summary(integ["firebase"], prefs.get("biz"), india_now())
            res = make_result(txt, intent="orders"); res["charts"] = charts
            return jsonify({"ok": True, **res})
        except Exception as exc:
            return jsonify({"ok": True, **make_result(f"Couldn't read your orders: {str(exc)[:160]}", intent="error")})
    if re.fullmatch(r"(my |the )?(daily |morning |day )?(briefing|brief|summary of my day)|catch me up|brief me", re.sub(r"[!?.,]", "", message.lower()).strip()):
        try:
            txt, charts = agent.build_briefing(integ, prefs, {"now": india_now, "weather": get_weather, "load_notes": load_notes})
            res = make_result(txt, intent="briefing"); res["charts"] = charts
            return jsonify({"ok": True, **res})
        except Exception as exc:
            return jsonify({"ok": True, **make_result(f"Couldn't build the briefing: {exc}", intent="error")})

    # Deterministic requests (weather, maps, images, media, apps, notes, maths,
    # public data) should never fail just because an optional LLM is unavailable.
    try:
        skip_local = bool(str(ai.get("key") or "").strip()) and bool(re.match(r"^(please\s+)?(remember|schedule|every\s+(day|morning))\b", message.lower()))
        local = None if skip_local else process_local_command(message, prefs)
        if local is not None:
            return jsonify({"ok": True, **local})
    except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as exc:
        return jsonify({"ok": True, **make_result(f"I couldn't complete that lookup: {exc}", intent="error")})

    browser_key = str(ai.get("key") or "").strip()
    agent_enabled = ai.get("agent", True) is not False
    if browser_key and agent_enabled:
        try:
            integ["contacts"] = prefs.get("contacts") or integ.get("contacts") or {}
            helpers = {
                "now": india_now, "local": process_local_command, "load_notes": load_notes, "save_notes": save_notes,
                "weather": get_weather, "news": fetch_news, "wiki": wikipedia_search,
                "platform_url": platform_url, "platforms": PLATFORMS,
            }
            reply, out = agent.run_agent(message, history, {**ai, "platform": prefs.get("platform", "youtube"), "video_platform": prefs.get("video_platform", "youtube")}, integ, helpers)
            actions = out.get("actions") or []
            result = make_result(reply, actions[0] if actions else None, news=out.get("news"), source="agent", intent="agent")
            result["actions"] = actions
            result["confirms"] = out.get("confirms", [])
            result["reminders"] = out.get("reminders", [])
            result["charts"] = out.get("charts", [])
            result["invoice"] = out.get("invoice")
            result["memory_add"] = out.get("memory_add", []); result["schedules"] = out.get("schedules", [])
            for k in ("images", "map"):
                if out.get(k): result[k] = out[k]
            if out.get("cards"): result["cards"] = (result.get("cards") or []) + out["cards"]
            return jsonify({"ok": True, **result})
        except Exception as exc:
            app.logger.warning("AXO agent request failed: %s", str(exc)[:240])
            # If tool calling/model compatibility fails, retry once as ordinary
            # chat with the same chosen provider and key. Do not mask auth/quota errors.
            status_code = getattr(exc, "status_code", None)
            network_unavailable = any(marker in str(exc).lower() for marker in (
                "could not reach the ai provider", "connectionerror", "connecttimeout", "readtimeout",
                "private and local ip", "custom api url must use https",
            ))
            if status_code not in (401, 402, 403, 429) and not network_unavailable:
                try:
                    reply = agent.chat_text(ai, message, history, ai.get("address") or "the user")
                    return jsonify({"ok": True, **make_result(reply, source="api", intent="conversation")})
                except Exception as fallback_exc:
                    app.logger.warning("AXO plain-chat fallback failed: %s", str(fallback_exc)[:240])
                    exc = fallback_exc
            detail = str(exc)
            if "401" in detail:
                detail = "The API key was rejected (401). Check the key and provider selected in Settings → AI & API."
            elif "402" in detail:
                detail = "The provider requires available credits for this model (402). Try a free model or another provider."
            elif "403" in detail:
                detail = "The provider denied this request (403). Check account access and model permissions."
            elif "429" in detail:
                detail = "The AI provider is rate-limiting this key or its free quota is exhausted (429). Wait for the limit to reset or choose another model."
            return jsonify({"ok": True, **make_result(f"AXO's AI connection failed: {detail}", intent="error")})

    if browser_key:
        try:
            reply = agent.chat_text(ai, message, history, ai.get("address") or "the user")
            return jsonify({"ok": True, **make_result(reply, source="api", intent="conversation")})
        except Exception as exc:
            app.logger.warning("AXO direct chat failed: %s", str(exc)[:240])
            return jsonify({"ok": True, **make_result(f"AXO's AI connection failed: {str(exc)}", intent="error")})

    ai_reply, ai_error = ask_external_ai(message, history)
    if ai_reply:
        return jsonify({"ok": True, **make_result(ai_reply, source="api", intent="conversation")})
    if ai_error:
        return jsonify({"ok": True, **make_result(
            ai_error + "\n\nYour local commands and integrations are still available. Add a provider key in Settings → AI & API for open-ended chat.",
            intent="error",
        )})
    return jsonify({"ok": True, **make_result(
        "I can run local commands and connected integrations. Add an AI provider key in Settings → AI & API for open-ended conversation.",
        intent="help",
    )})


@app.post("/api/bot-chat")
def bot_chat_route():
    payload = request.get_json(silent=True) or {}
    ai = payload.get("ai") if isinstance(payload.get("ai"), dict) else {}
    integ = payload.get("integrations") if isinstance(payload.get("integrations"), dict) else {}
    prefs = payload.get("prefs") if isinstance(payload.get("prefs"), dict) else {}
    bot = payload.get("bot") if isinstance(payload.get("bot"), dict) else {}
    bots = [b for b in (payload.get("bots") or []) if isinstance(b, dict)][:20]
    message = str(payload.get("message", "")).strip()
    if not message or not bot:
        return jsonify({"ok": False, "error": "Missing message or bot."}), 400
    if not str(ai.get("key") or "").strip():
        return jsonify({"ok": True, **make_result("Bots need an AI key. Add one in Settings → AI & API.", intent="error")})
    integ["contacts"] = prefs.get("contacts") or integ.get("contacts") or {}
    helpers = {"now": india_now, "local": process_local_command, "load_notes": load_notes, "save_notes": save_notes,
               "weather": get_weather, "news": fetch_news, "wiki": wikipedia_search, "platform_url": platform_url, "platforms": PLATFORMS}
    try:
        reply, out = agent.run_bot(bot, message, payload.get("history") or [], {**ai, "platform": prefs.get("platform", "youtube")}, integ, helpers, bots)
        acts = out.get("actions") or []
        result = make_result(reply, acts[0] if acts else None, news=out.get("news"), source="bot", intent="bot")
        result.update({"actions": acts, "confirms": out.get("confirms", []), "reminders": out.get("reminders", []),
                       "charts": out.get("charts", []), "trace": out.get("trace", []),
                       "memory_add": out.get("memory_add", []), "schedules": out.get("schedules", []), "invoice": out.get("invoice")})
        for k in ("images", "map"):
            if out.get(k): result[k] = out[k]
        return jsonify({"ok": True, **result})
    except Exception as exc:
        app.logger.warning("bot chat failed: %s", str(exc)[:200])
        return jsonify({"ok": True, **make_result(f"{bot.get('name','Bot')} hit a problem: {str(exc)[:200]}", intent="error")})


@app.post("/api/models")
def models_route():
    payload = request.get_json(silent=True) or {}
    ai = payload.get("ai") if isinstance(payload.get("ai"), dict) else {}
    try:
        models = agent.list_models(ai)
        return jsonify({"ok": True, "models": models})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:240]}), 400


@app.post("/api/confirm")
def confirm_route():
    payload = request.get_json(silent=True) or {}
    integ = payload.get("integrations") if isinstance(payload.get("integrations"), dict) else {}
    try:
        msg = agent.run_confirmed(str(payload.get("kind")), payload.get("payload") or {}, integ)
        return jsonify({"ok": True, "message": msg})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.post("/api/test")
def test_route():
    payload = request.get_json(silent=True) or {}
    what = payload.get("what")
    try:
        if what == "ai":
            return jsonify({"ok": True, "message": agent.test_ai(payload.get("ai") or {})})
        if what == "gmail":
            agent.read_emails(payload.get("gmail") or {}, 1)
            return jsonify({"ok": True, "message": "Gmail connected."})
        if what == "firebase":
            ov = agent.firebase_overview(payload.get("firebase") or {})
            return jsonify({"ok": True, "message": f"Connected to {ov['project']} ({len(ov['collections'])} collections)."})
        if what == "telegram":
            tg = payload.get("telegram") or {}
            r = requests.get(f"https://api.telegram.org/bot{tg.get('token','')}/getMe", timeout=15)
            if not r.ok: raise ValueError("Bot token rejected.")
            return jsonify({"ok": True, "message": "Bot @" + r.json()["result"]["username"] + " connected."})
        if what == "github":
            d = agent.gh(payload.get("github") or {}, "/user")
            return jsonify({"ok": True, "message": f"Connected as {d.get('login')}."})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)[:200]}), 400
    return jsonify({"ok": False, "error": "Unknown test."}), 400


if __name__ == "__main__":
    print("\nAXO is starting...")
    print("Open http://127.0.0.1:5000 in your Android browser.")
    print("Press Ctrl+C in Pydroid to stop the server.\n")
    app.run(host="127.0.0.1", port=5000, debug=False)
