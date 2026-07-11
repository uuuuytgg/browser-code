---
title: "ProReader 改进方案：从 Claude IR Harness 借鉴的设计模式"
source_url: "https://github.com/asgeirtj/system_prompts_leaks"
date: 2026-07-03
tags: [proreader, claude, information-retrieval, architecture, design-pattern, research]
---

# ProReader 改进方案：从 Claude IR Harness 借鉴的设计模式

## 背景

对比分析 Claude 泄露的系统 prompt 中的 IR Harness（信息检索架构）与当前 ProReader 实现，梳理出 11 项可借鉴的改进方向。

---

## 1. 信息变化率感知的查询分级（最高优先级）

### Claude 的做法

Claude 将查询按**信息变化速度**分为 5 级决策树：

```
IF 信息数年不变（历史/编程/科学原理）
   → <never_search_category> 永不搜索，直接回答

ELSE IF 年更或更慢（排名/统计/年度趋势）
   → <do_not_search_but_offer_category> 直接回答+提供搜索选项

ELSE IF 日/周/月更新（天气/股票/体育/新闻）
   → <single_search_category> 直接搜索1次

ELSE IF 需要多源对比/验证/综合（研究型问题）
   → <research_category> 2-20次工具调用

ELSE IF 极复杂任务（多小时的深度分析/学术级）
   → 建议用户使用 Advanced Research（外部工具）
```

### ProReader 现状

当前的 `routeQuery()` 使用静态 regex 匹配 intent（`local_wiki_question`、`code_tooling_question` 等），但**所有匹配到的 intent 都走相同的 provider 列表**，没有动态复杂度缩放。

### 改进建议

```typescript
export type QueryComplexity =
  | "never_search"           // 直接回答，永不搜索
  | "offer_search"           // 直接回答 + 提供搜索选项
  | "single_search"          // 搜 1 次，直接执行
  | "multi_source_research"  // 2-5 次，多源对比
  | "deep_research";         // 5-20 次，迭代研究

export function classifyQueryComplexity(query: string): QueryComplexity {
  // 基于以下特征判断：
  // - 查询中是否有时间敏感词（"最新""今天""2025"）
  // - 是否需要多源验证（"对比""比较""分析"）
  // - 是否涉及实时数据（"天气""股票""比分"）
  // - 是否涉及稳定知识（"是什么""定义""原理"）
  // - 查询长度和具体程度
}
```

关键点：**不要所有搜索请求都无差别执行**。对 stable 知识直接回答，对 yearly 知识回答+提供选项，对实时数据立刻搜索。

---

## 2. 研究循环迭代（Research Loop）

### Claude 的做法

```text
① 规划 & 工具选择
② 研究循环：
   搜索 → 评估结果质量 → 优化下一查询 → 再搜索
   （最少 5 次，复杂问题可达 20 次）
③ 到达 15 次左右 → 停止并构建答案
```

### ProReader 现状

`planProReader()` 产生一个**静态的 provider plan**（steps 数组），执行完毕后就直接进入 answer/discovery 阶段。没有**根据搜索结果迭代调整**的能力。

### 改进建议

在 ProviderPlan 中增加循环标记和条件分支：

```typescript
export type ProviderStep =
  | { kind: "search"; provider: ProviderId; query: string; ... }
  | { kind: "loop_start"; maxIterations: 5; refinementKey: string }
  | { kind: "evaluate"; criteria: string[]; onInsufficient: string /* goto */ }
  | { kind: "loop_end" }
  | { kind: "fetch"; url: string; ... };
```

或者更轻量的方案：为 Research category 增加一个 `research_depth` 信号，让 agent runtime 在每次搜索后自动评估并决定是否继续 `search → evaluate → refine` 循环。

---

## 3. Offer-Before-Search 模式

### Claude 的做法

```text
IF 不确定是否需要搜索 → 先直接回答，再 OFFER 搜索
IF 确定需要（实时数据/内部信息） → 立刻搜索
```

### ProReader 现状

ProReader 被调用时**总是生成搜索计划**。没有"先回答再询问"的模式。

### 改进建议

在 routeQuery 中新增模式 `"offer_search"`（区别于 `"answer"` 和 `"discovery_ingest"`）：

```typescript
export type QueryRoute = {
  intent: QueryIntent;
  mode: "answer" | "offer_search" | "discovery_ingest";
  // ...
};
```

