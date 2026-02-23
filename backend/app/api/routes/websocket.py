"""WebSocket routes for real-time chat with DB persistence."""

import json
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.state import AgentState
from app.core.auth import get_auth_user_from_ws
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.schemas import ChatRequest
from app.services import document_service
from app.services.agent_streaming_service import stream_agent_response

logger = get_logger(__name__)
router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info("WebSocket connected", session_id=session_id)

    def disconnect(self, session_id: str) -> None:
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info("WebSocket disconnected", session_id=session_id)

    async def send_message(self, session_id: str, message: dict[str, Any]) -> None:
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)


manager = ConnectionManager()


@dataclass
class SessionContext:
    """Session context for agent state building."""

    current_doc_id: int | None
    current_doc: dict[str, Any] | None
    recent_docs: list[int]
    learned_topics: list[str]
    current_roadmap: dict[str, Any] | None
    session_topic: str | None  # Current learning topic from Session.learning_goal


async def _load_session_context(
    session_id: str, preferred_doc_id: int | None = None
) -> SessionContext:
    """Load session context from DB for agent state building.

    Args:
        session_id: The session ID
        preferred_doc_id: Optional preferred current document ID (e.g., from follow_up request)
    """
    current_doc_id = None
    current_doc = None
    recent_docs: list[int] = []
    learned_topics: list[str] = []
    current_roadmap: dict[str, Any] | None = None
    session_topic: str | None = None

    async with get_db_session() as db:
        # Load session to get learning_goal (session_topic)
        from app.models.session import Session as SessionModel

        session = await db.get(SessionModel, session_id)
        if session:
            session_topic = session.learning_goal

        docs = await document_service.list_session_documents(db, session_id)
        if docs:
            # Build doc_map for O(1) lookup instead of O(n) linear search
            doc_map = {d.id: d for d in docs}

            # Use preferred_doc_id if provided and exists, otherwise fall back to most recent
            target_doc = doc_map.get(preferred_doc_id, docs[0]) if preferred_doc_id else docs[0]
            if not target_doc:
                target_doc = docs[0]

            current_doc_id = target_doc.id
            recent_docs = [d.id for d in docs[:10]]
            learned_topics = [d.topic for d in docs]
            current_doc = {
                "id": target_doc.id,
                "topic": target_doc.topic,
                "content": target_doc.content,
                "category_path": target_doc.category_path,
                "version": target_doc.version,
            }

        # Load active roadmap for the session
        from app.services import roadmap_service

        active_roadmap = await roadmap_service.get_active_roadmap(db, session_id)
        if active_roadmap:
            current_roadmap = {
                "id": active_roadmap.id,
                "goal": active_roadmap.goal,
                "milestones": active_roadmap.milestones,
                "mermaid": active_roadmap.mermaid,
                "version": active_roadmap.version,
            }

    return SessionContext(
        current_doc_id=current_doc_id,
        current_doc=current_doc,
        recent_docs=recent_docs,
        learned_topics=learned_topics,
        current_roadmap=current_roadmap,
        session_topic=session_topic,
    )


def _build_agent_state(
    request: ChatRequest,
    session_id: str,
    ctx: SessionContext,
    websocket: WebSocket,
) -> AgentState:
    """Build the initial agent state from request and session context."""
    # Use current_doc_id from request if provided (e.g., follow_up), otherwise fall back to context
    current_doc_id = request.current_doc_id or ctx.current_doc_id

    # Build generation context from milestone_context
    generation_context = None
    if request.milestone_context:
        generation_context = {
            "milestone_id": request.milestone_context.milestone_id,
            "milestone_title": request.milestone_context.milestone_title,
            "document_index": request.milestone_context.document_index,
            "existing_documents": request.milestone_context.existing_documents,
            "mode": request.milestone_context.mode,
        }

    return {
        "input_source": request.source,
        "raw_message": request.message,
        "user_id": get_auth_user_from_ws(websocket),  # Anonymous auth, defaults to 1
        "session_id": session_id,
        "comment_data": request.comment_data.model_dump() if request.comment_data else None,
        "entity_data": request.entity_data.model_dump() if request.entity_data else None,
        "intent_hint": request.intent_hint,
        "current_doc_id": current_doc_id,
        "user_level": "beginner",
        "learned_topics": ctx.learned_topics,
        "recent_docs": ctx.recent_docs,
        "available_docs": [],  # No available docs initially
        "current_roadmap": ctx.current_roadmap,
        "roadmap_modified": False,
        "roadmap_only": False,
        "session_topic": ctx.session_topic,  # Current learning topic
        "pending_session_update": None,  # No pending update initially
        "generation_context": generation_context,  # Milestone generation context
        "messages": [],
        "intent": None,
        "routing_decision": None,
        "document": ctx.current_doc,
        "roadmap": None,
        "follow_up_questions": [],
        "change_summary": None,
        "response": None,
        "navigation_target": None,
        "error": None,
        "metadata": {},
    }


@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for chat."""
    await manager.connect(websocket, session_id)

    try:
        while True:
            data = await websocket.receive_text()

            try:
                request_data = json.loads(data)
                request = ChatRequest(**request_data)
            except (json.JSONDecodeError, ValueError) as e:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"Invalid request format: {str(e)}",
                    }
                )
                continue

            logger.info(
                "WebSocket message received",
                session_id=session_id,
                source=request.source,
                message_preview=request.message[:50],
            )

            # Load context from DB (with preferred doc ID from request)
            try:
                ctx = await _load_session_context(session_id, request.current_doc_id)
            except Exception as e:
                logger.warning("Context loading failed", error=str(e))
                ctx = SessionContext(
                    current_doc_id=None,
                    current_doc=None,
                    recent_docs=[],
                    learned_topics=[],
                    current_roadmap=None,
                    session_topic=None,
                )

            state = _build_agent_state(request, session_id, ctx, websocket)

            await stream_agent_response(websocket, state)

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), session_id=session_id)
        manager.disconnect(session_id)
