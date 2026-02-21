"""Intent Agent Node."""

from app.agent.classifier import get_classifier
from app.agent.llm import get_fast_llm
from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.services import entity_service

logger = get_logger(__name__)


async def intent_agent_node(state: AgentState) -> AgentState:
    """Analyze user intent from input.

    Uses layered classification strategy:
    1. Strong patterns (fast-track)
    2. Fuzzy matching
    3. LLM classification (if needed)
    """
    source = state.get("input_source", "chat")
    message = state.get("raw_message", "")

    logger.info(
        "Intent Agent analyzing",
        source=source,
        message_preview=message[:50],
    )

    classifier = get_classifier(llm=get_fast_llm())

    # Handle different input sources
    if source == "entity":
        intent = await _analyze_entity_intent(state)
    elif source == "comment":
        intent = await _analyze_comment_intent(state)
    elif source == "follow_up":
        intent = await _analyze_followup_intent(state)
    elif source == "entry":
        intent = _build_intent(
            "new_topic",
            message.strip(),
            confidence=0.95,
            complexity="simple",
            ambiguity="low",
            reasoning="Entry point - simple new topic",
        )
    else:  # chat
        intent = await classifier.classify(message, {})
        intent["complexity"] = _estimate_complexity(message)
        intent["ambiguity"] = _estimate_ambiguity(message)

    state["intent"] = intent

    logger.info(
        "Intent analysis complete",
        intent_type=intent.get("intent_type"),
        confidence=intent.get("confidence"),
        method=intent.get("method"),
    )

    return state


def _build_intent(
    intent_type: str,
    target: str,
    *,
    confidence: float = 0.85,
    complexity: str = "moderate",
    ambiguity: str = "medium",
    **kwargs: object,
) -> dict[str, object]:
    """Build intent dict with common fields.

    Args:
        intent_type: Type of intent (navigate, new_topic, etc.)
        target: Target topic or entity
        confidence: Confidence score (0.0 - 1.0)
        complexity: Query complexity (simple, moderate, complex)
        ambiguity: Query ambiguity (low, medium, high)
        **kwargs: Additional intent-specific fields

    Returns:
        Complete intent dictionary
    """
    return {
        "intent_type": intent_type,
        "target": target,
        "complexity": complexity,
        "ambiguity": ambiguity,
        "confidence": confidence,
        **kwargs,
    }


async def _analyze_entity_intent(state: AgentState) -> dict[str, object]:
    """Analyze entity click intent."""
    entity_data = state.get("entity_data") or {}
    entity_name = entity_data.get("entity_name", "")
    session_id = state.get("session_id", "")

    # Check if entity has existing documents via DB
    doc_id = None
    try:
        async with get_db_session() as db:
            doc_id = await entity_service.find_entity_document(db, session_id, entity_name)
    except Exception as e:
        logger.warning("Entity lookup failed", error=str(e))

    if doc_id:
        return _build_intent(
            "navigate",
            entity_name,
            confidence=0.95,
            complexity="simple",
            ambiguity="low",
            target_doc_id=doc_id,
            reasoning=f"Entity '{entity_name}' has existing document {doc_id}",
        )
    else:
        return _build_intent(
            "new_topic",
            entity_name,
            confidence=0.95,
            complexity="simple",
            ambiguity="low",
            reasoning=f"Need to create document for entity '{entity_name}'",
        )


async def _analyze_comment_intent(state: AgentState) -> dict[str, object]:
    """Analyze comment optimization intent.

    When user comments on selected text, generate a NEW document to explain it,
    not modify the existing document.
    """
    comment_data = state.get("comment_data") or {}
    comment = comment_data.get("comment", "")
    selected_text = comment_data.get("selected_text", "")

    # Analyze feedback keywords
    feedback_map = {
        "more_examples": ["太抽象", "太理论", "举例", "具体点", "实例"],
        "more_depth": ["太简单", "再深入", "原理", "底层", "为什么"],
        "more_clarity": ["看不懂", "不清楚", "太乱", "太复杂", "重新说"],
        "different_angle": ["换个说法", "另外的角度", "通俗点"],
    }

    user_need = None
    for need, keywords in feedback_map.items():
        if any(kw in comment for kw in keywords):
            user_need = need
            break

    if not user_need:
        user_need = "more_examples"  # Default

    # Use selected text as target for new document title
    # If no selected text, use a generic target
    target = selected_text[:50] if selected_text else "选中的内容"
    if len(selected_text) > 50:
        target += "..."

    return _build_intent(
        "optimize_content",
        target,
        confidence=0.85,
        complexity="moderate",
        ambiguity="medium",
        user_need=user_need,
        target_section=comment_data.get("section_id"),
        reasoning=f"Comment indicates need for {user_need}, will generate new document",
    )


async def _analyze_followup_intent(state: AgentState) -> dict[str, object]:
    """Analyze follow-up question intent."""
    intent_hint = state.get("intent_hint", "follow_up") or "follow_up"
    message = state.get("raw_message", "")

    return _build_intent(
        intent_hint,
        message or "",
        confidence=0.9,
        complexity="simple",
        ambiguity="low",
        reasoning="Follow-up question with intent hint",
    )


def _estimate_complexity(message: str) -> str:
    """Estimate query complexity."""
    length = len(message)

    if length < 20:
        return "simple"
    elif length < 100:
        return "moderate"
    else:
        return "complex"


def _estimate_ambiguity(message: str) -> str:
    """Estimate query ambiguity."""
    # Simple heuristics
    if "?" in message or "什么" in message or "怎么" in message:
        return "medium"

    if len(message) < 10:
        return "high"

    return "low"
