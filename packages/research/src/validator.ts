/**
 * Runtime Validator — 基础版
 *
 * 设计原则：
 * - 硬阻断：检查"该做的有没有做"（不是"够不够好"）
 * - 软警告：提示但不阻断
 * - 不评判质量：文章写得好不好是模型的事，Validator 不管
 */

// ── 验证结果类型 ──

export interface ValidationIssue {
  /** 错误码，如 "MISSING_REQUIRED_SOURCE" */
  code: string
  /** 人类可读的描述 */
  message: string
  /** 具体哪个文件/步骤/来源 */
  detail: string
}

export interface ValidationResult {
  /** 硬阻断问题列表。任何一条存在 → 任务未完成 */
  hardBlocks: ValidationIssue[]
  /** 软警告列表。不阻塞完成但需要报告 */
  softWarnings: ValidationIssue[]
  /** hardBlocks.length === 0 */
  passed: boolean
}

// ── 验证码常量 ──

export const VALIDATION_CODES = {
  // 硬阻断
  MISSING_REQUIRED_SOURCE: "MISSING_REQUIRED_SOURCE",
  EMPTY_PARSE_RESULT: "EMPTY_PARSE_RESULT",
  FILE_NOT_WRITTEN: "FILE_NOT_WRITTEN",
  UNRESOLVED_BLOCKING_ERROR: "UNRESOLVED_BLOCKING_ERROR",
  KB_PIPELINE_INCOMPLETE: "KB_PIPELINE_INCOMPLETE",
  // 软警告
  PARTIAL_SOURCES: "PARTIAL_SOURCES",
  OPTIONAL_STEP_SKIPPED: "OPTIONAL_STEP_SKIPPED",
  LOW_QUALITY_CONTENT: "LOW_QUALITY_CONTENT",
} as const

// ── 验证函数 ──

/**
 * 验证 KB 管线的完成状态。
 */
export function validateKbPipeline(
  pipelineResult: {
    step: number
    status: string
    errors: string[]
  },
  context?: {
    totalSources?: number
    retrievedSources?: number
    expectedOutputFiles?: string[]
    actualOutputFiles?: string[]
    blockingErrors?: string[]
  },
): ValidationResult {
  const hardBlocks: ValidationIssue[] = []
  const softWarnings: ValidationIssue[] = []

  // 硬阻断 1：KB 管线未完成
  if (pipelineResult.step < 4 || pipelineResult.status !== "done") {
    hardBlocks.push({
      code: VALIDATION_CODES.KB_PIPELINE_INCOMPLETE,
      message: `KB 管线未完成：当前步骤 ${pipelineResult.step}/4，状态 ${pipelineResult.status}`,
      detail: pipelineResult.errors.join("; ") || "未提供错误详情",
    })
  }

  // 硬阻断 2：预期的输出文件不存在
  if (context?.expectedOutputFiles && context?.actualOutputFiles) {
    const missing = context.expectedOutputFiles.filter(
      (f) => !context.actualOutputFiles!.includes(f),
    )
    for (const file of missing) {
      hardBlocks.push({
        code: VALIDATION_CODES.FILE_NOT_WRITTEN,
        message: `预期输出文件不存在: ${file}`,
        detail: `文件 ${file} 在预期列表中但未在实际输出中找到`,
      })
    }
  }

  // 硬阻断 3：未处理的阻断错误
  if (context?.blockingErrors && context.blockingErrors.length > 0) {
    for (const err of context.blockingErrors) {
      hardBlocks.push({
        code: VALIDATION_CODES.UNRESOLVED_BLOCKING_ERROR,
        message: `未处理的阻断错误: ${err}`,
        detail: err,
      })
    }
  }

  // 硬阻断 4：内容为空
  if (pipelineResult.step < 1) {
    hardBlocks.push({
      code: VALIDATION_CODES.EMPTY_PARSE_RESULT,
      message: "KB source 文件未创建（step < 1），内容解析可能返回空壳",
      detail: "process-queue 未能推进到 source_done 阶段",
    })
  }

  // 软警告 1：部分来源未获取
  if (context?.totalSources && context?.retrievedSources !== undefined) {
    if (context.retrievedSources < context.totalSources) {
      softWarnings.push({
        code: VALIDATION_CODES.PARTIAL_SOURCES,
        message: `只获取了 ${context.retrievedSources}/${context.totalSources} 个来源`,
        detail: `${context.totalSources - context.retrievedSources} 个来源未成功获取`,
      })
    }
  }

  return {
    hardBlocks,
    softWarnings,
    passed: hardBlocks.length === 0,
  }
}

/**
 * 从 process-queue 的文本输出中解析管线状态。
 */
export function parsePipelineStatus(output: string): {
  step: number
  status: string
  errors: string[]
} {
  const errors: string[] = []
  let step = 0
  let status = "unknown"

  // 解析 step
  const stepMatch = output.match(/step[:\s]*(\d)/i)
  if (stepMatch) {
    step = parseInt(stepMatch[1], 10)
  }

  // 解析状态
  if (output.includes("done") || output.includes("✅")) {
    status = "done"
  } else if (output.includes("failed") || output.includes("❌")) {
    status = "failed"
  } else if (output.includes("⏳")) {
    status = "pending"
  } else if (output.includes("source_done")) {
    status = "source_done"
    step = Math.max(step, 1)
  } else if (output.includes("claims_done")) {
    status = "claims_done"
    step = Math.max(step, 2)
  }

  // 收集错误行
  for (const line of output.split("\n")) {
    if (line.includes("❌") || line.includes("error") || line.includes("failed")) {
      errors.push(line.trim())
    }
  }

  return { step, status, errors }
}
