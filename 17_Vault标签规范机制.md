# 17 Vault 标签规范机制

> 用途：约束 LLM 在 `save_markdown_note` 时生成的标签体系，防止知识库因标签不一致而长期混乱。  
> 关联模块：`packages/tool-vault/`、`apps/runtime/`、`prompts/system.knowledge-agent.md`

---

## 1. 问题定义

LLM 对同一主题的内容可能生成完全不同的标签：

| 场景 | 不良示例 | 后果 |
|------|----------|------|
| 大小写不一致 | `"React"` vs `"react"` vs `"React.js"` | 搜索 `"react"` 漏掉 `"React"` |
| 同义词泛滥 | `"前端"` vs `"front-end"` vs `"Web开发"` | 标签体系膨胀，关联失效 |
| 粒度失控 | `"JavaScript"` → `"JS"` → `"ECMAScript"` | 无法建立稳定的分类体系 |
| 语言混杂 | `"AI"` vs `"人工智能"` vs `"人工智慧"` | 同一概念分裂为多个标签 |
| 数量失控 | 一次生成 15 个标签 | 索引膨胀，低价值标签稀释核心主题 |

**目标**：让标签成为知识库的"稳定分类坐标"，而不是每次保存的随机产物。

---

## 2. 核心原则

```text
1. 标签是  controlled vocabulary（受控词表），不是自由关键词。
2. LLM 优先复用已有标签，其次在严格规则下新增。
3. 所有标签经过规范化管道（normalization pipeline）才能入库。
4. 标签与 keywords 分离：标签用于分类导航，keywords 用于全文检索辅助。
```

---

## 3. 标签规范化管道（Tag Normalization Pipeline）

每次 `save_markdown_note` 执行时，标签必须经过以下管道：

```
LLM 原始输出 tags
  ↓
[Step 1] 清洗（Sanitize）
  ↓
[Step 2] 标准化（Normalize）
  ↓
[Step 3] 映射（Map）
  ↓
[Step 4] 去重与截断（Deduplicate & Truncate）
  ↓
[Step 5] 冲突消解（Resolve）
  ↓
[Step 6] 持久化（Persist）
  ↓
入库 tags
```

### 3.1 Step 1：清洗（Sanitize）

移除所有非法字符和格式：

```ts
function sanitizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()                          // 强制小写
    .replace(/[\/:*?"<>|#@!$%^&+={}\[\]]/g, "")  // 移除文件系统非法字符及特殊符号
    .replace(/\s+/g, "-")                   // 空白转为连字符
    .replace(/^-+|-+$/g, "")               // 移除首尾连字符
    .substring(0, 32);                      // 单标签最长 32 字符
}
```

**示例**：
```text
"React.js"        → "reactjs"
"前端 / 工程化"    → "前端-工程化"
"  AI  人工智能  " → "ai-人工智能"
"C++"             → "c"
"#JavaScript"     → "javascript"
```

### 3.2 Step 2：标准化（Normalize）

应用预定义规则，将变体统一：

| 规则类型 | 示例 | 标准化结果 |
|----------|------|------------|
| 技术栈别名 | `reactjs`, `react-js`, `react.js` | `react` |
| 语言统一 | `front-end`, `frontend`, `front_end` | `frontend` |
| 中英文别名 | `ai`, `artificial-intelligence` | `ai` |
| 大小写变体 | `JavaScript`, `javascript`, `Js` | `javascript` |
| 复数/单数 | `tutorials`, `tutorial` | `tutorial` |
| 无意义填充 | `2026`, `article`, `doc`, `note` | 直接丢弃 |

**标准化规则表**存储在 `vault/index/tag-rules.json`：

```json
{
  "version": 1,
  "updated_at": "2026-06-24T22:00:00+08:00",
  "rules": [
    { "type": "alias", "variants": ["reactjs", "react-js", "react.js"], "canonical": "react" },
    { "type": "alias", "variants": ["front-end", "front_end", "front_end"], "canonical": "frontend" },
    { "type": "alias", "variants": ["ai", "artificial-intelligence"], "canonical": "ai" },
    { "type": "blocklist", "patterns": ["^\d+$", "^article$", "^doc$", "^note$", "^untitled$"] }
  ]
}
```

### 3.3 Step 3：映射（Map）

检查标签是否已存在于 `vault/index/tag-vocabulary.json`（受控词表）中：

