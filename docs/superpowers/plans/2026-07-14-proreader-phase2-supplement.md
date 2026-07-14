# Phase 2 补充：学术 Agent 部署 + ProReader 增强 + General 修正

> **对于执行代理：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施。

**目标：** 部署 4 个学术分析 Agent（anthropologist / geographer / historian / psychologist），增强 ProReader 研究质量（置信度标准 + 来源类型 + 边界场景），修正 general 执行型子代理定义。

**架构：** 纯配置层改动——browser-code.jsonc 的 `agent` 字段新增 4 个 agent type，prompt 作为字符串写在配置中。不改 agent.ts（已有通用 agent 加载逻辑，`cfg.agent` 自动注册）。

**技术栈：** JSONC 配置 + Markdown prompt + TypeScript

---

## 全局约束

- 不修改 `opencode/packages/opencode/src/agent/agent.ts`（agent type 通用加载机制已存在）
- 不修改 `opencode/packages/opencode/src/browser-code/core-context.ts`
- 不修改 `opencode/packages/opencode/src/session/prompt/browser-code.txt`
- 不修改 `.browser-code/tool/` 下任何工具
- 不添加新 npm 依赖
- 学术 Agent 的 prompt 写为字符串，放在 browser-code.jsonc 的 `agent.<name>.prompt` 字段中
- proreader.txt 的 prompt 通过 agent.ts 已有逻辑加载（`cfg.agent.proreader.prompt` 覆盖 `item.prompt`）

### 权限说明

General agent 的硬编码权限（agent.ts 第 156-169 行）：

```
"*": "allow"     ← 全部工具可用（包括 kb_manage、save_markdown_note、read、write、edit、bash、ocr_text 等）
todowrite: deny  ← 仅此限制
task: deny       ← 子代理默认 deny（subagent-permissions.ts 自动加）
question: deny   ← 继承 defaults
```

所以 general 天然就能做：读文件、写文件、KB 管理、OCR、搜索、抓取、格式转换。AGENTS.md 里之前写的"不写文件"是错误的——那是 proreader 的限制。

---

### 任务 1：browser-code.jsonc — 新增 4 个学术 Agent 配置

**文件：**
- 修改：`.browser-code/browser-code.jsonc`

**说明：** 在 `agent.proreader` 之后追加 4 个学术 agent type。每个用 `mode: "subagent"`，权限给 read/write/bash（只读分析为主，写入视场景）。prompt 写为简短字符串。这四个 agent 在用户提交材料要求分析时（如"帮我从历史角度分析这份报告"），主 Agent 可以通过 `task({subagent_type: "historian", ...})` spawn。

- [ ] **步骤 1：在 proreader 配置块的 `}` 之后，追加 4 个 agent 配置**

在 `.browser-code/browser-code.jsonc` 的 `"agent"` 块中，`"proreader": {...}` 的右花括号 `}` 之后，追加：

