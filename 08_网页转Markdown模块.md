# 08 网页转 Markdown 模块

## 1. 职责

`web_to_markdown` 将浏览器采集的 HTML 转为 Markdown。

负责：

```text
解析 HTML
提取正文
HTML 转 Markdown
提取 metadata
提取资源链接
质量判断
```

不负责：

```text
LLM 总结
保存笔记
下载图片
下载附件
```

## 2. 依赖

```text
jsdom
@mozilla/readability
turndown
turndown-plugin-gfm
```

## 3. 目录

```text
packages/tool-web/src/
├─ web-to-markdown.ts
├─ readability.ts
├─ turndown-rules.ts
├─ metadata.ts
├─ resource-extract.ts
└─ clean-markdown.ts
```

## 4. 输入

```ts
type WebToMarkdownInput = {
  url: string
  title?: string
  html: string
  selected_text?: string | null
  mode?: "readability" | "selection" | "full"
}
```

## 5. 输出

```ts
type WebToMarkdownOutput = {
  markdown: string
  metadata: {
    title: string
    source_url: string
    byline?: string
    excerpt?: string
    site_name?: string
    language?: string
  }
  resources: Array<{
    type: "image" | "link" | "document" | "media" | "unknown"
    url: string
    text?: string
  }>
  quality: {
    word_count: number
    extraction_method: string
    is_probably_article: boolean
  }
}
```

## 6. 流程

```text
html + url
→ jsdom
→ metadata extraction
→ selected_text 优先
→ Readability.parse
→ Turndown
→ clean markdown
→ extract resources
→ quality check
```

## 7. 降级

```text
Readability null → full body
正文过短 → selected_text 或 meta
全是链接 → 标记 low quality
```

## 8. 验收

```text
普通文章 HTML 能转 Markdown
selected_text 模式可用
Readability 失败不崩
resources 能提取图片/PDF链接
不下载资源
```
