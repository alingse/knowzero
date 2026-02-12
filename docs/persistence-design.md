# KnowZero 持久化设计

> 会话恢复、消息存储、状态同步、实体索引、评论锚点

---

## 核心需求

```
┌─────────────────────────────────────────────────────────────────┐
│                    持久化需求                               │
│                                                              │
│  1. 刷新恢复: 用户刷新页面，聊天记录不丢失                      │
│  2. 随时随地: 用户在不同设备上继续学习                        │
│  3. 版本历史: 文档更新历史可追溯                              │
│  4. 评论保存: 划线评论永久保存（使用内容指纹锚点）                 │
│  5. 学习进度: 用户学到哪里了，可随时恢复                        │
│  6. Agent 状态: Agent 处理过程中的状态可查询                    │
│  7. 实体词索引: 实体词独立存储，支持多对多关系                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据模型设计

### 核心实体关系

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   User      │         │  Session    │         │  Message    │
│             │       ─→│             │       ─→│             │
│  - id       │         │  - id       │         │  - id       │
│  - settings │         │  - user_id  │         │  - content  │
└─────────────┘         │  - title    │         │  - role     │
                        │  - created  │         │  - type     │
                        └─────────────┘         │  - timestamp │
                               ↑               └─────────────┘
                               │                       │
                        ┌─────────────┐               │
                        │  Document   │               │
                        │             │ ←──────────────┘
                        │  - id       │               │
                        │  - topic    │         ┌─────────────┐
                        │  - content  │ ←──────│  Comment    │
                        │  - version  │ ←──────│             │
                        │  - session  │         │  - doc_id   │
                        └─────────────┘         │  - anchor_fp│
                               │             │  - context  │
                        ┌─────────────┐             └─────────────┘
                        │   Entity    │
                        │             │
                        │  - id       │
                        │  - name     │
                        └─────────────┘
```

### 完整数据模型

