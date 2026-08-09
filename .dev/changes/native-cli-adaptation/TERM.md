# native-cli-adaptation 术语

| 术语 | 本 change 中的含义 |
|---|---|
| 规范命令 | `siyuan-cli`。SKILL、文档、帮助、示例和错误提示用它调用本项目。 |
| 兼容别名 | 本项目继续发布的 `siyuan` bin，用于 SiYuan 3.7.0 之前的环境和既有调用；在新版环境中可能与官方命令发生 PATH 竞争。 |
| 原生 CLI | SiYuan 3.7.0 起随内核分发的官方 `siyuan` 可执行程序，不指本项目的兼容别名。本 change 已决定不集成其 search、grep、backend 或 serve。 |
| N1 | 已验收的最小可用命令入口兼容改造。 |
| N2 | 文档检查点升级：统一创建当前 SiYuan 版本可用的内部 history 与本地恢复包。 |
| 文档检查点 | `checkpoint-doc` 表达的统一恢复意图，不要求调用方理解底层存储机制。 |
| 内部文档 history | SiYuan `history/createDocHistory` 在 workspace history 中保存的文档历史，要求 kernel `>=3.7.0`。 |
| 本地恢复包 | `checkpoint-doc` 写到磁盘的 Kramdown、属性、引用关系和恢复说明。 |
| partial failure | 新版 kernel 中两层检查点只有一层成功；命令必须明确报错并指出已保留的材料。 |
