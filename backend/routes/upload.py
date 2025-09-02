import io
import os
import re
import time
from flask import Blueprint, current_app, jsonify, request, send_from_directory

try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None  # type: ignore

# Prefer our cleaner PyMuPDF-based extractor if available
try:
    from services import pdf_extractor as _pdfx  # type: ignore
except Exception:
    _pdfx = None  # type: ignore

upload_bp = Blueprint("upload", __name__)


def _extract_text(filename: str, stream: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        # Try our PyMuPDF-based extractor first for higher-quality text
        if _pdfx is not None:
            try:
                pages = _pdfx.extract_pages(stream)
                pages = _pdfx.strip_headers_footers(pages)
                pages = _pdfx.dedupe_repeated_lines(pages)
                if pages:
                    return "\n\n".join((p.text or "") for p in pages).strip()
            except Exception:
                pass
        # Fallback to pdfplumber
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(stream)) as pdf:
                parts = []
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        parts.append(t)
                if parts:
                    return "\n\n".join(parts).strip()
        except Exception:
            pass
        # Fallback to PyPDF
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
    try:
        return stream.decode("utf-8", errors="ignore")
    except Exception:
        return ""


@upload_bp.route("/upload", methods=["POST", "OPTIONS"])
def upload_files():
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
            if lower.endswith(".pdf"):
                # Prefer PyMuPDF-based extractor with cleaning; fallback to pdfplumber/pypdf
                pages = []
                cur_total = 0
                used_clean_extractor = False
                if _pdfx is not None:
                    try:
                        pg_objs = _pdfx.extract_pages(raw)
                        pg_objs = _pdfx.strip_headers_footers(pg_objs)
                        pg_objs = _pdfx.dedupe_repeated_lines(pg_objs)
                        for obj in pg_objs:
                            t = obj.text or ""
                            if not t:
                                continue
                            if cur_total + len(t) <= max_chars:
                                pages.append({"page": obj.page, "text": t})
                                cur_total += len(t)
                            else:
                                remain = max_chars - cur_total
                                if remain > 0:
                                    pages.append({"page": obj.page, "text": t[:remain]})
                                    cur_total += remain
                                truncated = True
                                break
                        used_clean_extractor = True
                    except Exception:
                        pages = []
                        cur_total = 0
                        used_clean_extractor = False
                if not used_clean_extractor:
                    try:
                        import pdfplumber
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
                    except Exception:
                        if PdfReader is not None:
                            try:
                                reader = PdfReader(io.BytesIO(raw))
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
                            except Exception:
                                text = "[Kunde inte extrahera text från PDF]"
                        else:
                            text = "[PDF-stöd saknas: installera pypdf]"
                # Build text
                if pages and not text:
                    text = _join_pages_with_markers(pages)
            else:
                try:
                    text = raw.decode("utf-8", errors="ignore")
                except Exception:
                    text = ""

            # Save file for static serving
            try:
                ts = int(time.time() * 1000)
                fn = secure_filename(name or "file")
                stored_name = f"{ts}_{fn}"
                upload_dir = current_app.config.get("UPLOAD_DIR")
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


@upload_bp.get("/files/<path:fname>")
def serve_file(fname: str):
    try:
        return send_from_directory(current_app.config.get("UPLOAD_DIR"), fname, as_attachment=False)
    except Exception as e:
        return jsonify({"error": str(e)}), 404
