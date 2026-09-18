"""AI service routers."""

from app.routers import chat, flashcards, quiz_gen, study_plan, summarize

__all__ = ["chat", "summarize", "quiz_gen", "flashcards", "study_plan"]
