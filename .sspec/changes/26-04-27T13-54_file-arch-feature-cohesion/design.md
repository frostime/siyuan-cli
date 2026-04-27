---
change: "file-arch-feature-cohesion"
created: 2026-04-27T13:56:37
---

# Design: file-arch-feature-cohesion

## Structural Blueprint

```text
Before
src/
├─ commands/{api,tool,workspace,doc,skill}.ts
├─ core/{argv,client,config,docs,guard,msys-path,output,permission,registry,schema,skills,tools}.ts
├─ utils/{diagnostics,errors,paths,project-config,sql}.ts
├─ apis/**
└─ tools/**

After (Option B)
src/
├─ api/
│  ├─ command.ts
│  ├─ registry.ts
│  ├─ guard.ts
│  ├─ msys-path.ts
│  └─ endpoints/**
├─ tool/
│  ├─ command.ts
│  ├─ registry.ts
│  └─ builtins/**
├─ workspace/
│  ├─ command.ts
│  ├─ config.ts
│  ├─ paths.ts
│  ├─ project-config.ts
│  └─ diagnostics.ts
├─ doc/{command.ts,runtime.ts}
├─ skill/{command.ts,runtime.ts}
├─ shared/{schema,errors,client,permission,argv,output,sql}.ts
├─ approval/**
├─ docs/**
├─ skills/**
└─ cli.ts
```

## Path Migration Contract

Exact migration map lives in:
- `reference/path-migration-map.md`

Contract rules:
1. `mv` operations are authoritative; no content rewrites during move.
2. Import patch is mechanical, derived from moved paths.
3. Runtime behavior remains semantically identical.

## Import Graph Notes

```text
cli.ts
  -> api/command.ts
  -> tool/command.ts
  -> workspace/command.ts
  -> doc/command.ts
  -> skill/command.ts
  -> approval/command.ts
  -> api/registry.ts (help rendering)
  -> tool/registry.ts (help rendering)

api/command.ts
  -> api/registry.ts
  -> api/guard.ts
  -> api/msys-path.ts
  -> workspace/config.ts
  -> shared/{argv,client,permission,output,errors,schema}.ts
  -> api/endpoints/index.ts (side-effect registration)

tool/command.ts
  -> tool/registry.ts
  -> shared/{argv,errors,schema}.ts
  -> tool/builtins/index.ts (side-effect registration)
```

## Verification Plan

- Build/type consistency: `pnpm typecheck`
- Behavior consistency: `pnpm test`
- Path-reference consistency:
  - patch path mentions in `docs/**`
  - scan and patch path mentions in `src/docs/**` if present
- Surface check:
  - command names unchanged
  - approval flow unchanged
  - endpoint/tool registration side effects still loaded
- Cleanup check:
  - legacy dirs removed only after verification passes

