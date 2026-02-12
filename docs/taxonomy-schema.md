# 分类 Schema 系统

> 解决 AI 分类维度不一致的问题

---

## 问题

```
┌─────────────────────────────────────────────────────────────────┐
│                  AI 分类维度的问题                       │
│                                                              │
│  用户: "我想学习 React Hooks"                              │
│                                                              │
│  第 1 次 AI 分类:                                          │
│  - domain: "前端开发"                                     │
│  - framework: "React"                                      │
│  - concept: "Hooks"                                       │
│                                                              │
│  第 2 次 AI 分类:                                          │
│  - domain: "Web 开发"                                    │
│  - framework: "React.js"                                    │
│  - concept: "React Hooks"                                   │
│                                                              │
│  问题: 分类维度不一致，无法建立稳定的知识图谱          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 解决方案

```
┌─────────────────────────────────────────────────────────────────┐
│                  预定义分类维度                       │
│                                                              │
│  1. 预定义分类维度                                          │
│  2. 分类规则引擎                                              │
│  3. 路径验证                                                  │
│                                                              │
│  目标：同一会话内，同一主题使用相同分类                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 预定义维度

### domain (领域)

```python
DOMAINS = [
    "前端", "后端", "数据库", "算法",
    "运维", "测试", "架构设计"
]
```

### frontend_framework (前端框架)

```python
FRONTEND_FRAMEWORKS = [
    "React", "Vue", "Angular",
    "Svelte", "Solid", "Preact"
]
```

### backend_framework (后端框架)

```python
BACKEND_FRAMEWORKS = [
    "Express", "Django", "Flask",
    "Spring Boot", "ASP.NET", "FastAPI"
]
```

### concept_level (概念级别)

```python
CONCEPT_LEVELS = [
    "入门", "基础", "进阶", "实战"
]
```

---

## 分类规则

### 一致性规则

```python
# backend/services/taxonomy.py

class TaxonomyValidator:
    """分类验证器 - 确保分类一致性"""

    async def suggest_category(
        self, topic: str, session_id: str
    ) -> dict:
        """
        建议分类路径

        优先使用会话内的已有分类
        """

        # 1. 检查会话中是否有相似主题
        similar_topics = await self.db.find_similar_topics(
            session_id=session_id,
            topic=topic,
            threshold=0.7
        )

        # 2. 如果有相似主题，继承其分类
        if similar_topics:
            parent_category = similar_topics[0]["category_path"]

            # 生成子分类
            return {
                "category_path": f"{parent_category}/{topic}",
                "confidence": 0.8,
                "method": "inherit"
            }

        # 3. 没有相似主题，使用规则引擎
        return await self._classify_by_rules(topic)

    async def _classify_by_rules(self, topic: str) -> dict:
        """使用规则引擎分类"""

        # 检测关键词
        domain = None
        if any(kw in topic for kw in ["React", "Vue", "Angular"]):
            domain = "前端"
        elif any(kw in topic for kw in ["Python", "Node", "Java"]):
            domain = "后端"
        elif any(kw in topic for kw in ["MySQL", "PostgreSQL", "MongoDB"]):
            domain = "数据库"

        # 构建分类路径
        if domain:
            return {
                "category_path": f"{domain}/{topic}",
                "confidence": 0.9,
                "method": "rule_match"
            }

        # 无法分类，返回默认
        return {
            "category_path": f"其他/{topic}",
            "confidence": 0.5,
            "method": "default"
        }
```

### 继承性规则

```python
    async def validate_inheritance(
        self, doc_id: int, category_path: str
    ) -> dict:
        """
        验证分类继承性

        子文档默认继承父文档的领域
        """

        # 获取父文档
        doc = await self.db.get_document(doc_id)
        if not doc.get("parent_document_id"):
            return {"valid": True, "reason": "Root document"}

        parent_doc = await self.db.get_document(doc["parent_document_id"])
        parent_category = parent_doc.get("category_path", "")

        # 验证领域是否一致
        parent_domain = parent_category.split("/")[0] if parent_category else ""
        current_domain = category_path.split("/")[0] if category_path else ""

        if parent_domain and current_domain != parent_domain:
            return {
                "valid": False,
                "reason": f"子文档领域({current_domain})与父文档领域({parent_domain})不一致",
                "suggestion": f"建议使用 {parent_domain}"
            }

        return {"valid": True}
```

### 路径深度规则

```python
    async def validate_path(
        self, category_path: str, max_depth: int = 4
    ) -> dict:
        """
        验证分类路径

        最大深度: 4 层
        示例: 前端/React/Hooks/useState
        """

        parts = category_path.split("/")

        if len(parts) > max_depth:
            return {
                "valid": False,
                "reason": f"分类路径过深 ({len(parts)} > {max_depth})",
                "suggestion": f"限制在 {max_depth} 层以内"
            }

        # 验证每层是否在预定义维度中
        valid_layers = {
            0: DOMAINS,
            1: FRONTEND_FRAMEWORKS + BACKEND_FRAMEWORKS,
        }

        for i, part in enumerate(parts):
            if i in valid_layers:
                if part not in valid_layers[i]:
                    return {
                        "valid": False,
                        "reason": f"第 {i+1} 层 '{part}' 不在预定义维度中",
                        "suggestion": f"有效值: {valid_layers[i]}"
                    }

        return {"valid": True}
```

