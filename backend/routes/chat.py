import os
import json
from flask import Blueprint, current_app, jsonify, request, Response
from flask import stream_with_context

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

    # Optional client-side clipping hint
    max_tokens = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
    # Allow callers to hint a longer timeout when needed (cap to 120s)
    try:
        req_timeout = float(data.get("timeout", 30))
    except Exception:
        req_timeout = 30
    req_timeout = max(5, min(120, req_timeout))

    def _invoke(mdl: str):
        return client.chat.completions.create(model=mdl, messages=messages, max_tokens=max_tokens, timeout=req_timeout)

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


@chat_bp.route("/chat/stream", methods=["POST", "OPTIONS"])
def chat_stream():
    # CORS preflight
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

    # Budget and timeout
    max_tokens = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
    try:
        req_timeout = float(data.get("timeout", 60))
    except Exception:
        req_timeout = 60
    req_timeout = max(5, min(120, req_timeout))

    def _event_iter(final_model: str):
        # Emit an initial meta frame (bytes)
        yield (json.dumps({"type": "meta", "model": final_model}, ensure_ascii=False) + "\n").encode("utf-8")
        try:
            stream = client.chat.completions.create(
                model=final_model,
                messages=messages,
                max_tokens=max_tokens,
                timeout=req_timeout,
                stream=True,
            )
            for ev in stream:
                try:
                    # New SDKs: ev.choices[0].delta.content; some variants may use .message
                    delta = None
                    try:
                        delta = ev.choices[0].delta.content
                    except Exception:
                        pass
                    if not delta:
                        try:
                            delta = ev.choices[0].message.get("content") if getattr(ev.choices[0], "message", None) else None
                        except Exception:
                            delta = None
                    if delta:
                        yield (json.dumps({"type": "delta", "delta": delta}, ensure_ascii=False) + "\n").encode("utf-8")
                except Exception:
                    # Ignore malformed chunks but continue the stream
                    continue
        except Exception as e:
            # Try fallback model if configured and different
            fb = os.getenv("FALLBACK_MODEL", "gpt-4o-mini")
            if fb and fb != final_model:
                yield (json.dumps({"type": "meta", "note": "fallback", "model": fb}, ensure_ascii=False) + "\n").encode("utf-8")
                try:
                    stream = client.chat.completions.create(
                        model=fb,
                        messages=messages,
                        max_tokens=max_tokens,
                        timeout=req_timeout,
                        stream=True,
                    )
                    for ev in stream:
                        try:
                            delta = None
                            try:
                                delta = ev.choices[0].delta.content
                            except Exception:
                                pass
                            if not delta:
                                try:
                                    delta = ev.choices[0].message.get("content") if getattr(ev.choices[0], "message", None) else None
                                except Exception:
                                    delta = None
                            if delta:
                                yield (json.dumps({"type": "delta", "delta": delta}, ensure_ascii=False) + "\n").encode("utf-8")
                        except Exception:
                            continue
                except Exception as e2:
                    yield (json.dumps({"type": "error", "message": str(e2)}, ensure_ascii=False) + "\n").encode("utf-8")
            else:
                yield (json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False) + "\n").encode("utf-8")
        # Final marker
        yield (json.dumps({"type": "done"}, ensure_ascii=False) + "\n").encode("utf-8")

    # Return NDJSON stream
    return Response(
        stream_with_context(_event_iter(model)),
        mimetype="application/x-ndjson; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
        },
        direct_passthrough=True,
    )
