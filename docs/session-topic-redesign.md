# Session Topic 管理重设计方案

## 背景

当前系统的问题：
1. `Session` 表的 `learning_goal` 字段在创建后从未更新
2. 首次输入技术实体词（如 "Redis"）时，没有设置 session 的主题
3. 闲聊时没有引导用户输入学习主题
4. STRONG_PATTERNS 使用硬编码正则，不符合"提示词引导"的原则

## 用户需求

### 核心流程
```
[无主题 Session]
    ↓
用户首次输入
    ↓
    ├─ 闲聊 → chitchat响应 + 引导输入学习主题
    ├─ 技术实体词 (new_topic) → 设置session topic + 生成roadmap + 生成文档
    └─ 问题 (question) → chitchat响应 + 引导输入学习主题
    ↓
[有主题 Session]
    ↓
    ├─ 追问/子主题 → 生成文档 + 绑定到roadmap
    ├─ 实体词点击 → 导航或生成文档 + 绑定到roadmap
    └─ 修改roadmap → 更新roadmap
```

### 设计原则
1. **Session Topic 作为核心状态**：一旦识别到 `new_topic`，设置 session topic，之后所有学习活动围绕这个 topic
2. **闲聊引导**：无 topic 时的闲聊，要自然地引导用户说出想学什么
3. **提示词驱动**：减少硬编码 pattern，用 LLM 理解用户意图
4. **文档绑定**：所有生成的文档都绑定到 roadmap 的里程碑

---

## 数据模型变更

### 1. Session Model
**文件**: `backend/app/models/session.py`

**变更**: 复用现有 `learning_goal` 字段存储 session topic，无需添加新字段。

```python
# existing
class Session(Base):
    title: Mapped[str]
    description: Mapped[str | None]
    learning_goal: Mapped[str | None]  # <-- 将用于存储 session topic
    # ...
```

### 2. AgentState
**文件**: `backend/app/agent/state.py`

**变更**: 添加 `session_topic` 字段

```python
class AgentState(TypedDict):
    # ... existing fields ...
    session_topic: str | None  # 当前会话的学习主题，如 "Redis", "Python"
    # ...
```

### 3. SessionContext
**文件**: `backend/app/api/routes/websocket.py` (或相关 context 文件)

**变更**: 从 Session 模型加载 `learning_goal` 作为 `session_topic`

```python
async def _load_session_context(...) -> SessionContext:
    # ... existing code ...
    return SessionContext(
        # ... existing ...
        session_topic=session.learning_goal,  # 新增
    )
```

---

## 意图分类器改造

### 目标
移除大部分 STRONG_PATTERNS，让 LLM 做语义理解，增加 session topic 感知。

### 1. 移除硬编码 Pattern
**文件**: `backend/app/agent/classifier.py`

```python
# 保留极少数高置信度的 pattern（打招呼、感谢、再见）
STRONG_PATTERNS = {
    r"^(你好|嗨|hello|hi|嗨嗨|早上好|晚上好|下午好|早安|晚安|哈喽|hey)": ("chitchat", 1.0),
    r"^(谢谢|感谢|多谢|不客气|没关系)": ("chitchat", 1.0),
    r"^(再见|拜拜|走了|回见|bye|goodbye)": ("chitchat", 1.0),
    r"你是谁|你叫什么|介绍一下自己": ("chitchat", 1.0),
}
# 移除：学习路径、规划、我想学 等 pattern，让 LLM 判断

FUZZY_PATTERNS = {}  # 清空，全部由 LLM 判断
```

### 2. 增强 LLM 提示词
**文件**: `backend/app/agent/classifier.py`

