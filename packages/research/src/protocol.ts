import type {
  AgenticResearchDepth,
  AgenticSaveMode,
  FailureReason,
  ProReaderIntent,
  ProviderId,
} from "./index"

/**
 * ProReader 输入协议
 *
 * 定义主 Agent 调用 ProReader 时必须提供的字段。
 * 字段来自当前 proreader.ts 的 args 定义，此处为类型级标准化。
 */
export interface ProReaderTaskInput {
  query: string
  intent: ProReaderIntent
  researchDepth: AgenticResearchDepth
  providerBias: ProviderId[]
  needsCandidateReview: boolean
  saveMode: AgenticSaveMode
}

// ── 输出协议 ──

export interface ProReaderTaskOutput {
  /** 执行状态 */
  status: "success" | "partial" | "failed"
  /** 人类可读的执行摘要 */
  summary: string
  /** 生成的文件产物列表 */
  artifacts: ProReaderArtifact[]
  /** 使用的来源列表 */
  sources: ProReaderSource[]
  /** 非阻断警告 */
  warnings: string[]
  /** 未完成的步骤 */
  unfinished: ProReaderUnfinishedItem[]
  /** 建议的下一步操作 */
  suggestedNextAction: string | null
}

export interface ProReaderArtifact {
  type: "markdown" | "source" | "claim" | "topic" | "entity"
  /** vault/ 或 kb/ 下的相对路径 */
  path: string
  title: string
}

export interface ProReaderSource {
  url: string
  title: string
  provider: string
  retrieved: boolean
  failureReason?: FailureReason
}

export interface ProReaderUnfinishedItem {
  step: string
  reason: string
  recommendation: string
}

// ── 任务状态结构 ──

export interface ProReaderTaskState {
  taskId: string
  taskType: string
  goal: string
  stage: "planning" | "searching" | "fetching" | "processing" | "writing" | "complete"
  planVersion: number
  completedSteps: string[]
  pendingSteps: string[]
  artifacts: ProReaderArtifact[]
  toolFailures: Record<string, FailureReason>
  blockingError: string | null
  finalStatus: "running" | "success" | "partial" | "failed"
}

// ── 依赖边界标注（文档级常量，非运行时强制） ──

export const PROREADER_DEPENDENCIES = {
  /** OpenCode Runtime 提供的底层能力 */
  providedByOpenCode: [
    "ToolDefinition / tool() — @opencode-ai/plugin",
    "MCP tool discovery — config/mcp.tools.json → runtime-config.ts",
    "File system access — Node.js fs / path",
    "Session context management — BrowserCodeCoreContext",
    "Plugin tool auto-discovery — OpenCode plugin system",
  ],
  /** ProReader 自身包含的领域逻辑 */
  selfContained: [
    "Input dispatch — dispatchInput()",
    "Route matching — routeQuery()",
    "Provider planning — planProviders() / planProReader()",
    "Execution request building — buildProviderExecutionRequests()",
    "Executable action building — buildProviderExecutableActions()",
    "Step guard instructions — buildStepGuardInstructions()",
    "Failure classification — classifyFailure()",
    "Provider runtime diagnosis — diagnoseProviderRuntime()",
    "Tool exposure synthesis — buildDynamicToolExposure()",
  ],
} as const
