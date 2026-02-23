"""Session schemas."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class InputSource(StrEnum):
    CHAT = "chat"
    COMMENT = "comment"
    ENTITY = "entity"
    FOLLOW_UP = "follow_up"
    ENTRY = "entry"


class GenerationMode(StrEnum):
    """文档生成模式。"""

    STANDARD = "standard"
    ADVANCED = "advanced"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageType(StrEnum):
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


class ExistingDocument(BaseModel):
    """已有文档的简要信息。"""

    id: int
    topic: str


class MilestoneContext(BaseModel):
    """Context for milestone-based document generation."""

    milestone_id: int
    milestone_title: str
    document_index: int = Field(gt=0, le=100, description="Document index to generate (1-based)")
    existing_documents: list[ExistingDocument]
    mode: GenerationMode = GenerationMode.STANDARD


class ChatRequest(BaseModel):
    session_id: str
    message: str
    source: InputSource = InputSource.CHAT
    current_doc_id: int | None = None  # Current document ID for follow_up/entity context
    comment_data: CommentData | None = None
    entity_data: EntityData | None = None
    intent_hint: str | None = None
    milestone_context: MilestoneContext | None = None  # Context for milestone learning


class ChatResponse(BaseModel):
    type: str
    data: dict[str, object] | None = None
    message: str | None = None
