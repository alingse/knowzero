"""Session and message models."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Session(Base):
    """Learning session model."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)

    # Learning goals
    learning_goal: Mapped[str | None] = mapped_column(Text)
    target_completion_date: Mapped[datetime | None] = mapped_column(DateTime)

    # Current state
    current_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))
    progress: Mapped[dict] = mapped_column(JSON, default=dict)

    # Agent status tracking
    agent_status: Mapped[str] = mapped_column(String, default="idle")  # idle | running | error
    agent_started_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base):
    """Chat message model."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Content
    role: Mapped[str] = mapped_column(String)  # user, assistant, system
    content: Mapped[str] = mapped_column(Text)
    message_type: Mapped[str] = mapped_column(String, default="chat")

    # Related data
    related_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))
    agent_intent: Mapped[dict | None] = mapped_column(JSON)
    agent_routing: Mapped[dict | None] = mapped_column(JSON)

    # Metadata
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)


class MessageGroup(Base):
    """Message group for summarization."""

    __tablename__ = "message_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    group_index: Mapped[int] = mapped_column(Integer)

    # Summary
    summary: Mapped[str | None] = mapped_column(Text)
    summary_model: Mapped[str | None] = mapped_column(String)
    summary_tokens: Mapped[int | None] = mapped_column(Integer)

    # Time range
    start_timestamp: Mapped[datetime | None] = mapped_column(DateTime)
    end_timestamp: Mapped[datetime | None] = mapped_column(DateTime)
    message_count: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    is_summarized: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Comment(Base):
    """User comment on document."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Content
    selected_text: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text)

    # Position (legacy)
    position_start: Mapped[int | None] = mapped_column(Integer)
    position_end: Mapped[int | None] = mapped_column(Integer)
    section_id: Mapped[str | None] = mapped_column(String)

    # Content fingerprint anchor
    anchor_fingerprint: Mapped[str | None] = mapped_column(String)
    anchor_context_prefix: Mapped[str | None] = mapped_column(Text)
    anchor_context_suffix: Mapped[str | None] = mapped_column(Text)

    # Optimization status
    optimization_status: Mapped[str] = mapped_column(
        String, default="pending"
    )  # pending, optimized, dismissed
    optimization_document_version: Mapped[int | None] = mapped_column(Integer)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
