"""Entity service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.entity import Entity, EntityDocumentLink

logger = get_logger(__name__)


async def find_entity_document(db: AsyncSession, session_id: str, entity_name: str) -> int | None:
    """Check if an entity has an associated document, return doc ID or None."""
    stmt = (
        select(EntityDocumentLink.document_id)
        .join(Entity, Entity.id == EntityDocumentLink.entity_id)
        .where(Entity.session_id == session_id)
        .where(Entity.name == entity_name)
        .where(Entity.status == "active")
        .where(EntityDocumentLink.link_type == "explains")
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row


async def _find_entity(db: AsyncSession, session_id: str, name: str) -> Entity | None:
    """Find an existing entity by session and name."""
    stmt = select(Entity).where(Entity.session_id == session_id).where(Entity.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _find_link(
    db: AsyncSession, entity_id: int, document_id: int
) -> EntityDocumentLink | None:
    """Find an existing entity-document link."""
    link_stmt = (
        select(EntityDocumentLink)
        .where(EntityDocumentLink.entity_id == entity_id)
        .where(EntityDocumentLink.document_id == document_id)
        .where(EntityDocumentLink.link_type == "explains")
    )
    link_result = await db.execute(link_stmt)
    return link_result.scalar_one_or_none()


async def _ensure_entity(db: AsyncSession, session_id: str, name: str, entity_type: str) -> Entity:
    """Ensure entity exists, returning existing or newly created entity.

    Args:
        db: Database session
        session_id: Session ID
        name: Entity name
        entity_type: Type of entity (e.g., "concept")

    Returns:
        Existing or newly created Entity
    """
    entity = await _find_entity(db, session_id, name)
    if not entity:
        entity = Entity(
            name=name,
            session_id=session_id,
            entity_type=entity_type,
            status="active",
        )
        db.add(entity)
        await db.flush()
    return entity


async def _link_document(db: AsyncSession, entity_id: int, document_id: int) -> None:
    """Create entity-document link if not exists.

    Args:
        db: Database session
        entity_id: Entity ID
        document_id: Document ID
    """
    existing = await _find_link(db, entity_id, document_id)
    if not existing:
        link = EntityDocumentLink(
            entity_id=entity_id,
            document_id=document_id,
            link_type="explains",
            confidence=1.0,
        )
        db.add(link)


async def upsert_entities(
    db: AsyncSession,
    session_id: str,
    entity_names: list[str],
    document_id: int,
    entity_type: str = "concept",
) -> None:
    """Create or update entities linked to a document.

    Args:
        db: Database session
        session_id: Session ID
        entity_names: List of entity names to process (empty list is a no-op)
        document_id: Document ID to link entities to
        entity_type: Type of entity (default: "concept")

    Note:
        - Duplicate entity names are handled gracefully: existing entities are reused
        - Entity-document links are idempotent: duplicate links are not created
        - The function flushes but does NOT commit the transaction
    """
    for name in entity_names:
        entity = await _ensure_entity(db, session_id, name, entity_type)
        await _link_document(db, entity.id, document_id)

    await db.flush()
