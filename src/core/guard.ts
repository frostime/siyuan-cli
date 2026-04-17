/**
 * Schema guard execution — payload checking + response filtering.
 * See reference/siyuan-cli-design/07-module-permission.md §4-5.
 */
import type { EndpointSchema, PermissionEngineLike, GuardFieldKind } from "./schema.js";
import { ContentAccessDeniedError, ConfirmationRequiredError, type PermissionEngine } from "./permission.js";
import type { SiyuanClient } from "./client.js";

// ─── Minimal jsonpath ─────────────────────────────────────────────────────────
// Supports: "field", "field.sub", "field[*]", "field.sub[*]"
// Does NOT support wildcards, filters, or recursive descent.

function jsonpathGet(obj: unknown, path: string): unknown[] {
  const parts = path.split(".");
  let current: unknown[] = [obj];

  for (const part of parts) {
    const arrayMatch = /^([a-zA-Z0-9_$]+)\[\*\]$/.exec(part);
    const next: unknown[] = [];

    if (arrayMatch) {
      const key = arrayMatch[1]!;
      for (const item of current) {
        if (item && typeof item === "object") {
          const arr = (item as Record<string, unknown>)[key];
          if (Array.isArray(arr)) next.push(...arr);
        }
      }
    } else {
      for (const item of current) {
        if (item && typeof item === "object") {
          const val = (item as Record<string, unknown>)[part];
          if (val !== undefined) next.push(val);
        }
      }
    }

    current = next;
  }

  return current;
}

function jsonpathSet(obj: unknown, path: string, value: unknown): void {
  // Only supports "a.b" style (no array expansion) — used to write back filtered arrays
  const parts = path.split(".");
  let cursor = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]!] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

// ─── Heuristic payload guard ──────────────────────────────────────────────────

const HEURISTIC_FIELDS: Record<string, GuardFieldKind> = {
  id: "id",
  blockId: "id", blockID: "id",
  parentID: "id", parentId: "id",
  rootID: "id", rootId: "id",
  docID: "id", docId: "id",
  path: "path",
  notebook: "notebook", box: "notebook", notebookID: "notebook",
};

export function heuristicPayloadGuard(payload: unknown, engine: PermissionEngineLike): void {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;
  const item: { id?: string; path?: string; notebook?: string } = {};

  for (const [key, kind] of Object.entries(HEURISTIC_FIELDS)) {
    if (typeof p[key] === "string") {
      item[kind] = p[key] as string;
    }
  }

  if (Object.keys(item).length > 0) {
    const res = engine.checkDeny(item);
    if (!res.allowed) throw new ContentAccessDeniedError(res.reason ?? "access denied");
  }
}

// ─── Declarative payload guard ────────────────────────────────────────────────

export function applyPayloadGuard(schema: EndpointSchema, payload: unknown, engine: PermissionEngineLike): void {
  const guardPayload = schema.guard?.payload;
  if (!guardPayload) {
    heuristicPayloadGuard(payload, engine);
    return;
  }

  const p = payload as Record<string, unknown>;
  const item: { id?: string; path?: string; notebook?: string } = {};

  for (const [field, kind] of Object.entries(guardPayload)) {
    if (typeof p[field] === "string") {
      item[kind] = p[field] as string;
    }
  }

  if (Object.keys(item).length > 0) {
    const res = engine.checkDeny(item);
    if (!res.allowed) throw new ContentAccessDeniedError(res.reason ?? "access denied");
  }
}

// ─── Response guard ───────────────────────────────────────────────────────────

export function applyResponseGuard(schema: EndpointSchema, response: unknown, engine: PermissionEngineLike): unknown {
  const guard = schema.guard;
  if (!guard) return response;

  // Imperative hook takes priority
  if (guard.filterResponse) {
    return guard.filterResponse(response, engine);
  }

  if (guard.response) {
    const { itemsAt, fieldMap } = guard.response;
    const items = jsonpathGet(response, itemsAt);

    const { kept, removed, reasons } = engine.filterItems(items, (item) => {
      const i = item as Record<string, unknown>;
      return {
        id: fieldMap.id ? (i[fieldMap.id] as string | undefined) : undefined,
        path: fieldMap.path ? (i[fieldMap.path] as string | undefined) : undefined,
        notebook: fieldMap.notebook ? (i[fieldMap.notebook] as string | undefined) : undefined,
      };
    });

    if (removed > 0) {
      // Write filtered array back to response
      // itemsAt ends with "[*]" — strip that to get the parent path
      const parentPath = itemsAt.replace(/\[\*\]$/, "");
      jsonpathSet(response, parentPath, kept);
      // Emit filter info to stderr (non-blocking)
      const summary = Object.entries(reasons).map(([r, n]) => `${n}x: ${r}`).join("; ");
      process.stderr.write(
        JSON.stringify({ warning: "CONTENT_FILTERED", removed, reasons: summary }) + "\n",
      );
    }
  }

  return response;
}

// ─── Main execution flow ──────────────────────────────────────────────────────

export interface ExecuteOptions {
  schema: EndpointSchema;
  payload: unknown;
  client: SiyuanClient;
  engine: PermissionEngine;
  dryRun?: boolean;
  yes?: boolean;
  debug?: boolean;
}

function debugPreview(schema: EndpointSchema, payload: unknown): void {
  const body = JSON.stringify(payload);
  const curl = `curl -X POST <baseUrl>${schema.endpoint} -H "Content-Type: application/json" --data ${JSON.stringify(body)}`;
  process.stderr.write(JSON.stringify({ debug: { endpoint: schema.endpoint, payload, curl } }) + "\n");
}

export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
  const { schema, payload, client, engine, dryRun, yes, debug } = opts;
  const { id } = await import("./schema.js").then((m) => m.deriveEndpointId(schema.endpoint));

  // 1. Endpoint-level permission
  engine.checkEndpoint(id);

  // 2. Payload guard
  applyPayloadGuard(schema, payload, engine);

  // 3. Dry-run
  if (debug) {
    debugPreview(schema, payload);
  }
  if (dryRun) {
    return { dryRun: true, endpoint: schema.endpoint, payload };
  }

  // 4. Write protection
  if (engine.requiresConfirmation(schema) && !yes) {
    throw new ConfirmationRequiredError(id);
  }

  // 5. Send request
  let response: unknown;
  if (schema.multipart) {
    const files = (schema.multipart.fileFields || []).flatMap((field) => {
      const val = (payload as Record<string, unknown>)[field];
      const paths = Array.isArray(val) ? val : [val];
      return (paths as string[]).map((p) => ({ field, path: p }));
    });
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      if (!schema.multipart.fileFields.includes(k) && typeof v === "string") {
        fields[k] = v;
      }
    }
    response = await client.upload(schema.endpoint, files, fields);
  } else {
    response = await client.call(schema.endpoint, payload);
  }

  // 6. Response guard
  return applyResponseGuard(schema, response, engine);
}
