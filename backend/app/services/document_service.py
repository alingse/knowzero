"""Document service for CRUD operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.document import Document, DocumentVersion, FollowUpQuestion

logger = get_logger(__name__)


async def create_document(
    db: AsyncSession,
    *,
    session_id: str,
    user_id: int,
    topic: str,
    content: str,
    category_path: str | None = None,
    entities: list | None = None,
    generation_metadata: dict | None = None,
    parent_document_id: int | None = None,
) -> Document:
    """Create a new document and its initial version."""
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
    )
    db.add(doc)
    await db.flush()

    # Create initial version record
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
    """Update a document and create a new version."""
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
        parent_version_id=None,  # Could track previous version
    )
    db.add(version)
    await db.flush()

    logger.info("Document updated", doc_id=doc.id, version=doc.version)
    return doc


async def get_document(db: AsyncSession, document_id: int) -> Document | None:
    """Get a document by ID."""
    return await db.get(Document, document_id)


async def find_document_by_topic(
    db: AsyncSession, session_id: str, topic: str
) -> Document | None:
    """Find a document by topic within a session."""
    stmt = (
        select(Document)
        .where(Document.session_id == session_id)
        .where(Document.topic.ilike(f"%{topic}%"))
        .order_by(Document.updated_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_session_documents(
    db: AsyncSession, session_id: str
) -> list[Document]:
    """List all documents in a session."""
    stmt = (
        select(Document)
        .where(Document.session_id == session_id)
        .order_by(Document.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_document_entities(
    db: AsyncSession,
    *,
    document_id: int,
    entities: list[str],
) -> Document | None:
    """Update a document's entities list (used by background tasks)."""
    doc = await db.get(Document, document_id)
    if not doc:
        logger.warning("Document not found for entity update", doc_id=document_id)
        return None
    doc.entities = entities
    await db.flush()
    logger.info("Document entities updated", doc_id=document_id, count=len(entities))
    return doc


async def save_follow_ups(
    db: AsyncSession,
    document_id: int,
    questions: list[dict],
) -> list[FollowUpQuestion]:
    """Save follow-up questions for a document."""
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
