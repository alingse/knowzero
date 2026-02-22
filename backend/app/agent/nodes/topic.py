"""Topic Agent Node - Establish session topic and generate initial roadmap + document."""

from typing import Any, cast

from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.llm import get_llm
from app.agent.nodes.planner import PLANNER_SYSTEM_PROMPT, RoadmapOutput
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


async def topic_agent_node(state: AgentState) -> AgentState:
    """Establish session topic, generate roadmap, and prepare for first document.

    Flow:
    1. Extract learning topic from intent
    2. Set session_topic in state
    3. Mark for session update (to be persisted by websocket handler)
    4. Generate roadmap
    5. Set roadmap_only=False to continue to content_agent for first document

    Note: This node is designed for the future implementation where topic_agent
    handles the complete flow. Currently, the route_agent's override logic
    handles the first tech entity scenario by setting generate_doc_after_roadmap.
    """
    intent = state.get("intent") or {}
    target = intent.get("target", "")
    user_role = intent.get("user_role", "beginner")
    context = intent.get("context", "")
    session_id = state.get("session_id", "")

    logger.info(
        "Topic Agent: establishing session topic",
        target=target,
        user_role=user_role,
        session_id=session_id,
    )

    # 1. Resolve the learning topic
    topic = _resolve_topic(state, target)
    state["session_topic"] = topic

    # 2. Mark for session update (to be persisted by websocket handler)
    state["pending_session_update"] = {"learning_goal": topic}

    # 3. Generate roadmap
    roadmap_data = await _generate_roadmap(state, topic, user_role, context)
    state["roadmap"] = roadmap_data

    # 4. Continue to content_agent for first document
    state["roadmap_only"] = False
    state["roadmap_modified"] = False

    logger.info(
        "Topic Agent: session topic established",
        topic=topic,
        has_roadmap=bool(roadmap_data),
    )

    return state


def _resolve_topic(state: AgentState, target: str) -> str:
    """Resolve and normalize the learning topic.

    Cleans up common prefixes and suffixes to extract the core topic.
    """
    # Clean up common prefixes
    prefixes = ["我想学", "我想了解", "教教我", "学习", "了解一下"]
    cleaned = target
    for prefix in prefixes:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :].strip()

    # Remove common suffixes
    suffixes = ["入门", "基础", "教程", "指南"]
    for suffix in suffixes:
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()

    return cleaned or target or state.get("raw_message", "新主题")


async def _generate_roadmap(
    state: AgentState,
    topic: str,
    user_role: str,
    context: str,
) -> dict[str, Any]:
    """Generate roadmap for the topic.

    This is similar to planner._generate_roadmap but focused on topic establishment.
    """
    llm = get_llm()

    prompt_parts = [f"请为「{topic}」生成一个适合 {user_role} 水平的学习路线图。"]
    if context:
        prompt_parts.append(f"应用场景为：{context}。")
    user_prompt = "\n".join(prompt_parts)

    try:
        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")
        result = cast(
            RoadmapOutput,
            await structured_llm.ainvoke(
                [
                    SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ]
            ),
        )

        return {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": 1,
        }
    except Exception as e:
        logger.error("Failed to generate roadmap in topic_agent", error=str(e))
        # Fallback minimal roadmap
        return {
            "goal": topic,
            "milestones": [
                {
                    "id": 0,
                    "title": "学习规划",
                    "description": f"关于 {topic} 的学习路径",
                    "topics": [],
                }
            ],
            "mermaid": None,
            "version": 1,
        }