```python
_LLM_CLASSIFY_SYSTEM_PROMPT = """你是 KnowZero 学习平台的意图分类器。根据用户消息和会话状态，返回 JSON 对象。

**会话状态**：
- `session_topic`: 当前会话的学习主题（如 "Redis"、"Python"），如果为 None 表示尚未设置主题
- `has_roadmap`: 是否已生成学习路线图
- `has_documents`: 是否已有学习文档

**判断规则**（按优先级）：

## 1. 无 session_topic 时（首次建立学习主题）

### 首次识别学习主题（最高优先级）
- 用户输入技术名词/概念（如 "Redis"、"Python"、"机器学习"、"TiDB"）
- 如果有明确学习意图（非简单问句），识别为 **new_topic**
- 提取 `target` 作为潜在的学习主题

### 引导设置学习主题
- 用户问 "你是谁"、"你能干什么"、"怎么用" → **chitchat_need_topic**
- 闲聊打招呼 → **chitchat_need_topic**
- 目的：友好回应后，引导用户说出想学什么

### 问题咨询（无主题）
- 用户问具体技术问题（如 "Redis 和 Memcached 区别？"）→ **question_need_topic**
- 回答问题后，引导用户确定学习主题

## 2. 有 session_topic 时（已有学习主题）

### 继续学习
- 用户问主题相关问题 → **question**
- 用户输入子主题/知识点 → **subtopic**
- 用户想深入学习某方面 → **follow_up**

### 修改路线图
- "太简单"、"太难"、"调整一下" → **modify_roadmap**

### 明确规划请求
- "生成 roadmap"、"学习路线" → **plan**

### 实体词点击（通过 input_source 区分）
- `input_source=entity` → 单独处理

## 输出格式
```json
{
  "intent_type": "new_topic | chitchat_need_topic | question_need_topic | question | subtopic | follow_up | plan | modify_roadmap | comparison | navigate",
  "target": "提取的核心主题（仅对 new_topic 有效）",
  "user_role": "beginner | intermediate | expert",
  "context": "应用场景",
  "reasoning": "判断原因"
}
```

只返回 JSON，不要其他内容。"""
```

### 3. 传递 session_topic 状态
**文件**: `backend/app/agent/nodes/intent.py`

```python
# chat 分支
context = {
    "use_llm": True,
    "has_roadmap": state.get("current_roadmap") is not None,
    "has_documents": bool(state.get("recent_docs")),
    "session_topic": state.get("session_topic"),  # 新增
}
intent = await classifier.classify(message, context)
```

---

## Chitchat Agent 增强

### 目标
无 topic 时的闲聊，要引导用户说出学习主题。

**文件**: `backend/app/agent/nodes/chitchat.py`

```python
CHITCHAT_SYSTEM_PROMPT = """你是 KnowZero 学习平台的 AI 助手。

**角色定位**：友好、热情、专业的学习助手。

**回复原则**：
1. 回复简洁（1-2句话），不要长篇大论
2. 根据会话状态调整回复策略

**无学习主题时** (`has_topic=false`)：
- 问候 → 热情回应 + 引导说出想学什么
- 咨询 → 简要回答 + 询问想学什么技术
- 示例："你好！我是 KnowZero 学习助手。告诉我你想学什么技术吧，我帮你制定学习计划。"

**有学习主题时** (`has_topic=true`)：
- 问候 → 简洁回应 + 鼓励继续学习
- 示例："继续学习 {topic} 吧，有什么问题随时问我。"

**严禁**：
- 不要主动推荐技术（除非用户明确询问）
- 不要说"我什么都懂"，保持谦逊
- 不要输出超过2句话"""
```

---

## Route Agent 改造

### 目标
根据 `session_topic` 状态进行路由决策。

### 1. 更新 OBVIOUS_DECISIONS
**文件**: `backend/app/agent/nodes/route.py`

```python
OBVIOUS_DECISIONS = {
    # 无 topic 时的 new_topic → 设置 topic + 生成 roadmap
    ("new_topic", False, None): {
        "action": "establish_topic",  # 新 action
        "mode": "topic_first",  # 新 mode
        "reasoning": "First learning topic: establish session topic + generate roadmap + document"
    },

    # 有 topic 时的继续学习
    ("subtopic", True, "has_roadmap"): {
        "action": "generate_new",
        "mode": "roadmap_learning",
        "reasoning": "Subtopic under existing roadmap"
    },
    ("question", True, "has_roadmap"): {
        "action": "generate_new",
        "mode": "roadmap_learning",
        "reasoning": "Question under existing roadmap"
    },

    # 修改 roadmap
    ("modify_roadmap", True, "has_roadmap"): {
        "action": "plan",
        "mode": "roadmap_modify",
        "reasoning": "Modify existing roadmap"
    },

    # 其他保持不变...
}
```

### 2. 新增 establish_topic 处理
**文件**: `backend/app/agent/nodes/route.py`

在 `route_by_decision()` 中添加：

```python
def route_by_decision(state: AgentState) -> str:
    decision = state.get("routing_decision") or {}
    action = decision.get("action", "generate_new")

    if action == "navigate":
        return "navigator_agent"
    if action == "plan":
        return "planner_agent"
    if action == "establish_topic":
        return "topic_agent"  # 新节点
    return "content_agent"
```

---

## 新增 Topic Agent

### 职责
1. 从 intent 中提取 learning topic
2. 设置 session topic（更新 Session.learning_goal）
3. 生成 roadmap
4. 生成首个文档
5. 绑定文档到 roadmap

**文件**: `backend/app/agent/nodes/topic.py` (新建)

