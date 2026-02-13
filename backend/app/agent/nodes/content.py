"""Content Agent Node - generates and updates documents via LLM."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.llm import get_llm
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

GENERATE_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容生成引擎。根据用户的学习需求，生成结构化的学习文档。

要求：
1. 使用 Markdown 格式
2. 包含标题、简介、核心概念、示例代码（如适用）、总结
3. 内容准确、易懂，适合 {level} 水平的学习者
4. 在文档中自然地提到相关概念（这些会成为实体词）
5. 保持内容聚焦，不要过于冗长

输出格式要求：
直接输出 Markdown 文档内容，不要包含额外的说明。"""

EXPLAIN_SELECTION_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的内容解释引擎。用户在文档中选中了一段内容，需要你生成一个新的学习文档来详细解释它。

用户需求分析:
- more_examples: 用户觉得太抽象，需要更多实例
- more_depth: 用户想了解更深的原理
- more_clarity: 用户觉得不够清楚，需要更通俗的解释
- different_angle: 用户希望换个角度理解

要求：
1. 使用 Markdown 格式
2. 标题应该反映选中内容的核心主题
3. 结合选中文本的上下文来理解用户困惑
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


async def content_agent_node(state: AgentState) -> AgentState:
    """Generate or update document content via LLM."""
    decision = state.get("routing_decision", {})
    action = decision.get("action", "generate_new")
    mode = decision.get("mode", "standard")

    logger.info("Content Agent processing", action=action, mode=mode)

    try:
        if action == "update_doc":
            result = await _update_document(state, mode)
        else:
            result = await _generate_document(state, mode)

        state["document"] = result.get("document")
        state["follow_up_questions"] = result.get("follow_up_questions", [])
        state["change_summary"] = result.get("change_summary")

        doc = result.get("document", {})
        state["messages"] = state.get("messages", []) + [
            AIMessage(content=f"已生成文档: {doc.get('topic', '新文档')}")
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


async def _generate_document(state: AgentState, mode: str) -> dict:
    """Generate new document using LLM."""
    import time

    decision = state.get("routing_decision", {})
    intent = state.get("intent", {})
    target = decision.get("target", "新主题")
    user_level = state.get("user_level", "beginner")
    llm = get_llm()

    logger.info("_generate_document started", target=target, mode=mode)

    # Handle explain_selection mode - user commented on selected text
    if mode == "explain_selection":
        comment_data = state.get("comment_data") or {}
        selected_text = comment_data.get("selected_text", "")
        context_before = comment_data.get("context_before", "")
        context_after = comment_data.get("context_after", "")
        user_comment = state.get("raw_message", "")
        user_need = intent.get("user_need", "more_examples")

        # Build context snippet
        context_parts = []
        if context_before:
            context_parts.append(f"...{context_before}")
        context_parts.append(f"**[{selected_text}]**")  # Mark selected text
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

        system = EXPLAIN_SELECTION_SYSTEM_PROMPT.format(level=user_level)
        user_prompt = (
            f"用户在文档中选中了这段内容：\n\n{context_snippet}\n\n"
            f"用户评论：{user_comment}\n\n"
            f"需求分析：{need_descriptions.get(user_need, '需要进一步解释')}\n\n"
            f"请生成一个新的学习文档来详细解释选中内容，直接解决用户的问题。"
        )
    elif mode == "comparison":
        system = GENERATE_SYSTEM_PROMPT.format(level=user_level)
        user_prompt = f"请生成一篇对比分析文档：{target}"
    else:
        # Standard generation
        system = GENERATE_SYSTEM_PROMPT.format(level=user_level)
        user_prompt = f"请生成关于「{target}」的学习文档。"

    try:
        start_time = time.monotonic()
        logger.info(
            "LLM stream started",
            target=target,
            mode=mode,
            model=str(type(llm)),
            timeout=getattr(llm, 'timeout', 'not set'),
        )

        # Use astream for streaming tokens
        content = ""
        async for chunk in llm.astream([
            SystemMessage(content=system),
            HumanMessage(content=user_prompt),
        ]):
            content += chunk.content

        elapsed = time.monotonic() - start_time
        logger.info(
            "LLM stream completed",
            target=target,
            mode=mode,
            elapsed_seconds=f"{elapsed:.2f}",
            content_length=len(content),
        )

    except GeneratorExit as e:
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

    # Entities and follow-ups are extracted asynchronously after document
    # is sent to client (see websocket.py background tasks)
    document = {
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


async def _update_document(state: AgentState, mode: str) -> dict:
    """Update existing document using LLM."""
    current_doc = state.get("document") or {}
    raw_message = state.get("raw_message", "")
    llm = get_llm()

    existing_content = current_doc.get("content", "")
    system = UPDATE_SYSTEM_PROMPT.format(mode=mode)
    user_prompt = (
        f"原文档：\n\n{existing_content}\n\n"
        f"用户反馈：{raw_message}\n\n"
        f"请按照 {mode} 模式优化文档。"
    )

    # Use astream for streaming tokens
    content = ""
    async for chunk in llm.astream([
        SystemMessage(content=system),
        HumanMessage(content=user_prompt),
    ]):
        content += chunk.content

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
        resp = await llm.ainvoke([
            HumanMessage(content=ENTITY_EXTRACT_PROMPT.format(content=content[:2000])),
        ])
        import json

        raw = resp.content.strip().strip("`").removeprefix("json")
        return json.loads(raw)
    except Exception as e:
        logger.warning("Entity extraction failed", error=str(e))
        return []


async def _generate_follow_ups(content: str) -> list[dict]:
    """Generate follow-up questions using LLM."""
    try:
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=FOLLOW_UP_SYSTEM_PROMPT),
            HumanMessage(content=f"文档内容：\n\n{content[:3000]}"),
        ])
        import json

        raw = resp.content.strip().strip("`").removeprefix("json")
        return json.loads(raw)
    except Exception as e:
        logger.warning("Follow-up generation failed", error=str(e))
        return []


def _generate_category_path(topic: str) -> str:
    """Generate category path for document."""
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
