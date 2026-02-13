"""Message service for persistence."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.session import Message

logger = get_logger(__name__)


async def save_user_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    content: str,
    message_type: str = "chat",
    related_document_id: int | None = None,
) -> Message:
    """Save a user message."""
    msg = Message(
        session_id=session_id,
        user_id=user_id,
        role="user",
        content=content,
        message_type=message_type,
        related_document_id=related_document_id,
    )
    db.add(msg)
    await db.flush()
    return msg


async def save_assistant_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    content: str,
    message_type: str = "chat",
    related_document_id: int | None = None,
    agent_intent: dict | None = None,
    agent_routing: dict | None = None,
    tokens_used: int = 0,
) -> Message:
    """Save an assistant message."""
    msg = Message(
        session_id=session_id,
        user_id=user_id,
        role="assistant",
        content=content,
        message_type=message_type,
        related_document_id=related_document_id,
        agent_intent=agent_intent,
        agent_routing=agent_routing,
        tokens_used=tokens_used,
    )
    db.add(msg)
    await db.flush()
    return msg


async def save_system_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    content: str,
    message_type: str = "notification",
    related_document_id: int | None = None,
) -> Message:
    """Save a system message (e.g., document generation completion)."""
    msg = Message(
        session_id=session_id,
        user_id=user_id,
        role="system",
        content=content,
        message_type=message_type,
        related_document_id=related_document_id,
    )
    db.add(msg)
    await db.flush()
    logger.info("System message saved", session_id=session_id, content_preview=content[:50])
    return msg


async def update_message_content(
    db: AsyncSession,
    *,
    message_id: int,
    content: str,
) -> Message | None:
    """Update the content of an existing message."""
    stmt = select(Message).where(Message.id == message_id)
    result = await db.execute(stmt)
    msg = result.scalar_one_or_none()
    if msg:
        msg.content = content
        await db.flush()
        logger.info("Message updated", message_id=message_id, content_preview=content[:50])
    return msg


async def update_message_document(
    db: AsyncSession,
    *,
    message_id: int,
    related_document_id: int,
) -> Message | None:
    """Update the related document of an existing message."""
    stmt = select(Message).where(Message.id == message_id)
    result = await db.execute(stmt)
    msg = result.scalar_one_or_none()
    if msg:
        msg.related_document_id = related_document_id
        await db.flush()
        logger.info(
            "Message document updated",
            message_id=message_id,
            document_id=related_document_id,
        )
    return msg


async def get_recent_messages(
    db: AsyncSession,
    session_id: str,
    limit: int = 20,
) -> list[Message]:
    """Get recent messages for a session."""
    stmt = (
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = list(result.scalars().all())
    messages.reverse()  # Chronological order
    return messages


async def delete_message(
    db: AsyncSession,
    *,
    message_id: int,
) -> bool:
    """Delete a message by ID."""
    stmt = select(Message).where(Message.id == message_id)
    result = await db.execute(stmt)
    msg = result.scalar_one_or_none()
    if msg:
        await db.delete(msg)
        await db.flush()
        logger.info("Message deleted", message_id=message_id)
        return True
    return False
