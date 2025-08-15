import os
import io
import re
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from urllib.parse import quote_plus, urlparse

# Optional .env
load_dotenv()

try:
    from openai import OpenAI
except Exception:  # fallback if package not yet installed
    OpenAI = None  # type: ignore

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None  # type: ignore

try:
    import requests
    from bs4 import BeautifulSoup  # type: ignore
except Exception:
    requests = None  # type: ignore
    BeautifulSoup = None  # type: ignore


def create_app():
    app = Flask(
        __name__,
        static_folder=".",  # serve files from project root (index.html, styles.css, app.js)
        static_url_path="",
    )
    # If you open index via Flask, CORS isn't needed. Keep CORS permissive for local dev tools.
    CORS(app)

    @app.route("/")
    def root():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/key-status")
    def key_status():
        has_key = bool(os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_APIKEY") or os.getenv("OPENAI_KEY"))
        return jsonify({"hasKey": has_key})

    @app.post("/chat")
    def chat():
        # Input contract
        data = request.get_json(silent=True) or {}
        user_message = (data.get("message") or "").strip()
        model_in = (data.get("model") or os.getenv("OPENAI_MODEL") or "gpt-5-mini").strip()
        # Optional per-request API key (not stored). Otherwise use env var.
        api_key = (
            data.get("apiKey")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("OPENAI_APIKEY")
            or os.getenv("OPENAI_KEY")
        )
        incoming_messages = data.get("messages") or []
        has_history = isinstance(incoming_messages, list) and len(incoming_messages) > 0

        if not user_message and not has_history:
            return jsonify({"error": "message is required (or provide messages[])"}), 400

        if OpenAI is None:
            return jsonify({"error": "openai package not installed"}), 500

        if not api_key:
            return jsonify({"error": "No API key provided. Set OPENAI_API_KEY env var or pass apiKey in request."}), 401

        client = OpenAI(api_key=api_key)

        # Normalize model: if user passes fictional aliases (e.g., gpt-5* or 3o), map to a real fallback.
        def _normalize_model(m: str) -> str:
            mm = (m or "").strip().lower()
            if mm.startswith("gpt-5") or mm in {"3o", "o3"}:
                return os.getenv("OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
            return m

        model = _normalize_model(model_in)

        # Note: GPT-5 style models may ignore temperature; we omit it.
        system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()

        try:
            # Build message history: prefer provided 'messages' (list of {role, content}), else single user message
            if has_history:
                messages = incoming_messages
                if not (isinstance(messages[0], dict) and messages[0].get("role") == "system"):
                    messages = [{"role": "system", "content": system_prompt}] + messages
            else:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ]

            # Optional: lightweight web search and fetch context
            web_cfg = (data.get("web") or {}) if isinstance(data.get("web"), dict) else {}
            if web_cfg.get("enable"):
                try:
                    query_text = None
                    # Find the latest user message for query
                    for m in reversed(messages):
                        if isinstance(m, dict) and m.get("role") == "user" and (m.get("content") or "").strip():
                            query_text = (m.get("content") or "").strip()
                            break
                    if query_text:
                        max_results = max(1, min(10, int(web_cfg.get("maxResults", 3))))
                        per_page_chars = int(web_cfg.get("perPageChars", 3000))
                        total_chars_cap = int(web_cfg.get("totalCharsCap", 9000))
                        search_timeout = float(web_cfg.get("searchTimeoutSec", 5.0))
                        fetch_timeout = float(web_cfg.get("fetchTimeoutSec", 6.0))

                        sources = _web_search_and_fetch(query_text, max_results=max_results, per_page_chars=per_page_chars, total_chars_cap=total_chars_cap, search_timeout=search_timeout, fetch_timeout=fetch_timeout)
                        if sources and isinstance(sources, list):
                            # Build a compact context block with citations
                            lines = [
                                "Webbkällor (sammanfattade, använd [n] som hänvisning i svaret om relevant):"
                            ]
                            for i, s in enumerate(sources, start=1):
                                title = s.get("title") or s.get("url") or f"Källa {i}"
                                url = s.get("url") or ""
                                snippet = (s.get("text") or "").strip()[:per_page_chars]
                                # simple sanitization
                                title = re.sub(r"\s+", " ", title).strip()
                                url = url.strip()
                                lines.append(f"[{i}] {title} ({url})\n{snippet}")
                            web_block = "\n\n".join(lines)
                            # Prepend as system context so model can ground the answer
                            messages = [{"role": "system", "content": system_prompt + "\n\n" + web_block}] + [m for m in messages if not (m.get("role") == "system" and m.get("content") == system_prompt)]
                        # Store citations to include in response
                        citations = [{"title": s.get("title"), "url": s.get("url")} for s in sources] if sources else []
                    else:
                        citations = []
                except Exception:
                    citations = []
            else:
                citations = []

            # For chat.completions API, the correct parameter is always 'max_tokens'
            max_user = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
            kwargs = {"model": model, "messages": messages, "max_tokens": max_user}

            resp = client.chat.completions.create(**kwargs)

            reply = resp.choices[0].message.content if resp.choices else ""
            finish_reason = None
            try:
                finish_reason = resp.choices[0].finish_reason  # type: ignore[attr-defined]
            except Exception:
                finish_reason = None
            truncated = bool(finish_reason == "length")
            # usage may be named differently across SDK versions; include if present
            usage = None
            try:
                usage_obj = getattr(resp, "usage", None)
                if usage_obj:
                    usage = {
                        "input_tokens": getattr(usage_obj, "prompt_tokens", None) or getattr(usage_obj, "input_tokens", None),
                        "output_tokens": getattr(usage_obj, "completion_tokens", None) or getattr(usage_obj, "output_tokens", None),
                        "total_tokens": getattr(usage_obj, "total_tokens", None),
                    }
            except Exception:
                usage = None

            return jsonify({"reply": reply, "model": model, "finishReason": finish_reason, "truncated": truncated, "usage": usage, "citations": citations})

        except Exception as e:
            # Log and propagate a clearer error/status if available
            try:
                print("/chat error:", repr(e))
            except Exception:
                pass
            status = getattr(e, "status_code", 500)
            try:
                msg = getattr(e, "message", None) or str(e)
            except Exception:
                msg = "Unknown error"
            return jsonify({"error": msg, "model": model, "hint": "Kontrollera API-nyckel och modellnamn."}), int(status) if isinstance(status, int) else 500

    def _extract_text(filename: str, stream: bytes) -> str:
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            if PdfReader is None:
                return "[PDF-stöd saknas: installera pypdf]"
            try:
                reader = PdfReader(io.BytesIO(stream))
                parts = []
                for page in reader.pages:
                    try:
                        parts.append(page.extract_text() or "")
                    except Exception:
                        continue
                return "\n\n".join(parts).strip()
            except Exception:
                return "[Kunde inte extrahera text från PDF]"
        # Treat markdown and text similarly
        try:
            return stream.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    @app.post("/build-exam")
    def build_exam():
        # Multipart form-data: lectures[], exams[], examTitle
        try:
            title = (request.form.get("examTitle") or "Tenta").strip()
            lectures = request.files.getlist("lectures") or []
            exams = request.files.getlist("exams") or []

            lec_items = []
            for f in lectures:
                content = _extract_text(f.filename, f.read())
                lec_items.append({"name": f.filename, "text": content})

            ex_items = []
            for f in exams:
                content = _extract_text(f.filename, f.read())
                ex_items.append({"name": f.filename, "text": content})

            # Simple HTML assembly
            def _escape_html(s: str) -> str:
                return (
                    s.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                )

            parts = [
                f'<div class="exam-sec-title">Titel</div><div class="chip">{_escape_html(title)}</div>'
            ]

            if lec_items:
                parts.append('<div class="exam-sec-title">Föreläsningar</div>')
                for it in lec_items:
                    preview = _escape_html((it["text"] or "").strip())
                    parts.append(
                        f'<div class="card-item"><div class="title">{_escape_html(it["name"])}</div><div class="html-box">{preview[:8000]}</div></div>'
                    )

            if ex_items:
                parts.append('<div class="exam-sec-title">Tenta</div>')
                for it in ex_items:
                    preview = _escape_html((it["text"] or "").strip())
                    parts.append(
                        f'<div class="card-item"><div class="title">{_escape_html(it["name"])}</div><div class="html-box">{preview[:8000]}</div></div>'
                    )

            html = "\n".join(parts)
            return jsonify({"html": html, "counts": {"lectures": len(lec_items), "exams": len(ex_items)}, "title": title})
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    @app.post("/upload")
    def upload_files():
        """Upload one or more files and return extracted text per file.
        Form field name: files (multiple). Optional form field 'maxChars' to cap text length per file.
        """
        try:
            files = request.files.getlist("files") or []
            if not files:
                return jsonify({"error": "No files provided (field 'files')"}), 400
            try:
                max_chars = int(request.form.get("maxChars", "50000"))
            except Exception:
                max_chars = 50000

            items = []
            total_chars = 0
            for f in files:
                raw = f.read()
                text = _extract_text(f.filename, raw)
                truncated = False
                if len(text) > max_chars:
                    text = text[:max_chars]
                    truncated = True
                total_chars += len(text)
                items.append({
                    "name": f.filename,
                    "chars": len(text),
                    "truncated": truncated,
                    "text": text,
                })
            return jsonify({
                "count": len(items),
                "totalChars": total_chars,
                "items": items,
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    return app


# -------------------- Lightweight web search helpers --------------------
def _web_search_and_fetch(query: str, max_results: int = 3, per_page_chars: int = 3000, total_chars_cap: int = 9000, search_timeout: float = 5.0, fetch_timeout: float = 6.0):
    """Perform a minimal web search (DuckDuckGo HTML) and fetch readable text from top results.
    Returns a list of dicts: {title, url, text}. Fails gracefully on network errors.
    """
    if not requests:
        return []
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    }
    results = []
    try:
        q = quote_plus(query)
        resp = requests.get(f"https://duckduckgo.com/html/?q={q}&kl=se-sv&ia=web", headers=headers, timeout=search_timeout)
        html = resp.text
        links = []
        if BeautifulSoup is not None:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.select("a.result__a, a.result__url, a.result__title"):  # various ddg layouts
                href = a.get("href")
                title = a.get_text(" ").strip() or href
                if href and href.startswith("http"):
                    links.append({"title": title, "url": href})
                if len(links) >= max_results:
                    break
        else:
            # Fallback: regex naive extraction
            for m in re.finditer(r'<a[^>]+href="(http[^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
                url = m.group(1)
                title = re.sub("<[^>]+>", " ", m.group(2))
                title = re.sub(r"\s+", " ", title).strip()
                if url and url.startswith("http"):
                    links.append({"title": title or url, "url": url})
                if len(links) >= max_results:
                    break
    except Exception:
        links = []

    # Fetch pages with cap
    out = []
    total = 0
    for it in links[:max_results]:
        url = it.get("url")
        title = (it.get("title") or url or "").strip()
        if not url:
            continue
        try:
            txt = _fetch_readable_text(url, headers=headers, timeout=fetch_timeout)[:per_page_chars]
            if txt:
                out.append({"title": title, "url": url, "text": txt})
                total += len(txt)
                if total >= total_chars_cap:
                    break
        except Exception:
            continue
    return out


def _fetch_readable_text(url: str, headers=None, timeout: float = 6.0) -> str:
    if not requests:
        return ""
    headers = headers or {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    # Prefer text/plain or markdown-ish; otherwise strip HTML
    ctype = r.headers.get("Content-Type", "").lower()
    text = r.text
    if "text/plain" in ctype or url.lower().endswith((".txt", ".md", ".text")):
        return text
    if BeautifulSoup is None:
        # naive tag strip
        text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
        return re.sub("<[^>]+>", " ", text)
    soup = BeautifulSoup(text, "html.parser")
    # Try to remove nav/footer/script/style
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "form", "aside"]):
        try:
            tag.decompose()
        except Exception:
            continue
    # Prefer article/main
    main = soup.find(["article", "main"]) or soup.body
    txt = main.get_text("\n", strip=True) if main else soup.get_text("\n", strip=True)
    # collapse whitespace
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=True)
