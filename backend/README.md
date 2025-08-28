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
	- rag.py: RAG ingest/query (chunk + embed + vector search)
	- summarize.py: hierarchical summarization
	- sliding.py: sliding window reading/QA
- services/
	- openai_service.py: OpenAI client factory
	- tokenizer.py: token counting and chunking
	- embeddings.py: embedding helper
	- vector_store.py: in-memory vector DB (swap with Pinecone/Weaviate/Qdrant in prod)

New endpoints:
- POST /rag/ingest { text, chunkTokens?, overlapTokens?, embeddingModel? }
- POST /rag/query { query, topK?, model?, embeddingModel?, max_tokens? }
- POST /summarize/hierarchical { text, chunkTokens?, overlapTokens?, model?, layerPrompt?, max_tokens? }
- POST /sliding/window { text, windowTokens?, overlapTokens?, ask?, model? }
