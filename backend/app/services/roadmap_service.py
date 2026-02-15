"""Roadmap service for CRUD operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.roadmap import Roadmap
from app.schemas.roadmap import RoadmapCreate, RoadmapUpdate

logger = get_logger(__name__)


async def create_roadmap(
    db: AsyncSession,
    session_id: str,
    user_id: int | None,
    roadmap_data: RoadmapCreate,
    parent_roadmap_id: int | None = None,
) -> int:
    """Create a new roadmap and deactivate previous active roadmaps.

    Args:
        db: Database session
        session_id: Session ID
        user_id: User ID
        roadmap_data: Roadmap data
        parent_roadmap_id: Parent roadmap ID for versioning

    Returns:
        Created roadmap ID

    Note: This function commits the transaction.
    """
    # Determine version (parent version + 1, or 1 if no parent)
    version = 1
    if parent_roadmap_id:
        parent = await db.get(Roadmap, parent_roadmap_id)
        if parent:
            version = parent.version + 1

    # Deactivate all active roadmaps for this session
    active_result = await db.execute(
        select(Roadmap).where(
            Roadmap.session_id == session_id,
            Roadmap.is_active,
        )
    )
    active_roadmaps = active_result.scalars().all()
    for roadmap in active_roadmaps:
        roadmap.is_active = False

    # Create new roadmap
    # Use default user_id = 1 when auth is not implemented
    roadmap = Roadmap(
        session_id=session_id,
        user_id=user_id or 1,
        goal=roadmap_data.goal,
        milestones=[m.model_dump() for m in roadmap_data.milestones],
        mermaid=roadmap_data.mermaid,
        version=version,
        parent_roadmap_id=parent_roadmap_id,
        is_active=True,
    )
    db.add(roadmap)
    await db.commit()
    await db.refresh(roadmap)

    logger.info(
        "Roadmap created",
        roadmap_id=roadmap.id,
        session_id=session_id,
        version=version,
    )
    return roadmap.id


async def get_active_roadmap(
    db: AsyncSession,
    session_id: str,
) -> Roadmap | None:
    """Get the active roadmap for a session.

    Args:
        db: Database session
        session_id: Session ID

    Returns:
        Active roadmap or None
    """
    result = await db.execute(
        select(Roadmap).where(
            Roadmap.session_id == session_id,
            Roadmap.is_active,
        )
    )
    return result.scalar_one_or_none()


async def get_roadmap(
    db: AsyncSession,
    roadmap_id: int,
) -> Roadmap | None:
    """Get a roadmap by ID.

    Args:
        db: Database session
        roadmap_id: Roadmap ID

    Returns:
        Roadmap or None
    """
    return await db.get(Roadmap, roadmap_id)


async def list_session_roadmaps(
    db: AsyncSession,
    session_id: str,
) -> list[Roadmap]:
    """List all roadmaps for a session (including history).

    Args:
        db: Database session
        session_id: Session ID

    Returns:
        List of roadmaps ordered by version descending
    """
    result = await db.execute(
        select(Roadmap).where(Roadmap.session_id == session_id).order_by(Roadmap.version.desc())
    )
    return list(result.scalars().all())


async def update_roadmap(
    db: AsyncSession,
    roadmap_id: int,
    update_data: RoadmapUpdate,
) -> Roadmap | None:
    """Update a roadmap (user edits).

    Args:
        db: Database session
        roadmap_id: Roadmap ID
        update_data: Update data

    Returns:
        Updated roadmap or None

    Note: This function commits the transaction.
    """
    roadmap = await db.get(Roadmap, roadmap_id)
    if not roadmap:
        return None

    if update_data.goal is not None:
        roadmap.goal = update_data.goal
    if update_data.milestones is not None:
        roadmap.milestones = [m.model_dump() for m in update_data.milestones]
    if update_data.mermaid is not None:
        roadmap.mermaid = update_data.mermaid

    await db.commit()
    await db.refresh(roadmap)

    logger.info("Roadmap updated", roadmap_id=roadmap_id)
    return roadmap
