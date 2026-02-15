# KnowZero 功能增强计划

## Context

KnowZero 当前是一个基于 LangGraph 的 AI 学习平台，核心能力是：聊天问答、文档流式生成、实体高亮探索、跟进问题、文本批注、学习路线图生成。

**问题**：对比有亮点的 Agent 项目，当前功能偏"文档生成器 + 聊天"，缺乏让人眼前一亮的交互体验和深度学习闭环。实体系统有数据但无可视化，路线图有生成但无渲染，会话无历史记录，学习无进度追踪，内容全靠 LLM 训练数据无法获取最新信息。

**目标**：通过 7 个高影响力功能，将 KnowZero 从"AI 文档生成器"升级为"有记忆、有评估、有可视化、有工具调用的智能学习平台"。

---

## 功能一览（按优先级排序）

| # | 功能 | 复杂度 | 核心价值 |
|---|------|--------|---------|
| 1 | 会话历史 & 知识库 | S | 基础 UX 缺陷修复，跨会话数据基础 |
| 2 | 交互式学习路线图 | S-M | 后端已有数据，前端渲染即可 |
| 3 | 知识图谱可视化 | M | 视觉差异化，实体系统的自然延伸 |
| 4 | 学习记忆 & 自适应个性化 | M | 飞轮效应：越用越懂你 |
| 5 | 苏格拉底式评估 Agent | L | 从被动阅读到主动学习的质变 |
| 6 | Research Agent（联网搜索） | M-L | 展示高级 Agent 能力，内容时效性 |
| 7 | 代码沙盒 Playground | L | "能跑代码"的 wow moment |

---

## Feature 1: 会话历史 & 跨会话知识库

**为什么重要**：当前离开会话就找不回来了，这是最基本的 UX 缺陷。

**实现方案**：

前端新增：
- `SessionsPage.tsx` — 新路由 `/sessions`，展示所有历史会话卡片（标题、日期、文档数、实体数）
- `SearchPage.tsx` — 新路由 `/search`，全文搜索文档和实体
- 改造 `HomePage.tsx` — 在主题输入框下方展示最近会话和"继续学习"入口

后端新增：
- `GET /api/sessions` — 分页列出用户所有会话
- `GET /api/sessions/{id}/summary` — 会话摘要（文档数、实体数、最后活跃时间）
- `GET /api/search?q=...&type=documents|entities` — 全文搜索（SQLite LIKE 或 FTS5）

关键文件：
- `frontend/src/App.tsx` — 添加新路由
- `backend/app/api/routes/sessions.py` — 新增 list/summary 端点

---

## Feature 2: 交互式学习路线图

**为什么重要**：`planner_agent` 已经生成了结构化路线图（milestones + mermaid），但前端完全没有渲染。`sessionStore` 有 `setRoadmap()` 但从未使用。这是投入产出比最高的功能。

**实现方案**：

前端新增：
- `RoadmapView.tsx` — 垂直时间线/步骤条渲染 milestones
- `MilestoneCard.tsx` — 单个里程碑卡片，显示标题、描述、包含主题、完成状态
- 点击里程碑 → 自动发送该阶段主题到 Agent 生成文档
- 在 `SessionPage.tsx` 中集成，当 `roadmap` 状态存在时显示

后端改动：
- 新增 `LearningRoadmap` 数据模型持久化路线图
- `planner_agent` 输出通过 WebSocket `roadmap` 事件发送（事件类型已定义但未处理）
- 新增 `POST /api/sessions/{id}/roadmap/milestone/{mid}/start` 触发里程碑学习

关键文件：
- `backend/app/agent/nodes/planner.py` — 路线图生成逻辑
- `frontend/src/stores/sessionStore.ts` — `roadmap` 状态已存在
- `frontend/src/types/index.ts` — `Roadmap` 类型已定义

---

## Feature 3: 知识图谱可视化

**为什么重要**：实体系统（`entities`、`entity_document_links`、`document_entities` 表）已有完整数据，但用户看不到全貌。力导向图实时展示知识网络是最具视觉冲击力的功能。

**实现方案**：

前端新增：
- `GraphView.tsx` — 使用 `react-force-graph-2d` 渲染力导向图
- 实体为小节点，文档为大节点，`explains/mentions` 链接为边
- 当前文档节点高亮脉动，未访问实体半透明
- 点击节点 → 导航到文档或触发实体探索
- 在 Sidebar 中作为文档列表的切换视图

后端新增：
- `GET /api/sessions/{id}/graph` — 返回 `{nodes: [...], edges: [...]}` 格式数据
- `graph_service.py` — 查询实体、文档及其关联
- 新增 `EntityRelation` 模型存储实体间关系（is_part_of, requires, relates_to）
- 文档生成后新增后台任务 `_background_extract_entity_relations` 提取实体关系

关键文件：
- `backend/app/services/agent_streaming_service.py` — 添加 `graph_update` WebSocket 事件
- `backend/app/models/` — 新增 EntityRelation 模型

---

## Feature 4: 学习记忆 & 自适应个性化

