"""Roadmap service for CRUD operations and progress tracking."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.document import Document
from app.models.roadmap import Roadmap
from app.schemas.roadmap import RoadmapCreate, RoadmapUpdate

logger = get_logger(__name__)


# ============================================================================
# Progress Calculation
# ============================================================================


def calc_milestone_progress(milestone: dict, documents: list[Document]) -> float:
    """Calculate progress based on document count.

    Target: 4 documents = 100% (can exceed for mastery depth).

    Returns:
        Progress ratio (0.0 to 2.0+).
        0 docs = 0%, 1 doc = 25%, 2 docs = 50%, 3 docs = 75%, 4 docs = 100%
    """
    target_docs = 4
    doc_count = len(documents)
    return min(doc_count / target_docs, 2.0)  # Cap at 200% for display


def calc_milestone_status(milestone: dict, progress: float) -> str:
    """Calculate milestone status based on document count.

    No sequential dependency - milestones can be learned in any order.

    Returns: "locked" | "active" | "completed"
    """
    if progress >= 1.0:
        return "completed"
    elif progress > 0:
        return "active"
    else:
        return "locked"  # No documents yet


async def get_roadmap_progress(
    db: AsyncSession,
    roadmap: Roadmap,
) -> dict:
    """Calculate progress for all milestones in a roadmap.

    Args:
        db: Database session
        roadmap: Roadmap model

    Returns:
        Progress data with overall progress and milestone details
    """
    # Get all documents associated with this roadmap
    result = await db.execute(
        select(Document).where(
            Document.roadmap_id == roadmap.id,
        )
    )
    all_documents = result.scalars().all()

    # Group documents by milestone_id
    milestone_documents: dict[int, list[Document]] = {}
    orphan_documents: list[Document] = []

    for doc in all_documents:
        milestone_id = doc.milestone_id
        if milestone_id is None:
            orphan_documents.append(doc)
        else:
            if milestone_id not in milestone_documents:
                milestone_documents[milestone_id] = []
            milestone_documents[milestone_id].append(doc)

    # Calculate progress for each milestone (no sequential dependency)
    milestones_data = []
    total_progress = 0.0

    for milestone in roadmap.milestones:
        milestone_id = milestone.get("id")
        documents = milestone_documents.get(milestone_id, [])

        progress = calc_milestone_progress(milestone, documents)
        status = calc_milestone_status(milestone, progress)

        # Collect covered topics
        covered_topics = set()
        for doc in documents:
            covered_topics.update(doc.entities or [])

        milestones_data.append(
            {
                "id": milestone_id,
                "title": milestone.get("title"),
                "description": milestone.get("description"),
                "status": status,
                "progress": progress,
                "document_count": len(documents),
                "covered_topics": list(covered_topics),
            }
        )

        total_progress += progress

    # Calculate overall progress
    num_milestones = len(roadmap.milestones)
    overall_progress = total_progress / num_milestones if num_milestones > 0 else 0.0

    return {
        "roadmap_id": roadmap.id,
        "goal": roadmap.goal,
        "overall_progress": overall_progress,
        "milestones": milestones_data,
        "orphan_document_count": len(orphan_documents),
    }


# ============================================================================
# CRUD Operations
# ============================================================================


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
