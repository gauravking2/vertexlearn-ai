"""Shared schemas with strict validation."""

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["beginner", "intermediate", "advanced"]


class ChatAnswerRequest(BaseModel):
    course_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=1, max_length=10000)
    mode: Mode = "beginner"
    top_k: int = Field(default=5, ge=1, le=20)


class Source(BaseModel):
    ref: str
    lecture_id: str | None = None
    lecture_title: str
    chunk_index: int = 0
    score: float = 0.0


class ChatAnswerResponse(BaseModel):
    answer: str
    grounded: bool
    sources: list[Source]
    mode: Mode


class SummarizeRequest(BaseModel):
    lecture_id: str = Field(min_length=1, max_length=64)
    transcript: str = Field(min_length=1, max_length=200000)


class Summary(BaseModel):
    keyPoints: list[str]
    takeaways: list[str]


class QuizGenRequest(BaseModel):
    lecture_id: str = Field(min_length=1, max_length=64)
    transcript: str = Field(min_length=1, max_length=200000)
    count: int = Field(default=5, ge=5, le=10)


class QuizOption(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    isCorrect: bool = False


class QuizQuestion(BaseModel):
    type: Literal["mcq", "multi_select", "short_answer"]
    prompt: str = Field(min_length=1, max_length=5000)
    points: int = Field(default=1, ge=1, le=100)
    options: list[QuizOption] | None = None


class FlashcardsRequest(BaseModel):
    module_id: str = Field(min_length=1, max_length=64)
    lecture_ids: list[str] = Field(default_factory=list, max_length=20)


class Flashcard(BaseModel):
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)


class StudyPlanRequest(BaseModel):
    course_id: str = Field(min_length=1, max_length=64)
    quiz_ratio: float | None = Field(default=None, ge=0, le=1)
    weak_topics: list[str] = Field(default_factory=list, max_length=10)
    mastery: Mode = "beginner"


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int


class InternalChatRequest(BaseModel):
    system: str = Field(min_length=1)
    user: str = Field(min_length=1)
    mode: Mode = "beginner"
    maxTokens: int = Field(default=1024, ge=1, le=4000)
