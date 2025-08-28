from __future__ import annotations
import os
from typing import List, Tuple, Dict, Any
import re
from flask import Blueprint, jsonify, request

from services.openai_service import get_client
from services.tokenizer import chunk_text
from services.embeddings import embed_texts
from services.vector_store import VectorDoc
from services.vector_registry import get_store


rag_bp = Blueprint("rag", __name__)

PAGE_RX = re.compile(r"\[Sida\s+(\d+)\]", re.IGNORECASE)


def split_pages(text: str) -> List[Tuple[int, str]]:
    if not text:
        return []
    parts = PAGE_RX.split(text)
    pages: List[Tuple[int, str]] = []
    for i in range(1, len(parts), 2):
        try:
            page_no = int(parts[i])
        except Exception:
            continue
        page_text = parts[i + 1] if i + 1 < len(parts) else ""
        if page_text and page_text.strip():
            pages.append((page_no, page_text.strip()))
    if not pages:
        pages = [(1, text.strip())]
    return pages


@rag_bp.post("/rag/ingest")
def rag_ingest():
    data = request.get_json(force=True, silent=True) or {}
    collection = (data.get("collection") or "default").strip()
    text = (data.get("text") or "").strip()
    bilaga = (data.get("bilaga") or data.get("name") or "Bilaga").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    chunk_tokens = int(data.get("chunkTokens", 800))
    overlap = int(data.get("overlapTokens", 100))
    emb_model = (data.get("embeddingModel") or "text-embedding-3-large").strip()

    # Split into PDF pages using markers, then chunk per page
    pages = split_pages(text)
    chunk_texts: List[str] = []
    metas: List[Dict[str, Any]] = []
    for page_no, body in pages:
        chunks = chunk_text(body, max_tokens=chunk_tokens, overlap=overlap, model="cl100k_base")
        for ch in chunks:
            chunk_texts.append(ch)
            metas.append({"bilaga": bilaga, "sida": page_no})

    if not chunk_texts:
        return jsonify({"chunks": 0, "collection": collection})
    vecs = embed_texts(chunk_texts, model=emb_model)
    if not vecs:
        return jsonify({"error": "embedding failed"}), 500
    dim = len(vecs[0])
    store = get_store(collection, dim)
    docs: List[VectorDoc] = []
    for i, (c, v, meta) in enumerate(zip(chunk_texts, vecs, metas)):
        doc_id = f"{collection}:{meta.get('bilaga')}:{meta.get('sida')}:{i}"
        docs.append(VectorDoc(id=doc_id, text=c, embedding=v, meta=meta))
    store.upsert(docs)
    return jsonify({"chunks": len(docs), "collection": collection})


@rag_bp.post("/rag/query")
def rag_query():
    data = request.get_json(force=True, silent=True) or {}
    collection = (data.get("collection") or "default").strip()
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    top_k = int(data.get("topK", 5))
    model = (data.get("model") or os.getenv("OPENAI_MODEL") or "gpt-5-mini").strip()
    emb_model = (data.get("embeddingModel") or "text-embedding-3-large").strip()
    return_json = bool(data.get("returnJSON"))
    append_sources = bool(data.get("appendSources", True))
    enforce_inline = bool(data.get("enforceInlineCitations", False))

    # Embed query and search in collection
    qv = embed_texts([query], model=emb_model)[0]
    store = get_store(collection, len(qv))
    results = store.query(qv, top_k=top_k)
    if not results:
        return jsonify({"reply": "Inga källor hittades för denna samling.", "sources": []})

    # Build context with citations
    context_lines: List[str] = []
    sources_out: List[Dict[str, Any]] = []
    for d, score in results:
        bil = (d.meta or {}).get("bilaga", "Bilaga")
        sida = (d.meta or {}).get("sida", "?")
        preview = (d.text or "").strip().replace("\n", " ")
        context_lines.append(f"(Bilaga {bil}, Sida {sida}) \"{preview}\"")
        sources_out.append({"bilaga": bil, "sida": sida, "score": round(float(score), 4)})

    system = (
        "Svara endast utifrån Given Context. Lägg till källhänvisningar i formatet "
        "[Bilaga, Sida] direkt efter varje påstående som stöds av kontexten. Svara kortfattat på svenska."
    )
    if return_json:
        system += (
            " Returnera JSON enligt: {\"answer\":\"...\",\"sources\":[{\"bilaga\":\"A\",\"sida\":15}]}."
            " Lägg inte till extra text utanför JSON."
        )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": "Given Context:\n- " + "\n- ".join(context_lines)},
        {"role": "user", "content": query},
    ]

    client = get_client()
    max_comp = int(data.get("max_tokens", data.get("max_completion_tokens", 600)))
    resp = client.chat.completions.create(model=model, messages=messages, max_completion_tokens=max_comp)
    reply = resp.choices[0].message.content if resp.choices else ""
    # Optionally enforce inline citations if model omitted them
    if enforce_inline and not return_json and sources_out and reply:
        try:
            import re as _re
            if not _re.search(r"\[\s*Bilaga\b.*?Sida\b.*?\]", reply, flags=_re.IGNORECASE):
                top = sources_out[0]
                tag = f" [Bilaga {top['bilaga']}, Sida {top['sida']}]"
                # Try to add after each sentence
                parts = _re.split(r"(?<=[.!?])\s+", reply)
                parts = [p + tag if p.strip() else p for p in parts]
                reply = " ".join(parts)
        except Exception:
            pass
    # Optionally append a human-readable sources block if not using JSON mode
    if append_sources and not return_json and sources_out:
        lines = [f"- [Bilaga {s['bilaga']}, Sida {s['sida']}]" for s in sources_out]
        reply = (reply or "").rstrip() + "\n\nKällor:\n" + "\n".join(lines)
    return jsonify({"reply": reply, "model": model, "sources": sources_out})
