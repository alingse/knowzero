"""Persistence coordinator for database operations."""

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
    doc_topic = topic or "学习文档"
    if message_id:
        await message_service.update_message_content(
            db,
            message_id=message_id,
            content=f"📚 已生成学习文档：{doc_topic}",
        )
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
    doc_data: dict[str, object],
    change_summary: str | None,
    input_source: str,
    current_doc_id: int | None,
    intent: dict[str, object] | None,
    routing: dict[str, object] | None,
) -> tuple[int, str]:
    doc_id_val = doc_data.get("id")
    if doc_id_val and isinstance(doc_id_val, int):
        db_doc = await document_service.update_document(
            db,
            document_id=doc_id_val,
            content=str(doc_data.get("content", "")),
            change_summary=change_summary or "更新",
        )
    else:
        parent_id = None
        if input_source == "follow_up":
            parent_id = current_doc_id

        topic_val = doc_data.get("topic", "")
        content_val = doc_data.get("content", "")
        category_path_val = doc_data.get("category_path")
        entities_val = doc_data.get("entities", [])
        roadmap_id_val = doc_data.get("roadmap_id")
        milestone_id_val = doc_data.get("milestone_id")

        db_doc = await document_service.create_document(
            db,
            session_id=session_id,
            user_id=user_id,
            topic=str(topic_val) if topic_val else "",
            content=str(content_val) if content_val else "",
            category_path=str(category_path_val) if category_path_val else None,
            entities=list(entities_val) if isinstance(entities_val, list) else [],
            generation_metadata={
                "intent": intent,
                "routing": routing,
            },
            parent_document_id=parent_id,
            roadmap_id=int(roadmap_id_val) if isinstance(roadmap_id_val, int) else None,
            milestone_id=int(milestone_id_val) if isinstance(milestone_id_val, int) else None,
        )

    doc_id = db_doc.id
    doc_topic = str(doc_data.get("topic", "学习文档"))

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
    agent_intent: dict[str, object] | None = None,
    agent_routing: dict[str, object] | None = None,
) -> Message:
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


def _validate_roadmap_data(roadmap_data: dict[str, object]) -> tuple[str, list[object]]:
    if not isinstance(roadmap_data, dict):
        raise ValueError(f"roadmap_data must be a dict, got {type(roadmap_data)}")

    goal = roadmap_data.get("goal")
    if not goal or not isinstance(goal, str):
        raise ValueError("roadmap_data must contain a non-empty 'goal' string field")

    milestones_raw = roadmap_data.get("milestones", [])
    if not isinstance(milestones_raw, list):
        raise ValueError("'milestones' must be a list")

    return goal, milestones_raw


def _normalize_milestones(milestones_raw: list[object]) -> list[RoadmapMilestoneSchema]:
    milestones = []
    for i, m in enumerate(milestones_raw):
        if not isinstance(m, dict):
            logger.warning(f"Skipping invalid milestone at index {i}: not a dict")
            continue

        title = m.get("title", "")
        description = m.get("description", "")
        topics = m.get("topics", [])

        if not isinstance(topics, list):
            logger.warning(f"Milestone {i}: topics must be a list, got {type(topics)}")
            topics = []

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
    roadmap_data: dict[str, object],
) -> int:
    goal, milestones_raw = _validate_roadmap_data(roadmap_data)
    milestones = _normalize_milestones(milestones_raw)

    mermaid_val = roadmap_data.get("mermaid")
    roadmap_create = RoadmapCreate(
        goal=goal,
        milestones=milestones,
        mermaid=str(mermaid_val) if isinstance(mermaid_val, str) else None,
    )

    roadmap_id = await roadmap_service.create_roadmap(
        db,
        session_id=session_id,
        user_id=user_id,
        roadmap_data=roadmap_create,
    )
    logger.info("Roadmap persisted", roadmap_id=roadmap_id, session_id=session_id)
    return roadmap_id
