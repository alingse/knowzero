# 文档完成卡片设计

## 概述

本文档记录了文档生成完成通知的优化设计，包括实时用户体验、持久化存储和刷新后恢复的完整实现。

## 设计目标

1. **实时体验**: 用户输入后看到"正在处理..."系统消息
2. **完成通知**: 文档生成完成后显示精美的卡片，包含标题、摘要、耗时、阶段数
3. **持久化**: 刷新页面后，卡片和元数据依然存在
4. **交互**: 点击卡片可直接跳转到文档详情

## 用户体验

### 实时处理流程

```
用户输入 "LLM Agent"
    ↓
系统消息: "正在处理: LLM Agent..." [持久化]
    ↓
进度指示器显示各个节点执行状态
    ↓
文档生成完成
    ↓
文档卡片: "📚 已生成学习文档" [持久化]
  - 标题: LLM Agent 入门指南
  - 摘要: 前150字预览
  - 耗时: 28秒
  - 阶段: 4个阶段完成
```

### 刷新后体验

```
┌─────────────────────────────────────────┐
│ 用户: LLM Agent                          │
│ 系统: 正在处理: LLM Agent...             │
│ 🤖                                       │
│ ┌─────────────────────────────────────┐ │
│ │ 📚 已生成学习文档                   │ │
│ │ ┌─────────────────────────────┐    │ │
│ │ │ LLM Agent 入门指南           │    │ │
│ │ │ • 什么是 LLM Agent         │    │ │
│ │ │ • ReAct 架构详解           │    │ │ ← 点击跳转
│ │ │ [点击阅读完整文档 →]         │    │ │
│ │ └─────────────────────────────┘    │ │
│ │ ⏱️ 生成耗时 28秒 · 4个阶段完成      │ │
│ └─────────────────────────────────────┘ │
│ [底部有输入框，可直接继续对话]            │
└─────────────────────────────────────────┘
```

## 技术实现

### 后端改动

#### 1. WebSocket 消息发送 (`websocket_message_sender.py`)

```python
async def send_system_message(
    websocket: WebSocket,
    *,
    content: str,
    message_type: str = "system_message",
) -> None:
    """发送系统消息（会持久化到消息表）"""
    await _send_event(
        websocket,
        "system_message",
        {
            "content": content,
            "message_type": message_type,
        }
    )

async def send_document_card(
    websocket: WebSocket,
    *,
    document_id: int,
    title: str,
    excerpt: str | None = None,
    processing_time_seconds: float | None = None,
    stages_completed: list[str] | None = None,
) -> None:
    """发送文档完成卡片（会持久化到消息表）"""
    await _send_event(
        websocket,
        "document_card",
        {
            "document_id": document_id,
            "title": title,
            "excerpt": excerpt,
            "processing_time_seconds": processing_time_seconds,
            "stages_completed": stages_completed or [],
        }
    )
```

#### 2. Agent 流式服务 (`agent_streaming_service.py`)

```python
class AgentStreamingService:
    def __init__(self, ...):
        # ...
        self.start_time: float | None = None  # 记录开始时间

    async def initialize(self, user_input: str) -> None:
        """初始化会话"""
        # 记录开始时间
        self.start_time = time.time()

        # 发送"处理开始"系统消息
        await send_system_message(
            self.websocket,
            content=f"正在处理: {user_input}...",
            message_type="system_notification",
        )

    async def _on_content_agent_end(self, output: dict[str, Any]) -> None:
        """文档生成完成时发送卡片消息"""
        # 计算生成耗时
        duration = time.time() - (self.start_time or time.time())

        # 获取文档摘要（前150字）
        content = doc_data.get("content", "")
        excerpt = content[:150] + "..." if len(content) > 150 else content

        # 准备元数据
        card_metadata = {
            "document_id": doc_id,
            "document_title": doc_data.get("topic", "新文档"),
            "document_excerpt": excerpt,
            "processing_time_seconds": duration,
            "stages_completed": ["intent", "route", "roadmap", "content"],
        }

        # 更新占位消息为文档卡片，并持久化元数据
        await update_placeholder_message(
            db=self.db,
            session_id=self.thread_id,
            role="assistant",
            content=f"📚 已生成学习文档: {doc_data.get('topic', '新文档')}",
            related_document_id=doc_id,
            message_type=MessageType.DOCUMENT_CARD,
            extra_data=card_metadata,
        )
```

#### 3. 持久化协调器 (`persistence_coordinator.py`)

```python
async def update_placeholder_message(
    db: AsyncSession,
    *,
    session_id: str,
    role: str,
    content: str,
    related_document_id: int | None = None,
    message_type: str = "assistant",
    extra_data: dict[str, Any] | None = None,
) -> Message:
    """更新占位消息的内容和类型"""
    # 查找占位消息
    placeholder = await get_placeholder_message(db, session_id=session_id)

    # 更新字段
    placeholder.content = content
    placeholder.role = role
    placeholder.message_type = message_type
    placeholder.related_document_id = related_document_id
    placeholder.extra_data = extra_data or {}

    await db.flush()
    return placeholder
```

