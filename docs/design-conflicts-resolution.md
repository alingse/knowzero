# KnowZero 设计冲突分析与解决方案

> 对 10 个核心冲突的深度分析和解决策略

---

## 冲突总览

| # | 冲突领域 | 严重程度 | 类型 |
|---|---------|---------|------|
| 1 | 架构版本冲突 | 🔴 高 | 架构不一致 |
| 2 | 持久化性能 | 🔴 高 | 性能风险 |
| 3 | 实体词闭环 | 🟡 中 | 功能缺失 |
| 4 | 文档更新冲突 | 🟡 中 | 用户体验 |
| 5 | 目录分类混乱 | 🟡 中 | 可维护性 |
| 6 | 流式与持久化 | 🔴 高 | 数据一致性 |
| 7 | 意图分类过度 | 🟢 低 | 性能优化 |
| 8 | 用户状态不一致 | 🟡 中 | 体验一致性 |
| 9 | 锚点失效 | 🔴 高 | 功能可靠性 |
| 10 | 向量同步缺失 | 🟢 低 | 功能完整 |

---

## 冲突一：架构版本冲突 (🔴 高)

### 问题描述

```
v1: 基于 complexity 的简单路由
     ↓
     "simple" → 直接到 Content Agent

v2: Input Normalizer 统一处理
     ↓
     所有输入都走 Intent → Route → Content
```

**风险**：如果同时保留两种逻辑，会导致不可预测的行为。

### 解决方案

**决策：废弃 v1 简单路由，全面采用 v2**

```python
# backend/agent/graph.py - 统一架构

def create_knowzero_graph():
    """
    创建统一的 Agent Graph

    v2 架构成为唯一架构
    """

    graph = StateGraph(AgentState)

    # 统一的输入处理节点
    graph.add_node("input_normalizer", input_normalizer_node)
    graph.add_node("intent_agent", intent_agent_node)
    graph.add_node("route_agent", route_agent_node)
    graph.add_node("content_agent", content_agent_node)

    # 设置入口
    graph.set_entry_point("input_normalizer")

    # 统一的条件边
    graph.add_conditional_edges(
        "intent_agent",
        route_by_intent,
        {
            # 移除 "simple" 快速通路
            # 所有意图都经过 Route Agent
            "generate": "route_agent",
            "follow_up": "route_agent",
            "optimize": "route_agent",
            "navigate": "navigator_node"
        }
    )

    return compiled
```

**状态定义同步**

```python
# backend/agent/state.py - 唯一状态定义

# 废弃 v1 的简单字段，统一使用 v2 的结构
class AgentState(TypedDict):
    """统一的 Agent 状态"""

    # === 输入 ===
    input_source: str  # v2: InputSource enum
    raw_message: str
    comment_data: Optional[dict]
    entity_data: Optional[dict]

    # === Agent 输出 ===
    intent: Optional[dict]  # 统一格式
    routing_decision: Optional[dict]  # 统一格式

    # 不再单独的 complexity 字段 - 统一由 Route Agent 判断
```

**迁移计划**：

```markdown
## v1 → v2 迁移清单

### Agent 节点
- [ ] 移除 simple 路由逻辑
- [ ] 所有输入经过 Input Normalizer
- [ ] Intent Agent 统一输出格式
- [ ] Route Agent 处理所有输入类型

### State 定义
- [ ] 统一 AgentState 结构
- [ ] 移除废弃字段
- [ ] 更新所有节点使用新状态

### 文档
- [ ] 删除 agent-arch-v1.md
- [ ] 更新 agent-arch-v2.md 为架构主文档
- [ ] 添加迁移指南
```

---

## 冲突二：Checkpoint 膨炸 (🔴 高)

### 问题描述

```
每次 invoke:
State.messages (1000 条消息)
    ↓
序列化到 checkpoint
    ↓
SQLite checkpoint 表增长
```

**风险**：
- 1000 条消息 × 500 字符 ≈ 500KB 每个 checkpoint
- 100 次对话 = 50MB checkpoint 数据

### 解决方案：分层存储策略

