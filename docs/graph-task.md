# LangGraph 状态机制与后台任务架构

> 本文档记录了一次 UX 优化过程中发现的架构问题、修复方案，以及对 LangGraph 状态机制和后台任务设计的深入分析。

## 问题背景

前端对话列表中，消息状态提示存在以下 UX 问题：

1. **"正在执行 LLM..." 不友好** — LLM 节点启动时，placeholder 显示的是技术性文案
2. **文档生成后无状态反馈** — 生成文档后提取实体词、生成追问时，用户看不到任何进度提示，以为系统卡住了
3. **追问生成了但前端不显示** — follow_ups 消息到达时，前端没有正确渲染

## 发现的三个根本问题

### 问题一：`graph.ainvoke()` 重复执行整个图（31 秒延迟）

**现象**：WebSocket 消息时间线显示 `node_end(LangGraph)` 到 `document` 之间有 31 秒空白。

**根因**：`finalize()` 中调用 `graph.ainvoke(self.state, config)`，LangGraph 将其视为一个**新的对话轮次**，从 entry point 重新执行整个图（包括 LLM 调用）。

```
原来的流程：
  astream_events() ──[30s LLM]──→ checkpoint ✓
  ainvoke()        ──[31s LLM]──→ checkpoint ✓  ← 白跑了一遍！
  finalize()       ──→ 发送 document
  总耗时: ~61s
```

**修复**：改用 `graph.aget_state(config)` 从 checkpoint 读取已保存的最终状态：

```python
# 修复前
result_state = await graph.ainvoke(self.state, config)

# 修复后
state_snapshot = await graph.aget_state(config)
result_state = state_snapshot.values if state_snapshot and state_snapshot.values else {}
```

```
修复后的流程：
  astream_events() ──[30s LLM]──→ checkpoint ✓
  aget_state()     ──[0ms]──→ 读取 checkpoint
  finalize()       ──→ 发送 document
  总耗时: ~30s
```

### 问题二：React "setState-in-setState" 导致状态更新丢失

**现象**：控制台报 `Cannot update a component while rendering a different component`，placeholder 文本不更新。

**根因**：在 React state updater 内部触发了 Zustand store 的 setState：

```typescript
// 问题代码
setPlaceholderId((id) => {
  updatePlaceholder(id, "xxx");  // ← 在 state updater 里触发 Zustand setState
  return id;
});
```

**修复**：用 `useRef` 替代 `useState` 追踪 placeholder ID：

```typescript
// 修复后
const placeholderIdRef = useRef<number | null>(null);

// 直接读 ref，不嵌套 setState
if (placeholderIdRef.current) {
  updatePlaceholder(placeholderIdRef.current, "xxx");
}
```

### 问题三：Stale Closure 导致 follow_ups 不显示

**现象**：后端日志显示 follow_ups 已发送，但前端不渲染。

**根因**：`follow_ups` handler 中的 `currentDocument` 是上次 render 时的闭包值。`document` 和 `follow_ups` 消息到达间隔很短，组件还没 re-render，`currentDocument?.id` 还是旧值，document_id 匹配失败。

```typescript
// 问题代码 — currentDocument 是 stale 的
const shouldUpdate = fuData.document_id === currentDocument?.id;

// 修复后 — 直接从 store 读最新值
const currentDoc = useSessionStore.getState().currentDocument;
const shouldUpdate = fuData.document_id === currentDoc?.id;
```

## LangGraph 状态机制详解

### 核心模型：State + Checkpoint

LangGraph 的执行模型是一个**有状态的状态机**：

```
[Entry] → node_A → node_B → node_C → [END]
              ↓         ↓         ↓
          checkpoint  checkpoint  checkpoint
```

每个节点执行完后，LangGraph 把当前状态保存到 checkpointer（本项目用 `MemorySaver`，即内存字典）。状态的 key 是 `thread_id`。

### State 的更新方式

每个节点返回的是**部分更新**（partial update），不是完整状态：

```python
# content_agent_node 返回的是：
return {"document": {...}, "change_summary": "生成了新文档"}
# 不是完整的 AgentState，只是需要更新的字段
```

LangGraph 内部做 merge：

```python
# 伪代码
current_state = checkpoint.load(thread_id)
node_output = await content_agent_node(current_state)
new_state = {**current_state, **node_output}  # merge
checkpoint.save(thread_id, new_state)          # 保存
```

