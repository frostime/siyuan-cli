/**
 * Schema type definitions for endpoints (kernel API) and tools (business wrappers).
 *
 * Key design (v2):
 * - `endpoint` (e.g. "/api/query/sql") is the ONLY authoritative identity field.
 *   `id` / `group` / `name` are derived at registration time.
 * - Input source handling is EXPLICIT via `cli.allowSource`. Values are passed
 *   literally unless a prefix like `@file:`, `@stdin`, `@env:` is used AND the
 *   field's allowSource includes the corresponding kind.
 */

export type InputSource = "literal" | "file" | "stdin" | "env";

export type EndpointTag = "read" | "write" | "mutation" | "dangerous" | "upload" | "query";

export type ToolTag = "read" | "write" | "aggregate" | "util";

export type GuardFieldKind = "id" | "path" | "notebook";

// ————— JSONSchema subset (we rely on ajv for validation) —————
// Full JSON Schema Draft 2020-12 is supported by ajv; we type only what we use.
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

  /**
   * Allowed input sources per field. Missing entries default to ["literal"]
   * (only literal values accepted; no @file:/@stdin/@env: expansion).
   */
  allowSource?: Record<string, InputSource[]>;
}

// ————— Permission guard —————
export interface GuardSpec {
  /** Map payload field name → what kind of entity it is (for checkDeny). */
  payload?: Record<string, GuardFieldKind>;

  /** Declarative response extractor. */
  response?: {
    /** Minimal jsonpath: "data[*]" / "data.blocks[*]". */
    itemsAt: string;
    /** Which field within each item is the id / path / notebook. */
    fieldMap: Partial<Record<GuardFieldKind, string>>;
  };

  /** Imperative fallback — called if declarative response extractor can't express the logic. */
  filterResponse?: (response: unknown, engine: PermissionEngineLike) => unknown;
}

/**
 * Minimal shape of the permission engine that schema guards need.
 * The real engine (src/core/permission.ts) implements this + more.
 */
export interface PermissionEngineLike {
  checkDeny(item: { id?: string; path?: string; notebook?: string }): { allowed: boolean; reason?: string };
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

  tags?: EndpointTag[];

  minKernelVersion?: string;
  deprecated?: { replacement?: string; removeAt?: string; reason?: string };

  /** For endpoints that use multipart/form-data instead of JSON body. */
  multipart?: { fileFields: string[] };

  cli?: CliBehavior;
  guard?: GuardSpec;
}

/** Derived view of EndpointSchema (produced by the registry). */
export interface RegisteredEndpoint {
  schema: EndpointSchema;
  /** e.g. "query.sql" */
  id: string;
  /** e.g. "query" */
  group: string;
  /** e.g. "sql" */
  name: string;
}

// ————— ToolSchema —————
export interface ToolResult {
  /** Human-/agent-readable text. Default stdout. */
  content: string;
  /** Structured companion. Emitted only with --details or --only details. */
  details?: unknown;
  /** Non-fatal warnings, printed to stderr. */
  warnings?: string[];
  /** Debug-only metadata, printed to stderr when --debug. */
  meta?: { elapsedMs?: number; filteredCount?: number; truncated?: boolean };
}

export interface ToolContext {
  /* Implementations provided by src/core/* at runtime. */
  client: unknown;
  registry: unknown;
  permission: PermissionEngineLike;

  /** Recommended way to call the kernel: goes through permission engine. */
  callEndpoint: <T = unknown>(id: string, payload: unknown) => Promise<T>;
  /** Bypass guard; use with care. Tool must do filtering itself. */
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
  /** Tool-specific: control output form. */
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

/**
 * Derive id / group / name from "/api/<group>/<n>".
 * Throws if endpoint doesn't match the two-segment shape.
 */
export function deriveEndpointId(endpoint: string): { id: string; group: string; name: string } {
  const m = /^\/api\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)$/.exec(endpoint);
  if (!m) {
    throw new Error(
      `Invalid endpoint "${endpoint}": expected shape /api/<group>/<name>`,
    );
  }
  const group = m[1]!;
  const name = m[2]!;
  return { id: `${group}.${name}`, group, name };
}
