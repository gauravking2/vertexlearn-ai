"""LLM client abstraction. Anthropic is the intended provider; tests inject a mock."""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("ai-llm")

MODES = ("beginner", "intermediate", "advanced")


class LlmClient(Protocol):
    name: str

    def chat(self, system: str, user: str, max_tokens: int = 1024) -> str: ...


@dataclass
class MockLlmClient:
    name: str = "mock"

    def chat(self, system: str, user: str, max_tokens: int = 1024) -> str:
        _ = (system, max_tokens)
        first = user.split("\n")[0][:160]
        return f"Mock answer: {first}"


@dataclass
class AnthropicLlmClient:
    name: str = "anthropic"

    def chat(self, system: str, user: str, max_tokens: int = 1024) -> str:
        import time

        settings = get_settings()
        if not settings.llm_api_key:
            logger.warning("LLM_API_KEY unset — mock output (tests/dev only)")
            return MockLlmClient().chat(system, user, max_tokens)
        payload = {
            "model": settings.llm_chat_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        timeout = max(1, settings.llm_timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    settings.llm_base_url.rstrip("/") + "/v1/messages",
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "x-api-key": settings.llm_api_key, "anthropic-version": "2023-06-01"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts = [c.get("text", "") for c in body.get("content", []) if c.get("type") == "text"]
                logger.info("llm chat completed provider=anthropic model=%s latency_ms=%d", settings.llm_chat_model, latency_ms)
                return "\n".join(parts).strip() or "The provider returned an empty response."
            except urllib.error.HTTPError as exc:
                latency_ms = int((time.monotonic() - started) * 1000)
                detail = ""
                try:
                    detail = exc.read().decode()[:200]
                except Exception:
                    detail = ""
                logger.warning("llm provider http error status=%s latency_ms=%d attempt=%d", exc.code, latency_ms, attempt)
                # Retry only transient 429/5xx; fail fast on auth/model 4xx.
                if (exc.code == 429 or (exc.code is not None and exc.code >= 500)) and attempt < max_retries:
                    last_error = Exception(f"LLM provider error: {exc.code} {detail}")
                    continue
                raise Exception(f"LLM provider error: {exc.code} {detail}") from exc
            except Exception as exc:  # timeout / network
                latency_ms = int((time.monotonic() - started) * 1000)
                logger.warning("llm request failed attempt=%d latency_ms=%d err=%s", attempt, latency_ms, type(exc).__name__)
                last_error = exc if isinstance(exc, Exception) else Exception(str(exc))
                if attempt < max_retries:
                    continue
                raise
        raise last_error or Exception("LLM provider failed")


_override: LlmClient | None = None


def set_llm_client(client: LlmClient | None) -> None:
    global _override
    _override = client


def get_llm_client() -> LlmClient:
    if _override is not None:
        return _override
    if get_settings().llm_provider.lower() == "mock":
        return MockLlmClient()
    return AnthropicLlmClient()


def grounded_system_prompt(mode: str) -> str:
    depth = {
        "beginner": "Explain simply with short sentences, define jargon, and give one concrete example.",
        "advanced": "Assume strong background. Be precise, dense, and point out edge cases.",
    }.get(mode, "Assume basic familiarity. Balance intuition with key technical detail.")
    return "\n".join(
        [
            "You are the VertexLearn course tutor.",
            "Answer ONLY from the retrieved course material provided in <context>.",
            "If the context does not support the answer, say so explicitly instead of inventing an answer.",
            "Cite sources as [S1], [S2] matching the provided source list.",
            f"Explanation mode ({mode}): {depth}",
        ]
    )
