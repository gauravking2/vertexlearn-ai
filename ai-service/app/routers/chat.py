"""Grounded chat answering over course-scoped chunks (no global search)."""

import re
import time

from fastapi import APIRouter, Header

from app.core.errors import ApiError, forbidden
from app.core.llm import get_llm_client, grounded_system_prompt
from app.core.logging import get_logger
from app.models.schemas import ChatAnswerRequest, ChatAnswerResponse, EmbedRequest, EmbedResponse, InternalChatRequest, Source
from app.rag.embeddings import get_embedding_client
from app.rag.retriever import StoredChunk, assert_no_cross_course, has_support, parse_embedding, retrieve_course_chunks
from app.store import get_store

router = APIRouter()
NO_CONTEXT = "I could not find this in the course material."

logger = get_logger("ai-chat")


def _check_token(token: str | None, expected: str) -> None:
    if expected and token != expected:
        raise forbidden("Invalid AI service token")


def _llm_provider_api_error(exc: Exception) -> ApiError:
    """Map an LLM provider failure to a coarse, safe category.

    Never leaks provider bodies, headers, URLs, or key material — the backend
    only receives the status/code and shows its own user-safe message.
    """
    text = str(exc)
    match = re.search(r"LLM provider error: (\d{3})", text)
    status = int(match.group(1)) if match else None
    lowered = text.lower()
    if status == 429 or "rate limit" in lowered:
        return ApiError(429, "RATE_LIMITED", "AI Tutor is temporarily rate-limited.")
    if status in (401, 403) or "api key" in lowered or "unauthorized" in lowered or "not configured" in lowered:
        return ApiError(503, "AI_NOT_CONFIGURED", "AI Tutor configuration is invalid.")
    if status == 400 or "invalid model" in lowered or "unsupported parameter" in lowered:
        return ApiError(400, "AI_BAD_REQUEST", "The AI Tutor request could not be processed.")
    if "timed out" in lowered or "timeout" in lowered:
        return ApiError(504, "AI_TIMEOUT", "AI Tutor took too long to respond.")
    return ApiError(503, "PROVIDER_UNAVAILABLE", "AI Tutor is temporarily unavailable.")


@router.post("/v1/chat/answer", response_model=ChatAnswerResponse)
async def chat_answer(body: ChatAnswerRequest, x_ai_service_token: str | None = Header(default=None)):
    from app.core.config import get_settings

    _check_token(x_ai_service_token, get_settings().ai_service_token)
    store = get_store()
    rows = store.chunks_for_course(body.course_id)
    stored = [
        StoredChunk(
            id=r["id"],
            course_id=r["course_id"],
            lecture_id=r.get("lecture_id"),
            lecture_title=r.get("lecture_title", "Lecture"),
            chunk_index=r.get("chunk_index", 0),
            text=r["text"],
            embedding=parse_embedding(r.get("embedding"), get_settings().embedding_dim),
        )
        for r in rows
    ]
    results = retrieve_course_chunks(body.course_id, body.question, stored, body.top_k)
    assert_no_cross_course(results, body.course_id)
    # Only a truly empty retrieval exits early. Low cosine scores (common
    # with mixed embedding providers) are advisory: the grounded LLM prompt
    # (answer ONLY from <context>) is the guardrail, not a silent skip.
    if not results:
        return ChatAnswerResponse(answer=f"{NO_CONTEXT} The retrieved lectures do not cover your question.", grounded=False, sources=[], mode=body.mode)
    sources = [
        Source(ref=f"S{i+1}", lecture_id=r.chunk.lecture_id, lecture_title=r.chunk.lecture_title, chunk_index=r.chunk.chunk_index, score=r.score)
        for i, r in enumerate(results)
    ]
    # Threshold is advisory only: low cosine scores (common with mixed
    # embedding providers) must NEVER skip the grounded provider call, or the
    # Tutor goes silent with zero diagnostics. The grounded system prompt
    # (answer ONLY from <context>, say so when unsupported) is the guardrail.
    grounded_flag = has_support(results)
    context = "\n\n".join(f"[S{i+1}] ({r.chunk.lecture_title}) {r.chunk.text}" for i, r in enumerate(results))
    llm = get_llm_client()
    started = time.monotonic()
    try:
        answer = llm.chat(grounded_system_prompt(body.mode), f"Question: {body.question}\n\n<context>\n{context}\n</context>")
    except Exception as exc:
        logger.error("llm chat failed course_id=%s err=%s", body.course_id, type(exc).__name__)
        raise _llm_provider_api_error(exc) from exc
    latency_ms = int((time.monotonic() - started) * 1000)
    logger.info("chat answered course_id=%s grounded=%s sources=%d latency_ms=%d", body.course_id, grounded_flag, len(sources), latency_ms)
    return ChatAnswerResponse(answer=answer, grounded=grounded_flag, sources=sources, mode=body.mode)


@router.post("/internal/embed", response_model=EmbedResponse)
async def internal_embed(body: EmbedRequest, x_ai_service_token: str | None = Header(default=None)):
    from app.core.config import get_settings

    _check_token(x_ai_service_token, get_settings().ai_service_token)
    client = get_embedding_client()
    vectors = client.embed(body.texts)
    return EmbedResponse(embeddings=vectors, dim=client.dim)


@router.post("/internal/chat")
async def internal_chat(body: InternalChatRequest, x_ai_service_token: str | None = Header(default=None)):
    from app.core.config import get_settings

    _check_token(x_ai_service_token, get_settings().ai_service_token)
    llm = get_llm_client()
    try:
        answer = llm.chat(body.system, body.user, body.maxTokens)
    except Exception as exc:
        logger.error("internal llm chat failed err=%s", type(exc).__name__)
        raise _llm_provider_api_error(exc) from exc
    return {"answer": answer, "grounded": True}
