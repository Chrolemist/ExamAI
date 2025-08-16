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

# Optional robust article extractor
try:
    import trafilatura  # type: ignore
except Exception:
    trafilatura = None  # type: ignore

# Optional Playwright for realistic browsing (JS-rendered pages)
try:
    from playwright.sync_api import sync_playwright  # type: ignore
except Exception:
    sync_playwright = None  # type: ignore


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

            # Note: Removed hardcoded conversation constraints (no-questions/loop guard)

            # Optional: web search and fetch context (prefer Playwright if available)
            web_cfg = (data.get("web") or {}) if isinstance(data.get("web"), dict) else {}
            if web_cfg.get("enable"):
                try:
                    # Inject capability guidance so model doesn't claim lack of internet when web is enabled
                    try:
                        messages = ([{"role": "system", "content": system_prompt + "\n\nANVISNING: Webbsökning är aktiv i denna session via servern. Säg inte att du saknar internet. Om inga källor hittas, säg kort att du inte fann relevanta källor just nu."}]
                                    + [m for m in messages if not (m.get("role") == "system" and m.get("content") == system_prompt)])
                    except Exception:
                        pass

                    # Derive a useful query from conversation history
                    def _collect_domains(msgs):
                        """Extract explicit domains mentioned by the user from recent messages.
                        Avoid hardcoded outlet mappings; only collect actual domain-like tokens the user wrote.
                        """
                        doms = []
                        try:
                            pat = re.compile(r"\b([a-z0-9][-a-z0-9\.]+\.[a-z]{2,})(?:/|\b)", re.I)
                            for m in reversed(msgs[-8:]):
                                txt = (m.get("content") or "")
                                for g in pat.findall(txt):
                                    d = g.lower().strip().strip('/')
                                    if d not in doms:
                                        doms.append(d)
                        except Exception:
                            pass
                        return doms

                    def _derive_query(msgs):
                        GENERIC = {"berätta mer", "beratta mer", "fortsätt", "fortsatt", "mer", "more", "go on", "tell me more"}
                        last_user = None
                        prev_user = None
                        for m in reversed(msgs):
                            if isinstance(m, dict) and m.get("role") == "user":
                                txt = (m.get("content") or "").strip()
                                if not last_user:
                                    last_user = txt
                                else:
                                    prev_user = txt
                                    break
                        q = (last_user or "").strip()
                        ql = q.lower()
                        if (len(q) < 12) or (ql in GENERIC):
                            if prev_user and len(prev_user) > 0:
                                q = prev_user
                        # Append site filter when domains present
                        doms = _collect_domains(msgs)
                        if doms:
                            # prefer first mentioned domain
                            q = f"site:{doms[0]} {q or 'senaste nyheter'}"
                        return (q or "").strip()

                    query_text = _derive_query(messages)
                    if query_text:
                        print(f"[DEBUG] /chat web enabled; query_text={query_text!r}; web_cfg={web_cfg}")
                        max_results = max(1, int(web_cfg.get("maxResults", 3)))
                        per_page_chars = int(web_cfg.get("perPageChars", 3000))
                        total_chars_cap = int(web_cfg.get("totalCharsCap", 9000))
                        search_timeout = float(web_cfg.get("searchTimeoutSec", 6.0))
                        fetch_timeout = float(web_cfg.get("fetchTimeoutSec", 8.0))

                        # Prefer Playwright for fetching (handles JS), fallback to requests
                        if sync_playwright is not None:
                            try:
                                sources = _web_search_and_fetch_playwright(
                                    query_text,
                                    max_results=max_results,
                                    per_page_chars=per_page_chars,
                                    total_chars_cap=total_chars_cap,
                                    search_timeout=search_timeout,
                                    fetch_timeout=fetch_timeout,
                                )
                            except Exception:
                                # Fallback to requests-based fetch
                                sources = _web_search_and_fetch(
                                    query_text,
                                    max_results=max_results,
                                    per_page_chars=per_page_chars,
                                    total_chars_cap=total_chars_cap,
                                    search_timeout=search_timeout,
                                    fetch_timeout=fetch_timeout,
                                )
                        else:
                            sources = _web_search_and_fetch(
                                query_text,
                                max_results=max_results,
                                per_page_chars=per_page_chars,
                                total_chars_cap=total_chars_cap,
                                search_timeout=search_timeout,
                                fetch_timeout=fetch_timeout,
                            )
                        # Debug: report number of sources and URLs
                        try:
                            src_urls = [s.get('url') for s in sources] if sources else []
                        except Exception:
                            src_urls = []
                        print(f"[DEBUG] fetched sources count={len(src_urls)} urls={src_urls}")
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
                            # Prepend as system context so model can ground the answer, with explicit guidance to use sources
                            try:
                                ts = time.strftime("%Y-%m-%d %H:%M")
                            except Exception:
                                ts = "idag"
                            web_guidance = (
                                "ANVISNING: Du har precis hämtat aktuella webbkällor (" + ts + ") nedan. "
                                "Svara med hjälp av dessa källor, var konkret och inkludera hänvisningar som [n] där n matchar källistan. "
                                "Påstå inte att du saknar realtidsåtkomst när källor finns. Om källorna inte täcker frågan, säg det kort."
                            )
                            combined_system = system_prompt + "\n\n" + web_guidance + "\n\n" + web_block
                            messages = [{"role": "system", "content": combined_system}] + [m for m in messages if not (m.get("role") == "system" and m.get("content") == system_prompt)]

                        # Store citations to include in response
                        citations = [{"title": s.get("title"), "url": s.get("url")} for s in sources] if sources else []

                        # No hardcoded targeted site fetch; leave citations empty if no sources
                except Exception:
                    citations = []
            else:
                citations = []
                # Lightweight fallback: if user explicitly asks for link/source but web isn't enabled,
                # provide a safe search URL so the UI can still render a clickable link.
                try:
                    wants_link = False
                    um = (user_message or "").lower()
                    for tok in ["länk", "lank", "länkar", "käll", "källa", "kall"]:
                        if tok in um:
                            wants_link = True
                            break
                    if wants_link:
                        # Reuse a simplified query derivation: prefer previous user prompt if the latest is generic
                        def _derive_simple_query(msgs):
                            last_user = None; prev_user = None
                            for m in reversed(msgs):
                                if isinstance(m, dict) and m.get("role") == "user":
                                    txt = (m.get("content") or "").strip()
                                    if not last_user: last_user = txt
                                    else: prev_user = txt; break
                            q = (prev_user or last_user or "").strip()
                            return q
                        q = _derive_simple_query(incoming_messages if has_history else messages)
                        q_safe = quote_plus(q) if q else ""
                        lower_all = ("\n".join([(m.get("content") or "") for m in (incoming_messages if has_history else messages)])).lower()
                        urls = []
                        if "youtube" in lower_all:
                            urls.append({"title": "Sökresultat (YouTube)", "url": f"https://www.youtube.com/results?search_query={q_safe}"})
                        # Always include a general web search as fallback
                        urls.append({"title": "Sökresultat (DuckDuckGo)", "url": f"https://duckduckgo.com/?q={q_safe}"})
                        citations = urls
                except Exception:
                    pass

    # debug fetch endpoint moved below after chat() completes

            # For chat.completions API, the correct parameter is always 'max_tokens'
            max_user = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
            kwargs = {"model": model, "messages": messages, "max_tokens": max_user}

            resp = client.chat.completions.create(**kwargs)

            reply = resp.choices[0].message.content if resp.choices else ""
            # Note: Removed reply post-processing that forced guidance like "Säg 1, 2 eller 3 ..."
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

    @app.get("/debug/fetch")
    def debug_fetch():
        """Debug endpoint: fetch readable text for a URL without calling OpenAI.
        Query param: url or JSON body {"url": "..."}. Returns {ok, url, text, len} or error.
        """
        try:
            url = request.args.get('url') or (request.get_json(silent=True) or {}).get('url')
            if not url:
                return jsonify({"error": "url is required (query param or JSON body)"}), 400
            if not url.lower().startswith(('http://', 'https://')):
                return jsonify({"error": "url must start with http:// or https://"}), 400
            # Use the same extractor as the web pipeline
            try:
                text = _fetch_readable_text(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=8.0)
            except Exception as e:
                return jsonify({"error": "fetch failed", "detail": str(e)}), 500
            if not text:
                return jsonify({"ok": True, "url": url, "text": "", "len": 0})
            return jsonify({"ok": True, "url": url, "len": len(text), "text": text[:20000]})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return app


