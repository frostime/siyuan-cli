---
change: "endpoint-default-format"
created: 2026-04-27T18:43:16
---

# Design: endpoint-default-format

## 0. Error Handling (Pre-existing)

`client.ts` already throws `CliError` when kernel returns `code !== 0`:
```typescript
if (body.code !== 0) {
    throw new CliError(ExitCode.GENERAL, 'KERNEL_ERROR', `Kernel returned error (code ${body.code}): ${body.msg}`);
}
return body.data;  // format functions only see this
```

Format strategies only receive the unwrapped `data` field. Non-zero codes are caught by `command.ts` → `fatalError()` → stderr JSON + exit. **No changes needed here.**

## 1. Type Definition

```typescript
// src/shared/schema.ts

export type FormatStrategy = 'direct' | 'records' | 'transaction' | 'object' | 'json';

export interface EndpointSchema<TResponseData = unknown> {
    // ... existing fields ...
    formatStrategy?: FormatStrategy;  // NEW — ignored when format is present
    format?: (ctx: EndpointFormatContext<TResponseData>) => string;
}
```

Precedence: `format` > `formatStrategy` > JSON fallback.

## 2. Strategy Renderers

All in `src/shared/output.ts`. Each receives the unwrapped `data` (not the kernel envelope).

### 2.1 `direct` — Scalar Values

```typescript
export function formatDirect(data: unknown): string {
    if (Array.isArray(data)) return data.map(String).join('\n');
    return String(data ?? 'null');
}
```

### 2.2 `records` — Array of Records

Decoupled from `guard.response` — uses pure shape auto-detection:

```typescript
export function formatRecordsStrategy(data: unknown): string {
    const { array, label } = findTopArray(data);
    if (array.length === 0) return jsonStringify(data);
    return formatRecords(array, { label });
}

/** Find the first array in data: top-level array, or first array-valued key of an object. */
function findTopArray(data: unknown): { array: unknown[]; label: string } {
    if (Array.isArray(data)) return { array: data, label: 'items' };
    if (isRecord(data)) {
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) return { array: value, label: key };
        }
    }
    return { array: [], label: 'items' };
}
```

Derives keys from first record via `formatRecords` default behavior (all keys from `Object.keys(records[0])`).

### 2.3 `transaction` — Write Operation Results

```typescript
export function formatTransaction(data: unknown): string {
    if (!Array.isArray(data) || data.length === 0) return 'OK';
    const ops = data as Array<{
        doOperations?: Array<{ action: string; id?: string }>;
    }>;
    const ids: string[] = [];
    const actions: string[] = [];
    for (const tx of ops) {
        for (const op of tx.doOperations ?? []) {
            if (op.id) ids.push(op.id);
            if (op.action) actions.push(op.action);
        }
    }
    const parts = ['OK'];
    if (ids.length > 0) parts.push(`ids=${ids.join(',')}`);
    if (actions.length > 0) {
        const counts = actions.reduce((acc, a) => {
            acc[a] = (acc[a] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        parts.push(
            `ops=${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(',')}`
        );
    }
    return parts.join(' | ');
}
```

Output: `OK | ids=abc123 | ops=append×1`

For void-like responses (`exit`, `pushMsg` where `data` is null/empty): just `OK`.

### 2.4 `object` — Single Object (with Multiline Awareness)

```typescript
export function formatObject(data: unknown): string {
    if (!isRecord(data)) return jsonStringify(data);

    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';

    // Detect multiline values
    const hasMultiline = entries.some(
        ([, v]) => typeof v === 'string' && v.includes('\n')
    );

    if (!hasMultiline) {
        // All single-line: inline key=value
        return entries
            .map(([k, v]) => `${k}=${inlineValue(v)}`)
            .join(' | ');
    }

    // Has multiline: section mode
    return entries
        .map(([k, v]) => {
            if (typeof v === 'string' && v.includes('\n')) {
                const lines = v.split('\n').map(l => `  ${l}`).join('\n');
                return `${k}:\n${lines}`;
            }
            return `${k}: ${inlineValue(v)}`;
        })
        .join('\n');
}
```

Output examples:

Flat (all single-line):
```
box=20210808180117-czj9bvb | path=/abc | rootTitle=My Doc
```

Section (has multiline value):
```
id: abc123
dom:
  <div class="block">
    <p>content</p>
  </div>
```

### 2.5 `json` — Explicit JSON

