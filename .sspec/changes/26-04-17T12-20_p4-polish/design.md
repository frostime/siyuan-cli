# P4 Design

## 1. tokenSource

扩展 `WorkspaceEntry`：

```ts
interface TokenSource {
  type: "env" | "file" | "command";
  value: string;
}
```

解析优先级：
1. CLI `--token`
2. `SIYUAN_CLI_TOKEN`
3. `tokenSource`
4. `token`

## 2. Skill install targets

支持：
- `agents` → `~/.agents/skills/<name>`
- `claude` → `~/.claude/skills/<name>`
- `claude-project` → `./.claude/skills/<name>`
- `custom` → `--dest/<name>`

## 3. Template Variables

在 install 时替换：
- `{{cli_version}}`
- `{{workspace}}`
- `{{base_url}}`
- `{{cli_path}}`
- `{{today}}`

只处理文本文件（`.md`, `.txt`, `.yaml`, `.yml`, `.json`, `.sh`）。

## 4. API debug preview

`--debug` 时 stderr 打印：
- endpoint
- assembled payload
- curl-like request preview
