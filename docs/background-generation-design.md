# 后台继续生成与断线重连设计文档

## 问题背景

当前系统存在以下问题：
1. **流式生成不可恢复**：LLM 生成过程中用户刷新页面，生成中断且无法恢复
2. **用户体验差**：用户需要重新开始提问，已等待的时间浪费
3. **无断点续传机制**：WebSocket 断开后，生成任务被丢弃

## 设计目标

1. **后台继续生成**：用户断开连接后，后台继续完成文档生成并持久化
2. **无缝重连体验**：用户刷新页面后，能看到正在生成的状态或已生成的结果
3. **资源管理**：避免重复生成，合理管理后台任务

---

## 架构设计

### 整体流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              后台继续生成架构                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  用户发起请求                                                                 │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────┐                                                        │
│  │ WebSocket Handler│ ← 前端连接                                            │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐    WebSocket 断开    ┌─────────────────┐              │
│  │  AgentStream    │ ──────────────────▶  │ BackgroundTask  │              │
│  │  Processor      │    (用户刷新/关闭)    │ Manager         │              │
│  └────────┬────────┘                       └────────┬────────┘              │
│           │                                        │                        │
│           │ 正常完成                                │ 后台继续               │
│           ▼                                        ▼                        │
│  ┌─────────────────┐                       ┌─────────────────┐              │
│  │ 直接返回结果     │                       │ 后台 Worker     │              │
│  │ (实时推送)      │                       │ 完成生成        │              │
│  └─────────────────┘                       └────────┬────────┘              │
│                                                      │                        │
│                                                      ▼                        │
│                                               ┌─────────────────┐            │
│                                               │ 保存到数据库     │            │
│                                               │ 更新 Session    │            │
│                                               └─────────────────┘            │
│                                                                              │
│  用户刷新重连                                                                 │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────┐                                                        │
│  │ 查询任务状态    │ ◀──────────────────────────────┐                      │
│  │  - 正在生成？   │                               │                      │
│  │  - 已完成？     │                               │                      │
│  └────────┬────────┘                               │                      │
│           │                                        │                      │
│     ┌─────┴─────┐                                  │                      │
│     ▼           ▼                                  │                      │
│  正在生成     已完成                                │                      │
│     │           │                                  │                      │
│     ▼           ▼                                  │                      │
│  ┌────────┐  ┌────────┐                           │                      │
│  │显示进度 │  │直接展示│                           │                      │
│  │条+等待 │  │文档内容│                           │                      │
│  └────────┘  └────────┘                           │                      │
│                                                      │                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件设计

### 1. 后台任务管理器 (BackgroundTaskManager)

