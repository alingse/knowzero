"""Route Agent Node."""

from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def route_agent_node(state: AgentState) -> AgentState:
    """Make routing decision based on intent.
    
    Decides:
    - generate_new: Create new document
    - update_doc: Update existing document
    - navigate: Navigate to existing document
    - plan: Generate learning path
    """
    intent = state.get("intent", {})
    intent_type = intent.get("intent_type", "question")
    current_doc_id = state.get("current_doc_id")
    
    logger.info(
        "Route Agent deciding",
        intent_type=intent_type,
        current_doc_id=current_doc_id,
    )
    
    # Make routing decision
    decision = _make_decision(intent_type, current_doc_id, state)
    state["routing_decision"] = decision
    
    logger.info(
        "Routing decision made",
        action=decision.get("action"),
        mode=decision.get("mode"),
    )
    
    return state


def _make_decision(intent_type: str, current_doc_id: int | None, state: AgentState) -> dict:
    """Make routing decision based on intent type."""
    
    decision_map = {
        "new_topic": {
            "action": "generate_new",
            "mode": "standard",
            "reasoning": "New topic request - create new document",
        },
        "follow_up": {
            "action": "update_doc" if current_doc_id else "generate_new",
            "mode": "expand",
            "reasoning": "Follow-up - expand current document" if current_doc_id else "No current doc - create new",
        },
        "optimize_content": {
            "action": "update_doc" if current_doc_id else "generate_new",
            "mode": _get_optimization_mode(state),
            "reasoning": "Optimize based on user feedback",
        },
        "navigate": {
            "action": "navigate",
            "mode": "direct",
            "reasoning": "Navigate to existing document",
        },
        "comparison": {
            "action": "generate_new",
            "mode": "comparison",
            "reasoning": "Create comparison document",
        },
        "plan": {
            "action": "plan",
            "mode": "learning_path",
            "reasoning": "Generate learning path",
        },
    }
    
    decision = decision_map.get(intent_type, {
        "action": "generate_new",
        "mode": "standard",
        "reasoning": f"Default routing for intent type: {intent_type}",
    })
    
    # Add target if available
    intent = state.get("intent", {})
    if intent.get("target"):
        decision["target"] = intent["target"]
    
    return decision


def _get_optimization_mode(state: AgentState) -> str:
    """Get optimization mode based on user need."""
    intent = state.get("intent", {})
    user_need = intent.get("user_need", "")
    
    mode_map = {
        "more_examples": "add_examples",
        "more_depth": "add_depth",
        "more_clarity": "rewrite",
        "different_angle": "rephrase",
    }
    
    return mode_map.get(user_need, "add_examples")


def route_by_intent(state: AgentState) -> str:
    """Route to next node based on intent.

    Returns node name for conditional edge.
    """
    intent = state.get("intent", {})
    intent_type = intent.get("intent_type", "question")

    if intent_type == "chitchat":
        return "chitchat_agent"
    if intent_type == "navigate":
        return "navigator_agent"

    # All other intents go through route agent
    return "route_agent"


def route_by_decision(state: AgentState) -> str:
    """Route based on routing decision.
    
    Returns node name for conditional edge.
    """
    decision = state.get("routing_decision", {})
    action = decision.get("action", "generate_new")
    
    if action == "navigate":
        return "navigator_agent"
    elif action == "plan":
        return "planner_agent"
    else:  # generate_new, update_doc, merge
        return "content_agent"
