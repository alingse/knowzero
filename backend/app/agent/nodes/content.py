"""Content Agent Node - generates and updates documents via LLM."""

import asyncio
import json
import time
from collections.abc import Callable
from typing import Any, cast

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.llm import get_llm
from app.agent.llm_utils import parse_llm_json_response
from app.agent.state import AgentState
from app.core.logging import get_logger

# Type alias for better readability
MilestoneDict = dict[str, Any]

logger = get_logger(__name__)

GENERATE_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容生成引擎。根据用户的学习需求，生成结构化的学习文档。

要求：
1. 使用 Markdown 格式
2. 包含标题、简介、核心概念、示例代码（如适用）、总结
3. 内容准确、易懂，适合 {level} 水平的学习者
4. 在文档中自然地提到相关概念（这些会成为实体词）
5. 保持内容聚焦，不要过于冗长
{context_instruction}
输出格式要求：
直接输出 Markdown 文档内容，不要包含额外的说明。"""

ROADMAP_LEARNING_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容生成引擎。用户正在按照学习路线图系统学习，请生成与当前里程碑相关的学习文档。

学习路线图目标：{roadmap_goal}
当前里程碑：{milestone_title} - {milestone_description}
里程碑知识点：{milestone_topics}

要求：
1. 使用 Markdown 格式
2. 内容应紧密围绕当前里程碑的知识点
3. 内容准确、易懂，适合 {level} 水平的学习者
4. 在文档中自然地提到相关概念（这些会成为实体词）
5. 包含与里程碑知识点相关的实践示例
{context_instruction}
输出格式要求：
直接输出 Markdown 文档内容，不要包含额外的说明。"""

EXPLAIN_SELECTION_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容解释引擎。用户在学习文档中选中了一段内容，需要你生成一个新的学习文档来详细解释它。

**原文档主题**：{doc_topic}
{roadmap_context}
**重要**：选中的内容来自「{doc_topic}」相关的学习文档，请在该主题的语境下解释，不要脱离原文档的技术领域。

用户需求分析:
- more_examples: 用户觉得太抽象，需要更多实例
- more_depth: 用户想了解更深的原理
- more_clarity: 用户觉得不够清楚，需要更通俗的解释
- different_angle: 用户希望换个角度理解

要求：
1. 使用 Markdown 格式
2. 标题应该反映选中内容在「{doc_topic}」中的具体含义
3. 结合选中文本的上下文和原文档主题来理解用户困惑
4. 内容准确、易懂，适合 {level} 水平的学习者
5. 在文档中自然地提到相关概念（这些会成为实体词）
6. 保持内容聚焦，直接解决用户的问题

输出格式要求：
直接输出 Markdown 文档内容，不要包含额外的说明。"""

UPDATE_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容优化引擎。根据用户反馈优化已有文档。

优化模式: {mode}
- add_examples: 添加更多实际示例和代码
- add_depth: 深入分析原理和底层机制
- rewrite: 用更清晰的方式重写
- rephrase: 换一个角度解释
- expand: 扩展补充更多内容

要求：
1. 保留原文档的整体结构
2. 在需要优化的部分进行改进
3. 输出完整的优化后文档（Markdown 格式）"""

FOLLOW_UP_SYSTEM_PROMPT = """\
根据以下学习文档，生成 3 个有价值的追问问题，帮助学习者深入理解。

要求：
- 第 1 个：基础概念确认（type: basic）
- 第 2 个：深入原理探究（type: deep）
- 第 3 个：实践应用场景（type: practice）

输出格式（JSON 数组）：
[{"question": "...", "type": "basic"}, {"question": "...", "type": "deep"}, {"question": "...", "type": "practice"}]

只返回 JSON 数组，不要其他内容。"""

ENTITY_EXTRACT_PROMPT = """\
从以下学习文档中提取关键实体词（技术概念、工具、库、框架等）。
只返回一个 JSON 数组，如 ["React", "Virtual DOM", "JSX"]。不要其他内容。

文档：
{content}"""

MILESTONE_CLASSIFY_PROMPT = """\
根据文档内容，判断它最匹配学习路线图的哪个阶段。

文档标题: {doc_topic}
文档摘要: {doc_summary}

学习路线图:
{milestones_json}

规则：
1. 返回最匹配的阶段 id（数字）
2. 如果文档内容跨多个阶段，选择最主要的那个
3. 如果完全不匹配任何阶段，返回 -1

只返回一个数字，不要其他内容。"""


