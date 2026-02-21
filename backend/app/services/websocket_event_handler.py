"""WebSocket event handler service."""

from app.core.logging import get_logger

logger = get_logger(__name__)


class StreamContext:
    def __init__(self) -> None:
        self.placeholder_message_id: int | None = None
        self.accumulated_content: str = ""
        self.final_result: dict[str, object] = {}
        self.doc_id: int | None = None
