"""Regression tests for the Postgres chunk store connection parameters.

Root cause these pin: the store used to call

    psycopg2.connect(url, sslmode="require", sslcontext=ctx)

and psycopg2 stringifies every keyword into the DSN and validates it against
libpq keywords, so it always raised

    psycopg2.ProgrammingError: invalid dsn: invalid connection option "sslcontext"

retrieval never returned a row (the endpoint answered 500), and the backend
silently fell back to its own path. Raw URL DSNs are just as fragile because
managed hosts append non-libpq parameters (e.g. `pgbouncer=true`).
"""

import os

import psycopg2
import psycopg2.extensions
import pytest

from app.store import PostgresChunkStore


class _FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, *args):
        return None

    def fetchall(self):
        return []


class _FakeConnection:
    def cursor(self):
        return _FakeCursor()

    def close(self):
        return None


@pytest.fixture()
def captured_connect(monkeypatch):
    captured: dict = {}

    def fake_connect(**kwargs):
        # make_dsn is exactly what psycopg2.connect() runs first: it rejects
        # any keyword libpq does not know, so passing here means a real
        # connection attempt would be made.
        psycopg2.extensions.make_dsn(**kwargs)
        captured.clear()
        captured.update(kwargs)
        return _FakeConnection()

    monkeypatch.setattr(psycopg2, "connect", fake_connect)
    monkeypatch.delenv("AI_DB_SSL_MODE", raising=False)
    return captured


def _connect_with(url: str, captured: dict) -> dict:
    PostgresChunkStore(url).chunks_for_course("00000000-0000-4000-8000-000000000000")
    return captured


def test_no_python_sslcontext_is_passed_and_hop_is_bounded(captured_connect):
    params = _connect_with("postgresql://u:p@127.0.0.1:5432/vertexlearn", captured_connect)
    assert "sslcontext" not in params
    assert params["host"] == "127.0.0.1"
    assert params["dbname"] == "vertexlearn"
    assert params["connect_timeout"] > 0
    assert "statement_timeout" in str(params["options"])


def test_loopback_stays_plain_tcp(captured_connect):
    params = _connect_with("postgresql://u:p@localhost:5432/vertexlearn", captured_connect)
    assert "sslmode" not in params


def test_managed_host_requires_tls_even_with_extra_query_params(captured_connect):
    params = _connect_with(
        "postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
        captured_connect,
    )
    assert params["sslmode"] == "require"
    assert params["port"] == 6543
    assert params["user"] == "postgres.abc"
    # Non-libpq query parameters never reach the DSN.
    assert "pgbouncer" not in params


def test_explicit_sslmode_is_respected(captured_connect):
    params = _connect_with("postgresql://u:p@db.example.com:5432/x?sslmode=disable", captured_connect)
    assert params["sslmode"] == "disable"


def test_keyword_dsn_form_is_supported(captured_connect):
    params = _connect_with("host=db.example.com port=5432 dbname=vertexlearn user=u password=p", captured_connect)
    assert params["host"] == "db.example.com"
    assert params["sslmode"] == "require"


def test_ssl_mode_override(captured_connect, monkeypatch):
    monkeypatch.setenv("AI_DB_SSL_MODE", "verify-full")
    params = _connect_with("postgresql://u:p@127.0.0.1:5432/vertexlearn", captured_connect)
    assert params["sslmode"] == "verify-full"


def test_percent_encoded_credentials_are_decoded(captured_connect):
    params = _connect_with("postgresql://us%40er:p%40ss@db.example.com:5432/vertexlearn", captured_connect)
    assert params["user"] == "us@er"
    assert params["password"] == "p@ss"
    os.environ.pop("AI_DB_SSL_MODE", None)
