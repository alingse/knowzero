# new_topic 与 plan 意图识别问题分析与修改方案

## 问题概述

### 问题1：首次输入技术名词被识别为 question

**现象**：
```
用户首次输入："Redis"
LLM 路由决策：action=generate_new, mode=standard, 意图=question
实际应走：action=plan, mode=roadmap_generate
```

**根本原因**：
- 意图分类器的 LLM 提示词缺乏对**会话状态**的感知
- LLM 无法区分"询问 Redis 是什么" vs "我想学 Redis"
- 首次输入的技术名词应该理解为**学习意图(new_topic)**，而非**询问定义(question)**

**关键区别**：
| 输入 | 意图类型 | 原因 |
|------|---------|------|
| "Redis" | new_topic | 首次输入技术名词，应理解为想系统学习 |
| "Redis是什么？" | question | 明确询问定义，属于问答 |
| "你能干什么" | chitchat | 询问系统能力，属于闲聊 |

---

### 问题2：生成 roadmap 后又生成"学习路线图指南"文档

**现象**：
```
用户已有 Redis 路线图，输入："请你生成 roadmap"
结果：生成了 Redis 路线图 + 又生成了"学习路线图（Roadmap）指南"文档
```

**根本原因**：
1. planner.py 生成 roadmap 后设置 `roadmap_only = False`，导致继续生成文档
2. 用户消息"请你生成 roadmap"被错误地作为 target，而不是识别为指令
3. 缺乏判断"用户只是想要 roadmap 本身" vs "用户想基于 roadmap 学习具体知识点"

---

## 修改方案

### 核心原则

**全部通过提示词引导 LLM 识别，不使用硬编码正则 pattern。**

---

### 修改1：意图分类器 - 引入会话上下文

**文件**: `backend/app/agent/classifier.py`

#### 1.1 修改 LLM 调用，传递会话状态

```python
async def _llm_classify(self, message: str, context: dict[str, Any]) -> dict[str, Any]:
    # 从 context 获取会话状态
    has_roadmap = context.get("has_roadmap", False)
    has_documents = context.get("has_documents", False)
    is_first_input = not has_roadmap and not has_documents
    
    # 构建包含会话上下文的提示
    contextual_system_prompt = f"""用户消息：{message}

会话状态：
- 是否有学习路线图：{"是" if has_roadmap else "否"}
- 是否有历史文档：{"是" if has_documents else "否"}
- 是否为首次输入：{"是" if is_first_input else "否"}

{self._LLM_CLASSIFY_SYSTEM_PROMPT}"""
    
    resp = await self.llm.ainvoke([
        SystemMessage(content=contextual_system_prompt),
        HumanMessage(content=message),
    ])
    # ... 原有代码 ...
```

#### 1.2 优化系统提示词

在 `_LLM_CLASSIFY_SYSTEM_PROMPT` 中增加：

```markdown
你是 KnowZero 学习平台的意图分类器。根据用户消息和会话状态，返回 JSON 对象。

**重要判断规则**（按优先级）：

1. **首次输入技术名词**（关键规则）：
   - 当 "是否为首次输入"=是 时，用户输入一个技术名词（如"Redis"、"Python"、"TiDB"）
   - 如果没有问句特征（无"是什么"、"怎么用"、"如何"等），应识别为 **new_topic**
   - 如果有问句特征（如"Redis是什么？"），则识别为 **question**
   - 原理：首次抛出技术名词，通常表示想系统学习该技术

2. **闲聊识别**：
   - "你能干什么"、"你是谁"、"你好"等 → **chitchat**
   - 询问系统功能、自我介绍 → **chitchat**

3. **明确规划意图**：
   - "给我规划"、"生成路线图"、"roadmap"、"学习路线"等 → **plan**

4. **new_topic vs question 的区分**：
   - new_topic：用户想系统学习一个主题（有明确学习意图）
   - question：用户想获得某个具体问题的答案（有明确问句）

**输出字段**：
```json
{
  "intent_type": "new_topic | question | plan | chitchat | ...",
  "target": "核心主题",
  "is_likely_tech_entity": true/false,
  "user_role": "beginner | intermediate | expert",
  "context": "应用场景",
  "reasoning": "判断原因，特别说明是否触发了首次输入规则"
}
```

注意：is_likely_tech_entity 用于标记是否为技术实体/概念，帮助下游路由决策。
```

