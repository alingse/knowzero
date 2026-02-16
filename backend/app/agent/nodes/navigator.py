"""Navigator Agent Node."""

from langchain_core.messages import AIMessage

from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.services import document_service

logger = get_logger(__name__)


async def navigator_agent_node(state: AgentState) -> AgentState:
    """Handle navigation to existing documents.

    Looks up real documents from the database.
    """
    intent = state.get("intent", {})
    routing_decision = state.get("routing_decision", {})

    # Priority: routing_decision > intent
    target_doc_id = routing_decision.get("target_doc_id") or intent.get("target_doc_id")
    target = routing_decision.get("target") or intent.get("target", "")
    session_id = state.get("session_id", "")

    logger.info("Navigator Agent processing", target=target, target_doc_id=target_doc_id)

    doc = None
    try:
        async with get_db_session() as db:
            if target_doc_id:
                doc = await document_service.get_document(db, target_doc_id)
            else:
                doc = await document_service.find_document_by_topic(db, session_id, target)
    except Exception as e:
        logger.warning("Navigator DB lookup failed", error=str(e))

    if doc:
        navigation_target = {
            "type": "document",
            "document_id": doc.id,
            "title": doc.topic,
            "content": doc.content,
            "message": f"已找到关于 **{doc.topic}** 的文档",
        }
    else:
        navigation_target = {
            "type": "not_found",
            "document_id": None,
            "title": target,
            "message": f"未找到关于 **{target}** 的文档，将为你生成",
        }

    state["navigation_target"] = navigation_target
    state["messages"] = state.get("messages", []) + [
        AIMessage(content=navigation_target["message"])
    ]

    return state