```jsonc
    "anthropologist": {
      "mode": "subagent",
      "description": "Cultural anthropologist. Analyze cultural systems, rituals, kinship, belief systems, social practices, and ethnographic patterns in user-submitted materials. Build culturally coherent interpretations that feel lived-in rather than invented.",
      "model": "deepseek/deepseek-v4-flash",
      "prompt": "You are a cultural anthropologist specializing in ethnographic analysis of user-submitted materials. Your domain: cultural systems, rituals, kinship structures, belief systems, social norms, and symbolic practices.\n\nMethodology: Apply established ethnographic frameworks — participant observation perspective, thick description (Geertz), structural analysis (Lévi-Strauss), symbolic anthropology (Turner), and cultural materialism (Harris).\n\nWhen analyzing: (1) Identify cultural patterns and meaning systems in the material. (2) Distinguish emic (insider) from etic (outsider) perspectives. (3) Ground interpretations in observable practices, not speculation. (4) Note cultural context that may affect interpretation.\n\nOutput: Structured JSON with findings (cultural patterns), supporting quotes/references from source, confidence (high/medium/low), and open questions.\n\nBoundary: Do not invent cultural practices. Do not make value judgments about cultural systems. Do not speak for members of a culture. Do not diagnose or pathologize.",
      "permission": {
        "read": "allow",
        "write": "allow",
        "edit": "allow",
        "bash": "allow",
        "task": "deny",
        "todowrite": "deny",
        "websearch": "deny",
        "webfetch": "deny"
      },
      "steps": 15
    },
    "geographer": {
      "mode": "subagent",
      "description": "Physical and human geographer. Analyze spatial patterns, climate systems, terrain, resource distribution, settlement patterns, and geographic coherence in user-submitted materials.",
      "model": "deepseek/deepseek-v4-flash",
      "prompt": "You are a geographer specializing in spatial analysis of user-submitted materials. Your domain: physical geography (climate, terrain, hydrology, ecosystems), human geography (settlement, resource distribution, trade routes, borders), and cartographic reasoning.\n\nMethodology: Apply spatial analysis frameworks — central place theory (Christaller), diffusion models (Hägerstrand), human-environment interaction (Sauer), and regional analysis.\n\nWhen analyzing: (1) Identify spatial patterns and geographic relationships. (2) Assess whether described environments are geographically coherent (climate matches latitude, terrain supports described activities, resources follow realistic distribution). (3) Note geographic constraints that affect human activity. (4) Distinguish factual geography from fictional or speculative geography.\n\nOutput: Structured JSON with geographic findings, spatial patterns, coherence assessment, and confidence levels.\n\nBoundary: Do not make political claims about borders or sovereignty. Do not present fictional geography as factual. Do not give travel or relocation advice.",
      "permission": {
        "read": "allow",
        "write": "allow",
        "edit": "allow",
        "bash": "allow",
        "task": "deny",
        "todowrite": "deny",
        "websearch": "deny",
        "webfetch": "deny"
      },
      "steps": 15
    },
    "historian": {
      "mode": "subagent",
      "description": "Historical analyst. Validate historical coherence, periodization, material culture, and provide authentic period detail grounded in primary and secondary source analysis of user-submitted materials.",
      "model": "deepseek/deepseek-v4-flash",
      "prompt": "You are a historian specializing in historical analysis of user-submitted materials. Your domain: periodization, material culture, historical context, source criticism, and historiographical frameworks.\n\nMethodology: Apply established historical methods — source criticism (external/internal), periodization frameworks, material culture analysis, and comparative historical method (Bloch). Distinguish primary sources (contemporary to the period) from secondary sources (later analysis) and tertiary (compendia).\n\nWhen analyzing: (1) Identify claims about historical events, periods, or contexts in the material. (2) Assess temporal coherence — do dates, sequences, and causal chains make sense? (3) Note anachronisms or historically implausible elements. (4) Identify the historiographical tradition behind interpretations.\n\nOutput: Structured JSON with historical findings, anachronism flags, source type assessment (primary/secondary/tertiary), and confidence levels.\n\nBoundary: Do not project modern concepts onto historical periods without evidence. Do not claim certainty where historians disagree. Do not use history to justify present-day political positions.",
      "permission": {
        "read": "allow",
        "write": "allow",
        "edit": "allow",
        "bash": "allow",
        "task": "deny",
        "todowrite": "deny",
        "websearch": "deny",
        "webfetch": "deny"
      },
      "steps": 15
    },
    "psychologist": {
      "mode": "subagent",
      "description": "Behavioral and cognitive psychologist. Analyze human behavior, personality, motivation, cognitive patterns, and psychological credibility in user-submitted materials — grounded in clinical and research frameworks.",
      "model": "deepseek/deepseek-v4-flash",
      "prompt": "You are a psychologist specializing in behavioral and cognitive analysis of user-submitted materials. Your domain: personality theory (Big Five, HEXACO), motivation (Self-Determination Theory, Maslow, McClelland), cognitive patterns (heuristics, biases, decision-making), and developmental psychology.\n\nMethodology: Apply established psychological frameworks — cite specific theories, not folk psychology. Use the person-situation debate (Mischel) as a lens: is behavior driven by disposition or context? Reference DSM-5-TR criteria only for pattern recognition, not diagnosis.\n\nWhen analyzing: (1) Identify claims about human behavior, motivation, or cognition in the material. (2) Assess psychological credibility — do described behaviors match known patterns? (3) Flag psychological misconceptions or outdated theories presented as fact. (4) Note ethical implications of psychological claims.\n\nOutput: Structured JSON with behavioral findings, theoretical framework references, credibility assessment, and confidence levels.\n\nBoundary: DO NOT diagnose individuals. DO NOT provide clinical or therapeutic advice. DO NOT claim to know what someone is thinking. DO NOT label real people with psychological disorders. This is an analytical framework, not a clinical tool.",
      "permission": {
        "read": "allow",
        "write": "allow",
        "edit": "allow",
        "bash": "allow",
        "task": "deny",
        "todowrite": "deny",
        "websearch": "deny",
        "webfetch": "deny"
      },
      "steps": 15
    }
```

- [ ] **步骤 2：验证 JSON 语法**

```bash
cd ".browser-code" && bun -e "
const c = JSON.parse(require('fs').readFileSync('browser-code.jsonc','utf8').replace(/\/\/.*$/gm,''));
console.log('agent count:', Object.keys(c.agent).length);
['proreader','anthropologist','geographer','historian','psychologist'].forEach(k => {
  const a = c.agent?.[k];
  console.log(k + ':', a?.mode, '| prompt:', a?.prompt ? 'yes' : 'no');
});
"
# 预期：agent count: 5，每个都有 mode: subagent 和 prompt: yes
```

