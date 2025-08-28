from flask import Blueprint, jsonify, request
from services.openai_service import get_client
from services.tokenizer import chunk_text


summarize_bp = Blueprint("summarize", __name__)


@summarize_bp.post("/summarize/hierarchical")
def hierarchical():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    chunk_tokens = int(data.get("chunkTokens", 1200))
    overlap = int(data.get("overlapTokens", 150))
    model = (data.get("model") or "gpt-5-mini").strip()
    layer_prompt = (data.get("layerPrompt") or "Summera nyckelidéer och fakta kort och precist. Inga lösa spekulationer.").strip()

    chunks = chunk_text(text, max_tokens=chunk_tokens, overlap=overlap)
    client = get_client()

    # First-level summaries
    first_summaries = []
    for i, ch in enumerate(chunks):
        msgs = [
            {"role": "system", "content": layer_prompt},
            {"role": "user", "content": ch},
        ]
        r = client.chat.completions.create(model=model, messages=msgs, max_tokens=300)
        s = r.choices[0].message.content if r.choices else ""
        first_summaries.append(s or "")

    # Second-level summary
    joined = "\n\n---\n\n".join(first_summaries)
    msgs2 = [
        {"role": "system", "content": "Kondensera följande delsummeringar till en executive summary."},
        {"role": "user", "content": joined},
    ]
    r2 = client.chat.completions.create(model=model, messages=msgs2, max_tokens=int(data.get("max_tokens", 800)))
    final = r2.choices[0].message.content if r2.choices else ""
    return jsonify({"summary": final, "parts": len(chunks)})
