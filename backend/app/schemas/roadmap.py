"""Roadmap schemas for API requests and responses."""

from datetime import datetime

from pydantic import BaseModel


class RoadmapMilestoneSchema(BaseModel):
    """A milestone in the learning roadmap."""

    id: int
    title: str
    description: str
    topics: list[str]


class RoadmapCreate(BaseModel):
    """Create a new roadmap."""

    goal: str
    milestones: list[RoadmapMilestoneSchema]
    mermaid: str | None = None


class RoadmapUpdate(BaseModel):
    """Update an existing roadmap."""

    goal: str | None = None
    milestones: list[RoadmapMilestoneSchema] | None = None
    mermaid: str | None = None


class RoadmapResponse(BaseModel):
    """Roadmap response."""

    id: int
    session_id: str
    goal: str
    milestones: list[RoadmapMilestoneSchema]
    mermaid: str | None
    version: int
    parent_roadmap_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