对于带 reducer 的字段（如 `Annotated[list, add_messages]`），merge 逻辑是追加而不是覆盖。

### `astream_events()` vs `ainvoke()` vs `aget_state()`

| 方法 | 语义 | 是否执行图 | 耗时 |
|------|------|-----------|------|
| `astream_events(input, config)` | 执行图并流式返回事件 | 是，完整执行 | 取决于 LLM |
| `ainvoke(input, config)` | 开始一个**新的对话轮次** | 是，从头执行 | 取决于 LLM |
| `aget_state(config)` | 读取 checkpoint 中的当前状态 | 否 | 毫秒级 |

关键区别：即使 `thread_id` 相同，`ainvoke()` 不会说"已经跑过了，直接返回"。它的设计意图是多轮对话 — 每次调用都是一个新轮次，会从 entry point 重新执行。

## 后台任务架构

### 两层执行模型

```
┌─────────────────────────────────────────────────┐
│  LangGraph 图（同步流式执行）                      │
│                                                   │
│  input_normalizer → intent → route → content_agent │
│                                          │         │
│                                        [END]       │
└──────────────────────────────────────────┼─────────┘
                                           │
                              finalize() 拿到 document
                                           │
                              ┌─────────────┼──────────────┐
                              │     asyncio.create_task()   │
                              ▼                             ▼
                    _background_extract_entities   _background_generate_follow_ups
                    (独立 LLM 调用)                 (独立 LLM 调用)
                              │                             │
                              ▼                             ▼
                    send_entities(ws)              send_follow_ups(ws)
                              │                             │
                              └──────────┬──────────────────┘
                                         │
                                    send_done(ws)
```

### 为什么不放在图里

实体词提取和追问生成**故意不放在 LangGraph 图里**，原因：

1. **不阻塞主流程** — 文档一生成就立刻推送给前端，实体词和追问后续"补上来"
2. **并行执行** — 两个任务用 `asyncio.create_task()` 并行跑，图里的节点是串行的
3. **容错隔离** — 后台任务失败不影响主流程，文档已经推送给用户了

### 执行机制

`asyncio.create_task()` 把协程注册到事件循环，**立即返回**不等待。然后在 `cleanup()` 里统一等待完成：

```python
# 启动（不等待）
entity_task = asyncio.create_task(_background_extract_entities(...))
followup_task = asyncio.create_task(_background_generate_follow_ups(...))

# cleanup() 里等待
await asyncio.wait_for(
    asyncio.gather(*self._background_tasks, return_exceptions=True),
    timeout=30.0,
)
# 全部完成后才发 done
await send_done(self.websocket)
```

### 完整时间线

```
t=0s    astream_events() 开始，图执行
t=0.1s  input_normalizer → intent_agent → route_agent
t=0.5s  content_agent 开始，LLM 流式生成文档
t=30s   content_agent 完成，图到达 END
t=30s   finalize(): aget_state() 读 checkpoint（毫秒级）
t=30s   _handle_document(): 持久化 + send_document()
t=30s   create_task(extract_entities)  ← 启动，不等待
t=30s   create_task(generate_follow_ups) ← 启动，不等待
t=30s   send_progress("正在提取关键概念和生成追问...")
t=33s   entities LLM 完成 → send_entities()
t=35s   follow_ups LLM 完成 → send_follow_ups()
t=35s   cleanup(): 所有后台任务完成 → send_done()
```

## 前端状态流转

修复后的 placeholder 消息状态流转：

```
"..."
→ "正在理解输入..."
→ "正在分析意图..."
→ "正在规划处理..."
→ "正在生成内容..."
→ "AI 正在生成中..."
→ "正在生成《Kafka》..."
→ [文档流式输出到 DocumentView]
→ "已生成《Kafka》，正在完善..."
→ "正在提取关键概念和生成追问..."
→ [实体词出现在文档侧边栏]
→ [追问按钮出现在文档底部]
→ [placeholder 消失，服务端消息替换]
```

## 涉及的文件变更

| 文件 | 变更内容 |
|------|---------|
| `backend/app/services/websocket_message_sender.py` | 新增 `send_progress()` 函数 |
| `backend/app/services/agent_streaming_service.py` | `ainvoke()` → `aget_state()`；`done` 延迟到后台任务完成后发送 |
| `frontend/src/pages/SessionPage.tsx` | `useState` → `useRef` 追踪 placeholder；`getState()` 修复 stale closure；新增 `progress` 处理 |
