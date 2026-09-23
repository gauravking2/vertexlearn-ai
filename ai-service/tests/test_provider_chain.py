"""Provider-chain and failure-mapping tests for the AI service.

Root causes these pin, both observed on the hosted deployment:

1. The chat provider was selected from one variable (`AI_TUTOR_PROVIDER`) and,
   when that provider had no credential, every client returned
   `Mock answer: <the user's question>` instead of failing. The backend stored
   that text as a grounded answer with citations attached.
2. A database that cannot be read reached the client as an uncategorised 500
   `INTERNAL_ERROR`, so a wrong DATABASE_URL was indistinguishable from a
   provider outage.

They also bound the answer path: one attempt may not exceed
LLM_ATTEMPT_TIMEOUT_S and the whole chain may not exceed AI_ANSWER_BUDGET_S.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import llm as llm_module  # noqa: E402
from app.core.config import reset_settings  # noqa: E402
from app.core.llm import (  # noqa: E402
    ProviderNotConfigured,
    ai_answer_budget_s,
    chat_with_fallback,
    get_llm_clients,
    llm_attempt_timeout_s,
    set_llm_client,
)
from app.main import create_app  # noqa: E402
from app.rag.embeddings import deterministic_embedding  # noqa: E402
from app.routers.chat import _llm_provider_api_error  # noqa: E402
from app.store import DatabaseUnavailable, MemoryChunkStore, set_store  # noqa: E402

PROVIDER_ENV = (
    "AI_TUTOR_PROVIDER",
    "LLM_PROVIDER",
    "GEMINI_API_KEY",
    "AI_TUTOR_API_KEY",
    "GROQ_API_KEY",
    "POLLINATIONS_API_KEY",
    "LLM_API_KEY",
    "AI_ANSWER_BUDGET_S",
    "LLM_ATTEMPT_TIMEOUT_S",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in PROVIDER_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "")
    reset_settings()
    set_llm_client(None)
    yield
    set_llm_client(None)
    reset_settings()


class _Stub:
    """Minimal LlmClient double: either an answer or a failure."""

    def __init__(self, name: str, answer: str | None = None, error: Exception | None = None):
        self.name = name
        self.answer = answer
        self.error = error
        self.calls = 0

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.answer or ""


def _seeded_store() -> MemoryChunkStore:
    store = MemoryChunkStore()
    store.seed(
        [
            {
                "id": "c1",
                "course_id": "A",
                "lecture_id": "lecA",
                "lecture_title": "Alpha",
                "chunk_index": 0,
                "text": "photosynthesis releases oxygen",
                "embedding": deterministic_embedding("photosynthesis releases oxygen", 32),
            }
        ]
    )
    return store


def test_chain_prefers_primary_then_only_credentialled_fallbacks(monkeypatch):
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("AI_TUTOR_API_KEY", "openrouter-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    reset_settings()

    names = [client.name for client in get_llm_clients()]

    assert names[0] == "openrouter"  # configured primary always leads
    assert "gemini" in names  # has a credential
    assert "pollinations" in names  # keyless route is live-verified
    # groq/mistral accept the shared AI-tutor key by design (see config.py),
    # so they legitimately follow; a provider with NO credential is skipped.
    assert "anthropic" not in names  # LLM_API_KEY is unset


def test_only_keyless_pollinations_when_nothing_else_is_configured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    reset_settings()
    assert [c.name for c in get_llm_clients()] == ["pollinations"]


def test_uncredentialled_primary_is_skipped_not_mocked(monkeypatch):
    """The hosted failure shape: AI_TUTOR_PROVIDER=openrouter with no key.

    openrouter must not lead the chain (it would only raise), and the chain
    must contain no unkeyed provider that could answer with mock text.
    """
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    reset_settings()

    names = [client.name for client in get_llm_clients()]
    assert "openrouter" not in names
    assert names[0] == "gemini"


def test_chain_falls_back_to_the_next_provider(monkeypatch):
    first = _Stub("openrouter", error=Exception("LLM provider error: 429 rate limited"))
    second = _Stub("gemini", answer="Grounded answer [S1].")
    monkeypatch.setattr(llm_module, "get_llm_clients", lambda: [first, second])

    answer, provider = chat_with_fallback("sys", "user")

    assert (answer, provider) == ("Grounded answer [S1].", "gemini")
    assert first.calls == 1 and second.calls == 1


def test_chain_never_returns_placeholder_text(monkeypatch):
    mock = _Stub("gemini", answer="Mock answer: what is photosynthesis?")
    real = _Stub("pollinations", answer="Photosynthesis releases oxygen [S1].")
    monkeypatch.setattr(llm_module, "get_llm_clients", lambda: [mock, real])

    answer, provider = chat_with_fallback("sys", "user")

    assert provider == "pollinations"
    assert "Mock answer" not in answer


def test_chain_reports_missing_credential_as_configuration_error(monkeypatch):
    monkeypatch.setattr(
        llm_module,
        "get_llm_clients",
        lambda: [_Stub("gemini", error=ProviderNotConfigured("GEMINI_API_KEY is required for the gemini provider"))],
    )

    with pytest.raises(ProviderNotConfigured):
        chat_with_fallback("sys", "user")


def test_chain_prefers_provider_error_over_missing_credential(monkeypatch):
    """A real outage must not be reported as a configuration problem."""
    monkeypatch.setattr(
        llm_module,
        "get_llm_clients",
        lambda: [
            _Stub("gemini", error=ProviderNotConfigured("GEMINI_API_KEY is required for the gemini provider")),
            _Stub("pollinations", error=Exception("request timed out")),
        ],
    )

    with pytest.raises(Exception) as err:
        chat_with_fallback("sys", "user")
    assert not isinstance(err.value, ProviderNotConfigured)
    assert "timed out" in str(err.value)


def test_empty_provider_answer_is_not_returned(monkeypatch):
    monkeypatch.setattr(
        llm_module,
        "get_llm_clients",
        lambda: [_Stub("gemini", answer="   "), _Stub("pollinations", answer="Real answer [S1].")],
    )

    answer, provider = chat_with_fallback("sys", "user")
    assert provider == "pollinations" and answer == "Real answer [S1]."


def test_budget_helpers_clamp_hostile_values(monkeypatch):
    for raw, expected in (("0", 2.0), ("9999", 60.0), ("12.5", 12.5)):
        monkeypatch.setenv("LLM_ATTEMPT_TIMEOUT_S", raw)
        assert llm_attempt_timeout_s() == expected
    for raw, expected in (("0", 5.0), ("9999", 120.0), ("30", 30.0)):
        monkeypatch.setenv("AI_ANSWER_BUDGET_S", raw)
        assert ai_answer_budget_s() == expected


def test_missing_credential_maps_to_not_configured():
    mapped = _llm_provider_api_error(ProviderNotConfigured("GEMINI_API_KEY is required for the gemini provider"))
    assert mapped.status == 503 and mapped.code == "AI_NOT_CONFIGURED"


def test_chat_endpoint_answers_with_the_chain(monkeypatch):
    set_store(_seeded_store())
    monkeypatch.setattr(
        llm_module,
        "get_llm_clients",
        lambda: [_Stub("gemini", error=Exception("LLM provider error: 500 upstream")), _Stub("pollinations", answer="The lecture says photosynthesis releases oxygen [S1].")],
    )

    res = TestClient(create_app()).post(
        "/v1/chat/answer",
        json={"course_id": "A", "question": "what does photosynthesis release?", "mode": "beginner"},
    )

    assert res.status_code == 200
    body = res.json()
    assert "photosynthesis releases oxygen" in body["answer"]
    assert body["sources"][0]["ref"] == "S1"
    assert body["sources"][0]["lecture_title"] == "Alpha"


def test_chat_endpoint_reports_configuration_failure_not_mock_text(monkeypatch):
    set_store(_seeded_store())
    monkeypatch.setattr(
        llm_module,
        "get_llm_clients",
        lambda: [_Stub("openrouter", error=ProviderNotConfigured("AI_TUTOR_API_KEY is required for the openrouter provider"))],
    )

    res = TestClient(create_app()).post(
        "/v1/chat/answer",
        json={"course_id": "A", "question": "what does photosynthesis release?", "mode": "beginner"},
    )

    assert res.status_code == 503
    assert res.json()["error"] == "AI_NOT_CONFIGURED"
    assert "Mock answer" not in res.text


def test_chat_endpoint_reports_unreadable_course_index(monkeypatch):
    class _Down(MemoryChunkStore):
        def chunks_for_course(self, course_id: str) -> list[dict]:
            raise DatabaseUnavailable("course index query failed")

    set_store(_Down())

    res = TestClient(create_app()).post(
        "/v1/chat/answer",
        json={"course_id": "A", "question": "what does photosynthesis release?", "mode": "beginner"},
    )

    assert res.status_code == 503
    assert res.json()["error"] == "AI_DB_UNAVAILABLE"


def test_health_reports_effective_chat_chain(monkeypatch):
    """The old /health echoed LLM_PROVIDER while AI_TUTOR_PROVIDER drove chat,
    so a mocked provider looked healthy on the host."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("AI_TUTOR_PROVIDER", "openrouter")
    monkeypatch.setenv("AI_TUTOR_API_KEY", "openrouter-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")
    reset_settings()

    body = TestClient(create_app()).get("/health").json()

    assert body["provider"] == "openrouter"
    assert body["chatChain"][0] == "openrouter"
