"""Application configuration."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    APP_NAME: str = "KnowZero"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENV: str = "development"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./knowzero.db"
    DATABASE_ECHO: bool = False

    # AI
    OPENAI_API_KEY: str | None = None
    OPENAI_API_BASE_URL: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TEMPERATURE: float = 0.7

    # LangGraph
    CHECKPOINT_DIR: Path = Path("./checkpoints")

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.ENV == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.ENV == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
