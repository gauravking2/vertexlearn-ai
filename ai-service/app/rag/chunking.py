"""Transcript chunking with sentence-aware windows and character overlap.

Algorithm (documented per PRD):
1. Normalize whitespace to single spaces.
2. Split into sentences on `.`/`!`/`?` boundaries.
3. Greedily pack sentences into windows of at most CHUNK_SIZE characters.
4. Start each new window with the trailing OVERLAP characters of prior content
   so concepts spanning a boundary remain retrievable.
5. Cap at MAX_CHUNKS to bound embedding cost.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

DEFAULT_CHUNK_SIZE = 800
DEFAULT_CHUNK_OVERLAP = 200
MAX_CHUNKS = 200


@dataclass
class Chunk:
    index: int
    text: str
    char_start: int
    char_end: int


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(normalized: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", normalized) if s.strip()]


def chunk_text(text: str, size: int = DEFAULT_CHUNK_SIZE, overlap: int = DEFAULT_CHUNK_OVERLAP) -> list[Chunk]:
    normalized = normalize(text)
    if not normalized:
        return []
    sentences = split_sentences(normalized)
    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_len = 0
    cursor = 0

    def emit() -> None:
        nonlocal buf, buf_len
        if not buf:
            return
        joined = " ".join(buf)
        start = normalized.find(buf[0], max(0, cursor - len(joined) - 10))
        if start < 0:
            start = cursor
        chunks.append(Chunk(index=len(chunks), text=joined, char_start=start, char_end=start + len(joined)))
        tail = joined[-overlap:] if overlap < len(joined) else joined
        buf = [tail] if tail else []
        buf_len = len(tail)

    for sentence in sentences:
        if len(sentence) > size and not buf:
            for i in range(0, len(sentence), size - overlap):
                piece = sentence[i : i + size]
                chunks.append(Chunk(index=len(chunks), text=piece, char_start=cursor + i, char_end=cursor + i + len(piece)))
                if len(chunks) >= MAX_CHUNKS:
                    return chunks
            cursor += len(sentence) + 1
            buf, buf_len = [], 0
            continue
        add = len(sentence) + (1 if buf else 0)
        if buf_len + add > size:
            emit()
            if len(chunks) >= MAX_CHUNKS:
                return chunks
        buf.append(sentence)
        buf_len += add
    emit()
    return chunks[:MAX_CHUNKS]
