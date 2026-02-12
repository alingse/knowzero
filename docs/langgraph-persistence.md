# KnowZero LangGraph 持久化设计

> 分层存储策略、流式保存、消息压缩

---

## 核心问题

```
┌─────────────────────────────────────────────────────────────────┐
│              LangGraph Checkpoint 的挑战                     │
│                                                              │
│  1. 爆炸增长                                            │
│     每次 ainvoke 都会序列化并存储整个 messages 列表                 │
│     SQLite 数据库会迅速膨胀                                    │
│                                                              │
│  2. 加载缓慢                                              │
│     长对话场景下，加载 1000+ 条消息很慢                       │
│                                                              │
│  3. Token 浪费                                            │
│     每次都发送完整历史，LLM Token 消耗大                      │
│                                                              │
│  4. 存储空间                                              │
│     完整消息存储占用大量磁盘空间                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 解决方案总览

```
┌─────────────────────────────────────────────────────────────────┐
│               分层存储策略                             │
│                                                              │
│  第 1 层：FULL_WINDOW (最近 20 条)                          │
│  ┌────────────────────────────────────────────┐              │
│  │  完整保存，可以直接用于 LLM        │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  第 2 层：SUMMARY_WINDOW (21-50 条)                       │
│  ┌────────────────────────────────────────────┐              │
│  │  保存为总结，可以理解上下文        │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  第 3 层：ARCHIVE (51-100 条)                            │
│  ┌────────────────────────────────────────────┐              │
│  │  归档存储，仅查询时加载           │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  第 4 层：DEEP_ARCHIVE (100+ 条)                         │
│  ┌────────────────────────────────────────────┐              │
│  │  深度归档，建议分段新会话         │              │
│  └────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## LayeredCheckpointSaver

### 分层配置

```python
# backend/agent/checkpoint_saver.py

from typing import Literal, TypedDict
from datetime import datetime

class LayeredCheckpointSaver:
    """
    分层 Checkpoint Saver

    策略：
    - FULL_WINDOW = 20: 最近 20 条完整保存
    - SUMMARY_WINDOW = 50: 21-50 条保存摘要
    - ARCHIVE_THRESHOLD = 100: 超过 100 条归档
    """

    # 分层阈值
    FULL_WINDOW = 20       # 第 1 层：完整保存
    SUMMARY_WINDOW = 50     # 第 2 层：总结保存
    ARCHIVE_THRESHOLD = 100  # 第 3 层：归档

    def __init__(self, conn):
        self.conn = conn
        self._init_tables()

    def _init_tables(self):
        """初始化分层存储表"""

        self.conn.execute("""
            -- ============================================
            -- 主 checkpoint 表 (仅保存元数据)
            -- ============================================
            CREATE TABLE IF NOT EXISTS checkpoints (
                thread_id TEXT PRIMARY KEY,
                checkpoint_id TEXT,
                checkpoint_ns TEXT,

                -- 分层信息
                storage_layer TEXT NOT NULL,  -- 'full' | 'summary' | 'archive'
                message_count INTEGER NOT NULL,

                -- 元数据
                parent_checkpoint_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                -- 完整 checkpoint 数据存储在对应的分层表中
                UNIQUE(thread_id, checkpoint_id)
            );

            -- ============================================
            -- 第 1 层：完整消息存储
            -- ============================================
            CREATE TABLE IF NOT EXISTS checkpoint_full (
                thread_id TEXT,
                checkpoint_id TEXT,
                messages JSON NOT NULL,  -- 完整的 messages 数组
                metadata JSON,

                PRIMARY KEY (thread_id, checkpoint_id),
                FOREIGN KEY (thread_id, checkpoint_id)
                    REFERENCES checkpoints(thread_id, checkpoint_id)
            );

            -- ============================================
            -- 第 2 层：总结消息存储
            -- ============================================
            CREATE TABLE IF NOT EXISTS checkpoint_summary (
                thread_id TEXT,
                checkpoint_id TEXT,
                summary TEXT NOT NULL,
                summary_metadata JSON,  -- {key_topics, decisions, ...}
                message_count INTEGER,
                timestamp_range JSON,  -- {start, end}

                PRIMARY KEY (thread_id, checkpoint_id),
                FOREIGN KEY (thread_id, checkpoint_id)
                    REFERENCES checkpoints(thread_id, checkpoint_id)
            );

            -- ============================================
            -- 第 3 层：归档存储
            -- ============================================
            CREATE TABLE IF NOT EXISTS checkpoint_archive (
                thread_id TEXT,
                checkpoint_id TEXT,
                archive_key TEXT,  -- 用于查询归档的键
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (thread_id, checkpoint_id),
                FOREIGN KEY (thread_id, checkpoint_id)
                    REFERENCES checkpoints(thread_id, checkpoint_id)
            );

            -- 索引
            CREATE INDEX IF NOT EXISTS idx_checkpoint_thread
                ON checkpoints(thread_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_checkpoint_archive_key
                ON checkpoint_archive(thread_id, archive_key);
        """)
```

