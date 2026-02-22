# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

KnowZero 是一个基于 FastAPI 的全栈 AI 学习平台，后端使用 Python 3.11+，前端为 React + TypeScript + Vite。

## 常用命令

```bash
# 启动开发服务器 (backend 目录)
uvicorn app.main:app --reload

# 运行测试
pytest

# 代码格式化
uv run ruff format .

# 代码检查
uv run ruff check .
uv run ruff check . --fix --unsafe-fixes  # 自动修复问题

# 类型检查
mypy app

# 数据库迁移
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## 代码质量规范

**提交代码前必须执行**：
1. `uv run ruff format .` - 格式化代码
2. `uv run ruff check .` - 检查代码质量
3. `uv run ruff check . --fix --unsafe-fixes` - 自动修复可修复的问题

确保所有检查通过后再提交。

## 技术栈

- **后端**: FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2
- **AI Agent**: LangGraph + LangChain + OpenAI
- **数据库**: SQLite (aiosqlite) + Alembic
- **前端**: React + TypeScript + Vite

## 架构

```
app/
├── api/routes/      # API 路由 (sessions, documents, entities, websocket)
├── core/            # 核心模块 (config, database, logging)
├── models/          # SQLAlchemy 模型
├── schemas/         # Pydantic schemas
├── services/        # 业务逻辑
├── agent/           # LangGraph Agent
│   ├── graph.py    # 主图定义
│   ├── nodes/      # Agent 节点 (intent, content, chitchat, etc.)
│   └── state.py    # Agent 状态定义
└── main.py         # FastAPI 入口
```

## 环境变量

主要配置在 `.env` 中:
- `DATABASE_URL`: 数据库连接 (默认 `sqlite+aiosqlite:///./knowzero.db`)
- `OPENAI_API_KEY`: OpenAI API 密钥
- `OPENAI_MODEL`: 模型名称 (默认 `gpt-4o-mini`)
- `ENV`: 环境 (development/production)

## 认证系统设计决策

**状态**: 暂不需要认证系统
**决策日期**: 2025-02-21

### 关键决策

1. **无认证模式**: 项目当前不需要实现认证系统
2. **user_id 默认值**: 所有 user_id 默认为 1，保持兼容性
3. **auth.py 设计**: `app/core/auth.py` 中的 `DEFAULT_USER_ID = 1` 是设计如此，**不是待修复的 bug**

### 实现细节

- `get_auth_user()` 和 `get_auth_user_from_ws()` 固定返回 1 是**预期行为**
- `roadmap_service.py` 中的 `user_id or 1` 回退逻辑是**有意保留的兜底保护**
- entities 端点缺少 user_id 的问题可以**忽略**

### 代码审查忽略项

以下代码审查发现的问题应被**忽略**（这是设计如此）：
- entities 端点缺少 `user_id: CurrentUser` 依赖 → **忽略**
- auth.py 固定返回 1 → **忽略**
- roadmap_service.py 的 `or 1` 逻辑 → **忽略**

### 未来计划

如需实现真实认证，需要修改：
1. `app/core/auth.py` - 实现 JWT/Session 验证
2. 所有使用 `CurrentUser` 的端点 - 无需修改（依赖注入设计已就绪）
3. 数据库模型 - 已有 `user_id` 外键，无需修改

---
# 后端开发规范

## 项目结构

```
app/
├── api/
│   ├── deps.py          # 依赖注入 (get_db 等)
│   └── routes/          # API 路由，按资源命名
├── core/                # 核心配置
├── models/              # SQLAlchemy 模型
├── schemas/             # Pydantic schemas
├── services/            # 业务逻辑层
├── agent/               # LangGraph Agent
└── main.py              # FastAPI 入口
```

## 1. 数据库模型 (SQLAlchemy 2.0 async)

**文件位置**: `app/models/*.py`

```python
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Document(Base):
    """Document model."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    topic: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    entities: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relations
    follow_up_questions = relationship(
        "FollowUpQuestion", back_populates="document", cascade="all, delete-orphan"
    )
```

**约定**:
- 使用 `Mapped[type]` + `mapped_column()` 声明式风格
- JSON 字段: `mapped_column(JSON, default=list/dict)`
- 时间戳: `DateTime, default=datetime.utcnow`
- 外键: `ForeignKey("table.id")` (表名.字段名)
- 关系: `relationship(..., cascade="all, delete-orphan")`

## 2. Pydantic Schemas

**文件位置**: `app/schemas/*.py`

```python
from pydantic import BaseModel

class DocumentCreate(BaseModel):
    """Create document request."""
    topic: str
    content: str
    category_path: str | None = None

class DocumentUpdate(BaseModel):
    """Update document request."""
    content: str | None = None
    category_path: str | None = None

class DocumentResponse(BaseModel):
    """Document response."""
    id: int
    topic: str
    content: str
    entities: list

    class Config:
        from_attributes = True  # 支持从 SQLAlchemy 模型转换
```

**约定**:
- 请求 schema: `{Resource}Create`, `{Resource}Update`
- 响应 schema: `{Resource}Response`
- 嵌套关系用 list 类型
- 设置 `from_attributes = True` 以支持 ORM 模型

## 3. API 路由

**文件位置**: `app/api/routes/*.py`

