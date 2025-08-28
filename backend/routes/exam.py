import io
from flask import Blueprint, jsonify, request

try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None  # type: ignore

exam_bp = Blueprint("exam", __name__)


def _extract_text(filename: str, stream: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
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


@exam_bp.post("/build-exam")
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
