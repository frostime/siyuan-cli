---
change: "attr-safe-update"
created: 2026-05-15T00:05:23
---

# Design: attr-safe-update

## Interface Contract

```typescript
export const tool: ToolSchema = {
    id: 'update-block',
    summary: 'Update block content (preserves custom attributes)',
    tags: ['write'],
    input: {
        type: 'object',
        required: ['blocks'],
        additionalProperties: false,
        properties: {
            blocks: {
                type: 'string',
                description: 'JSON array of {id, data} objects. Supports @file: and @stdin.'
            }
        }
    },
    cli: {
        allowSource: { blocks: ['literal', 'file', 'stdin'] },
        examples: [
            { command: 'siyuan tool update-block --blocks @stdin <<\'EOF\'\n[{"id":"20241016135347-zlrn2cz","data":"New content"}]\nEOF' },
            { command: 'siyuan tool update-block --blocks @file:./updates.json' }
        ]
    }
};
```

**Single parameter**: `blocks` — always a JSON array of `{id, data}`. No mode switching.
**dataType**: hardcoded to `markdown`. No DOM support.

## Behavioral Flow

```
input(blocks: [{id, data}])
  → ids = blocks.map(b => b.id)
  → callEndpointRaw('/api/attr/batchGetBlockAttrs', {ids})
  → savedAttrs = filter each block's attrs to custom-* keys only
  → callEndpoint('block.batchUpdateBlock', {blocks: [{id, data, dataType:'markdown'}]})
  → if any block had custom attrs:
      callEndpointRaw('/api/attr/batchSetBlockAttrs', {blockAttrs: [{id, attrs}]})
  → result
```

Note: `batchGetBlockAttrs` and `batchSetBlockAttrs` use `callEndpointRaw` (internal read/write probes). The main `batchUpdateBlock` goes through the guard pipeline (permission, approval, dry-run).

## Custom Attr Filter

```typescript
function extractCustomAttrs(attrs: Record<string, string>): Record<string, string> | null {
    const custom: Record<string, string> = {};
    let hasAny = false;
    for (const [k, v] of Object.entries(attrs)) {
        if (k.startsWith('custom-')) { custom[k] = v; hasAny = true; }
    }
    return hasAny ? custom : null;
}
```

## Output

**Compact**: `Updated <n> block(s) (<m> with attrs preserved)`

**JSON details**:
```json
{ "updated": [{"id": "...", "attrsPreserved": 2}] }
```
