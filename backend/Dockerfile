# syntax=docker/dockerfile:1.7-labs
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget gnupg ca-certificates \
    libgtk-3-0 libnss3 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
    libgbm1 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3 libdrm2 libxkbcommon0 libpango-1.0-0 libatk1.0-data \
    libxshmfence1 libasound2 fonts-liberation libffi8 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install deps first
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install chromium --with-deps || true

# Copy app code
COPY . .

# Default to gunicorn
ENV PORT=8000
EXPOSE 8000

# Use 2 workers by default; adjust for Cloud Run memory/CPU
CMD ["gunicorn", "-w", "2", "-b", ":8000", "wsgi:app"]
