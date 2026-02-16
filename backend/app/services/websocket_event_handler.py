"""WebSocket event handler service.

This module provides context tracking for agent streaming events.
Event handler functions are defined here but may be moved to agent_streaming_service.py
if needed in the future for better modularity.
"""

from app.core.logging import get_logger

logger = get_logger(__name__)


class StreamContext:
    """Context for tracking streaming state during agent execution."""

    def __init__(self) -> None:
        self.placeholder_message_id: int | None = None
        self.accumulated_content: str = ""
        self.final_result: dict = {}
        # Document ID persisted when content_agent ends (used by post_process)
        self.doc_id: int | None = None
