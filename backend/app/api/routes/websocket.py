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
    """Run LangGraph with streaming events, persist results, and stream to client."""
    session_id = state["session_id"]
    user_id = state["user_id"]

    # Collect final results for persistence
    final_result = {}
    accumulated_content = ""

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

        # Run graph with streaming events
        config = {"configurable": {"thread_id": session_id}}

        async for event in graph.astream_events(state, config, version="v1"):
            event_type = event["event"]
            event_name = event.get("name", "")
            event_data = event.get("data", {})

            # Node/Chain start events
            if event_type == "on_chain_start":
                # Extract node name from event name
                node_name = event_name.split(".")[-1] if "." in event_name else event_name
                await websocket.send_json({
                    "type": "node_start",
                    "data": {"name": node_name},
                })
                logger.debug("Node started", node=node_name)

            # Node/Chain end events
            elif event_type == "on_chain_end":
                node_name = event_name.split(".")[-1] if "." in event_name else event_name
                await websocket.send_json({
                    "type": "node_end",
                    "data": {"name": node_name},
                })
                logger.debug("Node ended", node=node_name)

                # Capture final state updates
                if "output" in event_data:
                    final_result.update(event_data["output"])

            # LLM start
            elif event_type == "on_chat_model_start":
                await websocket.send_json({
                    "type": "node_start",
                    "data": {"name": "LLM", "model": event_data.get("model")},
                })

            # LLM token streaming
            elif event_type == "on_chat_model_stream":
                content = event_data.get("chunk", "")
                if content:
                    accumulated_content += content
                    await websocket.send_json({
                        "type": "token",
                        "data": {"content": content},
                    })

            # LLM end
            elif event_type == "on_chat_model_end":
                await websocket.send_json({
                    "type": "node_end",
                    "data": {"name": "LLM"},
                })

            # Tool call start
            elif event_type == "on_tool_start":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                tool_input = event_data.get("input", {})
                await websocket.send_json({
                    "type": "tool_start",
                    "data": {
                        "tool": tool_name,
                        "input": str(tool_input)[:200],  # Truncate for display
                    },
                })
                logger.info("Tool started", tool=tool_name)

            # Tool call end
            elif event_type == "on_tool_end":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                tool_output = event_data.get("output", "")
                await websocket.send_json({
                    "type": "tool_end",
                    "data": {
                        "tool": tool_name,
                        "output": str(tool_output)[:200] if tool_output else "",
                    },
                })
                logger.info("Tool ended", tool=tool_name)

            # Tool error
            elif event_type == "on_tool_error":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                error_msg = event_data.get("error", "Unknown error")
                await websocket.send_json({
                    "type": "error",
                    "message": f"工具 {tool_name} 执行失败: {error_msg}",
                })
                logger.error("Tool error", tool=tool_name, error=error_msg)

        # Get final state after stream completes
        result_state = await graph.ainvoke(state, config)

        # Handle errors
        if result_state.get("error"):
            await websocket.send_json({
                "type": "error",
                "message": result_state["error"],
            })
            return

        # Persist and stream document
        if result_state.get("document"):
            doc_data = result_state["document"]
            async with get_db_session() as db:
                if doc_data.get("id"):
                    # Update existing document
                    db_doc = await document_service.update_document(
                        db,
                        document_id=doc_data["id"],
                        content=doc_data["content"],
                        change_summary=result_state.get("change_summary", "更新"),
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
                            "intent": result_state.get("intent"),
                            "routing": result_state.get("routing_decision"),
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
                follow_ups = result_state.get("follow_up_questions", [])
                if follow_ups:
                    await document_service.save_follow_ups(db, doc_id, follow_ups)

                # Persist assistant message
                await message_service.save_assistant_message(
                    db,
                    session_id=session_id,
                    user_id=user_id,
                    content=result_state.get("change_summary", ""),
                    message_type="document",
                    related_document_id=doc_id,
                    agent_intent=result_state.get("intent"),
                    agent_routing=result_state.get("routing_decision"),
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
        if result_state.get("navigation_target"):
            nav = result_state["navigation_target"]
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

        # Stream direct response (chitchat, etc.)
        if result_state.get("response"):
            resp = result_state["response"]
            await websocket.send_json({
                "type": "content",
                "data": {"content": resp.get("content", "")},
            })

            # Persist assistant message for chitchat
            async with get_db_session() as db:
                await message_service.save_assistant_message(
                    db,
                    session_id=session_id,
                    user_id=user_id,
                    content=resp.get("content", ""),
                    message_type=resp.get("type", "chat"),
                    agent_intent=result_state.get("intent"),
                )

        # Send accumulated content if no other response
        if accumulated_content and not result_state.get("document") and not result_state.get("response"):
            await websocket.send_json({
                "type": "content",
                "data": {"content": accumulated_content},
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
