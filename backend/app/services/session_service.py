"""Session service for session state operations."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.session import Session

logger = get_logger(__name__)


async def update_agent_status(
    db: AsyncSession,
    session_id: str,
    status: str,
) -> Session:
    """Update session's agent_status and agent_started_at.

    Args:
        db: Database session
        session_id: Session ID
        status: New status ("idle", "running", or "error")

    Returns:
        Updated session object

    Note: This function assumes the caller will commit the transaction
    (e.g., via get_db_session context manager).
    """
    # First get the session to ensure it exists
    session = await db.get(Session, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    # Update the agent status
    session.agent_status = status
    if status == "running":
        session.agent_started_at = datetime.utcnow()
    elif status == "idle":
        # Clear the started time when idle
        session.agent_started_at = None

    # The caller is responsible for committing the transaction
    return session


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
