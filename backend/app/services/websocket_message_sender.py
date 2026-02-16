"""WebSocket message sender service.

This module handles all WebSocket message sending operations.
It separates the concerns of message formatting and sending from business logic.
"""

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


async def send_thinking(websocket: WebSocket, message: str = "AI 正在思考...") -> None:
    """Send thinking indicator to client."""
    await websocket.send_json(
        {
            "type": "thinking",
            "message": message,
        }
    )
    logger.debug("Thinking indicator sent")


async def send_node_start(
    websocket: WebSocket,
    *,
    name: str,
    model: str | None = None,
) -> None:
    """Send node start event to client."""
    data = {"name": name}
    if model:
        data["model"] = model
    await websocket.send_json(
        {
            "type": "node_start",
            "data": data,
        }
    )
    logger.debug("Node start sent", node=name)


async def send_node_end(websocket: WebSocket, *, name: str) -> None:
    """Send node end event to client."""
    await websocket.send_json(
        {
            "type": "node_end",
            "data": {"name": name},
        }
    )
    logger.debug("Node end sent", node=name)


async def send_document_start(
    websocket: WebSocket,
    *,
    topic: str,
) -> None:
    """Send document generation start event to client."""
    await websocket.send_json(
        {
            "type": "document_start",
            "data": {"topic": topic},
        }
    )
    logger.info("Document start sent", topic=topic)


async def send_document_token(
    websocket: WebSocket,
    *,
    content: str,
) -> None:
    """Send document content token to client for streaming preview."""
    await websocket.send_json(
        {
            "type": "document_token",
            "data": {"content": content},
        }
    )
    logger.debug("Document token sent", content_length=len(content))


async def send_document_complete(
    websocket: WebSocket,
    *,
    doc_id: int,
    topic: str | None,
    content: str | None,
    category_path: str | None = None,
    entities: list | None = None,
) -> None:
    """Send complete document to client."""
    await websocket.send_json(
        {
            "type": "document",
            "data": {
                "id": doc_id,
                "topic": topic,
                "content": content,
                "category_path": category_path,
                "entities": entities or [],
            },
        }
    )
    logger.info("Document complete sent", doc_id=doc_id, topic=topic)


async def send_roadmap(
    websocket: WebSocket,
    *,
    roadmap: dict,
) -> None:
    """Send learning roadmap to client."""
    await websocket.send_json(
        {
            "type": "roadmap",
            "data": roadmap,
        }
    )
    logger.info("Roadmap sent", goal=roadmap.get("goal"))


async def send_follow_ups(
    websocket: WebSocket,
    *,
    document_id: int,
    questions: list[str],
) -> None:
    """Send follow-up questions to client."""
    await websocket.send_json(
        {
            "type": "follow_ups",
            "data": {"document_id": document_id, "questions": questions},
        }
    )
    logger.info("Follow-ups sent", doc_id=document_id, count=len(questions))


async def send_entities(
    websocket: WebSocket,
    *,
    document_id: int,
    entities: list[dict],
) -> None:
    """Send extracted entities to client."""
    await websocket.send_json(
        {
            "type": "entities",
            "data": {"document_id": document_id, "entities": entities},
        }
    )
    logger.info("Entities sent", doc_id=document_id, count=len(entities))


async def send_navigation(
    websocket: WebSocket,
    *,
    document_id: int | None,
    message: str | None,
) -> None:
    """Send navigation target to client."""
    await websocket.send_json(
        {
            "type": "navigation",
            "data": {"document_id": document_id, "message": message},
        }
    )
    logger.info("Navigation sent", document_id=document_id)


async def send_content(
    websocket: WebSocket,
    *,
    content: str,
) -> None:
    """Send direct chat content to client."""
    await websocket.send_json(
        {
            "type": "content",
            "data": {"content": content},
        }
    )
    logger.info("Content sent", content_length=len(content))


async def send_tool_start(
    websocket: WebSocket,
    *,
    tool_name: str,
    tool_input: str,
) -> None:
    """Send tool execution start event to client."""
    await websocket.send_json(
        {
            "type": "tool_start",
            "data": {
                "tool": tool_name,
                "input": tool_input[:200],  # Truncate for display
            },
        }
    )
    logger.info("Tool start sent", tool=tool_name)


async def send_tool_end(
    websocket: WebSocket,
    *,
    tool_name: str,
    tool_output: str,
) -> None:
    """Send tool execution end event to client."""
    await websocket.send_json(
        {
            "type": "tool_end",
            "data": {
                "tool": tool_name,
                "output": tool_output[:200] if tool_output else "",
            },
        }
    )
    logger.info("Tool end sent", tool=tool_name)


async def send_error(
    websocket: WebSocket,
    *,
    message: str,
) -> None:
    """Send error message to client."""
    await websocket.send_json(
        {
            "type": "error",
            "message": message,
        }
    )
    logger.warning("Error sent", message=message)


async def send_progress(
    websocket: WebSocket,
    *,
    stage: str,
    message: str,
) -> None:
    """Send progress update to client for background processing stages."""
    await websocket.send_json(
        {
            "type": "progress",
            "data": {"stage": stage, "message": message},
        }
    )
    logger.info("Progress sent", stage=stage, message=message)


async def send_done(websocket: WebSocket) -> None:
    """Send done event to indicate streaming completion."""
    await websocket.send_json({"type": "done"})
    logger.info("Done sent")
