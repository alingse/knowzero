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