```sql
-- backend/database/schema.sql

-- ============================================
-- 用户表
-- ============================================
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    -- 用户设置
    settings JSON DEFAULT '{}',  -- {theme, language, ...}
    -- AI 配置
    ai_provider TEXT DEFAULT 'openai',
    ai_api_key_encrypted TEXT,
    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 会话表 (学习会话)
-- ============================================
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,  -- 会话标题，如 "React 学习之旅"
    description TEXT,       -- 会话描述

    -- 学习目标 (可选)
    learning_goal TEXT,    -- "系统学习 React"
    target_completion_date DATE,

    -- 当前状态
    current_document_id INTEGER,  -- 当前正在看的文档
    progress JSON DEFAULT '{}',  -- {"total_docs": 10, "completed": 3}

    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (current_document_id) REFERENCES documents(id)
);

-- ============================================
-- 消息表 (聊天记录)
-- ============================================
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,

    -- 消息内容
    role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,  -- Markdown 内容

    -- 消息类型 (可选，用于特殊消息)
    type TEXT DEFAULT 'chat',  -- 'chat' | 'document_generated' | 'error'

    -- 关联数据 (用于恢复 Agent 状态)
    related_document_id INTEGER,  -- 如果消息生成了文档
    agent_intent JSON,  -- Intent Agent 的输出
    agent_routing JSON,  -- Route Agent 的输出

    -- 元数据
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER DEFAULT 0,

    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (related_document_id) REFERENCES documents(id)
);

-- ============================================
-- 消息分组表 (用于消息总结和分层存储)
-- ============================================
CREATE TABLE message_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    group_index INTEGER NOT NULL,  -- 分组序号

    -- 总结信息
    summary TEXT,  -- 该组消息的总结
    summary_model TEXT,  -- 用于总结的模型
    summary_tokens INTEGER,  -- 总结使用的 tokens

    -- 时间范围
    start_timestamp TIMESTAMP,
    end_timestamp TIMESTAMP,
    message_count INTEGER DEFAULT 0,

    -- 状态
    is_summarized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- ============================================
-- 文档表
-- ============================================
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,

    -- 文档内容
    topic TEXT NOT NULL,
    content TEXT NOT NULL,  -- Markdown 内容
    content_hash TEXT,  -- 内容哈希，用于检测重复

    -- 版本管理
    version INTEGER DEFAULT 1,
    parent_document_id INTEGER,  -- 从哪个文档的实体词生成

    -- 分类
    category_path TEXT,  -- "前端/React/Hooks"

    -- 关系 (保留用于兼容)
    entities JSON DEFAULT '[]',  -- 提取的实体词
    prerequisites JSON DEFAULT '[]',  -- 前置文档 ID
    related JSON DEFAULT '[]',  -- 相关文档 ID

    -- AI 生成元数据
    generation_metadata JSON,  -- {model, tokens, time}

    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_document_id) REFERENCES documents(id)
);

-- ============================================
-- 文档版本历史表 (更新：新增 diff 和 parent_version_id)
-- ============================================
CREATE TABLE document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,

    -- 版本信息
    version INTEGER NOT NULL,
    content TEXT NOT NULL,

    -- 变更说明
    change_summary TEXT,  -- "添加了 3 个例子"
    change_type TEXT,  -- 'created' | 'updated' | 'optimized'

    -- 新增：版本间的变更 (Delta 格式)
    diff JSON,  -- 使用 diff 算法生成的变更

    -- 新增：父版本引用 (支持版本追溯)
    parent_version_id INTEGER,  -- 指向前一个版本

    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- ============================================
-- 追问问题表
-- ============================================
CREATE TABLE follow_up_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,

    -- 问题内容
    question TEXT NOT NULL,
    question_type TEXT,  -- 'basic' | 'deep' | 'practice'
    entity_tag TEXT,  -- 关联的实体词

    -- 状态
    is_clicked BOOLEAN DEFAULT FALSE,  -- 是否被点击过

    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- ============================================
-- 评论表 (更新：新增内容指纹锚点字段)
-- ============================================
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    -- 评论内容
    selected_text TEXT,  -- 用户选中的文本
    comment TEXT NOT NULL,  -- 用户评论

    -- 位置信息 (保留用于兼容)
    position_start INTEGER,
    position_end INTEGER,
    section_id TEXT,  -- 所在章节 ID

    -- === 新增：内容指纹锚点系统 ===
    -- 内容指纹 (用于锚点定位，替代字符偏移)
    anchor_fingerprint TEXT,  -- 内容指纹: hash:keywords:structure

    -- 锚点上下文 (用于模糊匹配)
    anchor_context_prefix TEXT,  -- 锚点前的上下文
    anchor_context_suffix TEXT,  -- 锚点后的上下文

    -- 优化状态
    optimization_status TEXT DEFAULT 'pending',  -- 'pending' | 'optimized' | 'dismissed'
    optimization_document_version INTEGER,  -- 优化后的版本号

    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 实体词表 (独立于文档存在)
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
-- 实体词-文档关联表 (多对多关系)
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
-- 文档中提到的实体词 (用于提取时记录位置)
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

-- ============================================
-- Checkpoint 元数据表 (LangGraph 持久化扩展)
-- ============================================
CREATE TABLE checkpoint_metadata (
    thread_id TEXT,
    checkpoint_id TEXT,
    user_id INTEGER,
    session_id TEXT,

    -- 检查点状态
    checkpoint_data JSON,  -- 检查点包含的数据摘要

    -- Agent 执行信息
    agents_involved JSON,  -- ["intent", "route", "content"]
    execution_path JSON,  -- 完整执行路径

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (thread_id, checkpoint_id)
);

-- ============================================
-- Agent 执行记录表 (用于调试和恢复)
-- ============================================
CREATE TABLE agent_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    message_id INTEGER,  -- 触发的消息

    -- Agent 执行链
    agents_involved JSON,  -- ["intent", "route", "content"]
    execution_path JSON,  -- 完整执行路径

    -- 输入输出
    input_data JSON,
    intent_output JSON,
    routing_output JSON,
    content_output JSON,

    -- 性能
    total_duration_ms INTEGER,
    llm_calls_count INTEGER,
    llm_tokens_used INTEGER,

    -- 错误
    error_occurred BOOLEAN DEFAULT FALSE,
    error_message TEXT,

    -- 元数据
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

CREATE INDEX idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX idx_messages_user ON messages(user_id, timestamp);

CREATE INDEX idx_documents_session ON documents(session_id);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);

CREATE INDEX idx_comments_document ON comments(document_id);
CREATE INDEX idx_comments_anchor_fp ON comments(anchor_fingerprint);

CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_session ON entities(session_id);

CREATE INDEX idx_entity_links_entity ON entity_document_links(entity_id);
CREATE INDEX idx_entity_links_document ON entity_document_links(document_id);

CREATE INDEX idx_message_groups_session ON message_groups(session_id);
```

