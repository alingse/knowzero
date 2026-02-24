"""Topic Planner Agent - 主题规划师.

负责管理学习主题(Topic)和学习路线图(Roadmap)的所有相关操作：
- establish_topic: 首次建立学习主题和路线图
- roadmap_generate: 在现有主题下重新生成路线图
- roadmap_modify: 调整现有路线图
- topic_switch: 切换学习主题（可选）
"""

import json
from typing import Any, cast

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.agent.llm import get_llm
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================


class RoadmapMilestone(BaseModel):
    """A milestone in the learning roadmap."""

    id: int = Field(description="Sequential ID of the milestone")
    title: str = Field(description="Title of the milestone")
    description: str = Field(description="Brief description of what will be learned")
    topics: list[str] = Field(description="List of key topics to cover in this milestone")


class RoadmapOutput(BaseModel):
    """Structured output for the roadmap generator."""

    goal: str = Field(description="The main learning goal")
    milestones: list[RoadmapMilestone] = Field(description="4-6 sequential learning milestones")
    mermaid: str = Field(description="Mermaid fishbone diagram code for visualization")


# ============================================================================
# Prompts
# ============================================================================

ROADMAP_GENERATION_PROMPT = """
你是一个专业的学习路径规划专家。你的任务是为学习者提供一个系统、科学的学习路线图（Roadmap）。

要求：
1. 确定核心学习目标
2. 将学习路径拆分为 4-6 个逻辑递进的阶段（Milestones）
3. 每个阶段包含：
   - id: 阶段编号（从 0 开始）
   - title: 标题
   - description: 简短描述
   - topics: 核心知识点列表
4. 生成一个 Mermaid 格式的鱼骨图（Fishbone Diagram），用于可视化学习路径。
   - 鱼骨图应以"学习目标"为主干
   - 各个阶段为大骨，知识点为小骨

**个性化要求**：
- 根据用户的角色水平（beginner/intermediate/expert）调整内容深度
- 根据用户的应用场景（如 backend、data science）调整学习方向和侧重点
- beginner: 从基础概念开始，循序渐进
- intermediate: 跳过基础，聚焦进阶和实践
- expert: 聚焦高级特性、源码分析、性能优化

**重要**：必须严格按照以下 JSON 格式返回，字段名必须完全匹配：
{
  "goal": "学习目标描述",
  "milestones": [
    {"id": 0, "title": "阶段1", "description": "描述", "topics": ["主题1", "主题2"]},
    {"id": 1, "title": "阶段2", "description": "描述", "topics": ["主题1", "主题2"]}
  ],
  "mermaid": "graph TD\\n    ..."
}

注意：
- goal 不是 learning_goal
- mermaid 不是 fishbone_diagram
- 每个 milestone 必须有 id 字段（从 0 开始的整数）
"""

ROADMAP_MODIFY_PROMPT = """
你是学习路径规划专家。用户要修改现有路线图，请根据要求调整。

修改规则：
- 合并阶段：将多个阶段合并为一个，保留所有 topics
- 插入阶段：在指定位置后添加新阶段，调整后续 ID
- 删除阶段：移除指定阶段，重新排列 ID
- 调整顺序：按用户要求重排阶段，保持 ID 连续
- 降级/升级：调整 topics 难度，保持阶段数量不变
- 跳过基础：移除或简化基础阶段

注意：
- 保持 goal 与原标题一致，除非用户明确要求更改主题
- 返回调整后的完整路线图 JSON
"""


# ============================================================================
# Main Entry Point
# ============================================================================


async def topic_planner_node(state: AgentState) -> AgentState:
    """Topic Planner - 管理主题和路线图的核心节点.

    根据 routing_decision.mode 分发到不同的处理逻辑：
    - establish_topic: 首次建立主题（设置 session_topic + 生成 roadmap + 生成首个文档）
    - roadmap_generate: 重新生成路线图（保留 session_topic）
    - roadmap_modify: 修改现有路线图
    """
    decision = state.get("routing_decision") or {}
    mode = decision.get("mode", "roadmap_generate")
    target = _resolve_target(state)
    user_level = state.get("user_level", "beginner")
    current_roadmap = state.get("current_roadmap")
    current_topic = state.get("session_topic")

    logger.info(
        "Topic Planner processing",
        mode=mode,
        target=target,
        current_topic=current_topic,
        has_roadmap=current_roadmap is not None,
    )

    # 模式分发
    if mode == "establish_topic":
        return await _handle_establish_topic(state, target, user_level)

    elif mode == "roadmap_modify":
        return await _handle_modify_roadmap(state, user_level)

    elif mode == "roadmap_generate":
        return await _handle_generate_roadmap(state, target, user_level)

    else:
        # 默认行为：生成路线图
        logger.warning(f"Unknown mode: {mode}, fallback to roadmap_generate")
        return await _handle_generate_roadmap(state, target, user_level)


# ============================================================================
# Mode Handlers
# ============================================================================


