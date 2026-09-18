"""Embedding provider abstraction (PRD dim 1536). No live calls in tests."""

from __future__ import annotations

import hashlib
import math
from typing import Protocol

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("ai-embeddings")


class EmbeddingClient(Protocol):
    name: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def deterministic_embedding(text: str, dim: int) -> list[float]:
    vec = [0.0] * dim
    for token in text.lower().split():
        token = "".join(c for c in token if c.isalnum())
        if not token:
            continue
        digest = hashlib.sha256(token.encode()).digest()
        vec[int.from_bytes(digest[0:2], "big") % dim] += 1.0
        vec[int.from_bytes(digest[2:4], "big") % dim] += 0.5
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


class MockEmbeddingClient:
    name = "mock"

    def __init__(self, dim: int = 1536):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [deterministic_embedding(t, self.dim) for t in texts]


class AnthropicEmbeddingClient:
    """Real embedding provider (Voyage-compatible HTTP) with safe fallback.

    - Key only from environment (EMBEDDING_API_KEY, explicit only).
    - Configurable model via EMBEDDING_MODEL (default voyage-3-lite).
    - Timeout + one safe retry (embeddings are idempotent).
    - Dimension validated before returning; mismatches raise (callers must
      not insert wrong-dim vectors into pgvector).
    - Tests set no key and inject MockEmbeddingClient, so no live calls occur.
    """

    name = "anthropic"

    def __init__(self, dim: int = 1536):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        import json
        import time
        import urllib.error
        import urllib.request

        from app.core.config import get_settings as _settings

        settings = _settings()
        api_key = settings.embedding_api_key or ""
        if not api_key:
            logger.warning("provider embeddings not wired (no key); deterministic fallback (tests/dev)")
            return [deterministic_embedding(t, self.dim) for t in texts]
        base = (settings.embedding_base_url or "https://api.voyageai.com").rstrip("/")
        expected = self.dim or settings.embedding_dim or 1536
        last_error: Exception | None = None
        for attempt in range(2):
            started = time.monotonic()
            try:
                payload = {"model": settings.embedding_model or "voyage-3-lite", "input": texts}
                req = urllib.request.Request(
                    base + "/v1/embeddings",
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "authorization": f"Bearer {api_key}"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                vectors = [d.get("embedding", []) for d in body.get("data", [])]
                if len(vectors) != len(texts):
                    raise ValueError("Embedding provider returned mismatched count")
                for v in vectors:
                    validate_dim(v, expected)
                logger.info("embeddings completed provider=voyage count=%d latency_ms=%d", len(texts), latency_ms)
                return [[float(x) for x in v] for v in vectors]
            except urllib.error.HTTPError as exc:
                logger.warning("embedding provider http error status=%s attempt=%d", exc.code, attempt)
                last_error = Exception(f"Embedding provider error: {exc.code}")
                continue
            except Exception as exc:
                logger.warning("embedding provider failed attempt=%d err=%s", attempt, type(exc).__name__)
                last_error = exc if isinstance(exc, Exception) else Exception(str(exc))
                continue
        # Fail closed on provider errors in production, but never break tests:
        # tests inject mocks / set no key (handled above). When a key IS set
        # and the provider fails, surface the error instead of silently
        # indexing wrong vectors.
        raise last_error or Exception("Embedding provider failed")


def validate_dim(vec: list[float], expected: int) -> None:
    if not isinstance(vec, list) or len(vec) != expected:
        raise ValueError(f"Embedding dimension mismatch: got {len(vec) if isinstance(vec, list) else 'invalid'}, expected {expected}")
    if not all(isinstance(v, (int, float)) and v == v and abs(v) != float("inf") for v in vec):
        raise ValueError("Embedding contains non-finite values")


_override: EmbeddingClient | None = None


def set_embedding_client(client: EmbeddingClient | None) -> None:
    global _override
    _override = client


def get_embedding_client() -> EmbeddingClient:
    if _override is not None:
        return _override
    settings = get_settings()
    dim = settings.embedding_dim or 1536
    if (settings.llm_provider or "").lower() == "mock":
        return MockEmbeddingClient(dim)
    # Explicit routing (free-tier runtime = Gemini):
    # - model names gemini-* → Gemini provider (falls back internally w/o key)
    # - explicit Voyage credential → Voyage provider (compat)
    # - Gemini key present → Gemini provider
    # - otherwise deterministic stub (tests / LLM-only deployments)
    if ((settings.embedding_model or "").strip().lower().startswith("gemini")):
        return GeminiEmbeddingClient(dim)
    if (settings.embedding_api_key or "").strip():
        return AnthropicEmbeddingClient(dim)
    if (settings.gemini_api_key or "").strip():
        return GeminiEmbeddingClient(dim)
    return AnthropicEmbeddingClient(dim)


GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"


def _gemini_embedding_model(settings) -> str:
    return (settings.embedding_model or "").strip() or "gemini-embedding-001"


class GeminiEmbeddingClient:
    """Free-tier runtime embeddings (gemini-embedding-001, 1536 dims).

    Same interface as the Voyage path: requests outputDimensionality equal to
    the configured dim (pgvector column stays VECTOR(1536)) and validates
    every vector. Key is GEMINI_API_KEY server-side only.
    """

    name = "gemini"

    def __init__(self, dim: int = 1536):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        import json
        import time
        import urllib.error
        import urllib.parse
        import urllib.request

        from app.core.config import get_settings as _settings

        settings = _settings()
        api_key = (settings.gemini_api_key or "").strip()
        if not api_key:
            logger.warning("GEMINI_API_KEY unset — deterministic fallback (tests/dev only)")
            return [deterministic_embedding(t, self.dim) for t in texts]
        model = _gemini_embedding_model(settings)
        expected = self.dim or settings.embedding_dim or 1536
        url = GEMINI_EMBED_URL.format(model=urllib.parse.quote(model, safe=""))
        out: list[list[float]] = []
        for text in texts:
            last_error: Exception | None = None
            for attempt in range(2):
                started = time.monotonic()
                try:
                    payload = {
                        "model": f"models/{model}",
                        "content": {"parts": [{"text": text}]},
                        "outputDimensionality": expected,
                    }
                    req = urllib.request.Request(
                        url,
                        data=json.dumps(payload).encode(),
                        headers={"content-type": "application/json", "x-goog-api-key": api_key},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=30) as res:
                        body = json.loads(res.read().decode())
                    latency_ms = int((time.monotonic() - started) * 1000)
                    vec = [(v) for v in ((body.get("embedding") or {}).get("values") or [])]
                    validate_dim([float(v) for v in vec], expected)
                    logger.info("embeddings completed provider=gemini count=1 latency_ms=%d", latency_ms)
                    out.append([float(v) for v in vec])
                    last_error = None
                    break
                except urllib.error.HTTPError as exc:
                    logger.warning("embedding provider http error status=%s attempt=%d", exc.code, attempt)
                    last_error = Exception(f"Embedding provider error: {exc.code}")
                    continue
                except Exception as exc:
                    logger.warning("embedding provider failed attempt=%d err=%s", attempt, type(exc).__name__)
                    last_error = exc if isinstance(exc, Exception) else Exception(str(exc))
                    continue
            if last_error is not None:
                raise last_error
        return out


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(n))
    na = math.sqrt(sum(v * v for v in a[:n]))
    nb = math.sqrt(sum(v * v for v in b[:n]))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
