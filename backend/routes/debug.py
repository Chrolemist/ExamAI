import os
from flask import Blueprint, jsonify, request

try:
    from .. import web_search as ws  # type: ignore
except Exception:
    import web_search as ws  # type: ignore


debug_bp = Blueprint("debug", __name__)


@debug_bp.get("/debug/fetch")
def debug_fetch():
    try:
        url = request.args.get('url') or (request.get_json(silent=True) or {}).get('url')
        if not url:
            return jsonify({"error": "url is required (query param or JSON body)"}), 400
        if not url.lower().startswith(('http://', 'https://')):
            return jsonify({"error": "url must start with http:// or https://"}), 400
        try:
            text = ws.fetch_readable_text(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=8.0)
        except Exception as e:
            return jsonify({"error": "fetch failed", "detail": str(e)}), 500
        if not text:
            return jsonify({"ok": True, "url": url, "text": "", "len": 0})
        return jsonify({"ok": True, "url": url, "len": len(text), "text": text[:20000]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@debug_bp.get("/debug/env")
def debug_env():
    try:
        api = os.getenv("OPENAI_API_KEY") or ""
        model = os.getenv("OPENAI_MODEL") or ""
        return jsonify({
            "hasApiKey": bool(api),
            "apiKeyPreview": (api[:5] + "…" + api[-2:] if len(api) > 9 else (api[:3] + "…" if api else "")),
            "model": model or None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@debug_bp.get("/key-status")
def key_status():
    try:
        api = os.getenv("OPENAI_API_KEY") or ""
        return jsonify({
            "hasKey": bool(api),
            "preview": (api[:4] + "…" + api[-2:] if len(api) > 8 else (api[:3] + "…" if api else "")),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
