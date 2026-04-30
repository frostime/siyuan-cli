---
revision: 1
date: 2026-04-30
trigger: correction
---

# Pre-Implement Corrections

Staged review found 5 baseline mismatches + 1 scope expansion before any code was written.

## Reason

Post-gate review of `design.md` and `spec.md` uncovered behavioral and architectural issues that would produce incorrect or unsafe tool behavior if implemented as written. User confirmed corrections via questionnaire.

## Changes

### 1. push-md create mode: refuse existing target

**Baseline**: "SiYuan allows multiple documents with the same hpath, so repeated imports create duplicates."

**Corrected**: Create mode refuses if `targetHpath` already has any document. The error message lists matching IDs and suggests `--overwrite` (delete + re-import) or in-place editing via `block.updateBlock` / `block.insertBlock` / `block.appendBlock`.

### 2. push-md `--overwrite`: reject ambiguous multi-doc hpath

**Baseline**: `existingIds.length > 0 AND overwrite → let existingId = existingIds[0]` — takes first match.

**Corrected**: If multiple documents share the target hpath, the tool refuses as ambiguous and lists all matching IDs. Only proceeds when exactly one document exists at the target.

### 3. push-md overwrite ref safety: include document root + all descendants

**Baseline**: `SELECT 1 FROM refs WHERE def_block_id = '<existingId>' LIMIT 1` — only checks document root.

**Corrected**: Checks inbound refs to **all blocks** under the existing document (root + descendants), because overwrite deletes the entire tree and all block IDs change.

```sql
SELECT 1 FROM refs WHERE def_block_id IN (
  SELECT id FROM blocks WHERE root_id = '<existingId>'
  UNION SELECT '<existingId>'
) LIMIT 1
```

### 4. importStdMd: register endpoint schema (not callEndpointRaw)

**Baseline**: `callEndpointRaw('/api/import/importStdMd', ...)` — bypasses registry, permission, and approval.

**Corrected**: New `src/api/endpoints/import/importStdMd.ts` with proper `EndpointSchema`. Tool uses `ctx.callEndpoint('import.importStdMd', ...)`. The endpoint gets `mode: 'write'`, `surface: 'content'`, `scope: 'single'`, `operation: 'create'`, derived risk `elevated`. Guard covers `notebook` (write). `localPath` and `toPath` are not guarded (host filesystem path and internal path — current `ResourceKind` cannot express these).

### 5. brute-edit: original-span application model (not sequential .replace)

**Baseline**: Step 6 applies replacements sequentially via `markdown.replace(search, replace)` — later replacements can match text introduced by earlier ones.

**Corrected**: Step 5 captures each match's byte range `[start, end)` against the **original** markdown. Step 6 applies replacements from end to start against the original text. Later replacements never match text introduced by earlier ones. Overlapping original match ranges are rejected as `overlapping-replacements`.

Example:
```
original:  "foo bar"
planned:   [{search:"foo", replace:"bar"}, {search:"bar", replace:"baz"}]
matches:   [0,3) and [4,7) in original
result:    "bar baz"   (not "baz bar" as sequential would produce)
```

### 6. push-md root path normalization

**Baseline**: `normalizedToPath + '/' + sanitized` — produces `//name` when `toPath="/"`.

**Corrected**:
```ts
targetHpath = normalizedToPath === '/'
  ? '/' + sanitized
  : normalizedToPath + '/' + sanitized
```

### 7. push-md parent path ambiguity

**Baseline**: `parentIds[0]` — silently picks first.

**Corrected**: If `getIDsByHPath` for the parent path returns multiple IDs, the tool refuses as ambiguous and asks the user to use a unique parent path.

## Scope Expansion

| File | Change |
|------|--------|
| `src/api/endpoints/import/importStdMd.ts` | **New**: endpoint schema for `/api/import/importStdMd` |
| `src/api/endpoints/index.ts` | **ADD**: register `import.importStdMd` |
| `tests/endpoint-schemas.test.ts` | **ADD**: importStdMd schema coverage |
| `tests/tool-write-tools.test.ts` | **New**: brute-edit + push-md behavior tests |

Baseline scope (3 files) → revised scope (7 files).

### 8. brute-edit / push-md tags: drop non-standard values

**Baseline**: `spec.md` declared `brute-edit` tags as `['write', 'dangerous']` and `push-md` tags as `['write', 'import']`.

**Corrected**: Both tools use `['write']` only.

**Reason**: Per `endpoint-schema.md` spec-doc §2, risk is derived from `classification`, not from tags. Tags are a functional-category dimension (`read | write | aggregate | util`). `'dangerous'` is a risk signal (no place in ToolTag); `'import'` is a surface/operation dimension (also no place in ToolTag). The `ToolTag` union in `schema.ts` is closed and does not include either value. ToolSchema currently has no `classification` field, so there is no risk-derivation path for tools — risk is indirectly covered by the underlying endpoint calls (e.g. `block.updateBlock` is `write + content + single → elevated`). Adding non-standard tags to bypass this would pollute the type and provide no runtime protection.

## Task Impact

All Phase 1–3 tasks remain; Phase 1 gains a new endpoint schema sub-task. Verification plan unchanged.