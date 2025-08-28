from __future__ import annotations
from typing import Dict
from .vector_store import InMemoryVectorStore

_stores: Dict[str, InMemoryVectorStore] = {}
_dims: Dict[str, int] = {}


def get_store(name: str, dim: int) -> InMemoryVectorStore:
    store = _stores.get(name)
    if store is None:
        store = InMemoryVectorStore(dim=dim)
        _stores[name] = store
        _dims[name] = dim
        return store
    prev = _dims.get(name)
    if prev is not None and prev != dim:
        # Dimension changed → reset for simplicity
        store.clear()
        store.dim = dim
        _dims[name] = dim
    return store


def clear_store(name: str):
    s = _stores.get(name)
    if s:
        s.clear()