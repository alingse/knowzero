"""Intent Classifier - LLM-based with session context awareness."""

import time
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.llm_utils import parse_llm_json_response
from app.core.logging import get_logger

logger = get_logger(__name__)


class IntentClassifier:
    _LLM_CLASSIFY_SYSTEM_PROMPT = """你是 KnowZero 学习平台的意图分类器。根据用户消息和会话状态，返回 JSON 对象。

## 核心判断规则（按优先级）

### 规则 0：子主题归属（最高优先级）
当会话已有学习主题时，判断用户输入是否属于该主题的子概念/子领域：
- 如果用户输入的内容是当前学习主题的子概念、相关技术、深入方向 → 不是 new_topic
- 示例：
  - 当前主题="Python3 asyncio"，输入"协作式多任务"/"事件循环"/"协程" → asyncio 子概念，应为 **question**
  - 当前主题="Redis"，输入"持久化机制"/"RDB快照" → Redis 子概念，应为 **question**
  - 当前主题="React"，输入"虚拟DOM"/"Hooks原理" → React 子概念，应为 **question**
  - 当前主题="Python3 asyncio"，输入"深度探索：协程" → 深入学习子主题，应为 **question**
- 只有当输入的主题与当前学习主题完全无关时（如当前学"asyncio"，输入"Redis"），才考虑 new_topic

### 规则 1：首次输入技术实体词
- 仅当"是否为首次有效输入"=是 且 无当前学习主题时生效
- 用户输入技术名词（如"Redis"、"Python"），无问句特征 → **new_topic**
- 有问句特征（如"Redis是什么？"）→ **question**

### 规则 2：闲聊识别
- "你好"、"hello"、"你是谁"、"你能干什么" → **chitchat**
- 打招呼、感谢、告别、询问系统功能 → **chitchat**

### 规则 3：明确规划意图
- "给我规划"、"生成路线图"、"roadmap"、"学习路线" → **plan**

### 规则 4：new_topic vs question
- new_topic：想系统学习一个与当前主题无关的全新领域
- question：想了解某个具体知识点（可能是当前主题下的）

## 意图类型定义

| 类型 | 含义 | 示例 |
|------|------|------|
| new_topic | 系统性学习全新主题（与当前主题无关） | "tidb for backend"、"kubernetes 入门" |
| plan | 明确要求学习规划/路线图 | "给我制定学习计划"、"重新规划" |
| question | 事实性问答或主题内知识点学习 | "事件循环是什么？"、"深度探索：协程" |
| question_practical | 实践操作类问题 | "如何连接数据库" |
| follow_up | 对当前文档的深入追问 | "详细说说"、"再深入讲讲" |
| comparison | 概念对比 | "A 和 B 的区别" |
| navigate | 想看已有文档 | "打开之前的文档" |
| optimize_content | 对内容的优化反馈 | "太抽象了"、"看不懂" |
| chitchat | 闲聊 | "你好"、"谢谢" |

## 主题提取规则
- "XX for YY" → target=XX, context=YY
- 无明确角色时 user_role="beginner"

## 返回格式
```json
{
  "intent_type": "new_topic | question | plan | follow_up | comparison | navigate | question_practical | optimize_content | chitchat",
  "target": "提取的核心主题",
  "is_tech_entity": true/false,
  "user_role": "beginner | intermediate | expert",
  "context": "应用场景",
  "reasoning": "判断原因"
}
```

只返回 JSON，不要其他内容。"""

    def __init__(self, llm: BaseChatModel | None = None) -> None:
        self.llm = llm

    async def classify(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
        """Classify user intent using LLM with full session context."""
        if self.llm and context.get("use_llm", True):
            return await self._llm_classify(message, context)

        return {
            "intent_type": "question",
            "confidence": 0.5,
            "method": "fallback",
            "processing_time_ms": 1,
            "target": message[:50],
        }

    async def _llm_classify(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
        logger.info("Using LLM for intent classification", message=message[:50])
        start = time.monotonic()

        if not self.llm:
            return {
                "intent_type": "question",
                "confidence": 0.5,
                "method": "fallback_no_llm",
                "processing_time_ms": 1,
                "target": message[:50],
            }

        has_roadmap = context.get("has_roadmap", False)
        has_documents = context.get("has_documents", False)
        is_first_meaningful_input = not has_roadmap and not has_documents
        session_topic = context.get("session_topic") or ""

        contextual_message = f"""用户消息：{message}

会话状态：
- 当前学习主题：{session_topic or "无"}
- 是否有学习路线图：{"是" if has_roadmap else "否"}
- 是否有历史文档：{"是" if has_documents else "否"}
- 是否为首次有效输入：{"是" if is_first_meaningful_input else "否"}"""

        try:
            resp = await self.llm.ainvoke(
                [
                    SystemMessage(content=self._LLM_CLASSIFY_SYSTEM_PROMPT),
                    HumanMessage(content=contextual_message),
                ]
            )
            content = resp.content
            if isinstance(content, str):
                parsed = parse_llm_json_response(content)
            else:
                parsed = {"intent_type": "question", "target": message[:50]}
            elapsed = int((time.monotonic() - start) * 1000)
            return {
                "intent_type": parsed.get("intent_type", "question"),
                "confidence": 0.85,
                "method": "llm",
                "processing_time_ms": elapsed,
                "target": parsed.get("target", message[:100]),
                "is_tech_entity": parsed.get("is_tech_entity", False),
                "user_role": parsed.get("user_role", "beginner"),
                "context": parsed.get("context", ""),
                "reasoning": parsed.get("reasoning", ""),
            }
        except Exception as e:
            logger.warning("LLM classification failed, using fallback", error=str(e))
            return {
                "intent_type": "question",
                "confidence": 0.5,
                "method": "llm_fallback",
                "processing_time_ms": int((time.monotonic() - start) * 1000),
                "target": message[:100],
                "user_role": "beginner",
                "context": "",
            }


_classifier: IntentClassifier | None = None


def get_classifier(llm: BaseChatModel | None = None) -> IntentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier(llm)
    return _classifier
