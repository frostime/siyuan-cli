---
change: "p2-demo-adoption"
created: 2026-04-18T02:23:08
---

# Design: p2-demo-adoption

## 1. P2 Goal Boundary

```text
P2 validates frozen P1 contracts on 7 representative endpoints:
- block.moveBlock
- block.getBlockKramdown
- query.sql
- file.getFile
- file.putFile
- system.exit
- notification.pushMsg

P2 does NOT widen contract surface.
If a demo reveals a contract gap -> amend P1 first.
```

---

## 2. Before / After Schema Contract

### 2.1 `block.moveBlock`

**Before**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/block/moveBlock",
  summary: "Move a block",
  payload: { ... },
  tags: ["write", "mutation"],
  guard: { payload: { id: "id", previousID: "id", parentID: "id" } },
};
```

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/block/moveBlock",
  summary: "Move a block",
  payload: { ... },
  classification: {
    mode: "write",
    surface: "content",
    scope: "single",
    operation: "move",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "write" },
      { field: "parentID", kind: "id", access: "write" },
      { field: "previousID", kind: "id", access: "write" },
    ],
  },
};
```

---

### 2.2 `block.getBlockKramdown`

**Before**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/block/getBlockKramdown",
  summary: "Get block Kramdown content",
  payload: { ... },
  tags: ["read"],
  guard: { payload: { id: "id" } },
};
```

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/block/getBlockKramdown",
  summary: "Get block Kramdown content",
  payload: { ... },
  classification: {
    mode: "read",
    surface: "content",
    scope: "single",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { field: "id", kind: "id", access: "read" },
    ],
  },
};
```

---

### 2.3 `query.sql`

**Before**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",
  summary: "Query SiYuan database via SQL",
  payload: { ... },
  tags: ["read", "query"],
  guard: {
    response: {
      itemsAt: "data[*]",
      fieldMap: { id: "id", path: "path", notebook: "box" },
    },
  },
};
```

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/query/sql",
  summary: "Query SiYuan database via SQL",
  payload: { ... },
  classification: {
    mode: "read",
    surface: "content",
    scope: "global",
    operation: "query",
  },
  guard: {
    filterResponse: (response, engine) => { ... },
  },
};
```

---

### 2.4 `file.getFile`

**Before**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/file/getFile",
  summary: "Get file under workspace directory",
  payload: { ... },
  tags: ["read"],
};
```

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/file/getFile",
  summary: "Get file under workspace directory",
  payload: { ... },
  classification: {
    mode: "read",
    surface: "workspace",
    scope: "single",
    operation: "inspect",
  },
  guard: {
    payloadTargets: [
      { field: "path", kind: "workspace-path", access: "read" },
    ],
  },
};
```

---

### 2.5 `file.putFile`

**Before**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/file/putFile",
  summary: "Put file under workspace directory",
  payload: { ... },
  tags: ["write", "mutation"],
};
```

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/file/putFile",
  summary: "Put file under workspace directory",
  payload: { ... },
  classification: {
    mode: "write",
    surface: "workspace",
    scope: "single",
    operation: "update",
  },
  guard: {
    payloadTargets: [
      { field: "path", kind: "workspace-path", access: "write" },
    ],
  },
};
```

---

### 2.6 `system.exit`

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/system/exit",
  summary: "Exit SiYuan kernel",
  payload: { type: "object", properties: {} },
  classification: {
    mode: "invoke",
    surface: "runtime",
    scope: "single",
    operation: "control",
    riskOverride: "critical",
  },
};
```

---

### 2.7 `notification.pushMsg`

**After**

```ts
export const schema: EndpointSchema = {
  endpoint: "/api/notification/pushMsg",
  summary: "Push message to SiYuan interface",
  payload: { ... },
  classification: {
    mode: "invoke",
    surface: "runtime",
    scope: "single",
    operation: "control",
    riskOverride: "safe",
  },
};
```

---

## 3. Demo Validation Paths

### 3.1 `moveBlock`

```text
moveBlock
  -> payloadTargets[3]
  -> bulk resolver
  -> content.write check for each resolved path
  -> reject on first denied ref
```

**Minimum check set**
- target block denied
- destination parent denied
- previous anchor denied
- all allowed => request path reaches client

### 3.2 `getBlockKramdown`

```text
getBlockKramdown
  -> payloadTargets[id -> read]
  -> resolveContentId(id)
  -> content.read policy check
```

**Minimum check set**
- denied path => reject before request
- allowed path => request path reaches client

### 3.3 `query.sql`

```text
query.sql
  -> global read
  -> response filter only
```

**Minimum check set**
- registry still accepts schema under global-read static rule
- response rows outside read scope are filtered
- warning emitted when rows removed
- implementation may use imperative `filterResponse` because `query.sql` returns an array directly

### 3.4 `file.getFile` / `file.putFile`

```text
file.getFile  -> workspace-path read target  -> workspace.read
file.putFile  -> workspace-path write target -> workspace.write
```

**Minimum check set**
- workspace.read deny blocks getFile
- workspace.write deny blocks putFile
- content deny does not interfere
- dry-run on putFile still runs guard first, then returns preview

### 3.5 `system.exit` / `pushMsg`

```text
system.exit -> invoke/runtime/control + critical override
pushMsg     -> invoke/runtime/control + safe override
```

**Minimum check set**
- registry meta reflects intended risk values
- confirmation behavior can distinguish critical runtime from safe runtime

---

## 4. Structural Blueprint

```text
P1 core contracts
  ↓ consumed by
P2 endpoint schemas
  ├─ src/apis/block/moveBlock.ts
  ├─ src/apis/block/getBlockKramdown.ts
  ├─ src/apis/query/sql.ts
  ├─ src/apis/file/getFile.ts
  ├─ src/apis/file/putFile.ts
  ├─ src/apis/system/exit.ts
  └─ src/apis/notification/pushMsg.ts
  ↓ exercised by
P2 validation
  ├─ typecheck/build
  ├─ targeted unit tests / meta assertions
  └─ command-level smoke / simulated deny cases
```

---

## 5. Non-goals in P2

```text
- migrate other file.* endpoints
- migrate block.insertBlock or other content-write endpoints
- add array payload target syntax
- redesign SQL payload-time static analysis
- remove transitional legacy bridge
```

These remain for P3 or a P1 amendment if a contract gap is discovered.