```python
# app/services/background_task_manager.py

import asyncio
from typing import Any
from dataclasses import dataclass
from enum import Enum
import uuid

from app.core.logging import get_logger

logger = get_logger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class GenerationTask:
    """文档生成任务"""
    task_id: str
    session_id: str
    user_id: int
    state: dict[str, Any]  # AgentState 快照
    status: TaskStatus
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = 0.0
    started_at: float | None = None
    completed_at: float | None = None


class BackgroundTaskManager:
    """管理后台文档生成任务"""
    
    _instance = None
    _tasks: dict[str, GenerationTask] = {}  # task_id -> task
    _session_tasks: dict[str, str] = {}  # session_id -> task_id (最新的)
    _workers: set[asyncio.Task] = set()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def submit_task(
        self,
        session_id: str,
        user_id: int,
        state: dict[str, Any],
    ) -> str:
        """提交后台生成任务"""
        task_id = str(uuid.uuid4())
        
        # 检查是否有正在进行的任务
        existing_task_id = self._session_tasks.get(session_id)
        if existing_task_id and existing_task_id in self._tasks:
            existing = self._tasks[existing_task_id]
            if existing.status in (TaskStatus.PENDING, TaskStatus.RUNNING):
                logger.info(
                    "Cancelling existing task for session",
                    session_id=session_id,
                    old_task=existing_task_id,
                    new_task=task_id,
                )
                await self.cancel_task(existing_task_id)
        
        task = GenerationTask(
            task_id=task_id,
            session_id=session_id,
            user_id=user_id,
            state=state,
            status=TaskStatus.PENDING,
            created_at=asyncio.get_event_loop().time(),
        )
        
        self._tasks[task_id] = task
        self._session_tasks[session_id] = task_id
        
        # 启动后台 worker
        worker = asyncio.create_task(self._run_task(task_id))
        self._workers.add(worker)
        worker.add_done_callback(self._workers.discard)
        
        logger.info(
            "Background task submitted",
            task_id=task_id,
            session_id=session_id,
        )
        
        return task_id
    
    async def _run_task(self, task_id: str) -> None:
        """执行后台任务"""
        import time
        
        task = self._tasks.get(task_id)
        if not task:
            return
        
        task.status = TaskStatus.RUNNING
        task.started_at = time.time()
        
        try:
            # 创建新的 AgentStreamProcessor 实例
            from app.agent.graph import get_graph
            from app.services.persistence_coordinator import (
                persist_document,
                persist_roadmap,
                persist_assistant_message,
            )
            from app.services import session_service
            from app.core.database import get_db_session
            
            graph = get_graph()
            config = {"configurable": {"thread_id": task.session_id}}
            
            # 在非流式模式下执行图
            # 注意：这里需要修改为支持非流式执行
            result = await self._execute_graph_non_streaming(
                graph, task.state, config
            )
            
            # 持久化结果
            async with get_db_session() as db:
                if result.get("document"):
                    doc_id, _ = await persist_document(
                        db,
                        session_id=task.session_id,
                        user_id=task.user_id,
                        doc_data=result["document"],
                        change_summary=result.get("change_summary"),
                        input_source=task.state.get("input_source", "chat"),
                        current_doc_id=task.state.get("current_doc_id"),
                        intent=result.get("intent"),
                        routing=result.get("routing_decision"),
                    )
                    await persist_assistant_message(
                        db,
                        session_id=task.session_id,
                        user_id=task.user_id,
                        content=result.get("change_summary", ""),
                        message_type="document_ref",
                        related_document_id=doc_id,
                        agent_intent=result.get("intent"),
                        agent_routing=result.get("routing_decision"),
                    )
                
                if result.get("roadmap"):
                    await persist_roadmap(
                        db,
                        session_id=task.session_id,
                        user_id=task.user_id,
                        roadmap_data=result["roadmap"],
                    )
                
                await session_service.update_agent_status(
                    db, task.session_id, "idle"
                )
                await db.commit()
            
            task.status = TaskStatus.COMPLETED
            task.result = result
            task.completed_at = time.time()
            
            logger.info(
                "Background task completed",
                task_id=task_id,
                session_id=task.session_id,
            )
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = time.time()
            logger.error(
                "Background task failed",
                task_id=task_id,
                session_id=task.session_id,
                error=str(e),
                exc_info=True,
            )
    
    async def _execute_graph_non_streaming(
        self,
        graph: Any,
        state: dict[str, Any],
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """非流式执行图，返回最终结果"""
        # 这里需要实现非流式的图执行
        # 可以使用 graph.ainvoke() 而不是 astream_events()
        result = await graph.ainvoke(state, config)
        return result
    
    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        task = self._tasks.get(task_id)
        if not task or task.status not in (TaskStatus.PENDING, TaskStatus.RUNNING):
            return False
        
        task.status = TaskStatus.CANCELLED
        logger.info("Task cancelled", task_id=task_id)
        return True
    
    def get_task_by_session(self, session_id: str) -> GenerationTask | None:
        """获取会话的最新任务"""
        task_id = self._session_tasks.get(session_id)
        if task_id:
            return self._tasks.get(task_id)
        return None
    
    def get_task_status(self, task_id: str) -> dict[str, Any] | None:
        """获取任务状态"""
        task = self._tasks.get(task_id)
        if not task:
            return None
        
        return {
            "task_id": task.task_id,
            "status": task.status.value,
            "created_at": task.created_at,
            "started_at": task.started_at,
            "completed_at": task.completed_at,
            "has_result": task.result is not None,
            "error": task.error,
        }


# 全局实例
_task_manager: BackgroundTaskManager | None = None


def get_task_manager() -> BackgroundTaskManager:
    """获取后台任务管理器实例"""
    global _task_manager
    if _task_manager is None:
        _task_manager = BackgroundTaskManager()
    return _task_manager
```

