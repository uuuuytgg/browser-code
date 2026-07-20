/**
 * install-hooks.ts — 安装 git hooks 配置
 *
 * 设置 core.hooksPath = .githooks，使 post-commit 钩子生效。
 *
 * Usage: bun run harness/install-hooks.ts
 *
 * 原理：
 *   Git 默认在 .git/hooks/ 查找钩子，该目录不受版本控制。
 *   通过 core.hooksPath 将钩子目录指向 .githooks/（受版本控制），
 *   所有 clone 后运行一次此脚本即可。
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = process.env.BROWSER_CODE_DATA_DIR
  ? resolve(process.env.BROWSER_CODE_DATA_DIR)
  : resolve(import.meta.dir, "..");
const HOOKS_DIR = resolve(PROJECT_ROOT, ".githooks");
const POST_COMMIT = resolve(HOOKS_DIR, "post-commit");

function main() {
  console.log("\n🔧 安装 git hooks...\n");

  // 检查 hooks 文件是否存在
  if (!existsSync(POST_COMMIT)) {
    console.error(`❌ 钩子文件不存在: ${POST_COMMIT}`);
    console.error("   请确认 .githooks/post-commit 已创建");
    process.exit(1);
  }

  // 确保钩子脚本有执行权限（Windows 上 Git Bash 需要）
  try {
    execSync(`chmod +x "${POST_COMMIT}"`, { cwd: PROJECT_ROOT });
  } catch {
    // Windows 上 chmod 可能不存在或失败，忽略
  }

  // 设置 core.hooksPath
  try {
    execSync(`git config core.hooksPath .githooks`, { cwd: PROJECT_ROOT });
    console.log("✅ 已设置 core.hooksPath = .githooks");
  } catch {
    console.error("❌ 设置 git config 失败");
    console.error("   请确认当前目录在 git 仓库内");
    process.exit(1);
  }

  // 验证
  try {
    const current = execSync(`git config core.hooksPath`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();
    console.log(`   当前值: ${current}`);
  } catch {
    // ignore
  }

  console.log("\n✅ Git hooks 安装完成");
  console.log("   每次 git commit 后，post-commit 钩子会自动：");
  console.log("   1. 检测 vault/ 下新增/修改的 .md 文件");
  console.log("   2. 调用 enqueue.ts 加入处理队列");
  console.log("   3. 提示运行 process-queue.ts");
  console.log("\n   要跳过钩子运行: git commit --no-verify");
  console.log();
}

main();
