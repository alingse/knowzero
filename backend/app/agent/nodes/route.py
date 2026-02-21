"""Agentic Route Agent Node - makes intelligent routing decisions based on context."""

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agent.llm import get_llm
from app.agent.state import AgentState
from app.core.database import get_db_session
from app.core.logging import get_logger
from app.services import document_service

logger = get_logger(__name__)


# ============================================================================
# Pydantic Models: Structured Output
# ============================================================================


class RouteDecision(BaseModel):
    """Routing decision output from LLM."""

    action: str = Field(description="Next action: generate_new | update_doc | navigate | plan")
    mode: str = Field(
        description="Execution mode: standard | roadmap_learning | "
        "roadmap_generate | roadmap_modify | explain_selection | comparison"
    )
    target: str | None = Field(default=None, description="Learning target if applicable")
    target_doc_id: int | None = Field(
        default=None, description="Target document ID for navigate action"
    )
    reasoning: str = Field(description="Explanation of why this decision was made")
    confidence: float = Field(default=0.8, description="Decision confidence (0.0 - 1.0)")


# ============================================================================
# Fast Path: Rule-based Matching for Obvious Cases
# ============================================================================

# Obvious routing decisions (no LLM needed)
OBVIOUS_DECISIONS = {
    # Simple new topic without roadmap
    ("new_topic", False): {
        "action": "generate_new",
        "mode": "standard",
        "reasoning": "New topic without roadmap, generate standalone document",
    },
    # Follow-up with current document
    ("follow_up", "has_current_doc"): {
        "action": "update_doc",
        "mode": "expand",
        "reasoning": "Follow-up on current document",
    },
    # Follow-up without current document
    ("follow_up", None): {
        "action": "generate_new",
        "mode": "standard",
        "reasoning": "Follow-up without current doc, create new",
    },
    # Comparison analysis
    ("comparison", None): {
        "action": "generate_new",
        "mode": "comparison",
        "reasoning": "Generate comparison document",
    },
    # Explain selected content
    ("optimize_content", None): {
        "action": "generate_new",
        "mode": "explain_selection",
        "reasoning": "Generate new document to explain selected content",
    },
}


# ============================================================================
# Main Node Function
# ============================================================================


async def route_agent_node(state: AgentState) -> AgentState:
    """Agentic routing: make autonomous decisions based on full context.

    Responsibilities:
    - Input: intent (user intent) + complete session context
    - Process: hybrid strategy (rules + LLM reasoning)
    - Output: routing_decision (next action)

    Design Philosophy:
    - Obvious cases take fast path (rule matching, < 1ms)
    - Complex cases take smart path (LLM reasoning, ~500ms)
    - Output reasoning for debugging and optimization
    """
    intent = state.get("intent") or {}
    intent_type = intent.get("intent_type", "question")
    current_roadmap = state.get("current_roadmap")
    current_doc_id = state.get("current_doc_id")

    logger.info(
        "Route Agent processing",
        intent_type=intent_type,
        has_roadmap=current_roadmap is not None,
        current_doc_id=current_doc_id,
    )

    # ========== Fast Path: Obvious Cases ==========
    fast_decision = _try_fast_route(intent_type, current_doc_id, current_roadmap, state)
    if fast_decision:
        logger.info(
            "Fast route decision",
            action=fast_decision["action"],
            reasoning=fast_decision["reasoning"],
        )
        state["routing_decision"] = {
            **fast_decision,
            "method": "rule",
        }
        return state

    # ========== Smart Path: LLM Reasoning ==========
    # Fetch available documents for routing decision
    await _fetch_available_docs(state)

    context = _build_decision_context(state)
    llm_decision = await _llm_route_decision(context, get_llm())

    # ========== Override: First topic must generate roadmap ==========
    # If this is a first topic (no roadmap, no documents), override LLM's decision
    if intent_type == "new_topic" and not current_roadmap and not state.get("recent_docs"):
        logger.info(
            "Overriding LLM decision: first topic must generate roadmap",
            original_mode=llm_decision.get("mode"),
            original_action=llm_decision.get("action"),
        )
        # Override to plan action with roadmap_generate mode
        llm_decision["action"] = "plan"
        llm_decision["mode"] = "roadmap_generate"
        llm_decision["reasoning"] = (
            "首次学习新主题，自动生成学习路线图。原决策: " + llm_decision.get("reasoning", "")
        )

    # ========== Override: Navigate without target_doc_id should generate_new ==========
    # If LLM chose navigate but didn't provide a valid target_doc_id, fallback to generate_new
    if llm_decision.get("action") == "navigate" and not llm_decision.get("target_doc_id"):
        logger.info(
            "Overriding LLM decision: navigate without target_doc_id, falling back to generate_new",
            original_reasoning=llm_decision.get("reasoning"),
        )
        llm_decision["action"] = "generate_new"
        # Keep the same mode (could be roadmap_learning or standard)
        llm_decision["reasoning"] = (
            "导航未指定目标文档ID，改为生成新文档。原决策: " + llm_decision.get("reasoning", "")
        )

    logger.info(
        "LLM route decision",
        action=llm_decision["action"],
        mode=llm_decision["mode"],
        reasoning=llm_decision["reasoning"],
        confidence=llm_decision["confidence"],
    )

    state["routing_decision"] = {
        **llm_decision,
        "method": "llm",
    }
    return state


