# KnowZero 长对话消息管理

> 解决长时间会话的消息爆炸问题 - 与分层检查点存储集成

---

## 核心问题

```
┌─────────────────────────────────────────────────────────────────┐
│                  长时间会话的挑战                           │
│                                                              │
│  1. Token 限制                                            │
│     LLM 上下文窗口有限 (4K-128K tokens)                   │
│     消息太多会超出限制                                     │
│                                                              │
│  2. 性能问题                                              │
│     加载 1000+ 条消息很慢                                    │
│     LangGraph Checkpoint 会变大                                  │
│                                                              │
│  3. 成本问题                                              │
│     每次都发送完整历史，Token 消耗大                         │
│                                                              │
│  4. 用户体验                                              │
│     刷新时加载很久，用户等不及                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 消息增长模式

```
会话长度 (消息数)
      │
      ▼
    0-50    → 正常加载
    50-200   → 需要优化
    200-1000 → 必须压缩
    1000+    → 建议分段
```

---

## 解决方案总览

```
┌─────────────────────────────────────────────────────────────────┐
│               分层消息管理策略                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  配合 LangGraph 分层存储                    │    │
│  │  FULL_WINDOW (0-20 条)                          │    │
│  │  SUMMARY_WINDOW (21-50 条)                       │    │
│  │  ARCHIVE (51-100 条)                              │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  消息分组表 (message_groups)                  │    │
│  │  - 当消息数 > 100 时开始总结                    │    │
│  │  - 总结保留关键信息                            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 与 LayeredCheckpointSaver 集成

### 分层存储配合

```python
# backend/services/message_manager.py

class MessageManager:
    """
    消息管理器 - 配合分层检查点存储
    """

    def __init__(self, layered_saver: LayeredCheckpointSaver):
        self.layered_saver = layered_saver

        # 与分层存储同步的阈值
        self.FULL_WINDOW = layered_saver.FULL_WINDOW      # 20
        self.SUMMARY_WINDOW = layered_saver.SUMMARY_WINDOW  # 50
        self.ARCHIVE_THRESHOLD = layered_saver.ARCHIVE_THRESHOLD  # 100

    async def get_messages_for_llm(
        self, session_id: str, limit: int = None
    ) -> list:
        """
        获取用于 LLM 的消息

        自动应用滑动窗口和总结策略
        配合 LangGraph Checkpoint 的分层存储
        """

        # 1. 获取最近的完整消息 (FULL_WINDOW)
        recent_messages = await self.db.get_recent_messages(
            session_id=session_id,
            limit=self.FULL_WINDOW
        )

        # 2. 获取总结组 (SUMMARY_WINDOW 范围)
        groups = await self.db.get_message_groups(session_id)
        group_summaries = []

        for group in groups:
            if group["is_summarized"]:
                group_summaries.append({
                    "role": "system",
                    "content": f"[之前的对话总结]\n{group['summary']}"
                })

        # 3. 组合消息
        total_messages = group_summaries + recent_messages

        # 4. 检查是否超出 token 限制
        total_tokens = count_tokens(total_messages)

        if limit and total_tokens > limit:
            # 进一步裁剪
            return self._trim_by_tokens(total_messages, limit)

        return total_messages

    async def add_message(self, session_id: str, message: Message) -> int:
        """
        添加新消息

        自动检测是否需要创建新的总结组
        与分层存储保持同步
        """

        # 1. 保存消息
        message_id = await self.db.save_message(message)

        # 2. 检查是否需要总结
        total_count = await self.db.count_messages(session_id)

        # 3. 与分层存储阈值同步
        if total_count >= self.SUMMARY_WINDOW:
            await self._create_summary_group(session_id)

        # 4. 如果超过归档阈值，建议分段
        if total_count >= self.ARCHIVE_THRESHOLD:
            await self._suggest_session_segmentation(session_id)

        return message_id

    async def _create_summary_group(self, session_id: str):
        """
        创建消息总结组

        将 FULL_WINDOW 之前的消息总结为一组
        """

        # 1. 获取需要总结的消息
        messages_to_summarize = await self.db.get_messages_before_window(
            session_id=session_id,
            window_size=self.FULL_WINDOW
        )

        if not messages_to_summarize:
            return

        # 2. 调用 LLM 总结
        summary = await self._summarize_messages(messages_to_summarize)

        # 3. 创建消息组
        group = await self.db.create_message_group(
            session_id=session_id,
            summary=summary["content"],
            summary_model=summary["model"],
            summary_tokens=summary["tokens"],
            message_count=len(messages_to_summarize),
            start_timestamp=messages_to_summarize[0]["timestamp"],
            end_timestamp=messages_to_summarize[-1]["timestamp"]
        )

        # 4. 更新消息的 group_id
        await self.db.assign_messages_to_group(
            session_id=session_id,
            message_ids=[m["id"] for m in messages_to_summarize],
            group_id=group["id"]
        )

        return group

    async def _summarize_messages(self, messages: list) -> dict:
        """调用 LLM 总结消息"""

        conversation_text = format_conversation(messages)

        prompt = f"""
请总结以下对话，提取关键信息：

【对话内容】
{conversation_text}

请返回 JSON：
{{
  "summary": "200字以内的总结",
  "key_topics": ["讨论的主题列表"],
  "decisions_made": ["做出的决策或结论"],
  "open_questions": ["未解决的问题"],
  "user_level": "估计的用户水平",
  "suggested_next": "建议的下一步"
}}

注意：
- 保留重要的技术细节
- 提取学习的主题
- 标记用户的决策点
"""

        result = await self.llm.generate_json(prompt)

        return {
            "content": result["summary"],
            "model": self.llm.model_name,
            "tokens": count_tokens(result["summary"])
        }
```

