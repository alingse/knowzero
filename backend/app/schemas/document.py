"""Document schemas."""

from datetime import datetime

from pydantic import BaseModel


class FollowUpQuestionResponse(BaseModel):
    id: int
    question: str
    question_type: str | None
    entity_tag: str | None
    is_clicked: bool

    class Config:
        from_attributes = True


class DocumentCreate(BaseModel):
    topic: str
    content: str
    category_path: str | None = None
    parent_document_id: int | None = None


class DocumentUpdate(BaseModel):
    content: str | None = None
    category_path: str | None = None


class DocumentResponse(BaseModel):
    id: int
    session_id: str
    topic: str
    content: str
    version: int
    category_path: str | None
    entities: list[str]
    prerequisites: list[str]
    related: list[str]
    parent_document_id: int | None
    created_at: datetime
    updated_at: datetime
    follow_up_questions: list[FollowUpQuestionResponse] = []

    class Config:
        from_attributes = True
