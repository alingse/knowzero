"""Entity service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.entity import Entity, EntityDocumentLink

logger = get_logger(__name__)


async def find_entity_document(
    db: AsyncSession, session_id: str, entity_name: str
) -> int | None:
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


async def upsert_entities(
    db: AsyncSession,
    session_id: str,
    entity_names: list[str],
    document_id: int,
    entity_type: str = "concept",
) -> None:
    """Create or update entities linked to a document."""
    for name in entity_names:
        # Find or create entity
        stmt = (
            select(Entity)
            .where(Entity.session_id == session_id)
            .where(Entity.name == name)
        )
        result = await db.execute(stmt)
        entity = result.scalar_one_or_none()

        if not entity:
            entity = Entity(
                name=name,
                session_id=session_id,
                entity_type=entity_type,
                status="active",
            )
            db.add(entity)
            await db.flush()

        # Create link if not exists
        link_stmt = (
            select(EntityDocumentLink)
            .where(EntityDocumentLink.entity_id == entity.id)
            .where(EntityDocumentLink.document_id == document_id)
            .where(EntityDocumentLink.link_type == "explains")
        )
        link_result = await db.execute(link_stmt)
        if not link_result.scalar_one_or_none():
            link = EntityDocumentLink(
                entity_id=entity.id,
                document_id=document_id,
                link_type="explains",
                confidence=1.0,
            )
            db.add(link)

    await db.flush()
