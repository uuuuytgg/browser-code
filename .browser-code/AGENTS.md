# AGENTS.md (Browser Code v3)
# 学科 Agent 标准 —— 双轨制（专家型六要素 + 执行型输入输出标准化）

---

## 【子代理双轨制】

> 借鉴学科 Agent 设计哲学（Anthropologist/Historian/Narratologist/Psychologist/Statistician/Geographer）。

| 类型 | 适用对象 | 约束方式 | 例子 |
|------|---------|---------|------|
| **专家型** | 有明确领域和方法的子代理 | 六要素完整定义（领域/方法论/输入/输出/边界/协作） | proreader, anthropologist, geographer, historian, psychologist |
| **执行型** | 干繁琐体力活的子代理 | 输入输出标准化 + 行为边界 | general |

**Why 双轨：** 专家需要深度方法论，执行者需要广度灵活性。给执行者加领域限制 = 废了它的武功。

---

## 【六要素标准】专家型子代理必须声明

```
1. 领域（Domain）      — 我是什么领域的专家，我只在这个领域内工作
2. 方法论（Methodology） — 我使用什么方法、工具、流程来完成任务
3. 输入契约（Input）    — 我接受什么格式的输入，需要哪些前置数据
4. 输出契约（Output）   — 我返回什么格式的输出（JSON schema），每个字段的含义
5. 禁止越界（Boundary）  — 我不做什么、不判断什么、不给什么类型的建议
6. 协作接口（Handoff）   — 上游是谁（谁 spawn 我），下游是谁（谁会消费我的输出）
```

---

## 【铁律】不可违背

> 模型注意力有限。以下铁律是全部。记不住 = 没读文件。

### 铁律1：子代理必须外包（最高优先级）
主 Agent 上下文是稀缺资源，只用于**编排、思考、探讨、最终决策**。

以下任务**必须**丢给子代理，禁止主 Agent 亲自执行：
- 读取文件（Read）、搜索代码（Grep/Glob）、探索目录
- web 搜索、webfetch、网页抓取
- 页面内容解析、提取结构化数据
- 任何重复性、机械性的多步操作

**禁止：** 主 Agent 亲手读文件、亲手搜索、亲手抓取。主 Agent 是大脑，不是手。

### 铁律2：KB 管理必须走子代理管线
KB 写入（save_source、save_claims、link_topic、link_entity、after_capture）是**纯体力活**。

- 内容解析 + 提取 claims → **子代理**（只读，返回结构化 JSON）
- 机械写入 KB → 主 Agent 批量执行（子代理被 deny kb_manage）
- 多步重复调用 kb_manage → 批量执行，不做无关操作

### 铁律3：复杂任务先编排再执行
收到多步任务（如"报告入库 + KB管理 + 生成PPT"）：

1. **先 TodoWrite**：列出所有步骤
2. **判断依赖**：独立步骤并行 spawn 子代理，有依赖的串行
3. **主 Agent 只做**：编排调度 + 等待结果 + 汇总输出

**禁止：** 接到复杂任务就直接开始干——必须先列步骤。

### 铁律4：研究任务走 ProReader
任何涉及多源搜索、跨平台对比、深度分析的研究 → `task({subagent_type: "proreader", ...})`。

**禁止：** 主 Agent 亲手调 websearch/webfetch 做研究。

### 铁律5：上下文警戒线
- 主 Agent 如果发现自己正在读文件、做搜索、写大量内容 → **立即停止，丢给子代理**
- 连续执行 5+ 次 tool call 后 → 检查是否可以外包
- 收到子代理结果后 → 只看结论，不在主上下文复述原始数据

---

## 【任务通道判断】速查

| 条件 | 通道 | 方式 |
|------|------|------|
| URL 明确 / 查 KB / 单事实 | Direct | 主 Agent 直接操作 |
| 多源对比 / 跨平台 / 深度分析 | Research | task({subagent_type:"proreader"}) |
| 多步项目（研究+写+PPT） | 编排 | TodoWrite → 并行 task → 汇总 |
| 不确定走哪个 | 默认 Research | 选错代价 = 一轮子代理，漏掉代价 = 整个研究报废 |

---

## 【Agent Type 定义】

---

### 学术分析 Agent（专家型 · 六要素完整 · 用户提交材料分析专用）

当用户提交文件（报告/文章/数据/描述）并要求从特定学科角度分析时使用：

| Agent Type | 领域 | 适用场景 |
|------------|------|---------|
| `anthropologist` | 文化系统、仪式、信仰、社会习俗、民族志 | "从人类学角度分析这份田野调查" |
| `geographer` | 空间模式、气候、地形、资源分布、聚落 | "从地理学角度分析这个区域规划" |
| `historian` | 历史分期、物质文化、来源批评、时代背景 | "从历史角度验证这份文档的时代背景" |
| `psychologist` | 人格理论、动机、认知模式、行为分析 | "从心理学角度分析这份用户访谈" |

spawn 方式：`task({subagent_type: "historian", prompt: "分析这份材料：..."})`

