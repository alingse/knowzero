# Intent Agent 意图分类详解

> 如何准确理解用户的真实意图 - 分层匹配策略

---

## 分层匹配策略

```
┌─────────────────────────────────────────────────────────────────┐
│                  Fast-Track 意图路由                       │
│                                                              │
│  ┌─────────────────┐  ┌─────────────┐  ┌───────────────┐       │
│  │ 强规则匹配     │  │ 模糊匹配    │  │ LLM 分类       │       │
│  │ (0-5ms)        │  │ (5-10ms)    │  │ (500-2000ms)  │       │
│  └─────────────────┘  └─────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 第 1 层：强规则匹配（置信度 1.0 直通车）

```python
# backend/agent/intent_classifier.py

class IntentClassifier:
    """
    分层意图分类器

    第 1 层：强规则匹配 (0-5ms)
        置信度 1.0 直接通过，跳过 LLM

    第 2 层：模糊匹配 (5-10ms)
        需要进一步确认

    第 3 层：LLM 分类 (500-2000ms)
        语义理解，多维度判断
    """

    # 强规则模式 - 置信度 1.0 直接通过
    strong_patterns = {
        # 知识/学习类意图
        r"我想学|我想了解|教教我|什么是": ("new_topic", 1.0),
        r"详细说说|深入讲讲|再详细点": ("follow_up", 1.0),
        r"和.*的区别|和.*不同|对比一下": ("comparison", 1.0),
        r"怎么办|怎么做|如何实现": ("question_practical", 1.0),
        # 闲聊类意图
        r"^(你好|嗨|hello|hi|嗨嗨|早上好|晚上好|下午好|早安|晚安|哈喽|hey)": ("chitchat", 1.0),
        r"^(谢谢|感谢|多谢|不客气|没关系|好的|行|可以|没问题)": ("chitchat", 1.0),
        r"^(再见|拜拜|走了|回见|bye|goodbye)": ("chitchat", 1.0),
        r"你是谁|你叫什么|介绍一下自己|你是什么|你能做什么": ("chitchat", 1.0),
    }

    # 模糊模式 - 需要进一步确认
    fuzzy_patterns = {
        "讲详细": "follow_up",
        "说清楚": "optimize_request",
        "举例": "optimize_request",
        "更深入": "follow_up"
    }

    def __init__(self, llm):
        self.llm = llm

    async def classify(self, message: str, context: dict) -> dict:
        """分层分类"""

        # === 第 1 层：强规则匹配 ===
        for pattern, (intent, confidence) in self.strong_patterns.items():
            if re.match(pattern, message):
                # 强匹配置信度 1.0，直接返回，跳过 LLM
                return {
                    "intent_type": intent,
                    "confidence": confidence,
                    "method": "strong_rule",
                    "processing_time_ms": 5
                }

        # === 第 2 层：模糊匹配 ===
        fuzzy_match = self._fuzzy_match(message)
        if fuzzy_match:
            return {
                "intent_type": fuzzy_match,
                "confidence": 0.8,
                "method": "fuzzy_rule",
                "processing_time_ms": 10
            }

        # === 第 3 层：LLM 分类 ===
        if context.get("use_llm", True):
            return await self._llm_classify(message, context)

    def _fuzzy_match(self, message: str) -> str:
        """模糊匹配"""
        words = message.split()
        for keyword, intent in self.fuzzy_patterns.items():
            if keyword in words:
                return intent
        return None

    async def _llm_classify(self, message: str, context: dict) -> dict:
        """LLM 语义分类"""
        prompt = f"""
分析用户消息意图：

【用户消息】
{message}

【会话上下文】
当前文档: {context.get('current_doc')}
最近学习: {context.get('recent_topics')}
用户水平: {context.get('user_level')}

【可用意图类型】
1. new_topic: 学习新主题
2. follow_up: 深入当前主题
3. update_doc: 更新/优化当前文档
4. question: 问答问题
5. comparison: 对比两个概念
6. practice: 实践/应用问题
7. chitchat: 闲聊对话（问候、感谢、自我介绍等）

请返回 JSON：
{{
  "intent_type": "...",
  "target": "用户关注的核心主题或实体",
  "ambiguity": "high|medium|low",
  "sentiment": "confused|satisfied|want_more|bored",
  "complexity": "simple|moderate|complex",
  "confidence": 0.95,
  "reasoning": "判断理由"
}}

判断原则：
- 用户说"我想学" → new_topic
- 用户说"详细说说"当前相关的内容 → follow_up
- 用户说"太抽象/太简单" → update_doc + more_examples/depth
- 用户问"有什么区别" → comparison
- 用户问"怎么做/如何" → question + practical
"""

        result = await self.llm.generate_json(prompt)

        return {
            "intent_type": result["intent_type"],
            "confidence": result.get("confidence", 0.95),
            "method": "llm",
            "processing_time_ms": 1500  # 估算的 LLM 时间
        }
