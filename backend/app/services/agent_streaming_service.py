"""Agent streaming service.

This module provides the main orchestration for agent response streaming.
It coordinates persistence, WebSocket communication, and event processing.
"""

import asyncio

from fastapi import WebSocket

from app.agent.nodes.content import _extract_entities_llm, _generate_follow_ups
from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.services import document_service, entity_service
from app.services.persistence_coordinator import (
    create_placeholder_message,
    persist_assistant_message,
    persist_document,
    persist_user_message,
    update_placeholder_message,
)
from app.services.session_service import update_agent_status
from app.services.websocket_event_handler import StreamContext
from app.services.websocket_message_sender import (
    send_content,
    send_document_complete,
    send_document_start,
    send_document_token,
    send_done,
    send_entities,
    send_error,
    send_follow_ups,
    send_navigation,
    send_node_end,
    send_node_start,
    send_thinking,
    send_tool_end,
    send_tool_start,
)

logger = get_logger(__name__)


class AgentStreamProcessor:
    """Orchestrates agent response streaming with persistence and WebSocket communication."""

    def __init__(self, websocket: WebSocket, state: AgentState) -> None:
        """Initialize the processor with WebSocket connection and agent state."""
        self.websocket = websocket
        self.state = state
        self.session_id = state["session_id"]
        self.user_id = state["user_id"]
        self.ctx = StreamContext()

        # Track background tasks for proper cleanup and error handling
        self._background_tasks: list[asyncio.Task[None]] = []

    async def initialize(self) -> None:
        """Initialize the streaming session.

        Sets agent status to running and sends thinking indicator.
        """
        try:
            async with get_db_session() as db:
                await update_agent_status(db, self.session_id, "running")
                await db.commit()
        except Exception as e:
            logger.warning("Failed to set agent status to running", error=str(e))

        await send_thinking(self.websocket)

    async def persist_user_input(self) -> None:
        """Persist the user's message to the database."""
        async with get_db_session() as db:
            await persist_user_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                content=self.state["raw_message"],
                message_type=self.state["input_source"],
            )

    async def process_events(self) -> None:
        """Process streaming events from the LangGraph agent.

        This is the main event loop that handles all agent streaming.
        """
        from app.agent.graph import get_graph

        graph = get_graph()
        config = {"configurable": {"thread_id": self.session_id}}

        # Create placeholder message when document generation starts
        async with get_db_session() as db:
            routing = self.state.get("routing_decision") or {}
            doc_title = (
                routing.get("target") if routing else self.state.get("raw_message", "新文档")
            )

            await send_document_start(self.websocket, topic=doc_title)
            placeholder_msg = await create_placeholder_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                topic=doc_title,
            )
            self.ctx.placeholder_message_id = placeholder_msg.id

        # Process streaming events
        async for event in graph.astream_events(self.state, config, version="v1"):
            event_type = event["event"]
            event_name = event.get("name", "")
            event_data = event.get("data", {})

            # Node/Chain start events
            if event_type == "on_chain_start":
                node_name = event_name.split(".")[-1] if "." in event_name else event_name
                await send_node_start(self.websocket, name=node_name)
                logger.debug("Node started", node=node_name)

            # Node/Chain end events
            elif event_type == "on_chain_end":
                node_name = event_name.split(".")[-1] if "." in event_name else event_name
                await send_node_end(self.websocket, name=node_name)
                logger.debug("Node ended", node=node_name)

                # Capture final state updates
                if "output" in event_data:
                    output = event_data["output"]
                    if isinstance(output, dict):
                        self.ctx.final_result.update(output)
                    else:
                        logger.debug(
                            "Non-dict output in on_chain_end", output_type=type(output).__name__
                        )

            # LLM start
            elif event_type == "on_chat_model_start":
                await send_node_start(self.websocket, name="LLM", model=event_data.get("model"))

            # LLM token streaming
            elif event_type == "on_chat_model_stream":
                chunk = event_data.get("chunk")
                if chunk:
                    chunk_str = chunk.content if hasattr(chunk, "content") else str(chunk)
                    metadata = event.get("metadata", {})
                    node_name = metadata.get("langgraph_node", "")
                    if node_name == "content_agent":
                        self.ctx.accumulated_content += chunk_str
                        await send_document_token(self.websocket, content=chunk_str)

            # LLM end
            elif event_type == "on_chat_model_end":
                await send_node_end(self.websocket, name="LLM")

            # Tool call start
            elif event_type == "on_tool_start":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                tool_input = event_data.get("input", {})
                await send_tool_start(
                    self.websocket, tool_name=tool_name, tool_input=str(tool_input)
                )
                logger.info("Tool started", tool=tool_name)

            # Tool call end
            elif event_type == "on_tool_end":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                tool_output = event_data.get("output", "")
                await send_tool_end(
                    self.websocket, tool_name=tool_name, tool_output=str(tool_output)
                )
                logger.info("Tool ended", tool=tool_name)

            # Tool error
            elif event_type == "on_tool_error":
                tool_name = event_name.split(".")[-1] if "." in event_name else event_name
                error_msg = event_data.get("error", "Unknown error")
                await send_error(self.websocket, message=f"工具 {tool_name} 执行失败: {error_msg}")
                logger.error("Tool error", tool=tool_name, error=error_msg)

    async def finalize(self) -> None:
        """Finalize the streaming session after event processing completes.

        Handles result persistence, sends final messages, and launches background tasks.
        """
        from app.agent.graph import get_graph

        graph = get_graph()
        config = {"configurable": {"thread_id": self.session_id}}
        result_state = await graph.ainvoke(self.state, config)

        # Handle errors
        if result_state.get("error"):
            await self._handle_error(result_state["error"])
            return

        # Handle document generation
        if result_state.get("document"):
            await self._handle_document(result_state)

        # Handle navigation
        if result_state.get("navigation_target"):
            await self._handle_navigation(result_state["navigation_target"])

        # Handle direct response (chitchat)
        if result_state.get("response"):
            await self._handle_response(result_state["response"])

        # Send accumulated content if no other response
        if (
            self.ctx.accumulated_content
            and not result_state.get("document")
            and not result_state.get("response")
        ):
            await send_content(self.websocket, content=self.ctx.accumulated_content)

        await send_done(self.websocket)

        # Launch background tasks
        await self._launch_background_tasks()

    async def _handle_error(self, error_msg: str) -> None:
        """Handle error state."""
        # Delete placeholder message on error
        if self.ctx.placeholder_message_id:
            async with get_db_session() as db:
                from app.services import message_service

                await message_service.delete_message(db, message_id=self.ctx.placeholder_message_id)
                logger.info(
                    "Placeholder message deleted due to error",
                    message_id=self.ctx.placeholder_message_id,
                )
        await send_error(self.websocket, message=error_msg)

    async def _handle_document(self, result_state: dict) -> None:
        """Handle document persistence and streaming."""
        doc_data = result_state["document"]

        async with get_db_session() as db:
            doc_id, doc_topic = await persist_document(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                doc_data=doc_data,
                change_summary=result_state.get("change_summary"),
                input_source=self.state["input_source"],
                current_doc_id=self.state.get("current_doc_id"),
                intent=result_state.get("intent"),
                routing=result_state.get("routing_decision"),
            )

            # Persist assistant message for document reference
            await persist_assistant_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                content=result_state.get("change_summary") or "",
                message_type="document_ref",
                related_document_id=doc_id,
                agent_intent=result_state.get("intent"),
                agent_routing=result_state.get("routing_decision"),
            )

            # Update placeholder message
            await update_placeholder_message(
                db,
                message_id=self.ctx.placeholder_message_id,
                session_id=self.session_id,
                user_id=self.user_id,
                doc_id=doc_id,
                topic=doc_topic,
            )

        # Stream document to client
        await send_document_complete(
            self.websocket,
            doc_id=doc_id,
            topic=doc_data.get("topic"),
            content=doc_data.get("content"),
            category_path=doc_data.get("category_path"),
            entities=[],  # Entities sent later via background task
        )

        # Save for background tasks in context
        self.ctx.bg_doc_id = doc_id
        self.ctx.bg_doc_content = doc_data.get("content", "")

    async def _handle_navigation(self, nav: dict) -> None:
        """Handle navigation target."""
        await send_navigation(
            self.websocket,
            document_id=nav.get("document_id"),
            message=nav.get("message"),
        )

        async with get_db_session() as db:
            await persist_assistant_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                content=nav.get("message") or "",
                message_type="navigation",
                related_document_id=nav.get("document_id"),
            )

    async def _handle_response(self, resp: dict) -> None:
        """Handle direct response (chitchat, etc.)."""
        await send_content(self.websocket, content=resp.get("content", ""))

        async with get_db_session() as db:
            await persist_assistant_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                content=resp.get("content") or "",
                message_type=resp.get("type", "chat"),
                agent_intent=self.state.get("intent"),
            )

    async def _launch_background_tasks(self) -> None:
        """Launch background tasks for entity extraction and follow-up generation."""
        if self.ctx.bg_doc_id and self.ctx.bg_doc_content:
            # Create entity extraction task
            entity_task = asyncio.create_task(
                _background_extract_entities(
                    self.websocket,
                    self.session_id,
                    self.ctx.bg_doc_id,
                    self.ctx.bg_doc_content,
                )
            )
            entity_task.add_done_callback(self._on_task_done)
            self._background_tasks.append(entity_task)

            # Create follow-up generation task
            followup_task = asyncio.create_task(
                _background_generate_follow_ups(
                    self.websocket,
                    self.session_id,
                    self.user_id,
                    self.ctx.bg_doc_id,
                    self.ctx.bg_doc_content,
                )
            )
            followup_task.add_done_callback(self._on_task_done)
            self._background_tasks.append(followup_task)

    def _on_task_done(self, task: asyncio.Task[None]) -> None:
        """Callback for background task completion with error logging."""
        try:
            # Access result to raise any exception that occurred
            task.result()
        except Exception as e:
            logger.warning("Background task failed", error=str(e), exc_info=True)

    async def cleanup(self) -> None:
        """Clean up resources after streaming completes.

        Always sets agent status back to idle and waits for background tasks.
        """
        # Wait for background tasks to complete with timeout
        if self._background_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._background_tasks, return_exceptions=True),
                    timeout=30.0,
                )
            except TimeoutError:
                logger.warning("Background tasks timed out during cleanup")
            except Exception as e:
                logger.warning("Error waiting for background tasks", error=str(e))

        # Set agent status back to idle
        try:
            async with get_db_session() as db:
                await update_agent_status(db, self.session_id, "idle")
                await db.commit()
        except Exception as e:
            logger.warning("Failed to set agent status to idle", error=str(e))

    async def stream(self) -> None:
        """Run the complete streaming workflow.

        This is the main entry point that orchestrates the entire process.
        """
        try:
            await self.initialize()
            await self.persist_user_input()
            await self.process_events()
            await self.finalize()
        except Exception as e:
            logger.error("Agent streaming error", error=str(e), exc_info=True)
            await send_error(self.websocket, message=f"处理请求时出错: {str(e)}")
        finally:
            await self.cleanup()


async def stream_agent_response(
    websocket: WebSocket,
    state: AgentState,
) -> None:
    """Convenience function with the same interface as the original.

    This creates an AgentStreamProcessor and runs the stream workflow.
    """
    processor = AgentStreamProcessor(websocket, state)
    await processor.stream()


# Background task functions (kept from original for compatibility)


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

        await send_entities(websocket, document_id=doc_id, entities=entities)
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
    follow_ups = []

    try:
        follow_ups = await _generate_follow_ups(content)

        # Save to database if we got any questions
        if follow_ups:
            async with get_db_session() as db:
                await document_service.save_follow_ups(db, doc_id, follow_ups)
    except Exception as e:
        logger.warning("Background follow-up generation failed", error=str(e), doc_id=doc_id)

    # Always send follow_ups message so client knows we're done
    try:
        await send_follow_ups(websocket, document_id=doc_id, questions=follow_ups)
        count = len(follow_ups)
        logger.info("Background follow-ups pushed", doc_id=doc_id, count=count)
    except Exception:
        pass  # WebSocket might be closed
