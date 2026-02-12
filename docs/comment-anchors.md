# 评论锚点系统

> 解决文档更新后评论位置失效的问题

---

## 问题

```
┌─────────────────────────────────────────────────────────────────┐
│                  字符偏移量的问题                           │
│                                                              │
│  文档:                                                      │
│  ┌────────────────────────────────────────────┐                │
│  │ useEffect 让函数组件能够处理副作用。   │                │
│  │            ━━━━━━  ← 用户划线 (position: 120-145)  │
│  └────────────────────────────────────────────┘                │
│                                                              │
│  评论: "这里太抽象了，能举例说明吗？"                     │
│  保存: position_start=120, position_end=145                      │
│                                                              │
│  ────────────────────────────────────────────────────────────      │
│                                                              │
│  文档更新后:                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │ 【新增内容】                                           │
│  │ useEffect 让函数组件能够处理副作用...        │                │
│  │ 例如，获取数据、订阅事件、手动操作 DOM...         │                │
│  │                                                  │                │
│  │ 原内容向下移动，position 不再匹配!                      │
│  └────────────────────────────────────────────┘                │
│                                                              │
│  结果: 评论锚点失效，用户找不到位置                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 解决方案：内容指纹锚点

```
┌─────────────────────────────────────────────────────────────────┐
│                  内容指纹锚点系统                         │
│                                                              │
│  不依赖字符位置，使用内容指纹                               │
│  即使文档被更新，也能找到评论位置                           │
└─────────────────────────────────────────────────────────────────┘
```

### 三种指纹方法

| 方法 | 说明 | 示例 |
|------|------|------|
| **内容哈希** | SHA256 哈希，精确匹配 | `a1b2c3...` |
| **关键词提取** | 提取关键词，模糊匹配 | `useEffect, 函数组件, 副作用` |
| **结构指纹** | 分析文本结构特征 | `paragraph_start, code_block_after` |

---

## 数据模型

### comments 表更新

```sql
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    -- 评论内容
    selected_text TEXT,               -- 用户选中的文本
    comment TEXT NOT NULL,             -- 用户评论

    -- 位置信息 (保留用于兼容)
    position_start INTEGER,
    position_end INTEGER,
    section_id TEXT,                  -- 所在章节 ID

    -- === 新增：内容指纹锚点系统 ===
    -- 内容指纹 (用于锚点定位，替代字符偏移)
    anchor_fingerprint TEXT,            -- 内容指纹: hash:keywords:structure

    -- 锚点上下文 (用于模糊匹配)
    anchor_context_prefix TEXT,         -- 锚点前的上下文
    anchor_context_suffix TEXT,         -- 锚点后的上下文

    -- 优化状态
    optimization_status TEXT DEFAULT 'pending',  -- 'pending' | 'optimized' | 'dismissed'
    optimization_document_version INTEGER, -- 优化后的版本号

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_comments_anchor_fp ON comments(anchor_fingerprint);
```

---

## 锚点定位算法

### 创建锚点

```python
# backend/models/semantic_anchors.py

class ContentFingerprintAnchor:
    """
    内容指纹锚点系统

    不依赖字符位置，使用内容指纹
    """

    def create_anchor(self, content: str, context: dict) -> dict:
        """创建稳定的锚点"""

        # 1. 提取内容指纹
        fingerprint = self._generate_fingerprint(content)

        # 2. 生成锚点 ID
        anchor_id = f"anchor-{fingerprint}"

        return {
            "anchor_id": anchor_id,
            "fingerprint": fingerprint,
            "original_content": content
        }

    def _generate_fingerprint(self, content: str) -> str:
        """
        生成内容指纹

        使用多种方法的组合
        """

        # 方法 1: 内容哈希
        import hashlib
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

        # 方法 2: 关键词提取
        keywords = self._extract_keywords(content)
        keyword_hash = "-".join(sorted(keywords))

        # 方法 3: 结构指纹
        structure_hash = self._analyze_structure(content)

        # 组合指纹
        return f"{content_hash}:{keyword_hash}:{structure_hash}"

    def _extract_keywords(self, content: str) -> list:
        """提取关键词"""

        # 简单的关键词提取：去掉停用词
        stopwords = {'的', '是', '在', '和', '了', '有', '我', '你'}

        # 分词 (简单按空格和标点分)
        import re
        words = re.findall(r'\w+', content)

        # 过滤停用词和短词
        keywords = [w for w in words if len(w) > 2 and w not in stopwords]

        return list(set(keywords))[:5]  # 最多保留 5 个关键词

    def _analyze_structure(self, content: str) -> str:
        """分析文本结构"""

        # 简单的结构分析
        if content.startswith('#'):
            return "heading"
        elif '```' in content:
            return "code_block"
        elif '\n' in content:
            return "multiline"
        else:
            return "plain"
