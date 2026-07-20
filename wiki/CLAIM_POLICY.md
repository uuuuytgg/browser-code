# Claim Policy

## Purpose

Claims are short, reusable, source-traceable knowledge atoms extracted from source Markdown files.

## Claim Types

- definition
- mechanism
- constraint
- comparison
- conclusion
- open-question
- warning
- procedure

## Rules

Each claim must:
- express one idea
- preserve source trace through source_path
- avoid long quotations
- avoid unsupported certainty
- distinguish fact from inference

## Format

- `[definition]` ...
- `[mechanism]` ...
- `[constraint]` ...
- `[comparison]` ...
- `[conclusion]` ...
- `[open-question]` ...
- `[warning]` ...
- `[procedure]` ...

## 合成 Claims（synthesized）

合成 claim 由 LLM 基于多条已有 claim 合并精炼生成。标记规则：

- type 可为任意 8 种，优先使用 `conclusion`（多现有 claims 可支持）或 `definition`（精简后的定义）
- confidence 基于参与合成的 claims 的最低 confidence 再降一级（保留合成风险）
- source 必须列出所有参与的 claim ID：`synthesized from [C003][C007]`
- status 固定为 `synthesized`
- 原 claims 保留不删除，标 `status: merged → CX`（指向合成 claim）

## Forbidden

Do not:
- invent claims not supported by the source
- merge unrelated claims
- turn open questions into conclusions
- erase source uncertainty
