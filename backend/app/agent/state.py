"""LangGraph Agent State definition."""

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Unified Agent State for KnowZero.
    
    This state is passed between all agents in the graph.
    """
    
    # === Input Information ===
    input_source: str  # "chat" | "comment" | "entity" | "follow_up" | "entry"
    raw_message: str
    user_id: int
    session_id: str
    
    # === Source-specific Data ===
    comment_data: Annotated[dict | None, "Comment data for COMMENT source"]
    entity_data: Annotated[dict | None, "Entity data for ENTITY source"]
    intent_hint: Annotated[str | None, "Intent hint for FOLLOW_UP source"]
    
    # === Context ===
    current_doc_id: Annotated[int | None, "Current document ID"]
    user_level: Annotated[str, "User experience level"]
    learned_topics: Annotated[list[str], "Topics the user has learned"]
    recent_docs: Annotated[list[int], "Recently accessed documents"]
    
    # === Messages (with reducer) ===
    messages: Annotated[list, add_messages]
    
    # === Intent Agent Output ===
    intent: Annotated[dict | None, "Intent analysis result"]
    
    # === Route Agent Output ===
    routing_decision: Annotated[dict | None, "Routing decision"]
    
    # === Final Results ===
    document: Annotated[dict | None, "Generated/retrieved document"]
    follow_up_questions: Annotated[list, "Generated follow-up questions"]
    change_summary: Annotated[str | None, "Document change summary"]
    
    # === Navigation ===
    navigation_target: Annotated[dict | None, "Navigation target if applicable"]
    
    # === Metadata ===
    error: Annotated[str | None, "Error message if any"]
    metadata: Annotated[dict, "Additional metadata"]
