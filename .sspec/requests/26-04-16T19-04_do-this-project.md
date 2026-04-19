---
name: do-this-project
created: 2026-04-16 19:04:19
status: DOING
attach-change: .sspec/changes/archive/26-04-17T01-34_siyuan-cli/spec.md
tldr: ''
---
<!-- @RULE: Frontmatter Type
status: OPEN | DOING | DONE | CLOSED;
tldr: One-sentence summary for list views — fill this!
 -->

# Request: do-this-project

## Problem
<!-- What is not working or missing -->

我打算使用这个 project 开发一个思源笔记的 CLI （就好像 obsidian cli 一样）

这个 CLI 就是给 Agent 使用的，方便他们使用。

## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Section A/B. -->

支持的功能上，必要的有这个：

### 一套认证机制
因为思源笔记运行多个工作空间，每个工作空间可能还有不同的 token 需求

我初步构想是这样
```
siyuan workspace add --url/baseUrl [思源 base url，默认 http://127.0.0.1:6806] --token [可选的认证 token] --name <工作空间命名>
siyuan workspace verify <name> # 检查是否连接成功
```

然后也支持使用、切换工作空间比如
```
siyuan workspace use <name>
```

所有相关配置文件应该写入 ~/.config/siyuan-cli/config.yaml 中

后续所有 CLI 命令，都支持动态指定 `--workspace <name>`

关于 workspace，需要记录这些信息

```ts
interface IWorkspaceConfig {
     current: string;
     workspaces: IWorkspace[];
}

interface IWorkspace {
     schema: number;
     baseUrl: string;
     token?: string;
}
```

### 思源内核 API 访问

思源支持网络 API，比如这些为公共 API https://github.com/siyuan-note/siyuan/blob/master/API.md

**内部维护**

内部访问思源参考 https://github.com/siyuan-community/siyuan-sdk/blob/main/node/README.md —— temp/siyuan-sdk/

我的建议：内部我们自行维护 api ，每个 api 使用一个 schema 文件定义

一定要方便扩展，并且 schema 内部自带参数的 description 说明等，这样在 `--help` 的时候能方便了解用法

对 Agent 友好非常重要，务必确保每个命令 `-h` 均可用

**管理**

- api schema 定义
- 启用，禁用机制：应当设计一套规则，可以指定启用或者禁用某些（包括某分组，比如 `system/*`）的 API；这个配置应该可以在 config 中更改，例如：
     ```yaml
     api:
          disabled:
               - export/*
               - convert/*
     ```

**CLI 使用**

API 上，我希望能尽可能灵活可扩展，使用策略如下
```bash
# siyuan api <endpoint name sep by .>
siyuan api query.sql # 访问siyuan 内核 api /api/query/sql ; 见 https://docs.siyuan-note.club/zh-Hans/reference/community/siyuan-sdk/kernel/api/query.html
siyuan api query.sql "select * from blocks limit 5" # 只有一个 stmt 参数，允许直接传入
siyuan api query.sql --stmt "select * from blocks limit 5"
siyuan api query.sql -j/--json '{"stmt": "select * from blocks limit 5"}'
siyuan api query.sql -f/--file ./payload.json
siyuan api query.sql -i/--interactive # 交互式输入
```

其他：注意某些 API 参数需要比如 Blob, File 等类型，例如 `/api/asset/upload`
这种情况下可以直接指定本地文件路径上传

**CLI的输出**
直接输出内核 API 的 json 输出结果

### `skill`

内置思源 CLI 的 Agent SKILL
```bash
siyuan skill list # 直接按照标准 SKILL 规范，列出
siyuan skill read # 读取 SKILL 文件
siyuan skill install # 将 agent skill 安装到 ~/.agents/skills/ 下
```

### tool

一些方便 Agent 使用的 Tool，可以理解为将复杂的 API 业务逻辑操作封装为若干字命令
默认内置这些：

```bash
siyuan tool list-doc-tree --entry <doc-id or notebook-id> --depth <num>
siyuan tool list-dailynote --date <date> [--at | --before | after] --filter-notebook? <指定 notebook>
siyuan append-content --target-id <id> --target-type <dailynote | document | block> --markdown <string>
siyuan create-doc --title <文档标题> --anchor <[docid]:parent | [docid]:sibling | [docid]:children> --markdown <string>
```

参考: H:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\tools\siyuan
这是我之前编写的思源插件，内置了一些 Agent Tool Call

同样 Tool 要标准化方便扩展、 方便声明 help 文档，方便 Agent 使用

存疑的问题：

- 是否需要支持多种输入方式？
- 长文本输入怎么处理？比如 --markdown，是否需要支持 stdin 等？

### 权限控制机制

对每个 workspace ，我们刚刚给出了哪些 Kernal API 可以被配置禁止
还需要允许配置：哪些 notebook 哪些 path 被禁止访问 —— 不仅仅是解析参数，还有包括过滤结果，比如某些结果会返回 block 对象等等，需要有一个统一的接口去声明 （比如 declare content filtering 等等）

---

## @AGENT
<!-- What should Agent do to implement this request -->
我在前期已经和 Web Claude 讨论形成了不错的共识，参考 temp/siyuan-cli-design

请仔细阅读相关材料，然后沿着这个路线推进。
