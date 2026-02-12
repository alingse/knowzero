"""Input Normalizer Node."""

from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def input_normalizer_node(state: AgentState) -> AgentState:
    """Normalize input from any source to AgentInput format.
    
    This node is the entry point for all user inputs.
    It validates and normalizes the input before passing to Intent Agent.
    """
    logger.info(
        "Input normalizer processing",
        source=state.get("input_source"),
        session_id=state.get("session_id"),
    )
    
    # Ensure required fields
    if not state.get("raw_message"):
        state["raw_message"] = ""
    
    if not state.get("user_level"):
        state["user_level"] = "beginner"
    
    if not state.get("learned_topics"):
        state["learned_topics"] = []
    
    if not state.get("recent_docs"):
        state["recent_docs"] = []
    
    # Set default metadata
    if not state.get("metadata"):
        state["metadata"] = {}
    
    # Add user message to messages list
    if state.get("raw_message") and state.get("input_source") == "chat":
        from langchain_core.messages import HumanMessage
        state["messages"] = state.get("messages", []) + [
            HumanMessage(content=state["raw_message"])
        ]
    
    logger.debug("Input normalized", state_keys=list(state.keys()))
    return state
