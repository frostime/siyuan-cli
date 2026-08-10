---
name: contributing
summary: Contributor workflows for adding endpoints and tools to siyuan-cli.
updated: 2026-08-10
scope:
  - /src/api/endpoints/**
  - /src/tool/**
---

# Contributor Workflows

These guides answer **how to add a capability**. They are not the authoritative schema or permission reference.

- [Adding an endpoint](endpoints.md) — add a documented or private SiYuan Kernel API endpoint.
- [Adding a tool](tools.md) — add a multi-step or presentation-oriented workflow tool.

Read the contracts when a workflow reaches these decisions:

- [EndpointSchema](../endpoint-schema.md) — endpoint metadata, guards, CLI mapping, compatibility, output, and extension parity.
- [Permission model](../permission-model.md) — permission phases, tool-level checks, bypass boundaries, and approval.
- [Error model](../error-model.md) — structured errors and exit behavior.

Use the local development CLI in examples:

```sh
pnpm run siyuan ...
```
