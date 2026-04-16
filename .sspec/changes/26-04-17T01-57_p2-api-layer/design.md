# P2 Design

> 记录 implementation-level 接口契约。完整架构见 reference/siyuan-cli-design/04-module-api.md 和 07-module-permission.md。

## 1. Registry 接口

```ts
// src/core/registry.ts
export interface RegisteredEndpoint {
  id: string;       // "query.sql"
  group: string;    // "query"
  name: string;     // "sql"
  schema: EndpointSchema;
}

// 派生规则：/api/<group>/<name> → id="<group>.<name>"
export function deriveEndpointId(endpoint: string): { id: string; group: string; name: string }

// 所有 endpoint 的注册表（从 src/apis/index.ts 统一导入后注册）
export class EndpointRegistry {
  register(schema: EndpointSchema): void
  get(id: string): RegisteredEndpoint | undefined
  list(filter?: { group?: string; tag?: string }): RegisteredEndpoint[]
}

export const registry: EndpointRegistry  // 全局单例
```

## 2. Permission Engine 接口

```ts
// src/core/permission.ts
// 直接实现 07-module-permission.md §3.1 的接口

export class PermissionEngine {
  constructor(config: AppConfig, workspaceName: string)

  checkEndpoint(id: string): void                  // throws EndpointDisabledError (exit 5)
  checkDeny(item: { id?:string; path?:string; notebook?:string }): { allowed:boolean; reason?:string }
  filterItems<T>(items: T[], extract: (item:T)=>{id?:string;path?:string;notebook?:string}): FilterResult<T>
  requiresConfirmation(schema: EndpointSchema): boolean
}

interface FilterResult<T> {
  kept: T[];
  removed: number;
  reasons: Record<string, number>;
}
```

## 3. argv → payload 解析规则

完整规则见 reference 04-module-api.md §3。关键点：

1. `--json / -j <json>` → base payload（JSON.parse）
2. `--file / -f <path>` → base payload from file（`-` = stdin）
3. 具名 flag `--<field> <value>` → 覆盖 / 叠加 base
4. 位置参数 → schema.cli.primary 字段（仅当 schema 定义了 primary）
5. input source 解析（仅对 allowSource 声明的字段生效）：
   - `@file:<path>` → 读文件内容作为字符串
   - `@stdin` 或 `-` → 读 stdin
   - `@env:<VAR>` → 读环境变量
6. JSON Schema 验证（ajv）
7. array 字段：多次 `--field val` 累积为数组

## 4. Guard 执行流程

```
executeEndpoint(schema, payload, { client, engine, args }):
  1. engine.checkEndpoint(id)
  2. if schema.guard?.payload:
       apply payload guard (声明式)
     else:
       heuristicPayloadGuard(payload, engine)
  3. if args.dryRun: return { dryRun: true, endpoint, payload }
  4. if requiresConfirmation && !args.yes: throw ConfirmationRequiredError
  5. response = schema.multipart ? client.upload(...) : client.call(...)
  6. if schema.guard?.filterResponse: response = filterResponse(response, engine)
     elif schema.guard?.response: apply declarative response guard
  7. return response
```

极简 jsonpath（仅支持 `field.sub` 和 `field[*]`，20 行实现，不引入依赖）。

## 5. 输出格式

`siyuan api <id>` stdout：直接输出 kernel `response.data` 的 JSON（不包 wrapper）。

```bash
# 成功
{"rows":[...]}     # query.sql 的 data 是数组

# 失败 → stderr JSON + exit code
{"error":"ENDPOINT_DISABLED","endpoint":"system.exit","message":"..."}
```

`siyuan api list` stdout：
```json
[{"id":"query.sql","endpoint":"/api/query/sql","summary":"...","tags":["read","query"]}]
```

`siyuan api describe <id>` stdout：完整 EndpointSchema JSON。
