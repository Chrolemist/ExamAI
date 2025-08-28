import os
from typing import Optional

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


def get_client(api_key: Optional[str] = None):
    if OpenAI is None:
        raise RuntimeError("OpenAI SDK not installed")
    key = (api_key or os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("Saknar API-nyckel. Ange en i panelen eller sätt OPENAI_API_KEY i .env.")
    return OpenAI(api_key=key)
