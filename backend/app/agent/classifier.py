"""Fast-Track Intent Classifier."""

import re
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


class IntentClassifier:
    """Layered intent classifier with fast-track optimization."""
    
    # Layer 1: Strong patterns (confidence 1.0, skip LLM)
    STRONG_PATTERNS = {
        r"我想学|我想了解|教教我|什么是|介绍.*一下": ("new_topic", 1.0),
        r"详细说说|深入讲讲|再详细点|展开讲讲": ("follow_up", 1.0),
        r"和.*的区别|和.*不同|对比一下|比较.*和": ("comparison", 1.0),
        r"怎么办|怎么做|如何实现|给我.*例子": ("question_practical", 1.0),
        r"太抽象|太简单|没看懂|不明白|详细点": ("optimize_content", 1.0),
    }
    
    # Layer 2: Fuzzy patterns (confidence 0.8, may need confirmation)
    FUZZY_PATTERNS = {
        "讲详细": "follow_up",
        "说清楚": "optimize_content",
        "举例": "optimize_content",
        "更深入": "follow_up",
        "补充": "optimize_content",
    }
    
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
                result = result[len(prefix):].strip()
        
        return result[:100] if result else message[:100]
    
    async def _llm_classify(self, message: str, context: dict) -> dict[str, Any]:
        """Use LLM for intent classification."""
        import time

        from langchain_core.messages import HumanMessage, SystemMessage

        logger.info("Using LLM for intent classification", message=message[:50])
        start = time.monotonic()

        system_prompt = (
            "你是一个意图分类器。根据用户消息，返回一个 JSON 对象，包含以下字段：\n"
            '- intent_type: 以下之一 "new_topic", "follow_up", "comparison", '
            '"question_practical", "optimize_content", "navigate", "question"\n'
            "- target: 用户想了解的主题（简短）\n"
            "- reasoning: 一句话解释分类原因\n"
            "只返回 JSON，不要其他内容。"
        )

        try:
            resp = await self.llm.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=message),
            ])
            import json as _json

            parsed = _json.loads(resp.content.strip().strip("`").removeprefix("json"))
            elapsed = int((time.monotonic() - start) * 1000)
            return {
                "intent_type": parsed.get("intent_type", "question"),
                "confidence": 0.85,
                "method": "llm",
                "processing_time_ms": elapsed,
                "target": parsed.get("target", self._extract_target(message)),
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
            }


# Global classifier instance
_classifier: IntentClassifier | None = None


def get_classifier(llm=None) -> IntentClassifier:
    """Get or create global classifier instance."""
    global _classifier
    if _classifier is None:
        _classifier = IntentClassifier(llm)
    return _classifier
