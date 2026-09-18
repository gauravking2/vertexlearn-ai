"""Pluggable chunk store.

Production: Postgres + pgvector (VECTOR(1536), IVFFLAT) via DATABASE_URL.
Tests: an in-memory store injected with set_store().
"""

from __future__ import annotations

import json
from typing import Protocol


class ChunkStore(Protocol):
    def chunks_for_course(self, course_id: str) -> list[dict]: ...
    def texts_for_module(self, module_id: str, limit: int = 10) -> list[str]: ...


class MemoryChunkStore:
    def __init__(self):
        self._chunks: list[dict] = []

    def seed(self, chunks: list[dict]) -> None:
        self._chunks = chunks

    def chunks_for_course(self, course_id: str) -> list[dict]:
        return [c for c in self._chunks if c.get("course_id") == course_id]

    def texts_for_module(self, module_id: str, limit: int = 10) -> list[str]:
        _ = module_id
        return [c["text"] for c in self._chunks[:limit] if c.get("text")]


class PostgresChunkStore:
    """Real pgvector retrieval, always filtered by course_id (server-side isolation)."""

    def __init__(self, database_url: str):
        self.database_url = database_url

    def _connect(self):
        import psycopg2

        return psycopg2.connect(self.database_url)

    def chunks_for_course(self, course_id: str) -> list[dict]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dc.id, dc.course_id, dc.lecture_id, COALESCE(l.title, 'Lecture'),
                           dc.chunk_index, dc.chunk_text, dc.embedding::text
                    FROM document_chunks dc LEFT JOIN lectures l ON l.id = dc.lecture_id
                    WHERE dc.course_id = %s LIMIT 500
                    """,
                    (course_id,),
                )
                rows = cur.fetchall()
        finally:
            conn.close()
        return [
            {
                "id": str(r[0]),
                "course_id": str(r[1]),
                "lecture_id": str(r[2]) if r[2] else None,
                "lecture_title": r[3],
                "chunk_index": r[4],
                "text": r[5],
                "embedding": r[6] if isinstance(r[6], list) else _parse_pgvector(r[6]),
            }
            for r in rows
        ]

    def texts_for_module(self, module_id: str, limit: int = 10) -> list[str]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dc.chunk_text FROM document_chunks dc
                    JOIN lectures l ON l.id = dc.lecture_id
                    WHERE l.module_id = %s LIMIT %s
                    """,
                    (module_id, limit),
                )
                rows = cur.fetchall()
        finally:
            conn.close()
        return [r[0] for r in rows]


def _parse_pgvector(raw: object) -> list[float]:
    if isinstance(raw, list):
        return [float(v) for v in raw]
    if isinstance(raw, str):
        s = raw.strip().strip("[]")
        if not s:
            return []
        try:
            return [float(x) for x in s.split(",")]
        except ValueError:
            return []
    try:
        return json.loads(str(raw))
    except ValueError:
        return []


_store: ChunkStore = MemoryChunkStore()


def get_store() -> ChunkStore:
    global _store
    from app.core.config import get_settings

    if isinstance(_store, MemoryChunkStore) and get_settings().database_url:
        return PostgresChunkStore(get_settings().database_url)
    return _store


def set_store(store: ChunkStore) -> None:
    global _store
    _store = store
