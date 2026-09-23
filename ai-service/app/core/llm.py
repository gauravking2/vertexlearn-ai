"""LLM client abstraction. Free-tier runtime is Gemini; Anthropic kept for compat."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("ai-llm")


class ProviderNotConfigured(Exception):
    """A provider was selected but has no credential to authenticate with.

    Raised instead of returning mock text. On the hosted Tutor a missing key
    used to degrade to `Mock answer: <the user's question>`, which the backend
    stored and displayed as a grounded answer with citations attached. A
    configuration failure must be visible, never fabricated.
    """


def looks_like_placeholder(answer: object) -> bool:
    """True when provider output is really missing-credential mock text.

    Every client used to answer `Mock answer: <question>` without a key, and
    that text is indistinguishable from a grounded answer once the backend
    stores it next to citations. The chain treats it as a failed attempt.
    """
    if not isinstance(answer, str):
        return False
    if re.match(r"^\s*(mock|placeholder|dummy)\b", answer, re.IGNORECASE):
        return True
    # Degenerate moderation output. Observed live: a free model router selected
    # a content-safety classifier and returned exactly "User Safety: safe",
    # which the Tutor then stored as a grounded, cited answer.
    if re.match(r"^\s*(user|content|model)?\s*safety\s*[:=]", answer, re.IGNORECASE):
        return True
    return bool(re.match(r"^\s*(safe|ok|n/?a|none|no answer)\s*[.!]?\s*$", answer, re.IGNORECASE))


def _attempt_timeout(settings, timeout_s: float | None) -> float:
    """Bound ONE provider attempt by the caller's remaining budget."""
    budget = float(settings.llm_timeout_s or 30)
    if timeout_s is not None:
        budget = min(budget, max(1.0, float(timeout_s)))
    return max(1.0, budget)


def llm_attempt_timeout_s() -> float:
    """Per-provider attempt budget (LLM_ATTEMPT_TIMEOUT_S, default 20s)."""
    try:
        raw = float(os.getenv("LLM_ATTEMPT_TIMEOUT_S", "20"))
    except ValueError:
        raw = 20.0
    return min(max(raw, 2.0), 60.0)


def ai_answer_budget_s() -> float:
    """Total wall-clock budget for the whole provider chain (AI_ANSWER_BUDGET_S)."""
    try:
        raw = float(os.getenv("AI_ANSWER_BUDGET_S", "25"))
    except ValueError:
        raw = 25.0
    return min(max(raw, 5.0), 120.0)


MODES = ("beginner", "intermediate", "advanced")

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class LlmClient(Protocol):
    name: str

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str: ...


def _gemini_model(settings) -> str:
    # gemini-2.5-flash is retired for new API users (provider 404 names
    # gemini-3.6-flash as the replacement). Explicit LLM_CHAT_MODEL wins.
    return (settings.llm_chat_model or "").strip() or "gemini-3.6-flash"


def _openrouter_model(settings) -> str:
    # AI_TUTOR_MODEL is the runtime variable (e.g. "openrouter/free" — a real
    # OpenRouter auto-router slug that resolves to currently-available free
    # models). Blank/whitespace counts as unset (see config._str).
    return (settings.openrouter_chat_model or "").strip() or "openrouter/free"


@dataclass
class MockLlmClient:
    name: str = "mock"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        _ = (system, max_tokens)
        first = user.split("\n")[0][:160]
        return f"Mock answer: {first}"


@dataclass
class OpenRouterLlmClient:
    """AI Tutor chat generation via OpenRouter (chat ONLY — embeddings stay Gemini).

    OpenRouter is OpenAI-compatible: POST {base}/chat/completions with a
    Bearer key. Key comes strictly from AI_TUTOR_API_KEY (server-side only;
    never logged, never returned to clients). Same timeout/retry discipline
    as Gemini/Mistral. Parsing is OpenAI-shaped: choices[0].message.content.
    """

    name: str = "openrouter"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time

        settings = get_settings()
        api_key = (settings.openrouter_api_key or "").strip()
        if not api_key:
            raise ProviderNotConfigured("AI_TUTOR_API_KEY is required for the openrouter provider")
        model = _openrouter_model(settings)
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        timeout = _attempt_timeout(settings, timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        url = settings.openrouter_base_url.rstrip("/") + "/chat/completions"
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "authorization": f"Bearer {api_key}", "accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts = [
                    (choice.get("message") or {}).get("content", "")
                    for choice in body.get("choices", [])
                ]
                logger.info("llm chat completed provider=openrouter model=%s latency_ms=%d", model, latency_ms)
                return "\n".join(p for p in parts if p).strip() or "The provider returned an empty response."
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