async def content_agent_node(state: AgentState) -> AgentState:
    """Generate or update document content via LLM."""
    decision = state.get("routing_decision") or {}
    action = decision.get("action", "generate_new")
    mode = decision.get("mode", "standard")

    logger.info("Content Agent processing", action=action, mode=mode)

    try:
        if action == "update_doc":
            result = await _update_document(state, mode)
        else:
            result = await _generate_document(state, mode)

        doc_val = result.get("document")
        follow_up_val = result.get("follow_up_questions", [])
        change_summary_val = result.get("change_summary")

        state["document"] = cast(dict[str, Any], doc_val) if doc_val else None
        state["follow_up_questions"] = (
            cast(list[dict[str, Any]], follow_up_val) if isinstance(follow_up_val, list) else []
        )
        state["change_summary"] = (
            change_summary_val if isinstance(change_summary_val, str) else None
        )

        doc = result.get("document", {}) or {}
        doc_topic = doc.get("topic") if isinstance(doc, dict) else None
        state["messages"] = state.get("messages", []) + [
            AIMessage(content=f"已生成文档: {doc_topic if doc_topic else '新文档'}")
        ]

    except GeneratorExit as e:
        # GeneratorExit is raised when a generator is closed prematurely
        # This is NOT an error - LangGraph uses it for control flow
        logger.warning(
            "Content agent interrupted by GeneratorExit",
            action=action,
            mode=mode,
            error=str(e),
        )
        # Re-raise to let LangGraph handle it properly
        state["error"] = f"Content generation interrupted: {str(e)}"
        raise
    except Exception as e:
        logger.error("Content generation failed", error=str(e), exc_info=True)
        state["error"] = str(e)
        state["messages"] = state.get("messages", []) + [
            AIMessage(content=f"抱歉，生成内容时出错: {str(e)}")
        ]

    return state


async def _generate_document(state: AgentState, mode: str) -> dict[str, object]:
    """Generate new document using LLM."""
    decision = state.get("routing_decision") or {}
    intent = state.get("intent") or {}
    # Use intent target first, fallback to decision target, then raw message, then default
    target = intent.get("target") or decision.get("target") or state.get("raw_message", "新主题")
    user_level = state.get("user_level", "beginner")
    llm = get_llm()

    logger.info("_generate_document started", target=target, mode=mode)

    # Build prompts based on mode
    system, user_prompt = _build_generation_prompts(state, mode, target, user_level, intent or {})

    try:
        start_time = time.monotonic()
        logger.info(
            "LLM stream started",
            target=target,
            mode=mode,
            model=str(type(llm)),
            timeout=getattr(llm, "timeout", "not set"),
        )

        content = ""
        async for chunk in llm.astream(
            [
                SystemMessage(content=system),
                HumanMessage(content=user_prompt),
            ]
        ):
            chunk_content = chunk.content
            if isinstance(chunk_content, str):
                content += chunk_content
            else:
                content += str(chunk_content)

        elapsed = time.monotonic() - start_time
        logger.info(
            "LLM stream completed",
            target=target,
            mode=mode,
            elapsed_seconds=f"{elapsed:.2f}",
            content_length=len(content),
        )

    except GeneratorExit:
        # GeneratorExit is a special exception - should NOT be caught normally
        elapsed = time.monotonic() - start_time
        logger.error(
            "LLM stream failed with GeneratorExit",
            target=target,
            mode=mode,
            elapsed_seconds=f"{elapsed:.2f}",
            exc_info=True,
        )
        # Re-raise to let LangGraph handle it
        raise
    except Exception as e:
        elapsed = time.monotonic() - start_time
        logger.error(
            "LLM stream failed",
            target=target,
            mode=mode,
            error=str(e),
            error_type=type(e).__name__,
            elapsed_seconds=f"{elapsed:.2f}",
            exc_info=True,
        )
        raise

    # Generate category path
    category_path = _generate_category_path(target)

    document: dict[str, object] = {
        "id": None,
        "topic": target,
        "content": content,
        "category_path": category_path,
        "entities": [],
        "version": 1,
    }

    return {
        "document": document,
        "follow_up_questions": [],
        "change_summary": f"创建了关于 {target} 的新文档",
    }


def _build_comparison_prompts(
    state: AgentState, target: str, user_level: str, intent: dict[str, object]
) -> tuple[str, str]:
    return (
        GENERATE_SYSTEM_PROMPT.format(level=user_level, context_instruction=""),
        f"请生成一篇对比分析文档：{target}",
    )