---

## 使用方式

### suggest_category()

```python
# backend/services/taxonomy/validator.py

class TaxonomyService:
    """分类服务"""

    async def suggest_category(
        self, topic: str, session_id: str, context: dict
    ) -> dict:
        """
        建议文档分类

        综合考虑：
        1. 会话历史中的相似主题
        2. 规则引擎匹配
        3. LLM 语义理解
        """

        # 1. 检查相似主题
        similar = await self.db.find_similar_topics(
            session_id=session_id,
            topic=topic,
            limit=5
        )

        if similar and similar[0]["similarity"] > 0.8:
            # 高度相似，直接继承
            return {
                "category_path": similar[0]["category_path"],
                "confidence": 0.95,
                "method": "similar_match"
            }

        # 2. 规则引擎
        rule_result = await self.validator.suggest_category(topic, session_id)

        if rule_result["confidence"] > 0.8:
            return rule_result

        # 3. LLM 分类 (最后手段)
        return await self._llm_classify(topic, context)

    async def _llm_classify(self, topic: str, context: dict) -> dict:
        """LLM 分类"""

        prompt = f"""
请为以下主题建议分类路径：

【主题】
{topic}

【预定义维度】
- domain: {DOMAINS}
- frontend_framework: {FRONTEND_FRAMEWORKS}
- backend_framework: {BACKEND_FRAMEWORKS}
- concept_level: {CONCEPT_LEVELS}

【分类规则】
1. domain: 根据主题内容选择最相关的领域
2. framework: 如果是框架相关的主题，选择对应框架
3. concept_level: 根据主题难度选择级别

请返回 JSON：
{{
  "category_path": "领域/框架/主题",
  "domain": "选择的领域",
  "framework": "选择的框架（如果适用）",
  "concept_level": "选择的级别",
  "confidence": 0.9,
  "reasoning": "判断理由"
}}

注意：
- 如果主题不涉及框架，framework 为 null
- 路径深度不超过 4 层
- 优先使用预定义维度中的值
"""

        return await self.llm.generate_json(prompt)
```

### validate_path()

```python
    async def validate_path(self, category_path: str) -> dict:
        """
        验证分类路径的合法性

        检查：
        1. 路径深度
        2. 每层是否在预定义维度中
        3. 继承性（如果有父文档）
        """

        # 1. 深度验证
        depth_result = await self.validator.validate_path(category_path)
        if not depth_result["valid"]:
            return depth_result

        # 2. 维度验证
        parts = category_path.split("/")
        validation_result = await self._validate_dimensions(parts)

        if not validation_result["valid"]:
            return validation_result

        return {"valid": True}

    async def _validate_dimensions(self, parts: list) -> dict:
        """验证每一层是否在预定义维度中"""

        valid_options = {
            0: DOMAINS,
            1: (FRONTEND_FRAMEWORKS + BACKEND_FRAMEWORKS + DATABASES),
            2: CONCEPT_LEVELS
        }

        for i, part in enumerate(parts):
            if i in valid_options:
                if part not in valid_options[i]:
                    return {
                        "valid": False,
                        "reason": f"第 {i+1} 层 '{part}' 不在预定义维度中",
                        "suggestion": f"有效值: {valid_options[i]}"
                    }

        return {"valid": True}
```

---

## 前端集成

### 分类选择器

```typescript
// frontend/components/CategorySelector.tsx

interface CategoryPath {
  domain?: string;
  framework?: string;
  concept_level?: string;
}

export function CategorySelector({ topic }: { topic: string }) {
  const [suggestedCategory, setSuggestedCategory] = useState<string>('');
  const [isValid, setIsValid] = useState(true);
  const [validationError, setValidationError] = useState<string>('');

  const handleCategoryChange = async (value: string) => {
    setSuggestedCategory(value);

    // 实时验证
    const validation = await fetch('/api/taxonomy/validate', {
      method: 'POST',
      body: JSON.stringify({ category_path: value })
    }).then(r => r.json());

    setIsValid(validation.valid);
    if (!validation.valid) {
      setValidationError(validation.reason || 'Invalid category');
    }
  };

  return (
    <div className="category-selector">
      <label>分类路径</label>
      <input
        type="text"
        value={suggestedCategory}
        onChange={(e) => handleCategoryChange(e.target.value)}
        placeholder="例如: 前端/React/Hooks"
      />

      <div className="validation-hints">
        {!isValid && (
          <div className="error-message">
            {validationError}
          </div>
        )}

        <div className="dimensions-list">
          <div className="dimension-group">
            <span className="label">领域:</span>
            {DOMAINS.map(d => (
              <span key={d} className="dimension-tag">{d}</span>
            ))}
          </div>

          <div className="dimension-group">
            <span className="label">框架:</span>
            {FRONTEND_FRAMEWORKS.map(f => (
              <span key={f} className="dimension-tag">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 总结

| 问题 | 解决方案 |
|------|---------|
| AI 分类维度不一致 | 预定义分类维度 |
| 同一主题多次分类结果不同 | 分类规则引擎 + 一致性验证 |
| 分类路径过深 | 路径深度限制 (4 层) |
| 子文档与父文档领域不一致 | 继承性验证 |

---

*分类 Schema 系统 | KnowZero 项目*