当复杂度判定为 `offer_search` 时，ProReader 返回**建议而非计划**：
- 输出中先给出不搜索的答案
- 再附上一句："需要我搜索一下最新的信息吗？"

---

## 4. 查询改写策略（Query Refinement）

### Claude 的做法

```text
- 搜索词保持 1-6 词为佳
- 结果不够时改写查询获取新结果
- 绝不重复相似的搜索查询（不会产生新信息）
- 使用当前日期/年份做时间相关搜索
- 不用 '-' 和 'site:' 引号除非用户明确要求
```

### ProReader 现状

`planProviders()` 和 `planPlatformSearchSteps()` 将用户原始查询原封不动传给所有 provider。没有查询改写层。

### 改进建议

```typescript
export function buildSearchQueries(query: string, complexity: QueryComplexity): string[] {
  const queries: string[] = [query]; // 原始查询

  if (complexity === "multi_source_research" || complexity === "deep_research") {
    // 生成多个角度
    queries.push(extractKeywords(query));           // 精简关键词
    queries.push(buildBroaderQuery(query));          // 广度扩展
    queries.push(buildTimeAwareQuery(query));        // 时间感知
  }

  return queries;
}
```

---

## 5. 搜索结果质量评估

### Claude 的做法

```text
- 评估搜索结果质量 → 决定下一步行动
- 如果初始结果不够 → 改写查询获取新结果
- 如果某来源不够 → 告知用户并提供其他来源
- 始终追求最高质量的原始来源（公司博客、论文、政府网站）
```

### ProReader 现状

搜索结果是原样返回的，没有质量评估步骤。Discovery 有 risk scan 但没有 quality evaluation。

### 改进建议

在 ProviderPlan 中增加 `evaluation_criteria` 字段：

```typescript
export type ProviderPlan = {
  mode: "answer" | "discovery_ingest";
  steps: ProviderStep[];
  evaluation?: {
    criteria: ("sufficient_coverage" | "source_authority" | "recency")[];
    minResults: number;
    onInsufficient: "offer_more" | "iterate" | "fallback";
  };
};
```

---

## 6. 搜索行为核心原则（Core Search Behaviors）

### Claude 的做法

```xml
<core_search_behaviors>
1. 避免不必要的工具调用
2. 不确定时先回答再提供选项
3. 工具调用数量与查询复杂度匹配
4. 使用最适合查询的工具
</core_search_behaviors>
```

### ProReader 现状

ProReader 的 tool 描述中有 instructions，但没有结构化的搜索行为原则。

### 改进建议

在 ProReader 的输出结构中增加 `search_principles` 字段，让 agent 在读取 plan 时能获取行为指导：

```typescript
export type ExecutablePlan = {
  actions: ExecutableAction[];
  notes: string[];
  searchPrinciples?: string[]; // 行为指导
};
```

---

## 7. 引用框架（Citation System）

### Claude 的做法

```xml
<antml:cite index="DOC_INDEX-SENTENCE_INDEX">...</antml:cite>
```

- 每个基于搜索结果的声明必须有引用
- 支持单句引用（`0-3`）、连续区间（`0-2:5`）、多区间（`0-2:5,0-8:10`）
- 最低限度引用，不增加多余的引用

### ProReader 现状

没有任何引用机制。搜索结果在 answer_context 中被混合使用，无法追溯来源。

### 改进建议

```typescript
export type CitationSpan = {
  documentIndex: number;
  startSentence: number;
  endSentence?: number;
};

export type CitedClaim = {
  text: string;
  sources: CitationSpan[];
};

export type AnswerContextSection = {
  title: string;
  provider: ProviderId;
  content: string;
  citations: CitedClaim[];
  sourceRefs: string[];
};
```

---

## 8. 版权和内容安全护栏

### Claude 的做法

```xml
<mandatory_copyright_requirements>
- 每次搜索结果最多引用 1 句、<20 字的短引用
- 禁止重现任何超过 30 字的摘要
- 禁止复制歌词
</mandatory_copyright_requirements>

<harmful_content_safety>
- 不搜索极端/仇恨内容
- 不帮助定位有害来源
</harmful_content_safety>
```

### ProReader 现状

没有任何内容安全策略。搜索结果可以被完整拷贝到 answer_context 中。

### 改进建议

