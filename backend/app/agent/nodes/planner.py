"""Planner Agent Node - generates and modifies structured learning roadmaps."""

import json

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

PLANNER_SYSTEM_PROMPT = """
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

MODIFY_SYSTEM_PROMPT = """
你是学习路径规划专家。用户要修改现有路线图，请根据要求调整。

修改规则：
- 合并阶段：将多个阶段合并为一个，保留所有 topics
- 插入阶段：在指定位置后添加新阶段，调整后续 ID
- 删除阶段：移除指定阶段，重新排列 ID
- 调整顺序：按用户要求重排阶段，保持 ID 连续
- 降级/升级：调整 topics 难度，保持阶段数量不变
- 跳过基础：移除或简化基础阶段

返回调整后的完整路线图 JSON。"""


# ============================================================================
# Main Node Function
# ============================================================================


async def planner_agent_node(state: AgentState) -> AgentState:
    """Generate or modify learning roadmap.

    Supports two modes:
    - Generate: Create new roadmap from scratch
    - Modify: Adjust existing roadmap based on user feedback
    """
    decision = state.get("routing_decision", {})
    mode = decision.get("mode", "roadmap_generate")
    # Use intent target first, fallback to raw message, then default
    intent = state.get("intent", {})
    target = decision.get("target") or intent.get("target") or state.get("raw_message", "新主题")
    user_level = state.get("user_level", "beginner")
    current_roadmap = state.get("current_roadmap")

    logger.info(
        "Planner Agent processing",
        mode=mode,
        target=target,
        has_current_roadmap=current_roadmap is not None,
    )

    # Check if this is a modify request
    if mode == "roadmap_modify" and current_roadmap:
        result = await _modify_roadmap(state, user_level)
        state["roadmap"] = result["roadmap"]
        state["roadmap_only"] = True  # Don't generate document after modifying
        state["roadmap_modified"] = True
        return state

    # Generate new roadmap
    result = await _generate_roadmap(state, target, user_level)
    state["roadmap"] = result["roadmap"]
    state["roadmap_only"] = False  # Continue to generate document
    state["roadmap_modified"] = False

    return state


async def _generate_roadmap(state: AgentState, target: str, user_level: str) -> dict:
    """Generate new roadmap from scratch."""

    llm = get_llm()
    intent = state.get("intent", {})
    user_role = intent.get("user_role", user_level)
    context = intent.get("context", "")

    # Build personalized user prompt
    prompt_parts = [f"请为「{target}」生成一个适合 {user_role} 水平的学习路线图。"]
    if context:
        prompt_parts.append(f"应用场景为：{context}，请围绕该场景设计学习内容和实践案例。")
    user_prompt = "\n".join(prompt_parts)

    try:
        # Try using LangChain's structured output for reliable JSON parsing
        # Use json_mode for DeepSeek compatibility
        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")

        result: RoadmapOutput = await structured_llm.ainvoke(
            [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ]
        )

        # Convert Pydantic model to dict for state storage
        roadmap = {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": 1,
        }

        logger.info("Roadmap generated successfully", goal=roadmap.get("goal"))
        return {"roadmap": roadmap}

    except Exception as structured_error:
        # Fallback: Try manual JSON parsing if structured output fails
        logger.warning(
            "Structured output failed, falling back to manual JSON parsing",
            error=str(structured_error),
        )
        return await _generate_roadmap_fallback(target, user_level, context, structured_error)


async def _generate_roadmap_fallback(
    target: str, user_level: str, context: str, structured_error: Exception
) -> dict:
    """Fallback roadmap generation using manual JSON parsing."""

    llm = get_llm()

    try:
        prompt_parts = [
            f"请为「{target}」生成一个适合 {user_level} 水平的学习路线图。只返回 JSON 格式，不要其他内容。"
        ]
        if context:
            prompt_parts.append(f"应用场景为：{context}。")

        resp = await llm.ainvoke(
            [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(content="\n".join(prompt_parts)),
            ]
        )

        raw_content = resp.content.strip()
        # Remove markdown code blocks if present
        if raw_content.startswith("```"):
            raw_content = raw_content.strip("`").removeprefix("json").removeprefix("JSON")

        roadmap = json.loads(raw_content)

        # Handle LLM's wrong field names - normalize them
        # LLM sometimes returns "learning_goal" instead of "goal"
        if "learning_goal" in roadmap and "goal" not in roadmap:
            roadmap["goal"] = roadmap.pop("learning_goal")
        # LLM sometimes returns "fishbone_diagram" instead of "mermaid"
        if "fishbone_diagram" in roadmap and "mermaid" not in roadmap:
            roadmap["mermaid"] = roadmap.pop("fishbone_diagram")

        # Validate the structure
        if not isinstance(roadmap, dict):
            raise ValueError("Roadmap must be a dictionary")
        if "goal" not in roadmap:
            raise ValueError("Roadmap must contain 'goal' field")
        if "milestones" not in roadmap or not isinstance(roadmap["milestones"], list):
            raise ValueError("Roadmap must contain 'milestones' list")

        # Ensure milestone IDs are sequential
        for i, milestone in enumerate(roadmap["milestones"]):
            milestone["id"] = i

        roadmap["version"] = 1

        logger.info("Roadmap generated successfully (fallback)", goal=roadmap.get("goal"))
        return {"roadmap": roadmap}

    except Exception as fallback_error:
        logger.error(
            "Roadmap generation failed (both methods)",
            structured_error=str(structured_error),
            fallback_error=str(fallback_error),
            exc_info=True,
        )

        # Set a minimal roadmap to prevent downstream errors
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


async def _modify_roadmap(state: AgentState, user_level: str) -> dict:
    """Modify existing roadmap based on user request."""

    current_roadmap = state.get("current_roadmap")
    modify_instruction = state.get("raw_message", "")
    llm = get_llm()

    if not current_roadmap:
        logger.warning("Cannot modify roadmap: no current roadmap")
        # Fall back to generate mode
        target = state.get("raw_message", "新主题")
        return await _generate_roadmap(state, target, user_level)

    try:
        # Use json_mode for DeepSeek compatibility
        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")

        # Build current roadmap summary for context
        current_summary = _summarize_current_roadmap(current_roadmap)

        result: RoadmapOutput = await structured_llm.ainvoke(
            [
                SystemMessage(content=MODIFY_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"""当前路线图：
{current_summary}

