"""Entity routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import get_logger
from app.models import Entity
from app.schemas import EntityCreate, EntityResponse

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
