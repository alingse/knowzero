"""WebSocket routes for real-time chat with DB persistence."""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.schemas import ChatRequest
from app.services import document_service
from app.services.agent_streaming_service import stream_agent_response

logger = get_logger(__name__)
router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info("WebSocket connected", session_id=session_id)

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info("WebSocket disconnected", session_id=session_id)

    async def send_message(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)


manager = ConnectionManager()


@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for chat."""
    await manager.connect(websocket, session_id)

    try:
        while True:
            data = await websocket.receive_text()

            try:
                request_data = json.loads(data)
                request = ChatRequest(**request_data)
            except (json.JSONDecodeError, Exception) as e:
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

            # Load context from DB
            current_doc_id = None
            current_doc = None
            recent_docs: list[int] = []
            learned_topics: list[str] = []

            try:
                async with get_db_session() as db:
                    docs = await document_service.list_session_documents(db, session_id)
                    if docs:
                        current_doc_id = docs[0].id
                        recent_docs = [d.id for d in docs[:10]]
                        learned_topics = [d.topic for d in docs]
                        # Load full document for content updates
                        current_doc = {
                            "id": docs[0].id,
                            "topic": docs[0].topic,
                            "content": docs[0].content,
                            "category_path": docs[0].category_path,
                            "version": docs[0].version,
                        }
            except Exception as e:
                logger.warning("Context loading failed", error=str(e))

            # Build agent state
            state: AgentState = {
                "input_source": request.source,
                "raw_message": request.message,
                "user_id": 1,  # TODO: auth
                "session_id": session_id,
                "comment_data": (
                    request.comment_data.model_dump() if request.comment_data else None
                ),
                "entity_data": (request.entity_data.model_dump() if request.entity_data else None),
                "intent_hint": request.intent_hint,
                "current_doc_id": current_doc_id,
                "user_level": "beginner",
                "learned_topics": learned_topics,
                "recent_docs": recent_docs,
                "messages": [],
                "intent": None,
                "routing_decision": None,
                "document": current_doc,  # Load current document if exists
                "follow_up_questions": [],
                "change_summary": None,
                "navigation_target": None,
                "error": None,
                "metadata": {},
            }

            await stream_agent_response(websocket, state)

    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), session_id=session_id)
        manager.disconnect(session_id)
