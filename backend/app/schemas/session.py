"""Session schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class InputSource(str, Enum):
    """Input source types."""

    CHAT = "chat"
    COMMENT = "comment"
    ENTITY = "entity"
    FOLLOW_UP = "follow_up"
    ENTRY = "entry"


class SessionCreate(BaseModel):
    """Create session request."""

    title: str
    description: str | None = None
    learning_goal: str | None = None


class SessionResponse(BaseModel):
    """Session response."""

    id: str
    title: str
    description: str | None
    learning_goal: str | None
    current_document_id: int | None
    progress: dict
    created_at: datetime
    updated_at: datetime
    is_archived: bool

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    """Message response."""

    id: int
    role: str
    content: str
    message_type: str
    related_document_id: int | None
    timestamp: datetime

    class Config:
        from_attributes = True


class CommentData(BaseModel):
    """Comment data for optimization."""

    comment: str
    selected_text: str
    position: dict | None = None  # {start, end}
    document_id: int
    section_id: str | None = None


class EntityData(BaseModel):
    """Entity click data."""

    entity_name: str
    source_doc_id: int
    entity_type: str | None = None


class ChatRequest(BaseModel):
    """Chat request."""

    session_id: str
    message: str
    source: InputSource = InputSource.CHAT
    comment_data: CommentData | None = None
    entity_data: EntityData | None = None
    intent_hint: str | None = None


class ChatResponse(BaseModel):
    """Chat response."""

    type: str  # thinking, content, document, follow_ups, error, done
    data: dict | None = None
    message: str | None = None
