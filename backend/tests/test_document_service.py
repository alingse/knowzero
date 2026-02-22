"""Tests for document_service."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Document, Session, User
from app.services import document_service


def _sid() -> str:
    return str(uuid.uuid4())


@pytest_asyncio.fixture
async def seed_user(test_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(username=f"test-{uuid.uuid4().hex[:8]}", email=f"{uuid.uuid4().hex[:8]}@test.com")
    test_session.add(user)
    await test_session.flush()
    return user


@pytest_asyncio.fixture
async def seed_session(test_session: AsyncSession, seed_user: User) -> Session:
    """Create a test session."""
    sess = Session(id=_sid(), user_id=seed_user.id, title="Test Session")
    test_session.add(sess)
    await test_session.flush()
    return sess


@pytest.mark.asyncio
async def test_create_and_get_document(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    doc = await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Python Basics",
        content="Hello world",
    )
    assert doc.id is not None
    assert doc.topic == "Python Basics"
    assert doc.version == 1

    fetched = await document_service.get_document(test_session, doc.id)
    assert fetched is not None
    assert fetched.id == doc.id


@pytest.mark.asyncio
async def test_update_document(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    doc = await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Update Test",
        content="v1",
    )
    updated = await document_service.update_document(
        test_session,
        document_id=doc.id,
        content="v2",
        change_summary="revised",
    )
    assert updated.content == "v2"
    assert updated.version == 2


@pytest.mark.asyncio
async def test_update_document_not_found(test_session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="not found"):
        await document_service.update_document(
            test_session, document_id=999999, content="x", change_summary="x"
        )


@pytest.mark.asyncio
async def test_find_document_by_topic(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Machine Learning Intro",
        content="ML content",
    )
    found = await document_service.find_document_by_topic(
        test_session, seed_session.id, "machine learning"
    )
    assert found is not None
    assert "Machine Learning" in found.topic

    not_found = await document_service.find_document_by_topic(
        test_session, seed_session.id, "nonexistent-xyz"
    )
    assert not_found is None


@pytest.mark.asyncio
async def test_list_session_documents(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    for i in range(3):
        await document_service.create_document(
            test_session,
            session_id=seed_session.id,
            user_id=seed_user.id,
            topic=f"List Doc {i}",
            content=f"content {i}",
        )
    docs = await document_service.list_session_documents(test_session, seed_session.id)
    assert len(docs) >= 3


@pytest.mark.asyncio
async def test_update_document_entities(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    doc = await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Entity Test",
        content="content",
    )
    updated = await document_service.update_document_entities(
        test_session, document_id=doc.id, entities=["Python", "FastAPI"]
    )
    assert updated is not None
    assert updated.entities == ["Python", "FastAPI"]

    missing = await document_service.update_document_entities(
        test_session, document_id=999999, entities=["x"]
    )
    assert missing is None


@pytest.mark.asyncio
async def test_save_follow_ups(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    doc = await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Follow Up Test",
        content="content",
    )
    questions = [
        {"question": "What is Python?", "type": "concept", "entity_tag": "Python"},
        {"question": "How does GIL work?", "type": "deep_dive"},
    ]
    records = await document_service.save_follow_ups(test_session, doc.id, questions)
    assert len(records) == 2
    assert records[0].question == "What is Python?"
    assert records[1].question_type == "deep_dive"


@pytest.mark.asyncio
async def test_get_random_documents(
    test_session: AsyncSession, seed_user: User, seed_session: Session
) -> None:
    """Verify random docs are returned with follow_up_questions eagerly loaded."""
    doc = await document_service.create_document(
        test_session,
        session_id=seed_session.id,
        user_id=seed_user.id,
        topic="Random Test",
        content="content",
    )
    await document_service.save_follow_ups(test_session, doc.id, [{"question": "Q1?"}])
    await test_session.commit()

    docs = await document_service.get_random_documents(test_session, limit=20, user_id=seed_user.id)
    assert len(docs) >= 1
    # Access follow_up_questions outside session — must not raise MissingGreenlet
    for d in docs:
        assert isinstance(d.follow_up_questions, list)
