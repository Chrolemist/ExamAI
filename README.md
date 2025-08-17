# ExamAI

Multi-copilot chat app with optional web access via an Internet hub and server-side Playwright browsing.

# ExamAI

AI-driven examination system med modulär arkitektur och SOLID-principerna.

## Projektstruktur

```
ExamAI/
├── backend/           # Flask backend server
│   ├── app.py        # Huvudapplikation  
│   ├── wsgi.py       # WSGI konfiguration
│   ├── requirements.txt
│   └── README.md
├── frontend/         # JavaScript frontend
│   ├── js/           # Modulär JavaScript kod
│   │   ├── core/     # Kärnkomponenter
│   │   ├── graph/    # Graf och visualisering
│   │   └── nodes/    # Node-hantering
│   ├── index.html    # Huvudsida
│   ├── app.js        # Huvudapplikation
│   ├── styles.css    # Stilar
│   └── README.md
└── tests/            # Test suite
    ├── test-solid-compliance.js
    ├── test-solid.html
    ├── test_app.py
    └── README.md
```

## Snabbstart

1. **Backend**: 
```bash
cd backend
pip install -r requirements.txt
python app.py
```

2. **Frontend**:
```bash
python -m http.server 8080
# Öppna http://localhost:8080/frontend/index.html
```

3. **Tester**:
```bash
# SOLID compliance tests:
# Öppna http://localhost:8080/tests/test-solid.html

# Backend tests:
cd backend && python -m pytest ../tests/test_app.py -v
```

## Arkitektur

Projektet följer **SOLID-principerna** med:
- **Single Responsibility**: Varje modul har en specifik uppgift
- **Open/Closed**: Utbyggbart utan att ändra befintlig kod
- **Liskov Substitution**: Komponenter kan bytas ut transparent
- **Interface Segregation**: Små, fokuserade interfaces
- **Dependency Inversion**: Dependencies injiceras, inte hardkodade

## Funktioner

- Interaktiv grafvisualiseringen med nodes och kopplingar
- Modulär frontend med ES6 modules och dependency injection
- Comprehensive test suite för SOLID compliance
- Flask backend med RESTful APIs
- Docker support för deployment

## Original Features

- Multiple copilots (floating panels) with per-instance settings and keys
- Link copilots together for shared conversation and turn-taking
- Internet hub (globe): drag it on the board; link a copilot to grant web access
- Drag & drop files (PDF/TXT/MD) into chat; text is extracted server-side
- Saved chat sessions (client-side storage)
- Global pause/resume flow and global display name

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