def _build_standard_prompts(
    state: AgentState, target: str, user_level: str, intent: dict[str, object]
) -> tuple[str, str]:
    intent_context = intent.get("context", "")
    if intent_context:
        context_instruction = (
            f"6. 内容应围绕「{intent_context}」应用场景展开，示例和案例应与该场景相关\n"
        )
    else:
        context_instruction = ""
    return (
        GENERATE_SYSTEM_PROMPT.format(level=user_level, context_instruction=context_instruction),
        f"请生成关于「{target}」的学习文档。",
    )


def _build_explain_selection_prompts(
    state: AgentState, user_level: str, intent: dict[str, object]
) -> tuple[str, str]:
    """Build prompts for explain_selection mode."""
    comment_data = state.get("comment_data") or {}
    selected_text = comment_data.get("selected_text", "")
    context_before = comment_data.get("context_before", "")
    context_after = comment_data.get("context_after", "")
    user_comment = state.get("raw_message", "")
    user_need = intent.get("user_need", "more_examples")

    doc_topic = _resolve_doc_topic(state, comment_data)

    # Build roadmap context string
    current_roadmap = state.get("current_roadmap")
    roadmap_context = ""
    if current_roadmap:
        roadmap_context = f"**学习路线图**：{current_roadmap.get('goal', '')}\n"

    # Build context snippet
    context_parts = []
    if context_before:
        context_parts.append(f"...{context_before}")
    context_parts.append(f"**[{selected_text}]**")
    if context_after:
        context_parts.append(f"{context_after}...")
    context_snippet = "".join(context_parts)

    # User need description for the prompt
    need_descriptions = {
        "more_examples": "用户觉得这部分太抽象，需要更多具体例子",
        "more_depth": "用户想深入了解这部分的原理和底层机制",
        "more_clarity": "用户觉得这部分不够清楚，需要更通俗的解释",
        "different_angle": "用户希望换个角度来理解这部分内容",
    }

    need_desc = (
        need_descriptions.get(user_need, "需要进一步解释")
        if isinstance(user_need, str)
        else "需要进一步解释"
    )
    system = EXPLAIN_SELECTION_SYSTEM_PROMPT.format(
        doc_topic=doc_topic,
        roadmap_context=roadmap_context,
        level=user_level,
    )
    user_prompt = (
        f"用户正在学习「{doc_topic}」，在文档中选中了这段内容：\n\n{context_snippet}\n\n"
        f"用户评论：{user_comment}\n\n"
        f"需求分析：{need_desc}\n\n"
        f"请在「{doc_topic}」的语境下生成一个新的学习文档来详细解释选中内容。"
    )
    return system, user_prompt


def _build_roadmap_learning_prompts(
    state: AgentState, target: str, user_level: str, intent: dict[str, object]
) -> tuple[str, str]:
    current_roadmap = state.get("current_roadmap") or {}
    milestones = current_roadmap.get("milestones", [])
    if not isinstance(milestones, list):
        milestones = []
    intent_context = intent.get("context", "")
    context_instruction = (
        f"6. 内容应围绕「{intent_context}」应用场景展开\n" if intent_context else ""
    )

    milestone_info = _find_matching_milestone(target, milestones)
    if milestone_info:
        milestone_topics = milestone_info.get("topics", [])
        if not isinstance(milestone_topics, list):
            milestone_topics = []
        system = ROADMAP_LEARNING_SYSTEM_PROMPT.format(
            roadmap_goal=str(current_roadmap.get("goal", "")),
            milestone_title=str(milestone_info.get("title", "")),
            milestone_description=str(milestone_info.get("description", "")),
            milestone_topics=", ".join(str(t) for t in milestone_topics),
            level=user_level,
            context_instruction=context_instruction,
        )
    else:
        system = GENERATE_SYSTEM_PROMPT.format(
            level=user_level, context_instruction=context_instruction
        )
    return system, f"请生成关于「{target}」的学习文档。"


_PROMPT_BUILDERS: dict[str, Callable[..., tuple[str, str]]] = {
    "explain_selection": cast(Callable[..., tuple[str, str]], _build_explain_selection_prompts),
    "comparison": _build_comparison_prompts,
    "roadmap_learning": _build_roadmap_learning_prompts,
    "standard": _build_standard_prompts,
}


