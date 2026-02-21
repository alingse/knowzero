"""Document models."""

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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    topic: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(String)

    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))

    category_path: Mapped[str | None] = mapped_column(String)

    roadmap_id: Mapped[int | None] = mapped_column(ForeignKey("roadmaps.id"), default=None)
    milestone_id: Mapped[int | None] = mapped_column(Integer, default=None)
    orphan_reason: Mapped[str | None] = mapped_column(String, default=None)

    entities: Mapped[list[str]] = mapped_column(JSON, default=list)
    prerequisites: Mapped[list[str]] = mapped_column(JSON, default=list)
    related: Mapped[list[str]] = mapped_column(JSON, default=list)

    generation_metadata: Mapped[dict[str, object] | None] = mapped_column(JSON)

    follow_up_questions = relationship(
        "FollowUpQuestion", back_populates="document", cascade="all, delete-orphan"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))

    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)

    change_summary: Mapped[str | None] = mapped_column(Text)
    change_type: Mapped[str | None] = mapped_column(String)
    diff: Mapped[dict[str, object] | None] = mapped_column(JSON)

    parent_version_id: Mapped[int | None] = mapped_column(ForeignKey("document_versions.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FollowUpQuestion(Base):
    __tablename__ = "follow_up_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))

    question: Mapped[str] = mapped_column(String)
    question_type: Mapped[str | None] = mapped_column(String)
    entity_tag: Mapped[str | None] = mapped_column(String)

    is_clicked: Mapped[bool] = mapped_column(Boolean, default=False)

    document = relationship("Document", back_populates="follow_up_questions")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
