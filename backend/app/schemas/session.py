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


class MessageRole(str, Enum):
    """Who sent the message (determines avatar + alignment)."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageType(str, Enum):
    """What kind of message (determines rendering style)."""

    CHAT = "chat"  # Normal chat (includes former chitchat)
    COMMENT = "comment"  # Document annotation
    ENTITY = "entity"  # Entity click
    FOLLOW_UP = "follow_up"  # Follow-up click
    ENTRY = "entry"  # Entry input
    DOCUMENT_CARD = "document_card"  # Document generation status card (visible)
    DOCUMENT_REF = "document_ref"  # Internal document tracking (hidden)
    NAVIGATION = "navigation"  # Navigate to existing document
    NOTIFICATION = "notification"  # System notification


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
    agent_status: str = "idle"
    agent_started_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    is_archived: bool

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    """Message response."""

    id: int
    role: MessageRole
    content: str
    message_type: MessageType
    related_document_id: int | None
    timestamp: datetime

    class Config:
        from_attributes = True


class CommentData(BaseModel):
    """Comment data for optimization."""

    comment: str
    selected_text: str
    context_before: str | None = None  # Text before selection for better context
    context_after: str | None = None   # Text after selection for better context
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
