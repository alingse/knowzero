# KnowZero 技术架构方案

> 项目技术栈选型与架构设计

---

## 1. 整体架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KnowZero 架构分层                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Frontend      │  │    Backend      │  │   AI Engine     │              │
│  │  (React + TS)   │←→│  (FastAPI)      │←→│ (LangGraph)     │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│         ↑                    ↑                    ↑                        │
│         └────────────────────┴────────────────────┘                        │
│                         SQLite (持久化)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈选型

### 2.1 前端 (Frontend)

| 组件 | 技术 | 理由 |
|------|------|------|
| 框架 | **React 18** + TypeScript | 生态成熟，类型安全 |
| 构建 | **Vite** | 快速冷启动，HMR |
| 状态 | **Zustand** | 轻量，适合中小型项目 |
| 样式 | **TailwindCSS** | 快速开发，一致性 |
| 组件库 | **Radix UI** | 无样式，可访问性好 |
| 路由 | **React Router v6** | 标准方案 |
| 请求 | **TanStack Query** | 缓存、乐观更新 |

### 2.2 后端 (Backend)

| 组件 | 技术 | 理由 |
|------|------|------|
| 框架 | **FastAPI** | 高性能，自动生成文档 |
| ORM | **SQLAlchemy 2.0** | 成熟，支持异步 |
| 数据库 | **SQLite** | 文档要求，零配置 |
| 迁移 | **Alembic** | SQLAlchemy 标准 |
| WebSocket | **FastAPI WebSocket** | 流式输出支持 |
| 任务队列 | **Celery** (可选) | 后台任务 |

### 2.3 AI 引擎

| 组件 | 技术 | 理由 |
|------|------|------|
| Agent 框架 | **LangGraph** | 文档要求，状态管理 |
| LLM 抽象 | **LangChain** | 多模型支持 |
| 向量存储 | **ChromaDB** (可选) | 文档要求，轻量 |

---

## 3. 项目结构

```
knowzero/
├── frontend/                       # React 前端
│   ├── src/
│   │   ├── components/            # 组件
│   │   │   ├── DocumentView/     # 文档展示
│   │   │   ├── Chat/             # 聊天组件
│   │   │   ├── Sidebar/          # 目录树
│   │   │   └── Entity/           # 实体词高亮
│   │   ├── pages/                # 页面
│   │   ├── stores/               # Zustand 状态
│   │   ├── api/                  # API 客户端
│   │   ├── types/                # TypeScript 类型
│   │   └── utils/                # 工具函数
│   ├── public/
│   └── package.json
│
├── backend/                        # FastAPI 后端
│   ├── app/
│   │   ├── api/                  # API 路由
│   │   │   ├── routes/
│   │   │   │   ├── chat.py      # 聊天接口
│   │   │   │   ├── documents.py # 文档接口
│   │   │   │   ├── entities.py  # 实体词接口
│   │   │   │   └── sessions.py  # 会话接口
│   │   │   └── deps.py          # 依赖注入
│   │   ├── agent/               # LangGraph Agent
│   │   │   ├── graph.py         # 主图定义
│   │   │   ├── nodes/           # Agent 节点
│   │   │   │   ├── intent.py   # Intent Agent
│   │   │   │   ├── route.py    # Route Agent
│   │   │   │   ├── content.py  # Content Agent
│   │   │   │   └── navigator.py# Navigator Agent
│   │   │   ├── state.py         # AgentState
│   │   │   ├── classifier.py    # 意图分类器
│   │   │   └── checkpoint.py    # 分层检查点
│   │   ├── services/            # 业务逻辑
│   │   │   ├── entity_index.py # 实体词索引
│   │   │   ├── taxonomy.py     # 分类 Schema
│   │   │   ├── document_updater.py
│   │   │   └── user_profile.py # 用户画像
│   │   ├── models/              # SQLAlchemy 模型
│   │   ├── core/                # 配置
│   │   └── main.py              # 入口
│   ├── alembic/                 # 数据库迁移
│   ├── requirements.txt
│   └── Dockerfile
│
├── shared/                         # 共享类型/工具
│   └── types/
│       ├── models.ts              # TypeScript 类型
│       └── schemas.py             # Pydantic 模型
│
├── tests/                          # 测试
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/                          # 设计文档
```

---

## 4. 核心模块设计

### 4.1 LangGraph Agent 架构

```python
# backend/app/agent/graph.py
from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import intent_node, route_node, content_node, navigator_node

def create_knowzero_graph():
    """创建 KnowZero Agent 工作流"""
    graph = StateGraph(AgentState)
    
    # 节点
    graph.add_node("input_normalizer", input_normalizer_node)
    graph.add_node("intent_agent", intent_node)
    graph.add_node("route_agent", route_node)
    graph.add_node("content_agent", content_node)
    graph.add_node("navigator_agent", navigator_node)
    
    # 入口
    graph.set_entry_point("input_normalizer")
    
    # 边
    graph.add_conditional_edges(
        "intent_agent",
        route_by_intent,
        {
            "generate": "route_agent",
            "follow_up": "route_agent",
            "optimize": "route_agent",
            "navigate": "navigator_agent"
        }
    )
    
    graph.add_conditional_edges(
        "route_agent",
        route_by_decision,
        {
            "generate_new": "content_agent",
            "update_doc": "content_agent",
            "navigate": "navigator_agent"
        }
    )
    
    graph.add_edge("content_agent", END)
    graph.add_edge("navigator_agent", END)
    
    return graph.compile()
```

### 4.2 数据库模型核心

```python
# backend/app/models/models.py
from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True)  # TEXT 类型
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    learning_goal = Column(String)
    current_document_id = Column(Integer, ForeignKey("documents.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"))  # TEXT
    topic = Column(String)
    content = Column(Text)
    category_path = Column(String)  # "前端/React/Hooks"
    version = Column(Integer, default=1)
    parent_document_id = Column(Integer, ForeignKey("documents.id"))

class Entity(Base):
    __tablename__ = "entities"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    session_id = Column(String, ForeignKey("sessions.id"))  # TEXT
    type = Column(String)  # concept, tool, library
    status = Column(String, default="active")
```

---

## 5. 关键接口设计

### 5.1 WebSocket 流式接口

```typescript
// 聊天请求
interface ChatRequest {
  session_id: string;
  message: string;
  source: 'chat' | 'comment' | 'entity' | 'follow_up' | 'entry';
  // 可选数据
  comment_data?: CommentData;
  entity_data?: EntityData;
  intent_hint?: string;
}

// 流式响应
interface StreamResponse {
  type: 'thinking' | 'content' | 'document' | 'follow_ups' | 'error' | 'done';
  data: any;
}
```

---

## 6. 开发阶段规划

### Phase 1: 基础架构 (Week 1-2)

- [ ] 项目初始化 (前端 Vite + 后端 FastAPI)
- [ ] 数据库模型实现
- [ ] 基础 API 接口
- [ ] 前端基础布局

### Phase 2: Agent 核心 (Week 3-4)

- [ ] LangGraph 基础流程
- [ ] Intent Agent + Route Agent
- [ ] Content Agent 文档生成
- [ ] 简单聊天流程跑通

### Phase 3: 完整功能 (Week 5-6)

- [ ] 实体词系统
- [ ] 评论锚点
- [ ] 追问系统
- [ ] 目录树

### Phase 4: 优化 (Week 7-8)

- [ ] 分层检查点
- [ ] 消息总结
- [ ] 性能优化

---

## 7. 启动命令

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

---

*技术架构方案 v1.0 | KnowZero 项目*
