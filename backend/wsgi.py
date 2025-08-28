try:
	from backend.app import create_app  # when installed as a package
except Exception:
	try:
		from .app import create_app  # relative
	except Exception:
		from app import create_app  # local

# Gunicorn entrypoint
app = create_app()