```python
# backend/checkpoint/layered_saver.py

class LayeredCheckpointSaver:
    """
    分层检查点保存器

    - 完整状态：最近 N 个
    - 精简状态：更早的只保留摘要
    """

    FULL_WINDOW = 20  # 最近 20 条完整保存
    SUMMARY_WINDOW = 50  # 21-50 条保存摘要
    ARCHIVE_THRESHOLD = 100  # 超过 100 条归档

    def put(self, config, checkpoint, metadata):
        """智能分层保存"""

        thread_id = config["configurable"]["thread_id"]
        messages = checkpoint.get("channel_values", {}).get("messages", [])
        message_count = len(messages)

        # === 层 1: 最近 20 条 ===
        if message_count <= self.FULL_WINDOW:
            # 保存完整 checkpoint
            return self._save_full_checkpoint(config, checkpoint, metadata)

        # === 层 2: 21-50 条 ===
        elif message_count <= self.SUMMARY_WINDOW:
            # 只保存摘要
            summary_checkpoint = self._create_summary_checkpoint(checkpoint)
            return self._save_summary_checkpoint(config, summary_checkpoint, metadata)

        # === 层 3: 超过 50 条 ===
        else:
            # 归档旧消息，只保存新的
            return self._archive_and_save_new(config, checkpoint, metadata)

    def _create_summary_checkpoint(self, checkpoint: dict) -> dict:
        """创建精简的摘要 checkpoint"""

        messages = checkpoint.get("channel_values", {}).get("messages", [])
        recent = messages[-10:]  # 最近 10 条完整
        older = messages[:-10]  # 更早的总结

        # 使用 message-management.md 中的总结器
        summary = summarize_messages(older)

        return {
            **checkpoint,
            "id": str(uuid.uuid4()),
            "channel_values": {
                **checkpoint.get("channel_values", {}),
                "messages": recent + [
                    {"role": "system", "content": f"[历史总结] {summary}"}
                ]
            },
            "metadata": {
                **checkpoint.get("metadata", {}),
                "storage_mode": "summary",  # 标记为摘要模式
                "compressed_count": len(older)
            }
        }
```

**配合 LangGraph 使用**：

```python
# 使用分层 Saver
checkpointer = LayeredCheckpointSaver(conn_str="sqlite:///knowzero.db")

graph = graph.compile(checkpointer=checkpointer)

# checkpoint 会自动根据消息数量选择存储方式
```

---

## 冲突三：实体词点击闭环 (🟡 中)

### 问题描述

```
实体词只在生成时提取
     ↓
用户点击实体词 → 只能新建文档
     ↓
无法：更新现有实体词文档、关联到多个父文档
```

**风险**：知识图谱中可能出现重复内容。

### 解决方案：实体词索引系统

```python
# backend/services/entity_index.py

class EntityIndex:
    """
    实体词索引系统

    1. 实体词独立于文档存在
    2. 支持多对多关系
    3. 支持合并/更新
    """

    async def get_or_create_entity(self, name: str, session_id: str) -> dict:
        """获取或创建实体词"""

        # 搜索实体词
        entity = await self.db.get_entity_by_name(name)

        if entity:
            # 返回现有实体词（包含所有关系）
            return {
                "id": entity["id"],
                "name": entity["name"],
                "documents": entity["documents"],  # 所有包含此实体的文档
                "is_new": False
            }

        # 创建新实体词
        entity_id = await self.db.create_entity(
            name=name,
            session_id=session_id,
            type="concept"  # concept, tool, library, etc.
        )

        return {
            "id": entity_id,
            "name": name,
            "documents": [],
            "is_new": True
        }

    async def link_entity_to_document(
        self, entity_id: int, doc_id: int, link_type: str
    ):
        """
        关联实体词到文档

        link_type: "explains" | "mentions" | "related"
        """

        await self.db.create_entity_link(
            entity_id=entity_id,
            document_id=doc_id,
            link_type=link_type
        )

    async def merge_entities(self, source_id: int, target_id: int):
        """
        合并重复的实体词

        当发现两个实体词实际是同一概念时
        """

        # 1. 获取两个实体词的所有关联
        source_links = await self.db.get_entity_links(source_id)
        target_links = await self.db.get_entity_links(target_id)

        # 2. 将目标实体的关联迁移到源实体
        for link in target_links:
            await self.db.create_entity_link(
                entity_id=source_id,
                document_id=link["document_id"],
                link_type=link["link_type"]
            )

        # 3. 删除目标实体词
        await self.db.delete_entity(target_id)

        # 4. 更新所有文档的引用
        await self.db.remap_entity_references(target_id, source_id)
```

**数据模型**：

