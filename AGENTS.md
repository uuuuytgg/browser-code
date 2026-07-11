# Browser Code 项目级约束

## 任务分发

- **繁琐任务**（读文件、搜索、对比分析、写文件）→ 外包子代理执行，主代理只保留决策和精确代码编辑
- **复杂多步任务**（研究+写报告+PPT等）→ TodoWrite 拆步 + 并行 task spawning，汇总结果
- **研究任务** → task({subagent_type: "proreader", ...})，走 Research 通道

## 通道判断

- **Direct 通道**：URL 明确 / KB 操作 / 单一事实查询（不涉及多源对比）
- **Research 通道**：需要多源对比 / 跨平台搜索 / 深度分析
- 不确定时默认走 Research；拒绝走的理由必须是"不需要多源对比、不需要跨平台搜索、不需要深度分析"

## 子代理约束

- ProReader 子代理只读不写，返回结构化结果后由主 Agent 用 save_markdown_note + kb_manage 写入
- Worker 不允许递归 spawn
- 子代理持久化走原生 task_id 机制，不额外实现
