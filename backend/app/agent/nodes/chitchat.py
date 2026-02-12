"""Chitchat Agent Node - handles casual conversation."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.llm import get_fast_llm
from app.agent.state import AgentState
from app.core.logging import get_logger

logger = get_logger(__name__)

CHITCHAT_SYSTEM_PROMPT = """\
你是 KnowZero 智能学习助手，专注于帮助用户进行知识管理和学习。

你的特点：
- 友好、热情、专业
- 回复简洁（1-2句话）
- 可以进行自然的对话
- 适时引导用户提出学习相关的问题

当用户闲聊时，自然地回应，并可以引导他们了解你擅长的学习领域。
不要生成任何学习文档内容。"""


async def chitchat_agent_node(state: AgentState) -> AgentState:
    """Handle casual conversation without generating documents.

    This node processes chitchat/intent messages and returns a friendly response
    without entering the document generation workflow.
    """
    message = state.get("raw_message", "")

    logger.info(
        "Chitchat agent processing",
        message_preview=message[:50],
    )

    llm = get_fast_llm()

    try:
        response = await llm.ainvoke(
            [
                SystemMessage(content=CHITCHAT_SYSTEM_PROMPT),
                HumanMessage(content=message),
            ]
        )

        reply_content = response.content

        logger.info(
            "Chitchat response generated",
            reply_preview=reply_content[:100],
        )

    except Exception as e:
        logger.error("Chitchat generation failed", error=str(e))
        reply_content = "你好！我是 KnowZero 智能学习助手，有什么可以帮你的吗？"

    state["response"] = {
        "type": "chitchat",
        "content": reply_content,
        "metadata": {
            "intent_type": "chitchat",
        },
    }

    return state
