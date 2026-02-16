"""Roadmap API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import get_logger
from app.schemas.roadmap import RoadmapCreate, RoadmapResponse, RoadmapUpdate
from app.services import roadmap_service

logger = get_logger(__name__)
router = APIRouter(prefix="/roadmaps", tags=["roadmaps"])


@router.post("", response_model=RoadmapResponse, status_code=status.HTTP_201_CREATED)
async def create_roadmap(
    data: RoadmapCreate,
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Create a new roadmap (used by Agent).

    Note: user_id is temporarily optional and defaults to 1 until auth is implemented.
    """
    roadmap_id = await roadmap_service.create_roadmap(
        db,
        session_id=session_id,
        user_id=None,  # Will default to 1 in service layer
        roadmap_data=data,
    )
    roadmap = await roadmap_service.get_roadmap(db, roadmap_id)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create roadmap",
        )
    return RoadmapResponse.model_validate(roadmap).model_dump(mode="json")


@router.get("/active/{session_id}", response_model=RoadmapResponse)
async def get_active_roadmap(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get the active roadmap for a session."""
    roadmap = await roadmap_service.get_active_roadmap(db, session_id)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active roadmap found for this session",
        )
    return RoadmapResponse.model_validate(roadmap).model_dump(mode="json")


@router.get("/session/{session_id}", response_model=list[RoadmapResponse])
async def list_session_roadmaps(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RoadmapResponse]:
    """List all roadmaps for a session (including history)."""
    roadmaps = await roadmap_service.list_session_roadmaps(db, session_id)
    return [RoadmapResponse.model_validate(r).model_dump(mode="json") for r in roadmaps]


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def get_roadmap(
    roadmap_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get a roadmap by ID."""
    roadmap = await roadmap_service.get_roadmap(db, roadmap_id)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Roadmap not found",
        )
    return RoadmapResponse.model_validate(roadmap).model_dump(mode="json")


@router.patch("/{roadmap_id}", response_model=RoadmapResponse)
async def update_roadmap(
    roadmap_id: int,
    data: RoadmapUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Update a roadmap (user edits)."""
    roadmap = await roadmap_service.update_roadmap(db, roadmap_id, data)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Roadmap not found",
        )
    return RoadmapResponse.model_validate(roadmap).model_dump(mode="json")


@router.get("/{roadmap_id}/progress")
async def get_roadmap_progress(
    roadmap_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get progress data for a roadmap.

    Returns overall progress and per-milestone progress details.
    """
    roadmap = await roadmap_service.get_roadmap(db, roadmap_id)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Roadmap not found",
        )

    progress = await roadmap_service.get_roadmap_progress(db, roadmap)
    return progress
