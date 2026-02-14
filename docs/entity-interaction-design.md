# 实体词交互与深度探索设计

> 实体词是 KnowZero 知识网络的枢纽，本方案详细设计实体词的交互逻辑与探索流程。

---

## 1. 核心交互逻辑

实体词不再仅仅是文档中的高亮文本，而是作为**交互入口**，引导用户在知识库中进行非线性探索。

### 1.1 触发机制
- **位置**：文档正文中的加粗高亮词。
- **行为**：点击触发。
- **样式**：悬浮态显示下划线，点击后弹出浮层（Popover）。

### 1.2 实体词浮层 (Entity Popover)
使用 Radix UI `Popover` 组件，内容包含：

| 模块 | 内容 | 作用 |
|------|------|------|
| **Header** | 实体词名称 + 类型图标 (Concept/Tool/Lib) | 身份确认 |
| **Summary** | 1-2 句 AI 生成的简要定义 | 快速扫盲，无需切换页面 |
| **Relations** | 关联文档列表（本会话中已存在的） | 知识点回溯与关联 |
| **Actions** | [查看详情] 或 [深度探索] 按钮 | 触发流式生成或页面跳转 |

---

## 2. 深度探索流程 (The Exploration Flow)

当用户点击实体词浮层中的 **[深度探索]** 时，系统进入以下状态：

1. **Backend 查询**：`EntityIndex` 检查数据库，看是否有专门解释该实体的文档。
2. **Intent 决策**：
   - **已有文档**：`Navigator` 节点工作，前端自动平滑滚动到该文档或切换 Tab。
   - **无文档**：`Content Agent` 启动，开始流式生成一份以该实体词为核心的“深入解析”文档。
3. **知识树生长**：生成的文档自动挂载到当前文档的子层级，或根据 `category_path` 自动分类。

---

## 3. 前端实现细节

### 3.1 实体词组件 (`EntityMention.tsx`)
```typescript
interface EntityProps {
  id: number;
  name: string;
  type: string;
}

export const EntityMention = ({ name }: EntityProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="cursor-pointer border-b border-dotted border-primary font-bold text-primary hover:bg-primary/10">
          {name}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <EntityCard name={name} />
      </PopoverContent>
    </Popover>
  );
};
```

### 3.2 实体词卡片 (`EntityCard.tsx`)
- **状态管理**：使用 `React Query` 请求实体详情。
- **展示内容**：
  - `description`: 实体简述。
  - `linked_documents`: `Array<{id: number, topic: string}>`。
  - `suggested_action`: `explore` 或 `navigate`。

---

## 4. 后端支持 (API 需求)

### `GET /api/entities/query?name={name}&session_id={session_id}`
- **返回**：
  ```json
  {
    "id": 101,
    "name": "useState",
    "summary": "React 的基础 Hook，用于在函数组件中添加内部状态。",
    "has_main_doc": true,
    "main_doc_id": 45,
    "related_docs": [
      {"id": 12, "topic": "React Hooks 入门"}
    ]
  }
  ```

---

## 5. 预期体验

> 用户在阅读《React 入门》时，看到 **useState**，点击后浮层显示“这是用于管理状态的 Hook”。用户想深入了解原理，点击“深度探索”，左侧目录树自动增加《useState 深入解析》，主文档区平滑切换到新文档的生成流。

---
*实体词交互设计 v1.0 | KnowZero 项目*