```sql
-- ============================================
-- 实体词表 (独立存在)
-- ============================================
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,

    -- 分类
    type TEXT,  -- concept, tool, library, technique
    category TEXT,  -- 可选的多级分类

    -- 状态
    status TEXT DEFAULT 'active',  -- active, merged, deprecated

    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- ============================================
-- 实体词-文档关联表 (多对多)
-- ============================================
CREATE TABLE entity_document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    link_type TEXT NOT NULL,  -- 'explains', 'mentions', 'related'

    -- 关联的元数据
    context_snippet TEXT,  -- 文档中如何提到这个实体
    confidence FLOAT,  -- AI 判断的置信度

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (entity_id) REFERENCES entities(id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(entity_id, document_id, link_type)
);

-- ============================================
-- 文档中提到的实体词 (用于提取)
-- ============================================
CREATE TABLE document_entities (
    document_id INTEGER NOT NULL,
    entity_id INTEGER NOT NULL,

    -- 位置信息
    position_start INTEGER,
    position_end INTEGER,
    context TEXT,  -- 周围文本

    PRIMARY KEY (document_id, entity_id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

**交互更新**：

```
用户点击实体词
     ↓
┌─────────────────────────────────────────────────────────┐
│  Entity Index 查询                                      │
│                                                          │
│  实体词存在？                                              │
│    ├─ Yes → 显示所有相关文档                              │
│  │         └─ 用户选择查看或更新                         │
│  │                                                      │
│  └─ No → Content Agent 生成文档                     │
│              并关联到新文档                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 冲突四：文档更新冲突 (🟡 中)

### 问题描述

```
用户对同一章节多次评论"太抽象"
     ↓
rewrite: 重写整个章节 (旧评论失效)
append: 不断追加 (文档冗长)
```

**风险**：用户体验不一致，文档可能变得冗长或内容丢失。

### 解决方案：增量更新系统

```python
# backend/services/document_updater.py

class DocumentUpdater:
    """
    文档增量更新系统

    1. 评论锚点使用语义定位 (不依赖字符偏移)
    2. 支持段落级别更新
    3. 变更历史可追踪
    """

    async def optimize_section(
        self, document_id: int, comment: Comment
    ) -> UpdateResult:
        """
        优化文档章节

        分析最佳更新策略并执行
        """

        # 1. 分析更新类型
        strategy = await self._analyze_update_strategy(document_id, comment)

        # 2. 执行更新
        result = await self._apply_strategy(strategy, document_id, comment)

        # 3. 记录变更
        await self._record_change(document_id, result)

        return result

    async def _analyze_update_strategy(
        self, document_id: int, comment: Comment
    ) -> str:
        """
        分析更新策略

        智能决定：追加 vs 重写 vs 插入
        """

        # 获取相关历史
        history = await self.db.get_recent_updates(document_id, limit=10)

        # 检测模式
        recent_similar = [h for h in history if h.type == comment.type]

        if len(recent_similar) >= 3:
            # 用户连续3次类似评论 → 重写
            return "rewrite_section"

        elif comment.position and comment.position_start:
            # 有位置信息 → 插入到指定位置
            return "insert_at_position"

        else:
            # 追加到章节末尾
            return "append_to_section"

    async def _apply_strategy(
        self, strategy: str, document_id: int, comment: Comment
    ) -> dict:
        """应用更新策略"""

        if strategy == "rewrite_section":
            return await self._rewrite_section(document_id, comment)

        elif strategy == "insert_at_position":
            return await self._insert_at_position(document_id, comment)

        elif strategy == "append_to_section":
            return await self._append_to_section(document_id, comment)

    async def _rewrite_section(self, document_id: int, comment: Comment):
        """重写章节"""

        # 保存版本
        await self.db.save_document_version(document_id)

        # 重写指定章节
        document = await self.db.get_document(document_id)
        section_id = comment.section_id

        optimized_content = await self.llm.generate_rewrite(
            section=document.get_section(section_id),
            user_comment=comment.comment,
            keep_structure=True
        )

        document.update_section(section_id, optimized_content)
        await self.db.save_document(document)

        return {
            "strategy": "rewrite",
            "new_version": document.version + 1,
            "preserved_anchors": []  # 重写后旧的锚点失效
        }
```

**锚点解决方案 - 语义锚点**：

