"""Rule-based + similarity recommendation helpers."""

from __future__ import annotations


def mastery_level(quiz_ratio: float | None, progress_ratio: float = 0.0) -> str:
    if quiz_ratio is None:
        return "intermediate" if progress_ratio >= 0.8 else "beginner"
    if quiz_ratio >= 0.85:
        return "advanced"
    if quiz_ratio >= 0.6:
        return "intermediate"
    return "beginner"


def build_study_plan(course_id: str, quiz_ratio: float | None, weak_topics: list[str], mastery: str) -> dict:
    focus = weak_topics or ["core concepts"]
    return {
        "courseId": course_id,
        "mastery": mastery,
        "quizRatio": quiz_ratio,
        "weeks": [
            {
                "week": week,
                "focus": focus[week % len(focus)],
                "tasks": [f"Revisit {focus[week % len(focus)]}", "Attempt one practice quiz", "Ask the AI tutor one grounded question"],
                "targetMinutes": 150 if mastery == "beginner" else 120,
            }
            for week in (1, 2, 3)
        ],
    }