---

### 修改2：Intent Agent - 传递会话上下文

**文件**: `backend/app/agent/nodes/intent.py`

```python
async def intent_agent_node(state: AgentState) -> AgentState:
    # ... 原有代码 ...
    
    classifier = get_classifier(llm=get_fast_llm())
    
    # 构建包含会话状态的上下文
    context = {
        "use_llm": True,
        "has_roadmap": state.get("current_roadmap") is not None,
        "has_documents": bool(state.get("recent_docs")),
    }
    
    if source == "chat":
        intent = await classifier.classify(message, context)  # 传递上下文
        intent["complexity"] = _estimate_complexity(message)
        intent["ambiguity"] = _estimate_ambiguity(message)
    # ... 其他分支 ...
```

---

### 修改3：Route Agent - 扩展首次输入覆盖逻辑

**文件**: `backend/app/agent/nodes/route.py`

修改覆盖逻辑（约 128-142 行）：

```python
# ========== Override: First input must generate roadmap ==========
# 判断是否为首次输入（无路线图且无文档）
is_first_input = not current_roadmap and not state.get("recent_docs")

if is_first_input:
    target = intent.get("target", "")
    user_message = state.get("raw_message", "")
    is_likely_tech = intent.get("is_likely_tech_entity", False)
    
    # 首次输入时，无论是 new_topic 还是 question，只要是技术实体，都走 plan
    if intent_type in ("new_topic", "question") and is_likely_tech:
        logger.info(
            "Overriding to plan: first input with tech entity",
            intent_type=intent_type,
            target=target,
        )
        llm_decision["action"] = "plan"
        llm_decision["mode"] = "roadmap_generate"
        llm_decision["target"] = target or user_message
        llm_decision["reasoning"] = f"首次输入技术概念'{target or user_message}'，自动生成学习路线图"
```

---

### 修改4：Planner Agent - 识别"仅生成 roadmap"意图

**文件**: `backend/app/agent/nodes/planner.py`

#### 4.1 增加判断函数

```python
def _is_roadmap_only_request(state: AgentState) -> bool:
    """判断用户是否只是要求生成 roadmap，而不是学习 roadmap 概念"""
    intent = state.get("intent") or {}
    intent_type = intent.get("intent_type", "")
    user_message = state.get("raw_message", "")
    
    # 明确规划意图
    if intent_type == "plan":
        return True
    
    # 消息中包含 roadmap 相关指令词
    roadmap_keywords = ["roadmap", "路线图", "学习路线", "给我规划", "制定计划", "生成路线"]
    if any(kw in user_message.lower() for kw in roadmap_keywords):
        return True
    
    return False
```

#### 4.2 修改 planner_agent_node

```python
async def planner_agent_node(state: AgentState) -> AgentState:
    # ... 原有代码获取 target, mode, current_roadmap ...
    
    # 判断是否为仅生成 roadmap 的请求
    is_roadmap_only = _is_roadmap_only_request(state)
    
    # 生成 roadmap
    if mode == "roadmap_modify" and current_roadmap:
        result = await _modify_roadmap(state, user_level)
        state["roadmap"] = cast(dict[str, Any], result.get("roadmap"))
        state["roadmap_only"] = True  # 修改 roadmap 后也不生成文档
        state["roadmap_modified"] = True
        return state
    
    # 生成新 roadmap
    result = await _generate_roadmap(state, target, user_level)
    state["roadmap"] = cast(dict[str, Any], result.get("roadmap"))
    
    # 关键：如果用户明确要求 roadmap，则不继续生成文档
    state["roadmap_only"] = is_roadmap_only
    state["roadmap_modified"] = False
    
    return state
```

