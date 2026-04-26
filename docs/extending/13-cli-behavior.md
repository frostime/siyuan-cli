---
title: CLI Behavior
slug: cli-behavior
summary: How EndpointSchema.cli shapes the CLI surface — primary, aliases, input sources, payload modes.
---

# CLI Behavior

GATE: design this after the payload schema is stable. CLI behavior is a surface over the schema, not a duplicate of it.

## Four input paths into `payload`

```text
priority (later overrides earlier):

1. --json / -j '<json>'               entire payload
2. --file / -f <path | ->              entire payload (- = stdin)
3. positional → schema.cli.primary     single field
4. --<field> <value>                   named flag, one field at a time
5. schema property default             fills remaining missing fields
6. ajv validation                      rejects the whole payload if invalid
```

The flow is layered rather than a pure deep merge:

- `--json` seeds the base payload
- `--file` replaces that base payload if present
- positional primary and named flags then override individual fields
- schema defaults fill remaining missing fields

`--json` + `--<field>` is allowed: seed from JSON, then tweak a field by flag.

## `cli.primary`

```ts
cli: { primary: "stmt" }
```

Makes the first positional arg populate that field.

```sh
siyuan api query.sql "SELECT ..."   # stmt = "SELECT ..."
```

Rules:

- pick the single most-often-primary field (stmt, msg, content, k, name, template)
- do not combine primary with `-j` — redundant and error-prone
- do not set primary for multi-required payloads where the "primary" is ambiguous

## `cli.aliases`

```ts
cli: { aliases: { stmt: "s" } }
```

Adds a short flag. citty wires it up automatically. Use sparingly; mostly for truly hot flags.

## `cli.allowSource` — input source whitelist

Each field defaults to `["literal"]`, meaning only direct string values are accepted. Large-text fields should opt in to richer sources:

```ts
cli: {
  allowSource: {
    stmt: ["literal", "file", "stdin"],
    content: ["literal", "file", "stdin"],
    template: ["literal", "file", "stdin"],
  },
}
```

Once whitelisted, the field value can be any of:

| Syntax | Meaning |
|---|---|
| `"plain text"` | literal |
| `@file:./path/to/file.sql` | read from file (resolved from cwd) |
| `@stdin` or `-` | read from stdin (once per invocation) |
| `@env:VAR_NAME` | read from environment variable |
| `@@file:...` | escape — pass `@file:...` literally |

### When to enable what

| Field type | Recommended sources |
|---|---|
| long content (markdown, SQL, template) | `literal, file, stdin` |
| short identifier (id, path, name) | `literal` (default) |
| secret / token-like | `literal, env` |

### Stdin is single-use

The argv parser enforces "only one consumer of stdin per invocation". Using `@stdin` in one field **and** `--file -` will throw `STDIN_CONFLICT`. Using `@stdin` while the terminal is a TTY (no pipe) throws `STDIN_IS_TTY`.

## `cli.examples`

```ts
cli: {
  examples: [
    { command: 'siyuan api query.sql "SELECT id FROM blocks LIMIT 5"' },
    { command: "siyuan api query.sql --stmt @file:./query.sql" },
    { command: "cat query.sql | siyuan api query.sql --stmt @stdin" },
  ],
}
```

Shown in `siyuan api <id> --help`. Prefer 2–4 examples that cover: literal primary, file source, stdin source.

## Type coercion

argv flags are strings by citty default. `parsePayload()` coerces based on payload schema `type`:

| Schema type | Coercion |
|---|---|
| `string` | pass through |
| `integer` | `parseInt(value, 10)` |
| `number` | `Number(value)` |
| `boolean` | `value === "true"` |
| `array` | `JSON.parse(value)`; fallback to raw string on parse error |
| `object` | `JSON.parse(value)`; fallback to raw string on parse error |

For array/object fields, prefer `--json` or `--file`; the string-to-JSON coercion is a convenience, not a contract.

## Global CLI flags (independent of schema)

All `siyuan api <id>` and `siyuan tool <id>` commands accept these:

| Flag | Meaning |
|---|---|
| `--workspace`, `-w` | override active workspace name |
| `--dry-run` | preview write-like endpoints without calling the kernel |
| `--yes`, `-y` | bypass approval for write-like endpoints when allowed by behavior config |
| `--debug` | print the intended request (curl equivalent) to stderr |
| `--json`, `-j` | JSON-encoded payload |
| `--file`, `-f` | JSON payload from file; `-f -` = stdin |

APIs and tools additionally accept:

| Flag | Meaning |
|---|---|
| `--print compact\|json` | choose output mode; APIs default to compact formatter text or JSON fallback, tools default to content |

## Help surface

`siyuan api <id> --help` is built by `buildEndpointHelp()`:

- summary
- USAGE with primary and flag forms
- ENDPOINT + tag line
- PARAMETERS (required / optional / primary / default / enum)
- INPUT SOURCES (if any field has non-default `allowSource`)
- PAYLOAD MODES (`-j` / `-f`)
- OUTPUT (`--print compact|json`)
- EXAMPLES (if declared)
- DESCRIPTION (if declared)

Write `description` fields assuming they'll be shown in this help — be terse.

## One-line summary

**`cli.primary` for DX, `cli.allowSource` for large-text fields, `cli.examples` for clarity, `format` for compact API stdout. Everything else defaults sensibly.**
