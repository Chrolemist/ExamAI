import os
import sys
import tempfile
import subprocess
import time
from typing import Dict, Any, Optional
import json
import urllib.request
import urllib.error

try:
    import resource  # type: ignore
except Exception:  # Windows fallback (not used in container)
    resource = None  # type: ignore


class PythonRunner:
    """
    Execute short Python snippets in an isolated subprocess with basic CPU/memory limits.

    Notes:
    - Runs inside the backend container; do not trust untrusted code beyond this sandbox.
    - Limits applied via RLIMIT_CPU and RLIMIT_AS when available (Linux).
    - Uses `-I` to isolate from user site packages; environment is minimized.
    - No network isolation is enforced here; deploy behind a network sandbox if needed.
    """

    def __init__(self, timeout_sec: float = 5.0, mem_limit_mb: int = 512, base_url: Optional[str] = None):
        self.timeout_sec = max(0.5, float(timeout_sec))
        self.mem_limit_mb = max(64, int(mem_limit_mb))
        # Optional remote runner base URL, e.g. http://runner:7000
        self.base_url = (base_url or os.environ.get("RUNNER_BASE_URL") or "").strip()
        # Strict mode: do not fall back to local execution if remote runner is unavailable
        strict_env = os.environ.get("PYTHON_RUNNER_STRICT", "").strip().lower()
        self.strict = strict_env in ("1", "true", "yes", "on")

    def _limit_resources(self) -> None:
        if resource is None:
            return
        try:
            # CPU seconds
            resource.setrlimit(resource.RLIMIT_CPU, (int(self.timeout_sec) + 1, int(self.timeout_sec) + 1))
        except Exception:
            pass
        try:
            # Address space (virtual memory) in bytes
            limit_bytes = self.mem_limit_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
        except Exception:
            pass

    def run(self, code: str) -> Dict[str, Any]:
        # If remote runner is configured, try that first
        if self.base_url:
            try:
                payload = json.dumps({
                    "code": str(code or ""),
                    "timeout": float(self.timeout_sec),
                    "mem_limit_mb": int(self.mem_limit_mb),
                }).encode("utf-8")
                url = self.base_url.rstrip("/") + "/run-python"
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=max(2.0, float(self.timeout_sec) + 2.0)) as resp:
                    ct = resp.headers.get("content-type", "")
                    raw = resp.read()
                    # Ensure we compare strings, not bytes (avoids TypeError)
                    if "json" in str(ct).lower():
                        try:
                            out = json.loads(raw.decode("utf-8", errors="replace"))
                            if isinstance(out, dict):
                                out.setdefault("engine", "remote")
                            return out
                        except Exception:
                            pass
                    # Fallback parse
                    out = json.loads(raw.decode("utf-8", errors="replace"))
                    if isinstance(out, dict):
                        out.setdefault("engine", "remote")
                    return out
            except Exception as e:
                # Remote failed
                try:
                    print(f"[DEBUG] remote runner error: {e}")
                except Exception:
                    pass
                if self.strict:
                    # Do not run locally in strict mode
                    return {
                        "ok": False,
                        "timeout": False,
                        "exit_code": None,
                        "stdout": "",
                        "stderr": f"Strict mode: remote runner unavailable ({e})",
                        "duration_ms": 0,
                        "engine": "strict",
                    }
        else:
            # No remote runner configured
            if self.strict:
                return {
                    "ok": False,
                    "timeout": False,
                    "exit_code": None,
                    "stdout": "",
                    "stderr": "Strict mode: RUNNER_BASE_URL is not configured",
                    "duration_ms": 0,
                    "engine": "strict",
                }
        code = str(code or "")
        t0 = time.time()
        with tempfile.TemporaryDirectory(prefix="pytool_") as tmp:
            # Minimal environment; drop secrets
            env = {
                "PYTHONUNBUFFERED": "1",
                "PYTHONDONTWRITEBYTECODE": "1",
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                # Limit BLAS threads to reduce resource usage and avoid oversubscription
                "OPENBLAS_NUM_THREADS": "1",
                "OMP_NUM_THREADS": "1",
                "MKL_NUM_THREADS": "1",
                "NUMEXPR_NUM_THREADS": "1",
            }
            # Compose command
            cmd = [sys.executable, "-I", "-c", code]
            try:
                proc = subprocess.Popen(
                    cmd,
                    cwd=tmp,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=env,
                    preexec_fn=self._limit_resources if resource is not None else None,
                    text=True,
                )
                try:
                    out, err = proc.communicate(timeout=self.timeout_sec)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    out, err = proc.communicate()
                    dt = time.time() - t0
                    return {
                        "ok": False,
                        "timeout": True,
                        "exit_code": proc.returncode,
                        "stdout": out[:10000],
                        "stderr": (err[:10000] + "\n[Timed out]").strip(),
                        "duration_ms": int(dt * 1000),
                        "engine": "local",
                    }
                dt = time.time() - t0
                return {
                    "ok": proc.returncode == 0,
                    "timeout": False,
                    "exit_code": proc.returncode,
                    "stdout": (out or "")[:10000],
                    "stderr": (err or "")[:10000],
                    "duration_ms": int(dt * 1000),
                    "engine": "local",
                }
            except Exception as e:
                dt = time.time() - t0
                return {
                    "ok": False,
                    "timeout": False,
                    "exit_code": None,
                    "stdout": "",
                    "stderr": f"Runner error: {e}",
                    "duration_ms": int(dt * 1000),
                    "engine": "local",
                }