```json
{
  "version": 1,
  "tags": [
    { "tag": "react", "count": 12, "first_seen": "2026-06-20", "last_used": "2026-06-24" },
    { "tag": "javascript", "count": 45, "first_seen": "2026-06-01", "last_used": "2026-06-24" },
    { "tag": "ai", "count": 8, "first_seen": "2026-06-15", "last_used": "2026-06-23" }
  ]
}
```

- **命中**：直接使用已有标签，更新 `count` 和 `last_used`。
- **未命中**：进入 Step 4 的"新增审核"。

### 3.4 Step 4：去重与截断（Deduplicate & Truncate）

```ts
function deduplicateAndTruncate(tags: string[]): string[] {
  const unique = [...new Set(tags)];       // 去重
  return unique.slice(0, 5);              // 最多保留 5 个标签
}
```

### 3.5 Step 5：冲突消解（Resolve）

处理以下冲突场景：

**场景 A：LLM 生成了新标签，但已有高度相似标签**

```text
LLM 生成："typescript"
已有标签："typescript"（完全命中，直接使用）

LLM 生成："ts"
已有标签："typescript"
策略：alias 规则映射 "ts" → "typescript"，若规则不存在，则保留 "ts" 作为新标签
```

**场景 B：LLM 生成的标签与 content_type 重复**

```text
content_type: "article"
LLM 生成标签包含："article"
策略：丢弃（content_type 已表达此信息，不占用标签额度）
```

**场景 C：LLM 生成的标签过于宽泛**

```text
LLM 生成："technology"
策略：标记为 "too-broad"，降级到 keywords（若 keywords 也未命中具体性阈值，则丢弃）
```

### 3.6 Step 6：持久化（Persist）

- 将最终标签写入 Markdown frontmatter。
- 若包含新标签，更新 `tag-vocabulary.json`（`count: 1`, `first_seen: today`）。
- 更新 `index.json` 中对应 note 的 `tags` 字段。

---

## 4. LLM Prompt 约束（System Prompt 片段）

在 `prompts/system.knowledge-agent.md` 中，标签生成部分必须包含以下约束：

```markdown
## 标签生成规则

1. 你只能从已有标签中选择，或生成符合以下格式的新标签：
   - 小写英文字母、数字、中文汉字
   - 用连字符 "-" 连接多词（如 "machine-learning"）
   - 最长 32 字符
   - 最多 5 个标签

2. 已有标签（优先复用）：
   {{TAG_VOCABULARY}}

3. 禁止以下标签：
   - 纯数字（如 "2026"）
   - 通用词（"article", "doc", "note", "tutorial"）
   - 与 content_type 重复的词（如 content_type="video" 时禁止 "video"）
   - 过于宽泛的词（"technology", "programming", "study"）

4. 标签应反映内容的核心主题，而非形式。
   - 好："react-server-components", "rust-memory-safety", "bilibili-transcript"
   - 坏："web", "code", "interesting"

5. 中英文选择：
   - 技术概念优先用英文（"react" 而非 "反应"）
   - 中文专有概念可用中文（"鸿蒙开发", "知识库"）
   - 不要中英文混用（不要 "react-开发"）
```

**实现方式**：`context-builder.ts` 在构造 prompt 时，从 `tag-vocabulary.json` 读取前 50 个高频标签注入 `{{TAG_VOCABULARY}}` 占位符。

---

## 5. Keywords 与 Tags 的区分

| 维度 | Tags | Keywords |
|------|------|----------|
| **用途** | 分类导航、关联推荐 | 全文检索辅助、搜索增强 |
| **数量** | ≤ 5 | ≤ 10 |
| **来源** | LLM 生成 + 规范化 | LLM 提取 + 去重 |
| **约束** | 受控词表，严格规范化 | 相对自由，允许同义词 |
| **示例** | `react`, `rust`, `mcp` | `server-components`, `memory-safety`, `model-context-protocol` |

**规则**：keywords 可以包含 tags 的扩展形式，但 tags 必须是 keywords 的真子集（或交集）。

---

## 6. 标签生命周期管理

### 6.1 新增标签（Auto-approval）

新标签在满足以下条件时**自动入库**：
- 通过 Sanitize 和 Normalize
- 不在 blocklist 中
- 与已有标签的 Levenshtein 距离 > 2（避免近似重复）

### 6.2 标签合并（Manual / Batch）

