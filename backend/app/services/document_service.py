"""Document service for CRUD operations."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.models.document import Document, DocumentVersion, FollowUpQuestion
from app.models.session import Session
from app.schemas.document import SessionCardResponse

logger = get_logger(__name__)


async def create_document(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    topic: str,
    content: str,
    category_path: str | None = None,
    entities: list[str] | None = None,
    generation_metadata: dict[str, object] | None = None,
    parent_document_id: int | None = None,
    roadmap_id: int | None = None,
    milestone_id: int | None = None,
) -> Document:
    doc = Document(
        session_id=session_id,
        user_id=user_id,
        topic=topic,
        content=content,
        category_path=category_path,
        entities=entities or [],
        version=1,
        generation_metadata=generation_metadata,
        parent_document_id=parent_document_id,
        roadmap_id=roadmap_id,
        milestone_id=milestone_id,
    )
    db.add(doc)
    await db.flush()

    version = DocumentVersion(
        document_id=doc.id,
        version=1,
        content=content,
        change_summary="初始创建",
        change_type="created",
    )
    db.add(version)
    await db.flush()

    logger.info("Document created", doc_id=doc.id, topic=topic)
    return doc


async def update_document(
    db: AsyncSession,
    *,
    document_id: int,
    content: str,
    change_summary: str,
    change_type: str = "updated",
) -> Document:
    doc = await db.get(Document, document_id)
    if not doc:
        raise ValueError(f"Document {document_id} not found")

    old_version = doc.version
    doc.content = content
    doc.version = old_version + 1

    version = DocumentVersion(
        document_id=doc.id,
        version=doc.version,
        content=content,
        change_summary=change_summary,
        change_type=change_type,
        parent_version_id=None,
    )
    db.add(version)
    await db.flush()

    logger.info("Document updated", doc_id=doc.id, version=doc.version)
    return doc


async def get_document(db: AsyncSession, document_id: int) -> Document | None:
    return await db.get(Document, document_id)


async def find_document_by_topic(db: AsyncSession, session_id: str, topic: str) -> Document | None:
    stmt = (
        select(Document)
        .where(Document.session_id == session_id)
        .where(Document.topic.ilike(f"%{topic}%"))
        .order_by(Document.updated_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_session_documents(db: AsyncSession, session_id: str) -> list[Document]:
    stmt = (
        select(Document)
        .where(Document.session_id == session_id)
        .order_by(Document.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_document_entities(
    db: AsyncSession, *, document_id: int, entities: list[str]
) -> Document | None:
    doc = await db.get(Document, document_id)
    if not doc:
        logger.warning("Document not found for entity update", doc_id=document_id)
        return None
    doc.entities = entities
    await db.flush()
    logger.info("Document entities updated", doc_id=document_id, count=len(entities))
    return doc


async def save_follow_ups(
    db: AsyncSession, document_id: int, questions: list[dict[str, object]]
) -> list[FollowUpQuestion]:
    records = []
    for q in questions:
        fq = FollowUpQuestion(
            document_id=document_id,
            question=q.get("question", ""),
            question_type=q.get("type"),
            entity_tag=q.get("entity_tag"),
        )
        db.add(fq)
        records.append(fq)
    await db.flush()
    return records


async def update_document_roadmap(
    db: AsyncSession,
    *,
    document_id: int,
    roadmap_id: int | None,
    milestone_id: int | None,
) -> Document | None:
    doc = await db.get(Document, document_id)
    if not doc:
        logger.warning("Document not found for roadmap update", doc_id=document_id)
        return None
    doc.roadmap_id = roadmap_id
    doc.milestone_id = milestone_id
    await db.flush()
    logger.info(
        "Document roadmap updated",
        doc_id=document_id,
        roadmap_id=roadmap_id,
        milestone_id=milestone_id,
    )
    return doc


async def get_random_documents(
    db: AsyncSession,
    *,
    limit: int = 8,
    user_id: int = 1,
) -> list[Document]:
    """Get random documents for the homepage grid display."""
    stmt = (
        select(Document)
        .options(selectinload(Document.follow_up_questions))
        .where(Document.user_id == user_id)
        .order_by(func.random())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_random_session_cards(
    db: AsyncSession,
    *,
    limit: int = 8,
    user_id: int = 1,
) -> list[SessionCardResponse]:
    """Get random session cards for homepage display.

    Each card represents a unique session with:
    - session_id: unique session identifier
    - session_title: the session's title
    - document_id: first document's ID
    - document_topic: first document's topic
    - content: first document's content
    - created_at: first document's creation time

    Args:
        db: Database session
        limit: Maximum number of cards to return
        user_id: User ID to filter sessions

    Returns:
        List of SessionCardResponse objects
    """

    # Subquery: find first document for each session
    first_doc_subquery = (
        select(Document.session_id, func.min(Document.id).label("first_doc_id"))
        .where(Document.user_id == user_id)
        .group_by(Document.session_id)
        .subquery()
    )

    # Main query: join with Session and filter by first documents
    stmt = (
        select(
            Document.id.label("document_id"),
            Document.session_id,
            Document.topic.label("document_topic"),
            Document.content,
            Document.created_at,
            Session.title.label("session_title"),
        )
        .join(Session, Document.session_id == Session.id)
        .join(first_doc_subquery, Document.id == first_doc_subquery.c.first_doc_id)
        .order_by(func.random())
        .limit(limit)
    )

    result = await db.execute(stmt)

    # Convert Row objects to SessionCardResponse
    cards = [
        SessionCardResponse(
            session_id=row.session_id,
            session_title=row.session_title,
            document_id=row.document_id,
            document_topic=row.document_topic,
            content=row.content,
            created_at=row.created_at,
        )
        for row in result.all()
    ]

    logger.info("Retrieved random session cards", count=len(cards), limit=limit)
    return cards
