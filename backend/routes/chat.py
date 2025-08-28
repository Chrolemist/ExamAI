import os
from flask import Blueprint, current_app, jsonify, request

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(force=True, silent=True) or {}

    # Model + API key
    model = (data.get("model") or current_app.config.get("OPENAI_MODEL") or "gpt-5-mini").strip()
    if OpenAI is None:
        return jsonify({"error": "OpenAI SDK not installed"}), 500
    api_key = (data.get("apiKey") or os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return jsonify({"error": "Saknar API-nyckel. Ange en i panelen eller sätt OPENAI_API_KEY i .env."}), 401
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        return jsonify({"error": f"Kunde inte initiera OpenAI-klienten: {e}"}), 500

    # Messages
    system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()
    incoming_messages = data.get("messages") if isinstance(data.get("messages"), list) else None
    user_message = (data.get("prompt") or data.get("message") or "").strip()
    if incoming_messages and len(incoming_messages) > 0:
        messages = incoming_messages
        if not (isinstance(messages[0], dict) and messages[0].get("role") == "system"):
            messages = [{"role": "system", "content": system_prompt}] + messages
    else:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

    # Optional client-side clipping hint: server stays neutral/normal now
    max_tokens = data.get("max_tokens") or data.get("max_completion_tokens") or 1000

    def _invoke(mdl: str):
        return client.chat.completions.create(model=mdl, messages=messages, max_tokens=max_tokens, timeout=30)

    try:
        resp = _invoke(model)
    except Exception as e:
        # One fallback try if model invalid
        fb = os.getenv("FALLBACK_MODEL", "gpt-4o-mini")
        if fb and fb != model:
            try:
                resp = _invoke(fb)
                model = fb
            except Exception as e2:
                return jsonify({"error": str(e2)}), 400
        else:
            return jsonify({"error": str(e)}), 400

    try:
        reply = resp.choices[0].message.content if resp.choices else ""
    except Exception:
        reply = ""
    try:
        usage_obj = getattr(resp, "usage", None)
        usage = ({
            "input_tokens": getattr(usage_obj, "prompt_tokens", None) or getattr(usage_obj, "input_tokens", None),
            "output_tokens": getattr(usage_obj, "completion_tokens", None) or getattr(usage_obj, "output_tokens", None),
            "total_tokens": getattr(usage_obj, "total_tokens", None),
        } if usage_obj else None)
    except Exception:
        usage = None

    return jsonify({"reply": reply, "model": model, "usage": usage})
