"""AI Tutor Mistral chat client tests (stubbed HTTP — no live calls)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import reset_settings  # noqa: E402
from app.core.llm import MistralLlmClient, get_llm_client, set_llm_client  # noqa: E402


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "")
    # Hermetic runs: a host shell exporting AI_TUTOR_* vars (e.g.
    # AI_TUTOR_BASE_URL=https://openrouter.ai/api/v1) must not flip the
    # Mistral client's base URL or model in these tests.
    monkeypatch.delenv("AI_TUTOR_BASE_URL", raising=False)
    monkeypatch.delenv("AI_TUTOR_MODEL", raising=False)
    monkeypatch.delenv("AI_TUTOR_CHAT_MODEL", raising=False)
    reset_settings()
    set_llm_client(None)
    yield
    set_llm_client(None)
    reset_settings()


def test_mistral_provider_routing(monkeypatch):
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "mistral")
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.delenv("AI_TUTOR_MODEL", raising=False)
    reset_settings()
    client = get_llm_client()
    assert isinstance(client, MistralLlmClient)
    assert client.name == "mistral"


def test_mistral_chat_request_shape_and_parsing(monkeypatch):
    import json
    import urllib.request

    sent: dict = {}

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "stubbed mistral"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        sent["headers"] = dict(req.header_items())
        return _FakeRes()

    monkeypatch.setenv("AI_TUTOR_PROVIDER", "mistral")
    monkeypatch.setenv("AI_TUTOR_API_KEY", "test-mistral-key")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    reset_settings()
    out = MistralLlmClient().chat("sys", "hi", 64)
    assert out == "stubbed mistral"
    assert sent["url"].startswith("https://api.mistral.ai")
    assert "/v1/chat/completions" in sent["url"]
    assert sent["body"]["model"] == "magistral-small-2506"
    assert sent["body"]["messages"][0]["role"] == "system"
    assert sent["body"]["messages"][1] == {"role": "user", "content": "hi"}
    header_names = [k.lower() for k in sent["headers"]]
    assert "authorization" in header_names


def test_mistral_missing_key_is_deterministic_mock(monkeypatch):
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "mistral")
    monkeypatch.delenv("AI_TUTOR_API_KEY", raising=False)
    reset_settings()
    out = MistralLlmClient().chat("sys", "first line", 64)
    assert "Mock answer" in out