```

---

## 不同输入源的意图判断

### 场景 1：聊天消息 (CHAT) - 多阶段判断

```python
# backend/agent/intent_agent.py

class IntentAgent:
    """意图理解 - 处理所有输入来源"""

    async def analyze(self, input: AgentInput, context: Context) -> Intent:
        """统一的意图分析入口"""

        # 根据来源选择分析策略
        if input.source == InputSource.COMMENT:
            return await self._analyze_comment_intent(input, context)
        elif input.source == InputSource.ENTITY:
            return await self._analyze_entity_intent(input, context)
        elif input.source == InputSource.CHAT:
            return await self._analyze_chat_intent(input, context)
        elif input.source == InputSource.FOLLOW_UP:
            return await self._analyze_followup_intent(input, context)
        elif input.source == InputSource.ENTRY:
            return await self._analyze_entry_intent(input, context)

    async def _analyze_chat_intent(self, input: AgentInput, context: Context):
        """
        分析聊天消息意图

        优先使用分层匹配策略
        """
        # 第 1 层：强规则匹配（0-5ms）
        for pattern, (intent, confidence) in STRONG_PATTERNS.items():
            if re.match(pattern, input.raw_message):
                # 强匹配直接返回，无需 LLM 确认
                return Intent(
                    intent_type=intent,
                    target=extract_target(input.raw_message),
                    complexity="simple",
                    ambiguity="low",
                    confidence=confidence,
                    method="strong_rule"
                )

        # 第 2 层：模糊匹配（5-10ms）
        fuzzy_match = self._fuzzy_match(input.raw_message)
        if fuzzy_match:
            return Intent(
                intent_type=fuzzy_match,
                target=extract_target(input.raw_message),
                complexity="moderate",
                ambiguity="medium",
                confidence=0.8,
                method="fuzzy_rule"
            )

        # 第 3 层：LLM 分类（仅在无法规则匹配时）
        return await self._llm_classify(input, context)
```

### 场景 2：评论优化 (COMMENT) - 基于反馈模式

```python
    async def _analyze_comment_intent(self, input: AgentInput, context: Context):
        """
        分析评论优化意图

        评论通常比较模糊，需要分析用户的真实需求
        """

        comment = input.comment_data.comment
        selected_text = input.comment_data.selected_text

        # 第 1 层：反馈关键词匹配
        feedback_keywords = {
            # 需要更多例子
            ["太抽象", "太理论", "举例", "具体点", "实例"]
            → "more_examples",

            # 需要更深入
            ["太简单", "再深入", "原理", "底层", "为什么"]
            → "more_depth",

            # 需要更清晰
            ["看不懂", "不清楚", "太乱", "太复杂", "重新说"]
            → "more_clarity",

            # 需要不同角度
            ["换个说法", "另外的角度", "通俗点"]
            → "different_angle",
        }

        import re
        user_need = None
        for keywords, need in feedback_keywords.items():
            if any(keyword in comment for keyword in keywords):
                user_need = need
                break

        # 第 2 层：LLM 确认（精细分析）
        prompt = f"""
用户对文档某段内容划线评论，请分析用户真实需求：

【用户评论】{comment}

【用户选中的文本】
"{selected_text}"

【所在章节】
{context.get_section(input.comment_data.section_id)}

【用户信息】
- 水平: {input.user_level}
- 该文档上的历史评论: {format_comments(context.doc_comments)}

【用户反馈风格】(基于历史)
{context.user_feedback_style}

请分析并返回 JSON：

{{
  "user_need": "more_examples|more_depth|more_clarity|different_angle",
  "confidence": 0.95,
  "reasoning": "为什么得出这个结论",
  "target_section": "应该优化的章节",
  "suggested_approach": "add_examples|rewrite_section|expand_section|rephrase",
  "is_new_question": false
}}

分析原则：
1. "太抽象" 通常意味着缺少具体例子 → more_examples
2. "太简单" 通常意味着内容太浅 → more_depth
3. "看不懂" 可能是表达问题 → more_clarity
4. 如果用户多次说"太抽象"，说明需要大量例子
5. 考虑用户水平，初学者更需要例子
"""

        result = await self.llm.generate_json(prompt)

        # 如果评论中包含新问题，意图类型应该是 question
        if result.get("is_new_question"):
            return Intent(
                intent_type="question",
                user_need="conceptual",
                target=extract_question_from_comment(comment),
                complexity="moderate",
                ambiguity="medium"
            )

        return Intent(
            intent_type="optimize_content",
            user_need=result["user_need"],
            target_section=result["target_section"],
            suggested_approach=result["suggested_approach"],
            confidence=result["confidence"]
        )
