import os
import json
from flask import Blueprint, current_app, jsonify, request, Response
from flask import stream_with_context

try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None  # type: ignore


chat_bp = Blueprint("chat", __name__)


@chat_bp.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(force=True, silent=True) or {}

    # Model + API key
    model = (data.get("model") or current_app.config.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    if OpenAI is None:
        return jsonify({"error": "OpenAI SDK not installed"}), 500
    api_key = (data.get("apiKey") or os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return jsonify({"error": "Saknar API-nyckel. Ange en i panelen eller sätt OPENAI_API_KEY i .env."}), 401
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        return jsonify({"error": f"Kunde inte initiera OpenAI-klienten: {e}"}), 500

    # Messages
    system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()
    incoming_messages = data.get("messages") if isinstance(data.get("messages"), list) else None
    user_message = (data.get("prompt") or data.get("message") or "").strip()
    if incoming_messages and len(incoming_messages) > 0:
        messages = incoming_messages
        if not (isinstance(messages[0], dict) and messages[0].get("role") == "system"):
            messages = [{"role": "system", "content": system_prompt}] + messages
    else:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

    # Optional client-side clipping hint
    max_tokens = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
    # Allow callers to hint a longer timeout when needed (cap to 120s)
    try:
        req_timeout = float(data.get("timeout", 30))
    except Exception:
        req_timeout = 30
    req_timeout = max(5, min(120, req_timeout))

    # Helpers
    def _extract_text(msg_obj) -> str:
        try:
            if msg_obj is None:
                return ""
            # SDK message object or dict
            content = getattr(msg_obj, "content", None)
            if content is None and isinstance(msg_obj, dict):
                content = msg_obj.get("content")
            # If list (multimodal), join text parts
            if isinstance(content, list):
                parts = []
                for it in content:
                    try:
                        if isinstance(it, str):
                            parts.append(it)
                        elif isinstance(it, dict):
                            t = it.get("text") or it.get("content")
                            if isinstance(t, str):
                                parts.append(t)
                    except Exception:
                        continue
                return "".join(parts)
            return str(content or "")
        except Exception:
            return ""

    def _serialize_tool_calls(tc_list):
        arr = []
        try:
            for tc in (tc_list or []):
                try:
                    fn = getattr(tc, "function", None)
                    obj = {
                        "id": getattr(tc, "id", None) or (tc.get("id") if isinstance(tc, dict) else None),
                        "type": "function",
                        "function": {
                            "name": getattr(fn, "name", None) or (fn.get("name") if isinstance(fn, dict) else None),
                            "arguments": getattr(fn, "arguments", None) or (fn.get("arguments") if isinstance(fn, dict) else None),
                        },
                    }
                    arr.append(obj)
                except Exception:
                    continue
        except Exception:
            pass
        return arr

    # Optional tool schema (function calling)
    tools = data.get("tools") if isinstance(data.get("tools"), list) else None
    tool_choice = data.get("tool_choice") if isinstance(data.get("tool_choice"), (dict, str)) else None
    # If tools are requested but the chosen model is flaky for tools, switch to a stable fallback
    try:
        if tools:
            stable_tool_models = {"gpt-4o-mini", "gpt-4o", "gpt-4.1-turbo", "gpt-5", "gpt-5-mini", "gpt-5-nano", "3o"}
            if model not in stable_tool_models:
                model = (os.getenv("FALLBACK_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
    except Exception:
        pass
    def _invoke(mdl: str, msgs=None, tools_arg=None):
        payload = {"model": mdl, "messages": (msgs or messages), "max_tokens": max_tokens, "timeout": req_timeout}
        if tools_arg:
            payload["tools"] = tools_arg
        if tool_choice:
            payload["tool_choice"] = tool_choice
        return client.chat.completions.create(**payload)

    try:
        resp = _invoke(model, messages, tools)
    except Exception as e:
        # One fallback try if model invalid
        fb = os.getenv("FALLBACK_MODEL", "gpt-4o-mini")
        if fb and fb != model:
            try:
                resp = _invoke(fb, messages, tools)
                model = fb
            except Exception as e2:
                return jsonify({"error": str(e2)}), 400
        else:
            return jsonify({"error": str(e)}), 400

    # Handle a single tool call round if present
    try:
        choice = resp.choices[0] if getattr(resp, "choices", None) else None
    except Exception:
        choice = None

    # Try to get tool_calls from SDK object or dict
    tool_calls = []
    try:
        msg0 = getattr(choice, "message", None) if choice else None
        if msg0 is not None:
            if getattr(msg0, "tool_calls", None) is not None:
                tool_calls = msg0.tool_calls
            elif isinstance(msg0, dict):
                tool_calls = msg0.get("tool_calls") or []
    except Exception:
        tool_calls = []

    if tool_calls:
        tool_msgs = []
        tool_debugs = []  # Collect lightweight debug info to return to client (e.g., executed code)
        for tc in tool_calls:
            try:
                # Support both dict and SDK tool_call objects
                if isinstance(tc, dict):
                    fn = tc.get("function", {})
                    tc_id = tc.get("id")
                else:
                    fn_obj = getattr(tc, "function", None)
                    tc_id = getattr(tc, "id", None)
                    if fn_obj is None:
                        fn = {}
                    elif isinstance(fn_obj, dict):
                        fn = fn_obj
                    else:
                        fn = {"name": getattr(fn_obj, "name", None), "arguments": getattr(fn_obj, "arguments", None)}
                name = (fn.get("name") or "").strip() if isinstance(fn, dict) else ""
                args_raw = fn.get("arguments") if isinstance(fn, dict) else None
                import json as _json
                args = {}
                try:
                    if isinstance(args_raw, str):
                        args = _json.loads(args_raw)
                    elif isinstance(args_raw, dict):
                        args = args_raw
                except Exception:
                    args = {"_error": "bad_arguments"}
                if name == "run_python":
                    try:
                        from services.python_runner import PythonRunner  # type: ignore
                    except Exception:
                        try:
                            from backend.services.python_runner import PythonRunner  # type: ignore
                        except Exception:
                            from ..services.python_runner import PythonRunner  # type: ignore
                    code = str(args.get("code") or "")
                    print(f"[DEBUG] run_python code: {repr(code)}")  # Debug log
                    if not code.strip():
                        # Help the model learn to pass correct arguments on next round
                        content = (
                            "Fel: Inget 'code'-argument skickades till run_python. "
                            "Anropa verktyget med ett 'code'-fält som innehåller en kort Python-snutt som skriver ut (print) det slutliga svaret."
                        )
                    else:
                        # First attempt
                        initial_timeout = float(data.get("py_timeout", 5))
                        initial_mem = int(data.get("py_mem", 256))
                        runner = PythonRunner(timeout_sec=initial_timeout, mem_limit_mb=initial_mem)
                        result = runner.run(code)
                        # If it timed out or was killed, retry once with higher limits (bounded)
                        try:
                            timed_out = bool(result.get("timeout")) or (str(result.get("stderr") or "").find("Timed out") >= 0)
                            killed = result.get("exit_code") in (-9,)
                        except Exception:
                            timed_out = False
                            killed = False
                        if (timed_out or killed) and initial_timeout < 15:
                            boosted_timeout = max(8.0, min(20.0, initial_timeout * 2.0))
                            boosted_mem = max(512, min(1024, initial_mem * 2))
                            try:
                                runner2 = PythonRunner(timeout_sec=boosted_timeout, mem_limit_mb=boosted_mem)
                                result = runner2.run(code)
                                print(f"[DEBUG] run_python boosted re-run: timeout={boosted_timeout}, mem={boosted_mem}, result_ok={result.get('ok')}")
                            except Exception as _e:
                                print(f"[DEBUG] run_python boost failed: {_e}")
                        print(f"[DEBUG] run_python result: {result}")  # Debug log
                        # If execution succeeded and produced stdout, return just stdout to keep the conversation clean
                        stdout = (result.get("stdout") or "").strip()
                        stderr = (result.get("stderr") or "").strip()
                        # Collect debug info about the tool execution for the client UI
                        try:
                            tool_debugs.append({
                                "name": "run_python",
                                "code": code,
                                "ok": bool(result.get("ok")),
                                "exit_code": result.get("exit_code"),
                                "stdout": stdout,
                                "stderr": stderr,
                                "engine": result.get("engine"),
                                "duration_ms": result.get("duration_ms"),
                            })
                        except Exception:
                            pass
                        if result.get("ok") and stdout:
                            content = stdout
                        else:
                            # Fall back to a compact diagnostic payload
                            content = (
                                "stdout:\n" + (stdout or "") +
                                "\n\nstderr:\n" + (stderr or "") +
                                f"\n(exit={result.get('exit_code')}, ok={result.get('ok')}, t={result.get('duration_ms')}ms)"
                            )
                else:
                    content = f"Tool '{name}' not implemented."
                tool_msgs.append({"role": "tool", "tool_call_id": tc_id, "name": name or "tool", "content": content})
            except Exception as e2:
                tool_msgs.append({"role": "tool", "tool_call_id": (tc.get("id") if isinstance(tc, dict) else getattr(tc, 'id', None)), "name": "error", "content": f"Tool error: {e2}"})
        # Continue once with tool results
        assistant_msg = {
            "role": "assistant",
            "content": _extract_text(getattr(choice, "message", None) if choice else None),
            "tool_calls": _serialize_tool_calls(tool_calls),
        }
        messages2 = list(messages or []) + [assistant_msg] + tool_msgs
        try:
            resp2 = _invoke(model, messages2, tools)
        except Exception as e:
            return jsonify({"error": str(e)}), 400
        try:
            msg2 = resp2.choices[0].message if getattr(resp2, "choices", None) else None
        except Exception:
            msg2 = None
        reply = _extract_text(msg2)
        if not (reply or "").strip():
            tool_combined = ""
            try:
                tool_combined = "\n\n".join([str(m.get("content") or "") for m in tool_msgs if isinstance(m, dict)]).strip()
            except Exception:
                tool_combined = ""
            reply = tool_combined or "Körning klar (inga utdata från verktyget)."
        usage_obj = getattr(resp2, "usage", None)
    else:
        reply = _extract_text(getattr(choice, "message", None) if choice else None)
        try:
            if isinstance(reply, str):
                reply = reply.strip()
        except Exception:
            pass
        if not reply:
            reply = "Tomt svar från AI"
        usage_obj = getattr(resp, "usage", None)
    try:
        usage = ({
            "input_tokens": getattr(usage_obj, "prompt_tokens", None) or getattr(usage_obj, "input_tokens", None),
            "output_tokens": getattr(usage_obj, "completion_tokens", None) or getattr(usage_obj, "output_tokens", None),
            "total_tokens": getattr(usage_obj, "total_tokens", None),
        } if usage_obj else None)
    except Exception:
        usage = None

    # Include a single tool debug object (primary tool) if any were executed
    try:
        primary_tool_debug = (tool_debugs[0] if (tool_calls and isinstance(tool_debugs, list) and tool_debugs) else None)
    except Exception:
        primary_tool_debug = None

    return jsonify({"reply": reply, "model": model, "usage": usage, "tool_debug": primary_tool_debug})


@chat_bp.route("/chat/stream", methods=["POST", "OPTIONS"])
def chat_stream():
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(force=True, silent=True) or {}

    # Model + API key
    model = (data.get("model") or current_app.config.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    if OpenAI is None:
        return jsonify({"error": "OpenAI SDK not installed"}), 500
    api_key = (data.get("apiKey") or os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return jsonify({"error": "Saknar API-nyckel. Ange en i panelen eller sätt OPENAI_API_KEY i .env."}), 401
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        return jsonify({"error": f"Kunde inte initiera OpenAI-klienten: {e}"}), 500

    # Messages
    system_prompt = (data.get("system") or "Du är en hjälpsam AI‑assistent.").strip()
    incoming_messages = data.get("messages") if isinstance(data.get("messages"), list) else None
    user_message = (data.get("prompt") or data.get("message") or "").strip()
    if incoming_messages and len(incoming_messages) > 0:
        messages = incoming_messages
        if not (isinstance(messages[0], dict) and messages[0].get("role") == "system"):
            messages = [{"role": "system", "content": system_prompt}] + messages
    else:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

    # Budget and timeout
    max_tokens = data.get("max_tokens") or data.get("max_completion_tokens") or 1000
    try:
        req_timeout = float(data.get("timeout", 120))
    except Exception:
        req_timeout = 120
    req_timeout = max(5, min(180, req_timeout))

    tools = data.get("tools") if isinstance(data.get("tools"), list) else None
    tool_choice = data.get("tool_choice") if isinstance(data.get("tool_choice"), (dict, str)) else None
    # If tools are requested but the chosen model is flaky for tools, switch to a stable fallback
    try:
        if tools:
            stable_tool_models = {"gpt-4o-mini", "gpt-4o", "gpt-4.1-turbo", "gpt-5", "gpt-5-mini", "gpt-5-nano", "3o"}
            if model not in stable_tool_models:
                model = (os.getenv("FALLBACK_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
    except Exception:
        pass
    def _event_iter(final_model: str):
        # Emit an initial meta frame (bytes)
        yield (json.dumps({"type": "meta", "model": final_model}, ensure_ascii=False) + "\n").encode("utf-8")
        try:
            stream = client.chat.completions.create(
                model=final_model,
                messages=messages,
                max_tokens=max_tokens,
                timeout=req_timeout,
                stream=True,
                tools=tools,
                tool_choice=tool_choice,
            )
            emitted_delta = False
            emitted_tool_hint = False
            for ev in stream:
                try:
                    # New SDKs: ev.choices[0].delta.content; some variants may use .message
                    delta = None
                    try:
                        delta = ev.choices[0].delta.content
                    except Exception:
                        pass
                    if not delta:
                        try:
                            delta = ev.choices[0].message.get("content") if getattr(ev.choices[0], "message", None) else None
                        except Exception:
                            delta = None
                    # Detect tool_calls deltas/messages for function calling
                    tool_calls = None
                    finish_reason = None
                    try:
                        tool_calls = ev.choices[0].delta.tool_calls
                        # Stream live tool_call argument deltas so client can render code as it's produced
                        try:
                            for tcd in (tool_calls or []):
                                try:
                                    fn = getattr(tcd, 'function', None)
                                    if fn is None and isinstance(tcd, dict):
                                        fn = tcd.get('function')
                                    name = None
                                    args_delta = None
                                    if isinstance(fn, dict):
                                        name = fn.get('name')
                                        args_delta = fn.get('arguments')
                                    else:
                                        name = getattr(fn, 'name', None)
                                        args_delta = getattr(fn, 'arguments', None)
                                    if args_delta:
                                        payload = {"type": "tool_delta", "name": name or "tool", "arguments_delta": str(args_delta)}
                                        yield (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
                                except Exception:
                                    continue
                        except Exception:
                            pass
                    except Exception:
                        pass
                    # Some SDKs place tool_calls on the message object or only signal via finish_reason
                    if not tool_calls:
                        try:
                            msg_obj = getattr(ev.choices[0], "message", None)
                            if msg_obj is not None:
                                if isinstance(msg_obj, dict):
                                    tool_calls = msg_obj.get("tool_calls")
                                else:
                                    tool_calls = getattr(msg_obj, "tool_calls", None)
                        except Exception:
                            tool_calls = None
                    try:
                        finish_reason = getattr(ev.choices[0], "finish_reason", None)
                    except Exception:
                        finish_reason = None
                    if tool_calls:
                        # We don’t execute tools inline within streaming to keep NDJSON simple.
                        # Emit a hint line so the client can fallback to JSON path for tool runs if desired.
                        tool_names = []
                        try:
                            for tc in tool_calls or []:
                                try:
                                    fn = getattr(tc, 'function', None)
                                    name = None
                                    if isinstance(fn, dict):
                                        name = fn.get('name')
                                    else:
                                        name = getattr(fn, 'name', None)
                                    if name:
                                        tool_names.append(str(name))
                                except Exception:
                                    continue
                        except Exception:
                            pass
                        yield (json.dumps({"type": "meta", "note": "tool_calls_pending", "tools": tool_names}, ensure_ascii=False) + "\n").encode("utf-8")
                        emitted_tool_hint = True
                    elif (finish_reason == "tool_calls" or finish_reason == "tool_call"):
                        # No explicit tool_calls payload surfaced, but finish reason indicates a tool call
                        yield (json.dumps({"type": "meta", "note": "tool_calls_pending", "tools": []}, ensure_ascii=False) + "\n").encode("utf-8")
                        emitted_tool_hint = True
                    if delta:
                        yield (json.dumps({"type": "delta", "delta": delta}, ensure_ascii=False) + "\n").encode("utf-8")
                        emitted_delta = True
                except Exception:
                    # Ignore malformed chunks but continue the stream
                    continue
        except Exception as e:
            # Try fallback model if configured and different
            fb = os.getenv("FALLBACK_MODEL", "gpt-4o-mini")
            if fb and fb != final_model:
                yield (json.dumps({"type": "meta", "note": "fallback", "model": fb}, ensure_ascii=False) + "\n").encode("utf-8")
                try:
                    stream = client.chat.completions.create(
                        model=fb,
                        messages=messages,
                        max_tokens=max_tokens,
                        timeout=req_timeout,
                        stream=True,
                        tools=tools,
                    )
                    emitted_delta = False
                    for ev in stream:
                        try:
                            delta = None
                            try:
                                delta = ev.choices[0].delta.content
                            except Exception:
                                pass
                            if not delta:
                                try:
                                    delta = ev.choices[0].message.get("content") if getattr(ev.choices[0], "message", None) else None
                                except Exception:
                                    delta = None
                            if delta:
                                yield (json.dumps({"type": "delta", "delta": delta}, ensure_ascii=False) + "\n").encode("utf-8")
                                emitted_delta = True
                        except Exception:
                            continue
                except Exception as e2:
                    yield (json.dumps({"type": "error", "message": str(e2)}, ensure_ascii=False) + "\n").encode("utf-8")
            else:
                yield (json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False) + "\n").encode("utf-8")
        # If no content was streamed but tools were requested, nudge the client to fallback and execute tools
        try:
            if tools and not locals().get('emitted_delta', False) and not locals().get('emitted_tool_hint', False):
                yield (json.dumps({"type": "meta", "note": "tool_calls_pending", "tools": []}, ensure_ascii=False) + "\n").encode("utf-8")
        except Exception:
            pass
        # Final marker
        yield (json.dumps({"type": "done"}, ensure_ascii=False) + "\n").encode("utf-8")

    # Return NDJSON stream
    return Response(
        stream_with_context(_event_iter(model)),
        mimetype="application/x-ndjson; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Content-Encoding": "identity",
        },
        direct_passthrough=True,
    )
