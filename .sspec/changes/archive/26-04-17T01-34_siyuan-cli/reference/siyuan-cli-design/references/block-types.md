# References · SiYuan 块类型速查

思源 `blocks` 表中 `type` 字段的取值。Agent 写 SQL 或解释结果时常用。

| type | 全称 | 说明 |
| --- | --- | --- |
| `d` | document | 文档块（每个 `.sy` 文件的根块） |
| `h` | heading | 标题块（H1–H6，具体级别见 `subtype`） |
| `p` | paragraph | 段落 |
| `l` | list | 列表容器 |
| `i` | list item | 列表项 |
| `t` | table | 表格 |
| `b` | blockquote | 引述 |
| `c` | code block | 代码块 |
| `s` | super block | 超级块（横向 / 竖向布局） |
| `m` | math block | 数学公式块 |
| `html` | html block | HTML 块 |
| `query_embed` | embed | 嵌入块（SQL 查询嵌入） |
| `widget` | widget | 挂件 |
| `iframe` | iframe | iframe 块 |
| `video` | video | 视频 |
| `audio` | audio | 音频 |
| `tb` | thematic break | 分割线 |
| `av` | attribute view | 属性视图（数据库）块 |

## `subtype` 字段

- 标题块（type=h）：`h1` / `h2` / `h3` / `h4` / `h5` / `h6`
- 列表（type=l）：`u`（无序）/ `o`（有序）/ `t`（任务）
- 列表项（type=i）：`u` / `o` / `t`

## 常用查询模式

```sql
-- 列出所有文档
SELECT id, box, hpath, path FROM blocks WHERE type='d';

-- 统计某 notebook 文档数
SELECT count(*) FROM blocks WHERE type='d' AND box='<notebookId>';

-- 查找某 hpath 下的直属子块
SELECT id, type, content FROM blocks 
  WHERE parent_id='<docId>' 
  ORDER BY sort;

-- 全文检索（配合 blocks_fts 表）
SELECT b.id, b.content FROM blocks_fts f 
  JOIN blocks b ON b.id = f.id 
  WHERE f.content MATCH '<query>' LIMIT 20;

-- 找所有有某属性的块
SELECT block_id, value FROM attributes WHERE name='custom-tags';

-- 找某块的反向引用
SELECT def_block_id, root_id FROM refs WHERE block_id='<id>';
```

## 常用字段

### `blocks` 表

| 字段 | 说明 |
| --- | --- |
| `id` | 块 ID（`YYYYMMDDHHmmss-<7 字符>`） |
| `parent_id` | 父块 ID |
| `root_id` | 所在文档根块 ID（= 文档 ID） |
| `box` | notebook ID |
| `path` | 思源 path（`/<notebookId>/<docId>.sy`） |
| `hpath` | 人类可读 path（`/笔记本/子路径/文档名`） |
| `name` | 块名（别名） |
| `alias` | 别名（多个用逗号） |
| `memo` | 备注 |
| `tag` | 标签 |
| `content` | 文本内容（去 markup） |
| `markdown` | Markdown 原文 |
| `type` | 见上 |
| `subtype` | 见上 |
| `created` | 创建时间（`YYYYMMDDHHmmss`） |
| `updated` | 更新时间 |

### `attributes` 表

| 字段 | 说明 |
| --- | --- |
| `id` | 属性 ID |
| `name` | 属性名（`custom-xxx` / `memo` / `name` / `alias` / `bookmark`） |
| `value` | 值 |
| `block_id` | 关联块 |
| `root_id` | 块所在文档 |
| `box` | notebook |
| `path` | 思源 path |

### `refs` 表

| 字段 | 说明 |
| --- | --- |
| `def_block_id` | 被引用块 |
| `block_id` | 引用者块 |
| `root_id` | 引用者所在文档 |

### `blocks_fts` 表（全文索引）

| 字段 | 说明 |
| --- | --- |
| `id` | 块 ID |
| `content` | 索引内容 |
| `tag` | 标签 |