```python
"""Topic Agent - Establish session topic and generate initial roadmap + document."""

from typing import Any, cast

from app.agent.state import AgentState
from app.agent.llm import get_llm
from app.core.logging import get_logger
from app.services import session_service, roadmap_service

logger = get_logger(__name__)


async def topic_agent_node(state: AgentState) -> AgentState:
    """Establish session topic, generate roadmap, and generate first document.

    Flow:
    1. Extract learning topic from intent
    2. Update session.learning_goal
    3. Generate roadmap
    4. Set state to continue to content_agent for first document
    """
    intent = state.get("intent") or {}
    target = intent.get("target", "")
    user_role = intent.get("user_role", "beginner")
    context = intent.get("context", "")
    session_id = state.get("session_id", "")

    logger.info(
        "Topic Agent: establishing session topic",
        target=target,
        user_role=user_role,
    )

    # 1. Resolve the learning topic
    topic = _resolve_topic(state, target)
    state["session_topic"] = topic

    # 2. Update session.learning_goal
    # Note: This should happen in the post_process or via a service call
    # For now, set in state and let websocket handler persist
    state["pending_session_update"] = {"learning_goal": topic}

    # 3. Generate roadmap (delegates to planner logic)
    roadmap_data = await _generate_roadmap(state, topic, user_role, context)
    state["roadmap"] = cast(dict[str, Any], roadmap_data)

    # 4. Continue to content_agent for first document
    state["roadmap_only"] = False
    state["roadmap_modified"] = False

    logger.info(
        "Topic Agent: session topic established",
        topic=topic,
        has_roadmap=bool(roadmap_data),
    )

    return state


def _resolve_topic(state: AgentState, target: str) -> str:
    """Resolve and normalize the learning topic."""
    # Clean up common prefixes
    prefixes = ["我想学", "我想了解", "教教我", "学习", "了解一下"]
    cleaned = target
    for prefix in prefixes:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()

    # Remove common suffixes
    suffixes = ["入门", "基础", "教程", "指南"]
    for suffix in suffixes:
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)].strip()

    return cleaned or target


async def _generate_roadmap(
    state: AgentState,
    topic: str,
    user_role: str,
    context: str,
) -> dict[str, Any]:
    """Generate roadmap for the topic.

    This is similar to planner._generate_roadmap but focused on topic establishment.
    """
    from app.agent.nodes.planner import RoadmapOutput, PLANNER_SYSTEM_PROMPT

    llm = get_llm()

    prompt_parts = [f"请为「{topic}」生成一个适合 {user_role} 水平的学习路线图。"]
    if context:
        prompt_parts.append(f"应用场景为：{context}。")
    user_prompt = "\n".join(prompt_parts)

    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        structured_llm = llm.with_structured_output(RoadmapOutput, method="json_mode")
        result = await structured_llm.ainvoke(
            [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt),
            ]
        )

        return {
            "goal": result.goal,
            "milestones": [m.model_dump() for m in result.milestones],
            "mermaid": result.mermaid,
            "version": 1,
        }
    except Exception as e:
        logger.error("Failed to generate roadmap in topic_agent", error=str(e))
        # Fallback minimal roadmap
        return {
            "goal": topic,
            "milestones": [
                {
                    "id": 0,
                    "title": "学习规划",
                    "description": f"关于 {topic} 的学习路径",
                    "topics": [],
                }
            ],
            "mermaid": None,
            "version": 1,
        }
```

---

## Session Service 扩展

### 新增函数
**文件**: `backend/app/services/session_service.py`

```python
async def update_session_topic(
    db: AsyncSession,
    session_id: str,
    topic: str | None,
) -> Session | None:
    """Update session's learning goal (topic)."""
    from sqlalchemy import select

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if session:
        session.learning_goal = topic
        await db.commit()
        await db.refresh(session)

    return session
```

---

## WebSocket Handler 更新

### 1. 加载 session_topic
**文件**: `backend/app/api/routes/websocket.py`

```python
async def _load_session_context(...) -> SessionContext:
    # ... existing ...
    session_topic = session.learning_goal if session else None
    # ...
    return SessionContext(
        # ... existing ...
        session_topic=session_topic,
    )
```

### 2. 传递到 agent state
**文件**: `backend/app/api/routes/websocket.py`

```python
def _build_agent_state(...) -> AgentState:
    return {
        # ... existing ...
        "session_topic": context.session_topic,
    }
```

### 3. 持久化 session topic 更新
**文件**: `backend/app/api/routes/websocket.py`

在处理 agent 结果后：

