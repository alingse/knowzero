"""Session routes."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.core.logging import get_logger
from app.models import Document, Message, Session
from app.schemas import (
    ChatRequest,
    MessageResponse,
    MessageType,
    SessionCreate,
    SessionResponse,
)
from app.schemas.document import DocumentResponse
from app.schemas.roadmap import RoadmapResponse
from app.services import roadmap_service

logger = get_logger(__name__)
router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: SessionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Session:
    """Create a new learning session."""
    session = Session(
        id=str(uuid.uuid4()),
        title=data.title,
        description=data.description,
        learning_goal=data.learning_goal,
        user_id=1,  # TODO: Get from auth
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info("Session created", session_id=session.id, title=session.title)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Session:
    """Get session by ID."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    return session


@router.get("/{session_id}/messages", response_model=list[MessageResponse])
async def get_session_messages(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    offset: int = 0,
) -> list[Message]:
    """Get session messages in chronological order (oldest first)."""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.timestamp.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.get("/{session_id}/restore")
async def restore_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Restore session state for page refresh."""
    # Get session
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Get recent messages (include completed document_card messages for history)
    msg_result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.timestamp.desc())
        .limit(50)
    )
    messages = list(msg_result.scalars().all())

    # Clean up incomplete document_card placeholder messages (stale "generating" status)
    await db.execute(
        delete(Message)
        .where(Message.session_id == session_id)
        .where(Message.message_type == MessageType.DOCUMENT_CARD)
        .where(Message.content.like("%正在生成%"))
    )
    await db.commit()

    # Get current document
    current_doc = None
    if session.current_document_id:
        doc_result = await db.execute(
            select(Document)
            .where(Document.id == session.current_document_id)
            .options(selectinload(Document.follow_up_questions))
        )
        current_doc = doc_result.scalar_one_or_none()

    # Get all session documents
    docs_result = await db.execute(
        select(Document)
        .where(Document.session_id == session_id)
        .options(selectinload(Document.follow_up_questions))
    )
    documents = list(docs_result.scalars().all())

    # Get active roadmap (may be None if no roadmap exists for this session)
    active_roadmap = await roadmap_service.get_active_roadmap(db, session_id)

    # Convert SQLAlchemy models to dicts
    # Note: We use conditional expressions for optional fields to avoid validation errors
    return {
        "session": SessionResponse.model_validate(session).model_dump(mode="json"),
        "messages": [
            MessageResponse.model_validate(m).model_dump(mode="json") for m in messages[::-1]
        ],
        "current_document": DocumentResponse.model_validate(current_doc).model_dump(mode="json")
        if current_doc
        else None,
        "documents": [
            DocumentResponse.model_validate(d).model_dump(mode="json") for d in documents
        ],
        # Roadmap is optional - only include if one exists for this session
        "roadmap": RoadmapResponse.model_validate(active_roadmap).model_dump(mode="json")
        if active_roadmap
        else None,
        "agent_status": session.agent_status,
        "agent_started_at": session.agent_started_at.isoformat()
        if session.agent_started_at
        else None,
        "restore_position": "last_message",
    }


@router.post("/{session_id}/chat")
async def chat(
    session_id: str,
    data: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Send a chat message (placeholder for WebSocket)."""
    # TODO: Implement with WebSocket streaming
    # For now, return placeholder
    return {
        "type": "thinking",
        "message": "Chat endpoint - WebSocket implementation pending",
    }
