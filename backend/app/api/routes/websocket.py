"""WebSocket routes for real-time chat with DB persistence."""

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.graph import get_graph
from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.schemas import ChatRequest
from app.services import document_service, entity_service, message_service

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


async def stream_agent_response(
    websocket: WebSocket,
    state: AgentState,
) -> None:
    """Run the LangGraph, persist results, and stream to client."""
    session_id = state["session_id"]
    user_id = state["user_id"]

    try:
        graph = get_graph()

        # Send thinking indicator
        await websocket.send_json({
            "type": "thinking",
            "message": "AI 正在思考...",
        })

        # Persist user message
        async with get_db_session() as db:
            await message_service.save_user_message(
                db,
                session_id=session_id,
                user_id=user_id,
                content=state["raw_message"],
                message_type=state["input_source"],
            )

        # Run graph with thread_id for checkpointer
        config = {"configurable": {"thread_id": session_id}}
        result = await graph.ainvoke(state, config)

        # Handle errors
        if result.get("error"):
            await websocket.send_json({
                "type": "error",
                "message": result["error"],
            })
            return

        # Persist and stream document
        if result.get("document"):
            doc_data = result["document"]
            async with get_db_session() as db:
                if doc_data.get("id"):
                    # Update existing document
                    db_doc = await document_service.update_document(
                        db,
                        document_id=doc_data["id"],
                        content=doc_data["content"],
                        change_summary=result.get("change_summary", "更新"),
                    )
                else:
                    # Create new document
                    db_doc = await document_service.create_document(
                        db,
                        session_id=session_id,
                        user_id=user_id,
                        topic=doc_data.get("topic", ""),
                        content=doc_data.get("content", ""),
                        category_path=doc_data.get("category_path"),
                        entities=doc_data.get("entities", []),
                        generation_metadata={
                            "intent": result.get("intent"),
                            "routing": result.get("routing_decision"),
                        },
                    )

                doc_id = db_doc.id

                # Persist entities
                entities = doc_data.get("entities", [])
                if entities:
                    await entity_service.upsert_entities(
                        db, session_id, entities, doc_id
                    )

                # Persist follow-up questions
                follow_ups = result.get("follow_up_questions", [])
                if follow_ups:
                    await document_service.save_follow_ups(db, doc_id, follow_ups)

                # Persist assistant message
                await message_service.save_assistant_message(
                    db,
                    session_id=session_id,
                    user_id=user_id,
                    content=result.get("change_summary", ""),
                    message_type="document",
                    related_document_id=doc_id,
                    agent_intent=result.get("intent"),
                    agent_routing=result.get("routing_decision"),
                )

            # Stream document to client
            await websocket.send_json({
                "type": "document",
                "data": {
                    "id": doc_id,
                    "topic": doc_data.get("topic"),
                    "content": doc_data.get("content"),
                    "category_path": doc_data.get("category_path"),
                    "entities": doc_data.get("entities", []),
                },
            })

            # Stream follow-ups
            if follow_ups:
                await websocket.send_json({
                    "type": "follow_ups",
                    "data": {"questions": follow_ups},
                })

        # Stream navigation info
        if result.get("navigation_target"):
            nav = result["navigation_target"]
            await websocket.send_json({
                "type": "navigation",
                "data": nav,
            })

            # Persist navigation message
            async with get_db_session() as db:
                await message_service.save_assistant_message(
                    db,
                    session_id=session_id,
                    user_id=user_id,
                    content=nav.get("message", ""),
                    message_type="navigation",
                    related_document_id=nav.get("document_id"),
                )

        # Stream final AI message
        messages = result.get("messages", [])
        if messages:
            last_message = messages[-1]
            if hasattr(last_message, "content"):
                await websocket.send_json({
                    "type": "content",
                    "data": {"content": last_message.content},
                })

        # Done
        await websocket.send_json({"type": "done"})

    except Exception as e:
        logger.error("Agent streaming error", error=str(e))
        await websocket.send_json({
            "type": "error",
            "message": f"处理请求时出错: {str(e)}",
        })


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
                await websocket.send_json({
                    "type": "error",
                    "message": f"Invalid request format: {str(e)}",
                })
                continue

            logger.info(
                "WebSocket message received",
                session_id=session_id,
                source=request.source,
                message_preview=request.message[:50],
            )

            # Load context from DB
            current_doc_id = None
            recent_docs: list[int] = []
            learned_topics: list[str] = []

            try:
                async with get_db_session() as db:
                    docs = await document_service.list_session_documents(
                        db, session_id
                    )
                    if docs:
                        current_doc_id = docs[0].id
                        recent_docs = [d.id for d in docs[:10]]
                        learned_topics = [d.topic for d in docs]
            except Exception as e:
                logger.warning("Context loading failed", error=str(e))

            # Build agent state
            state: AgentState = {
                "input_source": request.source,
                "raw_message": request.message,
                "user_id": 1,  # TODO: auth
                "session_id": session_id,
                "comment_data": (
                    request.comment_data.model_dump()
                    if request.comment_data
                    else None
                ),
                "entity_data": (
                    request.entity_data.model_dump()
                    if request.entity_data
                    else None
                ),
                "intent_hint": request.intent_hint,
                "current_doc_id": current_doc_id,
                "user_level": "beginner",
                "learned_topics": learned_topics,
                "recent_docs": recent_docs,
                "messages": [],
                "intent": None,
                "routing_decision": None,
                "document": None,
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
