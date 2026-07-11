/**
 * after-capture.ts — (legacy) 一键 after-capture 体验
 *
 * 保留此入口兼容旧习惯。内部调用 enqueue.ts + process-queue.ts。
 *
 * Usage: bun run harness/after-capture.ts <vault-note-path>
 *
 * 新用户建议直接用:
 *   bun run kb:enqueue vault/articles/<note>.md
 *   bun run kb:process-queue
 */

import { execSync } from "node:child_process";

function main() {
  const args = process.argv.slice(2);
  const notePath = args[0];
  const skipClaims = args.includes("--skip-claims");

  if (!notePath || args.includes("--help")) {
    console.log(`
Usage: bun run harness/after-capture.ts <vault-note-path>

One-shot after-capture workflow. Delegates to:
  1. bun run kb:enqueue <path>
  2. bun run kb:process-queue

Legacy entry point. New scripts:
  bun run kb:enqueue <path>       — add to processing queue
  bun run kb:process-queue        — process all pending items
`);
    process.exit(0);
  }

  const projectRoot = import.meta.dir ? import.meta.dir + "/.." : process.cwd();

  // Step 1: Enqueue
  execSync(`bun run harness/enqueue.ts "${notePath}"`, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  // Step 2: Process
  execSync(`bun run harness/process-queue.ts`, {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

main();
