# 打包发行前置修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 npm 打包发行前的 4 个问题——包内容完整性、隐私隔离、MCP 文档、Wiki 质量基线。

**Architecture:** 四个独立任务：扩展 npm files 白名单使包内容与开发环境一致；gitignore + README 隔离用户数据；编写 MCP 安装指南；清理 KB 噪声并统一 claims 格式。任务间无依赖，可并行。

**Tech Stack:** Node.js, Git, Markdown

## Global Constraints

- `opencode/` 和 `packages/` 必须加入 npm `files` 白名单，确保 `npm install -g` 后目录结构与本地开发环境一致（工具文件的 `../../opencode/...` 和 `../../packages/...` import 路径能正常解析）
- `kb/` 和 `vault/` 必须加入 `.gitignore`，保留 `.gitkeep` 和 `.template.md` 等骨架文件
- 不在 npm 包内包含 `.env`、`index/*.sqlite`、`tools/mcp/.venv/`、`opencode/node_modules/`（已在 gitignore）
- 所有文档改动使用中文

---

### Task 1: npm 包内容完整性 — 加入 opencode/ 和 packages/

**Files:**
- Modify: `package.json:12-23`

**Interfaces:**
- Consumes: 无
- Produces: npm `files` 白名单包含 `opencode/` 和 `packages/`，`npm pack --dry-run` 验证通过

- [ ] **Step 1: 修改 package.json 的 files 字段**

在现有 `"files"` 数组中追加 `"opencode/"` 和 `"packages/"`：

```jsonc
"files": [
  "bin/browser-code.cjs",
  "scripts/postinstall.js",
  ".browser-code/browser-code.jsonc",
  ".browser-code/tool/",
  "harness/",
  "tools/mcp/bin/",
  "wiki/",
  "opencode/",
  "packages/",
  "AGENTS.md",
  "README.md",
  "package.json"
],
```

- [ ] **Step 2: 验证 npm pack 内容**

```bash
npm pack --dry-run 2>&1
```

预期：输出列表中包含 `opencode/` 和 `packages/` 目录下的文件。

- [ ] **Step 3: 检查包体积**

```bash
npm pack --dry-run 2>&1 | wc -l
```

注意总文件数和预估体积，确认 `opencode/node_modules/` 和 `opencode/.turbo/` 被 `.gitignore` 排除后不会打入包。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "fix: add opencode/ and packages/ to npm files whitelist for import resolution"
```

---

### Task 2: 用户数据隐私隔离

**Files:**
- Modify: `.gitignore:20-22`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: `kb/` 和 `vault/` 被 gitignore（骨架文件除外），README 有隐私说明

- [ ] **Step 1: 更新 .gitignore**

在第 22 行（`opencode/.turbo/`）之后追加：

```gitignore
# user knowledge base data (runtime generated, do not track)
kb/
vault/
# keep skeleton files
!kb/**/.gitkeep
!kb/**/.template.md
!vault/**/.gitkeep
```

- [ ] **Step 2: 验证 gitignore 效果**

```bash
git status --short kb/ vault/ 2>&1
```

预期：已经 tracked 的文件会显示为 deleted（从 git 索引中移除），但磁盘文件不受影响。确认 `.gitkeep` 和 `.template.md` 仍然被跟踪。

- [ ] **Step 3: 从 git 索引移除 kb/ vault/ 内容，保留骨架**

```bash
git rm --cached -r kb/ vault/ 2>&1
git add kb/**/.gitkeep kb/**/.template.md vault/**/.gitkeep 2>&1
```

预期：kb/ 和 vault/ 下的实际数据文件从 git 跟踪中移除，仅保留 `.gitkeep` 和 `.template.md`。

- [ ] **Step 4: 在 README.md 增加隐私说明**

在 README.md 的 "Knowledge Base" 章节之后追加：

```markdown
## 隐私说明

`kb/` 和 `vault/` 目录是你在本地使用时生成的知识库数据，包含你的研究内容、文章、截图等。这些目录**不会被提交到 Git 仓库**，也不会包含在 npm 包中。

- 仓库只包含 KB 的骨架结构（`.gitkeep`、`.template.md`）
- 你的所有研究数据仅存储在你本地的 `kb/` 和 `vault/` 中
- 如需备份，请自行管理这些目录
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md
git add kb/ vault/
git commit -m "chore: exclude kb/ and vault/ user data from git tracking, add privacy notice to README"
```

---

### Task 3: MCP 安装指南

**Files:**
- Create: `wiki/SETUP.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: `wiki/SETUP.md` 覆盖全部 8 个 MCP server 的安装要求，README 链接过去

- [ ] **Step 1: 创建 wiki/SETUP.md**

