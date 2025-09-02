from __future__ import annotations
from typing import List, Sequence, Tuple, Callable, Optional, Dict, Any
import asyncio
import random
import time
import logging
from .openai_service import get_client
from .embedding_cache import EmbeddingCache
from .tokenizer import count_tokens


DEFAULT_MODEL = "text-embedding-3-large"


def _embed_sync(texts: Sequence[str], model: str) -> List[List[float]]:
    """Blocking call to the OpenAI Embeddings API.
    Separated to allow running in a thread and keep event loop responsive.
    """
    client = get_client()
    resp = client.embeddings.create(model=model, input=list(texts))
    return [d.embedding for d in resp.data]


async def _embed_async(texts: Sequence[str], model: str) -> List[List[float]]:
    # Run the blocking SDK call in a worker thread to avoid blocking the event loop
    return await asyncio.to_thread(_embed_sync, texts, model)


async def embed_batched_async(
    texts: Sequence[str],
    model: str = DEFAULT_MODEL,
    batch_size: int = 256,
    max_concurrency: int = 6,
    cache: EmbeddingCache | None = None,
    max_retries: int = 6,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    max_tokens_per_batch: Optional[int] = None,
) -> Tuple[List[List[float]], int]:
    """Embed texts efficiently with batching, concurrency, caching and retries.

    Parameters:
    - texts: input strings
    - model: embedding model name
    - batch_size: max number of items per batch (upper bound even when token-batching)
    - max_concurrency: simultaneous batches to process
    - cache: optional EmbeddingCache instance
    - max_retries: per-batch retry attempts for transient errors
    - on_progress: optional callback receiving a dict with metrics, e.g.
        {stage, total, done, cache_hits, scheduled, batch_idx, batch_size, batch_tokens, retries_total, elapsed_sec}
    - max_tokens_per_batch: if set, build batches by token budget using first-fit decreasing (FFD)
    Returns: (vectors, dim)
    """
    t0 = time.perf_counter()
    logger = logging.getLogger(__name__)
    # Cache lookup
    keys = [hash_key(model, t) for t in texts]
    cached: dict[str, List[float]] = {}
    if cache:
        for k, vec in cache.get_many(keys):
            cached[k] = vec
    to_embed: List[Tuple[int, str]] = [(i, t) for i, (k, t) in enumerate(zip(keys, texts)) if k not in cached]
    out: List[List[float]] = [None] * len(texts)  # type: ignore
    # Fill cached
    for i, t in enumerate(texts):
        k = keys[i]
        if k in cached:
            out[i] = cached[k]
    # Early return if all cached
    if not to_embed:
        # Report progress if callback provided
        if on_progress:
            try:
                on_progress({
                    "stage": "done",
                    "total": len(texts),
                    "done": len(texts),
                    "cache_hits": len(texts),
                    "scheduled": 0,
                    "retries_total": 0,
                    "elapsed_sec": time.perf_counter() - t0,
                })
            except Exception:
                pass
        return out, (len(out[0]) if out and out[0] else 0)

    # Guardrails
    batch_size = max(1, int(batch_size or 1))
    max_concurrency = max(1, int(max_concurrency or 1))

    sem = asyncio.Semaphore(max_concurrency)
    retries_total = 0

    # Build batches: either fixed-size by count, or length-aware by token budget
    batches: List[List[Tuple[int, str]]] = []
    batch_tokens: List[int] = []
    if max_tokens_per_batch and max_tokens_per_batch > 0:
        # compute token counts for non-cached texts
        items = []  # (idx, text, tok)
        for i, t in to_embed:
            try:
                tok = max(1, count_tokens(t))
            except Exception:
                tok = max(1, len(t.split()))
            items.append((i, t, tok))
        # First-Fit Decreasing packing
        items.sort(key=lambda x: x[2], reverse=True)
        for i, t, tok in items:
            placed = False
            for b_idx in range(len(batches)):
                if batch_tokens[b_idx] + tok <= max_tokens_per_batch and len(batches[b_idx]) < batch_size:
                    batches[b_idx].append((i, t))
                    batch_tokens[b_idx] += tok
                    placed = True
                    break
            if not placed:
                batches.append([(i, t)])
                batch_tokens.append(tok)
        # Enforce batch_size cap by splitting oversized batches if any
        fixed_batches: List[List[Tuple[int, str]]] = []
        for b in batches:
            for j in range(0, len(b), batch_size):
                fixed_batches.append(b[j:j + batch_size])
        batches = fixed_batches
    else:
        # Simple slicing by count
        for i in range(0, len(to_embed), batch_size):
            batches.append(to_embed[i:i + batch_size])

    if on_progress:
        try:
            on_progress({
                "stage": "scheduled",
                "total": len(texts),
                "done": len(texts) - len(to_embed),
                "cache_hits": len(texts) - len(to_embed),
                "scheduled": sum(len(b) for b in batches),
                "batches": len(batches),
            })
        except Exception:
            pass

    async def worker(batch_idx: int, chunk: List[Tuple[int, str]]):
        # Backoff loop inside each batch
        delay = 1.0
        attempts = 0
        while True:
            try:
                payload = [t for _, t in chunk]
                vecs = await _embed_async(payload, model)
                # Defensive: ensure we got same count as payload
                if not isinstance(vecs, list) or len(vecs) != len(payload):
                    raise RuntimeError(f"Embedding API returned {len(vecs) if isinstance(vecs, list) else 'invalid'} results for {len(payload)} inputs")
                for (i, _), v in zip(chunk, vecs):
                    out[i] = v
                # Persist to cache
                if cache and vecs:
                    dim = len(vecs[0])
                    cache.put_many([(keys[i], v) for (i, _), v in zip(chunk, vecs)], dim)
                # progress
                if on_progress:
                    try:
                        on_progress({
                            "stage": "batch_done",
                            "batch_idx": batch_idx,
                            "batch_size": len(chunk),
                            "total": len(texts),
                            "done": sum(1 for v in out if v is not None),
                            "cache_hits": len(texts) - len(to_embed),
                            "retries_total": retries_total,
                        })
                    except Exception:
                        pass
                return
            except Exception as e:  # backoff on likely transient errors
                attempts += 1
                msg = str(e).lower()
                transient = any(code in msg for code in [
                    "429", "rate", "temporarily", "timeout", "5xx", "internal", "overloaded", "connection", "reset", "unavailable"
                ])
                if transient and attempts <= max_retries:
                    jitter = random.uniform(0, max(0.1, delay * 0.2))
                    await asyncio.sleep(delay + jitter)
                    delay = min(30.0, delay * 2.0)
                    retries_total += 1
                    continue
                raise

    tasks = []
    # Schedule batches
    for b_idx, batch in enumerate(batches):
        await sem.acquire()
        tasks.append(asyncio.create_task(worker(b_idx, batch)))
        tasks[-1].add_done_callback(lambda _t: sem.release())
    if tasks:
        await asyncio.gather(*tasks)
    # Infer dim from any vector
    dim = 0
    for v in out:
        if v is not None:
            dim = len(v)
            break
    # Fill any None (shouldn't happen) with zero vectors
    if dim:
        for i, v in enumerate(out):
            if v is None:
                out[i] = [0.0] * dim
    # Final metrics
    elapsed = time.perf_counter() - t0
    if on_progress:
        try:
            on_progress({
                "stage": "done",
                "total": len(texts),
                "done": len(texts),
                "cache_hits": len(texts) - len(to_embed),
                "scheduled": sum(len(b) for b in batches),
                "retries_total": retries_total,
                "elapsed_sec": elapsed,
            })
        except Exception:
            pass
    # Debug log (opt-in via logging config)
    try:
        logger.debug(
            "embeddings: total=%d cache_hits=%d batches=%d retries=%d elapsed=%.2fs",
            len(texts), len(texts) - len(to_embed), len(batches), retries_total, elapsed,
        )
    except Exception:
        pass
    return out, dim