#### 4. 消息服务 (`message_service.py`)

```python
async def update_message_extra_data(
    db: AsyncSession,
    message_id: int,
    extra_data: dict[str, Any],
) -> Message | None:
    """更新消息的 extra_data 字段"""
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalar_one_or_none()
    if message:
        message.extra_data = extra_data
        await db.flush()
    return message
```

#### 5. 数据库模型 (`models/session.py`)

```python
class Message(Base):
    # ...
    extra_data: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="额外的元数据（如文档卡片的耗时、阶段数等）",
    )
```

#### 6. Schema 定义 (`schemas/session.py`)

```python
class MessageBase(BaseModel):
    # ...
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        alias="extra_data",
        description="额外的元数据（如文档卡片的耗时、阶段数等）",
    )

    class Config:
        populate_by_name = True  # 允许使用 alias
```

### 前端改动

#### 1. 文档卡片组件 (`DocumentCardMessage.tsx`)

```tsx
interface DocumentCardMessageProps {
  documentId: number;
  title: string;
  excerpt?: string;           // 文档前100字摘要
  processingTimeSeconds?: number;
  stagesCompleted?: string[];
  timestamp: string;
  onDocumentClick?: (docId: number) => void;
}

export function DocumentCardMessage({
  documentId,
  title,
  excerpt,
  processingTimeSeconds,
  stagesCompleted,
  onDocumentClick,
}: DocumentCardMessageProps) {
  // 整个卡片可点击
  const handleClick = () => {
    if (onDocumentClick) {
      onDocumentClick(documentId);
    }
  };

  return (
    <div className="..." onClick={handleClick}>
      {/* 标题栏 */}
      <div>📚 已生成学习文档</div>

      {/* 文档预览卡片 */}
      <div className="cursor-pointer hover:shadow-sm">
        <h4>{title}</h4>
        {excerpt && <p>{excerpt}</p>}
      </div>

      {/* 元信息栏 */}
      <div>
        {processingTimeSeconds && <span>⏱️ {formatDuration(processingTimeSeconds)}</span>}
        {stagesCompleted && <span>📊 {stagesCompleted.length}个阶段完成</span>}
      </div>
    </div>
  );
}
```

#### 2. 消息列表 (`MessagesList.tsx`)

```tsx
// 处理带元数据的 DOCUMENT_CARD 消息
if (message.message_type === MessageType.DOCUMENT_CARD) {
  const metadata = message.metadata as {
    document_id: number;
    document_title: string;
    document_excerpt?: string;
    processing_time_seconds?: number;
    stages_completed?: string[];
  } | undefined;

  if (metadata?.document_id) {
    return (
      <DocumentCardMessage
        documentId={metadata.document_id}
        title={metadata.document_title}
        excerpt={metadata.document_excerpt}
        processingTimeSeconds={metadata.processing_time_seconds}
        stagesCompleted={metadata.stages_completed}
        timestamp={message.timestamp}
        onDocumentClick={onDocumentClick}
      />
    );
  }
}
```

#### 3. WebSocket 处理 (`useWebSocketHandler.ts`)

```tsx
case "system_message": {
  const { content, message_type: msgType } = response.data as {
    content: string;
    message_type?: string;
  };

  updatePlaceholder(placeholderIdRef.current, content, msgType);
  break;
}

case "document_card": {
  const cardData = response.data as {
    document_id: number;
    title: string;
    excerpt?: string;
    processing_time_seconds?: number;
    stages_completed?: string[];
  };

  // 移除占位消息
  if (placeholderIdRef.current) {
    sessionStore.removeMessage(placeholderIdRef.current);
  }

  // 添加卡片消息（带元数据）
  sessionStore.addMessage({
    id: Date.now(),
    role: "assistant",
    content: `📚 已生成学习文档: ${cardData.title}`,
    message_type: MessageType.DOCUMENT_CARD,
    timestamp: new Date().toISOString(),
    metadata: {
      document_id: cardData.document_id,
      document_title: cardData.title,
      document_excerpt: cardData.excerpt,
      processing_time_seconds: cardData.processing_time_seconds,
      stages_completed: cardData.stages_completed,
    },
  });
  break;
}
```

#### 4. 会话页面 (`SessionPage.tsx`)

```tsx
const handleDocumentCardClick = useCallback((documentId: number) => {
  // 设置当前文档
  setCurrentDocumentId(documentId);

  // 可选：滚动到文档视图区域
  if (isMobile) {
    documentViewRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}, [setCurrentDocumentId, isMobile]);

// 传递给 AIAssistant
<AIAssistant
  onDocumentCardClick={handleDocumentCardClick}
  // ... other props
/>
```