---

## 消息压缩策略

### 压缩类型

```python
# backend/services/message_compressor.py

class MessageCompressor:
    """消息压缩器 - 减少存储和传输大小"""

    def __init__(self):
        self.compression_strategies = {
            "system": self._compress_system_messages,
            "user": self._compress_user_messages,
            "assistant": self._compress_assistant_messages,
            "document": self._compress_document_messages
        }

    async def compress_session(self, session_id: str):
        """压缩会话的所有消息"""

        messages = await self.db.get_messages(session_id)

        compressed_messages = []
        for msg in messages:
            strategy = self.compression_strategies.get(msg["role"])
            compressed = await strategy(msg)
            compressed_messages.append(compressed)

        # 保存压缩后的消息
        await self.db.update_messages_compression(session_id, compressed_messages)

        return {
            "original_size": len(messages),
            "compressed_size": len(compressed_messages),
            "compression_ratio": len(compressed_messages) / len(messages)
        }

    def _compress_system_messages(self, msg: Message) -> Message:
        """压缩系统消息"""

        content = msg["content"]

        # 检查是否是 JSON 格式的结构化数据
        try:
            data = json.loads(content)
            if "document" in data:
                return {
                    **msg,
                    "content": f"[文档] {data['document']['topic']}",
                    "compressed": True,
                    "type": "document"
                }
            if "follow_up_questions" in data:
                return {
                    **msg,
                    "content": f"[追问] {len(data['follow_up_questions'])} 个问题",
                    "compressed": True,
                    "type": "follow_up"
                }
        except json.JSONDecodeError:
            pass

        return msg

    def _compress_user_messages(self, msg: Message) -> Message:
        """压缩用户消息"""

        content = msg["content"]

        # 短消息不压缩
        if len(content) < 50:
            return msg

        # 长消息提取摘要
        sentences = content.split('。')
        if len(sentences) > 3:
            summary = '。'.join(sentences[:3]) + '...'
            return {
                **msg,
                "content": summary,
                "compressed": True,
                "original_length": len(content)
            }

        return msg

    def _compress_assistant_messages(self, msg: Message) -> Message:
        """压缩助手消息"""

        content = msg["content"]

        # 检查是否是文档生成消息
        metadata = msg.get("metadata", {})

        if metadata.get("type") == "document_generated":
            doc = metadata.get("document", {})
            return {
                **msg,
                "content": f"[文档] {doc.get('topic', '未知主题')}",
                "compressed": True,
                "type": "document"
            }

        return msg
```

---

## 会话分段策略

### 分段阈值

```
┌─────────────────────────────────────────────────────────────────┐
│                  会话生命周期管理                           │
│                                                              │
│  新会话 (0-100 消息)                                  │
│    └── 正常运行，所有消息保留                            │
│                                                              │
│  成熟会话 (100-500 消息)                                │
│    └── 提示归档，可选自动归档                              │
│                                                              │
│  长会话 (500+ 消息)                                        │
│    └── 强制或建议分段                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 实现方案

```python
# backend/services/session_manager.py

