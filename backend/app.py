import os
import io
import re
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv, find_dotenv

# Optional .env (robust: locate nearest .env regardless of CWD)
try:
    load_dotenv(find_dotenv(), override=False)
except Exception:
    # fall back to default search if find_dotenv fails
    try:
        load_dotenv()
    except Exception:
        pass

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore

# Import web search helpers module (work both as package and script)
try:
    from . import web_search as ws  # type: ignore
except Exception:
    import web_search as ws  # type: ignore

# Optional PDF support
try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None  # type: ignore


def create_app():
    app = Flask(__name__)
    # Explicit CORS to allow local frontends (5500 = nginx, 127.0.0.1 variants, common dev ports)
    try:
        CORS(
            app,
            resources={
                r"/*": {
                    "origins": [
                        "http://localhost:5500",
                        "http://127.0.0.1:5500",
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                    ],
                    "methods": ["GET", "POST", "OPTIONS"],
                    "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
                }
            },
            supports_credentials=False,
        )
    except Exception:
        # Fallback
        try:
            CORS(app)
        except Exception:
            pass

    # Ensure CORS headers are present on all responses, including errors
    _ALLOWED_ORIGINS = {
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }

    @app.after_request
    def add_cors_headers(resp):
        try:
            origin = request.headers.get("Origin", "")
            if origin in _ALLOWED_ORIGINS:
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Vary"] = ", ".join(filter(None, [resp.headers.get("Vary"), "Origin"]))
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        except Exception:
            pass
        return resp

    # Directory to persist uploaded files for stable URLs
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    except Exception:
        pass

    # Handle CORS preflight explicitly for robustness
    @app.route("/chat", methods=["POST", "OPTIONS"])
    def chat():
        # Short-circuit preflight
        if request.method == "OPTIONS":
            return ("", 204)
        data = request.get_json(force=True, silent=True) or {}
        # Accept both OPENAI_MODEL and legacy OPENAI_MODEL_NAME
        model = (data.get("model") or os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME") or "gpt-5-mini").strip()

        # Build base messages from either messages[] or single user input
        incoming_messages = data.get("messages") if isinstance(data.get("messages"), list) else None
        user_message = (data.get("prompt") or data.get("message") or "").strip()
        has_history = bool(incoming_messages and len(incoming_messages) > 0)

        if OpenAI is None:
            return jsonify({"error": "OpenAI SDK not installed"}), 500
        # Support per-request API key (panel-specific) or use global from env
        api_key = (data.get("apiKey") or os.getenv("OPENAI_API_KEY") or "").strip()
        if not api_key:
            return jsonify({"error": "Saknar API-nyckel. Ange en i panelen eller sätt OPENAI_API_KEY i serverns .env."}), 401
        try:
            client = OpenAI(api_key=api_key)
        except Exception as e:
            return jsonify({"error": f"Kunde inte initiera OpenAI-klienten: {e}"}), 500

        # System prompt
        system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()

        # Build messages array
        if has_history:
            messages = incoming_messages
            if not (isinstance(messages[0], dict) and messages[0].get("role") == "system"):
                messages = [{"role": "system", "content": system_prompt}] + messages
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]

        # Defensive clipping: cap number of messages and content length to avoid oversized payloads
        try:
            MAX_MSGS = 20
            MAX_CHARS = 12000
            def _clip_text(x: str) -> str:
                try:
                    x = x or ""
                    return x if len(x) <= MAX_CHARS else x[:MAX_CHARS]
                except Exception:
                    return str(x)[:MAX_CHARS]
            if isinstance(messages, list):
                # Keep most recent messages; ensure dict shape and clip content
                messages = [
                    {"role": (m.get("role") or "user"), "content": _clip_text(m.get("content") or "")}
                    for m in messages[-MAX_MSGS:]
                    if isinstance(m, dict)
                ]
        except Exception:
            pass

        citations = []

        # If the conversation contains inline attachments ("Bilaga:" blocks), instruct the model to cite [n,sida]
        try:
            def _has_materials(msgs):
                for m in msgs or []:
                    if isinstance(m, dict) and m.get("role") == "user":
                        if "Bilaga:" in (m.get("content") or ""):
                            return True
                return False
            if _has_materials(messages):
                mats_guidance = (
                    "ANVISNING: Du har bilagor som material. När du hämtar fakta eller citat ur en bilaga, ange källhänvisning direkt "
                    "efter på formen [n,sida] (t.ex. [1,7]) när PDF-sidan framgår, annars [n]. Citerar du, gör det kort."
                )
                messages = ([{"role": "system", "content": system_prompt + "\n\n" + mats_guidance}]
                            + [m for m in messages if not (m.get("role") == "system" and m.get("content") == system_prompt)])
        except Exception:
            pass

        # Optional web search/crawl integration
        web_cfg = (data.get("web") or {}) if isinstance(data.get("web"), dict) else {}
        if web_cfg.get("enable"):
            mode = (web_cfg.get("mode") or "auto").strip().lower()
            use_openai_web_tool = bool(web_cfg.get("useOpenAITool", True)) and (mode in {"auto", "openai"})

            # Preferred provider order: Serper -> OpenAI tool -> HTTP -> Playwright
            tried_any = False
            serper_available = bool(os.getenv("SERPER_API_KEY"))
            if mode in {"serper", "auto"} and serper_available:
                tried_any = True
                try:
                    # Build a query up-front for Serper path
                    pass
                except Exception:
                    pass

            # Legacy/search+fetch path builds web context for the model
            try:
                guidance = (
                    "ANVISNING: Webbsökning är aktiv i denna session via servern. Säg inte att du saknar internet. "
                    "Om inga källor hittas, säg kort att du inte fann relevanta källor just nu."
                )
                messages = ([{"role": "system", "content": system_prompt + "\n\n" + guidance}]
                            + [m for m in messages if not (m.get("role") == "system" and m.get("content") == system_prompt)])
            except Exception:
                pass

            # Derive a rough query from recent user messages
            def _collect_domains(msgs):
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
                doms = _collect_domains(msgs)
                if doms:
                    q = f"site:{doms[0]} {q or 'senaste nyheter'}"
                return (q or "").strip()

            query_text = _derive_query(messages)
            sources = []
            if query_text:
                max_results = max(1, int(web_cfg.get("maxResults", 3)))
                per_page_chars = int(web_cfg.get("perPageChars", 3000))
                total_chars_cap = int(web_cfg.get("totalCharsCap", 9000))
                search_timeout = float(web_cfg.get("searchTimeoutSec", 6.0))
                fetch_timeout = float(web_cfg.get("fetchTimeoutSec", 8.0))
                link_depth = int(web_cfg.get("linkDepth", 0))
                max_pages = int(web_cfg.get("maxPages", 6))

                prefer_playwright = (mode == "playwright")
                prefer_http = (mode == "http")
                prefer_serper = (mode == "serper") or (mode == "auto" and serper_available)

                # 1) Serper (first when available)
                if prefer_serper and not sources:
                    tried_any = True
                    try:
                        loc = (web_cfg.get("user_location") or {}) if isinstance(web_cfg.get("user_location"), dict) else {}
                        country = (loc.get("country") or os.getenv("SERPER_GL") or "").strip() or None
                        hl = (os.getenv("SERPER_HL") or "").strip() or None
                        city = (loc.get("city") or loc.get("region") or None)
                        sources = ws.serper_search_and_fetch(
                            query_text,
                            max_results=max_results,
                            per_page_chars=per_page_chars,
                            total_chars_cap=total_chars_cap,
                            country=country,
                            hl=hl,
                            location=city,
                            search_timeout=search_timeout,
                            fetch_timeout=fetch_timeout,
                        )
                    except Exception:
                        sources = []

                # 2) OpenAI web_search tool (if explicitly chosen or after Serper fails in auto)
                if not sources and use_openai_web_tool and (mode in {"auto", "openai"}):
                    tried_any = True
                    try:
                        reply_text, tool_citations = ws.openai_web_search_tool(client, model, messages, web_cfg)
                        if reply_text and tool_citations:
                            return jsonify({"reply": reply_text, "model": model, "citations": tool_citations})
                    except Exception:
                        pass

                # 3) HTTP (fast) – supports linkDepth path
                if not sources and (prefer_http or mode == "auto") and (link_depth > 0 or max_pages > max_results):
                    start_links = ws.web_search_links(query_text, max_results=1, search_timeout=search_timeout)
                    start_url = (start_links[0].get("url") if start_links else None)
                    if start_url:
                        pages = ws.http_crawl(start_url, link_depth=link_depth, max_pages=max_pages, fetch_timeout=fetch_timeout, per_page_chars=per_page_chars)
                        total = 0
                        for p in pages:
                            txt = (p.get("text") or "")[:per_page_chars]
                            if not txt:
                                continue
                            sources.append({"title": p.get("url") or "", "url": p.get("url") or "", "text": txt})
                            total += len(txt)
                            if total >= total_chars_cap:
                                break
                # 4) HTTP (generic) if still no sources
                if not sources and (prefer_http or mode == "auto"):
                    try:
                        sources = ws.web_search_and_fetch(
                            query_text,
                            max_results=max_results,
                            per_page_chars=per_page_chars,
                            total_chars_cap=total_chars_cap,
                            search_timeout=search_timeout,
                            fetch_timeout=fetch_timeout,
                        )
                    except Exception:
                        sources = []

                # 5) Playwright last (only if explicitly requested or as very last auto fallback)
                if not sources and ws.sync_playwright is not None and (prefer_playwright or mode == "auto"):
                    try:
                        sources = ws.web_search_and_fetch_playwright(
                            query_text,
                            max_results=max_results,
                            per_page_chars=per_page_chars,
                            total_chars_cap=total_chars_cap,
                            search_timeout=search_timeout,
                            fetch_timeout=fetch_timeout,
                        )
                    except Exception:
                        sources = []

                if sources:
                    # Build web context
                    lines = ["Webbkällor (sammanfattade, använd [n] som hänvisning i svaret om relevant):"]
                    for i, s in enumerate(sources, start=1):
                        title = s.get("title") or s.get("url") or f"Källa {i}"
                        url = s.get("url") or ""
                        snippet = (s.get("text") or "").strip()[:per_page_chars]
                        title = re.sub(r"\s+", " ", title).strip()
                        url = url.strip()
                        lines.append(f"[{i}] {title} ({url})\n{snippet}")
                    web_block = "\n\n".join(lines)
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

                citations = ([{"title": s.get("title"), "url": s.get("url")} for s in sources] if sources else [])
                if not citations and query_text:
                    try:
                        from urllib.parse import quote_plus
                        q_safe = quote_plus(query_text)
                        citations = [{"title": "Sökresultat (DuckDuckGo)", "url": f"https://duckduckgo.com/?q={q_safe}"}]
                    except Exception:
                        citations = []

        # Call chat.completions with the assembled messages (with safe fallback for model errors)
        def _invoke(mdl: str):
            max_user_local = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
            return client.chat.completions.create(model=mdl, messages=messages, max_tokens=max_user_local, timeout=30)

        try:
            resp = _invoke(model)
        except Exception as e:
            # Try a safer fallback model once if the error looks model-related (or 400 Bad Request)
            try:
                status = getattr(e, "status_code", None)
            except Exception:
                status = None
            em = None
            try:
                em = (getattr(e, "message", None) or str(e) or "").lower()
            except Exception:
                em = ""
            should_fallback = bool((status == 400) or ("model" in (em or "")) or ("not found" in (em or "")) or ("invalid" in (em or "")))
            if should_fallback:
                fb = os.getenv("FALLBACK_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
                if fb and fb != model:
                    try:
                        resp = _invoke(fb)
                        model = fb  # report the model actually used
                    except Exception as e2:
                        # If fallback also fails, bubble original error below
                        e = e2
                        raise e
                else:
                    # No usable fallback configured
                    raise e
            else:
                # Not a model-related error
                raise e

        try:
            reply = resp.choices[0].message.content if resp.choices else ""
        except Exception:
            reply = ""
        try:
            finish_reason = resp.choices[0].finish_reason  # type: ignore[attr-defined]
        except Exception:
            finish_reason = None
        truncated = bool(finish_reason == "length")
        try:
            usage_obj = getattr(resp, "usage", None)
            usage = ({
                "input_tokens": getattr(usage_obj, "prompt_tokens", None) or getattr(usage_obj, "input_tokens", None),
                "output_tokens": getattr(usage_obj, "completion_tokens", None) or getattr(usage_obj, "output_tokens", None),
                "total_tokens": getattr(usage_obj, "total_tokens", None),
            } if usage_obj else None)
        except Exception:
            usage = None
        return jsonify({"reply": reply, "model": model, "finishReason": finish_reason, "truncated": truncated, "usage": usage, "citations": citations})

    def _extract_text(filename: str, stream: bytes) -> str:
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            # Först: pdfplumber
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(stream)) as pdf:
                    parts = []
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            parts.append(text)
                    if parts:
                        return "\n\n".join(parts).strip()
            except Exception:
                pass  # pdfplumber misslyckades, fortsätt med pypdf

            # Fallback: pypdf
            try:
                if PdfReader is None:
                    return "[PDF-stöd saknas: installera pypdf]"
                reader = PdfReader(io.BytesIO(stream))
                parts = []
                for page in reader.pages:
                    try:
                        parts.append(page.extract_text() or "")
                    except Exception:
                        continue
                return "\n\n".join(parts).strip() if parts else "[Ingen text kunde extraheras]"
            except Exception:
                return "[Kunde inte extrahera text från PDF]"

        # Om inte PDF, försök bara med bytes→text
        try:
            return stream.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    @app.post("/build-exam")
    def build_exam():
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

            def _escape_html(s: str) -> str:
                return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            parts = [f'<div class="exam-sec-title">Titel</div><div class="chip">{_escape_html(title)}</div>']
            if lec_items:
                parts.append('<div class="exam-sec-title">Föreläsningar</div>')
                for it in lec_items:
                    preview = _escape_html((it["text"] or "").strip())
                    parts.append(f'<div class="card-item"><div class="title">{_escape_html(it["name"])}</div><div class="html-box">{preview[:8000]}</div></div>')
            if ex_items:
                parts.append('<div class="exam-sec-title">Tenta</div>')
                for it in ex_items:
                    preview = _escape_html((it["text"] or "").strip())
                    parts.append(f'<div class="card-item"><div class="title">{_escape_html(it["name"])}</div><div class="html-box">{preview[:8000]}</div></div>')

            html = "\n".join(parts)
            return jsonify({"html": html, "counts": {"lectures": len(lec_items), "exams": len(ex_items)}, "title": title})
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    @app.route("/upload", methods=["POST", "OPTIONS"])
    def upload_files():
        # Preflight
        if request.method == "OPTIONS":
            return ("", 204)
        try:
            files = request.files.getlist("files") or []
            if not files:
                return jsonify({"error": "No files provided (field 'files')"}), 400
            try:
                max_chars = int(request.form.get("maxChars", "1000000"))
            except Exception:
                max_chars = 1000000

            items = []
            total_chars = 0
            try:
                from werkzeug.utils import secure_filename  # type: ignore
            except Exception:
                def secure_filename(x: str) -> str:
                    return re.sub(r"[^a-zA-Z0-9_.-]", "_", x or "file")

            base_url = (request.host_url or "").rstrip("/")

            # Helper: join page texts with clear page markers so LLMs can cite [n,sida]
            def _join_pages_with_markers(pages_list):
                try:
                    parts = []
                    for p in (pages_list or []):
                        num = p.get("page")
                        txt = p.get("text", "")
                        parts.append(f"[Sida {num}]\n{txt}")
                    return "\n\n".join(parts)
                except Exception:
                    try:
                        return "\n\n".join((p.get("text", "") for p in (pages_list or [])))
                    except Exception:
                        return ""

            for f in files:
                raw = f.read()
                name = f.filename
                lower = (name or "").lower()
                pages = None
                text = ""
                truncated = False

                # Hantera PDF
                if lower.endswith(".pdf"):
                    # --- pdfplumber först ---
                    try:
                        import pdfplumber
                        pages = []
                        cur_total = 0
                        with pdfplumber.open(io.BytesIO(raw)) as pdf:
                            for idx, page in enumerate(pdf.pages, start=1):
                                t = page.extract_text() or ""
                                if not t:
                                    continue
                                if cur_total + len(t) <= max_chars:
                                    pages.append({"page": idx, "text": t})
                                    cur_total += len(t)
                                else:
                                    remain = max_chars - cur_total
                                    if remain > 0:
                                        pages.append({"page": idx, "text": t[:remain]})
                                        cur_total += remain
                                    truncated = True
                                    break
                        text = _join_pages_with_markers(pages) if pages else ""
                    except Exception:
                        pages = None
                        # --- fallback på pypdf ---
                        if PdfReader is not None:
                            try:
                                reader = PdfReader(io.BytesIO(raw))
                                pages = []
                                cur_total = 0
                                for idx, p in enumerate(reader.pages, start=1):
                                    t = p.extract_text() or ""
                                    if not t:
                                        continue
                                    if cur_total + len(t) <= max_chars:
                                        pages.append({"page": idx, "text": t})
                                        cur_total += len(t)
                                    else:
                                        remain = max_chars - cur_total
                                        if remain > 0:
                                            pages.append({"page": idx, "text": t[:remain]})
                                            cur_total += remain
                                        truncated = True
                                        break
                                text = _join_pages_with_markers(pages) if pages else ""
                            except Exception:
                                text = "[Kunde inte extrahera text från PDF]"
                        else:
                            text = "[PDF-stöd saknas: installera pypdf]"
                else:
                    # Om ej PDF, försök direkt med bytes → text
                    try:
                        text = raw.decode("utf-8", errors="ignore")
                    except Exception:
                        text = ""

                # Spara filen till disk för stabil URL
                try:
                    ts = int(time.time() * 1000)
                    fn = secure_filename(name or "file")
                    stored_name = f"{ts}_{fn}"
                    upload_dir = os.environ.get("UPLOAD_DIR", os.path.join(os.getcwd(), "uploads"))
                    os.makedirs(upload_dir, exist_ok=True)
                    with open(os.path.join(upload_dir, stored_name), "wb") as out:
                        out.write(raw)
                    file_url = f"{base_url}/files/{stored_name}"
                except Exception:
                    stored_name = None
                    file_url = None

                total_chars += len(text)
                item = {"name": name, "chars": len(text), "truncated": truncated, "text": text}
                if pages is not None:
                    item["pages"] = pages
                if file_url:
                    item["url"] = file_url
                items.append(item)

            return jsonify({"count": len(items), "totalChars": total_chars, "items": items})
        except Exception as e:
            return jsonify({"error": str(e)}), 400


    @app.get("/files/<path:fname>")
    def serve_file(fname: str):
        # Serve uploaded files (read-only)
        try:
            return send_from_directory(UPLOAD_DIR, fname, as_attachment=False)
        except Exception as e:
            return jsonify({"error": str(e)}), 404

    @app.get("/debug/fetch")
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

    @app.get("/debug/env")
    def debug_env():
        """Safe introspection: shows whether critical env vars are visible (no secrets)."""
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

    @app.get("/key-status")
    def key_status():
        """Lightweight endpoint used by the frontend to detect if a global key exists."""
        try:
            api = os.getenv("OPENAI_API_KEY") or ""
            return jsonify({
                "hasKey": bool(api),
                # do not leak full secret
                "preview": (api[:4] + "…" + api[-2:] if len(api) > 8 else (api[:3] + "…" if api else "")),
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=True)