# -------------------- Web search helpers --------------------
def _web_search_links(query: str, max_results: int = 3, search_timeout: float = 5.0):
    """Search DuckDuckGo HTML and return a list of {title, url} links (no fetch)."""
    if not requests:
        return []
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    }
    try:
        q = quote_plus(query)
        kl = os.getenv("SEARCH_LOCALE", "se-sv")
        resp = requests.get(
            f"https://duckduckgo.com/html/?q={q}&kl={kl}&ia=web",
            headers=headers,
            timeout=search_timeout,
        )
        html = resp.text
        links = []
        if BeautifulSoup is not None:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.select("a.result__a, a.result__url, a.result__title"):
                href = a.get("href")
                title = a.get_text(" ").strip() or href
                if href and href.startswith("http"):
                    links.append({"title": title, "url": href})
                if len(links) >= max_results:
                    break
        else:
            for m in re.finditer(r'<a[^>]+href="(http[^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
                url = m.group(1)
                title = re.sub("<[^>]+>", " ", m.group(2))
                title = re.sub(r"\s+", " ", title).strip()
                if url and url.startswith("http"):
                    links.append({"title": title or url, "url": url})
                if len(links) >= max_results:
                    break
        # Prefer likely article URLs over home/category pages using a simple score
        def score(u: str, title: str) -> int:
            s = 0
            pu = urlparse(u)
            path = (pu.path or '').lower()
            # boost article-like paths
            if any(tok in path for tok in ["/a/", "/nyhet", "/sport/", "/kultur/", "/noje", "/debatt", "/artikel", "/202", "/20"]):
                s += 5
            # penalize root or very short paths
            if path in {"", "/"}:
                s -= 5
            if path.count('/') <= 1:
                s -= 1
            # small boost if title contains query terms
            qtoks = [w for w in re.split(r"\W+", query.lower()) if len(w) > 3]
            if qtoks and any(w in (title or '').lower() for w in qtoks):
                s += 1
            return s
        links_sorted = sorted(links, key=lambda it: score(it.get('url') or '', it.get('title') or ''), reverse=True)
        dedup = []
        seen = set()
        for it in links_sorted:
            u = it.get('url')
            if not u or u in seen:
                continue
            seen.add(u)
            dedup.append(it)
            if len(dedup) >= max_results:
                break
        return dedup
    except Exception:
        return []


def _web_search_and_fetch(
    query: str,
    max_results: int = 3,
    per_page_chars: int = 3000,
    total_chars_cap: int = 9000,
    search_timeout: float = 5.0,
    fetch_timeout: float = 6.0,
):
    """Perform a minimal web search (DuckDuckGo HTML) and fetch readable text via requests.
    Returns a list of dicts: {title, url, text}. Fails gracefully on network errors.
    """
    links = _web_search_links(query, max_results=max_results, search_timeout=search_timeout)
    if not links:
        return []
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    }
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


