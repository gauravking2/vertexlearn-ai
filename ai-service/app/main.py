"""FastAPI application factory for the VertexLearn AI service."""

import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.llm import get_llm_clients, primary_provider_name
from app.core.logging import SERVICE, get_logger, request_id_var
from app.routers import chat, flashcards, quiz_gen, study_plan, summarize

logger = get_logger("ai-service")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="VertexLearn AI Service", version="0.3.0")

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        import time

        request_id = request.headers.get("x-request-id", "") or f"ai-{uuid.uuid4().hex[:12]}"
        token = request_id_var.set(request_id)
        started = time.monotonic()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        latency_ms = int((time.monotonic() - started) * 1000)
        response.headers["x-request-id"] = request_id
        logger.info("%s %s status=%s latency_ms=%d", request.method, request.url.path, response.status_code, latency_ms)
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})

    @app.exception_handler(Exception)
    async def unhandled_handler(_request: Request, exc: Exception):
        logger.error("unhandled ai-service error: %s", exc)
        return JSONResponse(status_code=500, content={"error": "INTERNAL_ERROR", "message": "Internal server error"})

    @app.get("/health")
    async def health():
        # Report the provider that actually answers chat, plus the ordered
        # chain. The previous payload echoed LLM_PROVIDER only, so the hosted
        # deployment reported "gemini" as healthy while AI_TUTOR_PROVIDER sent
        # every chat to an unkeyed provider that answered with mock text.
        return {
            "status": "ok",
            "service": SERVICE,
            "provider": primary_provider_name(),
            "chatChain": [client.name for client in get_llm_clients()],
        }

    @app.get("/ready")
    async def ready():
        return {"status": "ready", "service": SERVICE, "checks": {"config": "ok", "db": "external (core backend owns Postgres)"}}

    app.include_router(chat.router)
    app.include_router(summarize.router)
    app.include_router(quiz_gen.router)
    app.include_router(flashcards.router)
    app.include_router(study_plan.router)
    return app


app = create_app()