```python
# backend/models/anchors.py

class SemanticAnchor:
    """
    语义锚点系统

    不依赖字符偏移，使用稳定的标识符
    """

    def __init__(self):
        self.anchor_counter = 0

    def create_anchor(self, text: str, context: str) -> str:
        """为文本段创建稳定的锚点"""

        self.anchor_counter += 1

        # 使用文本内容的哈希作为锚点基础
        content_hash = hashlib.md5(text.encode()).hexdigest()[:8]

        return f"anchor-{content_hash}-{self.anchor_counter}"

    def locate_anchor(self, document: dict, anchor_id: str) -> dict:
        """
        在文档中定位锚点

        即使文档被重写，也能通过内容相似度找到
        """

        # 搜索包含锚点内容的段落
        for section in document.sections:
            if self._text_contains(section.content, anchor_id):
                return {
                    "section_id": section.id,
                    "confidence": 1.0
                }

        # 如果完全匹配失败，使用向量搜索
        return self._fuzzy_locate_anchor(document, anchor_id)
```

---

## 冲突五：目录分类混乱 (🟡 中)

### 问题描述

```
AI 每次分类维度不一致
     ↓
目录树变得混乱
```

**风险**：可维护性差，用户体验差。

### 解决方案：分类 Schema 系统

```python
# backend/services/taxonomy.py

class TaxonomySchema:
    """
    分类模式系统

    定义全局的分类维度和规则
    """

    # === 预定义分类维度 ===
    DIMENSIONS = {
        "domain": ["前端", "后端", "移动端", "数据库", "算法"],
        "frontend_framework": ["React", "Vue", "Angular", "Svelte"],
        "backend_language": ["Python", "Go", "Java", "Node.js"],
        "database": ["PostgreSQL", "MySQL", "MongoDB", "Redis"],
        "concept_level": ["入门", "基础", "进阶", "实战"]
    }

    # === 分类规则 ===
    RULES = {
        "consistency": "同一会话内，同一主题的文档必须使用相同分类",
        "inheritance": "子文档默认继承父文档的领域",
        "max_depth": "目录树最大深度为 4 层",
        "leaf_preference": "内容类文档优先作为叶子节点"
    }

    def validate_path(self, path: str) -> dict:
        """验证分类路径是否合法"""

        parts = path.split('/')

        result = {
            "valid": True,
            "errors": [],
            "normalized_path": path
        }

        # 检查深度
        if len(parts) > self.RULES["max_depth"]:
            result["valid"] = False
            result["errors"].append(f"目录深度 {len(parts)} 超过最大 {self.RULES['max_depth']}")

        # 检查维度一致性
        current_domain = None
        for i, part in enumerate(parts):
            if part in self.DIMENSIONS["domain"]:
                if current_domain is None:
                    current_domain = part
                elif current_domain != part:
                    result["valid"] = False
                    result["errors"].append(f"第 {i+1} 层混用领域: {current_domain} → {part}")

        return result

    def suggest_category(self, topic: str, context: dict) -> str:
        """
        建议分类路径

        考虑：已有分类、用户偏好、主题内容
        """

        # 1. 分析主题关键词
        keywords = self._extract_keywords(topic)

        # 2. 检查历史分类
        history = context.get("classification_history", {})

        # 3. 应用规则
        suggested = self._apply_rules(keywords, history)

        return suggested

    def _extract_keywords(self, topic: str) -> dict:
        """从主题提取关键词"""

        # 使用简单的关键词匹配
        # 在生产中可以用 LLM

        tech_keywords = {
            "React": {"domain": "前端", "framework": "React"},
            "Python": {"domain": "后端", "language": "Python"},
            "SQL": {"domain": "数据库", "technology": "SQL"},
            # ... 更多
        }

        for tech, info in tech_keywords.items():
            if tech in topic:
                return info

        return {"domain": "未分类", "framework": "通用"}

    def _apply_rules(self, keywords: dict, history: dict) -> str:
        """应用分类规则"""

        domain = keywords.get("domain", "未分类")
        framework = keywords.get("framework", "")

        # 构建路径
        if domain == "前端":
            if framework:
                return f"{domain}/{framework}/概念"
            else:
                return f"{domain}/通用"

        elif domain == "后端":
            if framework:
                return f"{domain}/{framework}/标准库"
            else:
                return f"{domain}/通用"

        return f"未分类/{framework}"
```

**使用方式**：

```python
# backend/agent/nodes.py

async def content_agent_node(state: AgentState):
    """Content Agent - 使用分类 Schema"""

    document = state.get("document", {})

    # 使用 Taxonomy 验证和规范分类
    taxonomy = TaxonomySchema()
    suggested_path = taxonomy.suggest_category(
        topic=document["topic"],
        context={
            "session_id": state["session_id"],
            "classification_history": state.get("taxonomy_history", {})
        }
    )

    # 验证路径
    validation = taxonomy.validate_path(suggested_path)

    if not validation["valid"]:
        # 路径不合法，使用默认
        suggested_path = f"未分类/{document['topic']}"

    # 更新文档
    document["category_path"] = validation["normalized_path"]

    return {**state, "document": document}
```

