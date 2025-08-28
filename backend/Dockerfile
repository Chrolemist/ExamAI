# syntax=docker/dockerfile:1.7-labs
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies för pdfplumber (pdfminer, Pillow etc.)
RUN apt-get update && apt-get install -y \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Optional Playwright install (disabled by default). Enable with build-arg ENABLE_PLAYWRIGHT=true
ARG ENABLE_PLAYWRIGHT=false

# Copy and install deps first
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$ENABLE_PLAYWRIGHT" = "true" ]; then python -m pip install --no-cache-dir playwright && python -m playwright install chromium --with-deps || true; fi

# Copy app code
COPY . .

# Default to gunicorn
ENV PORT=8000
EXPOSE 8000

# Use 2 workers by default; adjust for Cloud Run memory/CPU
CMD ["gunicorn", "-w", "2", "-b", ":8000", "--timeout", "120", "--graceful-timeout", "20", "--keep-alive", "75", "wsgi:app"]