class SessionManager:
    """会话管理器 - 处理长会话的分段"""

    # 与分层存储同步的阈值
    THRESHOLDS = {
        "new": 100,        # 0-100 条
        "mature": 500,      # 100-500 条
        "long": 1000         # 500+ 条
    }

    async def check_session_health(self, session_id: str) -> dict:
        """检查会话健康状态"""

        message_count = await self.db.count_messages(session_id)
        token_estimate = message_count * 50  # 粗略估计

        status = {
            "message_count": message_count,
            "estimated_tokens": token_estimate,
            "health": self._evaluate_health(message_count)
        }

        # 如果会话太长，建议归档
        if message_count > self.THRESHOLDS["long"]:
            status["suggestion"] = "建议归档当前会话，开始新会话"
            status["action_required"] = True

        return status

    def _evaluate_health(self, count: int) -> str:
        """评估会话健康状态"""

        if count < self.THRESHOLDS["new"]:
            return "healthy"
        elif count < self.THRESHOLDS["mature"]:
            return "normal"
        elif count < self.THRESHOLDS["long"]:
            return "archived"
        else:
            return "segment"

    async def create_continuation_session(
        self, parent_session_id: str, title: str
    ) -> str:
        """创建续接会话"""

        parent_session = await self.db.get_session(parent_session_id)

        new_session = await self.db.create_session(
            user_id=parent_session["user_id"],
            title=f"{title} (续)",
            parent_session_id=parent_session_id,
            # 继承上下文
            inherited_context={
                "previous_topics": parent_session.get("topics", []),
                "user_level": parent_session.get("user_level"),
                "learning_goal": parent_session.get("learning_goal")
            }
        )

        return new_session["id"]
```

---

## 综合方案推荐

### KnowZero 最佳实践

```
┌─────────────────────────────────────────────────────────────────┐
│              KnowZero 消息管理策略 (v2)                  │
│                                                              │
│  消息数 < 20                                              │
│    └── 完整加载，FULL_WINDOW 层存储                      │
│                                                              │
│  消息数 20 - 50                                          │
│    └── 正常加载，SUMMARY_WINDOW 层存储                     │
│                                                              │
│  消息数 50 - 100                                         │
│    └── 启用滑动窗口 (最近 FULL_WINDOW + 总结)             │
│                                                              │
│  消息数 > 100                                             │
│    └── 强制启用消息分组和总结                                │
│                                                              │
│  消息数 > 500                                             │
│    └── 提示归档，创建新会话                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 触发时机

| 条件 | 动作 | 存储层 |
|------|------|--------|
| 消息数 ≤ 20 | 完整加载 | FULL_WINDOW |
| 消息数 21-50 | 正常加载 | SUMMARY_WINDOW |
| 消息数 51-100 | 启动滑动窗口 + 总结 | ARCHIVE |
| 消息数 101-500 | 强制消息分组和总结 | ARCHIVE |
| 消息数 > 500 | 提示分段，创建新会话 | 建议分段 |

---

## 总结：长对话消息管理

| 方案 | 解决问题 | 实现复杂度 | 推荐优先级 |
|------|----------|-------------|-------------|
| 分层存储 | Token 限制，Checkpoint 爆炸 | 中 | ⭐⭐⭐ v2 必需 |
| 消息总结 | Token 限制 | 高 | ⭐⭐⭐ v2 必需 |
| 会话分段 | 所有问题 | 低 | ⭐⭐ v1.5 |
| 分页加载 | 性能，用户体验 | 中 | ⭐⭐ v1 必需 |
| 虚拟滚动 | 性能 | 中 | ⚠️ v2 考虑 |
| 消息压缩 | 存储，Token | 低 | ⚠️ v2 考虑 |

### 关键集成点

1. **与 LayeredCheckpointSaver 同步**
   - FULL_WINDOW = 20 (最近 20 条完整保存)
   - SUMMARY_WINDOW = 50 (21-50 条总结保存)
   - ARCHIVE_THRESHOLD = 100 (超过 100 条归档)

2. **消息分组配合分层存储**
   - 当消息数 > SUMMARY_WINDOW 时触发总结
   - 总结组与分层 SUMMARY 层保持一致

3. **分段阈值同步**
   - 超过 ARCHIVE_THRESHOLD 时建议分段
   - 与 Checkpoint 的归档策略保持一致

---

*消息管理设计 v2.0 | KnowZero 项目*
