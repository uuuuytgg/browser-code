# AGENTS.md

> **本文件是指针。** Browser Code 的完整 agent 约束文件位于 [`.browser-code/AGENTS.md`](.browser-code/AGENTS.md)。
>
> 运行时由 OpenCode 的 instruction 机制从 `BROWSER_CODE_CONFIG_DIR`（即 `.browser-code/`）全局加载，
> 无论用户在哪个工作目录启动 `browser-code` 都会生效。

## 核心要点摘要

- **双轨子代理体系**：专家型（六要素领域模板：领域/方法论/输入/输出/边界/交接）+ 执行型（I/O 标准化）
- **任务路由**：Direct 通道（URL 明确 / 查 KB / 单一事实）由主 agent 直接处理；Research 通道派 `proreader` 子代理
- **子代理**：`proreader`（12-provider 研究专家）、`general`（全工具体力劳动）、`anthropologist` / `geographer` / `historian` / `psychologist`（学术分析）
- **KB 写入**：ProReader 只研究不落盘；写入 vault/kb 需用户确认后由主 agent 执行

完整规则、协作链、spawn 模板请阅读 [`.browser-code/AGENTS.md`](.browser-code/AGENTS.md)。
