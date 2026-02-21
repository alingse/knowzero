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
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)

    learning_goal: Mapped[str | None] = mapped_column(Text)
    target_completion_date: Mapped[datetime | None] = mapped_column(DateTime)

    current_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))
    progress: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)

    agent_status: Mapped[str] = mapped_column(String, default="idle")
    agent_started_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    role: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    message_type: Mapped[str] = mapped_column(String, default="chat")

    related_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))
    agent_intent: Mapped[dict[str, object] | None] = mapped_column(JSON)
    agent_routing: Mapped[dict[str, object] | None] = mapped_column(JSON)

    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)


class MessageGroup(Base):
    __tablename__ = "message_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    group_index: Mapped[int] = mapped_column(Integer)

    summary: Mapped[str | None] = mapped_column(Text)
    summary_model: Mapped[str | None] = mapped_column(String)
    summary_tokens: Mapped[int | None] = mapped_column(Integer)

    start_timestamp: Mapped[datetime | None] = mapped_column(DateTime)
    end_timestamp: Mapped[datetime | None] = mapped_column(DateTime)
    message_count: Mapped[int] = mapped_column(Integer, default=0)

    is_summarized: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    selected_text: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text)

    position_start: Mapped[int | None] = mapped_column(Integer)
    position_end: Mapped[int | None] = mapped_column(Integer)
    section_id: Mapped[str | None] = mapped_column(String)

    anchor_fingerprint: Mapped[str | None] = mapped_column(String)
    anchor_context_prefix: Mapped[str | None] = mapped_column(Text)
    anchor_context_suffix: Mapped[str | None] = mapped_column(Text)

    optimization_status: Mapped[str] = mapped_column(String, default="pending")
    optimization_document_version: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
