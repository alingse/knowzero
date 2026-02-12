"""Document schemas."""

from datetime import datetime

from pydantic import BaseModel


class DocumentCreate(BaseModel):
    """Create document request."""

    topic: str
    content: str
    category_path: str | None = None
    parent_document_id: int | None = None


class DocumentUpdate(BaseModel):
    """Update document request."""

    content: str | None = None
    category_path: str | None = None


class DocumentResponse(BaseModel):
    """Document response."""

    id: int
    session_id: str
    topic: str
    content: str
    version: int
    category_path: str | None
    entities: list
    prerequisites: list
    related: list
    parent_document_id: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FollowUpQuestionResponse(BaseModel):
    """Follow-up question response."""

    id: int
    question: str
    question_type: str | None
    entity_tag: str | None
    is_clicked: bool

    class Config:
        from_attributes = True
