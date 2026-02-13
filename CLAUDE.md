# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在本项目中工作时提供指导。

## 项目概述

KnowZero 是一个基于 FastAPI 的全栈 AI 学习平台，后端使用 Python 3.11+，前端为 React + TypeScript + Vite。系统通过 LangGraph 实现 AI Agent，支持会话管理、文档生成、实体词索引等功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2 |
| AI Agent | LangGraph + LangChain + OpenAI |
| 数据库 | SQLite (aiosqlite) + Alembic |
| 前端 | React 18 + TypeScript + Vite + TailwindCSS |
| 状态管理 | Zustand + TanStack Query |

## 常用命令

### 后端 (backend/)

```bash
cd backend

# 启动开发服务器
uvicorn app.main:app --reload

# 运行测试
pytest

# 代码格式化
ruff format .

# 代码检查
ruff check . --fix

# 类型检查
mypy app

# 数据库迁移
alembic upgrade head
alembic revision --autogenerate -m "description"
```

### 前端 (frontend/)

```bash
cd frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# TypeScript 类型检查
pnpm type-check
```

## 架构

```
knowzero/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/routes/    # API 路由 (sessions, documents, entities, websocket)
│   │   ├── core/          # 核心模块 (config, database, logging)
│   │   ├── models/        # SQLAlchemy 模型
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/      # 业务逻辑
│   │   ├── agent/         # LangGraph Agent
│   │   │   ├── graph.py  # 主图定义
│   │   │   ├── nodes/    # Agent 节点 (intent, content, chitchat, etc.)
│   │   │   └── state.py  # Agent 状态定义
│   │   └── main.py       # FastAPI 入口
│   └── alembic/           # 数据库迁移
│
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/   # 组件 (Chat, DocumentView, Layout, Sidebar)
│   │   ├── pages/        # 页面 (HomePage, SessionPage)
│   │   ├── stores/       # Zustand 状态管理
│   │   ├── api/          # API 客户端
│   │   └── types/        # TypeScript 类型
│   └── vite.config.ts    # Vite 配置 (API 代理到后端)
│
└── docs/                  # 设计文档
    ├── tech-arch.md      # 技术架构方案
    ├── agent-architecture.md  # Agent 架构设计
    ├── entity-index-system.md  # 实体词索引系统
    └── ...
```

## 环境变量

### 后端 (.env)

```
DATABASE_URL=sqlite+aiosqlite:///./knowzero.db
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini
ENV=development
SECRET_KEY=your-secret-key
```

### 前端 (.env)

```
VITE_API_URL=http://localhost:8000
```

## 设计文档

详细设计思路见 `docs/` 目录:

- `docs/tech-arch.md` - 整体技术架构
- `docs/agent-architecture.md` - Agent 工作流设计
- `docs/entity-index-system.md` - 实体词索引系统
- `docs/persistence-design.md` - 持久化设计
- `docs/langgraph-persistence.md` - LangGraph 状态持久化

## 开发注意事项

1. 后端 API 端口默认 8000，前端 Vite 默认 5173，Vite 代理将 `/api` 请求转发到后端
2. 后端使用 SQLite 数据库，首次运行需执行 `alembic upgrade head` 初始化
3. LangGraph Agent 使用检查点持久化状态，支持会话恢复
4. 前端使用 pnpm 作为包管理器
