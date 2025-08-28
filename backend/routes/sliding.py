from flask import Blueprint, jsonify, request
from services.openai_service import get_client
from services.tokenizer import chunk_text


sliding_bp = Blueprint("sliding", __name__)


@sliding_bp.post("/sliding/window")
def sliding_window():
    data = request.get_json(force=True, silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    window_tokens = int(data.get("windowTokens", 8000))
    overlap = int(data.get("overlapTokens", 400))
    ask = (data.get("ask") or "").strip()
    model = (data.get("model") or "gpt-5-mini").strip()

    windows = chunk_text(text, max_tokens=window_tokens, overlap=overlap)
    if not ask:
        # Just return the windows for client-side iteration
        return jsonify({"windows": len(windows)})

    client = get_client()
    answers = []
    for w in windows:
        msgs = [
            {"role": "system", "content": "Besvara frågan endast utifrån detta fönster av texten."},
            {"role": "user", "content": f"TEXT:\n{w}\n\nFRÅGA:\n{ask}"},
        ]
    r = client.chat.completions.create(model=model, messages=msgs, max_completion_tokens=400)
    a = r.choices[0].message.content if r.choices else ""
    answers.append(a or "")
    # Optional: final merge
    msgs2 = [
        {"role": "system", "content": "Sammanfatta konsistent vad som framgår av del-svaren utan motsägelser."},
        {"role": "user", "content": "\n\n---\n\n".join(answers)},
    ]
    r2 = client.chat.completions.create(model=model, messages=msgs2, max_completion_tokens=600)
    final = r2.choices[0].message.content if r2.choices else ""
    return jsonify({"answer": final, "steps": len(windows)})