### 保存逻辑

```python
class LayeredCheckpointSaver:
    async def save(self, config, runnable, messages):
        """
        保存 checkpoint

        根据消息数量决定存储层
        """

        thread_id = config.get("configurable", {}).get("thread_id")
        checkpoint_id = str(uuid.uuid4())

        # 计算当前消息数
        message_count = len(messages)

        # 决定存储层
        if message_count <= self.FULL_WINDOW:
            storage_layer = "full"
            await self._save_full_checkpoint(
                thread_id, checkpoint_id, messages
            )
        elif message_count <= self.SUMMARY_WINDOW:
            storage_layer = "summary"
            await self._save_summary_checkpoint(
                thread_id, checkpoint_id, messages
            )
        elif message_count <= self.ARCHIVE_THRESHOLD:
            storage_layer = "archive"
            await self._save_archive_checkpoint(
                thread_id, checkpoint_id, messages
            )
        else:
            # 超过归档阈值，建议分段
            await self._suggest_session_split(thread_id)
            storage_layer = "archive"

        # 更新主表
        self.conn.execute("""
            INSERT OR REPLACE INTO checkpoints
            (thread_id, checkpoint_id, checkpoint_ns, storage_layer,
             message_count, parent_checkpoint_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            thread_id,
            checkpoint_id,
            config.get("configurable", {}).get("checkpoint_ns", ""),
            storage_layer,
            message_count,
            self._get_parent_checkpoint(thread_id),
            datetime.now()
        ))

        return {
            "config": config,
            "checkpoint_id": checkpoint_id
        }

    async def _save_full_checkpoint(
        self, thread_id: str, checkpoint_id: str, messages: list
    ):
        """保存完整 checkpoint"""

        # 序列化完整消息
        serialized_messages = [
            {
                "role": msg.type,
                "content": msg.content,
                "timestamp": getattr(msg, "timestamp", None)
            }
            for msg in messages[-self.FULL_WINDOW:]  # 只保留最近 FULL_WINDOW 条
        ]

        self.conn.execute("""
            INSERT OR REPLACE INTO checkpoint_full
            (thread_id, checkpoint_id, messages, metadata)
            VALUES (?, ?, ?, ?)
        """, (
            thread_id,
            checkpoint_id,
            json.dumps(serialized_messages),
            json.dumps({"layer": "full", "window_size": self.FULL_WINDOW})
        ))

    async def _save_summary_checkpoint(
        self, thread_id: str, checkpoint_id: str, messages: list
    ):
        """保存总结 checkpoint"""

        # 获取需要总结的消息 (21-50 条)
        messages_to_summarize = messages[
            max(0, len(messages) - self.SUMMARY_WINDOW):len(messages) - self.FULL_WINDOW
        ]

        # 生成总结
        summary = await self._summarize_messages(messages_to_summarize)

        self.conn.execute("""
            INSERT OR REPLACE INTO checkpoint_summary
            (thread_id, checkpoint_id, summary, summary_metadata,
             message_count, timestamp_range)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            thread_id,
            checkpoint_id,
            summary["content"],
            json.dumps({
                "key_topics": summary["key_topics"],
                "decisions": summary["decisions"],
                "entities": summary["entities"]
            }),
            len(messages_to_summarize),
            json.dumps({
                "start": messages_to_summarize[0].timestamp,
                "end": messages_to_summarize[-1].timestamp
            })
        ))

    async def _summarize_messages(self, messages: list) -> dict:
        """生成消息总结"""

        conversation_text = format_conversation_for_summary(messages)

        prompt = f"""
请总结以下对话，提取关键信息：

【对话内容】
{conversation_text}

请返回 JSON：
{{
  "content": "200字以内的总结",
  "key_topics": ["讨论的主题列表"],
  "decisions": ["做出的决策或结论"],
  "entities": ["提到的实体词"],
  "open_questions": ["未解决的问题"]
}}

注意：
- 保留重要的技术细节
- 提取学习的主题
- 标记用户的决策点
"""

        return await self.llm.generate_json(prompt)
```

