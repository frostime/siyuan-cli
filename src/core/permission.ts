/**
 * Permission Engine — three-layer security filter.
 * Rules (config.yaml) → Engine (this file) → Extractor (schema guard / heuristic).
 * See reference/siyuan-cli-design/07-module-permission.md for full architecture.
 */
import micromatch from "micromatch";
import type { AppConfig, PermissionConfig } from "./config.js";
import type { EndpointSchema, PermissionEngineLike } from "./schema.js";
import { CliError, ExitCode } from "../utils/errors.js";

function getPermission(config: AppConfig, workspaceName: string): PermissionConfig {
  const ws = config.workspaces[workspaceName];
  const defaults = config.defaults?.permission;
  // Merge: workspace overrides defaults (shallow per section)
  return {
    api: ws?.permission?.api ?? defaults?.api,
    content: ws?.permission?.content ?? defaults?.content,
    guardWrite: ws?.permission?.guardWrite ?? defaults?.guardWrite,
  };
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class EndpointDisabledError extends CliError {
  constructor(endpoint: string, reason: string) {
    super(ExitCode.PERMISSION, "ENDPOINT_DISABLED", `Endpoint "${endpoint}" is disabled: ${reason}`);
  }
}

export class ContentAccessDeniedError extends CliError {
  constructor(reason: string) {
    super(ExitCode.PERMISSION, "CONTENT_ACCESS_DENIED", reason);
  }
}

export class ConfirmationRequiredError extends CliError {
  constructor(endpoint: string) {
    super(
      ExitCode.GENERAL,
      "CONFIRMATION_REQUIRED",
      `Endpoint "${endpoint}" requires confirmation (has mutation/dangerous tag and guardWrite is enabled).`,
      "Re-run with --yes to confirm, or --dry-run to preview.",
    );
  }
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface FilterResult<T> {
  kept: T[];
  removed: number;
  reasons: Record<string, number>;
}

export class PermissionEngine implements PermissionEngineLike {
  private readonly perm: PermissionConfig;

  constructor(config: AppConfig, workspaceName: string) {
    this.perm = getPermission(config, workspaceName);
  }

  // ─── Endpoint level ────────────────────────────────────────────────────────

  checkEndpoint(id: string): void {
    const api = this.perm.api;
    if (!api) return;

    // White-list mode: enabled list exists and is non-empty
    if (api.enabled?.length) {
      if (!micromatch.isMatch(id, api.enabled)) {
        throw new EndpointDisabledError(id, "not in allow list");
      }
    }

    // Black-list: disabled glob
    if (api.disabled?.length && micromatch.isMatch(id, api.disabled)) {
      throw new EndpointDisabledError(id, "in deny list");
    }
  }

  // ─── Content level ─────────────────────────────────────────────────────────

  checkDeny(item: { id?: string; path?: string; notebook?: string }): { allowed: boolean; reason?: string } {
    const content = this.perm.content;
    if (!content) return { allowed: true };

    const { notebooks, paths } = content;

    // Notebook dimension
    if (item.notebook && notebooks) {
      if (notebooks.allow?.length && !notebooks.allow.includes(item.notebook)) {
        return { allowed: false, reason: `notebook ${item.notebook} not in allow list` };
      }
      if (notebooks.deny?.length && notebooks.deny.includes(item.notebook)) {
        return { allowed: false, reason: `notebook ${item.notebook} in deny list` };
      }
    }

    // Path dimension
    if (item.path && paths) {
      if (paths.allow?.length && !micromatch.isMatch(item.path, paths.allow)) {
        return { allowed: false, reason: `path ${item.path} not in allow list` };
      }
      if (paths.deny?.length && micromatch.isMatch(item.path, paths.deny)) {
        return { allowed: false, reason: `path ${item.path} in deny list` };
      }
    }

    return { allowed: true };
  }

  filterItems<T>(
    items: T[],
    extract: (item: T) => { id?: string; path?: string; notebook?: string },
  ): FilterResult<T> {
    const kept: T[] = [];
    let removed = 0;
    const reasons: Record<string, number> = {};

    for (const item of items) {
      const res = this.checkDeny(extract(item));
      if (res.allowed) {
        kept.push(item);
      } else {
        removed++;
        const reason = res.reason ?? "unknown";
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }

    return { kept, removed, reasons };
  }

  // ─── Write protection ──────────────────────────────────────────────────────

  requiresConfirmation(schema: EndpointSchema): boolean {
    if (!this.perm.guardWrite) return false;
    return schema.tags?.includes("mutation") === true || schema.tags?.includes("dangerous") === true;
  }
}

/** Create a no-op engine (when workspace has no permission config). */
export function createPermissionEngine(config: AppConfig, workspaceName: string): PermissionEngine {
  return new PermissionEngine(config, workspaceName);
}