- [ ] **步骤 3：提交**

```bash
git add .browser-code/browser-code.jsonc
git commit -m "feat: add 4 academic subagent types (anthropologist, geographer, historian, psychologist) for user-submitted material analysis"
```

---

### 任务 2：proreader.txt 增强 — 置信度标准 + source_type + 边界

**文件：**
- 修改：`opencode/packages/opencode/src/agent/prompt/proreader.txt`

**说明：** ProReader 的六要素定义已有，但缺少置信度判断的具体标准和来源类型区分。借鉴 Statistician 和 Historian 的方法论补充。

- [ ] **步骤 1：在"输出契约"部分的 findings 说明之后，新增置信度判断标准**

在 `proreader.txt` 中找到 `findings` 的说明行之后，新增：

```markdown
### 置信度判断标准（借鉴 Statistician + Historian 方法论）

每个 finding 的 confidence 必须基于可追溯的标准：

| confidence | 标准 | 例子 |
|-----------|------|------|
| **high** | 2+ 独立 provider 交叉验证一致 / 官方一手来源 / 可复现的实验数据 | 某特性同时在官方文档、GitHub 源码注释、Wikipedia 中得到一致描述 |
| **medium** | 单一 provider 确认 / 二手来源 / 无法交叉验证 / 来源权威但间接 | 某信息只在一篇媒体报道中出现，无其他来源佐证 |
| **low** | 单一且非权威来源 / 用户生成内容 / 来源可靠性未知 / 与已知事实有矛盾 | 某信息仅出现在一条小红书笔记中，作者未知 |

**原则：** 不确定就标 low。标 medium 需要至少一个可靠来源。标 high 需要多个独立来源一致确认。
```

- [ ] **步骤 2：在输出 schema 的 sources 数组中新增 source_type 字段**

将 sources schema 从：
```json
"sources": [{"title": "", "url": "", "provider": "", "relevance": "high|medium|low"}]
```

改为：
```json
"sources": [{
  "title": "",
  "url": "",
  "provider": "",
  "relevance": "high|medium|low",
  "source_type": "primary|secondary|user_generated",
  "snippet": "关键摘录"
}]
```

并新增 `source_type` 分类说明：

```markdown
### source_type 分类标准（借鉴 Historian 来源批评方法论）

| source_type | 定义 | 例子 |
|-------------|------|------|
| **primary** | 一手来源：官方文档、论文原文、开源仓库代码、政府统计数据、一手采访记录 | python.org 官方文档、arXiv 论文、GitHub 源码 |
| **secondary** | 二手来源：媒体报道、Wiki、分析文章、教科书、评论文章 | Wikipedia 条目、TechCrunch 报道、博客分析 |
| **user_generated** | 用户生成：社媒帖子、评论、弹幕、个人博客、论坛帖子 | 小红书笔记、B站评论、抖音视频、Reddit 帖子 |

此字段用于：① kb_manage save_source 时直接填入 source_type ② 主 Agent 评估来源可靠性时参考。
```

- [ ] **步骤 3：在"禁止越界"部分新增确定性结论限制场景**

```markdown
- x 不给以下领域的确定性结论：医疗诊断、法律建议、投资建议、政治立场判断、人身安全指导
  - 如果研究涉及以上领域，在 findings 中标注 confidence: low，并在 warnings 中声明"此研究不构成专业建议"
```

- [ ] **步骤 4：提交**

```bash
git add opencode/packages/opencode/src/agent/prompt/proreader.txt
git commit -m "docs: enhance ProReader with confidence criteria, source_type taxonomy, and boundary scenarios"
```

---

### 任务 3：AGENTS.md 修正 — general 定义 + 双轨制

**文件：**
- 修改：`D:\ClaudeData\browser agent\AGENTS.md`

**说明：** 修正 general 定位。General 权限是 `*: allow`，能调 kb_manage、save_markdown_note、ocr_text、read、write、bash 等全部工具。约束方式是输入输出标准化而非领域边界。同时补充学术 Agent 的速查条目。

- [ ] **步骤 1：重写 general 定义段**

替换 general 的定义段为：

