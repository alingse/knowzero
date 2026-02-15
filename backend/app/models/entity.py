"""Entity models."""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Entity(Base):
    """Entity model - independent of documents."""

    __tablename__ = "entities"
    __table_args__ = (UniqueConstraint("session_id", "name", name="unique_session_entity_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)  # unique per session_id, not globally
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))

    # Classification
    entity_type: Mapped[str | None] = mapped_column(String)  # concept, tool, library, technique
    category: Mapped[str | None] = mapped_column(String)

    # Status
    status: Mapped[str] = mapped_column(String, default="active")  # active, merged, deprecated

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EntityDocumentLink(Base):
    """Many-to-many link between entities and documents."""

    __tablename__ = "entity_document_links"
    __table_args__ = (
        UniqueConstraint("entity_id", "document_id", "link_type", name="unique_entity_doc_link"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"))
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    link_type: Mapped[str] = mapped_column(String)  # explains, mentions, related

    # Context
    context_snippet: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentEntity(Base):
    """Entity mention position in document."""

    __tablename__ = "document_entities"

    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("entities.id"), primary_key=True)

    # Position for frontend highlighting
    position_start: Mapped[int | None] = mapped_column(Integer)
    position_end: Mapped[int | None] = mapped_column(Integer)
    context: Mapped[str | None] = mapped_column(Text)
