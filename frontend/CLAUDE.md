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

## 代码格式化工作流

### 格式化工具配置

项目使用 **Prettier** + **prettier-plugin-tailwindcss** 进行代码格式化。

配置文件：`.prettierrc`
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### 关键规则说明

| 规则 | 值 | 说明 |
|------|-----|------|
| `singleQuote` | `false` | 使用**双引号**（CSS、JS、TSX 统一） |
| `plugins` | `tailwindcss` | 自动排序 Tailwind 类名，保持一致性 |

### 开发工作流

**重要**：为了避免功能变更与格式化混在一起，请遵循以下工作流：

#### 1. 编辑器保存时自动格式化（推荐）

在 VS Code 中安装以下扩展并启用保存时格式化：
- `Prettier - Code formatter`
- `ESLint`

VS Code `settings.json` 配置：
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[javascript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[css]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

#### 2. 提交前运行格式化

```bash
# 格式化所有文件
npm run format

# 检查格式化（CI 使用）
npx prettier --check "src/**/*.{ts,tsx,css}"
```

#### 3. Git 提交工作流

当准备提交代码时：

```bash
# 方案 A: 手动格式化后再提交
npm run format
git add .
git commit -m "feat: 功能描述"

# 方案 B: 使用 pre-commit hook（需安装，见下方）
git add .
git commit -m "feat: 功能描述"  # hook 自动运行格式化
```

### Pre-commit Hook 配置（可选）

为了避免忘记格式化，推荐配置 pre-commit hook：

#### 安装 Husky + lint-staged

```bash
npm install --save-dev husky lint-staged
npx husky init
```

#### 配置 lint-staged

在 `package.json` 中添加：
```json
{
  "lint-staged": {
    "src/**/*.{ts,tsx,css,json}": [
      "prettier --write"
    ],
    "src/**/*.{ts,tsx}": [
      "eslint --fix"
    ]
  }
}
```

#### 配置 Husky hook

创建 `.husky/pre-commit` 文件：
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

### 常见问题

**Q: 为什么我的 PR 有大量格式化 diff？**

A: 可能原因：
1. 没有在保存时自动格式化，导致局部文件格式不一致
2. 使用了与项目配置不同的编辑器设置
3. 手动修改了类名顺序，与 Prettier Tailwind 插件冲突

**解决方法**：
```bash
# 运行完整格式化
npm run format

# 如果已经 commit，修正并 amend
git add .
git commit --amend --no-edit
```

**Q: 可以禁用某行的格式化吗？**

A: 可以，使用 Prettier 注释：
```tsx
{/* prettier-ignore */}
<div className="custom-class">
```

**Q: Tailwind 类名顺序为什么很重要？**

A: `prettier-plugin-tailwindcss` 按照以下顺序排序类名：
1. Layout（布局）：`flex`, `grid`, `w-full`, `h-10`...
2. Typography（排版）：`text-sm`, `font-semibold`...
3. Colors（颜色）：`bg-primary`, `text-foreground`...
4. Borders（边框）：`border`, `rounded-lg`...
5. Effects（效果）：`shadow-md`, `opacity-50`...
6. Transitions（过渡）：`transition-all`, `hover:xxx`...

这确保了类名的可读性和可维护性。
