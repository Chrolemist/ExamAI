from typing import List

try:
    import tiktoken  # type: ignore
except Exception:
    tiktoken = None  # type: ignore


def count_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    if not text:
        return 0
    if tiktoken is not None:
        try:
            enc = tiktoken.encoding_for_model(model)
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    # naive fallback
    return max(1, len(text.split()))


def chunk_text(text: str, max_tokens: int = 800, overlap: int = 100, model: str = "gpt-4o-mini") -> List[str]:
    if not text:
        return []
    if max_tokens <= 0:
        return [text]
    if tiktoken is not None:
        try:
            enc = tiktoken.encoding_for_model(model)
        except Exception:
            enc = tiktoken.get_encoding("cl100k_base")
        tokens = enc.encode(text)
        chunks = []
        start = 0
        step = max(1, max_tokens - max(0, overlap))
        while start < len(tokens):
            end = min(len(tokens), start + max_tokens)
            chunks.append(enc.decode(tokens[start:end]))
            start += step
        return chunks
    # naive fallback by words
    words = text.split()
    approx_ratio = 0.75  # ~tokens/words
    max_words = max(1, int(max_tokens / approx_ratio))
    overlap_words = max(0, int(max(0, overlap) / approx_ratio))
    chunks = []
    start = 0
    step = max(1, max_words - overlap_words)
    while start < len(words):
        end = min(len(words), start + max_words)
        chunks.append(" ".join(words[start:end]))
        start += step
    return chunks