```python
# After agent completes
if state.get("pending_session_update"):
    update_data = state["pending_session_update"]
    await session_service.update_session_topic(
        db, session_id, update_data.get("learning_goal")
    )
```

---

## Agent Graph 更新

### 添加 topic_agent 节点
**文件**: `backend/app/agent/graph.py`

```python
from app.agent.nodes.topic import topic_agent_node

# Add node
workflow.add_node("topic_agent", topic_agent_node)

# Update conditional edge
def route_by_decision(state: AgentState) -> str:
    decision = state.get("routing_decision") or {}
    action = decision.get("action", "generate_new")

    if action == "navigate":
        return "navigator_agent"
    if action == "plan":
        return "planner_agent"
    if action == "establish_topic":
        return "topic_agent"  # 新增
    return "content_agent"
```

---

## 闲聊引导话术模板

### 无 topic 时的响应模板

| 用户输入类型 | 响应模板 |
|------------|---------|
| 打招呼 | "你好！我是 KnowZero 学习助手。告诉我你想学什么技术吧，我帮你制定学习计划。" |
| 询问功能 | "我可以帮你生成学习路线图和文档。你想学什么技术？" |
| 闲聊其他 | "明白了。那你有没有想学的技术或概念？我可以帮你规划学习路径。" |
| 技术问题 | "这是个好问题！不过我们先确定一下你想系统学习哪个主题，然后我可以帮你深入讲解。你有什么想学的吗？" |

---

## 预期效果场景

### 场景 1：首次输入技术实体
```
用户: "Redis"
会话状态: session_topic=None, has_roadmap=False

流程:
1. intent_agent: new_topic, target="Redis"
2. route_agent: action=establish_topic
3. topic_agent:
   - 设置 session_topic="Redis"
   - 生成 Redis roadmap
   - roadmap_only=False
4. content_agent: 生成 Redis 首个文档
5. post_process: 绑定文档到 roadmap milestone 0

结果: session.topic="Redis", 有 roadmap, 有文档
```

### 场景 2：首次闲聊
```
用户: "你好"
会话状态: session_topic=None, has_roadmap=False

流程:
1. intent_agent: chitchat_need_topic
2. route_agent: action=chitchat
3. chitchat_agent: "你好！我是 KnowZero 学习助手。告诉我你想学什么技术吧。"

结果: session.topic=None, 无 roadmap, 用户被引导
```

### 场景 3：有 topic 后追问
```
用户: "Redis 的持久化机制是什么？"
会话状态: session_topic="Redis", has_roadmap=True

流程:
1. intent_agent: question (因为已有 topic)
2. route_agent: action=generate_new, mode=roadmap_learning
3. content_agent: 生成 Redis 持久化文档
4. post_process: 绑定到相关 milestone

结果: 新文档生成并绑定到 roadmap
```

### 场景 4：实体词点击
```
用户: 点击 "pipeline"
会话状态: session_topic="Redis", has_roadmap=True

流程:
1. intent_agent: input_source=entity → navigate/new_topic
2. 如果已有文档 → navigator_agent 导航
3. 如果无文档 → content_agent 生成新文档并绑定

结果: 导航或生成新文档
```

---

## 修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `backend/app/agent/state.py` | 修改 | 添加 session_topic 字段 |
| `backend/app/agent/classifier.py` | 修改 | 简化 STRONG_PATTERNS，增强提示词 |
| `backend/app/agent/nodes/intent.py` | 修改 | 传递 session_topic 到 classifier |
| `backend/app/agent/nodes/chitchat.py` | 修改 | 增强提示词，无 topic 时引导 |
| `backend/app/agent/nodes/route.py` | 修改 | 更新 OBVIOUS_DECISIONS，添加 establish_topic 路由 |
| `backend/app/agent/nodes/topic.py` | 新建 | Topic Agent 节点 |
| `backend/app/services/session_service.py` | 修改 | 添加 update_session_topic 函数 |
| `backend/app/api/routes/websocket.py` | 修改 | 加载/传递/持久化 session_topic |
| `backend/app/agent/graph.py` | 修改 | 添加 topic_agent 节点 |

---

## 实施优先级

### P0 (核心功能)
1. 添加 session_topic 到 AgentState 和 SessionContext
2. 创建 topic_agent 节点
3. 更新 classifier 提示词和意图类型
4. 更新 route_agent 路由逻辑

### P1 (支持功能)
5. 增强 chitchat_agent 引导话术
6. session_service 添加 topic 更新函数
7. websocket 持久化 session_topic

### P2 (优化)
8. 完善日志和监控
9. 添加单元测试
10. 完善错误处理