@dataclass
class GroqLlmClient:
    """AI Tutor chat generation via Groq (OpenAI-compatible, chat ONLY).

    Key comes strictly from GROQ_API_KEY with the AI-tutor override
    (AI_TUTOR_API_KEY) as fallback (server-side only; never logged, never
    returned to clients). Embeddings never touch Groq. Same timeout/retry
    discipline as the other providers: retry transient 429/5xx only, fail
    fast on 4xx (auth/model). Parsing is OpenAI-shaped:
    choices[0].message.content.
    """

    name: str = "groq"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time

        settings = get_settings()
        api_key = (settings.groq_api_key or "").strip()
        if not api_key:
            raise ProviderNotConfigured("GROQ_API_KEY (or AI_TUTOR_API_KEY) is required for the groq provider")
        model = (settings.groq_chat_model or "llama-3.3-70b-versatile").strip()
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        timeout = _attempt_timeout(settings, timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        url = settings.groq_base_url.rstrip("/") + "/v1/chat/completions"
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "authorization": f"Bearer {api_key}", "accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts = [
                    (choice.get("message") or {}).get("content", "")
                    for choice in body.get("choices", [])
                ]
                logger.info("llm chat completed provider=groq model=%s latency_ms=%d", model, latency_ms)
                return "\n".join(p for p in parts if p).strip() or "The provider returned an empty response."
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


