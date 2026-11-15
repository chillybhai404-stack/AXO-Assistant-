"""Phone-app launcher catalog. Android Chrome opens apps through intent: links
(with a web fallback built in); iOS uses URL schemes; desktop opens the website."""
import re
from urllib.parse import quote

G = "https://www.google.com/search?q="


def _intent(host_path, pkg, web):
    return f"intent://{host_path}#Intent;scheme=https;package={pkg};S.browser_fallback_url={quote(web, safe='')};end"


def _sys(extra, web):
    return f"intent:#Intent;{extra};S.browser_fallback_url={quote(web, safe='')};end"


# key: (label, simpleicons slug / emoji, color, android uri, ios uri, web url, aliases)
APPS = {
    # Browser-based AI assistants: no provider API key is needed to open the official sites.
    "chatgpt": ("ChatGPT", "openai", "10A37F", "https://chatgpt.com/", "https://chatgpt.com/", "https://chatgpt.com/", ["gpt", "openai chat"]),
    "claude": ("Claude", "claude", "D97757", "https://claude.ai/", "https://claude.ai/", "https://claude.ai/", ["anthropic"]),
    "gemini": ("Gemini", "googlegemini", "8E75FF", "https://gemini.google.com/app", "https://gemini.google.com/app", "https://gemini.google.com/app", ["google ai"]),
    "youtube": ("YouTube", "youtube", "FF0000", _intent("www.youtube.com/", "com.google.android.youtube", "https://www.youtube.com"), "youtube://", "https://www.youtube.com", ["yt"]),
    "x": ("X", "x", "FFFFFF", _intent("x.com/", "com.twitter.android", "https://x.com"), "twitter://", "https://x.com", ["twitter"]),
    "facebook": ("Facebook", "facebook", "1877F2", _intent("www.facebook.com/", "com.facebook.katana", "https://www.facebook.com"), "fb://", "https://www.facebook.com", ["fb"]),
    "instagram": ("Instagram", "instagram", "E4405F", _intent("www.instagram.com/", "com.instagram.android", "https://www.instagram.com"), "instagram://", "https://www.instagram.com", ["insta", "ig"]),
    "whatsapp": ("WhatsApp", "whatsapp", "25D366", "intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=https%3A%2F%2Fweb.whatsapp.com;end", "whatsapp://", "https://web.whatsapp.com", ["wa"]),
    "telegram": ("Telegram", "telegram", "26A5E4", "intent://resolve/#Intent;scheme=tg;package=org.telegram.messenger;S.browser_fallback_url=https%3A%2F%2Fweb.telegram.org;end", "tg://", "https://web.telegram.org", []),
    "spotify": ("Spotify", "spotify", "1DB954", _intent("open.spotify.com/", "com.spotify.music", "https://open.spotify.com"), "spotify://", "https://open.spotify.com", []),
    "gmail": ("Gmail", "gmail", "EA4335", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL", "https://mail.google.com"), "googlegmail://", "https://mail.google.com", ["mail", "email"]),
    "github": ("GitHub", "github", "FFFFFF", _intent("github.com/", "com.github.android", "https://github.com"), "github://", "https://github.com", []),
    "netflix": ("Netflix", "netflix", "E50914", _intent("www.netflix.com/", "com.netflix.mediaclient", "https://www.netflix.com"), "nflx://", "https://www.netflix.com", []),
    "snapchat": ("Snapchat", "snapchat", "FFFC00", _intent("www.snapchat.com/", "com.snapchat.android", "https://www.snapchat.com"), "snapchat://", "https://www.snapchat.com", ["snap"]),
    "linkedin": ("LinkedIn", "in", "0A66C2", _intent("www.linkedin.com/", "com.linkedin.android", "https://www.linkedin.com"), "linkedin://", "https://www.linkedin.com", []),
    "reddit": ("Reddit", "reddit", "FF4500", _intent("www.reddit.com/", "com.reddit.frontpage", "https://www.reddit.com"), "reddit://", "https://www.reddit.com", []),
    "tiktok": ("TikTok", "tiktok", "FFFFFF", _intent("www.tiktok.com/", "com.zhiliaoapp.musically", "https://www.tiktok.com"), "snssdk1233://", "https://www.tiktok.com", []),
    "maps": ("Maps", "googlemaps", "4285F4", "geo:0,0?q=", "comgooglemaps://", "https://maps.google.com", ["google maps", "map"]),
    "chrome": ("Chrome", "googlechrome", "4285F4", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_BROWSER", "https://www.google.com"), "googlechrome://", "https://www.google.com", ["browser"]),
    "calculator": ("Calculator", "sys:calculator", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR", G + "calculator"), "", G + "calculator", ["calc"]),
    "camera": ("Camera", "sys:camera", "", _sys("action=android.media.action.STILL_IMAGE_CAMERA", "https://www.google.com"), "", "https://www.google.com", []),
    "clock": ("Clock", "sys:clock", "", _sys("action=android.intent.action.SHOW_ALARMS", G + "timer"), "clock-alarm://", G + "timer", ["alarm", "timer", "stopwatch"]),
    "calendar": ("Calendar", "sys:calendar", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_CALENDAR", "https://calendar.google.com"), "calshow://", "https://calendar.google.com", []),
    "gallery": ("Gallery", "sys:image", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_GALLERY", "https://photos.google.com"), "photos-redirect://", "https://photos.google.com", ["photos"]),
    "contacts": ("Contacts", "sys:user", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_CONTACTS", "https://contacts.google.com"), "", "https://contacts.google.com", []),
    "music": ("Music", "sys:music", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_MUSIC", "https://music.youtube.com"), "music://", "https://music.youtube.com", []),
    "settings": ("Settings", "sys:gear", "", _sys("action=android.settings.SETTINGS", "https://www.google.com"), "App-Prefs:", "https://www.google.com", []),
    "drive": ("Google Drive", "googledrive", "4285F4", _intent("drive.google.com/", "com.google.android.apps.docs", "https://drive.google.com"), "googledrive://", "https://drive.google.com", ["google drive"]),
    "docs": ("Docs", "googledocs", "4285F4", _intent("docs.google.com/document/", "com.google.android.apps.docs.editors.docs", "https://docs.google.com"), "googledocs://", "https://docs.google.com", ["google docs"]),
    "sheets": ("Sheets", "googlesheets", "34A853", _intent("docs.google.com/spreadsheets/", "com.google.android.apps.docs.editors.sheets", "https://docs.google.com/spreadsheets"), "googlesheets://", "https://docs.google.com/spreadsheets", ["google sheets"]),
    "meet": ("Meet", "googlemeet", "00897B", _intent("meet.google.com/", "com.google.android.apps.tachyon", "https://meet.google.com"), "googlemeet://", "https://meet.google.com", ["google meet"]),
    "zoom": ("Zoom", "zoom", "0B5CFF", _intent("zoom.us/", "us.zoom.videomeetings", "https://zoom.us"), "zoomus://", "https://zoom.us", []),
    "discord": ("Discord", "discord", "5865F2", _intent("discord.com/app", "com.discord", "https://discord.com/app"), "discord://", "https://discord.com/app", []),
    "twitch": ("Twitch", "twitch", "9146FF", _intent("www.twitch.tv/", "tv.twitch.android.app", "https://www.twitch.tv"), "twitch://", "https://www.twitch.tv", []),
    "pinterest": ("Pinterest", "pinterest", "E60023", _intent("www.pinterest.com/", "com.pinterest", "https://www.pinterest.com"), "pinterest://", "https://www.pinterest.com", []),
    "amazon": ("Amazon", "amazon", "FF9900", _intent("www.amazon.in/", "in.amazon.mShop.android.shopping", "https://www.amazon.in"), "amazon://", "https://www.amazon.in", []),
    "flipkart": ("Flipkart", "flipkart", "2874F0", _intent("www.flipkart.com/", "com.flipkart.android", "https://www.flipkart.com"), "flipkart://", "https://www.flipkart.com", []),
    "swiggy": ("Swiggy", "swiggy", "FC8019", _intent("www.swiggy.com/", "in.swiggy.android", "https://www.swiggy.com"), "swiggy://", "https://www.swiggy.com", []),
    "zomato": ("Zomato", "zomato", "E23744", _intent("www.zomato.com/", "com.application.zomato", "https://www.zomato.com"), "zomato://", "https://www.zomato.com", []),
    "uber": ("Uber", "uber", "FFFFFF", _intent("m.uber.com/", "com.ubercab", "https://m.uber.com"), "uber://", "https://m.uber.com", []),
    "paytm": ("Paytm", "paytm", "00BAF2", _intent("paytm.com/", "net.one97.paytm", "https://paytm.com"), "paytmmp://", "https://paytm.com", []),
    "phonepe": ("PhonePe", "phonepe", "5F259F", _intent("www.phonepe.com/", "com.phonepe.app", "https://www.phonepe.com"), "phonepe://", "https://www.phonepe.com", []),
    "gpay": ("Google Pay", "googlepay", "4285F4", _intent("pay.google.com/", "com.google.android.apps.nbu.paisa.user", "https://pay.google.com"), "gpay://", "https://pay.google.com", ["google pay", "g pay"]),
    "playstore": ("Play Store", "googleplay", "34A853", "market://search?q=", "https://apps.apple.com", "https://play.google.com", ["play store", "google play"]),
    "files": ("Files", "sys:folder", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_FILES", "https://drive.google.com"), "shareddocuments://", "https://drive.google.com", ["file manager"]),
    "notes": ("Notes", "sys:note", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_BROWSER", "https://keep.google.com"), "mobilenotes://", "https://keep.google.com", ["keep"]),
    "weather": ("Weather", "sys:cloudsun", "", _sys("action=android.intent.action.MAIN;category=android.intent.category.APP_WEATHER", G + "weather"), "weather://", G + "weather", []),
    "phone": ("Phone", "sys:phone", "", "tel:", "tel:", "tel:", ["dialer"]),
    "messages": ("Messages", "sys:message", "", "sms:", "sms:", "sms:", ["sms", "texts"]),
}

ALIASES = {}
for _k, _v in APPS.items():
    ALIASES[_k] = _k
    ALIASES[_v[0].lower()] = _k
    for _a in _v[6]:
        ALIASES[_a] = _k


def find_app(name):
    n = re.sub(r"^(the|my)\s+", "", re.sub(r"\s+(app|application)$", "", (name or "").lower().strip()))
    return ALIASES.get(n)


def app_action(key, extra=""):
    label, icon, color, android, ios, web, _ = APPS[key]
    uri = android + (quote(extra) if key == "maps" and extra else "")
    return {"type": "open_app", "app": key, "label": f"OPEN {label.upper()}", "name": label, "icon": icon, "color": color,
            "uri": uri, "ios": ios, "web": web, "auto": True}


def contact_action(kind, number, text=""):
    num = re.sub(r"[^\d+]", "", number or "")
    if len(re.sub(r"\D", "", num)) < 5:
        raise ValueError("That number doesn't look valid.")
    if kind == "call":
        uri, label = f"tel:{num}", "CALL"
    elif kind == "sms":
        uri, label = f"sms:{num}?body={quote(text)}", "MESSAGE"
    else:
        uri, label = f"https://wa.me/{num.lstrip('+')}?text={quote(text)}", "WHATSAPP"
    return {"type": "open_app", "app": kind, "label": f"{label} {num}", "name": label.title(), "icon": "sys:phone", "color": "",
            "uri": uri, "ios": uri, "web": uri, "auto": True}


def resolve_contact(who, contacts):
    who = (who or "").strip()
    if re.fullmatch(r"[+\d][\d\s\-()]{4,}", who):
        return who
    c = {str(k).lower(): v for k, v in (contacts or {}).items()}
    w = who.lower()
    if w in c:
        return c[w]
    for k, v in c.items():
        if w and (w in k or k in w):
            return v
    raise ValueError(f"I don't have a number for '{who}'. Add them in Settings > Contacts.")


def catalog():
    return [app_action(k) for k in APPS]
