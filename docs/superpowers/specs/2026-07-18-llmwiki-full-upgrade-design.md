# LLM Wiki 完全体设计（渐进增强方案）

日期：2026-07-18
状态：已与用户逐节确认
前置审计：本会话 LLM Wiki 质量审计（prototype 级 → 完全体）

## 总目标

把 Browser Code 的 LLM Wiki 从"Lite 原型"升级为**自我演化的知识系统**：数据质量受控 → 关系可查询 → 语义可检索 → LLM 反哺闭环。类比大模型训练循环：数据回流 → 质量过滤 → 合成新知识 → 反哺下一轮检索。

**不变的哲学**：Markdown 是唯一源真相（Obsidian 兼容），SQLite 只是可重建的索引/投影。这是 Wiki，不是数据库。

**方案选型**：渐进增强（方案 A）。否决了图谱重构（推倒 Markdown 底座，不再是 Wiki）和纯 Agent 策展（无结构支撑，上下文成本高）。

---

## Phase 1：数据大扫除 + Schema 统一

### 1.1 Claims 统一格式

每条 claim 一行，五要素：

```markdown
- [type] claim 文本 — **Confidence:** high|medium|low — **Source:** 具体出处 — **C001**
```

- type：现有 8 枚举（definition/mechanism/constraint/comparison/conclusion/open-question/warning/procedure）
- **唯一 ID**：`C` 前缀 + 文件内递增序号。后续建链/合成/推演的锚点。
- confidence 必填；source_ref 必填（可标 `待补`）

### 1.2 大扫除脚本（一次性）

扫全部 17 个 claims 文件：
- 无 confidence → 默认 `medium` + 注"自动标注，待审核"
- 无 source_ref → 标 `待补`
- 无 ID → 按文件内顺序分配
- 同 source 下 text 相似度 > 80%（字符 3-gram Jaccard，实施时可校准阈值）→ 合并（保留信息量大的表述）
- 输出清理报告（合并清单 + 标注清单）

### 1.3 source_path 修正

claims 文件的 source_path 统一指向 vault/ 原始文件（不是 kb/sources/）。

### 1.4 实体补齐

- 补描述：DeepSeek、Qwen、MKBHD（现为一句话 stub）
- 新增：Google-DeepMind、Huawei、OpenCode（topic 有引用但无实体）

### 1.5 噪声处理

无 claims 价值的 source 标 `status: low_value`（检索降权），不删除。

### 1.6 kb_manage save_claims 强校验

- type 枚举检查（已有）
- confidence 必填（已有）
- source_ref 缺失 → 警告（已有）
- **新增**：ID 自动分配（从文件内已有最大 ID 续排）
- **新增**：同 source 下 text 完全重复 → 拒绝写入

---

## Phase 2：图谱化

### 2.1 links 表（harness/db.ts）

```sql
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,      -- kb/topics/world-model.md
  source_type TEXT NOT NULL,      -- topic | entity | claim | source
  target_path TEXT NOT NULL,
  target_type TEXT NOT NULL,
  link_kind TEXT DEFAULT 'ref',   -- ref | conflict | merged_into
  link_context TEXT,              -- 引用所在行文本
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_path, target_path, link_kind)
);
CREATE INDEX idx_links_target ON links(target_path);
CREATE INDEX idx_links_source ON links(source_path);
```

### 2.2 链接同步（build_index.ts 增量）

扫描 kb/ 全部 .md，parse `[[wikilink]]` → 写 links 表。只处理 mtime 变化的文件。Markdown 中的 wikilinks 原样保留——links 表是投影。

### 2.3 kb_manage 新增 4 个 action

| action | 输入 | 输出 |
|--------|------|------|
| `backlinks` | 文件路径 | 引用它的文件列表 + 上下文 |
| `outlinks` | 文件路径 | 它引用的文件列表 |
| `orphans` | （无） | 无任何 backlink 的 claims/topics/entities（死知识） |
| `conflicts` | topic 路径（可选） | 潜在矛盾 claim 对 |

### 2.4 矛盾标记

同 topic 下：同 type 且 confidence 相左（high vs low），或关键词对撞（"成立/不成立"模式）→ links 表插 `link_kind: conflict` 记录。

---

## Phase 3：语义搜索

### 3.1 架构：FTS5 + 向量混合，RRF 融合

```
查询 → ┬─ FTS5 关键词 top20 ─┬─ RRF(1/(k+rank)) → top N
       └─ 向量 KNN top20 ────┘
```

### 3.2 Embedding

