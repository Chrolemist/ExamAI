# ExamAI Backend

Flask backend server för ExamAI applikationen.

## Setup

1. Installera dependencies:
```bash
pip install -r requirements.txt
```

2. Skapa en .env (i projektroten c:\Examai):
```env
OPENAI_API_KEY=sk-...
# valfritt
OPENAI_MODEL=gpt-4o-mini
PORT=8000
```

3. Starta development server:
```bash
python app.py
```

Servern kommer köra på http://localhost:8000

4. Verifiera att nyckeln laddats:
Öppna i webbläsaren: http://localhost:8000/debug/env
Den visar `hasApiKey: true` om .env hittats och laddats.

## Production

För production-deploy, använd WSGI servern:
```bash
gunicorn -w 4 -b 0.0.0.0:8000 wsgi:application
```

## Docker

Bygg och kör med Docker:
```bash
docker build -t examai-backend .
docker run -p 8000:8000 examai-backend
```

# Backend API

Refactored with SOLID-style modules and blueprints:

- app.py: thin app factory (config, CORS, blueprint registration)
- routes/
	- chat.py: plain chat endpoint
	- upload.py: file uploads and serving
	- debug.py: debug utilities
	- exam.py: demo exam builder
	- rag.py: RAG ingest/query (per-collection store, metadata for citations)
	- summarize.py: hierarchical summarization
	- sliding.py: sliding window reading/QA
- services/
	- openai_service.py: OpenAI client factory
	- tokenizer.py: token counting and chunking
	- embeddings.py: embedding helper
	- vector_store.py: in-memory vector DB (swap with Pinecone/Weaviate/Qdrant in prod)
	- vector_registry.py: per-collection registry for isolated vector stores

RAG endpoints:
- POST /rag/ingest { collection, bilaga?, text, chunkTokens?, overlapTokens?, embeddingModel? }
	- Splits by [Sida N] markers, chunks per page, stores metadata {bilaga, sida}
- POST /rag/query { collection, query, topK?, model?, embeddingModel?, max_tokens?, returnJSON? }
	- Retrieves top chunks and instructs the model to cite [Bilaga, Sida] in the answer; returns sources list
- POST /summarize/hierarchical { text, chunkTokens?, overlapTokens?, model?, layerPrompt?, max_tokens? }
- POST /sliding/window { text, windowTokens?, overlapTokens?, ask?, model? }

## Tools (Function Calling) and Python Runner

- POST /tools/run-python – Kör korta Python‑snuttar i en isolerad subprocess med CPU/minnesgränser.

Function calling via OpenAI tools:

Skicka `tools` till `/chat` (icke‑stream) med t.ex.:

```
[
	{
		"type": "function",
		"function": {
			"name": "run_python",
			"description": "Kör Pythonkod och returnerar resultatet",
			"parameters": {
				"type": "object",
				"properties": { "code": {"type": "string"} },
				"required": ["code"]
			}
		}
	}
]
```

När modellen svarar med `tool_calls`, kör backend koden (tidsgräns/minnesgräns) och återupptar sedan konversationen en gång med verktygsresultatet. För `/chat/stream` exekveras inte verktyg inline; servern sänder en `meta`‑rad med `tool_calls_pending` så klienten kan falla tillbaka till `/chat` eller hantera verktyg separat.

Säkerhet: Detta är en lättviktig sandbox (RLIMIT_CPU/RLIMIT_AS + separat subprocess). För skarpt läge, använd separat microservice‑container.

### Separat Runner‑container (rekommenderad)

Vi levererar en fristående `runner`‑tjänst i `docker-compose.yml`:

- Image byggs från `./runner` (FastAPI + uvicorn)
- Exponeras internt som `http://runner:7000`
- Backend autodetekterar `RUNNER_BASE_URL` och proxar alla körningar till runnern; faller tillbaka till lokal subprocess om runnern inte nås.

Miljövariabel i backend:

- För att använda extra Python-paket (t.ex. numpy/pandas) i dina snuttar, baka in dem i runner-bilden:
	- Lägg till paket i `runner/requirements.txt` och bygg om `runner`, eller
	- Bygg med: `docker compose build --build-arg EXTRA_PIP="numpy pandas" runner`
- `RUNNER_BASE_URL=http://runner:7000`

Hårdningsval i compose för `runner`:

- `read_only: true`, `tmpfs: /tmp`, `security_opt: no-new-privileges`, `cap_drop: ALL`, `pids_limit`

API på runnern:

- `POST /run-python { code, timeout?, mem_limit_mb? } -> { ok, timeout, exit_code, stdout, stderr, duration_ms }`
