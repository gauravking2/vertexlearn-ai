"""Environment-driven configuration. Names only in .env.example; no secrets here."""

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _str(name: str, default: str) -> str:
    """Env string where blank/whitespace-only counts as unset.

    Regression fix (live verification): `LLM_BASE_URL=` (empty) used to win
    over the default and produced the relative URL `/v1/messages`
    (`ValueError: unknown url type`). Empty now falls back to the default.
    """
    value = (os.getenv(name) or "").strip()
    return value if value else default


@dataclass
class Settings:
    llm_provider: str = field(default_factory=lambda: _str("LLM_PROVIDER", "anthropic"))
    llm_api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", ""))
    llm_base_url: str = field(default_factory=lambda: _str("LLM_BASE_URL", "https://api.anthropic.com"))
    llm_chat_model: str = field(default_factory=lambda: _str("LLM_CHAT_MODEL", "claude-3-5-sonnet-latest"))
    llm_timeout_s: int = field(default_factory=lambda: _int("LLM_TIMEOUT_S", 30))
    llm_max_retries: int = field(default_factory=lambda: _int("LLM_MAX_RETRIES", 1))
    # Free-tier runtime key. STRICT: never falls back to the Anthropic key.
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    # Groq key for AI Tutor chat generation (server-side only). Embeddings
    # never touch Groq — they stay Gemini/deterministic. Accepts the
    # AI-tutor override credential as fallback so one configured chat key
    # keeps the Tutor alive without a second secret to manage.
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", "") or os.getenv("AI_TUTOR_API_KEY", ""))
    groq_chat_model: str = field(default_factory=lambda: _str("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile"))
    groq_base_url: str = field(default_factory=lambda: _str("GROQ_BASE_URL", "https://api.groq.com/openai"))
    # Pollinations key for AI Tutor chat (server-side only). Live-verified
    # working route. Embeddings never touch Pollinations.
    pollinations_api_key: str = field(default_factory=lambda: os.getenv("POLLINATIONS_API_KEY", ""))
    pollinations_chat_model: str = field(default_factory=lambda: _str("POLLINATIONS_CHAT_MODEL", "openai"))
    pollinations_base_url: str = field(default_factory=lambda: _str("POLLINATIONS_BASE_URL", "https://text.pollinations.ai/openai"))
    pollinations_timeout_s: int = field(default_factory=lambda: _int("POLLINATIONS_TIMEOUT_S", 60))
    # AI Tutor chat override: AI_TUTOR_PROVIDER selects the chat generation
    # provider (openrouter | mistral | gemini | anthropic | mock). The key is
    # AI_TUTOR_API_KEY (server-side only). Embeddings stay on Gemini regardless.
    ai_tutor_provider: str = field(default_factory=lambda: _str("AI_TUTOR_PROVIDER", ""))
    # OpenRouter chat generation (OpenAI-compatible endpoint). The runtime
    # variable is AI_TUTOR_MODEL (kept distinct from LLM_CHAT_MODEL on purpose).
    openrouter_api_key: str = field(default_factory=lambda: os.getenv("AI_TUTOR_API_KEY", ""))
    openrouter_base_url: str = field(default_factory=lambda: _str("AI_TUTOR_BASE_URL", "https://openrouter.ai/api/v1"))
    openrouter_chat_model: str = field(default_factory=lambda: _str("AI_TUTOR_MODEL", "openrouter/free"))
    # Mistral chat generation (compat provider; same AI_TUTOR_* runtime vars).
    mistral_api_key: str = field(default_factory=lambda: os.getenv("AI_TUTOR_API_KEY", ""))
    mistral_base_url: str = field(default_factory=lambda: _str("AI_TUTOR_BASE_URL", "https://api.mistral.ai"))
    mistral_chat_model: str = field(default_factory=lambda: _str("AI_TUTOR_CHAT_MODEL", ""))
    embedding_model: str = field(default_factory=lambda: _str("EMBEDDING_MODEL", "voyage-3-lite"))
    # NOTE: no LLM_API_KEY fallback here (live-verification fix). An Anthropic
    # key is not valid for the Voyage embeddings endpoint; falling back to it
    # turned the graceful deterministic path into a hard Voyage 401 that broke
    # retrieval. Empty means "no embedding credential" → deterministic.
    embedding_api_key: str = field(default_factory=lambda: os.getenv("EMBEDDING_API_KEY", ""))
    embedding_base_url: str = field(default_factory=lambda: _str("EMBEDDING_BASE_URL", "https://api.voyageai.com"))
    embedding_dim: int = field(default_factory=lambda: _int("EMBEDDING_DIM", 1536))
    rag_top_k: int = field(default_factory=lambda: _int("RAG_TOP_K", 5))
    rag_chunk_size: int = field(default_factory=lambda: _int("RAG_CHUNK_SIZE", 800))
    rag_chunk_overlap: int = field(default_factory=lambda: _int("RAG_CHUNK_OVERLAP", 200))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    ai_service_token: str = field(default_factory=lambda: os.getenv("AI_SERVICE_TOKEN", ""))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "info"))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None
