# References · SiYuan Kernel API 分组一览

基于 `siyuan-note/siyuan/API.md` 与 `siyuan-community/siyuan-sdk` 的 schemas 目录整理。所有 endpoint 都是 `POST /api/<group>/<n>`，Content-Type: `application/json`，带 `Authorization: Token <token>` 头。

## 认证

```
Authorization: Token <token>
```

Token 在思源"设置 → 关于 → API token"查看。未设置 `accessAuthCode` 的本地实例可能不需要 token。

## 通用响应

```json
{
  "code": 0,              // 0 = 成功；非 0 = 错误
  "msg": "",              // 错误信息
  "data": <any>           // 业务数据
}
```

## Group 清单

| group | 主要用途 | 代表 endpoint |
| --- | --- | --- |
| `system` | 系统状态、版本 | `system.version`、`system.bootProgress`、`system.currentTime` |
| `notebook` | 笔记本管理 | `notebook.lsNotebooks`、`notebook.openNotebook`、`notebook.createNotebook` |
| `filetree` | 文档树 | `filetree.listDocsByPath`、`filetree.createDocWithMd`、`filetree.renameDocByID`、`filetree.removeDocByID`、`filetree.getHPathByID`、`filetree.createDailyNote` |
| `block` | 块操作 | `block.appendBlock`、`block.insertBlock`、`block.updateBlock`、`block.deleteBlock`、`block.getBlockKramdown`、`block.getChildBlocks`、`block.getBlockDOM`、`block.moveBlock` |
| `attr` | 块属性 | `attr.getBlockAttrs`、`attr.setBlockAttrs` |
| `query` | SQL 查询 | `query.sql` |
| `search` | 全文检索 | `search.fullTextSearchBlock`、`search.searchTag` |
| `asset` | 资源文件 | `asset.upload`（multipart）、`asset.getFile`、`asset.removeUnusedAssets` |
| `export` | 导出 | `export.exportMdContent`、`export.exportDocx`、`export.exportHTML` |
| `convert` | 格式转换 | `convert.html2Kramdown`、`convert.pandocConvert` |
| `template` | 模板 | `template.render`、`template.docSaveAsTemplate` |
| `format` | 格式化 | `format.netAssets2LocalAssets` |
| `ref` | 引用 | `ref.getBacklink2`、`ref.getBackmentionDoc` |
| `outline` | 大纲 | `outline.getDocOutline` |
| `bookmark` | 书签 | `bookmark.getBookmark` |
| `tag` | 标签 | `tag.getTag`、`tag.renameTag` |
| `graph` | 关系图 | `graph.getLocalGraph` |
| `history` | 历史 | `history.getDocHistoryContent` |
| `notification` | 通知 | `notification.pushMsg`、`notification.pushErrMsg` |
| `riff` | 间隔复习（闪卡） | `riff.createRiffCard`、`riff.getRiffCards` |
| `av` | 属性视图（数据库） | `av.addAttributeViewBlocks`、`av.getAttributeViewPrimaryKeyValues` |
| `file` | 文件读写（**危险**） | `file.getFile`、`file.putFile`、`file.removeFile`、`file.readDir` |
| `broadcast` | 广播频道 | `broadcast.postMessage` |
| `clipboard` | 剪贴板 | `clipboard.readFilePaths` |
| `inbox` | 收集箱 | `inbox.getShorthands` |
| `archive` | 归档 | `archive.zip`、`archive.unzip` |
| `sync` | 云同步 | `sync.performSync`、`sync.setSyncEnable` |
| `repo` | 数据快照 | `repo.createSnapshot`、`repo.checkoutRepo` |
| `setting` | 设置 | `setting.setAccount`、`setting.getConf` |
| `petal` | 插件市场 | `petal.loadPetals` |

## 安全敏感 endpoint（一期默认禁用或加 guard）

建议默认放入 `defaults.permission.api.disabled`：

- `system.exit`（会把 kernel 退出）
- `system.setUILayout`（修改用户 UI）
- `file.removeFile`（任意文件删除）
- `file.putFile`（任意文件写入）
- `file.getFile`（任意文件读取 —— 可能读到 token 等）
- `sync.setSyncEnable`（改云同步状态）
- `repo.checkoutRepo`（回滚快照，数据丢失）
- `petal.setPetalEnabled`（插件启停）

## 常用只读 endpoint（一期覆盖）

- `system.version`
- `notebook.lsNotebooks`
- `filetree.listDocsByPath`
- `filetree.getHPathByID`
- `block.getBlockKramdown`
- `block.getChildBlocks`
- `attr.getBlockAttrs`
- `query.sql`
- `search.fullTextSearchBlock`
- `export.exportMdContent`

## 常用写 endpoint（一期覆盖）

- `notebook.createNotebook`
- `filetree.createDocWithMd`
- `filetree.renameDocByID`
- `filetree.removeDocByID`
- `block.appendBlock`
- `block.insertBlock`
- `block.updateBlock`
- `block.deleteBlock`
- `attr.setBlockAttrs`
- `asset.upload`
- `notification.pushMsg`

## Multipart endpoint

只有极少数 endpoint 用 `multipart/form-data`（不是 JSON body）：

- `asset.upload` —— `file[]`（可多个）+ 可选 `assetsDirPath`
- （其它极少数）

CLI 在 schema 里用 `multipart: { fileFields: [...] }` 标记，Client 层按 multipart 发送。

## 参考权威

- API 列表与签名的权威：<https://github.com/siyuan-note/siyuan/blob/master/API.md>
- Schema 细节的权威：<https://github.com/siyuan-community/siyuan-sdk/tree/main/schemas/kernel/api>