**为什么重要**：当前每个会话是孤立的，`user_level` 永远是 "beginner"，`learned_topics` 永远为空。跨会话记忆创造飞轮效应。

**实现方案**：

后端新增：
- `UserProfile` 模型 — 持久化用户画像（level, learned_topics, learning_style, strengths, weaknesses）
- `user_profile_service.py` — 画像 CRUD 和自动更新
- 改造 `input_normalizer_node` — 启动时从 DB 加载用户画像填充 `AgentState`
- 改造 `content_agent_node` 提示词 — 注入用户上下文："用户已掌握 [topics]，水平 [intermediate]，偏好 [示例多的解释]"
- 文档生成后新增后台任务 `_background_update_user_profile` 更新画像

前端新增：
- `DashboardPage.tsx` — 新路由 `/dashboard`，展示跨会话学习进度
- `SkillRadar.tsx` — 雷达图展示各领域掌握度
- `LearningTimeline.tsx` — 时间线展示学习历程

关键文件：
- `backend/app/agent/nodes/input_normalizer.py` — 加载用户画像
- `backend/app/agent/nodes/content.py` — 提示词增强

---

## Feature 5: 苏格拉底式评估 Agent

**为什么重要**：从被动阅读到主动学习的质变。Agent 主动出题 → 评估答案 → 反馈 → 调整难度，这是与 ChatGPT 最大的差异化。

**实现方案**：

Agent 新增：
- `assessor_agent_node` — 新节点，基于文档内容生成 3-5 道递进难度题目
- 新 intent `"assess"` 加入 classifier
- 新路由路径：`route_agent` → `assessor_agent`
- 多轮对话模式：出题 → 等待回答 → 评估反馈 → 下一题

数据模型新增：
- `Assessment` — 评估记录（questions, answers, mastery_score）
- `TopicMastery` — 主题掌握度（mastery_level, last_assessed_at, next_review_at 用于间隔重复）

前端新增：
- `AssessmentPanel.tsx` — 专注的答题 UI
- `MasteryBadge.tsx` — 文档卡片上的掌握度徽章
- `AssessmentResults.tsx` — 评估结果摘要（强项、弱项、建议）

关键文件：
- `backend/app/agent/graph.py` — 注册新节点和边
- `backend/app/agent/state.py` — 新增 assessment, mastery_scores 字段

---

## Feature 6: Research Agent（联网搜索 & 源综合）

**为什么重要**：当前内容全靠 LLM 训练数据，无法获取最新信息。联网搜索展示高级 Agent 能力（工具调用、多步推理、源评估）。

**实现方案**：

Agent 新增：
- `researcher_agent_node` — 使用 ReAct 模式：思考 → 搜索 → 阅读 → 综合
- LangChain 工具集成：`TavilySearchResults` 或 `DuckDuckGoSearchResults` + `WebPageReader`
- 新 intent `"research"` — 触发词：`查一下|搜索|最新|最近|当前版本`
- 生成带内联引用的文档，底部附源列表

前端新增：
- `SourceCitation.tsx` — 内联引用 `[1]`，hover 显示来源
- `SourcesPanel.tsx` — 文档底部可折叠的来源面板
- `ResearchBadge.tsx` — 文档头部"AI 调研"标识
- 执行进度新增搜索/阅读/综合步骤展示

关键文件：
- `backend/app/agent/nodes/` — 新增 researcher.py
- `backend/app/agent/classifier.py` — 新增 research 模式识别

---

## Feature 7: 代码沙盒 Playground

**为什么重要**：学习编程最有效的方式是动手写。文档中的代码块变成可编辑可运行的沙盒，是"wow, 我可以直接试"的体验。

**实现方案**：

前端新增：
- `CodePlayground.tsx` — 基于 CodeMirror/Monaco 的交互式代码编辑器 + 运行按钮
- JS/TS：使用 Sandpack 或 iframe 隔离的浏览器端执行
- Python：使用 Pyodide (WASM) 浏览器端执行
- 改造 `DocumentView.tsx` 的 markdown code 组件 — 检测可运行代码块，渲染 Playground 替代静态 `<pre>`

后端新增：
- `POST /api/playground/run` — 服务端代码执行（Python，subprocess + timeout 沙盒）
- 改造 `content_agent` 提示词 — 生成带元数据的代码块 `{language, runnable: true}`

MVP 策略：先只支持 JS 客户端执行，后续扩展 Python 服务端执行。

---

## 实施计划

一次一个功能，按以下顺序推进：

**第一个迭代：Feature 1 — 会话历史 & 知识库**
- 这是最基础的 UX 缺陷修复，也是后续跨会话功能的基础设施

**第二个迭代：Feature 2 — 交互式学习路线图**
- 后端数据已就绪，投入产出比最高

后续功能根据实际情况再排优先级。

## 验证方式

每个功能完成后：
1. 后端：`pytest` 运行测试，`ruff check . --fix` 代码检查
2. 前端：`pnpm build` 确认编译通过，`pnpm lint` 代码检查
3. 端到端：启动 dev server，通过浏览器手动验证完整用户流程
4. Agent 功能：通过 WebSocket 发送测试消息，验证新节点正确路由和输出