```

### 场景 3：实体词点击 (ENTITY) - 意图明确但需要检查

```python
    async def _analyze_entity_intent(self, input: AgentInput, context: Context):
        """
        分析实体词点击意图

        实体词点击的意图通常是明确的，但需要检查是否已有文档
        """

        entity_name = input.entity_data.entity_name

        # 这个场景意图明确，不需要复杂的 LLM 判断
        # 只需要决定：新建文档 vs 跳转已有文档

        existing_doc = await self.db.find_document_by_title(entity_name)

        if existing_doc:
            return Intent(
                intent_type="navigate",
                target_doc_id=existing_doc.id,
                complexity="simple",
                ambiguity="low",
                reasoning=f"文档 {entity_name} 已存在"
            )
        else:
            # 检查是否有相似文档
            similar_docs = await self.db.search_similar(entity_name, limit=3)

            if similar_docs and similar_docs[0]["similarity"] > 0.8:
                # 高度相似，询问用户
                return Intent(
                    intent_type="confirm_with_user",
                    similar_doc=similar_docs[0],
                    new_topic=entity_name,
                    complexity="simple",
                    ambiguity="medium",
                    reasoning=f"存在相似文档: {similar_docs[0]['title']}"
                )
            else:
                return Intent(
                    intent_type="new_topic",
                    target_topic=entity_name,
                    parent_doc_id=input.entity_data.source_doc_id,
                    complexity="simple",
                    ambiguity="low",
                    reasoning=f"需要生成新文档: {entity_name}"
                )
```

### 场景 4：入口输入 (ENTRY) - 简单新主题

```python
    async def _analyze_entry_intent(self, input: AgentInput, context: Context):
        """
        分析入口输入意图

        入口输入通常是简单的新主题请求
        """
        return Intent(
            intent_type="new_topic",
            target=input.raw_message.strip(),
            complexity="simple",
            ambiguity="low",
            confidence=0.95,
            reasoning="用户从入口输入新主题"
        )
```

### 场景 5：追问点击 (FOLLOW_UP) - 继承原意图类型

```python
    async def _analyze_followup_intent(self, input: AgentInput, context: Context):
        """
        分析追问点击意图

        追问问题已经带有意图类型，继承使用
        """
        # 追问按钮携带的意图提示
        if input.intent_hint:
            return Intent(
                intent_type=input.intent_hint,
                target=extract_target(input.raw_message),
                complexity="simple",
                ambiguity="low",
                confidence=0.9,
                reasoning="追问按钮携带的意图类型"
            )

        # 否则作为聊天消息处理
        return await self._analyze_chat_intent(input, context)
```

---

## 意图判断的可观测性

```python
# backend/agent/intent_agent.py

class IntentAgent:
    async def analyze(self, input: AgentInput, context: Context) -> Intent:
        """统一的意图分析入口"""

        # 记录原始输入
        self.log_input(input)

        # 使用分层匹配策略
        intent = await self._classify(input, context)

        # 记录分析结果（用于调试和优化）
        self.log_classification(
            input=input,
            intent=intent,
            method=intent.method,  # strong_rule | fuzzy_rule | llm
            confidence=intent.confidence
        )

        return intent

    def log_classification(self, input, intent, method, confidence):
        """记录分类结果（用于分析和改进）"""

        log_entry = {
            "timestamp": datetime.now(),
            "input_source": input.source,
            "raw_message": input.raw_message,
            "predicted_intent": intent.intent_type,
            "confidence": confidence,
            "method": method,
            "session_id": input.session_id
        }

        # 保存到日志
        self.logger.log(log_entry)

        # 后续可以用于分析：
        # - 哪些意图判断不准确
        # - 用户常见的表达方式
        # - 是否需要添加新的意图类型
```

---

## 强匹配直通车设计

### 置信度阈值

```python
# backend/agent/intent_classifier.py