```python
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas import DocumentCreate, DocumentResponse

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Document:
    """Create a new document."""
    document = Document(topic=data.topic, content=data.content)
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Document:
    """Get document by ID."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return document
```

**约定**:
- 路由前缀与资源名一致
- 使用 `Annotated[AsyncSession, Depends(get_db)]` 注入数据库
- 统一用 `HTTPException` 处理错误
- `response_model` 用 Pydantic schema
- Query 用 `select().where()`
- **路由顺序**: 固定路径（如 `/random`、`/search`）必须定义在路径参数路由（如 `/{document_id}`）**之前**，否则 FastAPI 会将固定路径的字符串当作路径参数解析，导致 422 验证错误

## 4. Service 层

**文件位置**: `app/services/*.py`

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import get_logger

logger = get_logger(__name__)

async def create_document(
    db: AsyncSession,
    *,
    session_id: str,
    topic: str,
    content: str,
) -> Document:
    """Create a new document."""
    doc = Document(
        session_id=session_id,
        topic=topic,
        content=content,
    )
    db.add(doc)
    await db.flush()  # flush 获取 ID，但不提交事务
    logger.info("Document created", doc_id=doc.id, topic=topic)
    return doc

async def get_document(db: AsyncSession, document_id: int) -> Document | None:
    """Get a document by ID."""
    return await db.get(Document, document_id)
```

**约定**:
- Service 函数接收 `db: AsyncSession` 作为第一个参数
- 使用关键字参数 `*,` 强制调用方使用具名参数
- 使用 `flush()` 获取 ID 而不提交事务
- 使用 `logger` 记录关键操作

---
# 前端开发规范

## 项目结构

```
frontend/src/
├── api/                 # API 客户端
├── components/          # React 组件
├── pages/               # 页面组件
├── stores/              # Zustand 状态管理
├── types/               # TypeScript 类型定义
├── lib/                 # 工具库
└── utils/               # 工具函数
```

## 1. 类型定义

**文件位置**: `frontend/src/types/index.ts`

```typescript
// 使用 const object 定义枚举，便于类型推断
export const MessageType = {
  CHAT: "chat",
  DOCUMENT_CARD: "document_card",
  FOLLOW_UP: "follow_up",
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

// 接口定义
export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: MessageTypeValue;
  timestamp: string;
}

export interface Document {
  id: number;
  topic: string;
  content: string;
  entities: string[];
  created_at: string;
}
```

**约定**:
- 枚举用 `const object + as const` 定义
- 时间戳用 `string` (ISO 8601)
- 可选字段用 `propertyName?: type`

## 2. API 客户端

**文件位置**: `frontend/src/api/client.ts`

```typescript
export const sessionsApi = {
  create: async (data: { title: string; description?: string }) => {
    const res = await fetch(`${API_URL}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create session");
    return res.json();
  },

  restore: async (sessionId: string) => {
    const res = await fetch(`${API_URL}/sessions/${sessionId}/restore`);
    if (!res.ok) throw new Error("Failed to restore session");
    return res.json();
  },
};
```

**约定**:
- API 函数返回 Promise
- 错误用 `throw new Error()` 处理
- 响应数据用 `res.json()` 解析

## 3. 状态管理 (Zustand)

**文件位置**: `frontend/src/stores/*.ts`

```typescript
import { create } from "zustand";

interface SessionState {
  // State
  currentDocument: Document | null;
  messages: Message[];
  isLoading: boolean;

  // Actions
  setCurrentDocument: (document: Document | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  currentDocument: null,
  messages: [],
  isLoading: false,

  // Actions
  setCurrentDocument: (document) => set({ currentDocument: document }),

  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function'
        ? messages(state.messages)
        : messages
    })),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  clearSession: () =>
    set({ currentDocument: null, messages: [], isLoading: false }),
}));
```

**约定**:
- State 和 Actions 分开声明
- 支持函数式更新: `(prev) => newValue`
- 数组操作用展开运算符保持不可变性
- 使用 `get()` 访问当前状态

## 4. React 组件

**文件位置**: `frontend/src/pages/*.tsx`, `frontend/src/components/*.tsx`

```typescript
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { sessionsApi } from "@/api/client";

export function HomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");

  const createSession = useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: (session) => {
      navigate(`/session/${session.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSession.mutate({ title: topic.trim() });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={topic} onChange={(e) => setTopic(e.target.value)} />
      <button disabled={createSession.isPending}>创建</button>
    </form>
  );
}
```

**约定**:
- 用 `useMutation` 处理写操作
- 用 `useQuery` 处理读操作
- 路由跳转用 `useNavigate()`
- 表单提交用 `onSubmit` + `e.preventDefault()`

## 5. WebSocket 集成

```typescript
import { useEffect, useRef } from "react";

export function useWebSocket({ sessionId, onMessage }: {
  sessionId: string;
  onMessage: (data: StreamResponse) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as StreamResponse;
      onMessage(data);
    };

    return () => ws.close();
  }, [sessionId, onMessage]);

  const sendMessage = (data: ChatRequest) => {
    wsRef.current?.send(JSON.stringify(data));
  };

  return { sendMessage, isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
```

**约定**:
- 用 `useRef` 存储 WebSocket 实例
- `useEffect` 返回清理函数关闭连接
- 消息用 `JSON.parse()` / `JSON.stringify()` 处理