```markdown
# MCP Server 安装指南

Browser Code 依赖以下 MCP Server 实现完整的 12 路搜索管线。部分 Server 开箱即用，部分需要额外配置。

## 开箱即用

### douyin-cli（抖音搜索）
- **状态：** 已内置，无需配置
- **能力：** 抖音搜索、用户信息、视频详情、评论、热榜

### chrome-devtools（浏览器自动化）
- **状态：** 需安装 Chrome/Chromium 浏览器
- **安装：** 下载安装 [Google Chrome](https://www.google.com/chrome/) 或 [Chromium](https://www.chromium.org/)
- **能力：** CDP 浏览器自动化、页面截图、网络请求拦截

### browsercode-knowledge（本地知识库）
- **状态：** 需安装 [Bun](https://bun.sh/)
- **安装：**
  ```bash
  # macOS / Linux
  curl -fsSL https://bun.sh/install | bash
  # Windows
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **能力：** 本地 FTS5 全文搜索、答案上下文构建

## 需额外配置

### bilibili-readonly（B 站只读搜索）
- **状态：** 需 Python 3.11 + 虚拟环境
- **安装：**
  ```bash
  cd tools/mcp
  python -m venv .venv
  .venv/Scripts/pip install -r adoresever-bilibili-mcp/requirements.txt
  # Windows 用 .venv\Scripts\pip
  # macOS/Linux 用 .venv/bin/pip
  ```
- **配置环境变量：** 无需（只读搜索不需要登录 cookie）
- **能力：** B 站搜索、视频信息、评论、弹幕、字幕、排行榜

### bilibili-video-info（B 站视频元数据）
- **状态：** 需配置 SESSDATA
- **配置环境变量：**
  ```bash
  export SESSDATA="你的B站SESSDATA cookie值"
  ```
  获取方式：浏览器登录 B 站 → F12 开发者工具 → Application → Cookies → 找到 `SESSDATA` 字段的值
- **能力：** 视频详细元数据（需要登录态）

### xhs-local（小红书搜索）
- **状态：** 需配置 XHS_COOKIE
- **配置环境变量：**
  ```bash
  export XHS_COOKIE="你的小红书cookie字符串"
  ```
  获取方式：浏览器登录小红书网页版 → F12 → Application → Cookies → 复制完整 cookie 字符串
- **能力：** 小红书笔记搜索、内容获取、评论

## 可选（付费 API 替代方案，默认关闭）

### socialdatax-xhs（小红书付费 API）
- **状态：** 默认禁用
- **启用：** 需 `SOCIALDATAX_API_KEY`，在 `browser-code.jsonc` 中将 `enabled` 设为 `true`

### socialdatax-douyin（抖音付费 API）
- **状态：** 默认禁用
- **启用：** 需 `SOCIALDATAX_API_KEY`，在 `browser-code.jsonc` 中将 `enabled` 设为 `true`

## 快速检查

启动 browser-code 后，查看 MCP 连接状态确认所有 Server 正常运行。
```

- [ ] **Step 2: 在 README.md 添加链接**

在 README.md 末尾追加：

```markdown
## MCP 配置

Browser Code 依赖多个 MCP Server 实现完整搜索管线。部分 Server 需要额外安装运行时或配置环境变量。

详见 [MCP Server 安装指南](wiki/SETUP.md)
```

- [ ] **Step 3: Commit**

```bash
git add wiki/SETUP.md README.md
git commit -m "docs: add MCP server setup guide and link from README"
```

---

### Task 4: LLM Wiki 质量基线

**Files:**
- Modify: `kb/claims/.template.md`
- Delete: `kb/sources/2026-06-29-bilibili-dance-kuromi.md`

**Interfaces:**
- Consumes: 无
- Produces: claims 模板强制 confidence + source_path 字段；噪声数据已清理

- [ ] **Step 1: 更新 claims 模板，增加必填字段**

修改 `kb/claims/.template.md`：

```markdown
# [Source Title]

> **source:** `kb/sources/YYYY-MM-DD-slug.md`
> **source_path:** `vault/path/to/original.md`
> **status:** `draft | reviewed | stale`
> **confidence:** `high | medium | low`
> **updated_at:** YYYY-MM-DD

## Claims

- [type] claim text — **Confidence:** high/medium/low — **Source:** specific section or quote

<!-- browsercode:managed:start -->

