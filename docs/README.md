# Developer Documentation

Internal docs for siyuan-cli contributors. Not published with the CLI package.

## Contents

Step-by-step guides for adding new CLI capabilities:

- [Adding a Kernel Endpoint](40-adding-an-endpoint.md)
- [Adding a Non-Public Kernel Endpoint](41-adding-a-private-endpoint.md)
- [Adding a Tool](42-adding-a-tool.md)

## Relationship to other docs

| Location | Audience | Purpose |
|---|---|---|
| `.sspec/spec-docs/` | Agent / maintainer | Architectural knowledge — design decisions, cross-module contracts, trade-offs |
| `src/docs/` | Published CLI users | Bundled reference docs shipped with the package |
| `docs/` (this directory) | Contributors | How-to guides, development workflows |