def _try_fast_route(
    intent_type: str,
    current_doc_id: int | None,
    current_roadmap: dict[str, object] | None,
    state: AgentState,
) -> dict[str, object] | None:
    """Attempt fast routing decision (rule matching).

    Returns decision dict if matched, otherwise None.
    """
    # Skip fast path for first topic without roadmap - let LLM decide
    if intent_type == "new_topic" and not current_roadmap and not state.get("recent_docs"):
        logger.info(
            "First topic without roadmap - skipping fast path for LLM decision",
            intent_type=intent_type,
            has_roadmap=current_roadmap is not None,
            has_documents=bool(state.get("recent_docs")),
        )
        return None  # Let LLM router handle this

    # Build lookup key
    if intent_type == "follow_up":
        key = ("follow_up", "has_current_doc" if current_doc_id else None)
    elif intent_type in ("new_topic", "comparison", "optimize_content"):
        key = (intent_type, None)
    else:
        return None

    decision = OBVIOUS_DECISIONS.get(key)
    if decision:
        result: dict[str, object] = dict(decision)
        # Add target if available
        intent_val = state.get("intent", {})
        if intent_val and intent_val.get("target"):
            result["target"] = intent_val["target"]
        return result

    return None


async def _fetch_available_docs(state: AgentState) -> None:
    """Fetch available documents (id + title only) for routing decision."""
    session_id = state.get("session_id", "")
    if not session_id:
        state["available_docs"] = []
        return

    try:
        async with get_db_session() as db:
            docs = await document_service.list_session_documents(db, session_id)
            state["available_docs"] = [
                {"id": doc.id, "title": doc.topic, "created_at": doc.created_at.isoformat()}
                for doc in docs
            ]
        logger.info("Fetched available docs", count=len(state["available_docs"]))
    except Exception as e:
        logger.warning("Failed to fetch available docs", error=str(e))
        state["available_docs"] = []


def _build_decision_context(state: AgentState) -> dict[str, Any]:
    """Build complete decision context.

    This is key to Agentic: give LLM enough information to make decisions.
    """
    current_roadmap = state.get("current_roadmap")
    intent_val = state.get("intent") or {}

    context = {
        # User input
        "user_message": state.get("raw_message", ""),
        "detected_intent": intent_val,
        "detected_target": intent_val.get("target"),
        # Session state
        "has_roadmap": current_roadmap is not None,
        "current_roadmap_summary": _summarize_roadmap(current_roadmap),
        "current_doc_id": state.get("current_doc_id"),
        # User context
        "user_level": state.get("user_level", "beginner"),
        "learned_topics": state.get("learned_topics", []),
        "recent_docs": state.get("recent_docs", []),
        "available_docs": state.get("available_docs", []),
        # Roadmap progress (if any)
        "milestone_progress": _get_milestone_progress(state) if current_roadmap else None,
    }

    return context


def _summarize_roadmap(roadmap: dict[str, Any] | None) -> str:
    """Generate roadmap summary for LLM understanding."""
    if not roadmap:
        return "无"

    milestones = roadmap.get("milestones", [])
    if not milestones:
        return f"「{roadmap.get('goal', '')}」，无阶段"

    milestone_summary = "; ".join(
        [
            f"阶段{m.get('id')}: {m.get('title')}"
            for m in milestones[:5]  # Only first 5
        ]
    )

    return f"「{roadmap.get('goal', '')}」，共 {len(milestones)} 个阶段: {milestone_summary}"


def _get_milestone_progress(state: AgentState) -> list[dict[str, object]]:
    """Get milestone progress (if roadmap exists).

    This info helps LLM make smarter decisions.
    """
    # TODO: Call progress calculation service or get from cache
    # Simplified: return empty list for now
    return []


# ============================================================================
# LLM Smart Decision
# ============================================================================