---

### 2. 修改 AgentStreamProcessor

```python
# app/services/agent_streaming_service.py

# ... 现有导入 ...
from app.services.background_task_manager import get_task_manager, TaskStatus

logger = get_logger(__name__)


class AgentStreamProcessor:
    # ... 现有代码 ...
    
    async def process_events(self) -> None:
        """Process streaming events with background fallback."""
        from app.agent.graph import get_graph
        
        graph = get_graph()
        config = {"configurable": {"thread_id": self.session_id}}
        
        try:
            async for event in graph.astream_events(self.state, config, version="v1"):
                event_type = event["event"]
                handler = self._handlers.get(event_type)
                if handler:
                    await handler(event)
                    
        except WebSocketDisconnect as e:
            # 客户端断开，提交后台任务继续生成
            logger.info(
                "Client disconnected during generation, submitting background task",
                session_id=self.session_id,
                code=e.code if hasattr(e, 'code') else 'unknown',
            )
            await self._handle_disconnect()
            raise  # 重新抛出以便上层处理
            
        except Exception as e:
            logger.error("Event processing error", error=str(e), exc_info=True)
            raise
    
    async def _handle_disconnect(self) -> None:
        """处理客户端断开连接"""
        # 提交后台任务继续生成
        task_manager = get_task_manager()
        await task_manager.submit_task(
            session_id=self.session_id,
            user_id=self.user_id,
            state=self.state,
        )
    
    async def finalize(self) -> None:
        """Finalize with background task awareness."""
        # 检查是否有后台任务正在运行
        task_manager = get_task_manager()
        task = task_manager.get_task_by_session(self.session_id)
        
        if task and task.status in (TaskStatus.PENDING, TaskStatus.RUNNING):
            # 后台任务正在运行，通知客户端
            await send_progress(
                self.websocket,
                stage="background_generation",
                message="文档正在后台生成中，生成完成后将自动显示",
            )
            return
        
        if task and task.status == TaskStatus.COMPLETED:
            # 后台任务已完成，直接返回结果
            logger.info(
                "Background task completed, returning cached result",
                session_id=self.session_id,
            )
            await self._handle_background_result(task.result)
            return
        
        # 正常 finalize 流程
        # ... 现有代码 ...
    
    async def _handle_background_result(self, result: dict[str, Any] | None) -> None:
        """处理后台任务完成的结果"""
        if not result:
            return
        
        # 发送路线图
        if result.get("roadmap"):
            await send_roadmap(self.websocket, roadmap=result["roadmap"])
        
        # 发送文档
        if result.get("document"):
            doc = result["document"]
            await send_document_complete(
                self.websocket,
                doc_id=doc.get("id", 0),
                topic=doc.get("topic", ""),
                content=doc.get("content", ""),
                category_path=doc.get("category_path"),
                entities=doc.get("entities", []),
            )
        
        # 发送实体和追问
        if result.get("follow_up_questions"):
            await send_follow_ups(
                self.websocket,
                document_id=result["document"].get("id", 0),
                questions=result["follow_up_questions"],
            )
        
        await send_done(self.websocket)
```

---

### 3. WebSocket Handler 断线重连支持

