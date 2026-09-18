-- Phase 1 bootstrap: pgvector is the required vector-store technology
-- for the overall architecture. RAG tables (document_chunks with the
-- PRD-specified IVFFLAT index) are created in the later AI phase, not here.
CREATE EXTENSION IF NOT EXISTS vector;