async def _handle_establish_topic(state: AgentState, target: str, user_level: str) -> AgentState:
    """处理首次建立主题.

    职责：
    1. 提取并设置 session_topic
    2. 生成初始 roadmap
    3. 标记继续生成首个文档
    4. 标记 session 需要更新
    """
    # 1. 清洗并设置主题
    topic = _clean_topic(target)
    state["session_topic"] = topic
    state["pending_session_update"] = {"learning_goal": topic}

    logger.info(
        "Establishing new topic",
        topic=topic,
        original_target=target,
    )

    # 2. 生成路线图
    result = await _generate_roadmap(state, topic, user_level)
    roadmap = cast(dict[str, Any], result.get("roadmap"))
    state["roadmap"] = roadmap

    # 3. 首次主题建立后，继续生成首个文档
    state["roadmap_only"] = False
    state["roadmap_modified"] = False

    logger.info(
        "Topic established",
        topic=topic,
        roadmap_goal=roadmap.get("goal") if roadmap else None,
    )

    return state


async def _handle_generate_roadmap(state: AgentState, target: str, user_level: str) -> AgentState:
    """处理重新生成路线图（保留现有 session_topic）.

    使用场景：
    - 用户在现有主题下要求"重新规划"
    - 用户想深入某个子主题，需要新的路线图
    """
    current_topic = state.get("session_topic")

    # 如果目标与当前主题不同，记录但不改变 session_topic
    if current_topic and target != current_topic:
        logger.info(
            "Generating roadmap for sub-topic",
            current_topic=current_topic,
            sub_topic=target,
        )

    result = await _generate_roadmap(state, target, user_level)
    state["roadmap"] = cast(dict[str, Any], result.get("roadmap"))

    # 检查是否只需要路线图
    if _is_roadmap_only_request(state):
        state["roadmap_only"] = True
        logger.info("Roadmap-only request: will not generate document")
    else:
        state["roadmap_only"] = False

    state["roadmap_modified"] = False

    return state


async def _handle_modify_roadmap(state: AgentState, user_level: str) -> AgentState:
    """处理修改现有路线图.

    职责：
    1. 根据用户反馈调整 roadmap
    2. 保持 session_topic 不变
    3. 不生成新文档（只修改规划）
    """
    current_roadmap = state.get("current_roadmap")

    if not current_roadmap:
        logger.warning("No current roadmap to modify, generating new one")
        target = state.get("session_topic") or state.get("raw_message", "新主题")
        return await _handle_generate_roadmap(state, target, user_level)

    result = await _modify_roadmap(state, user_level)
    state["roadmap"] = cast(dict[str, Any], result.get("roadmap"))

    # 修改后不生成文档，只返回更新后的 roadmap
    state["roadmap_only"] = True
    state["roadmap_modified"] = True

    logger.info("Roadmap modified", topic=state.get("session_topic"))

    return state


# ============================================================================
# Core Functions
# ============================================================================


def _clean_topic(target: str) -> str:
    """清洗主题文本，移除常见前缀后缀."""
    if not target:
        return "新主题"

    # 移除常见前缀
    prefixes = ["我想学", "我想了解", "教教我", "学习", "了解一下"]
    cleaned = target
    for prefix in prefixes:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :].strip()

    # 移除常见后缀
    suffixes = ["入门", "基础", "教程", "指南"]
    for suffix in suffixes:
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()

    return cleaned or target


def _resolve_target(state: AgentState) -> str:
    """解析学习目标."""
    intent = state.get("intent") or {}
    decision = state.get("routing_decision") or {}
    current_topic = state.get("session_topic")
    user_message = state.get("raw_message", "")

    # 优先级：decision.target > intent.target > current_topic > user_message
    target = decision.get("target") or intent.get("target", "")

    if not target:
        target = current_topic or user_message

    return target or "新主题"


def _is_roadmap_only_request(state: AgentState) -> bool:
    """判断用户是否只需要路线图（不生成文档）.

    完全依赖 LLM 的意图识别能力。只有当 LLM 明确识别为 "plan" 意图时，
    才认为用户只需要路线图而不生成文档。

    这样设计的原因：
    1. LLM 能更好理解用户意图的细微差别
    2. 避免关键词匹配的误判（如"学习路线"可能只是表达学习目标）
    3. 系统行为更可预测、更一致
    """
    intent = state.get("intent") or {}
    intent_type = intent.get("intent_type", "")
    return isinstance(intent_type, str) and intent_type == "plan"


# ============================================================================
# LLM Operations
# ============================================================================


