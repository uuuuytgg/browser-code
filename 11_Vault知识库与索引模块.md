# 11 Vault 知识库与索引模块

## 1. 职责

Vault 模块负责 Markdown 保存、去重、索引和搜索。

## 2. 目录

```text
vault/
├─ articles/
├─ videos/
├─ documents/
├─ snippets/
├─ resources/
├─ assets/
└─ index/
   └─ index.json
```

代码：

```text
packages/tool-vault/src/
├─ save-note.ts
├─ frontmatter.ts
├─ dedupe.ts
├─ filename.ts
├─ build-index.ts
├─ search-vault.ts
├─ read-note.ts
└─ note-schema.ts
```

## 3. Markdown 标准

```md
---
id: "20260624_xxxxx"
title: "标题"
source_url: "https://..."
source_platform: "youtube|bilibili|web|local"
content_type: "article|video|document|snippet|resource"
created_at: "2026-06-24T16:00:00+08:00"
captured_at: "2026-06-24T16:00:00+08:00"
tags: []
keywords: []
status: "processed"
assets: []
related_notes: []
---

# 标题

## 摘要

...

## 关键观点

...

## 原始来源

- Source: https://...
```

## 4. save_markdown_note

输入：

```ts
type SaveMarkdownNoteInput = {
  markdown: string
  metadata: {
    title: string
    source_url: string
    source_platform?: string
    tags?: string[]
    keywords?: string[]
  }
  content_type: "article" | "video" | "document" | "snippet" | "resource"
  source_url: string
}
```

输出：

```ts
type SaveMarkdownNoteOutput = {
  note_id: string
  file_path: string
  deduped: boolean
  index_updated: boolean
}
```

## 5. 文件命名

```text
YYYY-MM-DD__slug-title__short-hash.md
```

## 6. 去重

第一版：

```text
source_url 相同 → 重复
```

后期：

```text
canonical_url + content_hash
```

## 7. index.json

```json
{
  "version": 1,
  "updated_at": "2026-06-24T16:00:00+08:00",
  "notes": []
}
```

NoteRecord：

```ts
type NoteRecord = {
  note_id: string
  title: string
  path: string
  source_url: string
  source_platform: string
  content_type: string
  tags: string[]
  keywords: string[]
  created_at: string
  updated_at: string
  content_hash: string
}
```

## 8. search_vault MVP

先用简单搜索：

```text
title 命中 +5
tags 命中 +4
keywords 命中 +3
正文命中 +1
```

后期再做：

```text
ripgrep
SQLite FTS5
embedding
hybrid search
```

## 9. 验收

```text
能保存到正确目录
frontmatter 合法
source_url 去重
build_index 可重复执行
search_vault 可搜标题/tag/正文
路径不能跳出 vault
```
