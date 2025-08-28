import re
from typing import List, Tuple


def _split_bilaga_blocks(text: str) -> List[Tuple[int, str, str]]:
    """
    Parse a Bilaga block into [(index, title, content)].
    Blocks are separated by \n\n---\n\n and start with "[n] Title (x tecken)".
    """
    if not text:
        return []
    parts = [p for p in re.split(r"\n\n---\n\n", text) if p and p.strip()]
    out = []
    for p in parts:
        lines = p.splitlines()
        if not lines:
            continue
        m = re.match(r"^\s*\[(\d+)\]\s*(.+?)\s*(?:\(.*?\))?\s*$", lines[0])
        if not m:
            # If no header, treat as content-only with n=1
            out.append((1, "Bilaga", p))
            continue
        idx = int(m.group(1))
        title = m.group(2).strip()
        body = "\n".join(lines[1:])
        out.append((idx, title, body))
    return out


def _split_pages(content: str) -> List[Tuple[int, str]]:
    """
    Split content by page markers of form "[Sida N]" (added at upload time for PDFs).
    Returns list of (page, text). If no markers, returns a single (1, content).
    """
    if not content:
        return []
    # Find all positions of [Sida N]
    matches = list(re.finditer(r"\[\s*Sida\s*(\d+)\s*\]", content, flags=re.IGNORECASE))
    if not matches:
        return [(1, content)]
    pages: List[Tuple[int, str]] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        page_no = int(m.group(1))
        page_text = content[start:end].strip()
        if page_text:
            pages.append((page_no, page_text))
    return pages or [(1, content)]


def pagewise_window(original_bilaga: str, start_page: int = 1, pages_per_step: int = 1) -> Tuple[str, int, bool]:
    """
    Build a Bilaga containing only a contiguous window of pages across attachments.
    Pages are counted per attachment independently (restart at 1 for each [n]).
    We include window for each attachment if its pages overlap [start_page, start_page+pages_per_step-1].
    Returns (rebuilt_bilaga, next_start_page, has_more).
    """
    try:
        if start_page < 1:
            start_page = 1
        if pages_per_step < 1:
            pages_per_step = 1
        blocks = _split_bilaga_blocks(original_bilaga.replace("Bilaga:\n", "", 1))
        if not blocks:
            return original_bilaga, start_page, False
        end_page = start_page + pages_per_step - 1
        kept = []
        any_more = False
        for (idx, title, body) in blocks:
            pages = _split_pages(body)
            if not pages:
                continue
            # Check if there are pages beyond end_page
            max_p = max((p for (p, _) in pages), default=0)
            if max_p > end_page:
                any_more = True
            # Collect pages within window
            chunk = [(p, txt) for (p, txt) in pages if start_page <= p <= end_page]
            if not chunk:
                continue
            kept.append(f"[{idx}] {title}")
            for (p, txt) in chunk:
                kept.append(f"[Sida {p}]\n{txt.strip()}")
            kept.append("---")
        # Rebuild
        out = ["Bilaga:"]
        rebuilt = []
        cur: List[str] = []
        for s in kept:
            if s == "---":
                if cur:
                    rebuilt.append("\n".join(cur))
                    cur = []
            else:
                cur.append(s)
        if cur:
            rebuilt.append("\n".join(cur))
        next_start = end_page + 1
        return ("\n".join(out + ["\n\n---\n\n".join(rebuilt)]) if rebuilt else original_bilaga, next_start, any_more)
    except Exception:
        return original_bilaga, start_page, False
