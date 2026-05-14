# Request: Destructive / Critical Risk Auto-Approval 隐式触发问题

## 现象

13 个 API endpoint（占注册表 16.7%）在**没有任何显式 approval rule 匹配**的情况下，会**自动**进入 approval 流程。

这 13 个 endpoint 包括：
- **Destructive (8)**：`attr.batchSetBlockAttrs`, `block.batchAppendBlock`, `block.batchInsertBlock`, `block.batchPrependBlock`, `block.batchUpdateBlock`, `filetree.moveDocs`, `filetree.moveDocsByID`, `sqlite.flushTransaction`
- **Critical (5)**：`file.putFile`, `file.removeFile`, `file.renameFile`, `network.forwardProxy`, `system.exit`

## 复现路径

### 场景 A：批量设置属性（直观上不"破坏性"）

```bash
# 在没有任何 approval rule 的 notebook 中
siyuan api attr.batchSetBlockAttrs \
  -j '{"blockAttrs":[{"id":"<block-id>","attrs":{"custom-foo":"bar"}}]}' \
  --workspace dev
```

**预期**：直接执行（只是一个属性设置）
**实际**：触发 approval，因为 `classification: write + content + batch → risk: destructive`

### 场景 B：批量移动文档

```bash
siyuan api filetree.moveDocsByID \
  -j '{"fromIDs":["<id1>"],"toNotebook":"<nb>"}' \
  --workspace dev
```

**预期**：直接执行
**实际**：触发 approval，因为 `write + content + batch → destructive`

### 场景 C：操作文件系统

```bash
siyuan api file.putFile \
  --path "/data/test.md" --file "/tmp/test.md" \
  --workspace dev
```

**预期**：可能触发 approval（这确实危险）
**实际**：触发 approval，`write + workspace → critical`

## 隐式决策链路

```
EndpointSchema.classification
    → registry.ts: deriveRisk()
    → RegisteredEndpoint.meta.risk
    → guard.ts: isHighRisk(entry.meta.risk)
    → guard.ts: wouldRequestApproval 条件③
```

具体条件（guard.ts）：
```ts
const wouldRequestApproval =
    ruleEffect === 'approval' ||           // ① 显式 rule
    phase2NeedsApproval ||                 // ② Phase 2 resource rule
    (ruleEffect === 'allow' && isHighRisk(entry.meta.risk));  // ③ Risk-auto
```

当条件③触发时，用户**没有配置任何 approval rule**，但系统基于 `classification` 的语义自动升级。

## 当前 Approval UI 的披露

Approval Center HTML 显示：
- Risk: destructive
- Endpoint: attr.batchSetBlockAttrs

**不显示**：
- 这是"系统自动判定"还是"用户配置的 rule"
- 触发的具体原因（classification 推导路径）

用户看到的只有 `risk: destructive`，会困惑："我只是设置一个属性，为什么是 destructive？"

## 影响评估

| 维度 | 评估 |
|------|------|
| 触发频率 | 高：任何 batch scope 的写操作、workspace 操作都会触发 |
| 用户困惑度 | 高：`attr.batchSetBlockAttrs` 直观上不"破坏性" |
| AGENT 自动化 | 中：必须依赖 `--yes` 或人工 approval |
| 安全风险 | 低：approval 本身是安全设计，但隐式性削弱了用户的控制权 |

## 上下文

- `deriveRisk` 的映射规则是硬编码在 `src/api/registry.ts` 中的
- `scope: batch` 是 destructive 的边界条件：任何 `write + content/asset + batch` 都是 destructive
- `workspace` surface 总是 privileged：`write + workspace → critical`
- `riskOverride` 可以覆盖，但需要逐个 endpoint 手动配置

## 当前的全局分布

| Risk | 数量 | 占比 |
|------|------|------|
| safe | 9 | 11.5% |
| sensitive | 25 | 32.1% |
| elevated | 31 | 39.7% |
| **destructive** | **8** | **10.3%** |
| **critical** | **5** | **6.4%** |

---

**此 request 仅记录现象和复现路径，不附修改建议。**
