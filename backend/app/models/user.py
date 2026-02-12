"""User model."""

from datetime import datetime

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    """Anonymous user model (all fields optional)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str | None] = mapped_column(String, unique=True)
    email: Mapped[str | None] = mapped_column(String, unique=True)

    # Settings (all optional for anonymous users)
    settings: Mapped[dict | None] = mapped_column(JSON, default=None)

    # AI Provider (optional - uses system defaults if not set)
    ai_provider: Mapped[str | None] = mapped_column(String, default=None)
    ai_api_key_encrypted: Mapped[str | None] = mapped_column(String, default=None)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
