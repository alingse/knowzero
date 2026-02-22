# KnowZero 前端问题清单

> 审查日期: 2026-02-22

## 代码质量问题

### ESLint Errors (3个)

1. `src/components/ui/input.tsx:5` / `src/components/ui/textarea.tsx:5` — 空接口声明，应该用 `type InputProps = React.ComponentProps<"input">` 替代
2. `src/pages/SessionPage.tsx:456` — `as any` 类型断言，`follow_up_questions` 应该在 `Document` 类型中正式声明

### ESLint Warnings (6个)

3. `websocket.ts:75` — `useEffect` 缺少 `onMessage` 等回调依赖。如果父组件每次渲染都创建新的回调引用，会导致 WebSocket 反复重连。应该用 `useRef` 存储回调
4. `DocumentView.tsx:221` — `useMemo` 缺少 `splitTextByEntities` 等依赖。`splitTextByEntities` 定义在组件内部且依赖 `entitySet`，应该提取到 `useMemo` 外或用 `useCallback`
5. `SessionPage.tsx:512/669` — `handleSendMessage` 没有用 `useCallback` 包裹，导致 `handleFollowUpClick` 和 auto-send effect 的依赖不稳定

## 设计/UX 问题

6. **字体选择过于通用** — 整个项目使用系统默认字体，没有引入任何特色字体。作为一个学习平台，可以考虑引入一个有辨识度的标题字体（如 Noto Serif SC 或其他中文衬线体）
7. **配色方案是 shadcn/ui 默认值** — `index.css` 中的 CSS 变量完全是 shadcn 默认的灰蓝色调，没有任何品牌个性。primary 色 `222.2 84% 4.9%` 几乎是纯黑
8. **HomePage 缺少视觉层次** — 只有一个输入框和一个按钮，没有插图、动画或视觉引导。`bg-gradient-to-b from-background to-muted/20` 的渐变几乎不可见
9. **DocumentCard 内容预览用 `slice(0, 100)` 截断** — 这会截断 markdown 语法符号（如 `#`、`**`），显示效果不好。应该先 strip markdown 再截断
10. **Sidebar 连接状态指示器** — 底部硬编码显示"已连接"绿点，但实际并没有读取 WebSocket 的真实连接状态
11. **Logo 使用 `dark:invert`** — 这是一个粗暴的暗色模式适配方式，会导致 logo 颜色失真。应该准备两套 SVG 或用 CSS 变量控制颜色
12. **空状态缺少引导** — DocumentGrid 在没有数据时没有 loading skeleton 或空状态提示

## 架构问题

13. **SessionPage 过于庞大 (815行)** — 这个文件承担了太多职责：WebSocket 消息处理、状态管理、文本选择、视图切换。`handleWebSocketMessage` 本身就有 ~320 行，应该抽取为自定义 hook
14. **WebSocket 没有重连机制** — 连接断开后不会自动重连，用户需要刷新页面。生产环境中这是个严重问题
15. **WebSocket 硬编码 `ws://`** — `websocket.ts:31` 使用 `ws://` 而非根据当前协议动态选择 `ws://` 或 `wss://`，部署到 HTTPS 环境会直接失败
16. **console.log 调试日志未清理** — `SessionPage.tsx` 和 `DocumentView.tsx` 中有多处 `console.log` 调试输出（如 `[follow_ups]`、`[navigation]`、`[DocumentView]`），应该在生产环境移除

## 性能问题

17. **DocumentView 的 `splitTextByEntities` 在每次渲染时重新创建** — 这个函数定义在组件内部但没有被 memoize，且被 `markdownComponents` 的 `useMemo` 引用但未列为依赖
18. **`handleWebSocketMessage` 不是 `useCallback`** — 每次渲染都创建新函数，虽然 `useWebSocket` 内部用 ref 存储了它，但仍然不够干净
19. **DocumentView memo 比较函数中的 debug logging** — `console.log` 在 memo 比较函数中会在每次父组件渲染时执行，影响性能

## 安全问题

20. **WebSocket URL 拼接** — `ws://${window.location.host}/ws/${sessionId}` 中 `sessionId` 来自 URL params，虽然风险较低但理论上可被注入

## 未完成功能

21. **RoadmapView TODO** — `RoadmapView.tsx:35` 有 `TODO: Navigate to milestone or show detail`
22. **Entity mode 返回 null** — AIAssistant 的 entity 模式未实现
23. **暗色模式切换** — Tailwind 配置了 `darkMode: ["class"]` 但没有提供切换入口

## 优先级建议

| 优先级 | 问题编号 | 说明 |
|--------|---------|------|
| P0 | #15 | WebSocket `ws://` 硬编码，HTTPS 环境必崩 |
| P0 | #14 | WebSocket 无重连，断线即死 |
| P1 | #13 | SessionPage 815 行，维护成本高 |
| P1 | #1-2 | ESLint errors，CI 会失败 |
| P1 | #3-5 | React hooks 依赖问题，可能导致 bug |
| P2 | #6-8 | 设计缺乏品牌个性 |
| P2 | #16, #19 | 调试日志清理 |
| P3 | #9-12 | UX 细节优化 |
| P3 | #21-23 | 未完成功能 |
