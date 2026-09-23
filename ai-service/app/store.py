"""Pluggable chunk store.

Production: Postgres + pgvector (VECTOR(1536), IVFFLAT) via DATABASE_URL.
Tests: an in-memory store injected with set_store().
"""

from __future__ import annotations

import json
from typing import Protocol
from urllib.parse import parse_qs, unquote, urlparse

from app.core.logging import get_logger

logger = get_logger("ai-store")


class DatabaseUnavailable(Exception):
    """The course index could not be read.

    Raised instead of letting a raw psycopg2 error escape as an uncategorised
    500. On the hosted Tutor this is exactly how a wrong DATABASE_URL presented
    itself: `relation "document_chunks" does not exist` reached the client as
    `INTERNAL_ERROR` with no way to tell a schema/DB mismatch from a provider
    outage. The libpq detail is logged server-side only (it can name a host),
    and callers map this to a bounded, user-safe failure.
    """


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
        import os

        import psycopg2

        # Hard bounds on the database hop. Without them an unreachable or
        # wedged Postgres blocks the request until the OS TCP timeout, which
        # from the caller's side looks like an answered-nothing hang (the
        # backend used to wait its whole budget on it).
        try:
            connect_timeout = int(os.getenv("AI_DB_CONNECT_TIMEOUT_S", "10"))
        except ValueError:
            connect_timeout = 10
        try:
            statement_timeout_ms = int(os.getenv("AI_DB_STATEMENT_TIMEOUT_MS", "8000"))
        except ValueError:
            statement_timeout_ms = 8000

        # libpq parameters ONLY, built from parsed URL parts.
        #
        # Root cause fixed here: psycopg2's connect() stringifies every keyword
        # into a DSN and validates it against libpq keywords, so the previous
        # `sslcontext=<SSLContext>` argument raised
        #   psycopg2.ProgrammingError: invalid dsn: invalid connection option "sslcontext"
        # on EVERY call — retrieval never returned a row, so the backend always
        # fell back to its own path. Passing the raw URL is just as fragile:
        # psycopg2 validates the URL's query parameters too, and managed hosts
        # (Supabase pooler) append non-libpq ones such as `pgbouncer=true`.
        params: dict[str, object] = {
            "connect_timeout": connect_timeout,
            "options": f"-c statement_timeout={statement_timeout_ms}",
        }
        raw = (self.database_url or "").strip()
        parsed = urlparse(raw)
        host = ""
        has_ssl = False
        if parsed.scheme in ("postgres", "postgresql") and parsed.hostname:
            host = parsed.hostname
            params["host"] = host
            if parsed.port:
                params["port"] = parsed.port
            if parsed.username:
                params["user"] = unquote(parsed.username)
            if parsed.password:
                params["password"] = unquote(parsed.password)
            if parsed.path and parsed.path != "/":
                params["dbname"] = parsed.path.lstrip("/")
            sslmode = parse_qs(parsed.query).get("sslmode", [""])[0].strip().lower()
            if sslmode:
                params["sslmode"] = sslmode
                has_ssl = True
        else:
            # Keyword-style DSN (host=... dbname=...): merge it with our libpq
            # parameters instead of re-parsing a URL.
            merged: dict[str, object] = dict(psycopg2.extensions.parse_dsn(raw)) if raw else {}
            merged.update(params)
            params = merged
            host = str(params.get("host", ""))
            has_ssl = bool(str(params.get("sslmode", "")).strip())

        override = (os.getenv("AI_DB_SSL_MODE") or "").strip().lower()
        if override:
            params["sslmode"] = override
        elif not has_ssl and host:
            # Managed Postgres: keep traffic encrypted. libpq verifies the chain
            # only when a CA bundle is actually present, which is the right
            # default for Supabase/Neon; set AI_DB_SSL_MODE to override (e.g.
            # verify-full, or disable). Localhost/in-stack stay plain TCP so
            # "server does not support SSL" can never break local dev.
            if host.lower() not in ("localhost", "127.0.0.1", "::1", "postgres", "db", "host.docker.internal"):
                params["sslmode"] = "require"
        try:
            return psycopg2.connect(**params)
        except Exception as exc:
            logger.error("chunk store connect failed err=%s", type(exc).__name__)
            raise DatabaseUnavailable("course index is unreachable") from exc

    def chunks_for_course(self, course_id: str) -> list[dict]:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                try:
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
                except Exception as exc:
                    logger.error("chunk store query failed table=document_chunks err=%s", type(exc).__name__)
                    raise DatabaseUnavailable("course index query failed") from exc
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
                try:
                    cur.execute(
                        """
                        SELECT dc.chunk_text FROM document_chunks dc
                        JOIN lectures l ON l.id = dc.lecture_id
                        WHERE l.module_id = %s LIMIT %s
                        """,
                        (module_id, limit),
                    )
                    rows = cur.fetchall()
                except Exception as exc:
                    logger.error("chunk store query failed table=lectures err=%s", type(exc).__name__)
                    raise DatabaseUnavailable("course index query failed") from exc
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
