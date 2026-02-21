"""Agent streaming service.

This module provides the main orchestration for agent response streaming.
It coordinates persistence, WebSocket communication, and event processing.
"""

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import WebSocket

from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.services import document_service, entity_service, message_service
from app.services.persistence_coordinator import (
    create_placeholder_message,
    persist_assistant_message,
    persist_document,
    persist_roadmap,
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
    send_progress,
    send_roadmap,
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
        Document persistence happens when content_agent ends.
        Entity/follow-up persistence happens when post_process ends.
        """
        from app.agent.graph import get_graph

        graph = get_graph()
        config = {"configurable": {"thread_id": self.session_id}}

        # Event type handlers - using Any for LangGraph event types
        handlers: dict[str, Callable[[dict[str, Any]], Coroutine[Any, Any, None]]] = {
            "on_chain_start": self._on_chain_start,
            "on_chain_end": self._on_chain_end,
            "on_chat_model_start": self._on_chat_model_start,
            "on_chat_model_stream": self._on_chat_model_stream,
            "on_chat_model_end": self._on_chat_model_end,
            "on_tool_start": self._on_tool_start,
            "on_tool_end": self._on_tool_end,
            "on_tool_error": self._on_tool_error,
        }

        # Process streaming events - type ignore for LangGraph API compatibility
        async for event in graph.astream_events(self.state, config, version="v1"):  # type: ignore[arg-type]
            event_type = event["event"]
            handler = handlers.get(event_type)
            if handler:
                await handler(event)  # type: ignore[arg-type]

    async def _on_chain_start(self, event: dict[str, Any]) -> None:
        """Handle chain/node start event."""
        event_name = event.get("name", "")
        node_name = event_name.split(".")[-1] if "." in event_name else event_name
        await send_node_start(self.websocket, name=node_name)
        logger.debug("Node started", node=node_name)

        # Create placeholder message when content_agent starts
        if node_name == "content_agent" and not self.ctx.placeholder_message_id:
            async with get_db_session() as db:
                routing = self.state.get("routing_decision") or {}
                intent = self.state.get("intent") or {}
                doc_title = (
                    routing.get("target")
                    or intent.get("target")
                    or self.state.get("raw_message", "新文档")
                )

                await send_document_start(self.websocket, topic=doc_title)
                placeholder_msg = await create_placeholder_message(
                    db,
                    session_id=self.session_id,
                    user_id=self.user_id,
                    topic=doc_title,
                )
                self.ctx.placeholder_message_id = placeholder_msg.id
                logger.info(
                    "Placeholder message created for content_agent",
                    message_id=placeholder_msg.id,
                )

    async def _on_chain_end(self, event: dict[str, Any]) -> None:
        """Handle chain/node end event."""
        event_name = event.get("name", "")
        event_data = event.get("data", {})
        node_name = event_name.split(".")[-1] if "." in event_name else event_name
        await send_node_end(self.websocket, name=node_name)
        logger.debug("Node ended", node=node_name)

        # Capture final state updates
        if "output" in event_data:
            output = event_data["output"]
            if isinstance(output, dict):
                self.state.update(output)  # type: ignore[typeddict-item]
                self.ctx.final_result.update(output)

                if node_name == "content_agent" and output.get("document"):
                    await self._on_content_agent_end(output)

                if node_name == "post_process":
                    await self._on_post_process_end(output)
            else:
                logger.debug("Non-dict output in on_chain_end", output_type=type(output).__name__)

    async def _on_chat_model_start(self, event: dict[str, Any]) -> None:
        """Handle chat model start event."""
        metadata = event.get("metadata", {})
        if metadata.get("langgraph_node") == "post_process":
            return
        event_data = event.get("data", {})
        await send_node_start(self.websocket, name="LLM", model=event_data.get("model"))

    async def _on_chat_model_stream(self, event: dict[str, Any]) -> None:
        """Handle chat model token streaming event."""
        metadata = event.get("metadata", {})
        if metadata.get("langgraph_node") == "post_process":
            return
        event_data = event.get("data", {})
        chunk = event_data.get("chunk")
        if chunk:
            chunk_str = chunk.content if hasattr(chunk, "content") else str(chunk)
            node_name = metadata.get("langgraph_node", "")
            if node_name == "content_agent":
                self.ctx.accumulated_content += chunk_str
                await send_document_token(self.websocket, content=chunk_str)

    async def _on_chat_model_end(self, event: dict[str, Any]) -> None:
        """Handle chat model end event."""
        metadata = event.get("metadata", {})
        if metadata.get("langgraph_node") == "post_process":
            return
        await send_node_end(self.websocket, name="LLM")

    async def _on_tool_start(self, event: dict[str, Any]) -> None:
        """Handle tool start event."""
        event_name = event.get("name", "")
        event_data = event.get("data", {})
        tool_name = event_name.split(".")[-1] if "." in event_name else event_name
        tool_input = event_data.get("input", {})
        await send_tool_start(self.websocket, tool_name=tool_name, tool_input=str(tool_input))
        logger.info("Tool started", tool=tool_name)

    async def _on_tool_end(self, event: dict[str, Any]) -> None:
        """Handle tool end event."""
        event_name = event.get("name", "")
        event_data = event.get("data", {})
        tool_name = event_name.split(".")[-1] if "." in event_name else event_name
        tool_output = event_data.get("output", "")
        await send_tool_end(self.websocket, tool_name=tool_name, tool_output=str(tool_output))
        logger.info("Tool ended", tool=tool_name)

    async def _on_tool_error(self, event: dict[str, Any]) -> None:
        """Handle tool error event."""
        event_name = event.get("name", "")
        event_data = event.get("data", {})
        tool_name = event_name.split(".")[-1] if "." in event_name else event_name
        error_msg = event_data.get("error", "Unknown error")
        await send_error(self.websocket, message=f"工具 {tool_name} 执行失败: {error_msg}")
        logger.error("Tool error", tool=tool_name, error=error_msg)

    async def _on_content_agent_end(self, output: dict[str, Any]) -> None:
        """Handle content_agent completion: persist document and send to client immediately."""
        doc_data = output["document"]

        async with get_db_session() as db:
            doc_id, doc_topic = await persist_document(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                doc_data=doc_data,
                change_summary=output.get("change_summary"),
                input_source=self.state["input_source"],
                current_doc_id=self.state.get("current_doc_id"),
                intent=output.get("intent"),
                routing=output.get("routing_decision"),
            )

            await persist_assistant_message(
                db,
                session_id=self.session_id,
                user_id=self.user_id,
                content=output.get("change_summary") or "",
                message_type="document_ref",
                related_document_id=doc_id,
                agent_intent=output.get("intent"),
                agent_routing=output.get("routing_decision"),
            )

            await update_placeholder_message(
                db,
                message_id=self.ctx.placeholder_message_id,
                session_id=self.session_id,
                user_id=self.user_id,
                doc_id=doc_id,
                topic=doc_topic,
            )

        # Send document to client immediately (entities come later from post_process)
        await send_document_complete(
            self.websocket,
            doc_id=doc_id,
            topic=doc_data.get("topic"),
            content=doc_data.get("content"),
            category_path=doc_data.get("category_path"),
            entities=[],
        )

        # Save doc_id for post_process to use
        self.ctx.doc_id = doc_id

        # Notify client that post-processing is starting
        await send_progress(
            self.websocket,
            stage="post_processing",
            message="正在提取关键概念和生成追问...",
        )

        logger.info("content_agent document persisted and sent", doc_id=doc_id)

    async def _on_post_process_end(self, output: dict[str, Any]) -> None:
        """Handle post_process completion: persist entities/follow-ups and send to client."""
        doc_id = self.ctx.doc_id
        if not doc_id:
            logger.warning("post_process ended but no doc_id in context")
            return

        doc_data = output.get("document") or {}
        entities = doc_data.get("entities", [])
        follow_ups = output.get("follow_up_questions", [])
        roadmap_id = doc_data.get("roadmap_id")
        milestone_id = doc_data.get("milestone_id")

        # Update roadmap/milestone association (set by post_process node)
        if roadmap_id is not None or milestone_id is not None:
            try:
                async with get_db_session() as db:
                    await document_service.update_document_roadmap(
                        db,
                        document_id=doc_id,
                        roadmap_id=roadmap_id,
                        milestone_id=milestone_id,
                    )
            except Exception as e:
                logger.warning("Failed to update document roadmap", error=str(e), doc_id=doc_id)

        # Persist entities
        if entities:
            try:
                async with get_db_session() as db:
                    await entity_service.upsert_entities(db, self.session_id, entities, doc_id)
                    await document_service.update_document_entities(
                        db, document_id=doc_id, entities=entities
                    )
            except Exception as e:
                logger.warning("Failed to persist entities", error=str(e), doc_id=doc_id)

        # Persist follow-ups
        if follow_ups:
            try:
                async with get_db_session() as db:
                    await document_service.save_follow_ups(db, doc_id, follow_ups)
            except Exception as e:
                logger.warning("Failed to persist follow-ups", error=str(e), doc_id=doc_id)

        # Send to client
        await send_entities(self.websocket, document_id=doc_id, entities=entities)
        await send_follow_ups(self.websocket, document_id=doc_id, questions=follow_ups)

        logger.info(
            "post_process results persisted and sent",
            doc_id=doc_id,
            entities=len(entities),
            follow_ups=len(follow_ups),
            roadmap_id=roadmap_id,
            milestone_id=milestone_id,
        )

    async def finalize(self) -> None:
        """Finalize the streaming session after event processing completes.

        Document and entity/follow-up persistence is handled in process_events.
        This handles remaining result types (roadmap, navigation, response).
        """
        from app.agent.graph import get_graph

        graph = get_graph()
        config = {"configurable": {"thread_id": self.session_id}}

        # Read final state from checkpoint (NOT ainvoke which re-runs the graph)
        state_snapshot = await graph.aget_state(config)  # type: ignore[arg-type]
        result_state = state_snapshot.values if state_snapshot and state_snapshot.values else {}

        # Merge with results captured during streaming as fallback
        if self.ctx.final_result:
            for key, value in self.ctx.final_result.items():
                if key not in result_state or result_state[key] is None:
                    result_state[key] = value

        # Handle errors
        if result_state.get("error"):
            await self._handle_error(result_state["error"])
            return

        # Handle roadmap
        if result_state.get("roadmap"):
            async with get_db_session() as db:
                roadmap_id = await persist_roadmap(
                    db,
                    session_id=self.session_id,
                    user_id=self.user_id,
                    roadmap_data=result_state["roadmap"],
                )
                result_state["roadmap"]["id"] = roadmap_id
            await send_roadmap(self.websocket, roadmap=result_state["roadmap"])

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

    async def _handle_error(self, error_msg: str) -> None:
        """Handle error state."""
        if self.ctx.placeholder_message_id:
            async with get_db_session() as db:
                await message_service.delete_message(db, message_id=self.ctx.placeholder_message_id)
                logger.info(
                    "Placeholder message deleted due to error",
                    message_id=self.ctx.placeholder_message_id,
                )
        await send_error(self.websocket, message=error_msg)

    async def _handle_navigation(self, nav: dict[str, Any]) -> None:
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

    async def _handle_response(self, resp: dict[str, Any]) -> None:
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

    async def cleanup(self) -> None:
        """Clean up resources after streaming completes.

        Sets agent status back to idle.
        """
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
