/**
 * Schema type definitions for endpoints (kernel API) and tools (business wrappers).
 *
 * Endpoint design:
 * - `classification` is the authored truth for endpoint schemas.
 * - runtime consumers read `RegisteredEndpoint.meta`.
 */

export type InputSource = "literal" | "file" | "stdin" | "env";

export type ToolTag = "read" | "write" | "aggregate" | "util";
export type GuardFieldKind = "id" | "path" | "notebook";

export type EndpointMode = "read" | "write" | "invoke";
export type EndpointSurface = "meta" | "content" | "asset" | "workspace" | "runtime" | "network";
export type EndpointScope = "single" | "batch" | "global";
export type EndpointOperation =
  | "inspect"
  | "search"
  | "query"
  | "create"
  | "update"
  | "delete"
  | "move"
  | "upload"
  | "control";
export type RiskLabel = "safe" | "sensitive" | "elevated" | "destructive" | "critical";
export type ResourceKind = "id" | "notebook" | "path" | "workspace-path";

// ————— JSONSchema subset (we rely on ajv for validation) —————
export type JSONSchemaProperty = {
  type?: "string" | "integer" | "number" | "boolean" | "array" | "object" | "null";
  description?: string;
  enum?: readonly unknown[];
  default?: unknown;
  pattern?: string;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: readonly string[];
  additionalProperties?: boolean;
  format?: string;
};

export type JSONSchema = JSONSchemaProperty & {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
};

// ————— CLI behavior —————
export interface CliBehavior {
  /** If the payload has exactly one required string field, allow positional. */
  primary?: string;
  examples?: Array<{ command: string; description?: string }>;
  /** Short-flag aliases, e.g. { stmt: "s" }. */
  aliases?: Record<string, string>;
  /** Allowed input sources per field. Missing entries default to ["literal"]. */
  allowSource?: Record<string, InputSource[]>;
}

// ————— Permission guard —————
export interface PayloadTargetSpec {
  field: string;
  kind: ResourceKind;
  access: "read" | "write";
  /** When true, payload[field] is treated as string[] and any denied item rejects the request. */
  isArray?: boolean;
}

export interface GuardSpec {
  /** New payload guard contract (P1+). */
  payloadTargets?: PayloadTargetSpec[];
  /** Legacy payload guard contract accepted during rollout. */
  payload?: Record<string, GuardFieldKind>;

  /**
   * Declarative response extractor.
   * `itemsAt` is evaluated against the unwrapped `data` value returned by SiyuanClient,
   * not the raw kernel envelope `{ code, msg, data }`.
   * Examples: `blocks[*]`, `notebooks[*]`. Root arrays should use `filterResponse`.
   * TODO(Px): consider upgrading this minimal path syntax to full JSONPath support,
   * including root arrays like `[*]` and nested selections like `[*].id`.
   */
  response?: {
    /** Minimal jsonpath: "blocks[*]" / "notebooks[*]". */
    itemsAt: string;
    /** Which field within each item is the id / path / notebook. */
    fieldMap: Partial<Record<GuardFieldKind, string>>;
  };

  /** Imperative fallback — called if declarative response extractor can't express the logic. */
  filterResponse?: (response: unknown, engine: PermissionEngineLike) => unknown;
}

export interface EndpointClassification {
  mode: EndpointMode;
  surface: EndpointSurface;
  scope: EndpointScope;
  operation?: EndpointOperation;
  riskOverride?: RiskLabel;
}

export interface DerivedMeta {
  classification: EndpointClassification;
  tags: string[];
  risk: RiskLabel;
  /** Base confirmation derived from risk only. Workspace policies may extend it at runtime. */
  requiresConfirmation: boolean;
}

/**
 * Minimal shape of the permission engine that schema guards need.
 * The real engine (src/core/permission.ts) implements this + more.
 */
export interface PermissionEngineLike {
  checkEndpoint(id: string): void;
  checkTool(id: string): void;
  checkContentRef(ref: { kind: ResourceKind; value: string; access: "read" | "write" }): Promise<void>;
  resolveContentIds(ids: string[]): Promise<Map<string, { notebook: string; path: string }>>;
  resolveContentId(id: string): Promise<{ notebook: string; path: string }>;
  filterItems<T>(
    items: T[],
    extract: (item: T) => { id?: string; path?: string; notebook?: string },
  ): { kept: T[]; removed: number; reasons: Record<string, number> };
}

// ————— EndpointSchema —————
export interface EndpointSchema {
  /** The only authoritative identity — e.g. "/api/query/sql". */
  endpoint: string;
  summary: string;
  description?: string;
  payload: JSONSchema;
  response?: JSONSchemaProperty;

  /** Authored endpoint classification. */
  classification: EndpointClassification;

  minKernelVersion?: string;
  deprecated?: { replacement?: string; removeAt?: string; reason?: string };
  /** For endpoints that use multipart/form-data instead of JSON body. */
  multipart?: { fileFields: string[] };
  cli?: CliBehavior;
  guard?: GuardSpec;
}

/** Derived, normalized view of EndpointSchema (produced by the registry). */
export interface RegisteredEndpoint {
  schema: EndpointSchema;
  id: string;
  group: string;
  name: string;
  meta: DerivedMeta;
}

// ————— ToolSchema —————
export interface ToolResult {
  content: string;
  details?: unknown;
  warnings?: string[];
  meta?: { elapsedMs?: number; filteredCount?: number; truncated?: boolean };
}

export interface ToolContext {
  client: unknown;
  registry: unknown;
  permission: PermissionEngineLike;
  callEndpoint: <T = unknown>(id: string, payload: unknown) => Promise<T>;
  callEndpointRaw: <T = unknown>(id: string, payload: unknown) => Promise<T>;
  logger: unknown;
  args: GlobalArgs;
}

export interface GlobalArgs {
  workspace?: string;
  baseUrl?: string;
  token?: string;
  format?: "json" | "pretty" | "yaml";
  debug?: boolean;
  dryRun?: boolean;
  config?: string;
  yes?: boolean;
  details?: boolean;
  only?: "content" | "details";
}

export interface ToolSchema {
  id: string; // kebab-case
  summary: string;
  description?: string;
  tags?: ToolTag[];
  input: JSONSchema;
  output?: JSONSchemaProperty;
  cli?: CliBehavior;
  run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
}

// ————— Helpers —————
export function deriveEndpointId(endpoint: string): { id: string; group: string; name: string } {
  const m = /^\/api\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)$/.exec(endpoint);
  if (!m) {
    throw new Error(`Invalid endpoint "${endpoint}": expected shape /api/<group>/<name>`);
  }
  const group = m[1]!;
  const name = m[2]!;
  return { id: `${group}.${name}`, group, name };
}
