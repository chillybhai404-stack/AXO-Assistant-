"""Private configuration for AXO.

Do not upload real API keys to GitHub or share screenshots containing them.
The NewsAPI key shared earlier should be regenerated before using it here.
"""

# Paste your NEW NewsAPI key between the quotes.
NEWS_API_KEY = "068eb56f1b764b62a0dee5a7969af125"

# Optional third-party AI API settings.
# This must be a chat endpoint that accepts JSON shaped like:
# {"model": "...", "messages": [{"role": "user", "content": "..."}]}
# It must return choices[0].message.content or a common output/text field.
# No OpenAI account or OpenAI SDK is used by this project.
AI_API_URL = ""
AI_API_KEY = ""
AI_MODEL = ""

AI_SYSTEM_PROMPT = (
    "You are AXO, a concise, friendly and helpful personal assistant. "
    "Give accurate, practical answers and admit when you are unsure."
)
