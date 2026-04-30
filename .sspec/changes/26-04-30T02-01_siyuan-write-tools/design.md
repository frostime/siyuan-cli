---
change: "siyuan-write-tools"
created: 2026-04-30T02:01:37
updated: 2026-04-30T02:01:37
---

# Design: siyuan-write-tools

## 1. Structural Blueprint

```
src/tool/builtins/
├── brute-edit.ts                ← NEW
├── push-md.ts                   ← NEW
└── index.ts                     ← MOD  register brute-edit, push-md
```

---

## 2. Tool A: `brute-edit`

### 2.1 Interface Contract

```typescript
export const tool: ToolSchema = {
    id: 'brute-edit',
    summary: 'Full-document text search-and-replace (rewrites document, regenerates child block IDs)',
    description: `Reads a document's entire Markdown content, applies multiple search→replace
operations, then writes back via block.updateBlock.

⚠️ Child block IDs ARE regenerated. Only safe when:
  1. No child block has custom-* attributes
  2. No child block is referenced by other documents/blocks
  3. Document total markdown is under the size limit (default 50KB)

⚠️ Each search string MUST appear exactly once in the document.
If a search matches 0 times or multiple times, the entire operation is rejected.`,

    tags: ['write', 'dangerous'],
    input: {
        type: 'object',
        required: ['id', 'replacements'],
        additionalProperties: false,
        properties: {
            id: {
                type: 'string',
                description: 'Document ID to edit',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            replacements: {
                type: 'string',
                description: 'JSON array of {search, replace} pairs, applied in order. E.g.: \'[{"search":"old","replace":"new"}]\''
            },
            maxSize: {
                type: 'integer',
                description: 'Maximum total markdown size in bytes (default: 51200 = 50KB)',
                default: 51200
            },
            dryRun: {
                type: 'boolean',
                description: 'Preview changes without writing. Runs all checks and shows replacements, but does not modify the document.',
                default: false
            }
        }
    },

    async run(ctx, input) { /* §2.2 */ }
};
```

### 2.2 Behavioral Spec

```
brute-edit(id, replacements: JSON string, maxSize=51200, dryRun=false)

  ┌─ STEP 1: Verify document
  │  SQL: SELECT id, type FROM blocks WHERE id='<id>' LIMIT 1
  │  ├─ NOT FOUND → error "Document not found: <id>"
  │  └─ type != 'd' → error "<id> is type='<type>', not a document"
  │
  ├─ STEP 2: Safety check — custom-* attrs (existence first, details on hit)
  │  phase A: SELECT 1 FROM attributes a JOIN blocks b ON a.block_id=b.id
  │           WHERE b.root_id='<id>' AND b.type!='d' AND a.name LIKE 'custom-%'
  │           LIMIT 1
  │  └─ found → phase B: SELECT details → reject
  │
  ├─ STEP 3: Safety check — inbound refs (existence first, details on hit)
  │  phase A: SELECT 1 FROM refs r
  │           WHERE r.def_block_id IN (
  │             SELECT id FROM blocks WHERE root_id='<id>' AND type!='d'
  │           ) LIMIT 1
  │  └─ found → phase B: SELECT details → reject
  │
  ├─ STEP 4: Read markdown + size check
  │  call ctx.callEndpoint('block.getChildBlocks', {id})
  │  → join all child blocks' markdown with '\n\n' separator
  │  → if markdown.length > maxSize → reject
  │
  ├─ STEP 5: Search uniqueness pre-check
  │  replacements = JSON.parse(input.replacements)
  │  for each {search, replace}:
  │    count = occurrences of search in markdown
  │    ├─ count == 0 → REJECT ALL: "Search not found: '<search>'"
  │    └─ count > 1 → REJECT ALL: "Search matches <count> times: '<search>'. Use a more specific string."
  │
  ├─ STEP 6: Apply replacements
  │  for each {search, replace}:
  │    markdown = markdown.replace(search, replace)   // NOT replaceAll — pre-check guarantees uniqueness
  │
  ├─ STEP 7: dryRun check
  │  if dryRun:
  │    → return { content: "DRY RUN: <N> replacements would be applied", details: { id, replacementCount, byteLength } }
  │
  └─ STEP 8: Write back (single API call)
     call ctx.callEndpoint('block.updateBlock', {
       id: id, data: markdown, dataType: 'markdown'
     })
     → result: { content: "Replaced in document <id>: <N> replacements, <len> bytes",
                 details: { docId: id, replacementCount: N, byteLength: len } }
```

