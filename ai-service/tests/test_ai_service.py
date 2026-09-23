"""Pytest suite for the AI service: startup, chunking, embeddings, retrieval isolation."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import reset_settings  # noqa: E402
from app.core.llm import MockLlmClient, set_llm_client  # noqa: E402
from app.main import create_app  # noqa: E402
from app.rag.chunking import chunk_text  # noqa: E402
from app.rag.embeddings import MockEmbeddingClient, cosine, deterministic_embedding, set_embedding_client  # noqa: E402
from app.rag.retriever import StoredChunk, assert_no_cross_course, has_support, retrieve_course_chunks  # noqa: E402
from app.recommendation import build_study_plan, mastery_level  # noqa: E402
from app.store import MemoryChunkStore, set_store  # noqa: E402


@pytest.fixture(autouse=True)
def _mocked_providers(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "")
    # Hermetic runs: drop AI-tutor override vars so a host shell exporting
    # them (e.g. AI_TUTOR_PROVIDER=mistral) cannot flip provider routing.
    monkeypatch.delenv("AI_TUTOR_PROVIDER", raising=False)
    monkeypatch.delenv("AI_TUTOR_API_KEY", raising=False)
    monkeypatch.delenv("AI_TUTOR_MODEL", raising=False)
    monkeypatch.delenv("AI_TUTOR_CHAT_MODEL", raising=False)
    monkeypatch.delenv("AI_TUTOR_BASE_URL", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_CHAT_MODEL", raising=False)
    monkeypatch.delenv("GROQ_BASE_URL", raising=False)
    monkeypatch.delenv("POLLINATIONS_API_KEY", raising=False)
    monkeypatch.delenv("POLLINATIONS_CHAT_MODEL", raising=False)
    monkeypatch.delenv("POLLINATIONS_BASE_URL", raising=False)
    monkeypatch.delenv("POLLINATIONS_TIMEOUT_S", raising=False)
    reset_settings()
    set_llm_client(MockLlmClient())
    set_embedding_client(MockEmbeddingClient(dim=32))
    store = MemoryChunkStore()
    set_store(store)
    yield
    reset_settings()
    set_llm_client(None)
    set_embedding_client(None)
    set_store(MemoryChunkStore())


def _chunk(course: str, text: str, lecture: str = "L1", idx: int = 0) -> StoredChunk:
    return StoredChunk(
        id=f"{course}-{idx}",
        course_id=course,
        lecture_id=f"lec-{course}",
        lecture_title=lecture,
        chunk_index=idx,
        text=text,
        embedding=deterministic_embedding(text, 32),
    )


def test_startup_health():
    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_chunking_overlap_and_sentence_awareness():
    text = "First sentence here. Second sentence follows. " * 60
    chunks = chunk_text(text, size=100, overlap=20)
    assert len(chunks) >= 2
    assert all(len(c.text) <= 100 or c.text.count(".") >= 1 for c in chunks)
    assert chunks[1].text[:10] in chunks[0].text or len(chunks[0].text) <= 100


def test_chunking_empty():
    assert chunk_text("   ") == []


def test_embedding_abstraction_dim_and_determinism():
    client = MockEmbeddingClient(dim=32)
    a = client.embed(["hello world"])[0]
    b = client.embed(["hello world"])[0]
    assert len(a) == 32
    assert a == b
    assert cosine(a, b) == pytest.approx(1.0)


def test_retrieval_prefers_relevant_chunk():
    rows = [
        _chunk("A", "photosynthesis converts sunlight in chloroplasts", idx=0),
        _chunk("A", "unrelated algebra equations balance both sides", idx=1),
    ]
    results = retrieve_course_chunks("A", "what is photosynthesis", rows, top_k=2)
    assert results[0].chunk.chunk_index == 0


def test_course_filtering_drops_foreign_rows():
    rows = [_chunk("A", "alpha material", idx=0), _chunk("B", "beta material", idx=1)]
    results = retrieve_course_chunks("A", "material", rows, top_k=5)
    assert all(r.chunk.course_id == "A" for r in results)
    assert_no_cross_course(results, "A")


def test_cross_course_leakage_assertion():
    foreign = _chunk("B", "beta secrets", idx=0)
    scored = [type("S", (), {"chunk": foreign, "score": 1.0})()]
    with pytest.raises(AssertionError):
        assert_no_cross_course(scored, "A")


def test_no_context_behavior():
    results = retrieve_course_chunks("A", "anything", [], top_k=5)
    assert results == []
    assert has_support(results) is False


def test_chat_endpoint_course_isolation_and_citations():
    store = MemoryChunkStore()
    store.seed(
        [
            {"id": "a1", "course_id": "A", "lecture_id": "lecA", "lecture_title": "Alpha", "chunk_index": 0, "text": "photosynthesis releases oxygen", "embedding": deterministic_embedding("photosynthesis releases oxygen", 32)},
            {"id": "b1", "course_id": "B", "lecture_id": "lecB", "lecture_title": "Beta", "chunk_index": 0, "text": "quantum tunneling semiconductors", "embedding": deterministic_embedding("quantum tunneling semiconductors", 32)},
        ]
    )
    set_store(store)
    client = TestClient(create_app())
    res = client.post("/v1/chat/answer", json={"course_id": "A", "question": "photosynthesis releases what", "mode": "beginner"})
    assert res.status_code == 200
    body = res.json()
    assert body["grounded"] is True
    assert all(s["lecture_id"] != "lecB" for s in body["sources"])


def test_chat_endpoint_no_context_grounded_limitation():
    set_store(MemoryChunkStore())
    client = TestClient(create_app())
    res = client.post("/v1/chat/answer", json={"course_id": "A", "question": "quantum chromodynamics", "mode": "beginner"})
    assert res.status_code == 200
    assert res.json()["grounded"] is False
    assert "could not find" in res.json()["answer"].lower()


def test_chat_endpoint_low_support_still_calls_provider():
    from app.core import llm as llm_module

    class _StubLlm:
        name = "stub-openrouter"

        def __init__(self):
            self.calls = 0

        def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
            self.calls += 1
            return "Stubbed grounded answer [S1]."

    stub = _StubLlm()
    llm_module.set_llm_client(stub)
    try:
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
        set_store(store)
        client = TestClient(create_app())
        res = client.post("/v1/chat/answer", json={"course_id": "A", "question": "unrelated gibberish xyzzy", "mode": "beginner"})
        assert res.status_code == 200
        assert stub.calls == 1
        assert "Stubbed grounded answer" in res.json()["answer"]
    finally:
        llm_module.set_llm_client(None)


def test_chat_rejects_missing_course():
    client = TestClient(create_app())
    res = client.post("/v1/chat/answer", json={"course_id": "", "question": "hi"})
    assert res.status_code in (400, 422)


def test_mode_validation():
    client = TestClient(create_app())
    res = client.post("/v1/chat/answer", json={"course_id": "A", "question": "hi", "mode": "expert"})
    assert res.status_code == 422


def test_summarization_endpoint():
    client = TestClient(create_app())
    res = client.post("/v1/summarize", json={"lecture_id": "L1", "transcript": "Water evaporates. Clouds form. Rain falls. Oceans collect water."})
    assert res.status_code == 200
    assert len(res.json()["summary"]["keyPoints"]) >= 1


def test_quiz_gen_count_bounds_and_review_state():
    client = TestClient(create_app())
    good = client.post("/v1/quiz-gen", json={"lecture_id": "L1", "transcript": "Gravity pulls. Mass matters. Orbits balance. Weight varies. " * 20, "count": 6})
    assert good.status_code == 200
    assert good.json()["status"] == "pending_review"
    assert len(good.json()["questions"]) == 6
    bad = client.post("/v1/quiz-gen", json={"lecture_id": "L1", "transcript": "short", "count": 3})
    assert bad.status_code == 422


def test_flashcards_endpoint():
    store = MemoryChunkStore()
    store.seed([{"id": "1", "course_id": "A", "text": "heart pumps blood through arteries"}])
    set_store(store)
    client = TestClient(create_app())
    res = client.post("/v1/flashcards", json={"module_id": "M1"})
    assert res.status_code == 200
    assert len(res.json()["flashcards"]) >= 1


def test_study_plan_endpoint_and_mastery():
    client = TestClient(create_app())
    res = client.post("/v1/study-plan", json={"course_id": "C1", "quiz_ratio": 0.4, "weak_topics": ["Algebra"], "mastery": "beginner"})
    assert res.status_code == 200
    assert len(res.json()["weeks"]) == 3
    assert mastery_level(0.9) == "advanced"
    assert mastery_level(0.7) == "intermediate"
    assert mastery_level(0.2) == "beginner"
    assert mastery_level(None) == "beginner"
    plan = build_study_plan("C1", 0.2, ["Algebra"], "beginner")
    assert plan["weeks"][0]["focus"] == "Algebra"


def test_recommendation_mastery_thresholds():
    assert mastery_level(0.85) == "advanced"
    assert mastery_level(0.6) == "intermediate"
    assert mastery_level(None, 0.9) == "intermediate"


def test_empty_env_falls_back_to_provider_defaults(monkeypatch):
    """Regression: set-but-empty LLM_BASE_URL/MODEL must not win over defaults.

    Live verification hit `ValueError: unknown url type: '/v1/messages'`
    because an empty LLM_BASE_URL produced a relative URL.
    """
    from app.core.config import Settings

    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_CHAT_MODEL", "")
    monkeypatch.setenv("LLM_PROVIDER", "")
    monkeypatch.setenv("EMBEDDING_MODEL", "")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "")
    s = Settings()
    assert s.llm_base_url == "https://api.anthropic.com"
    assert s.llm_chat_model == "claude-3-5-sonnet-latest"
    assert s.llm_provider == "anthropic"
    assert s.embedding_model == "voyage-3-lite"
    assert s.embedding_base_url == "https://api.voyageai.com"


def test_llm_key_is_not_reused_as_embedding_key(monkeypatch):
    """Regression: with only an Anthropic key set, embeddings stay deterministic.

    Live verification showed the LLM-key fallback hitting Voyage with the
    wrong credential (HTTP 401) and breaking retrieval. No EMBEDDING_API_KEY
    must mean no embedding HTTP attempts.
    """
    from app.core.config import Settings
    from app.rag.embeddings import AnthropicEmbeddingClient, deterministic_embedding

    monkeypatch.setenv("LLM_API_KEY", "sk-ant-test-not-real")
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    s = Settings()
    assert s.embedding_api_key == ""
    client = AnthropicEmbeddingClient(s.embedding_dim)
    assert client.embed(["hello world"]) == [deterministic_embedding("hello world", s.embedding_dim)]


def test_gemini_provider_routing(monkeypatch):
    """Free-tier runtime: provider/model names select the Gemini clients."""
    from app.core.config import reset_settings
    from app.core.llm import GeminiLlmClient, get_llm_client, set_llm_client
    from app.rag.embeddings import GeminiEmbeddingClient, get_embedding_client, set_embedding_client

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini-embedding-001")
    reset_settings()
    set_llm_client(None)
    set_embedding_client(None)
    try:
        assert isinstance(get_llm_client(), GeminiLlmClient)
        assert get_llm_client().name == "gemini"
        assert isinstance(get_embedding_client(), GeminiEmbeddingClient)
        assert get_embedding_client().name == "gemini"
    finally:
        reset_settings()


def test_gemini_embedding_sends_1536_and_parses(monkeypatch):
    """Stubbed HTTP: outputDimensionality=1536 requested, 1536 parsed."""
    import json
    import urllib.request

    from app.rag.embeddings import GeminiEmbeddingClient

    sent: dict = {}

    class _FakeRes:
        def __init__(self, payload):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        sent["headers"] = dict(req.header_items())
        return _FakeRes({"embedding": {"values": [0.01] * 1536}})

    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini-embedding-001")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    client = GeminiEmbeddingClient(1536)
    vectors = client.embed(["hello world"])
    assert len(vectors) == 1
    assert len(vectors[0]) == 1536
    assert ":embedContent" in sent["url"]
    assert "gemini-embedding-001" in sent["url"]
    assert sent["body"]["outputDimensionality"] == 1536
    header_names = [k.lower() for k in sent["headers"]]
    assert "x-goog-api-key" in header_names
    assert "x-api-key" not in header_names


def test_gemini_llm_uses_generate_content(monkeypatch):
    """Stubbed HTTP: chat hits :generateContent and parses candidates."""
    import json
    import urllib.request

    from app.core.llm import GeminiLlmClient

    sent: dict = {}

    class _FakeRes:
        def read(self):
            return json.dumps({"candidates": [{"content": {"parts": [{"text": "stubbed"}]}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        return _FakeRes()

    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    out = GeminiLlmClient().chat("sys", "hi", 64)
    assert out == "stubbed"
    assert ":generateContent" in sent["url"]
    assert "anthropic" not in sent["url"]


def test_groq_llm_uses_openai_compatible_endpoint(monkeypatch):
    """Stubbed HTTP: groq chat hits /v1/chat/completions with Bearer key."""
    import json
    import urllib.request

    from app.core.llm import GroqLlmClient, get_llm_client

    sent: dict = {}

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "stubbed groq"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        sent["headers"] = {k.lower(): v for k, v in req.header_items()}
        return _FakeRes()

    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    monkeypatch.setenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    out = GroqLlmClient().chat("sys", "hi", 64)
    assert out == "stubbed groq"
    assert sent["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert sent["headers"].get("authorization") == "Bearer test-groq-key"
    assert sent["body"]["model"] == "llama-3.3-70b-versatile"


def test_groq_routing_and_missing_key_raises(monkeypatch):
    """AI_TUTOR_PROVIDER=groq routes to Groq; a missing key is an honest
    configuration error, never fabricated mock text (live bug: the hosted AI
    service answered `Mock answer: <question>` with no credential configured)."""
    import json
    import urllib.request

    from app.core.config import reset_settings
    from app.core.llm import get_llm_client, set_llm_client

    monkeypatch.setenv("AI_TUTOR_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    reset_settings()
    set_llm_client(None)
    assert get_llm_client().name == "groq"

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "ok"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    # Groq 401 fails fast without retry (auth error, not transient).
    def _fake_401(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 401, "unauthorized", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", _fake_401)
    import urllib.error

    try:
        get_llm_client().chat("sys", "hi", 64)
        raise AssertionError("expected 401 to raise")
    except Exception as exc:
        assert "401" in str(exc)

    # Missing key never touches HTTP and never invents an answer.
    from app.core.llm import ProviderNotConfigured

    monkeypatch.delenv("GROQ_API_KEY")
    reset_settings()
    calls: list = []
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: calls.append(1) or _FakeRes())
    with pytest.raises(ProviderNotConfigured):
        get_llm_client().chat("sys", "hello world", 64)
    assert calls == []


def test_pollinations_llm_sends_key_and_parses(monkeypatch):
    """Stubbed HTTP: pollinations chat hits /chat/completions with Bearer key."""
    import json
    import urllib.request

    from app.core.llm import PollinationsLlmClient, get_llm_client

    sent: dict = {}

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "stubbed pollinations"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=None):
        sent["url"] = req.full_url
        sent["body"] = json.loads(req.data.decode())
        sent["headers"] = {k.lower(): v for k, v in req.header_items()}
        return _FakeRes()

    monkeypatch.setenv("POLLINATIONS_API_KEY", "test-pollinations-key")
    monkeypatch.setenv("POLLINATIONS_CHAT_MODEL", "openai")
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    out = PollinationsLlmClient().chat("sys", "hi", 64)
    assert out == "stubbed pollinations"
    assert sent["url"] == "https://text.pollinations.ai/openai/chat/completions"
    assert sent["headers"].get("authorization") == "Bearer test-pollinations-key"
    assert sent["body"]["model"] == "openai"


def test_pollinations_routing_and_keyless(monkeypatch):
    """AI_TUTOR_PROVIDER=pollinations routes to Pollinations; empty key still calls HTTP."""
    import json
    import urllib.request

    from app.core.config import reset_settings
    from app.core.llm import get_llm_client, set_llm_client

    monkeypatch.setenv("AI_TUTOR_PROVIDER", "pollinations")
    reset_settings()
    set_llm_client(None)
    assert get_llm_client().name == "pollinations"

    class _FakeRes:
        def read(self):
            return json.dumps({"choices": [{"message": {"content": "keyless"}}]}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    calls: list = []
    sent: dict = {}

    def _fake_urlopen(req, timeout=None):
        calls.append(1)
        sent["headers"] = {k.lower(): v for k, v in req.header_items()}
        return _FakeRes()

    monkeypatch.delenv("POLLINATIONS_API_KEY", raising=False)
    reset_settings()
    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    out = get_llm_client().chat("sys", "hi", 64)
    assert out == "keyless"
    assert len(calls) == 1
    assert "authorization" not in sent["headers"]
