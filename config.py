"""Non-secret AXO configuration.

Set credentials with environment variables (recommended for Render), or add
private local values here while testing in Pydroid. Never commit real keys.
"""
import os
from pathlib import Path


def _load_private_env_file():
    """Load simple KEY=value lines from a local, git-ignored .env file."""
    env_file = Path(__file__).with_name(".env")
    if not env_file.exists():
        return
    try:
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
                value = value[1:-1]
            if key:
                os.environ.setdefault(key, value)
    except OSError:
        pass


_load_private_env_file()

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# OpenRouter example:
# AI_PROVIDER=openrouter
# AI_MODEL=openrouter/free
# AI_API_URL=https://openrouter.ai/api/v1
# AI_API_KEY=<secret>
AI_PROVIDER = os.getenv("AI_PROVIDER", "openrouter")
AI_API_URL = os.getenv("AI_API_URL", "")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "")

AI_SYSTEM_PROMPT = os.getenv(
    "AI_SYSTEM_PROMPT",
    "You are AXO, a concise, friendly and helpful personal assistant. "
    "Use the supplied conversation history when relevant. Give accurate, "
    "practical answers and admit when you are unsure."
)
