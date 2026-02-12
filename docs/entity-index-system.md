# 实体词索引系统

> 实体词独立于文档存在，支持多对多关系

---

## 设计目标

```
┌─────────────────────────────────────────────────────────────────┐
│                  实体词索引系统的目标                     │
│                                                              │
│  1. 实体词独立于文档存在                                     │
│     实体词不再作为文档的一部分嵌入，而是独立存储              │
│                                                              │
│  2. 支持多对多关系                                         │
│     一个实体词可以出现在多个文档中                             │
│     一个文档可以包含多个实体词                                 │
│                                                              │
│  3. 支持合并/更新                                           │
│     当发现两个实体词实际是同一概念时，可以合并              │
│                                                              │
│  4. 支持快速查询                                           │
│     通过实体词名称快速找到所有相关文档                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 数据模型

### 实体词表 (entities)

```sql
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,       -- 实体词名称
    session_id TEXT NOT NULL,        -- 所属会话

    -- 分类信息
    type TEXT,                      -- concept, tool, library, technique
    category TEXT,                  -- 可选的多级分类

    -- 状态
    status TEXT DEFAULT 'active',     -- active, merged, deprecated

    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_session ON entities(session_id);
```

### 实体词-文档关联表 (entity_document_links)

```sql
CREATE TABLE entity_document_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    link_type TEXT NOT NULL,         -- explains, mentions, related

    -- 关联元数据
    context_snippet TEXT,            -- 文档中如何提到这个实体
    confidence FLOAT,                 -- AI 判断的置信度

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (entity_id) REFERENCES entities(id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(entity_id, document_id, link_type)
);

CREATE INDEX idx_entity_links_entity ON entity_document_links(entity_id);
CREATE INDEX idx_entity_links_document ON entity_document_links(document_id);
```

### 文档中提到的实体词 (document_entities)

```sql
CREATE TABLE document_entities (
    document_id INTEGER NOT NULL,
    entity_id INTEGER NOT NULL,

    -- 位置信息 (用于前端高亮)
    position_start INTEGER,
    position_end INTEGER,
    context TEXT,                   -- 周围文本

    PRIMARY KEY (document_id, entity_id),
    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);
```

---

## 核心功能

### get_or_create_entity()

```python
# backend/services/entity_index.py

class EntityIndex:
    """实体词索引系统"""

    async def get_or_create_entity(
        self, name: str, session_id: str
    ) -> dict:
        """
        获取或创建实体词

        如果实体词已存在，返回其所有关联文档
        如果不存在，创建新实体词
        """

        # 1. 搜索实体词 (模糊匹配 + 精确匹配)
        entity = await self.db.get_entity_by_name(name)

        if entity:
            # 2. 返回现有实体词（包含所有关系）
            documents = await self.db.get_entity_documents(entity["id"])
            return {
                "id": entity["id"],
                "name": entity["name"],
                "type": entity.get("type"),
                "documents": documents,  # 所有包含此实体的文档
                "is_new": False
            }

        # 3. 创建新实体词
        entity_id = await self.db.create_entity(
            name=name,
            session_id=session_id,
            type="concept"  # concept, tool, library, etc.
        )

        return {
            "id": entity_id,
            "name": name,
            "type": "concept",
            "documents": [],
            "is_new": True
        }
```

### link_entity_to_document()

```python
    async def link_entity_to_document(
        self, entity_id: int, doc_id: int, link_type: str
    ):
        """
        关联实体词到文档

        link_type:
        - explains: 文档主要解释这个实体词
        - mentions: 文档提到了这个实体词
        - related: 文档与实体词相关
        """

        await self.db.create_entity_link(
            entity_id=entity_id,
            document_id=doc_id,
            link_type=link_type
        )

        # 更新文档的实体词列表 (用于前端显示)
        await self.db.update_document_entities(doc_id, entity_id)
```

### merge_entities()

```python
    async def merge_entities(self, source_id: int, target_id: int):
        """
        合并重复的实体词

        当发现两个实体词实际是同一概念时
        """

        # 1. 获取两个实体词的所有关联
        source_links = await self.db.get_entity_links(source_id)
        target_links = await self.db.get_entity_links(target_id)

        # 2. 将目标实体的关联迁移到源实体
        for link in target_links:
            await self.db.create_entity_link(
                entity_id=source_id,
                document_id=link["document_id"],
                link_type=link["link_type"]
            )

        # 3. 删除目标实体词
        await self.db.delete_entity(target_id)

        # 4. 更新所有文档的引用
        await self.db.remap_entity_references(target_id, source_id)