```

### 定位锚点

```python
    def locate_anchor(
        self, document: dict, anchor_id: str
    ) -> dict:
        """
        在文档中定位锚点

        即使文档被更新，也能找到
        """

        fingerprint = anchor_id.split("-")[1] if "-" in anchor_id else ""

        # 1. 精确匹配
        for section in document["sections"]:
            if self._fingerprint_matches(section["content"], fingerprint):
                return {
                    "section_id": section["id"],
                    "match_type": "exact",
                    "confidence": 1.0
                }

        # 2. 模糊匹配
        best_match = None
        best_score = 0

        for section in document["sections"]:
            score = self._similarity_score(section["content"], fingerprint)
            if score > best_score:
                best_score = score
                best_match = {
                    "section_id": section["id"],
                    "match_type": "fuzzy",
                    "confidence": score
                }

        if best_match and best_score > 0.6:
            return best_match

        return None

    def _fingerprint_matches(self, content: str, fingerprint: str) -> bool:
        """检查内容指纹是否匹配"""

        # 解析指纹
        parts = fingerprint.split(":")

        if len(parts) < 2:
            return False

        content_hash = parts[0]
        keyword_hash = parts[1] if len(parts) > 1 else ""

        # 验证哈希
        import hashlib
        current_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

        if current_hash == content_hash:
            return True

        # 验证关键词
        if keyword_hash:
            keywords = set(keyword_hash.split("-"))
            content_keywords = set(self._extract_keywords(content))
            if keywords & content_keywords:  # 有交集
                return True

        return False

    def _similarity_score(self, content: str, fingerprint: str) -> float:
        """计算相似度分数"""

        # 解析指纹
        parts = fingerprint.split(":")
        keyword_hash = parts[1] if len(parts) > 1 else ""

        if not keyword_hash:
            return 0.0

        # 计算关键词重叠度
        keywords = set(keyword_hash.split("-"))
        content_keywords = set(self._extract_keywords(content))

        intersection = keywords & content_keywords
        union = keywords | content_keywords

        if not union:
            return 0.0

        # Jaccard 相似度
        return len(intersection) / len(union)
```

---

## 版本映射

### 锚点迁移逻辑

```python
# backend/services/comment_migration.py

class CommentMigrator:
    """评论迁移器 - 处理文档更新时的锚点迁移"""

    async def migrate_comments(
        self, doc_id: int, old_content: str, new_content: str
    ):
        """
        文档更新后迁移评论锚点

        当文档内容更新时，更新所有评论的锚点位置
        """

        # 1. 获取文档的所有评论
        comments = await self.db.get_document_comments(doc_id)

        # 2. 对每个评论进行锚点定位
        migrated_comments = []
        for comment in comments:
            if not comment.get("anchor_fingerprint"):
                # 旧评论，没有指纹，尝试创建新指纹
                continue

            # 在新文档中定位锚点
            location = self.anchor_locator.locate_anchor(
                document={"content": new_content},
                anchor_id=f"anchor-{comment['anchor_fingerprint']}"
            )

            if location:
                # 更新评论的 section_id
                await self.db.update_comment_section(
                    comment_id=comment["id"],
                    section_id=location["section_id"]
                )
                migrated_comments.append(comment["id"])

        return {
            "total_comments": len(comments),
            "migrated_comments": len(migrated_comments),
            "failed_comments": len(comments) - len(migrated_comments)
        }
```

---

## 前端集成

### 评论显示与定位

```typescript
// frontend/components/CommentPanel.tsx

interface Comment {
  id: number;
  comment: string;
  selected_text: string;
  anchor_fingerprint?: string;
  section_id?: string;
}

export function CommentPanel({ documentId }: { documentId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    async function loadComments() {
      const response = await fetch(`/api/documents/${documentId}/comments`);
      const data = await response.json();

      // 按锚点分组评论
      const grouped = groupCommentsBySection(data.comments);
      setComments(grouped);
    }

    loadComments();
  }, [documentId]);

  const scrollToComment = (comment: Comment) => {
    // 使用锚点定位
    const section = document.getElementById(`section-${comment.section_id}`);

    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 高亮选中的文本
      highlightText(comment.selected_text);
    }
  };

  return (
    <div className="comment-panel">
      {comments.map(comment => (
        <div
          key={comment.id}
          className="comment-item"
          onClick={() => scrollToComment(comment)}
        >
          <div className="comment-quote">
            "{comment.selected_text}"
          </div>
          <div className="comment-text">
            {comment.comment}
          </div>
          {comment.anchor_fingerprint && (
            <span className="anchor-badge">
              锚点: {comment.anchor_fingerprint.slice(0, 8)}...
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 总结

| 问题 | 解决方案 |
|------|---------|
| 字符偏移量失效 | 内容指纹锚点 |
| 文档更新后评论找不到位置 | 锚点迁移 + 模糊匹配 |
| 相似内容无法定位 | 关键词模糊匹配 |

---

*评论锚点系统 | KnowZero 项目*
