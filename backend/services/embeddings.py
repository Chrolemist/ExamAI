from typing import List, Sequence
from .openai_service import get_client


def embed_texts(texts: Sequence[str], model: str = "text-embedding-3-large") -> List[List[float]]:
    client = get_client()
    # OpenAI python SDK v1
    resp = client.embeddings.create(model=model, input=list(texts))
    # Map back to vectors
    vectors = [d.embedding for d in resp.data]
    return vectors
