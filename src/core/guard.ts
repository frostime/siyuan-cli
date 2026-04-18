/**
 * Schema guard execution — payload checking + response filtering.
 */
import { deriveEndpointId, type EndpointSchema, type PermissionEngineLike, type RegisteredEndpoint } from "./schema.js";
import { ConfirmationRequiredError, type PermissionEngine } from "./permission.js";
import type { SiyuanClient } from "./client.js";

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
  const parts = path.split(".");
  let cursor = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]!] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

const HEURISTIC_FIELDS = {
  id: "id",
  blockId: "id", blockID: "id",
  parentID: "id", parentId: "id",
  rootID: "id", rootId: "id",
  docID: "id", docId: "id",
  path: "path",
  notebook: "notebook", box: "notebook", notebookID: "notebook",
} as const;

export async function heuristicPayloadGuard(
  payload: unknown,
  engine: PermissionEngineLike,
  access: "read" | "write",
  surface?: "meta" | "content" | "asset" | "workspace" | "runtime" | "network",
): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;
  for (const [key, kind] of Object.entries(HEURISTIC_FIELDS)) {
    if (typeof p[key] === "string") {
      const actualKind = key === "path" && surface === "workspace" ? "workspace-path" : kind;
      await engine.checkContentRef({ kind: actualKind, value: p[key] as string, access });
    }
  }
}

export async function applyPayloadGuard(
  schema: EndpointSchema,
  payload: unknown,
  engine: PermissionEngineLike,
  access: "read" | "write",
  surface?: "meta" | "content" | "asset" | "workspace" | "runtime" | "network",
): Promise<void> {
  const p = payload as Record<string, unknown>;
  const targets = schema.guard?.payloadTargets;
  if (targets?.length) {
    for (const target of targets) {
      const value = p[target.field];
      if (target.isArray) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === "string") {
              await engine.checkContentRef({ kind: target.kind, value: item, access: target.access });
            }
          }
        }
        continue;
      }
      if (typeof value === "string") {
        await engine.checkContentRef({ kind: target.kind, value, access: target.access });
      }
    }
    return;
  }

  const guardPayload = schema.guard?.payload;
  if (guardPayload) {
    for (const [field, kind] of Object.entries(guardPayload)) {
      const value = p[field];
      if (typeof value === "string") {
        await engine.checkContentRef({ kind: kind as any, value, access });
      }
    }
    return;
  }

  await heuristicPayloadGuard(payload, engine, access, surface);
}

/**
 * Response guards operate on the unwrapped `data` returned by SiyuanClient.
 * They do not see the raw kernel envelope `{ code, msg, data }`.
 */
export function applyResponseGuard(schema: EndpointSchema, response: unknown, engine: PermissionEngineLike): unknown {
  const guard = schema.guard;
  if (!guard) return response;
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
      const parentPath = itemsAt.replace(/\[\*\]$/, "");
      jsonpathSet(response, parentPath, kept);
      const summary = Object.entries(reasons).map(([r, n]) => `${n}x: ${r}`).join("; ");
      process.stderr.write(JSON.stringify({ warning: "CONTENT_FILTERED", removed, reasons: summary }) + "\n");
    }
  }
  return response;
}

export interface ExecuteOptions {
  entry: RegisteredEndpoint;
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

function isWriteLike(entry: RegisteredEndpoint): boolean {
  return entry.meta.classification.mode === "write" || entry.meta.classification.mode === "invoke";
}

export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
  const { entry, payload, client, engine, dryRun, yes, debug } = opts;
  const { schema } = entry;
  const { id } = deriveEndpointId(schema.endpoint);

  engine.checkEndpoint(id);
  await applyPayloadGuard(
    schema,
    payload,
    engine,
    entry.meta.classification.mode === "read" ? "read" : "write",
    entry.meta.classification.surface,
  );

  if (debug) debugPreview(schema, payload);
  if (dryRun && isWriteLike(entry)) {
    return { dryRun: true, endpoint: schema.endpoint, payload };
  }

  if (engine.requiresConfirmation(entry) && !yes) {
    throw new ConfirmationRequiredError(id);
  }

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

  return applyResponseGuard(schema, response, engine);
}
