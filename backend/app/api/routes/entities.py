"""Entity routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import get_logger
from app.services import entity_service
from app.models import Document, Entity, EntityDocumentLink
from app.schemas import EntityCreate, EntityQueryResponse, EntityResponse, RelatedDocument

logger = get_logger(__name__)
router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("", response_model=EntityResponse, status_code=status.HTTP_201_CREATED)
async def create_entity(
    data: EntityCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Entity:
    """Create a new entity."""
    entity = Entity(
        name=data.name,
        session_id="temp",  # TODO: Get from request
        entity_type=data.entity_type,
        category=data.category,
    )
    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    logger.info("Entity created", entity_id=entity.id, name=entity.name)
    return entity


# IMPORTANT: Fixed paths must come BEFORE parameterized paths
# to avoid path matching issues (e.g., "/query" being matched by "/{entity_id}")

@router.get("/query", response_model=EntityQueryResponse)
async def query_entity(
    name: str,
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EntityQueryResponse:
    """Query entity details with related documents."""
    # Find entity (case-insensitive)
    result = await db.execute(
        select(Entity)
        .where(Entity.session_id == session_id)
        .where(Entity.name.ilike(name))
    )
    entity = result.scalar_one_or_none()

    if not entity:
        # Return empty response for non-existent entities
        return EntityQueryResponse(
            id=0,
            name=name,
            entity_type=None,
            summary=None,
            has_main_doc=False,
            main_doc_id=None,
            related_docs=[],
        )

    # Check if there's a main document (link_type='explains')
    link_result = await db.execute(
        select(EntityDocumentLink).where(
            (EntityDocumentLink.entity_id == entity.id)
            & (EntityDocumentLink.link_type == "explains")
        )
    )
    main_link = link_result.scalar_one_or_none()
    has_main_doc = main_link is not None
    main_doc_id = main_link.document_id if main_link else None

    # Get related documents (all links)
    docs_result = await db.execute(
        select(Document)
        .join(EntityDocumentLink, Document.id == EntityDocumentLink.document_id)
        .where(EntityDocumentLink.entity_id == entity.id)
    )
    related_docs = [
        RelatedDocument(id=doc.id, topic=doc.topic)
        for doc in docs_result.scalars().all()
    ]

    return EntityQueryResponse(
        id=entity.id,
        name=entity.name,
        entity_type=entity.entity_type,
        summary=None,  # Could be cached/generated in future
        has_main_doc=has_main_doc,
        main_doc_id=main_doc_id,
        related_docs=related_docs,
    )


@router.get("/by-name/{name}", response_model=EntityResponse)
async def get_entity_by_name(
    name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Entity:
    """Get entity by name."""
    result = await db.execute(select(Entity).where(Entity.name == name))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entity not found",
        )
    return entity


@router.get("/session/{session_id}", response_model=list[EntityResponse])
async def get_session_entities(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Entity]:
    """Get all entities in a session."""
    result = await db.execute(select(Entity).where(Entity.session_id == session_id))
    return list(result.scalars().all())


@router.get("/{entity_id}", response_model=EntityResponse)
async def get_entity(
    entity_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Entity:
    """Get entity by ID."""
    result = await db.execute(select(Entity).where(Entity.id == entity_id))
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entity not found",
        )
    return entity
    """Query entity details with related documents."""
    # Find entity (case-insensitive)
    result = await db.execute(
        select(Entity)
        .where(Entity.session_id == session_id)
        .where(Entity.name.ilike(name))
    )
    entity = result.scalar_one_or_none()

    if not entity:
        # Return empty response for non-existent entities
        return EntityQueryResponse(
            id=0,
            name=name,
            entity_type=None,
            summary=None,
            has_main_doc=False,
            main_doc_id=None,
            related_docs=[],
        )

    # Check if there's a main document (link_type='explains')
    link_result = await db.execute(
        select(EntityDocumentLink).where(
            (EntityDocumentLink.entity_id == entity.id)
            & (EntityDocumentLink.link_type == "explains")
        )
    )
    main_link = link_result.scalar_one_or_none()
    has_main_doc = main_link is not None
    main_doc_id = main_link.document_id if main_link else None

    # Get related documents (all links)
    docs_result = await db.execute(
        select(Document)
        .join(EntityDocumentLink, Document.id == EntityDocumentLink.document_id)
        .where(EntityDocumentLink.entity_id == entity.id)
    )
    related_docs = [
        RelatedDocument(id=doc.id, topic=doc.topic)
        for doc in docs_result.scalars().all()
    ]

    return EntityQueryResponse(
        id=entity.id,
        name=entity.name,
        entity_type=entity.entity_type,
        summary=None,  # Could be cached/generated in future
        has_main_doc=has_main_doc,
        main_doc_id=main_doc_id,
        related_docs=related_docs,
    )
