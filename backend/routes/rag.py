from __future__ import annotations
import os
from typing import List, Tuple, Dict, Any
import re
from flask import Blueprint, jsonify, request, Response
from flask import stream_with_context
import json
import threading
import queue
import time

from services.openai_service import get_client
from services.tokenizer import chunk_text
from services.embeddings import embed_texts
import logging
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
    try:
        max_tokens_per_batch = int(data.get("maxTokensPerBatch")) if data.get("maxTokensPerBatch") is not None else None
    except Exception:
        max_tokens_per_batch = None

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
    # Optional lightweight progress logging
    logger = logging.getLogger(__name__)
    def _progress(ev):
        try:
            if isinstance(ev, dict) and ev.get("stage") in {"scheduled", "batch_done", "done"}:
                logger.debug("rag.ingest progress: %s", ev)
        except Exception:
            pass

    vecs = embed_texts(
        chunk_texts,
        model=emb_model,
        on_progress=_progress,
        max_tokens_per_batch=max_tokens_per_batch,
    )
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


@rag_bp.post("/rag/ingest_stream")
def rag_ingest_stream():
    """Streamad ingest som skickar NDJSON-progress medan embeddings körs.
    Events: {type:"started"|"scheduled"|"progress"|"indexed"|"done"|"error", ...}
    """
    data = request.get_json(force=True, silent=True) or {}
    collection = (data.get("collection") or "default").strip()
    text = (data.get("text") or "").strip()
    bilaga = (data.get("bilaga") or data.get("name") or "Bilaga").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    chunk_tokens = int(data.get("chunkTokens", 800))
    overlap = int(data.get("overlapTokens", 100))
    emb_model = (data.get("embeddingModel") or "text-embedding-3-large").strip()
    try:
        max_tokens_per_batch = int(data.get("maxTokensPerBatch")) if data.get("maxTokensPerBatch") is not None else None
    except Exception:
        max_tokens_per_batch = None

    # Build chunks upfront (non-streaming)
    pages = split_pages(text)
    chunk_texts: List[str] = []
    metas: List[Dict[str, Any]] = []
    for page_no, body in pages:
        chunks = chunk_text(body, max_tokens=chunk_tokens, overlap=overlap, model="cl100k_base")
        for ch in chunks:
            chunk_texts.append(ch)
            metas.append({"bilaga": bilaga, "sida": page_no})

    def gen():
        def send(ev):
            try:
                return json.dumps(ev, ensure_ascii=False) + "\n"
            except Exception:
                return json.dumps({"type": "error", "error": "encoding"}) + "\n"

        # Early events
        yield send({"type": "started", "collection": collection, "chunksPlanned": len(chunk_texts)})

        if not chunk_texts:
            yield send({"type": "done", "collection": collection, "chunks": 0})
            return

        q: "queue.Queue[dict]" = queue.Queue()
        result_holder: dict = {}
        err_holder: dict = {}

        def _progress(ev):
            try:
                ev = dict(ev) if isinstance(ev, dict) else {"raw": str(ev)}
                ev["type"] = "progress"
                q.put(ev)
            except Exception:
                pass

        def _worker():
            try:
                from services.embeddings import embed_texts as _embed_texts
                vecs = _embed_texts(
                    chunk_texts,
                    model=emb_model,
                    on_progress=_progress,
                    max_tokens_per_batch=max_tokens_per_batch,
                )
                result_holder["vecs"] = vecs
            except Exception as e:  # pragma: no cover
                err_holder["error"] = str(e)
            finally:
                # Signal end
                q.put({"type": "progress", "stage": "embedding_finished"})

        # Announce schedule
        yield send({
            "type": "scheduled",
            "collection": collection,
            "chunks": len(chunk_texts),
        })

        t = threading.Thread(target=_worker, daemon=True)
        t.start()

        # Drain queue while embedding runs
        last_emit = time.time()
        while t.is_alive() or not q.empty():
            try:
                ev = q.get(timeout=0.5)
                yield send(ev)
                last_emit = time.time()
            except queue.Empty:
                # keep connection alive on idle
                if time.time() - last_emit > 5:
                    yield send({"type": "progress", "stage": "heartbeat"})
                    last_emit = time.time()

        if err_holder.get("error"):
            yield send({"type": "error", "error": err_holder["error"]})
            return

        vecs = result_holder.get("vecs") or []
        if not vecs:
            yield send({"type": "error", "error": "embedding failed or empty"})
            return

        # Upsert into vector store
        dim = len(vecs[0])
        store = get_store(collection, dim)
        docs: List[VectorDoc] = []
        for i, (c, v, meta) in enumerate(zip(chunk_texts, vecs, metas)):
            doc_id = f"{collection}:{meta.get('bilaga')}:{meta.get('sida')}:{i}"
            docs.append(VectorDoc(id=doc_id, text=c, embedding=v, meta=meta))
        store.upsert(docs)
        yield send({"type": "indexed", "collection": collection, "chunks": len(docs)})
        yield send({"type": "done", "collection": collection, "chunks": len(docs)})

    return Response(stream_with_context(gen()), mimetype="application/x-ndjson")


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
