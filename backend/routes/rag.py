from __future__ import annotations
import os
import uuid
from typing import List
from flask import Blueprint, jsonify, request

from services.openai_service import get_client
from services.tokenizer import chunk_text
from services.embeddings import embed_texts
from services.vector_store import InMemoryVectorStore, VectorDoc


rag_bp = Blueprint("rag", __name__)

# Global demo store (in-memory). Swap for Pinecone/Weaviate in prod.
_store = None  # type: ignore
_dim = None  # type: ignore


def _ensure_store(dim: int):
    global _store, _dim
    if _store is None or _dim != dim:
        _store = InMemoryVectorStore(dim=dim)
        _dim = dim
    return _store


@rag_bp.post("/rag/ingest")
def rag_ingest():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    chunk_tokens = int(data.get("chunkTokens", 800))
    overlap = int(data.get("overlapTokens", 100))
    emb_model = (data.get("embeddingModel") or "text-embedding-3-large").strip()

    chunks = chunk_text(text, max_tokens=chunk_tokens, overlap=overlap)
    if not chunks:
        return jsonify({"chunks": 0})
    vecs = embed_texts(chunks, model=emb_model)
    if not vecs:
        return jsonify({"error": "embedding failed"}), 500
    store = _ensure_store(len(vecs[0]))
    docs: List[VectorDoc] = []
    for i, (c, v) in enumerate(zip(chunks, vecs)):
        doc_id = f"c_{uuid.uuid4().hex}"
        docs.append(VectorDoc(id=doc_id, text=c, embedding=v, meta={"i": i}))
    store.upsert(docs)
    return jsonify({"chunks": len(docs)})


@rag_bp.post("/rag/query")
def rag_query():
    data = request.get_json(force=True, silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    top_k = int(data.get("topK", 5))
    model = (data.get("model") or os.getenv("OPENAI_MODEL") or "gpt-5-mini").strip()
    emb_model = (data.get("embeddingModel") or "text-embedding-3-large").strip()

    store = _store
    if store is None:
        return jsonify({"error": "no data ingested yet"}), 400

    # Embed query and search
    qv = embed_texts([query], model=emb_model)[0]
    results = store.query(qv, top_k=top_k)
    contexts = [d.text for (d, _s) in results]
    context_block = "\n\n---\n\n".join(contexts)

    # Call chat with retrieved context
    client = get_client()
    system = (
        "Du är en faktakällig AI-assistent. Svara endast med stöd från kontexten (KONTEKST) nedan."
        " Om svaret saknas, säg kort att du inte hittar det i materialet."
    )
    messages = [
        {"role": "system", "content": system + "\n\nKONTEKST:\n" + context_block},
        {"role": "user", "content": query},
    ]
    resp = client.chat.completions.create(model=model, messages=messages, max_tokens=int(data.get("max_tokens", 600)))
    reply = resp.choices[0].message.content if resp.choices else ""
    return jsonify({
        "reply": reply,
        "sources": [{"i": d.meta.get("i") if d.meta else None, "preview": d.text[:200]} for (d, _s) in results],
    })