### 加载逻辑

```python
class LayeredCheckpointSaver:
    async def load(self, config):
        """
        加载 checkpoint

        从分层存储中重新组合完整的消息列表
        """

        thread_id = config.get("configurable", {}).get("thread_id")

        # 1. 获取最近的 checkpoint 信息
        checkpoint = self.conn.execute("""
            SELECT * FROM checkpoints
            WHERE thread_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        """, (thread_id,)).fetchone()

        if not checkpoint:
            return None

        # 2. 根据存储层加载不同的数据
        if checkpoint["storage_layer"] == "full":
            # 从完整存储加载
            full_data = self.conn.execute("""
                SELECT messages FROM checkpoint_full
                WHERE thread_id = ? AND checkpoint_id = ?
            """, (thread_id, checkpoint["checkpoint_id"])).fetchone()

            messages = json.loads(full_data["messages"])

        elif checkpoint["storage_layer"] == "summary":
            # 从总结存储加载
            summary_data = self.conn.execute("""
                SELECT summary, summary_metadata, message_count
                FROM checkpoint_summary
                WHERE thread_id = ? AND checkpoint_id = ?
            """, (thread_id, checkpoint["checkpoint_id"])).fetchone()

            # 将总结转换为系统消息
            messages = [{
                "role": "system",
                "content": f"[之前的对话总结]\n{summary_data['summary']}",
                "metadata": summary_data["summary_metadata"]
            }]

            # 加载最近的 FULL_WINDOW 条原始消息
            recent_messages = await self._load_recent_full_messages(thread_id)
            messages.extend(recent_messages)

        elif checkpoint["storage_layer"] == "archive":
            # 归档状态，只加载总结
            messages = [{
                "role": "system",
                "content": "[历史对话已归档]",
                "metadata": {"archived": True}
            }]

        return {
            "config": config,
            "checkpoint": checkpoint,
            "messages": messages
        }

    async def _load_recent_full_messages(self, thread_id: str) -> list:
        """加载最近的完整消息"""

        # 获取最近一个 full checkpoint
        result = self.conn.execute("""
            SELECT messages FROM checkpoint_full
            WHERE thread_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        """, (thread_id,)).fetchone()

        if result:
            return json.loads(result["messages"])
        return []
```

---

## StreamingCheckpointSaver

### 流式保存策略

