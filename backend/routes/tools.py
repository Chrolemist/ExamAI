from flask import Blueprint, request, jsonify
try:
    # Prefer top-level absolute import when the app runs without a package
    from services.python_runner import PythonRunner  # type: ignore
except Exception:
    try:
        # When installed as a package (backend.*)
        from backend.services.python_runner import PythonRunner  # type: ignore
    except Exception:
        # Fallback to relative import if package context exists
        from ..services.python_runner import PythonRunner  # type: ignore


tools_bp = Blueprint("tools", __name__)


@tools_bp.route("/tools/run-python", methods=["POST", "OPTIONS"])
def run_python_tool():
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(force=True, silent=True) or {}
    code = str(data.get("code") or "")
    # Optional per-call limits
    try:
        timeout = float(data.get("timeout", 5))
    except Exception:
        timeout = 5.0
    try:
        mem = int(data.get("mem_limit_mb", 256))
    except Exception:
        mem = 256
    if not code.strip():
        return jsonify({"error": "Missing 'code'"}), 400

    runner = PythonRunner(timeout_sec=timeout, mem_limit_mb=mem)
    result = runner.run(code)
    return jsonify(result)
