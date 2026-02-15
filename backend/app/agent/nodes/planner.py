"""Planner Agent Node - generates structured learning roadmaps."""

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field

from app.agent.llm import get_llm
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)


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


PLANNER_SYSTEM_PROMPT = """
你是一个专业的学习路径规划专家。你的任务是为学习者提供一个系统、科学的学习路线图（Roadmap）。

要求：
1. 确定核心学习目标
2. 将学习路径拆分为 4-6 个逻辑递进的阶段（Milestones）
3. 每个阶段包含：
   - 标题 (title)
   - 简短描述 (description)
   - 核心知识点 (topics)
4. 生成一个 Mermaid 格式的鱼骨图（Fishbone Diagram），用于可视化学习路径。
   - 鱼骨图应以"学习目标"为主干
   - 各个阶段为大骨，知识点为小骨

请按照 JSON Schema 返回结果。"""


async def planner_agent_node(state: AgentState) -> AgentState:
    """Generate a learning roadmap for the target topic.

    Uses LangChain's structured output to ensure reliable JSON parsing.
    Falls back to manual JSON parsing if structured output fails.
    """
    decision = state.get("routing_decision", {})
    target = decision.get("target", state.get("raw_message", "新主题"))
    user_level = state.get("user_level", "beginner")

    logger.info("Planner Agent generating roadmap", target=target)

    llm = get_llm()

    try:
        # Try using LangChain's structured output for reliable JSON parsing
        structured_llm = llm.with_structured_output(RoadmapOutput)

        result: RoadmapOutput = await structured_llm.ainvoke(
            [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"请为「{target}」生成一个适合 {user_level} 水平的学习路线图。"
                ),
            ]
        )

        # Convert Pydantic model to dict for state storage
        roadmap = {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
        }

        state["roadmap"] = roadmap
        logger.info("Roadmap generated successfully", goal=roadmap.get("goal"))

    except Exception as structured_error:
        # Fallback: Try manual JSON parsing if structured output fails
        logger.warning(
            "Structured output failed, falling back to manual JSON parsing",
            error=str(structured_error),
        )
        try:
            resp = await llm.ainvoke(
                [
                    SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                    HumanMessage(
                        content=f"请为「{target}」生成一个适合 {user_level} 水平的学习路线图。只返回 JSON 格式，不要其他内容。"
                    ),
                ]
            )

            raw_content = resp.content.strip()
            # Remove markdown code blocks if present
            if raw_content.startswith("```"):
                raw_content = raw_content.strip("`").removeprefix("json").removeprefix("JSON")

            roadmap = json.loads(raw_content)

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

            state["roadmap"] = roadmap
            logger.info(
                "Roadmap generated successfully (fallback)", goal=roadmap.get("goal")
            )

        except Exception as fallback_error:
            logger.error(
                "Roadmap generation failed (both methods)",
                structured_error=str(structured_error),
                fallback_error=str(fallback_error),
                exc_info=True,
            )
            state["error"] = (
                f"Failed to generate roadmap. Please try rephrasing your request."
            )
            # Set a minimal roadmap to prevent downstream errors
            state["roadmap"] = {
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
            }

    return state