```python
# backend/agent/streaming_saver.py

import asyncio
from typing import Dict, Any
from datetime import datetime

class StreamingCheckpointSaver:
    """
    流式 Checkpoint Saver

    在 Agent 执行过程中，定期保存中间状态
    """

    SAVE_INTERVAL = 3  # 每 3 秒保存一次
    MAX_PENDING_CHECKPOINTS = 5  # 最多保留 5 个待完成 checkpoint

    def __init__(self, base_saver: LayeredCheckpointSaver):
        self.base_saver = base_saver
        self.pending_checkpoints: Dict[str, dict] = {}  # thread_id -> checkpoints
        self.save_tasks: Dict[str, asyncio.Task] = {}

    async def start_streaming(self, thread_id: str):
        """开始流式保存"""

        # 创建定期保存任务
        task = asyncio.create_task(self._periodic_save(thread_id))
        self.save_tasks[thread_id] = task

    async def stop_streaming(self, thread_id: str):
        """停止流式保存并完成最后的 checkpoint"""

        # 取消定期保存任务
        if thread_id in self.save_tasks:
            self.save_tasks[thread_id].cancel()
            del self.save_tasks[thread_id]

        # 完成所有待保存的 checkpoint
        await self._finalize_pending_checkpoints(thread_id)

    async def _periodic_save(self, thread_id: str):
        """定期保存中间状态"""

        while True:
            await asyncio.sleep(self.SAVE_INTERVAL)

            # 保存当前状态
            checkpoint_id = await self._save_intermediate_state(thread_id)

            # 记录待完成的 checkpoint
            if thread_id not in self.pending_checkpoints:
                self.pending_checkpoints[thread_id] = []

            self.pending_checkpoints[thread_id].append({
                "checkpoint_id": checkpoint_id,
                "status": "pending",
                "created_at": datetime.now().isoformat()
            })

            # 限制待完成 checkpoint 数量
            if len(self.pending_checkpoints[thread_id]) > self.MAX_PENDING_CHECKPOINTS:
                # 完成 oldest checkpoint
                await self._finalize_oldest_checkpoint(thread_id)

    async def _save_intermediate_state(self, thread_id: str) -> str:
        """保存中间状态（不包含完整 messages）"""

        checkpoint_id = str(uuid.uuid4())

        # 保存轻量级状态
        self.base_saver.conn.execute("""
            INSERT INTO checkpoints
            (thread_id, checkpoint_id, checkpoint_ns, storage_layer,
             message_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            thread_id,
            checkpoint_id,
            "",
            "streaming",  # 特殊的流式层
            0  # 中间状态不计入消息数
        ))

        return checkpoint_id

    async def _finalize_pending_checkpoints(self, thread_id: str):
        """完成所有待保存的 checkpoint"""

        if thread_id not in self.pending_checkpoints:
            return

        for checkpoint in self.pending_checkpoints[thread_id]:
            if checkpoint["status"] == "pending":
                # 更新状态为 completed
                checkpoint["status"] = "completed"
                checkpoint["completed_at"] = datetime.now().isoformat()

        # 保存元数据
        await self.base_saver.conn.execute("""
            UPDATE checkpoints
            SET storage_layer = 'completed'
            WHERE thread_id = ? AND checkpoint_id = ?
        """, (thread_id, checkpoint["checkpoint_id"]))
```

---

## 配合消息管理

### 与 Message Groups 的集成

```python
# backend/agent/checkpoint_integration.py

class IntegratedCheckpointManager:
    """
    集成的 Checkpoint 管理器

    配合 message_management.md 中的分层存储策略
    """

    async def save_checkpoint_optimized(
        self, config, runnable, messages
    ):
        """
        优化的 checkpoint 保存

        结合 LayeredCheckpointSaver 和 message_groups
        """

        # 1. 获取消息分组信息
        message_groups = await self.db.get_message_groups(
            session_id=config["session_id"]
        )

        # 2. 计算实际消息数（已总结的组算 1 条）
        effective_message_count = (
            len(messages) +
            sum(1 for g in message_groups if g["is_summarized"])
        )

        # 3. 根据有效消息数决定如何保存
        if effective_message_count <= 20:
            # 完整保存
            return await self.layered_saver.save(config, runnable, messages)

        elif effective_message_count <= 50:
            # 将已总结的组转换为系统消息
            summary_messages = []
            for group in message_groups:
                if group["is_summarized"]:
                    summary_messages.append({
                        "role": "system",
                        "content": f"[之前的对话总结]\n{group['summary']}"
                    })

            # 保存总结 + 最近消息
            combined_messages = summary_messages + messages[-20:]
            return await self.layered_saver.save(config, runnable, combined_messages)

        else:
            # 大量消息，建议归档
            await self._suggest_archive(config)
            # 只保存最近的消息 + 关键总结
            return await self.layered_saver.save(config, runnable, messages[-20:])
```

---

## 总结：LangGraph 持久化策略

| 策略 | 说明 | 配置 |
|------|------|------|
| **分层存储** | 根据消息数使用不同存储层 | FULL_WINDOW=20, SUMMARY_WINDOW=50 |
| **流式保存** | Agent 执行时定期保存中间态 | SAVE_INTERVAL=3s |
| **消息总结** | 早期消息压缩为总结 | 配合 message_groups |
| **归档建议** | 超过阈值提示分段 | ARCHIVE_THRESHOLD=100 |

### 存储层级

```
消息数           →  存储策略
─────────────────────────────────────────────
0 - 20          →  FULL_WINDOW (完整保存)
21 - 50         →  SUMMARY_WINDOW (总结保存)
51 - 100        →  ARCHIVE (归档)
100+            →  建议分段
```

---

*LangGraph 持久化设计 v2.0 | KnowZero 项目*