```typescript
export function formatJson(data: unknown): string {
    return jsonStringify(data);
}
```

## 3. Dispatcher

```typescript
export function applyFormatStrategy(
    strategy: FormatStrategy,
    data: unknown
): string {
    switch (strategy) {
        case 'direct':      return formatDirect(data);
        case 'records':     return formatRecordsStrategy(data);
        case 'transaction': return formatTransaction(data);
        case 'object':      return formatObject(data);
        case 'json':        return formatJson(data);
    }
}
```

Note: no `guard` parameter — format and guard are fully decoupled.

## 4. Command.ts Wiring

```typescript
// In callEndpoint(), replace current compact logic:

const rendered = preparePrintedOutput({
    print: args.print,
    details: result,
    compact: entry.schema.format
        ? () => entry.schema.format!({ endpoint: entry, payload, responseData: result, args })
        : entry.schema.formatStrategy
            ? () => applyFormatStrategy(entry.schema.formatStrategy!, result)
            : undefined,
    warning: { endpoint: entry.id }
});
```

## 5. Endpoint Assignment Map

| Strategy | Endpoints |
|----------|-----------|
| `direct` | `system.version`, `system.currentTime`, `filetree.getHPathByID`, `filetree.getHPathByPath`, `filetree.getPathByID`, `filetree.createDocWithMd`, `filetree.createDailyNote`, `filetree.getIDsByHPath`, `template.renderSprig` |
| `records` | `block.getChildBlocks`, `block.getBlockBreadcrumb`, `filetree.searchDocs`, `notebook.lsNotebooks` |
| `transaction` | `block.appendBlock`, `block.prependBlock`, `block.insertBlock`, `block.updateBlock`, `block.deleteBlock`, `block.moveBlock`, `block.foldBlock`, `block.unfoldBlock`, `block.transferBlockRef`, `attr.setBlockAttrs`, `filetree.renameDoc`, `filetree.renameDocByID`, `filetree.removeDoc`, `filetree.removeDocByID`, `filetree.moveDocs`, `filetree.moveDocsByID`, `notebook.renameNotebook`, `notebook.removeNotebook`, `notebook.openNotebook`, `notebook.closeNotebook`, `notebook.setNotebookConf`, `file.putFile`, `file.removeFile`, `file.renameFile`, `sqlite.flushTransaction`, `notification.pushMsg`, `notification.pushErrMsg`, `system.exit`, `system.logoutAuth` |
| `object` | `block.getBlockInfo`, `block.getBlockDOM`, `attr.getBlockAttrs`, `export.exportMdContent`, `export.exportResources`, `convert.pandoc`, `template.render`, `network.forwardProxy`, `notebook.createNotebook` |
| `json` | `system.getConf`, `system.bootProgress`, `notebook.getNotebookConf`, `file.getFile`, `asset.upload` |

**Unchanged** (already have `format`): `system.version` (has format), `system.currentTime` (has format), `query.sql`, `search.fullTextSearchBlock`, `file.readDir`, `filetree.listDocsByPath`, `block.getBlockKramdown`

Wait — `system.version` and `system.currentTime` already have `format`. They should NOT get `formatStrategy`. Let me correct the `direct` list:

| `direct` | `filetree.getHPathByID`, `filetree.getHPathByPath`, `filetree.getPathByID`, `filetree.createDocWithMd`, `filetree.createDailyNote`, `filetree.getIDsByHPath`, `template.renderSprig` |
| `records` | `block.getChildBlocks`, `block.getBlockBreadcrumb`, `filetree.searchDocs`, `notebook.lsNotebooks` |

## 6. Outcome Preview

| Endpoint | Before | After |
|----------|--------|-------|
| `createDocWithMd` | `{"code":0,"msg":"","data":"abc123"}` | `abc123` |
| `appendBlock` | 300+ chars JSON | `OK \| ids=abc \| ops=append×1` |
| `getBlockInfo` | 200+ chars JSON | `box=xxx \| path=/yyy \| rootTitle=Doc` |
| `getBlockDOM` | JSON with escaped HTML | `id: abc123\ndom:\n  <div>...</div>` |
| `getChildBlocks` | JSON array | `3 items [id, type, subType]\n1: abc \| d \| heading` |
| `lsNotebooks` | JSON with nested array | `2 notebooks [id, name, ...]\n1: xxx \| My NB` |
