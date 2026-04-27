---
name: change-file-arch
created: 2026-04-27 13:25:03
status: DOING
attach-change: .sspec/changes/26-04-27T13-54_file-arch-feature-cohesion/spec.md
tldr: ''
---
<!-- @RULE: Frontmatter Type
status: OPEN | DOING | DONE | CLOSED;
tldr: One-sentence summary for list views — fill this!
 -->

# Request: change-file-arch

## Problem
当前的 command 以 src/cli.ts 为核心，sub command 分散在各个地方。

比如 src/commands/ 下，src/approval/command.ts 两种。

我在思考：是否有必要调整代码架构，以功能内聚而非 layer 内聚？

就比如 src/utils/ 中很多，本质上是单纯为了 workspace 功能服务，却被单独画在 utils 中
而 workspace 如果内聚在独立模块中是否会更好？

我建议你可以参考 readability-refactor SKILL 思考这个问题。

## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Section A/B. -->

例如：将 workspace 提取独立模块，api 的 command 放在 src/apis/ 下等。

不要盲动，思考之后，和我讨论，给我几套可行的方案，通过头脑风暴确认怎么做、是否应该做。

## Success Criteria
<!-- The conditions or criteria that indicate
the problem has been resolved and meets the user's intention -->
代码结构更清晰，更容易维护。

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol specifications and commence development from the current Request file, following the SSPEC/Development Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILLs + `sspec change new --from <this>`.
