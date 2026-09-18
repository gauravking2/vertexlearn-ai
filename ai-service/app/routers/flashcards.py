"""Flashcard generation for a module."""

from fastapi import APIRouter, Header

from app.core.errors import forbidden
from app.models.schemas import Flashcard, FlashcardsRequest
from app.store import get_store

router = APIRouter()


@router.post("/v1/flashcards")
async def flashcards(body: FlashcardsRequest, x_ai_service_token: str | None = Header(default=None)) -> dict:
    from app.core.config import get_settings

    if get_settings().ai_service_token and x_ai_service_token != get_settings().ai_service_token:
        raise forbidden("Invalid AI service token")
    store = get_store()
    texts = store.texts_for_module(body.module_id, limit=10)
    cards = [Flashcard(front=f"Key concept {i+1}: what does this mean? {t[:120]}", back=t[:400]) for i, t in enumerate(texts[:8])]
    if not cards:
        cards = [Flashcard(front="What is the main idea of this module?", back="Review the indexed lecture transcripts.")]
    return {"module_id": body.module_id, "flashcards": [c.model_dump() for c in cards]}
