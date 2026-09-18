"""Lesson summarization into structured key points."""

from fastapi import APIRouter, Header

from app.core.errors import forbidden
from app.core.llm import get_llm_client
from app.models.schemas import SummarizeRequest, Summary

router = APIRouter()


@router.post("/v1/summarize")
async def summarize(body: SummarizeRequest, x_ai_service_token: str | None = Header(default=None)) -> dict:
    from app.core.config import get_settings

    if get_settings().ai_service_token and x_ai_service_token != get_settings().ai_service_token:
        raise forbidden("Invalid AI service token")
    llm = get_llm_client()
    raw = llm.chat(
        "Summarize the lecture transcript into key points. Use only the transcript. Return plain bullet lines.",
        f"Transcript:\n{body.transcript[:12000]}",
        800,
    )
    lines = [line.strip("-* 0123456789.)") for line in raw.split("\n")]
    points = [line.strip() for line in lines if len(line.strip()) > 3][:8]
    if not points:
        sentences = [s.strip() for s in body.transcript.replace("\n", " ").split(". ") if len(s.strip()) > 20][:6]
        points = sentences or ["Review the lecture transcript for key concepts."]
    summary = Summary(keyPoints=points, takeaways=points[-2:])
    return {"lecture_id": body.lecture_id, "summary": summary.model_dump()}