## 数据库迁移

### 迁移文件

```python
"""add extra_data to messages

Revision ID: 5958bbf9a0f5
Revises: (previous)
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column(
        "messages",
        sa.Column(
            "extra_data",
            sa.JSON(),
            nullable=False,
            server_default="{}",
            comment="额外的元数据（如文档卡片的耗时、阶段数等）",
        ),
    )

def downgrade():
    op.drop_column("messages", "extra_data")
```

## 关键设计决策

### 1. 为什么使用 `extra_data` 而不是 `metadata`？

`metadata` 是 SQLAlchemy 的保留字，用于表的元数据信息。为避免冲突，使用 `extra_data` 作为字段名，但在 Pydantic Schema 中使用 `Field(alias="extra_data")` 将其映射为前端友好的 `metadata` 名称。

### 2. 消息类型区分

- **system_message**: 系统通知（如"正在处理..."）
- **document_card**: 文档完成卡片（带元数据）
- **assistant**: 普通 AI 回复
- **DOCUMENT_REF**: 文档引用（已存在，用于内联文档卡片）

### 3. 占位消息处理

- 开始时创建占位消息（id 为负数时间戳）
- 处理过程中更新占位消息内容（节点状态）
- 完成时：要么删除占位消息添加新消息，要么更新占位消息为最终状态

### 4. 刷新后恢复

- 所有持久化消息从数据库加载
- `extra_data` 字段包含卡片所需的所有元数据
- 前端通过 `metadata` 属性（Schema 的 alias）访问元数据

## 验证测试

### 1. 实时体验测试

```
输入: "LLM Agent"
预期:
1. 看到 "正在处理: LLM Agent..." 系统消息
2. 进度指示器显示各个节点执行状态
3. 完成后显示文档卡片，包含标题、摘要、耗时、阶段数
```

### 2. 刷新恢复测试

```
刷新页面
预期:
1. 所有消息（包括系统消息和文档卡片）依然存在
2. 文档卡片显示完整的元数据（耗时、阶段数）
3. 点击卡片能正确跳转到文档详情
```

### 3. 元数据持久化测试

```sql
SELECT id, content, message_type, extra_data
FROM messages
WHERE message_type = 'document_card';

-- 预期结果:
-- extra_data 列包含:
-- {
--   "document_id": 123,
--   "document_title": "LLM Agent 入门指南",
--   "document_excerpt": "...",
--   "processing_time_seconds": 28,
--   "stages_completed": ["intent", "route", "roadmap", "content"]
-- }
```

## 文件清单

### 后端文件

| 文件 | 改动 |
|------|------|
| `backend/app/services/websocket_message_sender.py` | 新增 `send_system_message()` 和 `send_document_card()` |
| `backend/app/services/agent_streaming_service.py` | 添加 `start_time`，修改 `initialize()` 和 `_on_content_agent_end()` |
| `backend/app/services/persistence_coordinator.py` | 修改 `update_placeholder_message()` 支持 `extra_data` |
| `backend/app/services/message_service.py` | 新增 `update_message_extra_data()` |
| `backend/app/models/session.py` | 添加 `extra_data` 字段 |
| `backend/app/schemas/session.py` | 添加 `metadata` 字段（alias of `extra_data`） |
| `backend/alembic/versions/5958bbf9a0f5_add_extra_data_to_messages.py` | 数据库迁移文件 |

### 前端文件

| 文件 | 改动 |
|------|------|
| `frontend/src/components/Chat/DocumentCardMessage.tsx` | 新建组件 |
| `frontend/src/components/Chat/MessagesList.tsx` | 添加 `DOCUMENT_CARD` 处理逻辑 |
| `frontend/src/components/AIAssistant/ChatPanel.tsx` | 添加 `onDocumentClick` prop |
| `frontend/src/components/AIAssistant/AIAssistant.tsx` | 透传 `onDocumentClick` prop |
| `frontend/src/pages/SessionPage.tsx` | 添加 `handleDocumentCardClick` 函数 |
| `frontend/src/hooks/useWebSocketHandler.ts` | 处理 `system_message` 和 `document_card` 事件 |
| `frontend/src/types/index.ts` | 添加 `metadata` 到 Message 接口，添加新事件类型 |

## 后续优化建议

1. **更多元数据**: 考虑添加生成的 token 数、使用的模型名称等
2. **错误处理**: 如果生成失败，显示错误卡片
3. **重试机制**: 卡片上添加"重新生成"按钮
4. **分享功能**: 卡片上添加"分享文档"链接
5. **统计信息**: 在用户档案中累计生成耗时、文档数量等
