"""WebSocket routes for real-time chat with DB persistence."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.graph import get_graph
from app.agent.nodes.content import _extract_entities_llm, _generate_follow_ups
from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.schemas import ChatRequest
from app.services import document_service, entity_service, message_service, session_service
from app.services.session_service import update_agent_status

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


async def _background_extract_entities(
    websocket: WebSocket,
    session_id: str,
    doc_id: int,
    content: str,
) -> None:
    """Background: extract entities via LLM, persist, and push to client."""
    try:
        entities = await _extract_entities_llm(content)
        if not entities:
            return

        async with get_db_session() as db:
            await entity_service.upsert_entities(db, session_id, entities, doc_id)
            await document_service.update_document_entities(
                db, document_id=doc_id, entities=entities
            )

        await websocket.send_json({
            "type": "entities",
            "data": {"document_id": doc_id, "entities": entities},
        })
        logger.info("Background entities pushed", doc_id=doc_id, count=len(entities))
    except Exception as e:
        logger.warning("Background entity extraction failed", error=str(e), doc_id=doc_id)


async def _background_generate_follow_ups(
    websocket: WebSocket,
    session_id: str,
    user_id: int,
    doc_id: int,
    content: str,
) -> None:
    """Background: generate follow-up questions via LLM, persist, and push to client."""
    try:
        follow_ups = await _generate_follow_ups(content)
        if not follow_ups:
            return

        async with get_db_session() as db:
            await document_service.save_follow_ups(db, doc_id, follow_ups)

        await websocket.send_json({
            "type": "follow_ups",
            "data": {"document_id": doc_id, "questions": follow_ups},
        })
        logger.info("Background follow-ups pushed", doc_id=doc_id, count=len(follow_ups))
    except Exception as e:
        logger.warning("Background follow-up generation failed", error=str(e), doc_id=doc_id)


async def stream_agent_response(
    websocket: WebSocket,
    state: AgentState,
) -> None:
    """Run LangGraph with streaming events, persist results, and stream to client."""
    session_id = state["session_id"]
    user_id = state["user_id"]

    # Set agent status to running at the start
    try:
        async with get_db_session() as db:
            await update_agent_status(db, session_id, "running")
            await db.commit()
    except Exception as e:
        logger.warning("Failed to set agent status to running", error=str(e))

    # Collect final results for persistence
    final_result = {}
    accumulated_content = ""

    # Track placeholder system message ID for updating later
    placeholder_message_id: int | None = None

    # Track document info for background tasks
    bg_doc_id: int | None = None
    bg_doc_content: str | None = None

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

                # Create persistent placeholder message when document generation starts
                if node_name == "content_agent" and placeholder_message_id is None:
                    # Send document start event with title for streaming preview
                    routing = state.get("routing_decision") or {}
                    doc_title = routing.get("target") if routing else state.get("raw_message", "新文档")
                    await websocket.send_json({
                        "type": "document_start",
                        "data": {"topic": doc_title},
                    })
                    async with get_db_session() as db:
                        placeholder_msg = await message_service.save_assistant_message(
                            db,
                            session_id=session_id,
                            user_id=user_id,
                            content="🔄 正在生成学习文档...",
                            message_type="document_card",
                        )
                        placeholder_message_id = placeholder_msg.id
                        logger.info(
                            "Placeholder message created",
                            message_id=placeholder_message_id,
                        )

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
                    output = event_data["output"]
                    if isinstance(output, dict):
                        final_result.update(output)
                    else:
                        # Output might be a LangChain message object
                        logger.debug("Non-dict output in on_chain_end", output_type=type(output).__name__)

            # LLM start
            elif event_type == "on_chat_model_start":
                await websocket.send_json({
                    "type": "node_start",
                    "data": {"name": "LLM", "model": event_data.get("model")},
                })

            # LLM token streaming
            elif event_type == "on_chat_model_stream":
                chunk = event_data.get("chunk")
                if chunk:
                    # Extract string content from AIMessageChunk
                    chunk_str = chunk.content if hasattr(chunk, "content") else str(chunk)

                    # Only stream tokens from content_agent node to DocumentView
                    # Check metadata.langgraph_node to identify which node produced this stream
                    # Other nodes (intent_agent, chitchat_agent, etc.) produce
                    # internal outputs (JSON, reasoning) that should NOT be shown to users
                    metadata = event.get("metadata", {})
                    node_name = metadata.get("langgraph_node", "")
                    if node_name == "content_agent":
                        accumulated_content += chunk_str
                        await websocket.send_json({
                            "type": "document_token",
                            "data": {"content": chunk_str},
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
            # Delete placeholder message on error (don't show stale status)
            if placeholder_message_id:
                async with get_db_session() as db:
                    await message_service.delete_message(
                        db,
                        message_id=placeholder_message_id,
                    )
                    logger.info(
                        "Placeholder message deleted due to error",
                        message_id=placeholder_message_id,
                    )
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

                # Update session's current_document_id to pin this document
                await session_service.update_current_document(db, session_id, doc_id)

                # Persist assistant message (for internal tracking)
                await message_service.save_assistant_message(
                    db,
                    session_id=session_id,
                    user_id=user_id,
                    content=result_state.get("change_summary", ""),
                    message_type="document_ref",
                    related_document_id=doc_id,
                    agent_intent=result_state.get("intent"),
                    agent_routing=result_state.get("routing_decision"),
                )

                # Update placeholder message with completion info or create new one
                doc_topic = doc_data.get("topic", "学习文档")
                if placeholder_message_id:
                    # Update existing placeholder message
                    await message_service.update_message_content(
                        db,
                        message_id=placeholder_message_id,
                        content=f"📚 已生成学习文档：{doc_topic}",
                    )
                    # Link document to the message
                    await message_service.update_message_document(
                        db,
                        message_id=placeholder_message_id,
                        related_document_id=doc_id,
                    )
                    logger.info(
                        "Placeholder message updated with completion",
                        message_id=placeholder_message_id,
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

            # Stream document to client (entities sent later via background task)
            await websocket.send_json({
                "type": "document",
                "data": {
                    "id": doc_id,
                    "topic": doc_data.get("topic"),
                    "content": doc_data.get("content"),
                    "category_path": doc_data.get("category_path"),
                    "entities": [],
                },
            })

            # Save for background tasks
            bg_doc_id = doc_id
            bg_doc_content = doc_data.get("content", "")

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

        # Launch background tasks for entity extraction and follow-up generation
        if bg_doc_id and bg_doc_content:
            asyncio.create_task(
                _background_extract_entities(
                    websocket, session_id, bg_doc_id, bg_doc_content
                )
            )
            asyncio.create_task(
                _background_generate_follow_ups(
                    websocket, session_id, user_id, bg_doc_id, bg_doc_content
                )
            )

    except Exception as e:
        logger.error("Agent streaming error", error=str(e), exc_info=True)
        await websocket.send_json({
            "type": "error",
            "message": f"处理请求时出错: {str(e)}",
        })
    finally:
        # Always set agent status back to idle when done
        try:
            async with get_db_session() as db:
                await update_agent_status(db, session_id, "idle")
                await db.commit()
        except Exception as e:
            logger.warning("Failed to set agent status to idle", error=str(e))


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
            current_doc = None
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