```typescript
export type ContentSafetyPolicy = {
  maxQuoteLength: number;      // 20
  maxQuoteCount: number;       // 1 per source
  blockCopyPaste: boolean;     // true
  harmfulContentFilter: boolean;
};
```

---

## 9. 搜索示例（Few-shot Search Examples）

### Claude 的做法

Claude 的系统 prompt 中包含 10+ 个精心设计的搜索示例，覆盖各种场景：

| 场景 | 示例 |
|------|------|
| 不需要搜索 | "headache remedies" → 直接回答 |
| 已知人物 | "Dario Amodei" → 回答+提供搜索 |
| 稳定知识 | "Tokyo population" → 回答+提供搜索 |
| 无需搜索但复杂 | "pandas latest version" → 回答+提供搜索 |
| 内部文件 | "Q3 sales presentation" → 立刻搜索 Drive |
| 拒绝搜索 | "Let It Go lyrics" → 拒绝但提供替代 |
| 版权合规 | "fisheries article paragraphs" → 只引1句 |
| 复杂研究 | "investment strategy semiconductors" → 10+次调用 |

### ProReader 现状

没有任何示例。用户在调用时不清楚应该提供多详细的信息。

### 改进建议

在 ProReader 的 tool 描述或 output 中增加示例文档。让 agent 能参考这些示例来判断：

- 什么场景该调用 ProReader
- 什么场景不该调用
- 调用时应该如何描述需求

---

## 10. 位置感知和个性化

### Claude 的做法

```text
- 使用 {{userLocation}} 使结果更个性化
- 如果查询依赖位置（"今天天气"、"附近好去处"），直接使用用户位置
- 不直接说"基于你的位置"（避免突兀感）
```

### ProReader 现状

没有任何位置感知能力。

### 改进建议

```typescript
export type ProReaderRequest = {
  query: string;
  requestedMode?: "answer" | "discovery_ingest";
  location?: { city: string; country: string; timezone: string };
};

export function buildLocationAwareQuery(query: string, location?: Location): string {
  if (!location) return query;
  // 如果查询是位置依赖的，自动附加位置信息
  if (isLocationDependent(query)) {
    return `${query} ${location.city}`;
  }
  return query;
}
```

---

## 11. 历史会话感知（Past Chats Integration）

### Claude Fable 5 的做法

```xml
<past_chats_tools>
- conversation_search：按主题关键词搜索历史对话
- recent_chats：按时间窗口搜索历史对话

识别信号：
- 无上下文的物主代词（"我的论文"、"我们的方案"）
- 定冠词假定共享引用（"那个脚本"、"那个策略"）
- 过去时动词（"你推荐的"、"我们决定的"）
- 直接询问（"还记得吗"、"继续上次未完的"）
</past_chats_tools>
```

### ProReader 现状

ProReader 不感知当前会话上下文。`llm_wiki_lite` 只能查结构化知识库，不能查历史对话。

### 改进建议

在 ProReader 的 request 中增加当前会话摘要和历史搜索上下文：

```typescript
export type ProReaderRequest = {
  query: string;
  requestedMode?: "answer" | "discovery_ingest";
  sessionContext?: {
    previousQueries: string[];
    previousSearchResults: { query: string; found: boolean }[];
  };
};
```

---

## 对比总结

### ProReader 已经做对的地方（无需改变）

| 特性 | 说明 |
|------|------|
| 多 provider 覆盖 | 14 个 provider，覆盖面广 |
| Provider fallback 链 | 主方案失败后自动降级 |
| 人类审核门控 | discovery → review → enrichment |
| 运行时 readiness 检测 | 执行前检查环境就绪度 |
| 副作用边界 | 明确禁止从 discovery 写 vault |
| Clean architecture | router → planner → executor → answer/discovery → vault |

### 最值得优先实施的 5 项改进

| 优先级 | 改进 | 预期收益 |
|--------|------|---------|
| P0 | 查询复杂度分级 + offer-before-search | 减少不必要的搜索，提升响应速度 |
| P1 | 研究循环迭代 | 从 one-shot plan 升级为 iteractive research |
| P2 | 查询改写策略 | 搜索质量提升 2-5x |
| P3 | 搜索结果质量评估 | 自动识别"不够，需要再搜" |
| P4 | 引用框架 | 来源可追溯，answer 可信度提升 |
