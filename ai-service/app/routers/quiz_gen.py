"""AI quiz generation. Output is ALWAYS a draft: review/approval lives in core backend."""

from fastapi import APIRouter, Header

from app.core.errors import forbidden
from app.models.schemas import QuizGenRequest, QuizOption, QuizQuestion
from app.rag.chunking import chunk_text

router = APIRouter()


@router.post("/v1/quiz-gen")
async def quiz_gen(body: QuizGenRequest, x_ai_service_token: str | None = Header(default=None)) -> dict:
    from app.core.config import get_settings

    if get_settings().ai_service_token and x_ai_service_token != get_settings().ai_service_token:
        raise forbidden("Invalid AI service token")
    chunks = chunk_text(body.transcript)
    base = [c.text for c in chunks] or [body.transcript[:800]]
    # Cycle through available chunks to always honour the requested count,
    # even when the transcript yields fewer chunks than `count`.
    palette = [base[i % len(base)] for i in range(body.count)]
    questions: list[QuizQuestion] = []
    for i, text in enumerate(palette):
        snippet = " ".join(text.split(". ")[:2])[:220]
        kind = ["mcq", "multi_select", "short_answer"][i % 3]
        if kind == "short_answer":
            questions.append(QuizQuestion(type=kind, prompt=f"Explain in your own words: {snippet}?", points=2))
        elif kind == "multi_select":
            questions.append(
                QuizQuestion(
                    type=kind,
                    prompt=f'Which statements are supported by the lecture? "{snippet}"',
                    points=2,
                    options=[
                        QuizOption(text="Supported by the lecture material", isCorrect=True),
                        QuizOption(text="Also supported by the lecture material", isCorrect=True),
                        QuizOption(text="Contradicts the lecture material", isCorrect=False),
                    ],
                )
            )
        else:
            questions.append(
                QuizQuestion(
                    type=kind,
                    prompt=f'What is the main point of: "{snippet}"?',
                    points=1,
                    options=[
                        QuizOption(text="The stated lecture point", isCorrect=True),
                        QuizOption(text="An unrelated distractor", isCorrect=False),
                    ],
                )
            )
    return {"lecture_id": body.lecture_id, "status": "pending_review", "questions": [q.model_dump() for q in questions]}
