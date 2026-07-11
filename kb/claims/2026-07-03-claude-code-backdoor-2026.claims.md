# Claims: Claude Code "后门"事件

## C001
Anthropic 自 2026 年 4 月的 Claude Code v2.1.91 版本起植入了隐蔽检测代码。
**Confidence**: high
**Source**: 虎嗅网、V2EX、Reddit 逆向分析

## C002
检测机制通过读取系统时区（Asia/Shanghai 或 Asia/Urumqi）识别中国用户。
**Confidence**: high
**Source**: 多来源交叉验证

## C003
检测机制通过读取 ANTHROPIC_BASE_URL 环境变量并与内置 147 个域名列表比对，识别使用代理中转的中国用户和 AI 实验室。
**Confidence**: high
**Source**: 虎嗅网、逆向分析

## C004
内置域名列表经 base64 和 XOR（密钥 91）双重加密混淆。
**Confidence**: high
**Source**: 虎嗅网

## C005
列表中包含美团、网易、百度、携程、小红书、阿里巴巴、蚂蚁、字节跳动、京东、B站、月之暗面、MiniMax、阶跃星辰等中国公司及 AI 实验室域名。
**Confidence**: high
**Source**: 虎嗅网解码验证

## C006
检测到中国用户后，Claude Code 通过修改系统提示词中的 Unicode 字符（替换撇号和日期分隔符）进行隐写回传，而非新增网络请求。
**Confidence**: high
**Source**: 虎嗅网

## C007
该隐写术在终端和编辑器中肉眼不可见，属于经典的 steganography 技术。
**Confidence**: high
**Source**: 技术社区分析

## C008
Anthropic 承认该机制存在，解释为"风控实验"，目的是防止账号转售和模型蒸馏，承诺回滚。
**Confidence**: medium (单方面声明)
**Source**: Anthropic 官方声明

## C009
Claude Code 拥有文件系统读写、Shell 执行、Git 操作等最高系统权限。
**Confidence**: high
**Source**: 产品文档及逆向分析

## C010
该机制违反 GDPR、Apple 审核指南及 Anthropic 自身倡导的透明原则。
**Confidence**: medium (需要法律确认)
**Source**: 虎嗅网、社区讨论

## C011
阿里巴巴自 2026 年 7 月 10 日起全面禁止内部使用 Claude 全系产品（Sonnet、Opus、Fable、Claude Code）。
**Confidence**: high
**Source**: 澎湃新闻、虎嗅、快科技

## C012
阿里推荐使用自研 Qoder 作为 Claude Code 的替代方案。
**Confidence**: high
**Source**: 澎湃新闻

## C013
该事件加速了国内企业对 AI 工具数据本地化和合规性的重视。
**Confidence**: medium (趋势判断)
**Source**: 行业分析报道

## C014
全球开发者社区因此事件对 AI 编程助手的信任产生广泛质疑。
**Confidence**: medium
**Source**: 虎嗅网、知乎、V2EX

## C015
Anthropic 在封号通知邮件中嵌入追踪器，用于二次确认用户身份。
**Confidence**: medium
**Source**: 虎嗅网

## C016
检测机制仅在使用自定义 API 代理（ANTHROPIC_BASE_URL）时触发，直接连接官方服务的用户不受影响。
**Confidence**: high
**Source**: 多来源交叉验证

## C017
该事件被视为后门/风控边界争议的标志性案例。
**Confidence**: medium
**Source**: 社区共识
