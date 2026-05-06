---
name: tool-failed
created: 2026-05-07T01:18:54
status: OPEN
attach-change: null
tldr: ""
---

<!-- MUST follow frontmatter schema:
status: OPEN | DOING | DONE | CLOSED
tldr: One-sentence summary for list views — fill this! -->

# Request: tool-failed

## Problem
<!-- What is not working or missing -->
观察到使用 Tool 调用获取失败
```
H:\SrcCode\playground\siyuan-cli                                                                                             main  Ⓜ 26GiB/31GiB
❯❯❯ pnpm run siyuan tool get-block-info --id "20260506185123-n6xlldr" --workspace local

> @frostime/siyuan-cli@0.12.0 siyuan H:\SrcCode\playground\siyuan-cli
> node bin/siyuan.mjs "tool" "get-block-info" "--id" "20260506185123-n6xlldr" "--workspace" "local"

{"error":"PAYLOAD_INVALID","message":"Payload validation failed: payload must have required property 'ids'"}
 ELIFECYCLE  Command failed with exit code 1.

H:\SrcCode\playground\siyuan-cli                                                                                             main  Ⓜ 26GiB/31GiB
❌  pnpm run siyuan tool get-block-content --id "20260506185123-n6xlldr" --workspace local

> @frostime/siyuan-cli@0.12.0 siyuan H:\SrcCode\playground\siyuan-cli
> node bin/siyuan.mjs "tool" "get-block-content" "--id" "20260506185123-n6xlldr" "--workspace" "local"

{"error":"BLOCK_NOT_FOUND","message":"Block id not found: 20260506205317-xrlwt1v, 20260506205317-y898uy5, 20260506205317-ycntm1j, 20260506205317-s2oihsc, 20260506205317-uejqag9, 20260506205317-qge7oy8, 20260506205317-yriw43g, 20260506205317-zxg4f5s, 20260506205317-wju0rac, 20260506205317-rivreqo, 20260506205317-qnjzk8y, 20260506205317-on9q3cl, 20260506205317-ztdgjxg, 20260506205317-r7unpz5, 20260506205317-uyvzhgf, 20260506205317-vhpii7a, 20260506205317-qfn8gqa, 20260506205317-r7crnkk, 20260506205317-xukc8wb, 20260506205317-x9xucog, 20260506205317-qz24b5b, 20260506205317-pxk3q05, 20260506205317-o5zkcrj, 20260506205317-uj33ng4, 20260506205317-woqmuzo, 20260506205317-pp40k2n, 20260506205317-uf9mnox, 20260506205317-u7ebi78, 20260506205317-sn9fbcv, 20260506205317-x4ynbmo, 20260506205317-xn3poqn, 20260506205317-ufip9m1, 20260506205317-rfjrmfu, 20260506205317-x90ty31, 20260506205317-q4nmkvo, 20260506205317-pm6axbe, 20260506205317-xl4cjcd, 20260506205317-nne3nix, 20260506205317-putfmn5, 20260506205317-mwjsm04, 20260506205317-wuz5rfi, 20260506205317-nlytaib, 20260506205317-qi6nkwa, 20260506205317-nafpfb4, 20260506205317-y9o25i4, 20260506205320-yzoluuk"}
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
 ELIFECYCLE  Command failed with exit code 3221226505.
```

但是使用 api 调用确能得到结果

```
H:\SrcCode\playground\siyuan-cli                                                                                             main  Ⓜ 26GiB/31GiB
❯❯❯ pnpm run siyuan api block.getBlockKramdown --id "20260506185123-n6xlldr" --workspace local
```

这意味着也许内置的 Tool 存在问题？

## Initial Direction
<!-- Your rough idea or preferred direction — details are fine but not required.
This becomes the starting point for the change's spec.md Approach. -->
请首先付现这个问题，然后排查问题出在哪里。
然后 STOP 和我对齐意见。

这些工具之前也测试过，能用；在这个用例上失败，说明应该是某种 Deep Hard Bug

## Relational Context
<!-- Constraints, preferences, related file links -->
src/tool/builtins/

---

## @AGENT
<!-- What should Agent do to implement this request -->
Adhere to the SSPEC protocol and commence development from the current Request file, following the SSPEC Change Lifecycle.
Next step: Read `sspec-clarify` SKILL + `sspec-design` SKILL + `sspec change new --from <this>`.

---

<!-- ============================================================
     MICRO-CHANGE ZONE (optional)
     For tiny changes (≤3 files, ≤30min) that don't need a full change.
     Remove these sections if a change is created instead.
     ============================================================ -->

<!--
## Plan
Quick implementation plan (what files to touch, what to do)

## Done
What was actually done + any notes for future reference
-->