---

## 冲突六：流式与持久化脱节 (🔴 高)

### 问题描述

```
Agent 生成文档 (流式输出)
     ↓
用户刷新 / 网络中断
     ↓
Checkpoint 还没保存 → 内容丢失
```

**风险**：数据丢失，用户体验差。

### 解决方案：流式中间态保存

```python
# backend/checkpoint/streaming_saver.py

from langgraph.checkpoint import Checkpoint
import asyncio

class StreamingCheckpointSaver:
    """
    流式检查点保存器

    在生成过程中定期保存中间状态
    """

    def __init__(self, base_saver):
        self.base_saver = base_saver
        self.pending_checkpoints = {}  # thread_id -> pending checkpoint
        self.save_interval = 3  # 每 3 秒保存一次

    async def save_intermediate(
        self, thread_id: str, node_name: str, partial_state: dict
    ):
        """保存中间状态"""

        checkpoint = Checkpoint(
            id=str(uuid.uuid4()),
            channel_values={
                **partial_state.get("channel_values", {}),
                "_streaming": True,  # 标记为流式中
                "_last_update": datetime.now().isoformat()
            },
            metadata={
                "source": node_name,
                "is_partial": True  # 标记为不完整
            }
        )

        self.pending_checkpoints[thread_id] = checkpoint

    async def finalize_checkpoint(
        self, thread_id: str, final_state: dict
    ):
        """完成检查点"""

        # 1. 获取待保存的中间态
        pending = self.pending_checkpoints.get(thread_id)

        # 2. 创建最终检查点
        final_checkpoint = Checkpoint(
            id=str(uuid.uuid4()),
            channel_values=final_state.get("channel_values", {}),
            metadata=final_state.get("metadata", {})
        )

        # 3. 删除中间态并保存最终态
        if pending:
            del self.pending_checkpoints[thread_id]

        return await self.base_saver.put(
            {"configurable": {"thread_id": thread_id}},
            final_checkpoint,
            {}
        )
```

**配合 LangGraph 使用**：

```python
# backend/agent/streaming_content.py

class StreamingContentAgent:
    """支持流式中间态保存的内容生成器"""

    def __init__(self, llm, checkpoint_saver):
        self.llm = llm
        self.checkpoint_saver = checkpoint_saver

    async def generate_with_checkpoints(
        self, topic: str, config: dict
    ) -> dict:
        """生成文档并定期保存中间态"""

        thread_id = config["configurable"]["thread_id"]

        # 使用流式生成
        full_content = ""
        last_checkpoint_time = time.time()

        async for chunk in self.llm.stream_generate(topic):
            full_content += chunk

            # 每 3 秒保存一次中间态
            current_time = time.time()
            if current_time - last_checkpoint_time >= self.checkpoint_saver.save_interval:
                await self.checkpoint_saver.save_intermediate(
                    thread_id=thread_id,
                    node_name="content_agent",
                    partial_state={
                        "channel_values": {
                            "generated_content": full_content,
                            "topic": topic
                        }
                    }
                )
                last_checkpoint_time = current_time

        # 完成后最终保存
        await self.checkpoint_saver.finalize_checkpoint(
            thread_id=thread_id,
            final_state={
                "channel_values": {
                    "generated_content": full_content,
                    "topic": topic
                }
            }
        )

        return {"content": full_content}
```

**前端恢复逻辑**：

```typescript
// frontend/hooks/useStreamingRecovery.ts

export function useStreamingRecovery(threadId: string, documentId: string) {
  const [streamStatus, setStreamStatus] = useState<{
    status: 'idle' | 'streaming' | 'interrupted' | 'completed'
    checkpointId: string | null
  }>({
    status: 'idle',
    checkpointId: null
  });

  // 轮询检查点状态
  useEffect(() => {
    const interval = setInterval(async () => {
      if (streamStatus.status === 'streaming' || streamStatus.status === 'interrupted') {
        const response = await fetch(
          `/api/sessions/${threadId}/checkpoint/latest`
        );
        const checkpoint = await response.json();

        if (checkpoint.metadata?.is_partial) {
          setStreamStatus({
            status: 'interrupted',
            checkpointId: checkpoint.id
          });
        } else if (checkpoint.metadata?.is_partial === false) {
          setStreamStatus({
            status: 'completed',
            checkpointId: null
          });
        }
      }
    }, 2000);  // 每 2 秒检查一次

    return () => clearInterval(interval);
  }, [threadId, documentId]);

  const resumeFromCheckpoint = async () => {
    if (!streamStatus.checkpointId) return;

    await fetch(`/api/sessions/${threadId}/resume/${streamStatus.checkpointId}`, {
      method: 'POST'
    });

    setStreamStatus({ status: 'streaming', checkpointId: null });
  };

  return { streamStatus, resumeFromCheckpoint };
}
```

