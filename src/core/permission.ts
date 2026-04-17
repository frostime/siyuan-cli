/**
 * Permission Engine — endpoint/tool allow-deny + content/workspace scope checks.
 */
import micromatch from "micromatch";
import type { AppConfig, PermissionConfig } from "./config.js";
import type { PermissionEngineLike, RegisteredEndpoint, ResourceKind } from "./schema.js";
import { CliError, ExitCode } from "../utils/errors.js";
import type { SiyuanClient } from "./client.js";

function getPermission(config: AppConfig, workspaceName: string): PermissionConfig {
  const ws = config.workspaces[workspaceName];
  const defaults = config.defaults?.permission;
  return {
    endpoints: ws?.permission?.endpoints ?? defaults?.endpoints,
    tools: ws?.permission?.tools ?? defaults?.tools,
    content: {
      read: ws?.permission?.content?.read ?? defaults?.content?.read,
      write: ws?.permission?.content?.write ?? defaults?.content?.write,
    },
    workspace: {
      read: ws?.permission?.workspace?.read ?? defaults?.workspace?.read,
      write: ws?.permission?.workspace?.write ?? defaults?.workspace?.write,
    } as PermissionConfig["workspace"],
    confirm: ws?.permission?.confirm ?? defaults?.confirm,
  };
}

export class EndpointDisabledError extends CliError {
  constructor(endpoint: string, reason: string) {
    super(ExitCode.PERMISSION, "ENDPOINT_DISABLED", `Endpoint "${endpoint}" is disabled: ${reason}`);
  }
}

export class ToolDisabledError extends CliError {
  constructor(tool: string, reason: string) {
    super(ExitCode.PERMISSION, "TOOL_DISABLED", `Tool "${tool}" is disabled: ${reason}`);
  }
}

export class BlockNotFoundError extends CliError {
  constructor(ids: string[]) {
    super(ExitCode.GENERAL, "BLOCK_NOT_FOUND", `Block id not found: ${ids.join(", ")}`);
  }
}

export class ContentAccessDeniedError extends CliError {
  constructor(reason: string) {
    super(ExitCode.PERMISSION, "CONTENT_ACCESS_DENIED", reason);
  }
}

export class WorkspaceAccessDeniedError extends CliError {
  constructor(reason: string) {
    super(ExitCode.PERMISSION, "WORKSPACE_ACCESS_DENIED", reason);
  }
}

export class ConfirmationRequiredError extends CliError {
  constructor(endpoint: string) {
    super(
      ExitCode.GENERAL,
      "CONFIRMATION_REQUIRED",
      `Endpoint "${endpoint}" requires confirmation.`,
      "Re-run with --yes to confirm, or --dry-run to preview.",
    );
  }
}

export interface FilterResult<T> {
  kept: T[];
  removed: number;
  reasons: Record<string, number>;
}

export class PermissionEngine implements PermissionEngineLike {
  private readonly perm: PermissionConfig;
  private readonly client: SiyuanClient;
  private readonly idCache = new Map<string, { notebook: string; path: string }>();

  constructor(config: AppConfig, workspaceName: string, client: SiyuanClient) {
    this.perm = getPermission(config, workspaceName);
    this.client = client;
  }

  checkEndpoint(id: string): void {
    const api = this.perm.endpoints;
    if (!api) return;
    if (api.allow?.length && !micromatch.isMatch(id, api.allow)) {
      throw new EndpointDisabledError(id, "not in allow list");
    }
    if (api.deny?.length && micromatch.isMatch(id, api.deny)) {
      throw new EndpointDisabledError(id, "in deny list");
    }
  }

  checkTool(id: string): void {
    const tools = this.perm.tools;
    if (!tools) return;
    if (tools.allow?.length && !micromatch.isMatch(id, tools.allow)) {
      throw new ToolDisabledError(id, "not in allow list");
    }
    if (tools.deny?.length && micromatch.isMatch(id, tools.deny)) {
      throw new ToolDisabledError(id, "in deny list");
    }
  }

