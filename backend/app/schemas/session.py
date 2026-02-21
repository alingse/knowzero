"""Session schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class InputSource(str, Enum):
    CHAT = "chat"
    COMMENT = "comment"
    ENTITY = "entity"
    FOLLOW_UP = "follow_up"
    ENTRY = "entry"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageType(str, Enum):
    CHAT = "chat"
    COMMENT = "comment"
    ENTITY = "entity"
    FOLLOW_UP = "follow_up"
    ENTRY = "entry"
    DOCUMENT_CARD = "document_card"
    DOCUMENT_REF = "document_ref"
    NAVIGATION = "navigation"
    NOTIFICATION = "notification"


class SessionCreate(BaseModel):
    title: str
    description: str | None = None
    learning_goal: str | None = None


class SessionResponse(BaseModel):
    id: str
    title: str
    description: str | None
    learning_goal: str | None
    current_document_id: int | None
    progress: dict[str, object]
    agent_status: str = "idle"
    agent_started_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    is_archived: bool

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: int
    role: MessageRole
    content: str
    message_type: MessageType
    related_document_id: int | None
    timestamp: datetime

    class Config:
        from_attributes = True


class CommentData(BaseModel):
    comment: str
    selected_text: str
    context_before: str | None = None
    context_after: str | None = None
    position: dict[str, int] | None = None
    document_id: int
    section_id: str | None = None


class EntityData(BaseModel):
    entity_name: str
    source_doc_id: int
    entity_type: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str
    source: InputSource = InputSource.CHAT
    comment_data: CommentData | None = None
    entity_data: EntityData | None = None
    intent_hint: str | None = None


class ChatResponse(BaseModel):
    type: str
    data: dict[str, object] | None = None
    message: str | None = None