### 2.3 Search Uniqueness Details

The pre-check in Step 5 uses the ORIGINAL markdown (before any replacements).

**Why `replace` not `replaceAll`**: Since pre-check guarantees each `search` appears exactly once, `.replace(search, replace)` is equivalent to `.replaceAll(search, replace)`. But `.replace` is safer — if pre-check has a bug, it won't accidentally replace multiple occurrences.

**Sequential application**: Replacements are applied in order. Later replacements see the result of earlier ones. This is intentional:
```
  replacements: [{"search": "foo", "replace": "bar"}, {"search": "bar", "replace": "baz"}]
  // "foo bar" → "bar bar" → "baz bar"  (second replace now matches the result of first)
```
The pre-check operates on the ORIGINAL document, so the second search "bar" must appear exactly once in the original. If the original had no "bar", the pre-check would reject. This is the correct behavior — the user intended to replace "bar" that existed in the original, not "bar" that was introduced by the first replacement.

**All-or-nothing**: If any pre-check fails, NO changes are made. The document is untouched.

### 2.4 Error Format

```
search-not-found:
  content: "PRE-CHECK FAILED: Search string not found"
  details: { reason: "search-not-found", search: "<string>", hint: "Check spelling or use a broader search." }

search-multiple-matches:
  content: "PRE-CHECK FAILED: Search string matches <count> times"
  details: { reason: "search-ambiguous", search: "<string>", matchCount: <count>, hint: "Use a more specific search string." }

custom-attrs:
  content: "SAFETY CHECK FAILED — custom attributes on child blocks"
  details: { reason: "custom-attrs", blocks: [...], hint: "Remove these attributes first." }

inbound-refs:
  content: "SAFETY CHECK FAILED — child blocks have inbound references"
  details: { reason: "inbound-refs", refs: [...], hint: "Use a non-destructive approach." }

size-limit:
  content: "SIZE LIMIT EXCEEDED: <actual> bytes (max: <maxSize>)"
  details: { reason: "size-limit", actual: <actual>, max: <maxSize> }

dry-run:
  content: "DRY RUN: 3 replacements would be applied to document <id> (12345 bytes)"
  details: { id, replacementCount: 3, byteLength: 12345, dryRun: true }
```

---

## 3. Tool B: `push-md`

### 3.1 Design Rationale

Uses SiYuan kernel's `/api/import/importStdMd` API. Key properties:

| Property | Behavior |
|----------|----------|
| Image handling | ✅ Auto: relative images → assets, Base64 → decode+save, HTML img → convert |
| Inter-doc links | ✅ Auto: `.md` file links → SiYuan wiki links `[[]]` |
| YAML Front Matter | ✅ Auto: `id`/`title`/`updated` parsed |
| Document name | Derived from source filename |
| Overwrite | ❌ Not supported — always creates new doc with new ID |
| Return value | ❌ Does NOT return created document ID |
| `toPath` format | ⚠️ Must be internal `.sy` path (e.g. `/20251111144823-0lhpmav.sy`) or `"/"` for root. HPath **silently fails** (kernel returns `code:0` but nothing imported) |

After import: call `filetree.getIDsByHPath` to locate the created document.
Before import: convert user HPath → internal `.sy` path via `getIDsByHPath` + `getPathByID` (except root `"/"`).

### 3.2 Interface Contract

```typescript
export const tool: ToolSchema = {
    id: 'push-md',
    summary: 'Push a local Markdown file to SiYuan; uses kernel import for automatic image/link handling',
    description: `Imports a local .md file into SiYuan. The kernel handles image copying,
Base64 decoding, HTML img conversion, and inter-doc link conversion automatically.

Create mode (default): imports as a new document. SiYuan allows multiple documents
with the same hpath, so repeated imports create duplicates.

Overwrite mode (--overwrite): deletes the existing document at the target hpath first,
then imports. ⚠️ This changes the document ID — any references to the old document
will break. The tool checks for inbound references and refuses if found.