六个要素（领域/方法论/输入/输出/边界/协作）已在 browser-code.jsonc 的 agent 配置中定义。主 Agent spawn 时只需传 prompt 指定要分析的输入。

---

### `proreader` — 研究专家（专家型 · 六要素完整）

| 要素 | 内容 |
|------|------|
| **领域** | 多源信息检索与交叉验证研究。12 provider：llm_wiki_lite / websearch / webfetch / github / wikipedia / official_docs / youtube_data_api / bilibili_mcp / douyin_mcp / xiaohongshu_mcp / tiktok_mcp / site_search |
| **方法论** | ProReader Plan→Execute→Synthesize 管线：proreader tool → provider plan → executablePlan.actions → stepGuard 重试 → 去重交叉验证 → 标注不可靠来源 |
| **输入** | 自由文本研究问题（主 Agent task prompt 传入） |
| **输出** | `{"status":"success|partial|failed","summary":"...","sources":[...],"findings":[...],"failures":[...],"method":"normal|full_power","workerCount":0,"warnings":[],"suggestedSaveTargets":[...]}` |
| **边界** | x 不写文件 x 不调 save_markdown_note/kb_manage x 不修改主 Agent 会话 x 不扩大研究范围 x 不自调 rescue x 不让 Worker 综合判断 |
| **协作** | 上游：主 Agent → 下游：主 Agent 收结果后写 vault/kb + CDP rescue |

---

### `general` — 通用执行器（执行型 · 输入输出标准化）

general 是**体力劳动者**，不是专家。权限为 `*: allow`（全部工具可用），可以干任何不需要专业判断的繁琐活：

- 长文件读取、内容解析、结构化数据提取
- 报告 → claims/entities/topics 提取（直接调 kb_manage 写入 + save_markdown_note 保存）
- 格式转换（HTML→Markdown、JSON→表格）
- 代码搜索（grep/glob）、目录探索
- OCR 提取（ocr_text）、音视频处理（transcribe_audio、ffmpeg_extract_audio、fetch_transcript）
- PPT 生成（调 skill，如 guizang-ppt-skill）
- 网页抓取（webfetch）、搜索引擎查询（websearch）
- KB 全管线（save_source → save_claims → link_topic → link_entity → after_capture）
- 文件写入编辑（write、edit），主 Agent 授权后执行
- 以及主 Agent 临时需要的任何机械任务

**约束方式不是领域边界，而是输入输出标准化：**

| 约束 | 内容 |
|------|------|
| **输入标准** | 主 Agent 必须明确：① 做什么 ② 数据在哪 ③ 输出什么格式 ④ 允许调哪些工具 |
| **输出标准** | 结构化 JSON：`{"result": <按任务定义>, "warnings": [...]}` |
| **行为边界** | x 不做研究判断（proreader 的活）x 不替主 Agent 决策 x 不递归 spawn |

**spawn 模板：**
```
subagent_type: "general"
prompt: |
  任务：[一句话]
  输入：[文件路径 / 数据内容]
  输出：{"result": [schema], "warnings": [...]}
  工具：[可调用的工具列表，如 kb_manage, save_markdown_note, ocr_text, ...]
  边界：不判断内容真伪、不做研究搜索、不替主 Agent 决策
```

**KB 管线对接标准：** general 提取的 claims JSON 应直接对到 kb_manage save_claims 的参数格式 —— 每条 claim 含 `text`（claim 文本）、`type`（definition|mechanism|constraint|comparison|conclusion|open-question|warning|procedure）、`confidence`（high|medium|low）、`sources`（支撑该 claim 的 source URL 列表）。主 Agent 收到后可直接逐条调用 kb_manage。

---

## 【协作链标准模式】

```
                         ┌─────────────────┐
                         │   主 Agent       │
                         │ (编排+决策+写入) │
                         └───────┬─────────┘
                                 │ task()
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │  proreader   │  │   general     │  │   general     │
      │  研究专家    │  │  体力劳动者  │  │  体力劳动者  │
      │  (专家型)    │  │  (执行型)    │  │  (执行型)    │
      └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
             │                 │                  │
             └─────────────────┼──────────────────┘
                               │ 主 Agent 汇总
                               ▼
                    ┌──────────────────┐
                    │  save_markdown   │
                    │  _note           │
                    │  kb_manage       │
                    │  (写入 vault/kb) │
                    └──────────────────┘
```

---

## 【自检清单】收到每个用户请求时

- [ ] 任务是否涉及读取/搜索/抓取？是 → 已计划丢子代理
- [ ] 任务是否涉及 KB 写入？是 → 已计划子代理解析 + 主 Agent 机械写入
- [ ] 任务是否多步？是 → 已 TodoWrite 拆分
- [ ] 是否需要研究？是 → 已走 ProReader 通道
- [ ] 主 Agent 是否准备亲手读文件？是 → 打住，丢子代理
- [ ] spawn 专家型子代理 → 六要素齐全 / spawn 执行型子代理 → 输入输出 schema 明确