当 `tag-vocabulary.json` 中出现语义重复的标签时，提供合并工具：

```ts
// packages/tool-vault/src/tag-merge.ts
async function mergeTags(source: string, target: string) {
  // 1. 更新所有 note 的 frontmatter：source → target
  // 2. 更新 index.json
  // 3. 合并 tag-vocabulary.json 的 count
  // 4. 在 tag-rules.json 中增加 alias 规则
}
```

**触发条件**：
- 用户手动执行 `rebuild-index` 时检测低频近似标签
- 或 MCP `librarian` 模式下的维护任务

### 6.3 标签废弃（Deprecation）

标签连续 90 天未被使用（`last_used` 过期），标记为 `deprecated`：
- 不再注入 LLM prompt 的 `{{TAG_VOCABULARY}}`
- 但保留在词表中，已有笔记不受影响
- 若后续重新使用，自动恢复

---

## 7. 与工具层的集成

### 7.1 save_markdown_note 中的标签处理

```ts
// packages/tool-vault/src/save-note.ts

async function saveMarkdownNote(input: SaveMarkdownNoteInput): Promise<SaveMarkdownNoteOutput> {
  // 1. 提取 LLM 提供的原始 tags
  const rawTags = input.metadata.tags ?? [];

  // 2. 运行规范化管道
  const normalizedTags = await normalizeTags(rawTags, {
    vocabularyPath: path.join(vaultDir, "index/tag-vocabulary.json"),
    rulesPath: path.join(vaultDir, "index/tag-rules.json"),
    contentType: input.content_type,
    maxTags: 5,
  });

  // 3. 更新 frontmatter
  const frontmatter = buildFrontmatter({
    ...input.metadata,
    tags: normalizedTags.canonical,
    keywords: input.metadata.keywords ?? [],
  });

  // 4. 写文件
  // ...

  // 5. 更新词表
  await updateTagVocabulary(normalizedTags.newTags, vaultDir);

  return { note_id, file_path, deduped, index_updated };
}
```

### 7.2 build_index 中的标签索引

```ts
// packages/tool-vault/src/build-index.ts

function buildNoteRecord(notePath: string, vaultDir: string): NoteRecord {
  const { data } = matter.read(notePath);
  return {
    // ...
    tags: data.tags ?? [],        // 已规范化，直接入库
    keywords: data.keywords ?? [],
    // ...
  };
}
```

### 7.3 search_vault 中的标签搜索

```ts
// packages/tool-vault/src/search-vault.ts

function scoreByTags(queryTags: string[], noteTags: string[]): number {
  const matches = queryTags.filter(qt => noteTags.includes(qt)).length;
  return matches * 4;  // 每个匹配 +4 分
}
```

由于 tags 已经规范化，搜索时可以直接用 `===` 精确匹配，不需要模糊搜索。

---

## 8. 文件清单

| 文件 | 用途 | 初始状态 |
|------|------|----------|
| `vault/index/tag-vocabulary.json` | 受控词表，记录所有标签的使用统计 | 空数组，随保存自动增长 |
| `vault/index/tag-rules.json` | 别名规则、blocklist、标准化规则 | 预置通用规则（见 3.2） |
| `docs/17_Vault标签规范机制.md` | 本文档 | 人工维护 |

---

## 9. 验收标准

```text
□ 保存 10 篇同一主题的文章，tags 中不出现大小写不一致
□ 保存 "React" 相关文章，tags 统一为 "react"，不出现 "reactjs"/"React" 等变体
□ content_type="article" 时，tags 中不含 "article"
□ 单篇笔记 tags 数量不超过 5
□ 标签搜索使用精确匹配，结果准确
□ 新标签自动进入 tag-vocabulary.json
□ 标签规范化不依赖 LLM 自律，由工具层强制执行
```

---

## 10. 演进路线

| 阶段 | 功能 | 优先级 |
|------|------|--------|
| MVP（Stage 3） | Sanitize + Normalize + 去重截断 + 基础 blocklist | P0 |
| Stage 6 | 注入已有标签到 LLM prompt，引导复用 | P1 |
| Stage 8 | tag-rules.json 别名规则 + 标签合并工具 | P2 |
| Stage 9 | 标签废弃机制 + 低频标签清理 | P3 |
| 后期 | 基于共现的标签推荐（"保存此笔记的用户也用了 X 标签"） | P4 |
```