def _build_generation_prompts(
    state: AgentState, mode: str, target: str, user_level: str, intent: dict[str, object]
) -> tuple[str, str]:
    """Build system and user prompts for document generation using strategy pattern.

    Returns:
        Tuple of (system_prompt, user_prompt)
    """
    builder = _PROMPT_BUILDERS.get(mode, _build_standard_prompts)

    # explain_selection has a different signature (no target parameter)
    if mode == "explain_selection":
        return builder(state, user_level, intent)
    # All other modes use the same signature
    return builder(state, target, user_level, intent)


async def _update_document(state: AgentState, mode: str) -> dict[str, object]:
    current_doc = state.get("document") or {}
    raw_message = state.get("raw_message", "")
    llm = get_llm()

    existing_content = current_doc.get("content", "")
    system = UPDATE_SYSTEM_PROMPT.format(mode=mode)
    user_prompt = (
        f"原文档：\n\n{existing_content}\n\n用户反馈：{raw_message}\n\n请按照 {mode} 模式优化文档。"
    )

    content = ""
    async for chunk in llm.astream(
        [
            SystemMessage(content=system),
            HumanMessage(content=user_prompt),
        ]
    ):
        chunk_content = chunk.content
        if isinstance(chunk_content, str):
            content += chunk_content
        else:
            content += str(chunk_content)

    mode_descriptions = {
        "add_examples": "添加了更多示例",
        "add_depth": "增加了深入分析",
        "rewrite": "重写了部分内容",
        "rephrase": "用不同角度解释了概念",
        "expand": "扩展了更多内容",
    }

    updated_doc = {
        **current_doc,
        "content": content,
        "version": current_doc.get("version", 1) + 1,
    }

    return {
        "document": updated_doc,
        "follow_up_questions": [],
        "change_summary": mode_descriptions.get(mode, "更新了文档"),
    }


async def _extract_entities_llm(content: str) -> list[str]:
    """Extract entities from content using LLM."""
    try:
        llm = get_llm()
        resp = await llm.ainvoke(
            [
                HumanMessage(content=ENTITY_EXTRACT_PROMPT.format(content=content[:2000])),
            ]
        )
        # Handle different content types from LLM response
        resp_content = resp.content
        if isinstance(resp_content, str):
            parsed = parse_llm_json_response(resp_content)
            # Parsed can be dict or list, ensure we return list[str]
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
            else:
                return list(parsed.values()) if parsed else []
        else:
            # For non-string content, try to extract as list
            content_list = list(resp_content) if hasattr(resp_content, "__iter__") else []
            return [str(item) for item in content_list]
    except Exception as e:
        logger.warning("Entity extraction failed", error=str(e))
        return []


async def _generate_follow_ups(content: str) -> list[dict[str, object]]:
    """Generate follow-up questions using LLM."""
    try:
        llm = get_llm()
        resp = await llm.ainvoke(
            [
                SystemMessage(content=FOLLOW_UP_SYSTEM_PROMPT),
                HumanMessage(content=f"文档内容：\n\n{content[:3000]}"),
            ]
        )
        resp_content = resp.content
        if isinstance(resp_content, str):
            parsed = parse_llm_json_response(resp_content)
            # Ensure we return list[dict[str, object]]
            if isinstance(parsed, list):
                return [
                    dict(item) if isinstance(item, dict) else {"question": str(item)}
                    for item in parsed
                ]
            else:
                # If parsed is a dict, wrap it in a list
                return [parsed] if parsed else []
        else:
            # For non-string content
            content_list = list(resp_content) if hasattr(resp_content, "__iter__") else []
            return [
                dict(item) if isinstance(item, dict) else {"question": str(item)}
                for item in content_list
            ]
    except Exception as e:
        logger.warning("Follow-up generation failed", error=str(e))
        return []