def hash_key(model: str, text: str) -> str:
    from hashlib import sha256

    h = sha256()
    h.update((model + "\n" + text).encode("utf-8", errors="ignore"))
    return h.hexdigest()


def embed_texts(
    texts: Sequence[str],
    model: str = DEFAULT_MODEL,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    max_tokens_per_batch: Optional[int] = None,
) -> List[List[float]]:
    """Synchronous convenience wrapper that works both inside and outside running event loops.
    Uses on-disk cache by default.
    Optional on_progress callback receives dicts with {stage, done, total, ...}.
    """
    cache = EmbeddingCache()
    try:
        return asyncio.run(
            embed_batched_async(
                texts,
                model=model,
                cache=cache,
                on_progress=on_progress,
                max_tokens_per_batch=max_tokens_per_batch,
            )
        )[0]
    except RuntimeError:
        # Likely called from a running event loop (e.g., Jupyter). Run in a fresh loop on a thread.
        import threading
        import queue as _queue

        q: _queue.Queue = _queue.Queue(maxsize=1)

        def _runner():
            try:
                res = asyncio.run(
                    embed_batched_async(
                        texts,
                        model=model,
                        cache=cache,
                        on_progress=on_progress,
                        max_tokens_per_batch=max_tokens_per_batch,
                    )
                )
                q.put((True, res))
            except Exception as e:  # pragma: no cover
                q.put((False, e))

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        ok, payload = q.get()
        if ok:
            return payload[0]
        raise payload
