# KnowZero Agent 架构设计 (统一版本)

> 基于 LangGraph 的多 Agent 协作系统 - v2.1 架构统一版（含闲聊支持）

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户输入来源                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  聊天消息    │  │  评论优化     │  │  实体词点击   │       │
│  │  (入口/底部) │  │  (划线评论)   │  │  (文档内)     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                  │                  │                  │
│         └──────────────────────┼──────────────────┘          │
│                            │                             │
└────────────────────────────┬┴─────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Input Normalizer (统一输入处理)              │
│  将不同来源的输入统一为 AgentInput 标准格式                   │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Fast-Track Intent Router                      │
│  ┌─────────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ 强规则匹配     │  │ 模糊匹配    │  │ LLM 分类       │   │
│  │ (0-5ms)        │  │ (5-10ms)    │  │ (500-2000ms)  │   │
│  └─────────────────┘  └─────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Intent Agent                             │
│  根据输入来源采用不同的分析策略                               │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Route Agent                              │
│  智能决策: 应该如何响应                                       │
└─────────────────────────────────────────────────────────────────────┘
                             │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Content      │  │  Navigator    │  │  Planner      │
│  Agent        │  │  Agent        │  │  Agent        │
└───────────────┘  └───────────────┘  └───────────────┘
```

---

### 6. Chitchat Agent（闲聊处理）

**职责：** 处理闲聊对话，不生成文档

```python
class ChitchatAgent:
    """闲聊处理器"""

    async def chat(self, message: str, context: Context) -> str:
        """处理闲聊消息，生成友好回复"""

        prompt = """
        你是 KnowZero 智能学习助手，专注于帮助用户进行知识管理和学习。

        你的特点：
        - 友好、热情、专业
        - 回复简洁（1-2句话）
        - 可以进行自然的对话
        - 适时引导用户提出学习相关的问题

        当用户闲聊时，自然地回应，并可以引导他们了解你擅长的学习领域。
        不要生成任何学习文档内容。
        """

        response = await self.fast_llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content=message)
        ])

        return {
            "type": "chitchat",
            "content": response.content
        }
```

---

## 输入处理

### InputSource 枚举

```python
# backend/agent/input_models.py

from enum import Enum

class InputSource(str, Enum):
    """输入来源"""
    CHAT = "chat"              # 聊天消息
    COMMENT = "comment"         # 划线评论
    ENTITY = "entity"           # 实体词点击
    FOLLOW_UP = "follow_up"     # 追问点击
    ENTRY = "entry"             # 入口主题
```

### AgentInput 统一数据模型

```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class AgentInput(BaseModel):
    """统一的 Agent 输入格式"""

    # === 基础信息 ===
    source: InputSource           # 输入来源
    session_id: str
    user_id: int
    timestamp: datetime

    # === 核心内容 (不同来源有不同的必需字段) ===
    raw_message: str             # 原始文本 (所有来源都有)
    target_topic: Optional[str]  # 目标主题/实体名
    intent_hint: Optional[str]   # 意图提示 (可选)

    # === 评论优化特有字段 ===
    comment_data: Optional[CommentData] = None

    # === 实体词点击特有字段 ===
    entity_data: Optional[EntityData] = None

    # === 会话上下文 ===
    current_doc_id: Optional[int] = None
    recent_docs: List[int] = []
    user_level: str = "beginner"
    learned_topics: List[str] = []

    # === 学习目标 (可选) ===
    learning_goal: Optional[str] = None

class CommentData(BaseModel):
    """评论数据"""
    comment: str                     # 用户评论
    selected_text: str               # 选中的文本
    position: dict                  # {start, end}
    document_id: int
    section_id: Optional[str] = None  # 所在章节 ID

class EntityData(BaseModel):
    """实体词数据"""
    entity_name: str
    source_doc_id: int
    entity_type: Optional[str] = None
```

---

## Fast-Track 意图路由

### 三层匹配策略

```python
# backend/agent/intent_classifier.py