用户修改要求：{modify_instruction}

请返回修改后的路线图。"""
                ),
            ]
        )

        # Increment version
        roadmap = {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": current_roadmap.get("version", 1) + 1,
        }

        logger.info(
            "Roadmap modified successfully",
            goal=roadmap.get("goal"),
            new_version=roadmap["version"],
        )

        # TODO: Trigger document remapping here
        # This would be done in a follow-up to handle reassigning
        # documents to new milestone IDs

        return {"roadmap": roadmap}

    except Exception as e:
        logger.error("Roadmap modification failed", error=str(e), exc_info=True)
        # Return current roadmap unchanged
        return {"roadmap": current_roadmap, "error": str(e)}


def _summarize_current_roadmap(roadmap: dict) -> str:
    """Generate a summary of the current roadmap for the modification prompt."""

    milestones = roadmap.get("milestones", [])

    milestone_descriptions = []
    for m in milestones:
        desc = f"  阶段 {m['id']}: {m['title']}\n"
        desc += f"    描述: {m['description']}\n"
        desc += f"    知识点: {', '.join(m.get('topics', []))}"
        milestone_descriptions.append(desc)

    return f"""目标: {roadmap.get("goal", "")}
版本: {roadmap.get("version", 1)}

阶段:
{chr(10).join(milestone_descriptions)}"""
