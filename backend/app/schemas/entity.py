"""Entity schemas."""

from datetime import datetime

from pydantic import BaseModel


class EntityCreate(BaseModel):
    """Create entity request."""

    name: str
    session_id: str
    entity_type: str | None = None  # concept, tool, library, technique
    category: str | None = None


class EntityResponse(BaseModel):
    """Entity response."""

    id: int
    name: str
    session_id: str
    entity_type: str | None
    category: str | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class EntityDocumentLinkResponse(BaseModel):
    """Entity-document link response."""

    entity_id: int
    document_id: int
    link_type: str
    context_snippet: str | None
    confidence: float | None

    class Config:
        from_attributes = True


class RelatedDocument(BaseModel):
    """Related document for entity query response."""

    id: int
    topic: str


class EntityQueryResponse(BaseModel):
    """Entity query response with details."""

    id: int
    name: str
    entity_type: str | None
    summary: str | None
    has_main_doc: bool
    main_doc_id: int | None
    related_docs: list[RelatedDocument]

    class Config:
        from_attributes = True
