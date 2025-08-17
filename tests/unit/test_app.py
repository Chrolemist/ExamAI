import io
import json
import types


def make_test_client():
    # Import the app module and build a Flask test client
    import app as app_module
    flask_app = app_module.create_app()
    return flask_app.test_client(), app_module


def test_root_serves_index_html():
    # Since we moved frontend to separate structure,
    # backend root should return 404 or redirect
    client, _ = make_test_client()
    r = client.get("/")
    # Backend is now API-only, no static frontend serving expected
    assert r.status_code == 404


def test_key_status_no_key_env(monkeypatch):
    client, app_module = make_test_client()
    # Ensure no OPENAI key is seen
    for k in ["OPENAI_API_KEY", "OPENAI_APIKEY", "OPENAI_KEY"]:
        monkeypatch.delenv(k, raising=False)
    r = client.get("/key-status")
    assert r.status_code == 200
    data = r.get_json()
    assert data and data.get("hasKey") is False


def test_chat_requires_message_or_messages():
    client, _ = make_test_client()
    r = client.post("/chat", json={})
    assert r.status_code == 400


def test_chat_401_without_api_key(monkeypatch):
    client, app_module = make_test_client()
    # Ensure OpenAI SDK import is considered present
    if getattr(app_module, "OpenAI", None) is None:
        class _Dummy:
            def __init__(self, *a, **k):
                pass
        app_module.OpenAI = _Dummy  # type: ignore
    # Ensure no env-provided API key leaks in
    for k in ["OPENAI_API_KEY", "OPENAI_APIKEY", "OPENAI_KEY"]:
        monkeypatch.delenv(k, raising=False)
    # No apiKey provided -> 401
    r = client.post("/chat", json={"message": "hej"})
    assert r.status_code == 401


def test_chat_happy_path_with_mock_openai(monkeypatch):
    client, app_module = make_test_client()

    class DummyMessage:
        content = "Hej från test"

    class DummyChoice:
        message = DummyMessage()
        finish_reason = "stop"

    class DummyUsage:
        prompt_tokens = 5
        completion_tokens = 7
        total_tokens = 12

    class DummyResp:
        choices = [DummyChoice()]
        usage = DummyUsage()

    class DummyCompletions:
        def create(self, **kwargs):
            # sanity: model & messages are passed
            assert kwargs.get("model")
            assert kwargs.get("messages")
            return DummyResp()

    class DummyChat:
        completions = DummyCompletions()

    class DummyOpenAI:
        def __init__(self, api_key=None):
            self.chat = DummyChat()

    monkeypatch.setattr(app_module, "OpenAI", DummyOpenAI, raising=True)
    r = client.post("/chat", json={
        "message": "skriv något",
        "apiKey": "sk-test",
        "web": {"enable": False},
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data and data.get("reply") == "Hej från test"
    assert data.get("model")
    assert data.get("usage", {}).get("total_tokens") == 12


def test_chat_web_enabled_includes_citations(monkeypatch):
    client, app_module = make_test_client()

    # Mock OpenAI same as above
    class DummyMessage:
        content = "Svar med källor [1]"

    class DummyChoice:
        message = DummyMessage()
        finish_reason = "stop"

    class DummyResp:
        choices = [DummyChoice()]

    class DummyCompletions:
        def create(self, **kwargs):
            return DummyResp()

    class DummyChat:
        completions = DummyCompletions()

    class DummyOpenAI:
        def __init__(self, api_key=None):
            self.chat = DummyChat()

    monkeypatch.setattr(app_module, "OpenAI", DummyOpenAI, raising=True)
    # Force non-Playwright path and stub web fetch to avoid network
    monkeypatch.setattr(app_module, "sync_playwright", None, raising=False)
    monkeypatch.setattr(
        app_module,
        "_web_search_and_fetch",
        lambda query, **kw: [
            {"title": "Exempelkälla", "url": "https://example.com/a", "text": "Lorem ipsum"}
        ],
        raising=True,
    )

    r = client.post("/chat", json={
        "message": "Vad hände?",
        "apiKey": "sk-test",
        "web": {"enable": True, "maxResults": 1},
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    cits = data.get("citations")
    assert isinstance(cits, list) and len(cits) == 1
    assert cits[0]["url"].startswith("https://example.com/")


def test_upload_returns_items():
    client, _ = make_test_client()
    content = b"Hello upload!"
    data = {
        "files": (io.BytesIO(content), "hello.txt"),
        "maxChars": "100",
    }
    r = client.post("/upload", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    payload = r.get_json()
    assert payload and payload.get("count") == 1
    assert payload["items"][0]["chars"] == len("Hello upload!")


def test_build_exam_html():
    client, _ = make_test_client()
    lec = (io.BytesIO(b"Intro to X"), "lec1.txt")
    ex = (io.BytesIO(b"Exam Q1"), "ex1.txt")
    data = {
        "examTitle": "Min tenta",
        "lectures": lec,
        "exams": ex,
    }
    r = client.post("/build-exam", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    payload = r.get_json()
    assert "html" in payload and "Min tenta" in payload["html"]
    assert payload["counts"]["lectures"] == 1
    assert payload["counts"]["exams"] == 1


def test_debug_fetch_errors():
    client, _ = make_test_client()
    r = client.get("/debug/fetch")
    assert r.status_code == 400
    r = client.get("/debug/fetch?url=ftp://example.com")
    assert r.status_code == 400
