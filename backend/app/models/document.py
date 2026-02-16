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
    """Document model."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Content
    topic: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(String)

    # Versioning
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))

    # Classification
    category_path: Mapped[str | None] = mapped_column(String)

    # Roadmap Relations
    roadmap_id: Mapped[int | None] = mapped_column(ForeignKey("roadmaps.id"), default=None)
    milestone_id: Mapped[int | None] = mapped_column(Integer, default=None)
    orphan_reason: Mapped[str | None] = mapped_column(String, default=None)

    # Relations
    entities: Mapped[list] = mapped_column(JSON, default=list)
    prerequisites: Mapped[list] = mapped_column(JSON, default=list)
    related: Mapped[list] = mapped_column(JSON, default=list)

    # AI metadata
    generation_metadata: Mapped[dict | None] = mapped_column(JSON)

    # Relations
    follow_up_questions = relationship(
        "FollowUpQuestion", back_populates="document", cascade="all, delete-orphan"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DocumentVersion(Base):
    """Document version history."""

    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))

    # Version info
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)

    # Change info
    change_summary: Mapped[str | None] = mapped_column(Text)
    change_type: Mapped[str | None] = mapped_column(String)  # created, updated, optimized
    diff: Mapped[dict | None] = mapped_column(JSON)

    # Parent version for traceability
    parent_version_id: Mapped[int | None] = mapped_column(ForeignKey("document_versions.id"))

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FollowUpQuestion(Base):
    """Follow-up question model."""

    __tablename__ = "follow_up_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))

    # Question content
    question: Mapped[str] = mapped_column(String)
    question_type: Mapped[str | None] = mapped_column(String)  # basic, deep, practice
    entity_tag: Mapped[str | None] = mapped_column(String)

    # Status
    is_clicked: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relations
    document = relationship("Document", back_populates="follow_up_questions")

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