---

## 实体词索引系统

### 设计目标

- 实体词独立于文档存在
- 支持多对多关系
- 支持合并/更新

### 核心功能

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

---

## 评论锚点系统

### 问题：字符偏移量失效

```
文档更新后字符偏移变化
     ↓
评论的锚点失效
     ↓
用户找不到评论位置
```

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
```

---

## 版本映射系统

### 版本间关系追踪

```python
# backend/services/version_mapper.py

class DocumentVersionMapper:
    """文档版本映射管理器"""

    async def save_version(
        self, doc_id: int, old_content: str, new_content: str
    ) -> int:
        """保存新版本并记录变更"""

        # 1. 获取当前最大版本号
        current_version = await self.db.get_max_version(doc_id)

        # 2. 生成 diff
        diff = self._generate_diff(old_content, new_content)

        # 3. 保存新版本
        new_version_id = await self.db.create_document_version(
            document_id=doc_id,
            version=current_version + 1,
            content=new_content,
            change_type="updated",
            diff=diff,
            parent_version_id=current_version  # 指向父版本
        )

        return new_version_id

    def _generate_diff(self, old: str, new: str) -> dict:
        """生成内容变更的 diff"""

        import difflib

        # 使用 unified diff
        diff_lines = list(difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            lineterm=''
        ))

        return {
            "type": "unified",
            "lines": diff_lines,
            "summary": self._summarize_diff(diff_lines)
        }
```

---

## 会话恢复流程

### 场景：刷新页面恢复

```python
# backend/api/routes/sessions.py

@router.get("/sessions/{session_id}/restore")
async def restore_session(session_id: str):
    """
    刷新页面时恢复会话状态

    返回前端需要的所有数据
    """

    # 1. 获取会话信息
    session = await db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # 2. 获取最近的 N 条消息 (配合分层存储策略)
    messages = await db.get_recent_messages_with_groups(
        session_id=session_id,
        limit=50  # 只加载最近 50 条
    )

    # 3. 获取当前文档
    current_doc = None
    if session.get("current_document_id"):
        current_doc = await db.get_document(session["current_document_id"])

    # 4. 获取会话中的所有文档列表
    documents = await db.get_session_documents(session_id)

    # 5. 构建目录树
    category_tree = await build_category_tree(documents)

    # 6. 获取用户设置
    user_settings = await db.get_user_settings(session["user_id"])

    return {
        "session": session,
        "messages": messages,
        "current_document": current_doc,
        "documents": category_tree,
        "user_settings": user_settings,
        # 前端可以用这个恢复聊天界面
        "restore_position": "last_message"  # 或 "last_document"
    }
```

---

## 总结：持久化设计要点

| 需求 | 解决方案 |
|------|---------|
| 刷新恢复 | Session + Messages + Message Groups 完整保存 |
| 版本历史 | document_versions 表 (含 diff 和 parent_version_id) |
| 评论保存 | comments 表 (含 anchor_fingerprint 锚点) |
| Agent 状态 | messages 表存储 agent_intent/routing |
| 实体词索引 | entities + entity_document_links 多对多关系 |
| 分层存储 | message_groups 表配合消息总结 |

---

*持久化设计 v2.0 | KnowZero 项目*
