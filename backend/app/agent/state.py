"""LangGraph Agent State definition."""

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    input_source: str
    raw_message: str
    user_id: int
    session_id: str

    comment_data: dict[str, Any] | None
    entity_data: dict[str, Any] | None
    intent_hint: str | None

    current_doc_id: int | None
    user_level: str
    learned_topics: list[str]
    recent_docs: list[int]
    available_docs: list[dict[str, Any]]

    current_roadmap: dict[str, Any] | None
    roadmap_modified: bool
    roadmap_only: bool

    messages: Annotated[list[BaseMessage], add_messages]

    intent: dict[str, Any] | None
    routing_decision: dict[str, Any] | None

    document: dict[str, Any] | None
    roadmap: dict[str, Any] | None
    follow_up_questions: list[dict[str, Any]]
    change_summary: str | None
    response: dict[str, Any] | None

    navigation_target: dict[str, Any] | None

    error: str | None
    metadata: dict[str, Any]