class IntentClassifier:
    """
    分层意图分类器

    置信度设计：
    - 强匹配：置信度 > 0.9 直接通过，跳过 LLM 确认
    - 模糊匹配：置信度 0.7-0.9 可能需要确认
    - LLM 分类：语义理解，多维度判断
    """

    # 强匹配直通车 - 置信度 1.0 直接通过
    STRONG_PATTERN_THRESHOLD = 0.9

    async def classify(self, message: str, context: dict) -> dict:
        """分层分类，支持强匹配直通车"""

        # === 第 1 层：强规则匹配 ===
        for pattern, (intent, confidence) in self.strong_patterns.items():
            if re.match(pattern, message):
                if confidence >= self.STRONG_PATTERN_THRESHOLD:
                    # 强匹配直通车：直接返回，跳过 LLM 确认
                    return {
                        "intent_type": intent,
                        "confidence": confidence,
                        "method": "strong_rule_fast_track",  # 标记为直通车
                        "processing_time_ms": 5
                    }
                else:
                    # 置信度较低，需要 LLM 确认
                    return await self._refine_with_llm(
                        rough_intent=intent,
                        input=input,
                        context=context
                    )

        # 第 2 层和第 3 层保持不变
        ...
```

### 性能对比

```
┌─────────────────────────────────────────────────────────────────┐
│                  意图分类性能对比                       │
│                                                              │
│  方法                  │ 平均耗时    │ 调用 LLM    │ 准确率  │
│  ────────────────────┼───────────┼────────────┼──────────│
│  强规则匹配（直通车） │   0-5ms    │     不需要     │    ~85%    │
│  强规则匹配（需确认） │   5-10ms   │   有时     │    ~92%    │
│  模糊匹配               │   5-10ms   │   有时     │    ~75%    │
│  LLM 完整分类         │  500-2000ms │   总是      │    ~98%    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 总结：分层匹配策略

```
┌─────────────────────────────────────────────────────────────────┐
│                  意图判断策略 (v2)                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  第 1 层：强规则匹配 (0-5ms)                │    │
│  │  ┌────────────────────────────────────────────────────┐    │    │
│  │  │ 置信度 1.0 直通车                     │    │    │
│  │  │ r"我想学|我想了解|教教我|什么是"         │    │    │
│  │  │ r"详细说说|深入讲讲|再详细点"            │    │    │
│  │  │ r"和.*的区别|和.*不同|对比一下"          │    │    │
│  │  │ r"怎么办|怎么做|如何实现"                │    │    │
│  │  └────────────────────────────────────────────────────┘    │    │
│  │           ↓ 跳过 LLM，直接返回                    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  第 1 层：模糊匹配 (5-10ms)                   │    │
│  │  ┌────────────────────────────────────────────────────┐    │    │
│  │  │ "讲详细" → follow_up                       │    │    │
│  │  │ "说清楚" → optimize_request                │    │    │
│  │  │ "举例" → optimize_request                   │    │    │
│  │  └────────────────────────────────────────────────────┘    │    │
│  │           ↓ 置信度 0.8，可能需要 LLM 确认        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  第 2 层：LLM 分类 (500-2000ms)               │    │
│  │  完整语义理解，多维度判断                     │    │    │
│  │  置信度 0.95                               │    │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 闲聊意图 (Chitchat)

### 闲聊模式识别

```python
# 闲聊类强规则模式（置信度 1.0）
CHITCHAT_PATTERNS = {
    # 问候类
    r"^(你好|嗨|hello|hi|嗨嗨|早上好|晚上好|下午好|早安|晚安|哈喽|hey)": ("chitchat", 1.0),
    # 感谢/确认类
    r"^(谢谢|感谢|多谢|不客气|没关系|好的|行|可以|没问题)": ("chitchat", 1.0),
    # 告别类
    r"^(再见|拜拜|走了|回见|bye|goodbye)": ("chitchat", 1.0),
    # 自我介绍类
    r"你是谁|你叫什么|介绍一下自己|你是什么|你能做什么": ("chitchat", 1.0),
}
```

### 闲聊处理流程

```
┌─────────────────────────────────────────────────────────────────┐
│  用户输入: "你好" / "谢谢" / "再见" / "你是谁"               │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fast-Track Intent Router                                     │
│  识别为 chitchat 意图 (置信度 1.0)                           │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Chitchat Agent                                             │
│  - 使用快速 LLM 生成自然回复                                 │
│  - 不进入文档生成流程                                        │
│  - 友好引导用户回到学习主题                                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    直接返回回复 → END
```

### 闲聊响应示例

| 用户输入 | 响应示例 |
|---------|---------|
| "你好" | "你好！我是 KnowZero 智能学习助手，有什么想了解的吗？" |
| "谢谢" | "不客气！如果有其他问题随时问我哦～" |
| "再见" | "再见！祝学习愉快，有需要随时回来～" |
| "你是谁" | "我是 KnowZero 智能学习助手，专注于帮你构建个人知识库，有什么可以帮你的吗？" |

---

*意图分类详解 v2.1 | KnowZero 项目*
