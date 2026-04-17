# Common Workflows

## Check kernel
```bash
siyuan workspace verify main
siyuan api system.version
```

## Search docs
```bash
siyuan api query.sql "SELECT id, hpath FROM blocks WHERE type='d' AND hpath LIKE '%daily note%'"
```

## Resolve hpath to stable path
```bash
siyuan tool resolve-path --hpath "/私人/日记"
```

## Append content
```bash
cat note.md | siyuan tool append-content --targetId <id> --targetType document --markdown @stdin
```
