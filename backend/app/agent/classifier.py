"""Fast-Track Intent Classifier."""

import re
import time
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.llm_utils import parse_llm_json_response
from app.core.logging import get_logger

logger = get_logger(__name__)


class IntentClassifier:
    STRONG_PATTERNS = {
        r"我想学|我想了解|教教我|什么是|介绍.*一下": ("new_topic", 1.0),
        r"学习路径|学习建议|学习规划|路线图|roadmap|plan|规划.*学习": ("plan", 1.0),
        r"详细说说|深入讲讲|再详细点|展开讲讲": ("follow_up", 1.0),
        r"和.*的区别|和.*不同|对比一下|比较.*和": ("comparison", 1.0),
        r"怎么办|怎么做|如何实现|给我.*例子": ("question_practical", 1.0),
        r"太抽象|太简单|没看懂|不明白|详细点": ("optimize_content", 1.0),
        r"^(你好|嗨|hello|hi|嗨嗨|早上好|晚上好|下午好|早安|晚安|哈喽|hey)": ("chitchat", 1.0),
        r"^(谢谢|感谢|多谢|不客气|没关系|好的|行|可以|没问题)": ("chitchat", 1.0),
        r"^(再见|拜拜|走了|回见|bye|goodbye)": ("chitchat", 1.0),
        r"你是谁|你叫什么|介绍一下自己|你是什么|你能做什么": ("chitchat", 1.0),
    }

    FUZZY_PATTERNS = {
        "讲详细": "follow_up",
        "说清楚": "optimize_content",
        "举例": "optimize_content",
        "更深入": "follow_up",
        "补充": "optimize_content",
    }

    _LLM_CLASSIFY_SYSTEM_PROMPT = """你是 KnowZero 学习平台的意图分类器。根据用户消息和会话状态，返回 JSON 对象。

**重要判断规则**（按优先级）：

1. **首次输入技术实体词**（最高优先级）：
   - 当"是否为首次有效输入"=是 时，用户输入一个技术名词（如"Redis"、"Python"、"TiDB"）
   - 如果没有明确问句特征（无"是什么"、"怎么用"、"如何"等疑问词），应识别为 **new_topic**
   - 如果有明确问句特征（如"Redis是什么？"），则识别为 **question**
   - 原理：首次抛出技术名词，通常表示想系统学习该技术

2. **闲聊识别**：
   - "你能干什么"、"你是谁"、"你好"、"hello" 等 → **chitchat**
   - 询问系统功能、自我介绍、打招呼 → **chitchat**
   - 闲聊不算作"有效输入"，不影响后续的首次判断

3. **明确规划意图**：
   - "给我规划"、"生成路线图"、"roadmap"、"学习路线"等 → **plan**

4. **new_topic vs question 的区分**：
   - new_topic：用户想系统学习一个主题（有明确学习意图）
   - question：用户想获得某个具体问题的答案（有明确问句）

**意图类型判断标准**：

1. **new_topic** - 系统性学习新主题
   - 用户想从零开始学习某个技术/概念
   - 表达方式："XX for YY"、"我想学 XX"、"XX 入门"、或直接输入技术名词
   - 示例："tidb for backend"、"python for data science"、"kubernetes 入门"、"Redis"
   - 关键特征：有明确的技术主题 + 应用场景/角色定位，或首次输入技术实体词

2. **plan** - 明确要求学习规划/路线图
   - 用户直接要求规划、路线图、学习路径
   - 示例："给我制定一个学习计划"、"XX 的学习路线"

3. **question** - 简单事实性问答
   - 单个知识点的问题，可以用1-2句话回答
   - 示例："TiDB 是什么？"、"SQL 怎么写？"

4. **question_practical** - 实践操作类问题
   - 问具体怎么做、怎么实现
   - 示例："如何连接数据库"、"怎么部署服务"

5. **follow_up** - 对当前文档的深入追问
   - 用户想了解更多细节
   - 示例："详细说说"、"再深入讲讲"

6. **comparison** - 概念对比
   - 示例："A 和 B 的区别"、"对比一下 XX 和 YY"

7. **navigate** - 想看已有文档
   - 示例："打开之前的文档"、"看看 XX 那篇"

8. **optimize_content** - 对内容的优化反馈
   - 示例："太抽象了"、"看不懂"、"举例说明"

**主题提取规则**：
- 从 "XX for YY" 格式中，XX 是主题，YY 是角色/场景
- 示例："tidb for backend" → target="tidb", user_role="beginner", context="backend"
- 如果没有明确角色，默认 user_role="beginner"

**返回格式**：
```json
{
  "intent_type": "new_topic | question | plan | follow_up | comparison | navigate | question_practical | optimize_content | chitchat",
  "target": "提取的核心主题（如：tidb、python、kubernetes）",
  "is_tech_entity": true/false,
  "user_role": "beginner | intermediate | expert（默认 beginner）",
  "context": "应用场景（如：backend、data science、web development）",
  "reasoning": "判断原因，特别说明是否触发了首次输入规则"
}
```

只返回 JSON，不要其他内容。"""

    def __init__(self, llm: BaseChatModel | None = None) -> None:
        self.llm = llm

    async def classify(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
        for pattern, (intent_type, confidence) in self.STRONG_PATTERNS.items():
            if re.search(pattern, message, re.IGNORECASE):
                logger.debug(
                    "Intent classified by strong pattern", pattern=pattern, intent=intent_type
                )
                return {
                    "intent_type": intent_type,
                    "confidence": confidence,
                    "method": "strong_rule",
                    "processing_time_ms": 5,
                    "target": self._extract_target(message),
                }

        fuzzy_match = self._fuzzy_match(message)
        if fuzzy_match:
            return {
                "intent_type": fuzzy_match,
                "confidence": 0.8,
                "method": "fuzzy_rule",
                "processing_time_ms": 10,
                "target": self._extract_target(message),
            }

        if self.llm and context.get("use_llm", True):
            return await self._llm_classify(message, context)

        return {
            "intent_type": "question",
            "confidence": 0.5,
            "method": "fallback",
            "processing_time_ms": 1,
            "target": message[:50],
        }

    def _fuzzy_match(self, message: str) -> str | None:
        message_lower = message.lower()
        words = message_lower.split()

        for keyword, intent in self.FUZZY_PATTERNS.items():
            if keyword in message_lower or keyword in words:
                return intent

        return None

    def _extract_target(self, message: str) -> str:
        prefixes = ["我想学", "我想了解", "什么是", "介绍一下", "详细说说"]
        result = message
        for prefix in prefixes:
            if result.startswith(prefix):
                result = result[len(prefix) :].strip()

        return result[:100] if result else message[:100]

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

        # Build contextual user prompt with session state
        has_roadmap = context.get("has_roadmap", False)
        has_documents = context.get("has_documents", False)
        is_first_meaningful_input = not has_roadmap and not has_documents

        contextual_message = f"""用户消息：{message}

会话状态：
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
            # The content can be str | list[str | dict[Any, Any]], we need to handle it
            content = resp.content
            if isinstance(content, str):
                parsed = parse_llm_json_response(content)
            else:
                # Fallback for non-string content
                parsed = {"intent_type": "question", "target": message[:50]}
            elapsed = int((time.monotonic() - start) * 1000)
            return {
                "intent_type": parsed.get("intent_type", "question"),
                "confidence": 0.85,
                "method": "llm",
                "processing_time_ms": elapsed,
                "target": parsed.get("target", self._extract_target(message)),
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
                "target": self._extract_target(message),
                "user_role": "beginner",
                "context": "",
            }


_classifier: IntentClassifier | None = None


def get_classifier(llm: BaseChatModel | None = None) -> IntentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier(llm)
    return _classifier
