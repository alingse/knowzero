"""LLM provider configuration."""

from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache
def get_llm() -> ChatOpenAI:
    """Get configured LLM instance."""
    settings = get_settings()

    kwargs: dict = {
        "model": settings.OPENAI_MODEL,
        "temperature": settings.OPENAI_TEMPERATURE,
    }

    if settings.OPENAI_API_KEY:
        kwargs["api_key"] = settings.OPENAI_API_KEY
    if settings.OPENAI_API_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_API_BASE_URL

    logger.info("Initializing LLM", model=settings.OPENAI_MODEL)
    return ChatOpenAI(**kwargs)


@lru_cache
def get_fast_llm() -> ChatOpenAI:
    """Get a faster/cheaper LLM for classification tasks."""
    settings = get_settings()

    kwargs: dict = {
        "model": settings.OPENAI_MODEL,
        "temperature": 0.1,  # Low temperature for classification
        "max_tokens": 256,
    }

    if settings.OPENAI_API_KEY:
        kwargs["api_key"] = settings.OPENAI_API_KEY
    if settings.OPENAI_API_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_API_BASE_URL

    return ChatOpenAI(**kwargs)