class IntentClassifier:
    """
    分层意图分类器

    第 1 层：强规则匹配 (0-5ms)
    第 2 层：模糊匹配 (5-10ms)
    第 3 层：LLM 分类 (500-2000ms)
    """

    def __init__(self):
        # 强规则模式 - 置信度 1.0 直接通过，跳过 LLM
        self.strong_patterns = {
            # 知识/学习类
            r"我想学|我想了解|教教我|什么是": ("new_topic", 1.0),
            r"详细说说|深入讲讲|再详细点": ("follow_up", 1.0),
            r"和.*的区别|和.*不同|对比": ("comparison", 1.0),
            r"怎么办|怎么做|如何实现": ("question_practical", 1.0),
            # 闲聊类
            r"^(你好|嗨|hello|hi)": ("chitchat", 1.0),
            r"^(谢谢|感谢|不客气)": ("chitchat", 1.0),
            r"^(再见|拜拜)": ("chitchat", 1.0),
            r"你是谁|你叫什么|你能做什么": ("chitchat", 1.0),
        }

        # 模糊模式 - 需要进一步确认
        self.fuzzy_patterns = {
            "讲详细": "follow_up",
            "说清楚": "optimize_request",
            "举例": "optimize_request",
            "更深入": "follow_up"
        }

    async def classify(self, message: str, context: dict) -> dict:
        """分层分类"""

        # === 第 1 层：强规则匹配 ===
        for pattern, (intent, confidence) in self.strong_patterns.items():
            if re.match(pattern, message):
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
```

---

## Agent 职责划分

### 1. Intent Agent（意图理解）

**职责：** 理解用户的真实意图（处理所有输入来源）

**统一接口：**

```python
class IntentAgent:
    """意图理解 - 处理所有输入来源"""

    async def analyze(self, input: AgentInput, context: Context) -> Intent:
        """
        统一的意图分析入口

        根据输入来源，采用不同的分析策略
        """

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
```

**聊天消息分析：**

```python
async def _analyze_chat_intent(self, input: AgentInput, context: Context):
    """分析聊天消息意图"""

    prompt = f"""
分析用户消息意图：

【用户消息】{input.raw_message}

【会话上下文】
当前文档: {context.current_doc}
最近学习: {context.recent_topics}
用户水平: {input.user_level}

【可用意图类型】
1. new_topic: 学习新主题
2. follow_up: 深入当前主题
3. update_doc: 更新/优化当前文档
4. question: 问答问题
5. comparison: 对比两个概念
6. practice: 实践/应用问题

请返回 JSON：
{{
  "intent_type": "...",
  "target": "用户关注的核心主题或实体",
  "ambiguity": "high|medium|low",
  "sentiment": "confused|satisfied|curious|frustrated",
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

    return await self.llm.generate_json(prompt)
```

**评论优化分析：**

```python
async def _analyze_comment_intent(self, input: AgentInput, context: Context):
    """分析评论优化意图"""

    prompt = f"""
用户对文档中的某段内容划线并评论，请分析用户意图：

【用户评论】{input.comment_data.comment}

【用户选中的文本】
"{input.comment_data.selected_text}"

【所在章节】
{context.get_section(input.comment_data.section_id)}

【用户信息】
- 水平: {input.user_level}
- 该文档上的历史评论: {context.doc_comment_history}

【用户反馈风格】(基于历史)
{context.user_feedback_style}

请分析并返回 JSON：
{{
  "intent_type": "optimize_content|new_question|clarification",
  "user_need": "more_examples|more_depth|more_clarity|different_angle",
  "target_section": "需要优化的章节",
  "sentiment": "confused|satisfied|curious|frustrated",
  "ambiguity": "high|medium|low",
  "specific_request": "用户具体想要什么",
  "suggested_approach": "add_examples|rewrite_section|expand_section",
  "confidence": 0.95
}}

