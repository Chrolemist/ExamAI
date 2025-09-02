from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional
import os

try:
    import faiss  # type: ignore
except Exception:  # pragma: no cover
    faiss = None  # type: ignore


@dataclass
class AnnItem:
    id: str
    vector: List[float]
    meta: Optional[dict] = None


class FaissIndex:
    def __init__(self, dim: int, kind: str = "flat_ip"):
        if faiss is None:
            raise RuntimeError("faiss is not installed. pip install faiss-cpu")
        self.dim = dim
        self.kind = kind
        if kind == "flat_ip":
            self.index = faiss.IndexFlatIP(dim)
        elif kind == "hnsw":
            self.index = faiss.IndexHNSWFlat(dim, 32)
            self.index.hnsw.efConstruction = 200
            self.index.hnsw.efSearch = 96
        else:
            raise ValueError("Unknown FAISS kind")
        self._ids: List[str] = []
        self._meta: List[Optional[dict]] = []

    @staticmethod
    def _l2_normalize(vecs):
        import numpy as np

        v = vecs.astype("float32")
        norms = (v ** 2).sum(axis=1) ** 0.5
        norms[norms == 0] = 1.0
        v /= norms[:, None]
        return v

    def add(self, items: List[AnnItem]):
        import numpy as np

        if not items:
            return
        mat = np.array([x.vector for x in items], dtype="float32")
        mat = self._l2_normalize(mat)
        self.index.add(mat)
        self._ids.extend([x.id for x in items])
        self._meta.extend([x.meta for x in items])

    def search(self, vector: List[float], top_k: int = 10) -> List[Tuple[str, float, Optional[dict]]]:
        import numpy as np

        q = np.array([vector], dtype="float32")
        q = self._l2_normalize(q)
        D, I = self.index.search(q, top_k)
        out: List[Tuple[str, float, Optional[dict]]] = []
        for i, d in zip(I[0], D[0]):
            if i < 0 or i >= len(self._ids):
                continue
            out.append((self._ids[i], float(d), self._meta[i]))
        return out

    def save(self, path: str, meta_path: Optional[str] = None):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        faiss.write_index(self.index, path)
        if meta_path:
            import json

            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({"ids": self._ids, "meta": self._meta, "dim": self.dim, "kind": self.kind}, f)

    def load(self, path: str, meta_path: Optional[str] = None):
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        self.index = faiss.read_index(path)
        if meta_path and os.path.exists(meta_path):
            import json

            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._ids = list(data.get("ids", []))
            self._meta = list(data.get("meta", []))
            self.dim = int(data.get("dim", self.dim))
            self.kind = str(data.get("kind", self.kind))


def mmr_select(
    items: List[Tuple[str, float, Optional[dict], List[float]]],  # (id, score, meta, vector)
    top_k: int = 10,
    lambda_param: float = 0.7,
) -> List[Tuple[str, float, Optional[dict]]]:
    """Maximal Marginal Relevance selection from scored items with vectors."""
    import numpy as np

    if not items:
        return []
    ids = [i[0] for i in items]
    scores = np.array([i[1] for i in items], dtype="float32")
    vecs = np.array([i[3] for i in items], dtype="float32")
    # normalize for cosine
    norms = (vecs ** 2).sum(axis=1) ** 0.5
    norms[norms == 0] = 1.0
    vecs = vecs / norms[:, None]
    selected: List[int] = []
    candidates = set(range(len(items)))
    while candidates and len(selected) < top_k:
        if not selected:
            # pick best score first
            i = int(scores.argmax())
            selected.append(i)
            candidates.remove(i)
            continue
        # compute max similarity to selected for each candidate
        sel_vecs = vecs[selected]
        # cosine similarity
        sims = vecs[list(candidates)].dot(sel_vecs.T).max(axis=1)
        # mmr objective
        cand_idxs = list(candidates)
        mmr_scores = lambda_param * scores[cand_idxs] - (1 - lambda_param) * sims
        j = int(mmr_scores.argmax())
        pick = cand_idxs[j]
        selected.append(pick)
        candidates.remove(pick)
    return [(items[i][0], float(items[i][1]), items[i][2]) for i in selected]