async def _classify_milestone(
    doc_topic: str, doc_summary: str, roadmap: dict[str, object] | None
) -> int | None:
    """Classify document to a milestone using LLM.

    Returns milestone ID or None if no roadmap/no match.
    """
    if not roadmap:
        return None

    milestones = roadmap.get("milestones", [])
    if not isinstance(milestones, list) or not milestones:
        return None

    try:
        llm = get_llm()
        # Ensure milestones are dicts before processing
        milestones_list = [m for m in milestones if isinstance(m, dict)]
        if not milestones_list:
            return None

        milestones_json = json.dumps(
            [
                {k: m[k] for k in ("id", "title", "description", "topics") if k in m}
                for m in milestones_list
            ],
            ensure_ascii=False,
            indent=2,
        )

        resp = await llm.ainvoke(
            [
                HumanMessage(
                    content=MILESTONE_CLASSIFY_PROMPT.format(
                        doc_topic=doc_topic,
                        doc_summary=doc_summary[:500],
                        milestones_json=milestones_json,
                    )
                ),
            ]
        )

        content = resp.content
        result = content.strip() if isinstance(content, str) else str(content)
        milestone_id = int(result)

        if milestone_id < 0:
            logger.info("Document doesn't match any milestone", topic=doc_topic)
            return None

        logger.info("Document classified to milestone", topic=doc_topic, milestone_id=milestone_id)
        return milestone_id

    except Exception as e:
        logger.warning("Milestone classification failed", error=str(e))
        return None


def _resolve_doc_topic(state: AgentState, comment_data: dict[str, object]) -> str:
    doc_id = comment_data.get("document_id")
    if doc_id:
        available_docs = state.get("available_docs", [])
        for doc in available_docs:
            if doc.get("id") == doc_id:
                return str(doc.get("title", ""))

    current_doc = state.get("document")
    if current_doc and current_doc.get("topic"):
        return str(current_doc.get("topic", ""))

    intent = state.get("intent") or {}
    target = intent.get("target") or state.get("raw_message", "")
    return str(target)[:50] if target else ""


def _find_matching_milestone(
    target: str, milestones: list[dict[str, object]]
) -> dict[str, object] | None:
    if not milestones:
        return None

    target_lower = target.lower()
    for milestone in milestones:
        if not isinstance(milestone, dict):
            continue
        milestone_topics = milestone.get("topics", [])
        if not isinstance(milestone_topics, list):
            milestone_topics = []
        topics = [str(t).lower() for t in milestone_topics]
        title = str(milestone.get("title", "")).lower()
        if target_lower in title or any(target_lower in t or t in target_lower for t in topics):
            return milestone

    return None


def _generate_category_path(topic: str) -> str:
    """Generate category path for document."""
    # Handle None or empty topic
    if not topic:
        topic = "其他"
    tech_keywords = {
        "react": "前端/React",
        "vue": "前端/Vue",
        "angular": "前端/Angular",
        "css": "前端/CSS",
        "html": "前端/HTML",
        "javascript": "前端/JavaScript",
        "typescript": "前端/TypeScript",
        "python": "后端/Python",
        "java": "后端/Java",
        "go": "后端/Go",
        "rust": "后端/Rust",
        "node": "后端/Node.js",
        "sql": "数据库/SQL",
        "redis": "数据库/Redis",
        "mongodb": "数据库/MongoDB",
        "docker": "DevOps/Docker",
        "k8s": "DevOps/Kubernetes",
        "kubernetes": "DevOps/Kubernetes",
        "算法": "计算机基础/算法",
        "数据结构": "计算机基础/数据结构",
        "网络": "计算机基础/网络",
        "操作系统": "计算机基础/操作系统",
    }

    topic_lower = topic.lower()
    for keyword, category in tech_keywords.items():
        if keyword in topic_lower:
            return f"{category}/{topic}"

    return f"其他/{topic}"


async def post_process_node(state: AgentState) -> AgentState:
    """Post-process: extract entities, generate follow-ups, and classify milestone in parallel."""
    document = state.get("document")
    if not document or not document.get("content"):
        logger.info("post_process skipped: no document content")
        return state

    content = document["content"]
    logger.info("post_process started", content_length=len(content))

    # Get current roadmap for milestone classification
    current_roadmap = state.get("current_roadmap")

    # Parallel execution: entities, follow-ups, milestone classification
    results = await asyncio.gather(
        _extract_entities_llm(content),
        _generate_follow_ups(content),
        _classify_milestone(document.get("topic", ""), content[:500], current_roadmap),
    )

    entities, follow_ups, milestone_id = results

    document["entities"] = entities
    # Update roadmap and milestone association
    if milestone_id is not None:
        document["milestone_id"] = milestone_id
        document["roadmap_id"] = current_roadmap.get("id") if current_roadmap else None
        logger.info(
            "post_process milestone assigned",
            milestone_id=milestone_id,
            roadmap_id=document.get("roadmap_id"),
        )

    state["document"] = document
    state["follow_up_questions"] = follow_ups

    logger.info(
        "post_process completed",
        entities=len(entities),
        follow_ups=len(follow_ups),
        milestone_id=milestone_id,
    )
    return state
