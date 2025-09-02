from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple, Union
import re
import hashlib

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None  # type: ignore


@dataclass
class Page:
    page: int
    text: str
    width: Optional[float] = None
    height: Optional[float] = None


def _read_doc(src: Union[str, bytes, bytearray]):
    if fitz is None:
        raise RuntimeError("PyMuPDF (fitz) is not installed. pip install pymupdf")
    if isinstance(src, (bytes, bytearray)):
        return fitz.open(stream=bytes(src), filetype="pdf")
    return fitz.open(str(src))


def extract_pages(src: Union[str, bytes, bytearray]) -> List[Page]:
    doc = _read_doc(src)
    pages: List[Page] = []
    for i in range(len(doc)):
        p = doc.load_page(i)
        txt = p.get_text("text")  # layout-aware text
        pages.append(Page(page=i + 1, text=txt or "", width=p.rect.width, height=p.rect.height))
    return pages


def _normalize_line(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def strip_headers_footers(pages: List[Page], min_ratio: float = 0.6, band_lines: int = 3) -> List[Page]:
    """
    Remove lines that repeat on >= min_ratio of pages within the first/last band_lines per page.
    """
    if not pages:
        return pages
    top_counts = {}
    bot_counts = {}
    total = len(pages)
    # First pass: collect candidates
    for pg in pages:
        lines = [ln for ln in (pg.text or "").splitlines() if _normalize_line(ln)]
        top = [
            _normalize_line(ln) for ln in lines[: band_lines]
        ]
        bot = [
            _normalize_line(ln) for ln in lines[-band_lines:]
        ]
        for ln in top:
            top_counts[ln] = top_counts.get(ln, 0) + 1
        for ln in bot:
            bot_counts[ln] = bot_counts.get(ln, 0) + 1
    top_ban = {ln for ln, c in top_counts.items() if c / total >= min_ratio}
    bot_ban = {ln for ln, c in bot_counts.items() if c / total >= min_ratio}
    # Second pass: filter
    out: List[Page] = []
    for pg in pages:
        lines = (pg.text or "").splitlines()
        keep: List[str] = []
        for idx, ln in enumerate(lines):
            n = _normalize_line(ln)
            if idx < band_lines and n in top_ban:
                continue
            if idx >= len(lines) - band_lines and n in bot_ban:
                continue
            keep.append(ln)
        out.append(Page(page=pg.page, text="\n".join(keep), width=pg.width, height=pg.height))
    return out


def dedupe_repeated_lines(pages: List[Page]) -> List[Page]:
    """Remove exact duplicate lines repeated many times across the document (naive global dedupe)."""
    if not pages:
        return pages
    counts = {}
    for pg in pages:
        for ln in (pg.text or "").splitlines():
            n = _normalize_line(ln)
            if not n:
                continue
            counts[n] = counts.get(n, 0) + 1
    # drop globally frequent short boilerplate
    ban = {ln for ln, c in counts.items() if c >= max(5, len(pages) // 3) and len(ln) <= 80}
    out: List[Page] = []
    for pg in pages:
        kept = [ln for ln in (pg.text or "").splitlines() if _normalize_line(ln) not in ban]
        out.append(Page(page=pg.page, text="\n".join(kept), width=pg.width, height=pg.height))
    return out


def split_sentences(text: str) -> List[str]:
    # Lightweight sentence split; avoids heavy deps
    text = re.sub(r"\s+", " ", text.strip())
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])", text)
    return [p.strip() for p in parts if p.strip()]


def rolling_window_sentences(sentences: List[str], max_tokens: int, overlap: int, count_tokens) -> List[str]:
    if not sentences:
        return []
    chunks: List[str] = []
    cur: List[str] = []
    cur_tok = 0
    for s in sentences:
        t = max(1, count_tokens(s))
        if cur and cur_tok + t > max_tokens:
            chunks.append(" ".join(cur))
            # overlap by sentence pieces until overlap token budget is satisfied
            if overlap > 0:
                # keep from tail until reaching overlap tokens
                tail: List[str] = []
                tail_tok = 0
                for seg in reversed(cur):
                    tt = max(1, count_tokens(seg))
                    if tail_tok + tt > overlap:
                        break
                    tail.append(seg)
                    tail_tok += tt
                cur = list(reversed(tail))
                cur_tok = sum(max(1, count_tokens(seg)) for seg in cur)
            else:
                cur = []
                cur_tok = 0
        cur.append(s)
        cur_tok += t
    if cur:
        chunks.append(" ".join(cur))
    return chunks


def pages_to_chunks(
    pages: List[Page],
    count_tokens,
    min_tokens: int = 500,
    max_tokens: int = 900,
    overlap_ratio: float = 0.12,
) -> List[Tuple[str, dict]]:
    """
    Convert cleaned pages to token-aware chunks. Each chunk carries minimal metadata.
    Returns list of (text, meta) where meta has {doc, page, title, idx} if available.
    """
    overlap = int(max_tokens * max(0.0, min(0.5, overlap_ratio)))
    chunks: List[Tuple[str, dict]] = []
    idx = 0
    for pg in pages:
        sents = split_sentences(pg.text)
        pieces = rolling_window_sentences(sents, max_tokens=max_tokens, overlap=overlap, count_tokens=count_tokens)
        for piece in pieces:
            # ensure lower bound: if under min_tokens and we have next, try to merge greedily
            if count_tokens(piece) < min_tokens and chunks:
                prev_txt, prev_meta = chunks[-1]
                merged = prev_txt + "\n\n" + piece
                if count_tokens(merged) <= max_tokens + overlap:
                    chunks[-1] = (merged, prev_meta)
                    continue
            meta = {"page": pg.page, "idx": idx}
            chunks.append((piece, meta))
            idx += 1
    return chunks


def content_sha256(model: str, text: str) -> str:
    h = hashlib.sha256()
    h.update((model + "\n" + text).encode("utf-8", errors="ignore"))
    return h.hexdigest()
