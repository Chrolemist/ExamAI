try:
	from .app import create_app  # package import
except Exception:
	from app import create_app  # fallback when run directly

# Gunicorn entrypoint
app = create_app()
