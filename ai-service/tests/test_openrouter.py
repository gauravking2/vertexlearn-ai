"""AI Tutor OpenRouter chat client tests (stubbed HTTP — no live calls)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import reset_settings  # noqa: E402
from app.core.llm import OpenRouterLlmClient, get_llm_client, set_llm_client  # noqa: E402


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "")
    reset_settings()
    set_llm_client(None)
    yield
    set_llm_client(None)
    reset_settings()


def test_openrouter_provider_routing(monkeypatch):
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    reset_settings()
    client = get_llm_client()
    assert isinstance(client, OpenRouterLlmClient)
    assert client.name == "openrouter"


def test_openrouter_chat_request_shape_and_parsing(monkeypatch):
    import json
    import urllib.request

    sent: dict = {}

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "stubbed openrouter"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        sent["headers"] = dict(req.header_items())
        return _FakeRes()

    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("AI_TUTOR_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("AI_TUTOR_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("AI_TUTOR_MODEL", "openrouter/free")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    reset_settings()
    out = OpenRouterLlmClient().chat("sys", "hi", 64)
    assert out == "stubbed openrouter"
    assert sent["url"].startswith("https://openrouter.ai/api/v1")
    assert "/chat/completions" in sent["url"]
    assert sent["body"]["model"] == "openrouter/free"
    assert sent["body"]["messages"][0]["role"] == "system"
    assert sent["body"]["messages"][1] == {"role": "user", "content": "hi"}
    header_names = [k.lower() for k in sent["headers"]]
    assert "authorization" in header_names


def test_openrouter_missing_key_raises_instead_of_mocking(monkeypatch):
    """A missing credential is a configuration failure, not an answer.

    Regression: the hosted AI service returned `Mock answer: <question>` when
    its provider had no key, and the backend stored that as a grounded answer
    with citations attached.
    """
    from app.core.llm import ProviderNotConfigured

    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.delenv("AI_TUTOR_API_KEY", raising=False)
    reset_settings()
    with pytest.raises(ProviderNotConfigured):
        OpenRouterLlmClient().chat("sys", "first line", 64)


def test_openrouter_error_mapping(monkeypatch):
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("AI_TUTOR_API_KEY", "test-openrouter-key")
    reset_settings()

    # Import the mapper through the router module (keeps the provider module HTTP-only).
    from app.routers.chat import _llm_provider_api_error  # noqa: E402

    mapped = _llm_provider_api_error(Exception("LLM provider error: 400 {\"message\":\"Invalid model: x\"}"))
    assert mapped.status == 400 and mapped.code == "AI_BAD_REQUEST"

    mapped = _llm_provider_api_error(Exception("LLM provider error: 429 rate limited"))
    assert mapped.status == 429 and mapped.code == "RATE_LIMITED"

    mapped = _llm_provider_api_error(Exception("LLM provider error: 401 invalid key"))
    assert mapped.status == 503 and mapped.code == "AI_NOT_CONFIGURED"

    mapped = _llm_provider_api_error(Exception("request timed out"))
    assert mapped.status == 504 and mapped.code == "AI_TIMEOUT"

    mapped = _llm_provider_api_error(Exception("connection reset"))
    assert mapped.status == 503 and mapped.code == "PROVIDER_UNAVAILABLE"
