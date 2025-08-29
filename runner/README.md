# ExamAI Runner Service

A minimal, isolated code-execution microservice for running short Python snippets with basic CPU/memory limits. Intended to be called from the main backend via RUNNER_BASE_URL.

- API: `POST /run-python` with JSON `{ code: string, timeout?: number, mem_limit_mb?: number }`
- Response: `{ ok, timeout, exit_code, stdout, stderr, duration_ms }`
- Health: `GET /health`

Security notes:
- Container runs as non-root, read-only FS, tmpfs for /tmp, no-new-privileges, ALL caps dropped.
- Resource limits via RLIMIT_CPU and RLIMIT_AS (Linux).
- Consider network isolation (no outbound) via Docker network policies or firewall if needed.
- Extend with per-call allowlists and import guards if executing untrusted code.

Packages / dependencies:
- Base image only includes FastAPI and Uvicorn from `requirements.txt`.
- If your code needs libraries like `numpy` or `pandas`, add them one of these ways and rebuild:
	1) Add to `runner/requirements.txt` (persistent): list packages, then `docker compose build runner && docker compose up -d`.
	2) Build arg (quick): `docker compose build --build-arg EXTRA_PIP="numpy pandas" runner && docker compose up -d`.
- On-demand pip installs inside the sandbox are not supported by design (keeps runs fast and deterministic).
