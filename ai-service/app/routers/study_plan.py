"""Personalized study-plan generation from quiz-score history."""

from fastapi import APIRouter, Header

from app.core.errors import forbidden
from app.models.schemas import StudyPlanRequest
from app.recommendation import build_study_plan, mastery_level

router = APIRouter()


@router.post("/v1/study-plan")
async def study_plan(body: StudyPlanRequest, x_ai_service_token: str | None = Header(default=None)) -> dict:
    from app.core.config import get_settings

    if get_settings().ai_service_token and x_ai_service_token != get_settings().ai_service_token:
        raise forbidden("Invalid AI service token")
    mastery = body.mastery or mastery_level(body.quiz_ratio)
    return build_study_plan(body.course_id, body.quiz_ratio, body.weak_topics, mastery)