---

## 冲突七：意图分类过度 (🟢 低)

### 问题描述

```
"我想学 React" ─────正则匹配────> new_topic (0ms)
     ↓
     ─────LLM 确认────> (1-2s)
```

**风险**：简单场景被延迟。

### 解决方案：分层匹配策略

```python
# backend/agent/intent_classifier.py

class IntentClassifier:
    """
    分层意图分类器

    第 1 层：强规则匹配 (0-5ms)
    第 2 层：模糊规则匹配 (5-10ms)
    第 3 层：LLM 分类 (500-2000ms)
    """

    def __init__(self):
        self.strong_patterns = {
            r"我想学|我想了解|教教我|什么是": ("new_topic", 1.0),
            r"详细说说|深入讲讲|再详细点": ("follow_up", 1.0),
            r"和.*的区别|和.*不同|对比": ("comparison", 1.0),
            r"怎么办|怎么做|如何实现": ("question_practical", 1.0),
        }
        self.fuzzy_patterns = {
            "讲详细": "follow_up",
            "说清楚": "optimize_request",
            "举例": "optimize_request",
            "更深入": "follow_up"
        }

    async def classify(self, message: str, context: dict) -> dict:
        """
        分层分类
        """

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

    async def _llm_classify(self, message: str, context: dict):
        """LLM 分类"""

        prompt = f"""
分析用户消息意图（仅当无法规则匹配时使用）：

【用户消息】{message}

【会话上下文】
当前文档: {context.get('current_doc')}
最近学习: {context.get('recent_topics', [])}

快速判断并返回 JSON：
{{
  "intent_type": "...",
  "confidence": 0.95
}}
"""

        result = await self.llm.generate_json(prompt)
        result["method"] = "llm"
        result["processing_time_ms"] = 1200  # 估计值
        return result
```

---

## 冲突八：用户状态不一致 (🟡 中)

### 问题描述

```
总结器判断: user_level = "advanced"
     ↓
Planner Agent 判断: user_level = "beginner"
     ↓
生成内容矛盾
```

**风险**：AI 行为不一致，用户体验混乱。

### 解决方案：统一用户画像系统

```python
# backend/services/user_profile.py

class UserProfileManager:
    """
    统一用户画像管理

    所有 Agent 从同一来源获取用户信息
    """

    def __init__(self, db):
        self.db = db
        self.cache = {}  # session_id -> profile

    async def get_profile(self, session_id: str) -> dict:
        """获取用户画像"""

        if session_id in self.cache:
            return self.cache[session_id]

        # 1. 获取会话信息
        session = await self.db.get_session(session_id)

        # 2. 计算用户水平
        user_level = await self._calculate_level(session)

        # 3. 分析学习风格
        learning_style = await self._analyze_style(session)

        # 4. 提取偏好主题
        preferred_topics = await self._extract_preferences(session)

        profile = {
            "user_level": user_level,
            "learning_style": learning_style,
            "preferred_topics": preferred_topics,
            "session_stats": {
                "total_docs": await self.db.count_documents(session_id),
                "completed_docs": await self.db.count_completed(session_id),
                "avg_engagement": await self._calculate_engagement(session)
            }
        }

        self.cache[session_id] = profile
        return profile

    async def _calculate_level(self, session: dict) -> str:
        """
        计算用户水平

        综合考虑：文档数量、完成度、互动质量
        """

        stats = await self._get_learning_stats(session)

        # 多维度评分
        depth_score = min(stats["unique_topics_count"] / 20, 1.0)
        completion_score = stats["completion_rate"]
        engagement_score = stats["avg_interaction_quality"]

        overall_score = (
            depth_score * 0.3 +
            completion_score * 0.4 +
            engagement_score * 0.3
        )

        if overall_score < 0.3:
            return "beginner"
        elif overall_score < 0.6:
            return "intermediate"
        else:
            return "advanced"

    async def update_interaction(self, session_id: str, interaction: dict):
        """
        更新交互数据

        每次用户交互后调用，更新画像
        """

        # 重新计算画像
        await self.invalidate(session_id)
        profile = await self.get_profile(session_id)

        return profile
```