  /** @internal content scope predicate; prefer checkContentRef() outside this class. */
  private checkDeny(item: { id?: string; path?: string; notebook?: string }, access: "read" | "write" = "read"): { allowed: boolean; reason?: string } {
    const content = this.perm.content?.[access];
    if (!content) return { allowed: true };

    if (item.notebook && content.notebooks) {
      if (content.notebooks.allow?.length && !content.notebooks.allow.includes(item.notebook)) {
        return { allowed: false, reason: `notebook ${item.notebook} not in ${access} allow list` };
      }
      if (content.notebooks.deny?.length && content.notebooks.deny.includes(item.notebook)) {
        return { allowed: false, reason: `notebook ${item.notebook} in ${access} deny list` };
      }
    }

    if (item.path && content.paths) {
      if (content.paths.allow?.length && !micromatch.isMatch(item.path, content.paths.allow)) {
        return { allowed: false, reason: `path ${item.path} not in ${access} allow list` };
      }
      if (content.paths.deny?.length && micromatch.isMatch(item.path, content.paths.deny)) {
        return { allowed: false, reason: `path ${item.path} in ${access} deny list` };
      }
    }

    return { allowed: true };
  }

  private checkWorkspacePath(path: string, access: "read" | "write"): { allowed: boolean; reason?: string } {
    const workspace = this.perm.workspace?.[access];
    if (!workspace?.paths) return { allowed: true };
    if (workspace.paths.allow?.length && !micromatch.isMatch(path, workspace.paths.allow)) {
      return { allowed: false, reason: `workspace path ${path} not in ${access} allow list` };
    }
    if (workspace.paths.deny?.length && micromatch.isMatch(path, workspace.paths.deny)) {
      return { allowed: false, reason: `workspace path ${path} in ${access} deny list` };
    }
    return { allowed: true };
  }

  async resolveContentIds(ids: string[]): Promise<Map<string, { notebook: string; path: string }>> {
    const wanted = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, { notebook: string; path: string }>();
    const missing: string[] = [];

    for (const id of wanted) {
      const cached = this.idCache.get(id);
      if (cached) out.set(id, cached);
      else missing.push(id);
    }

    if (missing.length > 0) {
      const quoted = missing.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
      const rows = await this.client.call<Array<{ id: string; box: string; path: string }>>("/api/query/sql", {
        stmt: `SELECT id, box, path FROM blocks WHERE id IN (${quoted})`,
      });
      for (const row of rows) {
        const value = { notebook: row.box, path: row.path };
        this.idCache.set(row.id, value);
        out.set(row.id, value);
      }
      const trulyMissing = wanted.filter((id) => !out.has(id));
      if (trulyMissing.length > 0) {
        throw new BlockNotFoundError(trulyMissing);
      }
    }

    return out;
  }

  async resolveContentId(id: string): Promise<{ notebook: string; path: string }> {
    const map = await this.resolveContentIds([id]);
    return map.get(id)!;
  }

  async checkContentRef(ref: { kind: ResourceKind; value: string; access: "read" | "write" }): Promise<void> {
    if (ref.kind === "workspace-path") {
      const res = this.checkWorkspacePath(ref.value, ref.access);
      if (!res.allowed) throw new WorkspaceAccessDeniedError(res.reason ?? "workspace access denied");
      return;
    }
    if (ref.kind === "notebook") {
      const res = this.checkDeny({ notebook: ref.value }, ref.access);
      if (!res.allowed) throw new ContentAccessDeniedError(res.reason ?? "content access denied");
      return;
    }
    if (ref.kind === "path") {
      const res = this.checkDeny({ path: ref.value }, ref.access);
      if (!res.allowed) throw new ContentAccessDeniedError(res.reason ?? "content access denied");
      return;
    }
    const resolved = await this.resolveContentId(ref.value);
    const res = this.checkDeny({ notebook: resolved.notebook, path: resolved.path }, ref.access);
    if (!res.allowed) throw new ContentAccessDeniedError(res.reason ?? "content access denied");
  }

  filterItems<T>(
    items: T[],
    extract: (item: T) => { id?: string; path?: string; notebook?: string },
  ): FilterResult<T> {
    const kept: T[] = [];
    let removed = 0;
    const reasons: Record<string, number> = {};

    for (const item of items) {
      const res = this.checkDeny(extract(item), "read");
      if (res.allowed) kept.push(item);
      else {
        removed++;
        const reason = res.reason ?? "unknown";
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
    return { kept, removed, reasons };
  }

  requiresConfirmation(entry: RegisteredEndpoint): boolean {
    const riskAuto = entry.meta.requiresConfirmation;
    const confirm = this.perm.confirm;
    if (!confirm) return riskAuto;
    const c = entry.meta.classification;
    const policyMatch =
      (confirm.modes?.includes(c.mode) ?? false) ||
      (confirm.surfaces?.includes(c.surface) ?? false) ||
      (confirm.scopes?.includes(c.scope) ?? false);
    return riskAuto || policyMatch;
  }
}

export function createPermissionEngine(config: AppConfig, workspaceName: string, client: SiyuanClient): PermissionEngine {
  return new PermissionEngine(config, workspaceName, client);
}