分析原则：
- "太抽象" → 需要 more_examples
- "太简单" → 需要 more_depth
- "看不懂" → 需要 more_clarity
- "详细点" → 需要 expand_section
- 有困惑问题 → 可能是 clarification (需要回答)
"""

    return await self.llm.generate_json(prompt)
```

**实体词点击分析：**

```python
async def _analyze_entity_intent(self, input: AgentInput, context: Context):
    """分析实体词点击意图"""

    entity = input.entity_data.entity_name

    # 检查是否已有文档
    existing_doc = await self.db.find_document_by_entity(entity)

    if existing_doc:
        return Intent(
            intent_type="navigate",
            target=existing_doc.id,
            complexity="simple",
            ambiguity="low"
        )
    else:
        return Intent(
            intent_type="new_topic",
            target=entity,
            complexity="simple",
            ambiguity="low",
            metadata={"generated_from": input.entity_data.source_doc_id}
        )
```

---

### 2. Route Agent（智能路由）

**职责：** 决定是新建文档、更新文档，还是引导跳转

**统一接口：**

```python
class RouteAgent:
    """智能路由 - 处理所有输入来源的决策"""

    async def decide(self, intent: Intent, input: AgentInput, context: Context):
        """
        根据意图和输入来源，决定如何处理
        """

        # 评论优化场景的路由
        if input.source == InputSource.COMMENT:
            return await self._route_comment_optimization(intent, input, context)

        # 实体词点击场景的路由
        elif input.source == InputSource.ENTITY:
            return await self._route_entity_click(intent, input, context)

        # 聊天消息场景的路由
        elif input.source in [InputSource.CHAT, InputSource.FOLLOW_UP]:
            return await self._route_chat_message(intent, input, context)

        # 入口场景的路由
        elif input.source == InputSource.ENTRY:
            return await self._route_entry(intent, input, context)
```

**决策逻辑：**

| 条件 | Action | 说明 |
|------|--------|------|
| 全新主题，无相关文档 | new_document | 生成新文档 |
| 深入当前主题的某方面 | update_current + expand | 添加新章节 |
| 已有文档讲得很清楚 | navigate_to | 引导跳转 |
| 需要整合多个文档内容 | merge_and_update | 合并后更新 |
| 评论需要优化 | optimize_section | 优化指定章节 |

---

### 3. Content Agent（内容生成与优化）

**职责：** 处理文档生成和用户反馈优化

**统一接口：**

```python
class ContentAgent:
    """内容工厂 - 处理所有内容生成和优化"""

    async def process(self, decision: RoutingDecision, input: AgentInput, context: Context):
        """
        根据 Route Agent 的决策，执行内容操作
        """

        # 评论优化的处理
        if input.source == InputSource.COMMENT:
            return await self._optimize_from_comment(decision, input, context)

        # 实体词文档的生成
        elif input.source == InputSource.ENTITY:
            return await self._generate_entity_document(decision, input, context)

        # 常规文档生成/更新
        elif input.source in [InputSource.CHAT, InputSource.FOLLOW_UP, InputSource.ENTRY]:
            return await self._generate_or_update_document(decision, input, context)
```

**优化策略：**

```python
async def _optimize_from_comment(self, decision, input, context):
    """根据评论优化内容"""

    section = context.get_section(input.comment_data.section_id)

    # 根据决策模式，采用不同的优化策略
    if decision.mode == "add_examples":
        optimized = await self._add_examples_to_section(
            section=section,
            comment=input.comment_data.comment,
            user_level=input.user_level
        )
    elif decision.mode == "add_depth":
        optimized = await self._add_depth_to_section(
            section=section,
            comment=input.comment_data.comment
        )
    elif decision.mode == "more_clarity":
        optimized = await self._improve_section_clarity(
            section=section,
            comment=input.comment_data.comment
        )

    # 更新文档
    document = context.get_document(input.comment_data.document_id)
    document.update_section(input.comment_data.section_id, optimized)

    # 保存版本
    await self.db.save_version(
        doc_id=document.id,
        old_content=document.content,
        new_content=optimized.content,
        change_summary=optimized.change_summary
    )

    return ContentResult(
        document=document,
        change_summary=await self._summarize_changes(...),
        new_follow_ups=await self.generate_follow_ups(document, context)
    )
```

---

### 4. Navigator Agent（导航处理）

**职责：** 处理文档跳转和导航

```python
class NavigatorAgent:
    """导航处理器"""

    async def navigate(self, decision: RoutingDecision, context: Context):
        """处理导航请求"""

        if decision.action == "navigate":
            target_doc = await self.db.get_document(decision.target_doc_id)

            return NavigationResult(
                action="navigate",
                document=target_doc,
                message=f"已存在 {target_doc['topic']} 的文档，正在跳转..."
            )
```

---

### 5. Planner Agent（学习路径规划）

**职责：** 为用户规划最佳学习路径

```python
class PlannerAgent:
    """学习路径规划器"""

    async def plan(self, input: AgentInput, context: Context):
        """规划学习路径"""

        # 分析用户当前状态
        user_state = await self._analyze_user_state(context)

        # 规划学习路径
        path = await self._generate_learning_path(
            topic=input.target_topic,
            user_state=user_state
        )

        return PlanningResult(
            path=path,
            estimated_duration=self._estimate_duration(path),
            current_step=path[0] if path else None
        )
```

---

## LangGraph 状态定义

### 统一的 AgentState

```python
# backend/agent/state.py

from typing import TypedDict, Optional, Annotated, List, Dict, Any
from langgraph.graph.message import add_messages

# 定义 Reducer 函数
def messages_reducer(existing: List, new: List) -> List:
    """消息 Reducer：追加新消息"""
    if isinstance(existing, list):
        return existing + new
    return new

def documents_reducer(existing: List, new: List) -> List:
    """文档 Reducer：追加新文档"""
    if isinstance(existing, list):
        return existing + new
    return new

class AgentState(TypedDict):
    """统一的 Agent 状态"""

    # === 输入信息 ===
    input_source: str                  # "chat" | "comment" | "entity" | ...
    raw_message: str                   # 原始文本
    user_id: int
    session_id: str

    # === 输入特有数据 ===
    comment_data: Optional[dict]        # 评论数据
    entity_data: Optional[dict]        # 实体词数据
    current_doc_id: Optional[int]

    # === 上下文 ===
    user_level: str
    learned_topics: list
    recent_docs: list

    # === 使用 Reducer 的字段 (自动累积) ===
    messages: Annotated[List, messages_reducer]
    documents: Annotated[List, documents_reducer]

    # === Intent Agent 输出 ===
    intent: Optional[dict]

    # === Route Agent 输出 ===
    routing_decision: Optional[dict]

    # === 最终结果 ===
    document: Optional[dict]
    follow_up_questions: list
    change_summary: Optional[str]        # 变更说明

    # === 导航结果 ===
    navigation_target: Optional[dict]     # 导航指令

    # === 元数据 ===
    input_metadata: Optional[dict]       # 输入元数据扩展
```

---

## LangGraph 流程定义

### Graph 结构

```python
# backend/agent/graph.py

from langgraph.graph import StateGraph, END

def create_knowzero_graph():
    """创建 KnowZero 的 Agent 工作流"""

    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("input_normalizer", input_normalizer_node)
    graph.add_node("intent_agent", intent_agent_node)
    graph.add_node("route_agent", route_agent_node)
    graph.add_node("content_agent", content_agent_node)
    graph.add_node("planner_agent", planner_agent_node)
    graph.add_node("navigator_node", navigator_node)
    graph.add_node("chitchat_agent", chitchat_agent_node)

    # 设置入口
    graph.set_entry_point("input_normalizer")

    # 意图路由 (基于 Fast-Track 分类结果)
    graph.add_conditional_edges(
        "intent_agent",
        route_by_intent,
        {
            "chitchat": "chitchat_agent",
            "generate": "route_agent",
            "follow_up": "route_agent",
            "optimize": "route_agent",
            "navigate": "navigator_node",
            "plan": "planner_agent"
        }
    )

    # 路由决策
    graph.add_conditional_edges(
        "route_agent",
        route_by_decision,
        {
            "generate_new": "content_agent",
            "update_doc": "content_agent",
            "navigate": "navigator_node",
            "merge": "content_agent",
            "plan": "planner_agent"
        }
    )

    # 终结节点
    graph.add_edge("content_agent", END)
    graph.add_edge("navigator_node", END)
    graph.add_edge("chitchat_agent", END)
    graph.add_edge("planner_agent", "content_agent")

    return graph.compile()


# 路由函数
def route_by_intent(state: AgentState) -> str:
    """根据 Intent 的输出决定下一个节点"""
    intent = state.get("intent", {})

    intent_type = intent.get("intent_type")
    complexity = intent.get("complexity", "moderate")

    if intent_type == "navigate":
        return "navigate"
    elif intent_type == "new_topic" and "系统地" in state.get("raw_message", ""):
        return "plan"
    else:
        return "generate"


def route_by_decision(state: AgentState) -> str:
    """根据 Route Agent 的输出决定下一个节点"""
    decision = state.get("routing_decision", {})
    action = decision.get("action", "generate_new")

    return action
```

### Graph 可视化

```
                    ┌─────────────────┐
                    │  用户输入       │
                    │  (任意来源)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │Input Normalizer │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Fast-Track      │
                    │ Intent Router   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         强匹配        模糊匹配        LLM分类
              │              │              │
              ▼              ▼              ▼
        ┌─────────┐   ┌─────────┐   ┌─────────┐
        │Intent   │   │Intent   │   │Intent   │
        │Agent    │   │Agent    │   │Agent    │
        └────┬────┘   └────┬────┘   └────┬────┘
             │              │              │
             └──────────────┴──────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │  Route Agent   │
                    └────────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   generate_new      navigate         plan/update
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────┐    ┌───────────┐    ┌───────────┐
│ Content  │    │Navigator  │    │ Planner   │
│ Agent    │    │Agent      │    │ Agent     │
└─────┬────┘    └─────┬─────┘    └─────┬─────┘
      │                │                   │
      ▼                ▼                   ▼
┌─────────────────────────────────────────────┐
│              返回结果给用户               │
└─────────────────────────────────────────────┘

                    [闲聊分支]
                            │
                            ▼
                ┌─────────────────────┐
                │   Chitchat Agent    │
                │   (闲聊直接回复)     │
                └─────────┬───────────┘
                          │
                          ▼
                    直接返回 → END
```

---

## 完整流程示例

### 流程 1：聊天消息 - 新主题

```
用户: "我想学习 React Hooks"
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Input Normalizer                                        │
│  source = CHAT                                          │
│  raw_message = "我想学习 React Hooks"                     │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Fast-Track Intent Router                                │
│  强规则匹配: "我想学" → new_topic (confidence: 1.0)       │
│  跳过 LLM，直接返回                                    │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Agent (已通过 Fast-Track 确认)                 │
│  intent_type = "new_topic"                               │
│  target = "React Hooks"                                  │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Route Agent                                            │
│  决策: generate_new                                     │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Content Agent                                          │
│  生成文档:                                             │
│  - topic: "React Hooks 入门"                            │
│  - content: [Markdown]                                  │
│  - entities: [useState, useEffect, 组件, 状态]            │
│  - follow_ups: [3-5个问题]                              │
└─────────────────────────────────────────────────────────────┘
       ↓
返回: {document, follow_up_questions}
```

### 流程 2：评论优化

```
用户: 划线评论 "这里太抽象了"
       ↓ 点击 "让 AI 优化"
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Input Normalizer                                        │
│  source = COMMENT                                        │
│  raw_message = "这里太抽象了"                            │
│  comment_data = {                                       │
│    comment: "这里太抽象了",                               │
│    selected_text: "useEffect 让函数组件能够处理副作用...",   │
│    position: {start: 120, end: 145},                    │
│    document_id: 123                                      │
│  }                                                       │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Agent                                            │
│  分析评论:                                               │
│  - intent_type = "optimize_content"                        │
│  - user_need = "more_examples"                            │
│  - suggested_approach = "add_examples"                     │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Route Agent                                            │
│  决策: optimize_section                                   │
│  mode: add_examples                                      │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Content Agent                                          │
│  执行优化:                                               │
│  1. 生成 3 个具体例子                                  │
│  2. 插入到 "## 什么是副作用" 章节                       │
│  3. 保存版本                                             │
│  4. 生成变更说明: "添加了 3 个实际例子来说明副作用..."    │
└─────────────────────────────────────────────────────────────┘
       ↓
返回: {document, change_summary, new_follow_ups}
```

### 流程 3：实体词点击

```
用户: 点击文档中的 **useState**
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Input Normalizer                                        │
│  source = ENTITY                                         │
│  raw_message = "" (空)                                  │
│  entity_data = {                                         │
│    entity_name: "useState",                               │
│    source_doc_id: 123                                    │
│  }                                                       │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Agent                                            │
│  检查: 是否已有 useState 文档？                            │
│  结果: 没有已有文档                                     │
│  intent_type = "new_topic"                                │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Route Agent                                            │
│  决策: generate_new (from entity)                         │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Content Agent                                          │
│  生成实体词解释文档:                                      │
│  - topic: "useState 深入解析"                           │
│  - content: 原理、用法、常见问题                          │
│  - parent_doc_id: 123 (来源文档)                         │
│  - category: 前端/React/Hooks/useState                     │
└─────────────────────────────────────────────────────────────┘
       ↓
返回: {document, follow_up_questions}
```

### 流程 4：追问点击

```
用户: 点击追问问题按钮
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Input Normalizer                                        │
│  source = FOLLOW_UP                                      │
│  raw_message = "依赖数组怎么工作？"                        │
│  intent_hint = "follow_up_deepen"                          │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Agent                                            │
│  意图: follow_up (深入)                                  │
│  (可能跳过 LLM，通过追问类型直接判断)                   │
└─────────────────────────────────────────────────────────────┘
       ↓
走「流程 1: 聊天消息」的后续流程
```

### 流程 5：闲聊对话

```
用户: "你好"
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Input Normalizer                                        │
│  source = CHAT                                          │
│  raw_message = "你好"                                     │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Fast-Track Intent Router                                │
│  强规则匹配: "你好" → chitchat (confidence: 1.0)         │
│  跳过 LLM，直接返回                                    │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Intent Agent (已通过 Fast-Track 确认)                 │
│  intent_type = "chitchat"                                 │
└─────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│  Chitchat Agent                                           │
│  使用快速 LLM 生成友好回复:                              │
│  - 不进入文档生成流程                                    │
│  - 简洁自然回复                                          │
│  - 可引导用户回到学习主题                                │
└─────────────────────────────────────────────────────────────┘
       ↓
返回: {type: "chitchat", content: "你好！我是 KnowZero 智能学习助手..."}
```

---

## 技术栈

| 组件 | 技术 |
|------|------|
| Agent 框架 | LangGraph |
| LLM 抽象 | LangChain + 自定义 Provider |
| 状态管理 | LangGraph StateGraph |
| 向量存储 (可选) | ChromaDB / Qdrant |
| 数据库 | SQLite |

---

## 与 v1 架构的主要变化

| 方面 | v1 | v2.1 (统一版 + 闲聊支持) |
|------|----|--------------|
| 输入处理 | 只处理聊天消息 | 统一处理 5 种输入来源 |
| 意图分类 | 总是调用 LLM | Fast-Track 三层匹配 |
| 路由策略 | complexity 驱动 | 统一由 Route Agent 决策 |
| 实体词处理 | 嵌在文档中 | 独立的 EntityIndex |
| 评论锚点 | 字符偏移 | 内容指纹锚点 |
| 状态管理 | 简单 State | 带 Reducer 的 AgentState |
| 闲聊处理 | 无 | Chitchat Agent 独立处理 |

---

*Agent 架构设计 v2.1 | KnowZero 项目*
