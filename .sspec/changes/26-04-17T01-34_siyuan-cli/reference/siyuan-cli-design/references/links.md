# References · Links

所有对本项目有价值的外部链接，按主题分类。本地 Agent 无需把所有链接都读一遍，仅在需要具体细节时按需查。

## 思源笔记核心

- 官方仓库：<https://github.com/siyuan-note/siyuan>
- 官方 Kernel API 文档（权威）：<https://github.com/siyuan-note/siyuan/blob/master/API.md>
- 思源官网：<https://b3log.org/siyuan/>
- 思源社区文档：<https://docs.siyuan-note.club/>

## siyuan-community/siyuan-sdk

本项目 schema 的主要参考与派生源。

- 仓库：<https://github.com/siyuan-community/siyuan-sdk>
- Node 子包 README：<https://github.com/siyuan-community/siyuan-sdk/blob/main/node/README.md>
- JSON Schemas 目录：<https://github.com/siyuan-community/siyuan-sdk/tree/main/schemas>
- Payload schemas 路径：`schemas/kernel/api/<group>/<n>/payload.schema.json`
- Response schemas 路径：`schemas/kernel/api/<group>/<n>/response.schema.json`

## Agent Skill 标准

- Claude Code Skills 官方文档：<https://docs.claude.com/en/docs/claude-code/skills>
- Anthropic Blog 关于 Skills：搜索 "Claude Skills" / "Agent Skills"
- agentskills.io（社区中心）：<https://agentskills.io/>
- Skill 编写最佳实践：Skill 的 description 字段要"稍微 pushy"，举例而非泛泛

## JSON Schema 参考

- JSON Schema Draft 2020-12 规范：<https://json-schema.org/draft/2020-12>
- ajv 文档：<https://ajv.js.org/json-schema.html>

## CLI 框架

- Citty (unjs)：<https://github.com/unjs/citty>
- Commander.js：<https://github.com/tj/commander.js>

## 工具库

- micromatch（glob 匹配）：<https://github.com/micromatch/micromatch>
- pathe（跨平台路径）：<https://github.com/unjs/pathe>
- consola（结构化日志）：<https://github.com/unjs/consola>
- defu（配置合并）：<https://github.com/unjs/defu>

## 用户原有的参考插件

- `H:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\tools\siyuan`（本地路径）
- 这是用户为思源插件写的 Agent Tool Call 集合，应作为 Tool 业务逻辑的灵感来源（尤其是 anchor 语法、append-content 三态抹平等）

## Agent Skill 相关

- `temp/siyuan-sdk/` —— 用户提到的本地 SDK 副本（若存在）