**Agent 使用**：

```python
# 所有 Agent 从 UserProfileManager 获取用户信息

async def intent_agent_node(state: AgentState):
    """Intent Agent - 使用统一画像"""

    profile = await user_profile_manager.get_profile(state["session_id"])

    # 使用统一画像进行意图分析
    intent = await llm.classify(
        message=state["raw_message"],
        user_level=profile["user_level"],
        learning_style=profile["learning_style"]
    )

    return {**state, "intent": intent}
```

---

## 冲突九：锚点失效 (🔴 高)

### 问题描述

```
文档更新后字符偏移变化
     ↓
评论的锚点失效
     ↓
用户找不到评论位置
```

**风险**：用户标注丢失。

### 解决方案：内容指纹锚点

```python
# backend/models/semantic_anchors.py

class ContentFingerprintAnchor:
    """
    内容指纹锚点系统

    不依赖字符位置，使用内容指纹
    """

    def create_anchor(self, content: str, context: dict) -> str:
        """创建稳定的锚点"""

        # 1. 提取内容指纹
        fingerprint = self._generate_fingerprint(content)

        # 2. 生成锚点 ID
        anchor_id = f"anchor-{fingerprint}"

        return {
            "anchor_id": anchor_id,
            "fingerprint": fingerprint,
            "original_content": content
        }

    def _generate_fingerprint(self, content: str) -> str:
        """
        生成内容指纹

        使用多种方法的组合
        """

        # 方法 1: 内容哈希
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

        # 方法 2: 关键词提取
        keywords = self._extract_keywords(content)
        keyword_hash = "-".join(sorted(keywords))

        # 方法 3: 结构指纹
        structure_hash = self._analyze_structure(content)

        # 组合指纹
        return f"{content_hash}:{keyword_hash}:{structure_hash}"

    def locate_anchor(
        self, document: dict, anchor_id: str
    ) -> dict:
        """
        在文档中定位锚点

        即使文档被更新，也能找到
        """

        fingerprint = anchor_id.split("-")[1] if "-" in anchor_id else ""

        # 1. 精确匹配
        for section in document["sections"]:
            if self._fingerprint_matches(section["content"], fingerprint):
                return {
                    "section_id": section["id"],
                    "match_type": "exact",
                    "confidence": 1.0
                }

        # 2. 模糊匹配
        best_match = None
        best_score = 0

        for section in document["sections"]:
            score = self._similarity_score(section["content"], fingerprint)
            if score > best_score:
                best_score = score
                best_match = {
                    "section_id": section["id"],
                    "match_type": "fuzzy",
                    "confidence": score
                }

        if best_match and best_score > 0.6:
            return best_match

        return None

    def _fingerprint_matches(self, content: str, fingerprint: str) -> bool:
        """检查内容是否匹配指纹"""

        # 解析指纹
        parts = fingerprint.split(":")
        if len(parts) < 3:
            return False

        content_hash, keyword_hash, structure_hash = parts

        # 验证各个部分
        current_content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        if current_content_hash != content_hash:
            return False

        # 验证关键词
        current_keywords = self._extract_keywords(content)
        current_keyword_hash = "-".join(sorted(current_keywords))
        if current_keyword_hash != keyword_hash:
            # 关键词相似度检查
            similarity = self._keyword_similarity(current_keywords, keyword_hash.split("-"))
            if similarity < 0.7:
                return False

        return True
```

**配合使用**：

```python
# 保存评论时记录内容指纹

comment = await db.save_comment({
    "document_id": doc_id,
    "user_comment": "这里太抽象了",
    "anchor_id": content_fingerprint.create_anchor(
        content=selected_text,
        context={"section_id": section_id}
    )["anchor_id"]
})

# 文档更新后，仍然可以通过指纹找到锚点
```

---

## 冲突十：向量同步缺失 (🟢 低)

### 问题描述

```
Route Agent 搜索相似文档
     ↓
向量索引与 SQLite 不同步
     ↓
找不到刚生成的文档
```

**风险**：功能不可靠。

### 解决方案：向量同步策略

