"""Document routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_db
from app.core.logging import get_logger
from app.models import Document, FollowUpQuestion
from app.schemas import (
    DocumentCreate,
    DocumentResponse,
    DocumentUpdate,
    FollowUpQuestionResponse,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: CurrentUser,
) -> Document:
    """Create a new document."""
    document = Document(
        session_id=data.session_id,
        user_id=user_id,
        topic=data.topic,
        content=data.content,
        category_path=data.category_path,
        parent_document_id=data.parent_document_id,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    logger.info("Document created", document_id=document.id, topic=document.topic)
    return document


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Document:
    """Get document by ID."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return document


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Document:
    """Update document."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if data.content is not None:
        document.content = data.content
    if data.category_path is not None:
        document.category_path = data.category_path

    await db.commit()
    await db.refresh(document)
    logger.info("Document updated", document_id=document.id)
    return document


@router.get("/{document_id}/follow_ups", response_model=list[FollowUpQuestionResponse])
async def get_follow_up_questions(
    document_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FollowUpQuestion]:
    """Get follow-up questions for a document."""
    result = await db.execute(
        select(FollowUpQuestion)
        .where(FollowUpQuestion.document_id == document_id)
        .order_by(FollowUpQuestion.created_at.desc())
    )
    return list(result.scalars().all())