```

---

## 交互流程

### 流程：用户点击实体词

```
┌─────────────────────────────────────────────────────────────────┐
│  用户行为: 点击文档中的 **useState**                       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  前端: 发送实体词点击请求                               │
│  POST /api/entities/useState                                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  EntityIndex.get_or_create_entity("useState")               │
└─────────────────────────────────────────────────────────────────┘
                          │
              ┌─────────────┴─────────────┐
              │                           │
         已有文档                      无文档
              │                           │
              ▼                           ▼
┌─────────────────┐          ┌─────────────────────────┐
│ Intent Agent  │          │ Intent Agent          │
│ intent_type=  │          │ intent_type=          │
│ "navigate"    │          │ "new_topic"           │
└───────────────┘          └─────────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────┐          ┌─────────────────────────┐
│ Navigator     │          │ Route Agent           │
│ 显示已有文档  │          │ → Content Agent      │
└───────────────┘          │ 生成新文档            │
                              └───────────────────┘
```

---

## 实体词提取

### 从文档中提取实体词

```python
# backend/services/entity_extractor.py

class EntityExtractor:
    """从文档中提取实体词"""

    async def extract_from_document(
        self, doc_id: int, content: str
    ) -> list:
        """
        从文档内容中提取实体词

        返回: [(entity_name, position), ...]
        """

        # 1. 使用 LLM 提取实体词
        prompt = f"""
从以下文档中提取关键实体词：

【文档内容】
{content}

请返回 JSON：
{{
  "entities": [
    {{"name": "实体词", "type": "concept|tool|library"}}
  ]
}}

提取原则：
- 只提取重要技术概念
- 排除通用词汇（如 "方法", "使用", "学习"）
- 优先提取专有名词（如 "useState", "React Hooks"）
"""

        result = await self.llm.generate_json(prompt)

        # 2. 保存实体词
        entities = []
        for entity_data in result.get("entities", []):
            # 查询或创建实体词
            entity = await self.entity_index.get_or_create_entity(
                name=entity_data["name"],
                session_id=self.session_id
            )

            # 记录在文档中的位置
            position = find_entity_position(content, entity_data["name"])

            # 保存关联
            await self.entity_index.link_entity_to_document(
                entity_id=entity["id"],
                doc_id=doc_id,
                link_type="mentions"  # 文档提到了这个实体
            )

            entities.append({
                "entity_id": entity["id"],
                "name": entity_data["name"],
                "position": position,
                "type": entity_data.get("type", "concept")
            })

        return entities
```

---

## 前端集成

### 实体词高亮与点击

```typescript
// frontend/components/DocumentView.tsx

interface EntityMention {
  entity_id: number;
  name: string;
  position: { start: number; end: number };
}

export function DocumentView({ document }: { document: Document }) {
  const [entities, setEntities] = useState<EntityMention[]>([]);

  // 渲染实体词高亮
  const renderContent = () => {
    const sortedEntities = [...entities].sort(
      (a, b) => a.position.start - b.position.start
    );

    let lastIndex = 0;
    const segments = [];

    for (const entity of sortedEntities) {
      // 添加实体词前的普通文本
      segments.push({
        type: 'text',
        content: document.content.slice(lastIndex, entity.position.start)
      });

      // 添加实体词（带高亮和点击）
      segments.push({
        type: 'entity',
        content: entity.name,
        entityId: entity.entity_id,
        position: entity.position
      });

      lastIndex = entity.position.end;
    }

    return segments.map((segment, i) => {
      if (segment.type === 'entity') {
        return (
          <span
            key={`entity-${i}`}
            className="entity-mention"
            data-entity-id={segment.entityId}
            onClick={() => handleEntityClick(segment.entityId)}
          >
            {segment.content}
          </span>
        );
      }
      return <span key={`text-${i}`}>{segment.content}</span>;
    });
  };

  const handleEntityClick = async (entityId: number) => {
    const response = await fetch(`/api/entities/${entityId}`);
    const data = await response.json();

    if (data.action === 'navigate') {
      // 跳转到已有文档
      router.push(`/documents/${data.document_id}`);
    } else if (data.action === 'new') {
      // 生成新文档
      await generateEntityDocument(data.entity_name);
    }
  };

  return (
    <div className="document-view">
      <div className="document-content">
        {renderContent()}
      </div>
    </div>
  );
}
```

---

## 总结

| 特性 | 说明 |
|------|------|
| **独立存储** | 实体词独立于文档存在，便于管理 |
| **多对多关系** | 一个实体词可关联多个文档，一个文档可包含多个实体词 |
| **快速查询** | 通过实体词名称快速找到所有相关文档 |
| **支持合并** | 支持将重复的实体词合并 |
| **位置记录** | 记录实体词在文档中的位置，用于前端高亮 |

---

*实体词索引系统 | KnowZero 项目*