---

### 修改5：优化 Target 提取

**文件**: `backend/app/agent/nodes/planner.py`

```python
def _resolve_learning_target(state: AgentState) -> str:
    """解析真正的学习主题，过滤掉指令词"""
    intent = state.get("intent") or {}
    decision = state.get("routing_decision") or {}
    current_roadmap = state.get("current_roadmap")
    user_message = state.get("raw_message", "")
    
    # 1. 优先使用决策中的 target
    target = decision.get("target") or intent.get("target", "")
    
    # 2. 如果 target 包含 roadmap 相关指令词，尝试从其他来源提取
    instruction_keywords = ["roadmap", "路线图", "学习路线", "规划", "计划", "给我生成", "请你生成", "制定"]
    is_instruction_like = any(kw in target.lower() for kw in instruction_keywords)
    
    if is_instruction_like:
        # 优先使用当前路线图的 goal
        if current_roadmap:
            return current_roadmap.get("goal", "学习规划")
        
        # 从用户消息中过滤掉指令词后提取
        cleaned = user_message
        for kw in instruction_keywords:
            cleaned = cleaned.lower().replace(kw.lower(), "")
        cleaned = cleaned.strip(" ，。？！,.?!")
        if cleaned and len(cleaned) > 1:
            return cleaned
    
    return target or "学习规划"
```

在 `_generate_roadmap` 中使用：

```python
async def _generate_roadmap(state: AgentState, target: str, user_level: str) -> dict[str, object]:
    # 使用清理后的 target
    resolved_target = _resolve_learning_target(state)
    if resolved_target != target and resolved_target != "学习规划":
        logger.info("Resolved target cleaned", original=target, resolved=resolved_target)
        target = resolved_target
    
    # ... 原有代码 ...
```

---

## 预期效果

### 场景1：首次输入技术名词

```
用户输入："Redis"

处理流程：
1. intent_agent: is_first_input=是, is_likely_tech_entity=true → intent_type=new_topic
2. route_agent: 触发首次输入覆盖 → action=plan, mode=roadmap_generate
3. planner_agent: 生成 Redis 学习路线图, roadmap_only=true
4. 结束，不生成额外文档

结果：✅ 正确生成 Redis 学习路线图
```

### 场景2：已有路线图，用户要求重新生成

```
当前状态：已有 Redis 路线图
用户输入："请你生成 roadmap"

处理流程：
1. intent_agent: intent_type=plan（匹配关键词"roadmap"）
2. route_agent: action=plan, mode=roadmap_generate
3. planner_agent: is_roadmap_only_request=true → roadmap_only=true
4. 结束，不生成额外文档

结果：✅ 仅更新/重新生成 Redis 路线图，不生成"学习路线图指南"文档
```

### 场景3：用户想学习 roadmap 概念本身

```
用户输入："什么是roadmap？" 或 "给我解释一下学习路线图"

处理流程：
1. intent_agent: intent_type=question（有问句特征）
2. route_agent: action=generate_new, mode=standard
3. content_agent: 生成关于"学习路线图概念"的文档

结果：✅ 生成学习路线图概念解释文档（这是正确的）
```

---

## 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `backend/app/agent/classifier.py` | 修改 | 传递会话上下文，优化提示词 |
| `backend/app/agent/nodes/intent.py` | 修改 | 构建并传递会话状态 |
| `backend/app/agent/nodes/route.py` | 修改 | 扩展首次输入覆盖逻辑 |
| `backend/app/agent/nodes/planner.py` | 修改 | 增加 roadmap_only 判断和 target 清理 |

---

## 注意事项

1. **测试重点**：
   - 首次输入各种技术名词（Redis, Python, TiDB, Kubernetes 等）
   - 已有路线图后输入"生成 roadmap"类指令
   - 问句形式的技术询问（"Redis是什么？" vs "Redis"）

2. **回滚方案**：
   - 所有修改都是增量式，不影响原有逻辑
   - 如出现问题，可通过注释掉覆盖逻辑快速回滚
