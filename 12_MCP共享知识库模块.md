# 12 MCP 共享知识库模块

## 1. 职责

MCP Server 让 Claude Code / Claude Desktop / 其他 MCP Client 访问本地知识库。

它是共享层，不是主执行层。

## 2. 只读优先

第一版只做：

```text
search_notes
read_note
list_recent_notes
get_note_by_source_url
find_related_notes
```

不要做：

```text
delete_note
run_shell
download_asset
ffmpeg
网页采集
视频下载
```

## 3. 目录

```text
apps/mcp-server/src/
├─ server.ts
├─ resources.ts
├─ tools.ts
├─ vault-client.ts
├─ config.ts
└─ index.ts
```

## 4. MCP Resources

```text
knowledge://notes/{note_id}
knowledge://collections/recent
knowledge://collections/tags/{tag}
knowledge://sources/{source_hash}
```

## 5. MCP Tools

### search_notes

```json
{
  "query": "浏览器知识库 MCP",
  "filters": {
    "content_type": ["article", "video"],
    "tags": ["MCP"]
  },
  "limit": 10
}
```

### read_note

```json
{
  "note_id": "20260624_xxx"
}
```

### list_recent_notes

```json
{
  "limit": 20
}
```

## 6. VaultClient

```ts
class VaultClient {
  searchNotes(input) {
    return searchVault(input)
  }
  readNote(noteId) {
    return readNote(noteId)
  }
}
```

## 7. 配置

```env
SKA_VAULT_DIR=./vault
SKA_MCP_ALLOW_WRITE=false
```

## 8. 验收

```text
MCP server 能启动
search_notes 返回结果
read_note 返回 Markdown
默认不能删除
默认不能下载
Claude Code 可连接
```