```python
# backend/services/vector_sync.py

class VectorSynchronizer:
    """
    向量同步器

    确保 SQLite documents 表与向量索引保持同步
    """

    def __init__(self, db, vector_client):
        self.db = db
        self.vector_client = vector_client
        self.sync_lock = asyncio.Lock()

    async def sync_document(self, document_id: int):
        """
        同步单个文档到向量库

        文档创建/更新后调用
        """

        async with self.sync_lock:
            # 1. 获取文档
            document = await self.db.get_document(document_id)

            if not document:
                return

            # 2. 生成向量嵌入
            chunks = self._chunk_document(document)
            embeddings = await self._generate_embeddings(chunks)

            # 3. 更新向量库
            await self._upsert_vectors(document, chunks, embeddings)

    async def sync_batch(self, limit: int = 100):
        """
        批量同步

        定期执行，确保一致性
        """

        async with self.sync_lock:
            # 1. 找出需要同步的文档
            docs_to_sync = await self.db.get_unsynced_documents(limit)

            # 2. 批量同步
            for doc in docs_to_sync:
                await self.sync_document(doc["id"])

            # 3. 标记为已同步
            await self.db.mark_as_synced([d["id"] for d in docs_to_sync])

    def _chunk_document(self, document: dict) -> list:
        """
        文档分块

        用于向量化
        """

        content = document["content"]

        # 按章节分块
        sections = self._split_by_sections(content)

        # 确保每块不超过 token 限制
        chunks = []
        for section in sections:
            if len(section) > 500:
                sub_chunks = self._split_by_tokens(section, max_tokens=500)
                chunks.extend(sub_chunks)
            else:
                chunks.append(section)

        return chunks

    async def _generate_embeddings(self, chunks: list) -> list:
        """生成嵌入向量"""

        # 调用嵌入模型
        embeddings = []
        for chunk in chunks:
            embedding = await self.embedding_model.embed(chunk)
            embeddings.append({
                "text": chunk,
                "vector": embedding,
                "dimension": len(embedding)
            })

        return embeddings

    async def _upsert_vectors(self, document, chunks, embeddings):
        """更新向量库"""

        # 准备向量数据
        vectors = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vectors.append({
                "id": f"{document['id']}-{i}",
                "document_id": document["id"],
                "text": chunk,
                "vector": embedding["vector"],
                "metadata": {
                    "topic": document["topic"],
                    "category_path": document["category_path"],
                    "chunk_index": i
                }
            })

        # 批量 upsert
        await self.vector_client.upsert(vectors)
```

**同步触发点**：

```python
# 在这些时机触发同步

# 1. 文档生成后
async def content_agent_node(state):
    result = await generate_document(...)
    await vector_sync.sync_document(result["document"]["id"])
    return result

# 2. 定期同步
@router.post("/admin/sync-vectors")
async def manual_sync():
    """手动触发向量同步"""
    await vector_sync.sync_batch(limit=1000)
    return {"status": "synced"}

# 3. 后台任务
@background_task.schedule(hourly)
async def periodic_vector_sync():
    """每小时同步一次"""
    await vector_sync.sync_batch()
```

---

## 优先级实施计划

### P0 (立即修复)

```
□ 冲突一：统一 v2 架构
    - 移除 v1 简单路由
    - 所有输入使用 Input Normalizer
    - 预计工作量：2-3 天

□ 冲突二：Checkpoint 分层存储
    - 实现 LayeredCheckpointSaver
    - 预计工作量：3-5 天

□ 冲突六：流式中间态保存
    - 实现 StreamingCheckpointSaver
    - 预计工作量：2-3 天
```

### P1 (重要但可延后)

```
□ 冲突九：语义锚点
    - 实现 ContentFingerprintAnchor
    - 预计工作量：5-7 天

□ 冲突五：分类 Schema
    - 实现 TaxonomySchema
    - 预计工作量：3-4 天

□ 冲突八：统一用户画像
    - 实现 UserProfileManager
    - 预计工作量：3-5 天
```

### P2 (优化项)

```
□ 冲突三：实体词索引
    - 完整实现 EntityIndex
    - 预计工作量：5-7 天

□ 冲突四：增量更新系统
    - 实现 DocumentUpdater
    - 预计工作量：5-7 天

□ 冲突七：分层意图分类
    - 实现 IntentClassifier
    - 预计工作量：2-3 天

□ 冲突十：向量同步
    - 实现 VectorSynchronizer
    - 预计工作量：5-7 天
```

---

*设计冲突分析与解决方案 v1.0 | KnowZero 项目*
