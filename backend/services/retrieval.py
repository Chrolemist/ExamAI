from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional

from .embeddings import embed_texts
from .ann_faiss import FaissIndex, AnnItem, mmr_select


@dataclass
class Retrieved:
    id: str
    score: float
    text: str
    meta: Optional[dict]


def build_faiss(dim: int, kind: str = "hnsw") -> FaissIndex:
    return FaissIndex(dim=dim, kind=kind)


def index_corpus(index: FaissIndex, ids: List[str], texts: List[str], metas: List[Optional[dict]], model: str) -> int:
    vecs = embed_texts(texts, model=model)
    if not vecs:
        return 0
    dim = len(vecs[0])
    index.add([AnnItem(id=i, vector=v, meta=m) for i, v, m in zip(ids, vecs, metas)])
    return dim


def ann_query(index: FaissIndex, query: str, raw_top_k: int = 100, model: str = "text-embedding-3-large") -> List[Tuple[str, float]]:
    qv = embed_texts([query], model=model)[0]
    hits = index.search(qv, top_k=raw_top_k)
    return [(hid, score) for hid, score, _ in hits]


def ann_query_mmr(
    index: FaissIndex,
    query: str,
    corpus_lookup: dict[str, Tuple[str, Optional[dict], List[float]]],
    model: str = "text-embedding-3-large",
    raw_top_k: int = 100,
    final_k: int = 10,
    lambda_param: float = 0.7,
) -> List[Retrieved]:
    qv = embed_texts([query], model=model)[0]
    # get raw hits
    import numpy as np

    hits = index.search(qv, top_k=raw_top_k)
    items = []
    for hid, score, _ in hits:
        text, meta, vec = corpus_lookup.get(hid, ("", None, []))
        if not text or not vec:
            continue
        items.append((hid, float(score), meta, vec))
    # mmr select
    sel = mmr_select(items, top_k=final_k, lambda_param=lambda_param)
    return [Retrieved(id=i, score=s, text=corpus_lookup[i][0], meta=corpus_lookup[i][1]) for i, s, _ in sel]
