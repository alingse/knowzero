# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在本项目中工作时提供指导。

## 项目概述

KnowZero Frontend - AI 学习平台的 React 前端。通过 REST API 和 WebSocket 与 FastAPI 后端通信。

## 命令

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 5173）
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint

# 修复 lint 问题
npm run lint:fix

# 代码格式化（Prettier）
npm run format

# TypeScript 类型检查
npm run type-check
```

## 架构

### 技术栈
- **React 18** + TypeScript
- **Vite** - 使用 SWC 的构建工具
- **TailwindCSS** - 样式
- **Radix UI** - 可访问的组件原语
- **Zustand** - 客户端状态管理
- **TanStack Query** - 服务端状态 / 数据获取
- **React Router v6** - 路由

### 路径别名
项目在 `vite.config.ts` 中配置了 `@/` 别名：
- `@/` - `./src`
- `@/components` - `./src/components`
- `@/lib` - `./src/lib`
- `@/stores` - `./src/stores`
- `@/api` - `./src/api`
- `@/types` - `./src/types`

### API 集成

Vite 开发服务器将请求代理到后端：
- `/api` → `http://localhost:8002`
- `/ws` → `http://localhost:8002` (WebSocket)

API 客户端位于 `src/api/client.ts`，提供会话、文档和健康检查的方法。

### 状态管理

- **Zustand** (`src/stores/sessionStore.ts`)：管理当前会话、消息、文档、流式状态
- **TanStack Query**：通过 `api/client.ts` 用于服务端状态

### 流式处理

WebSocket 流式处理在 `src/api/websocket.ts` 中实现。会话存储使用 `isStreaming` 和 `streamingContent` 跟踪流式状态。

### 组件结构

```
src/
├── api/           # client.ts (REST), websocket.ts (WebSocket)
├── components/
│   ├── Chat/      # ChatArea, ChatMessage, ChatInput, FloatingAIButton, AIDialog, ExecutionProgress
│   ├── DocumentView/  # Markdown 渲染与实体高亮
│   ├── Layout/    # 主布局包装器
│   ├── Sidebar/   # 导航与分类树
│   └── ui/        # 基于 Radix 的原语组件（button, input, avatar 等）
├── pages/         # HomePage, SessionPage
├── stores/        # sessionStore.ts (Zustand)
├── types/         # TypeScript 接口定义（Session, Message, Document, Entity 等）
└── lib/           # utils.ts（Tailwind 的 cn 辅助函数）
```

## 环境变量

创建 `.env` 文件：
```
VITE_API_URL=http://localhost:8002
```

## 设计系统

UI 组件使用 Radix UI 原语配合 TailwindCSS 样式（通过 class-variance-authority）。使用 `src/lib/utils.ts` 中的 `cn()` 工具函数合并 Tailwind 类名。