Use --dry-run to preview without making changes.`,

    tags: ['write', 'import'],
    input: {
        type: 'object',
        required: ['sourcePath', 'notebook', 'toPath'],
        additionalProperties: false,
        properties: {
            sourcePath: {
                type: 'string',
                description: 'Path to the local .md file (resolved relative to cwd or absolute)'
            },
            notebook: {
                type: 'string',
                description: 'Target notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            toPath: {
                type: 'string',
                description: 'SiYuan parent hpath. Document name is derived from the source filename. e.g. "/inbox" + "my-note.md" → document at "/inbox/my-note"'
            },
            overwrite: {
                type: 'boolean',
                description: 'If a document with the same name exists at toPath, delete it before importing. Checks for inbound references and refuses if found.',
                default: false
            },
            dryRun: {
                type: 'boolean',
                description: 'Preview: check source file and target without importing.',
                default: false
            }
        }
    },

    async run(ctx, input) { /* §3.3 */ }
};
```

### 3.3 Behavioral Spec

```
push-md(sourcePath, notebook, toPath, overwrite=false, dryRun=false)

  ┌─ STEP 1: Validate source file
  │  let resolved = path.resolve(cwd, sourcePath)
  │  ├─ !fs.existsSync(resolved) → error: "File not found: <resolved>"
  │  ├─ !fs.statSync(resolved).isFile() → error: "Not a file: <resolved>. Directories not yet supported."
  │  └─ ext not in ['.md', '.markdown'] → warn (proceed anyway)
  │
  ├─ STEP 2: Derive target document hpath
  │  let docName = path.parse(resolved).name   // "my-note" from "my-note.md"
  │  let sanitized = docName.replace(/[\\/:*?"<>|]/g, '-')
  │  let normalizedToPath = toPath.replace(/\\/g, '/').replace(/\/+$/, '')
  │  if !normalizedToPath.startsWith('/') → normalizedToPath = '/' + normalizedToPath
  │  let targetHpath = normalizedToPath + '/' + sanitized
  │
  ├─ STEP 3: Check for existing document at target hpath
  │  call ctx.callEndpoint('filetree.getIDsByHPath', { notebook, path: targetHpath })
  │  let existingIds = result  // may be empty array or contain IDs
  │  │
  │  ├─ existingIds.length > 0 AND !overwrite →
  │  │    error: "Document already exists at '<targetHpath>' (id: <existingIds[0]>). Use --overwrite to replace, or choose a different toPath."
  │  │
  │  ├─ existingIds.length > 0 AND overwrite →
  │  │    let existingId = existingIds[0]  // take the first match
  │  │
  │  │    STEP 3a: Check inbound references for existing doc
  │  │    SQL: SELECT 1 FROM refs WHERE def_block_id = '<existingId>' LIMIT 1
  │  │    ├─ found → error:
  │  │    │   "Cannot overwrite: document <existingId> has inbound references.
  │  │    │    Other documents link to this document. Overwriting would break those links.
  │  │    │    Remove references first, or use brute-edit for in-place content update."
  │  │    └─ not found → proceed to Step 3b
  │  │
  │  │    STEP 3b: Delete existing document
  │  │    call ctx.callEndpoint('filetree.removeDocByID', { id: existingId })
  │  │    └─ dry-run → skip deletion, report
  │  │
  │  └─ existingIds.length == 0 → proceed (create mode)
  │
  ├─ STEP 4: Convert HPath → internal path for kernel
  │  // importStdMd rejects HPath; must pass internal .sy path (verified empirically)
  │  if normalizedToPath === '/' || normalizedToPath === '':
  │    → internalPath = '/'   // root special case
  │  else:
  │    → parentIds = ctx.callEndpoint('filetree.getIDsByHPath', { notebook, path: normalizedToPath })
  │    → if parentIds.length === 0:
  │        error: "Parent path not found: '<normalizedToPath>'. Create the parent folder first."
  │    → parentPath = ctx.callEndpoint('filetree.getPathByID', { id: parentIds[0] })
  │    → internalPath = parentPath.path   // e.g. "/20251111144823-0lhpmav.sy"
  │
  ├─ STEP 5: dryRun check
  │  if dryRun:
  │    → return { content: "DRY RUN: Would import '<resolved>' → '<targetHpath>' in notebook <notebook>",
  │               details: { sourcePath: resolved, targetHpath, notebook, action: overwrite ? 'replace' : 'create',
  │                          existingDocId: existingIds[0] || null } }
  │
  ├─ STEP 6: Call kernel importStdMd
  │  call ctx.callEndpointRaw('/api/import/importStdMd', {
  │    notebook: notebook,
  │    localPath: resolved,
  │    toPath: internalPath   // ← internal .sy path, NOT HPath
  │  })
  │  Error handling:
  │  ├─ "local path is sub path of working dir" → error + hint
  │  ├─ "local path is sensitive path" → error + hint
  │  └─ other kernel errors → surface as-is
  │
  └─ STEP 7: Locate created document
     call ctx.callEndpoint('filetree.getIDsByHPath', { notebook, path: targetHpath })
     → get IDs matching the hpath
     → if multiple IDs (SiYuan allows dup hpaths), take the newest by created time
       SQL: SELECT id, hpath, created FROM blocks
            WHERE id IN (<ids>) AND type='d' ORDER BY created DESC LIMIT 1
     → result: { content: "Imported: <targetHpath> (id: <newId>)",
                  details: { docId: newId, hpath: targetHpath, notebook, sourcePath: resolved,
                              action: overwrite ? 'replaced' : 'created' } }
```