def _web_search_and_fetch_playwright(
    query: str,
    max_results: int = 3,
    per_page_chars: int = 3000,
    total_chars_cap: int = 9000,
    search_timeout: float = 5.0,
    fetch_timeout: float = 6.0,
):
    """Search links as usual, but fetch pages using Playwright for better JS support.
    Returns a list of dicts: {title, url, text}.
    """
    if sync_playwright is None:
        return _web_search_and_fetch(
            query,
            max_results=max_results,
            per_page_chars=per_page_chars,
            total_chars_cap=total_chars_cap,
            search_timeout=search_timeout,
            fetch_timeout=fetch_timeout,
        )

    links = _web_search_links(query, max_results=max_results, search_timeout=search_timeout)
    if not links:
        return []

    out = []
    total = 0
    timeout_ms = int(max(1000, fetch_timeout * 1000))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])  # safer in containers
        context = browser.new_context(ignore_https_errors=True)
        page = context.new_page()
        page.set_default_timeout(timeout_ms)
        for it in links[:max_results]:
            url = it.get("url")
            title = (it.get("title") or url or "").strip()
            if not url:
                continue
            try:
                page.goto(url, wait_until="domcontentloaded")
                # Try to auto-accept common cookie/consent dialogs to reveal content
                try:
                    # Attempt buttons with common Swedish/English texts
                    for label in [
                        "Godkänn alla", "Acceptera alla", "Jag accepterar", "Jag godkänner", "Acceptera", "OK", "Godkänn",
                        "Accept all", "Accept", "I agree", "Got it",
                    ]:
                        btn = page.get_by_role("button", name=re.compile(label, re.I))
                        if btn and btn.count() > 0:
                            try:
                                btn.first.click(timeout=1000)
                                page.wait_for_timeout(400)
                                break
                            except Exception:
                                continue
                except Exception:
                    pass
                text = ""
                # Prefer robust extraction when available
                if trafilatura is not None:
                    try:
                        html = page.content()
                        extracted = trafilatura.extract(html, url=url, include_comments=False, include_formatting=False) or ""
                        text = extracted.strip()
                    except Exception:
                        text = ""
                # Fallback: readable inner_text from article/main/body
                if not text:
                    for sel in ["article", "main", "#content", "body"]:
                        try:
                            if page.locator(sel).count() > 0:
                                text = page.locator(sel).inner_text()
                                if text and len(text.strip()) > 80:
                                    break
                        except Exception:
                            continue
                    if not text:
                        try:
                            text = page.inner_text("body")
                        except Exception:
                            text = ""
                text = (text or "").strip()[:per_page_chars]
                if text:
                    out.append({"title": title, "url": url, "text": text})
                    total += len(text)
                    if total >= total_chars_cap:
                        break
            except Exception:
                continue
        try:
            context.close()
            browser.close()
        except Exception:
            pass
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
    # Try trafilatura first for robust article extraction
    if trafilatura is not None:
        try:
            extracted = trafilatura.extract(text, url=url, include_comments=False, include_formatting=False)
            if extracted and len(extracted.strip()) > 80:
                return extracted.strip()
        except Exception:
            pass
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
