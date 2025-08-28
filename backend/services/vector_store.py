from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional
import math


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class VectorDoc:
    id: str
    text: str
    embedding: List[float]
    meta: Optional[dict] = None


class InMemoryVectorStore:
    def __init__(self, dim: int):
        self.dim = dim
        self._docs: List[VectorDoc] = []

    def upsert(self, docs: List[VectorDoc]):
        existing = {d.id: i for i, d in enumerate(self._docs)}
        for d in docs:
            if len(d.embedding) != self.dim:
                raise ValueError("Embedding dimension mismatch")
            idx = existing.get(d.id)
            if idx is None:
                self._docs.append(d)
            else:
                self._docs[idx] = d

    def query(self, embedding: List[float], top_k: int = 5) -> List[Tuple[VectorDoc, float]]:
        scores = [(_cosine(embedding, d.embedding), d) for d in self._docs]
        scores.sort(key=lambda t: t[0], reverse=True)
        return [(d, s) for s, d in scores[: max(1, top_k)]]

    def clear(self):
        self._docs.clear()
