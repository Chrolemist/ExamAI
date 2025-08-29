# Minimal runner service container
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=7000

# Create unprivileged user
RUN useradd -m app && mkdir -p /app && chown -R app:app /app
WORKDIR /app

# System hardening: no compilers, small base; add tini for proper signal handling
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Optional: install extra Python packages at build time
ARG EXTRA_PIP=""
RUN if [ -n "$EXTRA_PIP" ]; then pip install --no-cache-dir $EXTRA_PIP; fi

COPY . /app

USER app
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "uvicorn", "runner_service:app", "--host", "0.0.0.0", "--port", "7000"]
