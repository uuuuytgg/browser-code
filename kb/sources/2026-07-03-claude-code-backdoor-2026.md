---
title: "Claude Code "后门"事件：隐写术识别中国用户的技术分析与行业影响"
source_url: ""
type: "article"
captured_at: "2026-07-03"
vault_path: "vault/articles/claude-code-backdoor-2026.md"
tags:
  - ai-security
  - anthropic
  - claude-code
  - backdoor
  - steganography
  - data-privacy
---

# 事件概述

2026年6月30日，Reddit 用户 LegitMichel777 通过逆向工程发现 Anthropic 在其 AI 编程工具 Claude Code（v2.1.91 起）中植入了一套隐蔽的检测机制。该机制通过读取本地时区和 ANTHROPIC_BASE_URL 环境变量来识别中国用户，并利用隐写术（修改系统提示词中的 Unicode 字符）将标记信息编码在正常请求中传回服务器。Anthropic 随后承认该机制存在，解释为"风控实验"，并承诺回滚。

2026年7月3日，阿里巴巴宣布全面禁用 Claude 全系产品（Sonnet、Opus、Fable 及 Claude Code），自7月10日起生效。

# 关键来源

- 虎嗅网 / 数字生命卡兹克：https://www.huxiu.com/article/4871698.html
- V2EX 社区讨论：https://www.v2ex.com/t/1224178
- 澎湃新闻：https://www.thepaper.cn/newsDetail_forward_33510388
- Reddit 原帖：LegitMichel777
- 知乎多个讨论帖
- 快科技、金融界等媒体报道
