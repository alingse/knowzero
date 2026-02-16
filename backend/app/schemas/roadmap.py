"""Roadmap schemas for API requests and responses."""

from datetime import datetime

from pydantic import BaseModel


class RoadmapMilestoneSchema(BaseModel):
    """A milestone in the learning roadmap."""

    id: int
    title: str
    description: str
    topics: list[str]


class RoadmapMilestoneProgress(BaseModel):
    """Progress data for a single milestone."""

    id: int
    title: str
    description: str
    status: str  # "locked" | "active" | "completed"
    progress: float  # 0.0 to 1.0
    document_count: int
    covered_topics: list[str]


class RoadmapProgress(BaseModel):
    """Progress data for a roadmap."""

    roadmap_id: int
    goal: str
    overall_progress: float  # 0.0 to 1.0
    milestones: list[RoadmapMilestoneProgress]
    orphan_document_count: int


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
