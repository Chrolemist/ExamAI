import os
import re
import time
from typing import Optional
from urllib.parse import quote_plus, urlparse, urljoin

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


# -------------------- OpenAI Responses web_search tool --------------------

def openai_web_search_tool(client, model: str, messages: list, web_cfg: dict):
    """Call OpenAI Responses API web_search tool.
    Returns (reply_text, citations[]) where citations are {title, url}.
    """
    # Build a compact transcript as input
    def _to_input_text(msgs):
        parts = []
        for m in msgs[-16:]:  # most recent turns
            r = (m.get("role") or "").strip()
            c = (m.get("content") or "").strip()
            if not c:
                continue
            if r == "system":
                parts.append(f"System: {c}")
            elif r == "user":
                parts.append(f"User: {c}")
            else:
                parts.append(f"Assistant: {c}")
        return "\n\n".join(parts).strip()

    tools = [{"type": "web_search"}]
    # Inline tool configuration
    tool_cfg = tools[0]
    # user_location support if provided
    loc = web_cfg.get("user_location") or {}
    if isinstance(loc, dict) and any(loc.get(k) for k in ("country", "city", "region", "timezone")):
        tool_cfg["user_location"] = {
            "type": "approximate",
            **{k: v for k, v in loc.items() if v}
        }
    # search_context_size: "low" | "medium" | "high"
    scs = (web_cfg.get("search_context_size") or "").strip().lower()
    if scs in {"low", "medium", "high"}:
        tool_cfg["search_context_size"] = scs

    params = {
        "model": model,
        "tools": tools,
        "input": _to_input_text(messages),
    }
    if web_cfg.get("forceTool"):
        params["tool_choice"] = {"type": "web_search"}

    resp = client.responses.create(**params)

    # Extract text
    reply_text = None
    citations = []
    try:
        reply_text = getattr(resp, "output_text", None)
    except Exception:
        reply_text = None
    # Fallback: traverse output structure
    if not reply_text:
        try:
            out = getattr(resp, "output", None) or []
            texts = []
            for item in out:
                it = getattr(item, "type", None) or item.get("type")
                if it == "message":
                    content = getattr(item, "content", None) or item.get("content") or []
                    for c in content:
                        ct = getattr(c, "type", None) or c.get("type")
                        if ct == "output_text":
                            t = getattr(c, "text", None) or c.get("text")
                            if t:
                                texts.append(t)
                                # Annotations with citations
                                ann = getattr(c, "annotations", None) or c.get("annotations") or []
                                for a in ann:
                                    if (getattr(a, "type", None) or a.get("type")) == "url_citation":
                                        url = getattr(a, "url", None) or a.get("url")
                                        title = getattr(a, "title", None) or a.get("title")
                                        if url:
                                            citations.append({"title": title or url, "url": url})
            reply_text = "\n\n".join(texts).strip() if texts else None
        except Exception:
            reply_text = None
    return reply_text, citations


# -------------------- Web search helpers --------------------

