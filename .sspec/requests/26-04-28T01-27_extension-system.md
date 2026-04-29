---
name: extension-system
created: 2026-04-28 01:27:28
status: DOING
attach-change: .sspec/changes/26-04-28T01-42_extension-system/spec.md
tldr: ''
---
<!-- @RULE: Frontmatter Type
status: OPEN | DOING | DONE | CLOSED;
tldr: One-sentence summary for list views — fill this!
 -->

# Request: extension-system

我希望能让 siyuan-cli 像 pi coding agent 那样支持用户自行扩展；

我首先想到要支持的：

- 在全局配置目录下， apis/ 和 tools/ 允许用户放入自己的代码
- 用户可以放入自己的 script 文件
- 如果能支持 ts 就更好了（但是不知道要怎么动态导入）
- 以及可以考虑支持类似 ~\.pi\agent  那样的 tsconfig，这样用户在开发的时候可以直接利用 npm 中的类型
  - 不过当前项目 build 的时候似乎不导出 dts?

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol specifications and commence development from the current Request file, following the SSPEC/Development Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILLs + `sspec change new --from <this>`.
