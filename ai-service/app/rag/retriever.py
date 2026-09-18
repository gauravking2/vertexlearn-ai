"""Course-scoped retrieval. The course_id filter is mandatory (never global search)."""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.errors import bad_request
from app.rag.embeddings import cosine, get_embedding_client


@dataclass
class StoredChunk:
    id: str
    course_id: str
    lecture_id: str | None
    lecture_title: str
    chunk_index: int
    text: str
    embedding: list[float]


@dataclass
class ScoredChunk:
    chunk: StoredChunk
    score: float


def parse_embedding(raw: object, dim: int) -> list[float]:
    if isinstance(raw, list):
        return [float(v) for v in raw[:dim]]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [float(v) for v in parsed[:dim]]
        except ValueError:
            return []
    return []


def retrieve_course_chunks(course_id: str, query: str, rows: list[StoredChunk], top_k: int = 5) -> list[ScoredChunk]:
    """Pure retrieval over course-filtered rows.

    Callers MUST pre-filter `rows` by course_id (server-side). As a defense in
    depth, any row whose course_id differs is dropped here too.
    """
    if not course_id:
        raise bad_request("course_id is required")
    scoped = [r for r in rows if r.course_id == course_id]
    if not scoped:
        return []
    client = get_embedding_client()
    query_vec = client.embed([query])[0]
    scored = [ScoredChunk(chunk=r, score=cosine(query_vec, r.embedding)) for r in scoped]
    scored.sort(key=lambda s: s.score, reverse=True)
    return scored[: max(1, min(top_k, 20))]


def has_support(results: list[ScoredChunk], threshold: float = 0.12) -> bool:
    return bool(results) and results[0].score >= threshold


def assert_no_cross_course(results: list[ScoredChunk], course_id: str) -> None:
    for r in results:
        if r.chunk.course_id != course_id:
            raise AssertionError("course isolation violated: foreign chunk retrieved")
