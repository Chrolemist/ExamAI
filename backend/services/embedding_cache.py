from __future__ import annotations
from typing import Iterable, List, Sequence, Tuple
import sqlite3
import os
import threading


class EmbeddingCache:
    def __init__(self, path: str = ".embeddings_cache.sqlite3"):
        self.path = path
        self._lock = threading.Lock()
        self._ensure()

    def _ensure(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL)"
            )
            db.execute("PRAGMA journal_mode=WAL;")

    def get_many(self, keys: Sequence[str]) -> List[Tuple[str, List[float]]]:
        if not keys:
            return []
        q = "SELECT key, dim, vec FROM cache WHERE key IN (%s)" % ",".join("?" * len(keys))
        with self._lock, sqlite3.connect(self.path) as db:
            rows = db.execute(q, list(keys)).fetchall()
        out: List[Tuple[str, List[float]]] = []
        for k, dim, blob in rows:
            # Store vectors as space-separated floats in blob for simplicity
            vec = [float(x) for x in blob.decode("utf-8").split(" ") if x]
            out.append((k, vec))
        return out

    def put_many(self, items: Sequence[Tuple[str, List[float]]], dim: int):
        if not items:
            return
        with self._lock, sqlite3.connect(self.path) as db:
            db.executemany(
                "INSERT OR REPLACE INTO cache (key, dim, vec) VALUES (?, ?, ?)",
                [(k, dim, (" ".join(str(x) for x in vec)).encode("utf-8")) for (k, vec) in items],
            )
