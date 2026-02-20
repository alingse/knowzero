"""Persistence coordinator for database operations.

This module coordinates database persistence operations for the agent streaming workflow.
It separates persistence concerns from WebSocket handling and event processing.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.session import Message
from app.schemas.roadmap import RoadmapCreate, RoadmapMilestoneSchema
from app.services import document_service, message_service, roadmap_service, session_service

logger = get_logger(__name__)


async def persist_user_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    content: str,
    message_type: str = "chat",
    related_document_id: int | None = None,
) -> Message:
    """Persist a user message to the database."""
    msg = await message_service.save_user_message(
        db,
        session_id=session_id,
        user_id=user_id,
        content=content,
        message_type=message_type,
        related_document_id=related_document_id,
    )
    logger.info("User message persisted", message_id=msg.id, session_id=session_id)
    return msg


async def create_placeholder_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    topic: str,
) -> Message:
    """Create a placeholder message for document generation in progress."""
    msg = await message_service.save_assistant_message(
        db,
        session_id=session_id,
        user_id=user_id,
        content="🔄 正在生成学习文档...",
        message_type="document_card",
    )
    logger.info(
        "Placeholder message created",
        message_id=msg.id,
        session_id=session_id,
        topic=topic,
    )
    return msg


async def update_placeholder_message(
    db: AsyncSession,
    *,
    message_id: int | None,
    session_id: str,
    user_id: int,
    doc_id: int,
    topic: str,
) -> None:
    """Update placeholder message with completion info or create new one."""
    doc_topic = topic or "学习文档"
    if message_id:
        # Update existing placeholder message
        await message_service.update_message_content(
            db,
            message_id=message_id,
            content=f"📚 已生成学习文档：{doc_topic}",
        )
        # Link document to the message
        await message_service.update_message_document(
            db,
            message_id=message_id,
            related_document_id=doc_id,
        )
        logger.info(
            "Placeholder message updated with completion",
            message_id=message_id,
            doc_id=doc_id,
        )
    else:
        # Fallback: create new message if no placeholder exists
        await message_service.save_assistant_message(
            db,
            session_id=session_id,
            user_id=user_id,
            content=f"📚 已生成学习文档：{doc_topic}",
            message_type="document_card",
            related_document_id=doc_id,
        )
        logger.info("Fallback message created", doc_id=doc_id, session_id=session_id)


async def persist_document(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    doc_data: dict,
    change_summary: str | None,
    input_source: str,
    current_doc_id: int | None,
    intent: dict | None,
    routing: dict | None,
) -> tuple[int, str]:
    """Persist document to database, returning doc_id and topic."""
    if doc_data.get("id"):
        # Update existing document
        db_doc = await document_service.update_document(
            db,
            document_id=doc_data["id"],
            content=doc_data["content"],
            change_summary=change_summary or "更新",
        )
    else:
        # Create new document
        parent_id = None
        if input_source == "follow_up":
            parent_id = current_doc_id

        db_doc = await document_service.create_document(
            db,
            session_id=session_id,
            user_id=user_id,
            topic=doc_data.get("topic", ""),
            content=doc_data.get("content", ""),
            category_path=doc_data.get("category_path"),
            entities=doc_data.get("entities", []),
            generation_metadata={
                "intent": intent,
                "routing": routing,
            },
            parent_document_id=parent_id,
            roadmap_id=doc_data.get("roadmap_id"),
            milestone_id=doc_data.get("milestone_id"),
        )

    doc_id = db_doc.id
    doc_topic = doc_data.get("topic", "学习文档")

    # Update session's current_document_id to pin this document
    await session_service.update_current_document(db, session_id, doc_id)

    logger.info("Document persisted", doc_id=doc_id, topic=doc_topic, session_id=session_id)
    return doc_id, doc_topic


async def persist_assistant_message(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    content: str,
    message_type: str,
    related_document_id: int | None = None,
    agent_intent: dict | None = None,
    agent_routing: dict | None = None,
) -> Message:
    """Persist an assistant message to the database."""
    msg = await message_service.save_assistant_message(
        db,
        session_id=session_id,
        user_id=user_id,
        content=content,
        message_type=message_type,
        related_document_id=related_document_id,
        agent_intent=agent_intent,
        agent_routing=agent_routing,
    )
    logger.info("Assistant message persisted", message_id=msg.id, session_id=session_id)
    return msg


def _validate_roadmap_data(roadmap_data: dict) -> tuple[str, list]:
    """Validate roadmap data and return (goal, milestones_raw).

    Args:
        roadmap_data: Raw roadmap data from agent

    Returns:
        Tuple of (goal, milestones_raw)

    Raises:
        ValueError: If roadmap_data is missing required fields or has wrong types
    """
    if not isinstance(roadmap_data, dict):
        raise ValueError(f"roadmap_data must be a dict, got {type(roadmap_data)}")

    goal = roadmap_data.get("goal")
    if not goal or not isinstance(goal, str):
        raise ValueError("roadmap_data must contain a non-empty 'goal' string field")

    milestones_raw = roadmap_data.get("milestones", [])
    if not isinstance(milestones_raw, list):
        raise ValueError("'milestones' must be a list")

    return goal, milestones_raw


def _normalize_milestones(milestones_raw: list) -> list[RoadmapMilestoneSchema]:
    """Normalize and validate milestone data.

    Args:
        milestones_raw: Raw milestone list from agent

    Returns:
        List of validated RoadmapMilestoneSchema objects
    """
    milestones = []
    for i, m in enumerate(milestones_raw):
        if not isinstance(m, dict):
            logger.warning(f"Skipping invalid milestone at index {i}: not a dict")
            continue

        # Extract fields with defaults
        title = m.get("title", "")
        description = m.get("description", "")
        topics = m.get("topics", [])

        # Validate topics is a list
        if not isinstance(topics, list):
            logger.warning(f"Milestone {i}: topics must be a list, got {type(topics)}")
            topics = []

        # Create schema with validation
        try:
            milestone_schema = RoadmapMilestoneSchema(
                id=i,
                title=str(title) if title else f"阶段 {i + 1}",
                description=str(description),
                topics=[str(t) for t in topics if t],
            )
            milestones.append(milestone_schema)
        except Exception as e:
            logger.warning(f"Failed to validate milestone {i}: {e}, using defaults")
            milestones.append(
                RoadmapMilestoneSchema(id=i, title=f"阶段 {i + 1}", description="", topics=[])
            )

    # Ensure we have at least one milestone
    if not milestones:
        logger.warning("No valid milestones found, creating default milestone")
        milestones = [
            RoadmapMilestoneSchema(
                id=0, title="开始学习", description="学习旅程的第一步", topics=[]
            )
        ]

    return milestones


async def persist_roadmap(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int | None,
    roadmap_data: dict,
) -> int:
    """Persist a roadmap to the database.

    Args:
        db: Database session
        session_id: Session ID
        user_id: User ID (optional, defaults to 1 until auth is implemented)
        roadmap_data: Roadmap data from agent (dict with 'goal', 'milestones', 'mermaid')

    Returns:
        Created roadmap ID

    Raises:
        ValueError: If roadmap_data is missing required fields
        pydantic.ValidationError: If milestones data is invalid

    Note: This function commits the transaction.
    """
    # Validate and extract data
    goal, milestones_raw = _validate_roadmap_data(roadmap_data)
    milestones = _normalize_milestones(milestones_raw)

    # Create and persist
    roadmap_create = RoadmapCreate(
        goal=goal,
        milestones=milestones,
        mermaid=roadmap_data.get("mermaid"),
    )

    roadmap_id = await roadmap_service.create_roadmap(
        db,
        session_id=session_id,
        user_id=user_id,
        roadmap_data=roadmap_create,
    )
    logger.info("Roadmap persisted", roadmap_id=roadmap_id, session_id=session_id)
    return roadmap_id