<!-- browsercode:managed:end -->
```

- [ ] **Step 2: 删除噪声数据**

```bash
git rm kb/sources/2026-06-29-bilibili-dance-kuromi.md
```

确认该文件无对应的 claims、topics、entities 引用。

- [ ] **Step 3: 验证现有 claims 文件结构完整性**

```bash
ls -la kb/claims/*.md 2>&1 | wc -l
ls -la kb/sources/*.md 2>&1 | wc -l
```

确认 1:1 的 sources→claims 映射没有被破坏。

- [ ] **Step 4: Commit**

```bash
git add kb/claims/.template.md
git commit -m "docs: enforce confidence and source_path in claims template, remove noise entry"
```

---

### Task 5: kb_manage 工具同步校验 claims confidence

**Files:**
- Modify: `.browser-code/tool/kb_manage.ts`

**Interfaces:**
- Consumes: Task 4 的 claims 模板定义（confidence: high|medium|low）
- Produces: `kb_manage` 的 `save_claims` action 强制验证每条 claim 必须带 confidence 和 source_ref

- [ ] **Step 1: 修改 kb_manage.ts 四个位置**

**(a) 第20行后，新增 confidence 常量：**

```typescript
const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const
type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number]
```

**(b) 修改 `SaveClaimsArgs` interface（第123-129行），claims 元素加 confidence 和 source_ref：**

```typescript
interface SaveClaimsArgs {
  source_file: string
  claims: Array<{
    type: ClaimType
    text: string
    confidence: ConfidenceLevel
    source_ref?: string
  }>
}
```

**(c) 修改 `handleSaveClaims` 函数（第213-260行），写入时包含 confidence + source_ref，缺失 confidence 则抛错：**

```typescript
function handleSaveClaims(args: SaveClaimsArgs): {
  filePath: string
  claimCount: number
  warnings: string[]
  created: boolean
} {
  const sourceName = args.source_file
    .replace(/^kb\/sources\//, "")
    .replace(/\.md$/, "")
  const sourceTitle = sourceName
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-/g, " ")

  const filename = `${sourceName}.claims.md`
  const filePath = join(CLAIMS_DIR, filename)

  const warnings: string[] = []

  if (existsSync(filePath)) {
    return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, warnings: [], created: false }
  }

  // 验证 claim type + confidence
  for (const claim of args.claims) {
    if (!CLAIM_TYPES.includes(claim.type)) {
      throw new Error(
        `无效的 claim type: "${claim.type}"。有效值：${CLAIM_TYPES.join(", ")}`,
      )
    }
    if (!CONFIDENCE_LEVELS.includes(claim.confidence)) {
      throw new Error(
        `claim 缺少有效的 confidence 字段："${claim.text.slice(0, 50)}..."。必须为 high/medium/low。`,
      )
    }
    if (!claim.source_ref) {
      warnings.push(`claim 缺少 source_ref：${claim.text.slice(0, 60)}...`)
    }
  }

  const claimLines = args.claims
    .map((c) => `- [${c.type}] ${c.text} — **Confidence:** ${c.confidence} — **Source:** ${c.source_ref || "见原文"}`)
    .join("\n")

  const content = [
    `# Claims: ${sourceTitle}`,
    "",
    "## Metadata",
    `source: [[${args.source_file.replace(/\.md$/, "")}]]`,
    `source_path: ${args.source_file}`,
    "status: active",
    `updated_at: ${isoNow()}`,
    "",
    "## Claims",
    claimLines,
  ].join("\n")

  safeWrite(filePath, content)
  return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, warnings, created: true }
}
```

**(d) 修改 tool schema 中 claims 参数定义（第590-599行），加 confidence 和 source_ref：**

将：
```typescript
claims: tool.schema
  .array(tool.schema.object({
    type: tool.schema.enum([
      "definition", "mechanism", "constraint", "comparison",
      "conclusion", "open-question", "warning", "procedure",
    ]),
    text: tool.schema.string(),
  }))
  .optional()
  .describe("(save_claims) Array of {type, text} claim objects."),
```

改为：
```typescript
claims: tool.schema
  .array(tool.schema.object({
    type: tool.schema.enum([
      "definition", "mechanism", "constraint", "comparison",
      "conclusion", "open-question", "warning", "procedure",
    ]),
    text: tool.schema.string(),
    confidence: tool.schema.enum(["high", "medium", "low"]),
    source_ref: tool.schema.string().optional(),
  }))
  .optional()
  .describe("(save_claims) Array of {type, text, confidence, source_ref?} claim objects."),
```

- [ ] **Step 2: 验证编译**

```bash
cd .browser-code && npx tsc --noEmit tool/kb_manage.ts 2>&1
```

预期：无类型错误。若项目无独立 tsconfig，通过启动 browser-code 触发 save_claims action 实测。

- [ ] **Step 3: Commit**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat: enforce confidence and source_ref validation in kb_manage save_claims"
```

---

## 完成检查

全部 5 个 Task 完成后，运行：

```bash
npm pack --dry-run 2>&1 | head -30
git status
```

确认：
1. npm 包包含 opencode/ 和 packages/
2. kb/ vault/ 用户数据不再被 git 跟踪，骨架文件保留
3. wiki/SETUP.md 可读、README 有链接
4. claims 模板有 confidence + source_path 字段
5. kb_manage save_claims 强制校验 confidence
