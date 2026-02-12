"""LangGraph main graph definition with checkpointer."""

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.agent.nodes import (
    chitchat_agent_node,
    content_agent_node,
    input_normalizer_node,
    intent_agent_node,
    navigator_agent_node,
    route_agent_node,
)
from app.agent.nodes.route import route_by_decision, route_by_intent
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


def create_knowzero_graph(checkpointer=None):
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
    """

    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("input_normalizer", input_normalizer_node)
    workflow.add_node("intent_agent", intent_agent_node)
    workflow.add_node("route_agent", route_agent_node)
    workflow.add_node("content_agent", content_agent_node)
    workflow.add_node("navigator_agent", navigator_agent_node)
    workflow.add_node("chitchat_agent", chitchat_agent_node)

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
            "planner_agent": "content_agent",
            "content_agent": "content_agent",
        },
    )

    workflow.add_edge("content_agent", END)
    workflow.add_edge("navigator_agent", END)
    workflow.add_edge("chitchat_agent", END)

    return workflow.compile(checkpointer=checkpointer)


# Global instances
_checkpointer = None
_graph = None


def get_checkpointer():
    """Get or create global checkpointer."""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MemorySaver()
        logger.info("MemorySaver checkpointer created")
    return _checkpointer


def get_graph():
    """Get or create global graph instance with checkpointer."""
    global _graph
    if _graph is None:
        _graph = create_knowzero_graph(checkpointer=get_checkpointer())
        logger.info("KnowZero graph created with checkpointer")
    return _graph
