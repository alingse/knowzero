"""Chitchat Agent Node - handles casual conversation."""

from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.llm import get_fast_llm
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

CHITCHAT_SYSTEM_PROMPT = """\
你是 KnowZero 学习平台的 AI 助手。

**角色定位**：友好、热情、专业的学习助手。

**回复原则**：
1. 回复简洁（1-2句话），不要长篇大论
2. 根据会话状态调整回复策略

**无学习主题时** (has_topic=false)：
- 问候 → 热情回应 + 引导说出想学什么
- 咨询 → 简要回答 + 询问想学什么技术
- 示例："你好！我是 KnowZero 学习助手。告诉我你想学什么技术吧，我帮你制定学习计划。"

**有学习主题时** (has_topic=true)：
- 问候 → 简洁回应 + 鼓励继续学习
- 示例："继续学习 {topic} 吧，有什么问题随时问我。"

**严禁**：
- 不要主动推荐技术（除非用户明确询问）
- 不要说"我什么都懂"，保持谦逊
- 不要输出超过2句话
- 不要生成任何学习文档内容"""


async def chitchat_agent_node(state: AgentState) -> AgentState:
    """Handle casual conversation without generating documents.

    This node processes chitchat/intent messages and returns a friendly response
    without entering the document generation workflow.
    """
    message = state.get("raw_message", "")
    session_topic = state.get("session_topic")

    logger.info(
        "Chitchat agent processing",
        message_preview=message[:50],
        has_topic=session_topic is not None,
    )

    llm = get_fast_llm()

    # Build contextual prompt based on session topic state
    has_topic = session_topic is not None
    topic_context = (
        f"\n\n**当前学习主题**: {session_topic}" if has_topic else "\n\n**当前学习主题**: 无"
    )

    contextual_prompt = f"{message}{topic_context}"

    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=CHITCHAT_SYSTEM_PROMPT),
                HumanMessage(content=contextual_prompt),
            ]
        )

        reply_content = response.content

        logger.info(
            "Chitchat response generated",
            reply_preview=reply_content[:100],
        )

    except Exception as e:
        logger.error("Chitchat generation failed", error=str(e))
        # Fallback based on topic state
        if has_topic:
            reply_content = f"继续学习 {session_topic} 吧，有什么问题随时问我。"
        else:
            reply_content = (
                "你好！我是 KnowZero 学习助手。告诉我你想学什么技术吧，我帮你制定学习计划。"
            )

    state["response"] = {
        "type": "chat",
        "content": reply_content,
        "metadata": {
            "intent_type": "chitchat",
        },
    }

    return state