async def _generate_roadmap(state: AgentState, target: str, user_level: str) -> dict[str, Any]:
    """调用 LLM 生成路线图."""
    llm = get_llm()
    intent = state.get("intent") or {}
    user_role = intent.get("user_role", user_level) or user_level
    context = intent.get("context", "") or ""

    # 构建个性化提示
    prompt_parts = [f"请为「{target}」生成一个适合 {user_role} 水平的学习路线图。"]
    if context:
        prompt_parts.append(f"应用场景为：{context}，请围绕该场景设计学习内容和实践案例。")
    user_prompt = "\n".join(prompt_parts)

    try:
        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")
        result = cast(
            RoadmapOutput,
            await structured_llm.ainvoke(
                [
                    SystemMessage(content=ROADMAP_GENERATION_PROMPT),
                    HumanMessage(content=user_prompt),
                ]
            ),
        )

        roadmap = {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": 1,
        }

        logger.info("Roadmap generated successfully", goal=roadmap.get("goal"))
        return {"roadmap": roadmap}

    except Exception as e:
        logger.warning("Structured output failed, using fallback", error=str(e))
        return await _generate_roadmap_fallback(state, target, user_level, e)


async def _generate_roadmap_fallback(
    state: AgentState, target: str, user_level: str, original_error: Exception
) -> dict[str, Any]:
    """生成路线图的降级方案."""
    llm = get_llm()
    intent = state.get("intent") or {}
    context = intent.get("context", "") or ""

    try:
        prompt_parts = [
            f"请为「{target}」生成一个适合 {user_level} 水平的学习路线图。只返回 JSON 格式，不要其他内容。"
        ]
        if context:
            prompt_parts.append(f"应用场景为：{context}。")

        resp = await llm.ainvoke(
            [
                SystemMessage(content=ROADMAP_GENERATION_PROMPT),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )

        content = resp.content
        raw_content = content.strip() if isinstance(content, str) else str(content)

        # 清理 markdown 代码块
        if raw_content.startswith("```"):
            raw_content = raw_content.strip("`").removeprefix("json").removeprefix("JSON")

        roadmap = json.loads(raw_content)

        # 规范化字段名
        if "learning_goal" in roadmap and "goal" not in roadmap:
            roadmap["goal"] = roadmap.pop("learning_goal")
        if "fishbone_diagram" in roadmap and "mermaid" not in roadmap:
            roadmap["mermaid"] = roadmap.pop("fishbone_diagram")

        # 验证结构
        if not isinstance(roadmap, dict) or "goal" not in roadmap:
            raise ValueError("Invalid roadmap structure")

        # 确保 milestone IDs 连续
        for i, milestone in enumerate(roadmap.get("milestones", [])):
            milestone["id"] = i

        roadmap["version"] = 1

        logger.info("Roadmap generated (fallback)", goal=roadmap.get("goal"))
        return {"roadmap": roadmap}

    except Exception as e:
        logger.error("Roadmap generation failed", error=str(e), original_error=str(original_error))

        # 返回最小化 roadmap
        return {
            "roadmap": {
                "goal": target,
                "milestones": [
                    {
                        "id": 0,
                        "title": "学习规划",
                        "description": f"关于 {target} 的学习路径",
                        "topics": [],
                    }
                ],
                "mermaid": None,
                "version": 1,
            },
            "error": "Failed to generate roadmap. Please try rephrasing your request.",
        }


async def _modify_roadmap(state: AgentState, user_level: str) -> dict[str, Any]:
    """调用 LLM 修改现有路线图."""
    current_roadmap = state.get("current_roadmap")
    modify_instruction = state.get("raw_message", "")
    llm = get_llm()

    if not current_roadmap:
        raise ValueError("No current roadmap to modify")

    try:
        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")
        current_summary = _summarize_roadmap(current_roadmap)

        result = cast(
            RoadmapOutput,
            await structured_llm.ainvoke(
                [
                    SystemMessage(content=ROADMAP_MODIFY_PROMPT),
                    HumanMessage(
                        content=f"""当前路线图：
{current_summary}

用户修改要求：{modify_instruction}

请返回修改后的完整路线图。"""
                    ),
                ]
            ),
        )

        # 版本号 +1
        roadmap = {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": int(current_roadmap.get("version", 1) or 1) + 1,
        }

        logger.info(
            "Roadmap modified successfully",
            goal=roadmap.get("goal"),
            new_version=roadmap["version"],
        )

        return {"roadmap": roadmap}

    except Exception as e:
        logger.error("Roadmap modification failed", error=str(e))
        return {"roadmap": current_roadmap, "error": str(e)}


def _summarize_roadmap(roadmap: dict[str, Any]) -> str:
    """生成路线图摘要用于修改提示."""
    milestones = roadmap.get("milestones", [])
    if not isinstance(milestones, list):
        milestones = []

    descriptions = []
    for m in milestones:
        if not isinstance(m, dict):
            continue
        m_id = m.get("id", 0)
        m_title = m.get("title", "")
        m_description = m.get("description", "")
        m_topics = m.get("topics", [])
        if not isinstance(m_topics, list):
            m_topics = []

        desc = f"  阶段 {m_id}: {m_title}\n"
        desc += f"    描述: {m_description}\n"
        desc += f"    知识点: {', '.join(str(t) for t in m_topics)}"
        descriptions.append(desc)

    newline = "\n"
    return f"""目标: {roadmap.get("goal", "")}
版本: {roadmap.get("version", 1)}

阶段:
{newline.join(descriptions)}"""


# 保持向后兼容的别名
planner_agent_node = topic_planner_node
