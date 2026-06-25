# 13 OpenCode 抽取与替换指南

## 1. 策略

不建议直接 fork 后大删大改。  
推荐：

```text
新建 sidebar-knowledge-agent
clone OpenCode 到 reference/opencode
分析并抽取 agent runtime 思路
需要复制代码时记录 license
```

## 2. 值得抽取

```text
model provider 抽象
agent loop
tool call 执行
permission mode
session store
agent mode
配置系统
```

## 3. 不需要

```text
LSP
Git diff / patch
coding prompt
测试运行器
IDE 集成
代码仓库扫描
PR/issue 流程
```

## 4. 替换表

| OpenCode | 本项目 |
|---|---|
| Code edit tool | save_markdown_note |
| Bash tool | 受控工具执行器 |
| Repo search | search_vault |
| Repo scanner | build_index |
| Coding prompt | Knowledge agent prompt |
| Plan agent | reader |
| Build agent | curator/media/resource/librarian |
| Patch system | note update |
| Test runner | pipeline acceptance tests |

## 5. Agent 模式替换

```text
plan → reader
build → curator / media / resource / librarian
```

## 6. AI 分析 OpenCode 的任务

```text
请分析 reference/opencode。
只关注：
1. model provider 抽象
2. agent loop
3. tool call 执行
4. permission mode
5. session 存储

不要分析 UI、LSP、Git、patch、IDE。
输出可迁移文件、迁移理由、替换方案。
```

## 7. License

如果复制代码：

```text
保留 MIT LICENSE
NOTICE.md 记录来源
README 声明非 OpenCode 官方项目
```

声明：

```md
Some implementation ideas and/or modified code may be derived from OpenCode, which is licensed under the MIT License.
This project is not affiliated with, sponsored by, or endorsed by the OpenCode team.
```