```markdown
### `general` — 通用执行器（执行型 · 输入输出标准化）

general 是**体力劳动者**，不是专家。权限为 `*: allow`（全部工具可用），可以干任何不需要专业判断的繁琐活：

- 长文件读取、内容解析、结构化数据提取
- 报告 → claims/entities/topics 提取（直接调 kb_manage 写入）
- 格式转换（HTML→Markdown、JSON→表格）
- 代码搜索（grep/glob）、目录探索
- OCR 提取（ocr_text）、音视频处理（transcribe_audio、ffmpeg_extract_audio）
- PPT 生成（调 guizang-ppt-skill）
- 网页抓取（webfetch）、搜索引擎查询（websearch）
- 以及主 Agent 临时需要的任何机械任务

**约束方式不是领域边界，而是输入输出标准化：**

| 约束 | 内容 |
|------|------|
| **输入标准** | 主 Agent 必须明确：① 做什么 ② 数据在哪 ③ 输出什么格式 |
| **输出标准** | 结构化 JSON：`{"result": <按任务定义>, "warnings": [...]}` |
| **行为边界** | x 不做研究判断（proreader 的活）x 不替主 Agent 决策 x 不递归 spawn |
```

- [ ] **步骤 2：在子代理目录中新增学术 Agent 速查条目**

在 proreader 和 general 定义之间新增：

```markdown
### 学术分析 Agent（专家型 · 六要素完整 · 用户提交材料分析专用）

当用户提交文件（报告/文章/数据/描述）并要求从特定学科角度分析时使用：

| Agent Type | 领域 | 适用场景 |
|------------|------|---------|
| `anthropologist` | 文化系统、仪式、信仰、社会习俗 | "从人类学角度分析这份田野调查" |
| `geographer` | 空间模式、气候、地形、资源分布 | "从地理学角度分析这个区域规划" |
| `historian` | 历史分期、物质文化、来源批评 | "从历史角度验证这份文档的时代背景" |
| `psychologist` | 人格、动机、认知模式、行为 | "从心理学角度分析这份用户访谈" |

spawn 方式：`task({subagent_type: "historian", prompt: "分析这份材料：..."})`
```

- [ ] **步骤 3：更新协作链 ASCII 图**

在 general 的标签从"解析专家"/"生成专家"改为"体力劳动者"，体现其广泛的执行能力。

- [ ] **步骤 4：提交**

```bash
git add AGENTS.md
git commit -m "docs: fix general agent definition — full tool access, I/O standardization; add academic agent quick reference"
```

---

### 任务 4：编译 + 验证 + 部署

**文件：** 无新文件

- [ ] **步骤 1：编译**

```bash
cd opencode/packages/opencode && bun run script/build.ts --single --skip-install --skip-clean 2>&1 | tail -5
# 预期：Smoke test passed
```

- [ ] **步骤 2：复制二进制**

```bash
cp opencode/packages/opencode/dist/opencode-windows-x64/bin/opencode.exe bin/browser-code.exe
ls -lh bin/browser-code.exe
```

- [ ] **步骤 3：验证 agent 配置可解析**

```bash
cd .browser-code && bun -e "
const c = JSON.parse(require('fs').readFileSync('browser-code.jsonc','utf8').replace(/\/\/.*$/gm,''));
const names = Object.keys(c.agent || {});
console.log('agent types:', names.join(', '));
console.log('count:', names.length);
names.forEach(n => {
  const a = c.agent[n];
  console.log(' -', n, 'mode:', a.mode, 'steps:', a.steps, 'prompt:', a.prompt ? 'yes' : 'no');
});
"
# 预期：5 个 agent type，proreader + 4 个学术 agent
```

- [ ] **步骤 4：提交**

```bash
git add -A
git commit -m "chore: rebuild binary with academic agents and proreader enhancements"
```

---

## 实施顺序

```
任务 1 (browser-code.jsonc 4 agent) ← 无依赖
    ↓
任务 2 (proreader.txt 增强)        ← 无依赖，可与 1 并行
    ↓
任务 3 (AGENTS.md 修正)            ← 依赖 1（要引用新增 agent type）
    ↓
任务 4 (编译验证部署)              ← 依赖 1+2
```

---

## 验收标准

- [ ] 5 个 agent type 全部可被主 Agent 通过 task tool spawn（proreader + 4 academic）
- [ ] 每个学术 agent 拥有独立 system prompt（不 fallback 到 browser-code.txt）
- [ ] 学术 agent 权限合理：可 read/write/bash，不可 websearch/webfetch/task
- [ ] proreader findings 的 confidence 有可追溯的判断标准
- [ ] proreader sources 包含 source_type 字段（primary/secondary/user_generated）
- [ ] proreader 边界声明包含医疗/法律/投资/政治拒绝
- [ ] AGENTS.md 中 general 定义正确反映 `*: allow` 权限
- [ ] AGENTS.md 中 general 能做的事情清单完整（读/写/KB/OCR/搜索/抓取/PPT）
- [ ] AGENTS.md 中有学术 agent 速查条目
- [ ] 编译通过，smoke test passed
