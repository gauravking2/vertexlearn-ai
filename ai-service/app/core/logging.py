"""Logging foundation with request-id correlation (structured, service identity)."""

import contextvars
import logging
import os
import sys

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("ai_request_id", default="-")

SERVICE = "vertexlearn-ai-service"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.service = SERVICE
        return True


def get_logger(name: str = "ai-service") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(service)s %(name)s: %(message)s"))
        handler.addFilter(RequestIdFilter())
        logger.addHandler(handler)
        logger.setLevel(os.getenv("LOG_LEVEL", "info").upper() or "INFO")
        logger.propagate = False
    return logger
