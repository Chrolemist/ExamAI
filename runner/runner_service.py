import os
import sys
import time
import tempfile
import subprocess
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    import resource  # type: ignore
except Exception:
    resource = None  # type: ignore

app = FastAPI(title="ExamAI Runner", version="1.0.0")

class RunRequest(BaseModel):
    code: str
    timeout: float | None = 5.0
    mem_limit_mb: int | None = 512


def _limit_resources(timeout: float, mem_mb: int):
    if resource is None:
        return None
    def _set():
        try:
            # CPU seconds
            resource.setrlimit(resource.RLIMIT_CPU, (int(timeout) + 1, int(timeout) + 1))
        except Exception:
            pass
        try:
            # Address space (virtual memory) in bytes
            limit_bytes = int(mem_mb) * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
        except Exception:
            pass
    return _set


@app.post("/run-python")
async def run_python(req: RunRequest):
    code = (req.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")
    timeout = max(0.5, float(req.timeout or 5.0))
    mem = max(64, int(req.mem_limit_mb or 256))

    t0 = time.time()
    with tempfile.TemporaryDirectory(prefix="pytool_") as tmp:
        env = {
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            # Limit BLAS threads to reduce resource usage under strict limits
            "OPENBLAS_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
        }
        cmd = [sys.executable, "-I", "-c", code]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=tmp,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                preexec_fn=_limit_resources(timeout, mem) if resource is not None else None,
                text=True,
            )
            try:
                out, err = proc.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                out, err = proc.communicate()
                dt = time.time() - t0
                return {
                    "ok": False,
                    "timeout": True,
                    "exit_code": proc.returncode,
                    "stdout": (out or "")[:10000],
                    "stderr": ((err or "")[:10000] + "\n[Timed out]").strip(),
                    "duration_ms": int(dt * 1000),
                }
            dt = time.time() - t0
            return {
                "ok": proc.returncode == 0,
                "timeout": False,
                "exit_code": proc.returncode,
                "stdout": (out or "")[:10000],
                "stderr": (err or "")[:10000],
                "duration_ms": int(dt * 1000),
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
            }

@app.get("/health")
async def health():
    return {"ok": True, "pid": os.getpid()}