```python
# app/api/routes/websocket.py

# 新增端点：查询生成状态
@router.get("/{session_id}/generation-status")
async def get_generation_status(session_id: str) -> dict[str, Any]:
    """查询会话的生成状态（用于页面刷新后重连）"""
    from app.services.background_task_manager import get_task_manager, TaskStatus
    from app.services import document_service
    from app.core.database import get_db_session
    
    task_manager = get_task_manager()
    task = task_manager.get_task_by_session(session_id)
    
    # 如果有正在运行或已完成的后台任务
    if task:
        status = {
            "has_background_task": True,
            "task_status": task.status.value,
            "task_id": task.task_id,
        }
        
        if task.status == TaskStatus.COMPLETED and task.result:
            # 任务已完成，返回结果摘要
            result = task.result
            status["result"] = {
                "has_document": result.get("document") is not None,
                "has_roadmap": result.get("roadmap") is not None,
                "document_topic": result.get("document", {}).get("topic"),
                "document_id": result.get("document", {}).get("id"),
            }
        
        return status
    
    # 检查数据库中是否有最近生成的文档
    async with get_db_session() as db:
        docs = await document_service.list_session_documents(db, session_id, limit=1)
        if docs:
            latest_doc = docs[0]
            return {
                "has_background_task": False,
                "latest_document": {
                    "id": latest_doc.id,
                    "topic": latest_doc.topic,
                    "created_at": latest_doc.created_at.isoformat(),
                },
            }
    
    return {"has_background_task": False, "latest_document": None}


# 修改 WebSocket 连接初始化
@router.websocket("/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await manager.connect(websocket, session_id)
    
    try:
        # 连接建立时，检查是否有正在进行的生成任务
        from app.services.background_task_manager import get_task_manager, TaskStatus
        
        task_manager = get_task_manager()
        task = task_manager.get_task_by_session(session_id)
        
        if task and task.status == TaskStatus.RUNNING:
            # 通知用户有后台任务正在进行
            await websocket.send_json({
                "type": "background_status",
                "status": "running",
                "message": "文档正在后台生成中，请稍候...",
            })
        elif task and task.status == TaskStatus.COMPLETED:
            # 后台任务已完成，推送结果
            await websocket.send_json({
                "type": "background_status", 
                "status": "completed",
                "message": "后台生成已完成",
            })
            # 可以选择在这里自动推送完整结果
        
        while True:
            data = await websocket.receive_text()
            # ... 现有处理逻辑 ...
            
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), session_id=session_id)
        manager.disconnect(session_id)
```

---

## 前端断线重连设计

### 1. 页面加载时检查状态

```typescript
// src/hooks/useSessionReconnect.ts

import { useEffect, useState } from 'react';
import { api } from '@/api/client';

interface GenerationStatus {
  has_background_task: boolean;
  task_status?: 'pending' | 'running' | 'completed' | 'failed';
  task_id?: string;
  result?: {
    has_document: boolean;
    has_roadmap: boolean;
    document_topic?: string;
    document_id?: number;
  };
  latest_document?: {
    id: number;
    topic: string;
    created_at: string;
  };
}

export function useSessionReconnect(sessionId: string) {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await api.get(`/ws/${sessionId}/generation-status`);
        setStatus(response.data);
      } catch (error) {
        console.error('Failed to check generation status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, [sessionId]);

  return { status, isLoading };
}
```

### 2. 组件中使用

```typescript
// SessionPage.tsx

function SessionPage() {
  const { sessionId } = useParams();
  const { status, isLoading } = useSessionReconnect(sessionId);
  const [showBackgroundNotice, setShowBackgroundNotice] = useState(false);

  useEffect(() => {
    if (!isLoading && status) {
      if (status.has_background_task && status.task_status === 'running') {
        // 显示后台生成提示
        setShowBackgroundNotice(true);
        
        // 轮询检查状态
        const interval = setInterval(async () => {
          const response = await api.get(`/ws/${sessionId}/generation-status`);
          if (response.data.task_status === 'completed') {
            // 后台生成完成，刷新文档列表
            await refreshDocuments();
            setShowBackgroundNotice(false);
            clearInterval(interval);
          }
        }, 3000);

        return () => clearInterval(interval);
      }
      
      if (status.has_background_task && status.task_status === 'completed') {
        // 后台任务已完成，刷新以获取最新文档
        refreshDocuments();
      }
    }
  }, [status, isLoading, sessionId]);

  return (
    <div>
      {showBackgroundNotice && (
        <BackgroundGenerationNotice 
          message="文档正在后台生成中，完成后将自动显示..." 
        />
      )}
      {/* 其他组件 */}
    </div>
  );
}
```