### 3.4 UX Decisions

| Scenario | Behavior |
|----------|----------|
| Source file not found | Immediately error, no API call |
| Parent hpath not found | Error: "Parent path not found: '<path>'. Create the parent folder first." |
| Source is directory | Error: "Directories not yet supported" (kernel supports it, but we scope to single files for clarity) |
| Target hpath exists, no `--overwrite` | Error with existing doc ID + hint |
| Target hpath exists, `--overwrite`, doc has inbound refs | Error: refuses with explanation |
| Target hpath exists, `--overwrite`, no refs | Delete existing → import fresh |
| Target hpath doesn't exist | Import directly |
| `--dry-run` | Show what would happen without making changes |
| Kernel importStdMd not available | Error: "importStdMd not available. Requires SiYuan v2.x+." |
| Same hpath, multiple docs | SiYuan allows this. Import creates another doc with same hpath. |

### 3.5 Implementation Notes

- **`callEndpointRaw`** for importStdMd — endpoint is not registered in the CLI schema, bypass registry
- **`callEndpoint`** for filetree.getIDsByHPath, filetree.removeDocByID — these ARE registered
- **Document name from filename**: `my-note.md` → `my-note`. No `.md` suffix. Special chars replaced with `-`.
- **`toPath` must be internal `.sy` path**: Kernel's `GetBlockTreeRootByPath` resolves internal paths; HPath silently fails (returns `code:0` but nothing imported). Convert HPath → internal path via `getIDsByHPath` + `getPathByID` before calling `importStdMd`. Root `"/"` is the only exception.
- **After import, `getIDsByHPath`** may return multiple IDs (SiYuan allows duplicate hpaths). We sort by `created DESC` and take the newest.

### 3.6 Limitations (v1)

1. **Single-machine only**: `importStdMd` reads local files. CLI and kernel must be on the same machine.
2. **No directory import**: v1 only supports single .md files. The kernel supports directories, but we don't expose this yet.
3. **No asset deduplication**: Each import re-uploads all assets. If the same images are referenced in multiple pushes, they'll be duplicated in `data/assets/`.
4. **Overwrite changes document ID**: When `--overwrite` is used, the old doc is deleted and a new one is created. Blocks referencing the old document by ID will break. The tool refuses overwrite if inbound refs exist.
5. **No ref migration on overwrite**: `transferBlockRef` could migrate block refs from old→new doc ID, but it triggers full-tree rewrite+reindex for each referencing document — too expensive for a CLI tool. Future v2 may add an opt-in `--force-overwrite` with ref migration.

---

## 4. Additional Reference

- [findReplace API investigation notes](./reference/findreplace-investigation.md) (excluded from this change)
- [importStdMd research chat](./reference/import-md-chat.xml)