- API：DeepSeek embeddings（用户已有 key，自用无外发顾虑）
- 范围：只 embed claim text（短文本，控制调用量），批量请求
- 存储：sqlite-vec 虚拟表

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS claim_embeddings USING vec0(
  claim_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  embedding float[768]            -- 维度以 DeepSeek embeddings API 实际返回为准，建表前探测一次
);
```

### 3.3 管线改造

- save_claims：入库时批量生成 embedding 写表
- search.ts：加 `--semantic` / `--hybrid` 模式
- kb_manage search action：加 `mode: "semantic" | "keyword" | "hybrid"`（默认 hybrid）

### 3.4 语义去重

入库时 cosine similarity > 0.92 → warning："与 C00X 高度相似，是否合并？"（不强制拒绝）

---

## Phase 4：LLM 反哺（完全体）

### 4.1 合成引擎（Synthesizer）

- 触发：kb_manage `synthesize` action（对某 topic）
- 流程：取 topic 全部 claims → spawn general 子代理（明确输出 schema）→ 合并建议
- 写入：合成 claim 标 `— **Source:** synthesized from [C003][C007] — *synthesized*`
- 原 claims 不删，标 `status: merged → C018`（可追溯可回退）

### 4.2 推演引擎（Predictor）

- 触发：kb_manage `speculate` action（对某 topic）
- 流程：claims + entities + backlinks → spawn 子代理推理 → 趋势/开放问题/推测
- 边界（硬规则）：
  - type 只允许 `open-question` / `conclusion`
  - **confidence 强制 `low`**
  - 写入 topic 页独立 managed block「LLM 推演」，不与事实 claims 混排
  - source_type 标 `llm_speculated`

### 4.3 策展门槛（Curator）

- after_capture 时评分：claims 数量、类型多样性、topic 关联度
- 低分 → 标 `status: low_value` 降权（不拒绝）
- 新鲜度：build_index 扫描时，90 天未更新且无新 backlink 的 topic 自动标 `stale`

### 4.4 检索隔离

合成/推演产物永远可过滤：search 支持 `--facts-only`（排除 synthesized/speculated）。

---

## 工具层同步（每 Phase 交付时同步，防"孤儿能力"）

| Wiki 能力 | 工具同步 |
|-----------|---------|
| Phase 1 | kb_manage save_claims 强校验 + ID 自动分配 |
| Phase 2 | kb_manage +4 action（backlinks/outlinks/orphans/conflicts） |
| Phase 3 | kb_manage search 加 mode 参数；search_vault 同步；save_claims 自动 embedding |
| Phase 4 | kb_manage +2 action（synthesize/speculate） |
| 政策文档 | CLAIM_POLICY 加合成规则；RETRIEVAL_POLICY 加语义优先级；WIKI_MANAGER 加反哺边界 |
| 提示词 | browser-code.txt KB 段落 + AGENTS.md 铁律3 更新（新 action 的使用时机）→ 需重编译 |
| ProReader | proreader.txt 的 llm_wiki_lite provider 描述加语义搜索 |

---

## 触发与稳定性模型（无守护进程、无在线要求）

| 级别 | 内容 | 触发 |
|------|------|------|
| 1 入库内联 | 校验/ID/去重检测/embedding/策展评分 | after_capture 管线内同步执行 |
| 2 惰性维护 | links 同步/stale 扫描/孤岛检测 | 每次 build_index 运行时增量补齐（秒级） |
| 3 昂贵操作 | synthesize/speculate | agent 依据 topic_stats 建议，用户拍板 |

- 所有状态在 SQLite（含 `topic_stats`：每 topic 上次合成时间 + 新增 claims 计数）
- 全部幂等 + 状态落盘（复用现有 processing_queue FSM 已验证模式）
- 离线任意久 → 下次使用时一次性补齐，没有"错过的定时器"
- 可选：`bun run kb:maintain` 一键跑全部积压维护（不依赖）

---

## 实施顺序与依赖

```
Phase 1（无依赖）→ Phase 2（依赖 P1 的 claim ID）→ Phase 3（独立于 P2，依赖 P1）
                                     └────────┬──────────┘
                                              ▼
                                    Phase 4（依赖 P1+P2+P3）
```

每 Phase 独立交付独立验证。P2 与 P3 可并行。

## 验收标准

- P1：全部 claims 格式统一有 ID；kb_manage 拒绝坏格式；清理报告产出
- P2：backlinks/orphans/conflicts 查询返回正确结构化结果
- P3：语义查询"推理加速"能召回 speculative decoding claims；入库自动 embedding
- P4：synthesize 产出带溯源标记的合成 claim；speculate 产物强制 low confidence 且物理隔离；--facts-only 过滤有效