def web_search_links(query: str, max_results: int = 3, search_timeout: float = 5.0):
    """Search DuckDuckGo HTML (with fallbacks) and return a list of {title, url}."""
    if not requests:
        return []
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36"
    }
    try:
        q = quote_plus(query)
        kl = os.getenv("SEARCH_LOCALE", "se-sv")
        links = []

        def parse_ddg_html(html: str):
            out = []
            if BeautifulSoup is not None:
                soup = BeautifulSoup(html, "html.parser")
                for a in soup.select("a.result__a, a.result__url, a.result__title"):
                    href = a.get("href")
                    title = a.get_text(" ").strip() or href
                    if href and href.startswith("http"):
                        out.append({"title": title, "url": href})
                    if len(out) >= max_results:
                        break
            else:
                for m in re.finditer(r'<a[^>]+href="(http[^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
                    url = m.group(1)
                    title = re.sub("<[^>]+>", " ", m.group(2))
                    title = re.sub(r"\s+", " ", title).strip()
                    if url and url.startswith("http"):
                        out.append({"title": title or url, "url": url})
                    if len(out) >= max_results:
                        break
            return out

        # Try ddg HTML endpoint
        try:
            resp = requests.get(
                f"https://html.duckduckgo.com/html/?q={q}&kl={kl}&ia=web",
                headers=headers,
                timeout=search_timeout,
            )
            links = parse_ddg_html(resp.text)
        except Exception:
            links = []

        # Fallback to main ddg html if needed
        if not links:
            try:
                resp = requests.get(
                    f"https://duckduckgo.com/html/?q={q}&kl={kl}&ia=web",
                    headers=headers,
                    timeout=search_timeout,
                )
                links = parse_ddg_html(resp.text)
            except Exception:
                links = []

        # Fallback to ddg lite
        if not links:
            try:
                resp = requests.get(
                    f"https://lite.duckduckgo.com/lite/?q={q}",
                    headers=headers,
                    timeout=search_timeout,
                )
                html = resp.text
                if BeautifulSoup is not None:
                    soup = BeautifulSoup(html, "html.parser")
                    for a in soup.select("a"):
                        href = a.get("href")
                        title = a.get_text(" ").strip()
                        if href and href.startswith("http") and title:
                            links.append({"title": title, "url": href})
                            if len(links) >= max_results:
                                break
                else:
                    for m in re.finditer(r'<a[^>]+href="(http[^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
                        url = m.group(1)
                        title = re.sub("<[^>]+>", " ", m.group(2))
                        title = re.sub(r"\s+", " ", title).strip()
                        if url and url.startswith("http") and title:
                            links.append({"title": title, "url": url})
                            if len(links) >= max_results:
                                break
            except Exception:
                links = []

        # Fallback to Google News RSS for newsy queries
        if not links and any(tok in query.lower() for tok in ["nyhet", "news", "senaste", "breaking"]):
            try:
                rss = requests.get(
                    f"https://news.google.com/rss/search?q={q}&hl=sv-SE&gl=SE&ceid=SE:sv",
                    headers=headers,
                    timeout=search_timeout,
                )
                xml = rss.text
                if BeautifulSoup is not None:
                    soup = BeautifulSoup(xml, "xml")
                    for it in soup.find_all("item"):
                        link = it.find("link")
                        title = it.find("title")
                        if link and link.text:
                            links.append({"title": (title.text if title else link.text), "url": link.text})
                            if len(links) >= max_results:
                                break
            except Exception:
                pass

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


def web_search_and_fetch(
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
    links = web_search_links(query, max_results=max_results, search_timeout=search_timeout)
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
            txt = fetch_readable_text(url, headers=headers, timeout=fetch_timeout)[:per_page_chars]
            if txt:
                out.append({"title": title, "url": url, "text": txt})
                total += len(txt)
                if total >= total_chars_cap:
                    break
        except Exception:
            continue
    return out


def web_search_and_fetch_playwright(
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
        return web_search_and_fetch(
            query,
            max_results=max_results,
            per_page_chars=per_page_chars,
            total_chars_cap=total_chars_cap,
            search_timeout=search_timeout,
            fetch_timeout=fetch_timeout,
        )

    links = web_search_links(query, max_results=max_results, search_timeout=search_timeout)
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
                if trafilatura is not None:
                    try:
                        html = page.content()
                        extracted = trafilatura.extract(html, url=url, include_comments=False, include_formatting=False) or ""
                        text = extracted.strip()
                    except Exception:
                        text = ""
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


def fetch_readable_text(url: str, headers=None, timeout: float = 6.0) -> str:
    if not requests:
        return ""
    headers = headers or {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    ctype = r.headers.get("Content-Type", "").lower()
    text = r.text
    if "text/plain" in ctype or url.lower().endswith((".txt", ".md", ".text")):
        return text
    if trafilatura is not None:
        try:
            extracted = trafilatura.extract(text, url=url, include_comments=False, include_formatting=False)
            if extracted and len(extracted.strip()) > 80:
                return extracted.strip()
        except Exception:
            pass
    if BeautifulSoup is None:
        text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
        return re.sub("<[^>]+>", " ", text)
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "form", "aside"]):
        try:
            tag.decompose()
        except Exception:
            continue
    main = soup.find(["article", "main"]) or soup.body
    txt = main.get_text("\n", strip=True) if main else soup.get_text("\n", strip=True)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


# -------------------- HTTP link-following crawl (bounded) --------------------

def _http_fetch(session, url: str, timeout: float = 8.0):
    if not requests:
        return (url, "", [])
    r = session.get(url, timeout=timeout, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    html = r.text or ""
    links = []
    if BeautifulSoup is not None:
        soup = BeautifulSoup(html, "html.parser")
        text = ""
        if trafilatura is not None:
            try:
                extr = trafilatura.extract(html, url=r.url, include_comments=False, include_formatting=False) or ""
                text = extr.strip()
            except Exception:
                text = ""
        if not text:
            main = soup.find(["article", "main"]) or soup.body
            text = (main.get_text("\n", strip=True) if main else soup.get_text("\n", strip=True))
        try:
            can = soup.select_one('link[rel="canonical"]')
            if can and can.get("href"):
                links.append(can["href"])
        except Exception:
            pass
        try:
            og = soup.select_one('meta[property="og:url"]')
            if og and og.get("content"):
                links.append(og["content"])
        except Exception:
            pass
        try:
            for a in soup.find_all("a", href=True)[:100]:
                href = a.get("href")
                if href and not href.startswith("#"):
                    links.append(href)
        except Exception:
            pass
    else:
        text = re.sub(r"<[^>]+>", " ", html)
        for m in re.finditer(r'href=["\']([^"\']+)["\']', html, re.I):
            links.append(m.group(1))
    return (r.url, text.strip(), links)


def _same_domain(a: str, b: str) -> bool:
    try:
        pa = urlparse(a)
        pb = urlparse(b)
        da = (pa.netloc or "").split(":")[0].lower()
        db = (pb.netloc or "").split(":")[0].lower()
        return da.endswith(db) or db.endswith(da)
    except Exception:
        return False


def http_crawl(start_url: str, link_depth: int = 0, max_pages: int = 6, fetch_timeout: float = 6.0, per_page_chars: int = 3000):
    """BFS crawl within same domain up to link_depth and max_pages. Returns list of {url, text}."""
    if not requests:
        return []
    from collections import deque
    seen = set()
    out = []
    q = deque()
    q.append((start_url, 0))
    with requests.Session() as s:
        while q and len(out) < max_pages:
            url, d = q.popleft()
            if not url or url in seen:
                continue
            seen.add(url)
            try:
                final_url, text, links = _http_fetch(s, url, timeout=fetch_timeout)
                if text:
                    out.append({"url": final_url, "text": text[:per_page_chars]})
                if d < link_depth:
                    for href in links[:60]:
                        try:
                            nxt = urljoin(final_url, href)
                            if _same_domain(start_url, nxt) and nxt not in seen:
                                q.append((nxt, d + 1))
                        except Exception:
                            continue
            except Exception:
                continue
    return out


# -------------------- Serper.dev (Google) provider --------------------

def _serper_headers(api_key: Optional[str] = None):
    key = api_key or os.getenv("SERPER_API_KEY") or ""
    return {
        "X-API-KEY": key,
        "Content-Type": "application/json",
    }


def serper_search_links(query: str, max_results: int = 3, country: Optional[str] = None, hl: Optional[str] = None, location: Optional[str] = None, timeout: float = 6.0, api_key: Optional[str] = None):
    """Use Serper.dev to get organic results. Returns list of {title, url}."""
    if not requests:
        return []
    try:
        headers = _serper_headers(api_key)
        if not headers.get("X-API-KEY"):
            return []
        body = {"q": query}
        if country:
            body["gl"] = country.lower()
        if hl:
            body["hl"] = hl
        if location:
            body["location"] = location
        r = requests.post("https://google.serper.dev/search", json=body, headers=headers, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        org = data.get("organic") or []
        out = []
        for it in org:
            url = it.get("link") or it.get("url")
            title = it.get("title") or url
            if url:
                out.append({"title": title, "url": url})
            if len(out) >= max_results:
                break
        # If empty, try news endpoint as fallback
        if not out:
            try:
                rn = requests.post("https://google.serper.dev/news", json=body, headers=headers, timeout=timeout)
                rn.raise_for_status()
                nd = rn.json()
                news = nd.get("news") or []
                for it in news:
                    url = it.get("link") or it.get("url")
                    title = it.get("title") or url
                    if url:
                        out.append({"title": title, "url": url})
                    if len(out) >= max_results:
                        break
            except Exception:
                pass
        return out
    except Exception:
        return []


def serper_search_and_fetch(
    query: str,
    max_results: int = 3,
    per_page_chars: int = 3000,
    total_chars_cap: int = 9000,
    country: Optional[str] = None,
    hl: Optional[str] = None,
    location: Optional[str] = None,
    search_timeout: float = 6.0,
    fetch_timeout: float = 6.0,
    api_key: Optional[str] = None,
):
    """Search via Serper.dev and fetch readable text for results. Returns [{title,url,text}]."""
    links = serper_search_links(query, max_results=max_results, country=country, hl=hl, location=location, timeout=search_timeout, api_key=api_key)
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
            txt = fetch_readable_text(url, headers=headers, timeout=fetch_timeout)[:per_page_chars]
            if txt:
                out.append({"title": title, "url": url, "text": txt})
                total += len(txt)
                if total >= total_chars_cap:
                    break
        except Exception:
            continue
    return out
