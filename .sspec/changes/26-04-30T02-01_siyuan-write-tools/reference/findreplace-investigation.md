# findReplace API Investigation Notes

Date: 2026-04-30

## Source files examined

| File | Role |
|------|------|
| `kernel/api/search.go` | API handler (`func findReplace`) |
| `kernel/model/search.go` | Core implementation (`func FindReplace`) |
| `kernel/api/router.go` | Route registration + middleware chain |

GitHub repo: `https://github.com/siyuan-note/siyuan`

## Route

```go
ginServer.Handle("POST", "/api/search/findReplace",
    model.CheckAuth, model.CheckAdminRole, model.CheckReadonly, findReplace)
```

Middleware chain identical to `block.updateBlock` / `block.appendBlock`. Callable externally via standard API token.

## Handler signature (api/search.go)

```go
func findReplace(c *gin.Context) {
    arg := util.JsonArg(c, ret)
    _, _, _, paths, boxes, types, method, orderBy, groupBy := parseSearchBlockArgs(arg)
    k  := arg["k"].(string)          // keyword
    r  := arg["r"].(string)          // replacement
    ids := arg["ids"].([]any)        // block/doc IDs to search within
    replaceTypes := arg["replaceTypes"].(map[string]any)  // optional type filter
    err := model.FindReplace(k, r, replaceTypes, ids, paths, boxes, types, method, orderBy, groupBy)
}
```

## Model signature (model/search.go)

```go
func FindReplace(keyword, replacement string,
    replaceTypes map[string]bool,
    ids []string,
    paths, boxes []string,
    types map[string]bool,
    method, orderBy, groupBy int) (err error)
```

## Method values

| value | meaning | status |
|-------|---------|--------|
| 0 | Text match | ✅ |
| 1 | Query syntax | Auto-downgraded to 0 |
| 2 | SQL | ❌ Explicitly rejected |
| 3 | Regex | ✅ |

## replaceTypes enum (22 types)

```
Block-level:
  docTitle, codeBlock, mathBlock, htmlBlock

Inline-level:
  text, code, em, strong, kbd, mark, s, sub, sup, u, tag,
  aText, aTitle, aHref,
  imgSrc, imgText, imgTitle,
  inlineMath, inlineMemo,
  blockRef, fileAnnotationRef
```

Note: if `replaceTypes` is absent/empty, NO types are replaced (effectively no-op).

## Key constraints

- `groupBy != 0` → explicit error (grouping makes replacement impossible)
- `keyword == replacement` → silent no-op
- `method == 2` (SQL) → explicit error
- `ids` empty → auto FullTextSearchBlock → global "Replace All"
- docTitle replacement: `/` auto-converted to `／` (path separator safety)
- tag replacement: `#` prefix auto-stripped from replacement value
- blockRef replacement: subtype set to `"s"` (search anchor mode)

## Persistence flow (within FindReplace)

```
for each matched block:
    1. treenode.GetBlockTree(id)        → in-memory block tree
    2. LoadTreeByBlockID(id)           → AST parse tree
    3. generateTreeHistory(tree, dir)  → history snapshot (rollback)
    4. Walk AST, find matching nodes   → per-replaceType dispatch
    5. writeTreeUpsertQueue(tree)      → ★ write to DB
    6. sql.FlushQueue()                → ★ flush SQL queue
    7. ReloadProtyle(id)               → WebSocket push UI refresh
```

Steps 5+6 execute BEFORE step 7. Data is persisted regardless of UI availability.

## Unresolved

- Does `ids` containing a document ID search within child blocks or only the doc block itself?
  From code: `FullTextSearchBlock` is called when ids empty → returns block IDs → each is processed via `treenode.GetBlockTree` + `LoadTreeByBlockID`. This implies each id needs to be an individual block for the Walk to work. Document ID alone would only hit the doc title. To search/replace within a doc, you likely need to pass child block IDs.
  **→ Needs testing against live SiYuan.**