@dataclass
class PollinationsLlmClient:
    """AI Tutor chat generation via Pollinations (OpenAI-compatible, chat ONLY).

    Live-verified working route: the only candidate key that returns genuine
    answers. Key comes from POLLINATIONS_API_KEY (server-side only; never
    logged, never returned to clients); the endpoint also answers without a
    key, so an empty key still sends the request (no forced mock). Embeddings
    never touch Pollinations. Same timeout/retry discipline as the other
    providers: retry transient 429/5xx only, fail fast on 4xx. Generous 60s
    timeout: the free tier answers in ~15-25s. Parsing is OpenAI-shaped:
    choices[0].message.content.
    """

    name: str = "pollinations"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time

        settings = get_settings()
        api_key = (settings.pollinations_api_key or "").strip()
        model = (settings.pollinations_chat_model or "openai").strip()
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        timeout = max(1, settings.pollinations_timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        url = settings.pollinations_base_url.rstrip("/") + "/chat/completions"
        headers = {"content-type": "application/json", "accept": "application/json"}
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts = [
                    (choice.get("message") or {}).get("content", "")
                    for choice in body.get("choices", [])
                ]
                logger.info("llm chat completed provider=pollinations model=%s latency_ms=%d", model, latency_ms)
                return "\n".join(p for p in parts if p).strip() or "The provider returned an empty response."
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


@dataclass
class AnthropicLlmClient:
    name: str = "anthropic"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time

        settings = get_settings()
        if not settings.llm_api_key:
            raise ProviderNotConfigured("LLM_API_KEY is required for the anthropic provider")
        payload = {
            "model": settings.llm_chat_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        timeout = _attempt_timeout(settings, timeout_s)
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


def client_for_name(provider: str) -> LlmClient:
    if provider == "mock":
        return MockLlmClient()
    if provider == "pollinations":
        return PollinationsLlmClient()
    if provider == "groq":
        return GroqLlmClient()
    if provider == "gemini":
        return GeminiLlmClient()
    if provider == "openrouter":
        return OpenRouterLlmClient()
    if provider == "mistral":
        return MistralLlmClient()
    return AnthropicLlmClient()


def primary_provider_name() -> str:
    """AI_TUTOR_PROVIDER is the AI-tutor override; LLM_PROVIDER is the
    generic fallback used by every other LLM surface."""
    settings = get_settings()
    return (settings.ai_tutor_provider or settings.llm_provider or "").strip().lower()


# Providers tried after the configured primary. Only providers that can
# authenticate are included: a missing credential is an honest configuration
# failure, never silently fabricated text.
FALLBACK_PROVIDER_ORDER = ("gemini", "openrouter", "pollinations", "groq", "mistral", "anthropic")


def provider_has_credential(provider: str) -> bool:
    settings = get_settings()
    if provider == "pollinations":
        return True  # the free route answers without a key (live-verified)
    if provider == "gemini":
        return bool((settings.gemini_api_key or "").strip())
    if provider == "groq":
        return bool((settings.groq_api_key or "").strip())
    if provider == "openrouter":
        return bool((settings.openrouter_api_key or "").strip())
    if provider == "mistral":
        return bool((settings.mistral_api_key or "").strip())
    if provider == "anthropic":
        return bool((settings.llm_api_key or "").strip())
    return False


def get_llm_client() -> LlmClient:
    if _override is not None:
        return _override
    return client_for_name(primary_provider_name())


def get_llm_clients() -> list[LlmClient]:
    """Ordered provider chain: the configured primary first, then every other
    provider that holds a credential.

    Same reasoning as the backend's chain: one hanging or rate-limited provider
    must degrade to the next instead of failing the Tutor. Unkeyed providers are
    skipped (never mocked) so every answer returned here is genuine.
    """
    if _override is not None:
        return [_override]
    primary = primary_provider_name()
    if primary == "mock":
        return [MockLlmClient()]
    names = [primary, *(n for n in FALLBACK_PROVIDER_ORDER if n != primary)]
    chain = [client_for_name(name) for name in names if name and provider_has_credential(name)]
    # Nothing is configured: return the primary so the caller receives the
    # honest ProviderNotConfigured error instead of an empty answer.
    return chain or [client_for_name(primary)]


def chat_with_fallback(system: str, user: str, max_tokens: int = 1024) -> tuple[str, str]:
    """Answer with the first provider in the chain that succeeds.

    Returns (answer, provider_name). Each attempt is bounded by
    LLM_ATTEMPT_TIMEOUT_S and the whole chain by AI_ANSWER_BUDGET_S, so a
    hanging provider can never hold the request open. A missing credential is
    reported as ProviderNotConfigured; a real provider failure keeps its own
    error so /v1/chat/answer can map it to a safe category.
    """
    import time

    chain = get_llm_clients()
    deadline = time.monotonic() + ai_answer_budget_s()
    attempt_timeout = llm_attempt_timeout_s()
    errors: list[Exception] = []
    for client in chain:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            answer = client.chat(system, user, max_tokens, timeout_s=min(attempt_timeout, remaining))
        except Exception as exc:  # provider failure, or no credential
            errors.append(exc)
            logger.warning("llm provider failed provider=%s err=%s", client.name, type(exc).__name__)
            continue
        if isinstance(answer, str) and answer.strip():
            # Explicit mock mode (tests/dev) is the only place placeholder text
            # is legitimate; a real provider answering with it means its
            # credential is missing, which must not reach a student.
            if client.name == "mock" or not looks_like_placeholder(answer):
                return answer, client.name
        errors.append(Exception(f"{client.name} returned an empty or placeholder answer"))
    config_errors = [e for e in errors if isinstance(e, ProviderNotConfigured)]
    other_errors = [e for e in errors if not isinstance(e, ProviderNotConfigured)]
    if other_errors:
        raise other_errors[-1]
    if config_errors:
        raise config_errors[0]
    raise ProviderNotConfigured("no chat provider is configured")


@dataclass
class GeminiLlmClient:
    """Free-tier runtime provider (Google Gemini). Same interface/discipline."""

    name: str = "gemini"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time
        import urllib.parse

        settings = get_settings()
        api_key = (settings.gemini_api_key or "").strip()
        if not api_key:
            raise ProviderNotConfigured("GEMINI_API_KEY is required for the gemini provider")
        model = _gemini_model(settings)
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        }
        timeout = _attempt_timeout(settings, timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        url = GEMINI_GENERATE_URL.format(model=urllib.parse.quote(model, safe=""))
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "x-goog-api-key": api_key},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts: list[str] = []
                for cand in body.get("candidates", []):
                    for part in ((cand.get("content") or {}).get("parts") or []):
                        if isinstance(part.get("text"), str):
                            parts.append(part["text"])
                logger.info("llm chat completed provider=gemini model=%s latency_ms=%d", model, latency_ms)
                return "\n".join(parts).strip() or "The provider returned an empty response."
            except urllib.error.HTTPError as exc:
                latency_ms = int((time.monotonic() - started) * 1000)
                detail = ""
                try:
                    detail = exc.read().decode()[:200]
                except Exception:
                    detail = ""
                logger.warning("llm provider http error status=%s latency_ms=%d attempt=%d", exc.code, latency_ms, attempt)
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


@dataclass
class MistralLlmClient:
    """AI Tutor chat generation via Mistral (chat ONLY — embeddings stay Gemini).

    Key comes strictly from AI_TUTOR_API_KEY (server-side only; never logged,
    never returned to clients). Same timeout/retry discipline as Gemini.
    """

    name: str = "mistral"

    def chat(self, system: str, user: str, max_tokens: int = 1024, timeout_s: float | None = None) -> str:
        import time

        settings = get_settings()
        api_key = (settings.mistral_api_key or "").strip()
        if not api_key:
            raise ProviderNotConfigured("AI_TUTOR_API_KEY is required for the mistral provider")
        model = (settings.mistral_chat_model or "magistral-small-2506").strip()
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        timeout = _attempt_timeout(settings, timeout_s)
        max_retries = min(max(0, settings.llm_max_retries), 5)
        last_error: Exception | None = None
        url = settings.mistral_base_url.rstrip("/") + "/v1/chat/completions"
        for attempt in range(max_retries + 1):
            started = time.monotonic()
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "authorization": f"Bearer {api_key}", "accept": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=timeout) as res:
                    body = json.loads(res.read().decode())
                latency_ms = int((time.monotonic() - started) * 1000)
                parts = [
                    (choice.get("message") or {}).get("content", "")
                    for choice in body.get("choices", [])
                ]
                logger.info("llm chat completed provider=mistral model=%s latency_ms=%d", model, latency_ms)
                return "\n".join(p for p in parts if p).strip() or "The provider returned an empty response."
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
