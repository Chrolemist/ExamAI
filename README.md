# ExamAI

Multi-copilot chat app with optional web access via an Internet hub and server-side Playwright browsing.

## Quick start

1) Python env
- Use your existing `examai` conda env or any Python 3.10+.
- Install deps (includes Playwright):

```
pip install -r requirements.txt
python -m playwright install chromium --with-deps
```

2) API key
- Create a `.env` file in this folder with your OpenAI key:

```
OPENAI_API_KEY=sk-...your-key...
# Optional: pick a default model used as fallback when selecting gpt-5* aliases
OPENAI_FALLBACK_MODEL=gpt-4o-mini
PORT=8011
```

- Alternatively paste a key in the UI settings (overrides server key for that session).

3) Run the server

```
PORT=8011 python app.py
```

Browse http://127.0.0.1:8011

## Features
- Multiple copilots (floating panels) with per-instance settings and keys.
- Link copilots together for shared conversation and turn-taking.
- Internet hub (globe): drag it on the board; link a copilot to grant web access.
  - The hub “lights up” while web fetching is active.
  - Web access is only used when a copilot is linked to the hub.
- Drag & drop files (PDF/TXT/MD) into chat; text is extracted server-side.
- Saved chat sessions (client-side storage).
- Global pause/resume flow and global display name.

## Web browsing details
- When web is enabled (hub link present), the backend prefers Playwright to fetch pages (handles JS-rendered content) and falls back to `requests` + `BeautifulSoup` if Playwright is unavailable.
- Search is via DuckDuckGo HTML; a few top results are fetched and summarized into a compact system context, with citations returned to the UI.
- You can control max results per copilot (stored in localStorage; defaults to 3).

## Troubleshooting
- 401 "No API key provided": add your key in the UI or set `OPENAI_API_KEY` in `.env`.
- Playwright not installed: re-run the install step above. In containers, you may need `--no-sandbox` (already set in code).
- PDFs not extracting: ensure `pypdf` is installed (it's in `requirements.txt`).

## Notes
- The `env-example` file is a sample. Do not commit real secrets. Put secrets only in your local `.env`.
- Model aliases like `gpt-5`, `gpt-5-mini/nano`, or `3o` map to `OPENAI_FALLBACK_MODEL` (default `gpt-4o-mini`).
