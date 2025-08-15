import os
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

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
        model = (data.get("model") or os.getenv("OPENAI_MODEL") or "gpt-5-mini").strip()
        # Optional per-request API key (not stored). Otherwise use env var.
        api_key = (data.get("apiKey") or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_APIKEY") or os.getenv("OPENAI_KEY"))
        incoming_messages = data.get("messages")
        has_history = isinstance(incoming_messages, list) and len(incoming_messages) > 0

        if not user_message and not has_history:
            return jsonify({"error": "message is required (or provide messages[])"}), 400

        if OpenAI is None:
            return jsonify({"error": "openai package not installed"}), 500

        if not api_key:
            return jsonify({"error": "No API key provided. Set OPENAI_API_KEY env var or pass apiKey in request."}), 401

        client = OpenAI(api_key=api_key)

        # Note: GPT-5 style models may ignore temperature; we omit it.
        system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()

        try:
            # Build message history: prefer provided 'messages' (list of {role, content}), else single user message
            if has_history:
                # Ensure system message first
                if not (isinstance(incoming_messages[0], dict) and incoming_messages[0].get("role") == "system"):
                    messages = [{"role": "system", "content": system_prompt}] + incoming_messages
                else:
                    messages = incoming_messages
            else:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ]

            max_user = data.get("max_tokens") or data.get("max_completion_tokens") or 1000

            kwargs = {"model": model, "messages": messages}
            if model.startswith("gpt-5") or model in {"gpt-5", "gpt-5-mini", "gpt-5-nano", "3o"}:
                kwargs["max_completion_tokens"] = max_user
            else:
                kwargs["max_tokens"] = max_user

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

            return jsonify({"reply": reply, "model": model, "finishReason": finish_reason, "truncated": truncated, "usage": usage})

        except Exception as e:
            # Return a concise error, but include message for debugging local dev
            return jsonify({"error": str(e)}), 500

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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=True)