### 3. WebSocket 重连逻辑

```typescript
// src/hooks/useWebSocket.ts

import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(sessionId: string) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    ws.current = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttempts.current = 0;
    };
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'background_status') {
        // 处理后台任务状态
        handleBackgroundStatus(data);
      }
      // ... 其他消息处理
    };
    
    ws.current.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      
      // 非正常关闭（不是用户主动离开）
      if (event.code !== 1000 && event.code !== 1001) {
        attemptReconnect();
      }
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [sessionId]);

  const attemptReconnect = () => {
    if (reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current++;
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
      
      setTimeout(() => {
        connect();
      }, delay);
    }
  };

  useEffect(() => {
    connect();
    
    // 页面可见性变化时重新连接
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 
          (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
        reconnectAttempts.current = 0;
        connect();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      ws.current?.close(1000, 'Component unmounting');
    };
  }, [connect]);

  return { ws: ws.current };
}
```

---

## 数据模型更新

### 文档表添加 parent_id 索引

```python
# alembic 迁移脚本
"""
添加后台任务追踪字段
"""

from alembic import op
import sqlalchemy as sa


def upgrade():
    # 文档表已有 parent_document_id，添加索引优化查询
    op.create_index(
        'ix_documents_parent_document_id',
        'documents',
        ['parent_document_id']
    )
    
    # 可选：添加任务追踪表（如果需要持久化任务状态）
    op.create_table(
        'generation_tasks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), nullable=False, index=True),
        sa.Column('user_id', sa.Integer, nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime, nullable=True),
        sa.Column('result_document_id', sa.Integer, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
    )


def downgrade():
    op.drop_index('ix_documents_parent_document_id', table_name='documents')
    op.drop_table('generation_tasks')
```

---

## 关键决策点

### 1. 何时触发后台生成？

| 场景 | 处理方式 | 原因 |
|------|---------|------|
| 用户刷新页面 | 后台继续 | 1001 关闭码 |
| 用户关闭标签页 | 后台继续 | 1001 关闭码 |
| 网络断开 | 后台继续 + 重连机制 | 需要重连恢复 |
| 用户主动取消 | 取消任务 | 需要发送取消信号 |
| 用户发送新消息 | 取消旧任务，开始新任务 | 避免资源浪费 |

### 2. 内存 vs 数据库任务存储

**当前方案：内存存储（BackgroundTaskManager）**
- 优点：简单、快速、无需数据库操作
- 缺点：服务重启任务丢失、无法水平扩展

**备选方案：数据库存储**
- 优点：持久化、可扩展、支持分布式
- 缺点：增加复杂度、需要轮询或通知机制

**建议**：先使用内存方案，需要扩展时再迁移到数据库。

### 3. 并发控制

```python
# 每个会话同一时间只能有一个生成任务
async def submit_task(self, session_id: str, ...):
    # 取消同会话的现有任务
    existing = self._session_tasks.get(session_id)
    if existing:
        await self.cancel_task(existing)
    
    # 提交新任务
    ...
```

---

## 实施建议

### Phase 1: 基础后台生成（优先级：高）
1. 实现 `BackgroundTaskManager`
2. 修改 `AgentStreamProcessor` 捕获断开异常
3. 非流式执行图的实现

### Phase 2: 断线重连（优先级：高）
1. 添加 `/generation-status` 端点
2. 前端页面加载时检查状态
3. 轮询机制获取完成通知

### Phase 3: 优化体验（优先级：中）
1. WebSocket 自动重连
2. 页面可见性变化时的处理
3. 后台任务结果缓存优化

### Phase 4: 生产优化（优先级：低）
1. 任务持久化到数据库
2. 分布式任务队列（Celery/RQ）
3. 任务监控和告警

---

## 风险与注意事项

1. **资源泄漏**：需要确保后台任务不会无限堆积
2. **重复生成**：用户快速刷新可能导致重复任务，需要任务去重
3. **内存占用**：大量并发后台任务可能占用过多内存
4. **数据库连接**：后台任务需要独立的数据库连接管理
