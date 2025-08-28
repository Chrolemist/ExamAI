
import os
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv, find_dotenv


# Ladda miljövariabler tidigt
try:
    load_dotenv(find_dotenv(), override=False)
except Exception:
    try:
        load_dotenv()
    except Exception:
        pass


def create_app():
    """Skapar en minimal Flask-app och registrerar blueprints. app.py ska vara tunn."""
    app = Flask(__name__)

    # Grundkonfiguration
    app.config.setdefault("OPENAI_MODEL", os.getenv("OPENAI_MODEL") or os.getenv("OPENAI_MODEL_NAME") or "gpt-5-mini")
    app.config.setdefault("UPLOAD_DIR", os.environ.get("UPLOAD_DIR", os.path.join(os.getcwd(), "uploads")))
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)

    # CORS (tillåter lokala dev-origin)
    allowed_origins = [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    try:
        CORS(
            app,
            resources={r"/*": {"origins": allowed_origins, "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"]}},
            supports_credentials=False,
        )
    except Exception:
        CORS(app)

    allowed_set = set(allowed_origins)

    @app.after_request
    def add_cors_headers(resp):
        try:
            origin = request.headers.get("Origin", "")
            if origin in allowed_set:
                resp.headers["Access-Control-Allow-Origin"] = origin
                vary = resp.headers.get("Vary")
                resp.headers["Vary"] = (vary + ", Origin") if vary else "Origin"
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        except Exception:
            pass
        return resp

    # Registrera routes via blueprints
    try:
        from .routes.chat import chat_bp  # type: ignore
    except Exception:
        from routes.chat import chat_bp  # type: ignore
    try:
        from .routes.upload import upload_bp  # type: ignore
    except Exception:
        from routes.upload import upload_bp  # type: ignore
    try:
        from .routes.debug import debug_bp  # type: ignore
    except Exception:
        from routes.debug import debug_bp  # type: ignore
    try:
        from .routes.exam import exam_bp  # type: ignore
    except Exception:
        from routes.exam import exam_bp  # type: ignore

    app.register_blueprint(chat_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(debug_bp)
    app.register_blueprint(exam_bp)
    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app = create_app()
    app.run(host="0.0.0.0", port=port, debug=True)
