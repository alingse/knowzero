"""LangGraph main graph definition with checkpointer."""

from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.nodes import (
    chitchat_agent_node,
    content_agent_node,
    input_normalizer_node,
    intent_agent_node,
    navigator_agent_node,
    planner_agent_node,
    post_process_node,
    route_agent_node,
)
from app.agent.nodes.route import route_by_decision, route_by_intent
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


def _should_generate_document(state: AgentState) -> str:
    """Determine if we should generate a document after roadmap planning.

    Returns "END" if roadmap_only=True (modify mode), otherwise "content_agent".
    """
    if state.get("roadmap_only", False):
        return "END"
    return "content_agent"


def _route_after_navigator(state: AgentState) -> str:
    """Route after navigator based on whether document was found.

    Expected nav_target types:
    - "document": Found existing document, go to END
    - "not_found": Document not found, generate new one

    Returns "END" if document was found, otherwise "content_agent" to generate.
    """
    nav_target = state.get("navigation_target") or {}
    nav_type = nav_target.get("type", "")

    if nav_type == "document":
        return "END"
    return "content_agent"


def create_knowzero_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[AgentState]:
    """Create the KnowZero Agent workflow graph.

    Flow:
    1. input_normalizer - Normalize input
    2. intent_agent - Analyze intent
    3. [conditional] -> navigator (if navigate intent)
                   -> route_agent (otherwise)
    4. route_agent - Make routing decision
    5. [conditional] -> navigator (if navigate action)
                   -> content_agent (otherwise)
    6. content_agent - Generate/update content
    7. post_process - Extract entities and generate follow-ups
    """

    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("input_normalizer", input_normalizer_node)
    workflow.add_node("intent_agent", intent_agent_node)
    workflow.add_node("route_agent", route_agent_node)
    workflow.add_node("content_agent", content_agent_node)
    workflow.add_node("navigator_agent", navigator_agent_node)
    workflow.add_node("chitchat_agent", chitchat_agent_node)
    workflow.add_node("planner_agent", planner_agent_node)
    workflow.add_node("post_process", post_process_node)

    # Set entry point
    workflow.set_entry_point("input_normalizer")

    # Edges
    workflow.add_edge("input_normalizer", "intent_agent")

    workflow.add_conditional_edges(
        "intent_agent",
        route_by_intent,
        {
            "chitchat_agent": "chitchat_agent",
            "navigator_agent": "navigator_agent",
            "route_agent": "route_agent",
        },
    )

    workflow.add_conditional_edges(
        "route_agent",
        route_by_decision,
        {
            "navigator_agent": "navigator_agent",
            "planner_agent": "planner_agent",
            "content_agent": "content_agent",
        },
    )

    # Conditional edge after planner_agent:
    # - If roadmap_only=True, go to END (modified roadmap, no document)
    # - Otherwise, continue to content_agent (new roadmap, generate first document)
    workflow.add_conditional_edges(
        "planner_agent",
        _should_generate_document,
        {
            "END": END,
            "content_agent": "content_agent",
        },
    )

    workflow.add_edge("content_agent", "post_process")
    workflow.add_edge("post_process", END)

    # Conditional edge after navigator_agent:
    # - If document was found, go to END
    # - If document not found (not_found), go to content_agent to generate
    workflow.add_conditional_edges(
        "navigator_agent",
        _route_after_navigator,
        {
            "END": END,
            "content_agent": "content_agent",
        },
    )

    workflow.add_edge("chitchat_agent", END)

    return workflow.compile(checkpointer=checkpointer)  # type: ignore[return-value]


# Global instances
_checkpointer = None
_graph = None


def get_checkpointer() -> MemorySaver:
    """Get or create global checkpointer."""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MemorySaver()
        logger.info("MemorySaver checkpointer created")
    return _checkpointer


def get_graph() -> CompiledStateGraph[AgentState]:
    """Get or create global graph instance with checkpointer."""
    global _graph
    if _graph is None:
        _graph = create_knowzero_graph(checkpointer=get_checkpointer())
        logger.info("KnowZero graph created with checkpointer")
    return _graph
