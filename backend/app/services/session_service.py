"""Session service for session state operations."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.session import Session

logger = get_logger(__name__)


async def update_current_document(
    db: AsyncSession,
    session_id: str,
    document_id: int,
) -> Session:
    """Update session's current_document_id to pin a document.

    Note: This function assumes the caller will commit the transaction
    (e.g., via get_db_session context manager).
    """
    # First get the session to ensure it exists
    session = await db.get(Session, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    # Update the current_document_id
    session.current_document_id = document_id

    # The caller is responsible for committing the transaction
    return session