async def _llm_route_decision(context: dict[str, Any], llm: Any) -> dict[str, Any]:
    """Use LLM for intelligent routing decision.

    This is the core of Agentic: LLM is not a simple classifier,
    but a decision-maker based on full context.
    """

    system_prompt = """你是 KnowZero 学习平台的路由决策 Agent。

你的任务是根据用户输入和会话状态，决定下一步的行动。

**可用的行动**：
1. **generate_new** - 生成新的学习文档
2. **update_doc** - 更新/扩展现有文档
3. **navigate** - 导航到现有文档
4. **plan** - 生成/修改学习路线图

**可用的模式**：
- **standard**: 标准生成（无路线图上下文）
- **roadmap_learning**: 在路线图内学习（生成文档并自动关联到里程碑）
- **roadmap_generate**: 生成新路线图（首次）
- **roadmap_modify**: 修改现有路线图
- **explain_selection**: 解释用户选中的文本
- **comparison**: 对比分析

**决策原则**（按优先级排列）：
1. 用户首次表达系统性学习需求（new_topic），且没有路线图 → action=plan, mode=roadmap_generate
2. 用户已有路线图，且表达调整意图（太简单、太基础、调整等）→ action=plan, mode=roadmap_modify
3. 用户已有路线图，学习具体知识点 → action=generate_new, mode=roadmap_learning
4. 用户没有路线图，学习具体知识点 → action=generate_new, mode=standard
5. 用户选中文本并评论 → action=generate_new, mode=explain_selection
6. 用户想对比概念 → action=generate_new, mode=comparison
7. 用户问简单事实性问题（question）→ action=generate_new, mode=standard（生成简短文档）
8. 用户问实践操作问题（question_practical）→ action=generate_new, mode=standard（生成实践指南）

**关于 navigate 行为**：
- 只有在「可用文档」列表中存在与用户问题相关的文档时，才选择 navigate
- 如果没有可用文档或现有文档与问题不相关，应选择 generate_new
- 导航时必须在 target_doc_id 字段中指定要导航到的文档 ID

**关于用户角色和应用场景**：
- 注意用户的角色水平（beginner/intermediate/expert），影响内容深度
- 注意用户的应用场景（如 backend、data science），影响内容方向
- 将这些信息体现在 target 中，如 "TiDB（后端应用）"

**重要**：
- 必须从用户输入中提取学习目标（target），如果检测到的意图有 target 则使用它
- 如果无法从上下文确定 target，使用用户的原始输入作为 target
- target 字段不能为 null

返回 JSON 格式，包含 reasoning 字段解释你的决策逻辑。"""

    user_prompt = _build_user_prompt(context)

    try:
        # Use json_mode instead of function_calling for DeepSeek compatibility
        structured_llm = llm.with_structured_output(RouteDecision, method="json_mode")
        result: RouteDecision = await structured_llm.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
        )

        return result.model_dump()

    except Exception as e:
        logger.warning("LLM routing failed, using fallback", error=str(e))
        # Fallback to simple rules
        return _fallback_routing(context)


def _build_user_prompt(context: dict[str, Any]) -> str:
    """Build user prompt for LLM."""

    intent = context["detected_intent"]
    parts = [
        "**用户输入**：",
        context["user_message"],
        "",
        "**检测到的意图**：",
        f"- 类型: {intent.get('intent_type', 'unknown')}",
        f"- 目标: {context['detected_target'] or '无'}",
        f"- 用户角色: {intent.get('user_role', 'beginner')}",
        f"- 应用场景: {intent.get('context', '') or '无'}",
        "",
        "**会话状态**：",
        f"- 用户水平: {context['user_level']}",
        f"- 是否有路线图: {'是' if context['has_roadmap'] else '否'}",
        f"- 当前路线图: {context['current_roadmap_summary']}",
        f"- 当前文档ID: {context['current_doc_id'] or '无'}",
        f"- 已学主题: {', '.join(context['learned_topics'][-5:]) if context['learned_topics'] else '无'}",
    ]

    # Add milestone progress if available
    if context.get("milestone_progress"):
        parts.append("")
        parts.append("**里程碑进度**：")
        for ms in context["milestone_progress"]:
            parts.append(f"- 阶段{ms['id']} ({ms['title']}): {ms['progress']:.0%}")

    # Add available documents
    parts.append("")
    if context.get("available_docs"):
        parts.append("**可用文档**：")
        for doc in context["available_docs"]:
            parts.append(f"- ID {doc['id']}: {doc['title']}")
    else:
        parts.append("**可用文档**：无")

    parts.append("")
    parts.append("**请决策下一步行动**：")

    return "\n".join(parts)


def _fallback_routing(context: dict[str, Any]) -> dict[str, Any]:
    """Fallback routing strategy: simple rules when LLM fails."""

    intent_type = context["detected_intent"].get("intent_type", "question")
    has_roadmap = context["has_roadmap"]
    # Use detected_target first, fallback to user_message, then default
    target = context["detected_target"] or context["user_message"] or "新主题"

    # Conservative strategy
    if intent_type == "plan" and not has_roadmap:
        return {
            "action": "plan",
            "mode": "roadmap_generate",
            "target": target,
            "reasoning": "Fallback: plan intent without roadmap",
            "confidence": 0.5,
        }

    return {
        "action": "generate_new",
        "mode": "roadmap_learning" if has_roadmap else "standard",
        "target": target,
        "reasoning": "Fallback: default to generate_new",
        "confidence": 0.5,
    }


# ============================================================================
# Conditional Edge Functions (for graph.py)
# ============================================================================


def route_by_intent(state: AgentState) -> str:
    """Route to next node based on intent.

    Returns node name for conditional edge.
    """
    intent = state.get("intent") or {}
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
    decision = state.get("routing_decision") or {}
    action = decision.get("action", "generate_new")

    if action == "navigate":
        return "navigator_agent"
    if action == "plan":
        return "planner_agent"
    return "content_agent"
