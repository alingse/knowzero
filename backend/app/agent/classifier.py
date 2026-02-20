"""Fast-Track Intent Classifier."""

import re
import time
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.llm_utils import parse_llm_json_response
from app.core.logging import get_logger

logger = get_logger(__name__)


class IntentClassifier:
    """Layered intent classifier with fast-track optimization."""

    # Layer 1: Strong patterns (confidence 1.0, skip LLM)
    STRONG_PATTERNS = {
        # Knowledge/learning intents
        r"我想学|我想了解|教教我|什么是|介绍.*一下": ("new_topic", 1.0),
        r"学习路径|学习建议|学习规划|路线图|roadmap|plan|规划.*学习": ("plan", 1.0),
        r"详细说说|深入讲讲|再详细点|展开讲讲": ("follow_up", 1.0),
        r"和.*的区别|和.*不同|对比一下|比较.*和": ("comparison", 1.0),
        r"怎么办|怎么做|如何实现|给我.*例子": ("question_practical", 1.0),
        r"太抽象|太简单|没看懂|不明白|详细点": ("optimize_content", 1.0),
        # Chitchat intents
        r"^(你好|嗨|hello|hi|嗨嗨|早上好|晚上好|下午好|早安|晚安|哈喽|hey)": ("chitchat", 1.0),
        r"^(谢谢|感谢|多谢|不客气|没关系|好的|行|可以|没问题)": ("chitchat", 1.0),
        r"^(再见|拜拜|走了|回见|bye|goodbye)": ("chitchat", 1.0),
        r"你是谁|你叫什么|介绍一下自己|你是什么|你能做什么": ("chitchat", 1.0),
    }

    # Layer 2: Fuzzy patterns (confidence 0.8, may need confirmation)
    FUZZY_PATTERNS = {
        "讲详细": "follow_up",
        "说清楚": "optimize_content",
        "举例": "optimize_content",
        "更深入": "follow_up",
        "补充": "optimize_content",
    }

    # LLM classification system prompt
    _LLM_CLASSIFY_SYSTEM_PROMPT = """你是 KnowZero 学习平台的意图分类器。根据用户消息，返回 JSON 对象。

**意图类型判断标准**：

1. **new_topic** - 系统性学习新主题（需要生成学习路线图）
   - 用户想从零开始学习某个技术/概念
   - 表达方式："XX for YY"、"我想学 XX"、"XX 入门"
   - 示例："tidb for backend"、"python for data science"、"kubernetes 入门"
   - 关键特征：有明确的技术主题 + 应用场景/角色定位

2. **plan** - 明确要求学习规划/路线图
   - 用户直接要求规划、路线图、学习路径
   - 示例："给我制定一个学习计划"、"XX 的学习路线"

3. **question** - 简单事实性问答（不需要生成文档）
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
  "intent_type": "new_topic | question | plan | follow_up | comparison | navigate | question_practical | optimize_content",
  "target": "提取的核心主题（如：tidb、python、kubernetes）",
  "user_role": "beginner | intermediate | expert（默认 beginner）",
  "context": "应用场景（如：backend、data science、web development）",
  "reasoning": "分类原因"
}
```

只返回 JSON，不要其他内容。"""

    def __init__(self, llm=None):
        self.llm = llm

    async def classify(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
        """Classify user intent with layered strategy.

        Layer 1: Strong rule matching (0-5ms)
        Layer 2: Fuzzy matching (5-10ms)
        Layer 3: LLM classification (500-2000ms)
        """
        # Layer 1: Strong patterns
        for pattern, (intent_type, confidence) in self.STRONG_PATTERNS.items():
            if re.search(pattern, message, re.IGNORECASE):
                logger.debug(
                    "Intent classified by strong pattern",
                    pattern=pattern,
                    intent=intent_type,
                )
                return {
                    "intent_type": intent_type,
                    "confidence": confidence,
                    "method": "strong_rule",
                    "processing_time_ms": 5,
                    "target": self._extract_target(message),
                }

        # Layer 2: Fuzzy patterns
        fuzzy_match = self._fuzzy_match(message)
        if fuzzy_match:
            return {
                "intent_type": fuzzy_match,
                "confidence": 0.8,
                "method": "fuzzy_rule",
                "processing_time_ms": 10,
                "target": self._extract_target(message),
            }

        # Layer 3: LLM classification (if LLM available)
        if self.llm and context.get("use_llm", True):
            return await self._llm_classify(message, context)

        # Fallback
        return {
            "intent_type": "question",
            "confidence": 0.5,
            "method": "fallback",
            "processing_time_ms": 1,
            "target": message[:50],
        }

    def _fuzzy_match(self, message: str) -> str | None:
        """Match message against fuzzy patterns."""
        message_lower = message.lower()
        words = message_lower.split()

        for keyword, intent in self.FUZZY_PATTERNS.items():
            if keyword in message_lower or keyword in words:
                return intent

        return None

    def _extract_target(self, message: str) -> str:
        """Extract target topic from message."""
        # Simple extraction - can be improved with NLP
        # Remove common prefixes
        prefixes = ["我想学", "我想了解", "什么是", "介绍一下", "详细说说"]
        result = message
        for prefix in prefixes:
            if result.startswith(prefix):
                result = result[len(prefix) :].strip()

        return result[:100] if result else message[:100]

    async def _llm_classify(self, message: str, context: dict) -> dict[str, Any]:
        """Use LLM for intent classification."""
        logger.info("Using LLM for intent classification", message=message[:50])
        start = time.monotonic()

        try:
            resp = await self.llm.ainvoke(
                [
                    SystemMessage(content=self._LLM_CLASSIFY_SYSTEM_PROMPT),
                    HumanMessage(content=message),
                ]
            )
            parsed = parse_llm_json_response(resp.content)
            elapsed = int((time.monotonic() - start) * 1000)
            return {
                "intent_type": parsed.get("intent_type", "question"),
                "confidence": 0.85,
                "method": "llm",
                "processing_time_ms": elapsed,
                "target": parsed.get("target", self._extract_target(message)),
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


# Global classifier instance
_classifier: IntentClassifier | None = None


def get_classifier(llm=None) -> IntentClassifier:
    """Get or create global classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier(llm)
    return _classifier
