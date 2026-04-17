/**
 * Config file management for siyuan-cli.
 * Format: ~/.config/siyuan-cli/config.yaml (see design.md §1)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, copyFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "pathe";
import { parse, stringify } from "yaml";
import { getConfigPath } from "../utils/paths.js";
import { CliError, ExitCode } from "../utils/errors.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotebookID = string; // siyuan notebook id
export type BlockID = string; // siyuan block id
export type BlockPath = string; // /<parent_id>/<child_id>/... (siyuan block path)
export type BlockHPath = string; // /ParentDoc/ChildBlock/ (siyuan block hpath)

export interface PermissionConfig {
  api?: {
    disabled?: string[];
    enabled?: string[];
  };
  content?: {
    notebooks?: { deny?: NotebookID[]; allow?: NotebookID[] };
    paths?: { deny?: BlockPath[]; allow?: BlockPath[] };
  };
  guardWrite?: boolean;
}

export interface TokenSource {
  type: "env" | "file" | "command";
  value: string;
}

export interface WorkspaceEntry {
  baseUrl: string;
  token?: string;
  tokenSource?: TokenSource;
  permission?: PermissionConfig;
}

export interface AppConfig {
  schemaVersion: number;
  current: string;
  workspaces: Record<string, WorkspaceEntry>;
  defaults?: {
    permission?: PermissionConfig;
  };
  api?: {
    disabled?: string[];
  };
}

export interface ResolvedWorkspace extends WorkspaceEntry {
  name: string;
  token?: string;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

function defaultConfig(): AppConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    current: "",
    workspaces: {},
  };
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

function migrateLegacyWindowsConfig(targetPath: string): void {
  const appdata = process.env["APPDATA"];
  if (!appdata) return;

  const legacyPath = join(appdata, "siyuan-cli", "config.yaml");
  if (legacyPath === targetPath) return;
  if (!existsSync(legacyPath) || existsSync(targetPath)) return;

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(legacyPath, targetPath);
  process.stderr.write(
    JSON.stringify({ notice: "CONFIG_MIGRATED", from: legacyPath, to: targetPath }) + "\n",
  );
  try {
    unlinkSync(legacyPath);
  } catch {
    // keep legacy copy if deletion fails
  }
}

export function loadConfig(configPath?: string): AppConfig {
  const path = configPath ?? getConfigPath();
  migrateLegacyWindowsConfig(path);

  if (!existsSync(path)) {
    return defaultConfig();
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw) as Partial<AppConfig>;
    return {
      schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION,
      current: parsed.current ?? "",
      workspaces: parsed.workspaces ?? {},
      ...(parsed.defaults ? { defaults: parsed.defaults } : {}),
      ...(parsed.api ? { api: parsed.api } : {}),
    };
  } catch (e) {
    throw new CliError(
      ExitCode.CONFIG,
      "CONFIG_PARSE_ERROR",
      `Failed to parse config at ${path}: ${e instanceof Error ? e.message : String(e)}`,
      "Try deleting the config file and re-running `siyuan workspace add`.",
    );
  }
}

export function saveConfig(config: AppConfig, configPath?: string): void {
  const path = configPath ?? getConfigPath();
  migrateLegacyWindowsConfig(path);
  const dir = dirname(path);

  mkdirSync(dir, { recursive: true });

  // Atomic write: write to tmp, then rename is not trivially cross-platform,
  // so we do a direct write with a try/catch instead.
  writeFileSync(path, stringify(config), "utf-8");

  // Protect token: restrict to owner only (no-op on Windows)
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows — silently ignore
  }
}

// ─── Workspace Resolution ────────────────────────────────────────────────────

export interface WorkspaceOverrides {
  workspace?: string;  // --workspace <name>
  baseUrl?: string;    // --baseUrl (ad-hoc, skips config lookup)
  token?: string;      // --token (ad-hoc)
}

function resolveTokenSource(source?: TokenSource): string | undefined {
  if (!source) return undefined;
  if (source.type === "env") {
    return process.env[source.value];
  }
  if (source.type === "file") {
    return readFileSync(source.value, "utf-8").split(/\r?\n/, 1)[0]?.trim();
  }
  if (source.type === "command") {
    return execSync(source.value, { encoding: "utf-8" }).trim();
  }
  return undefined;
}

/**
 * Resolve the active workspace from:
 *   1. --baseUrl (ad-hoc, no name)
 *   2. --workspace flag
 *   3. $SIYUAN_CLI_WORKSPACE env
 *   4. config.current
 */
export function resolveWorkspace(
  config: AppConfig,
  overrides: WorkspaceOverrides = {},
): ResolvedWorkspace {
  // Ad-hoc: --baseUrl bypasses workspace lookup entirely
  if (overrides.baseUrl) {
    return {
      name: "<ad-hoc>",
      baseUrl: overrides.baseUrl,
      ...(overrides.token ? { token: overrides.token } : {}),
    };
  }

  const name =
    overrides.workspace ??
    process.env["SIYUAN_CLI_WORKSPACE"] ??
    config.current;

  if (!name) {
    throw new CliError(
      ExitCode.CONFIG,
      "NO_WORKSPACE",
      "No active workspace. Run `siyuan workspace add <name> --url <url>` first.",
      "Or pass --workspace <name> to specify one explicitly.",
    );
  }

  const entry = config.workspaces[name];
  if (!entry) {
    throw new CliError(
      ExitCode.CONFIG,
      "WORKSPACE_NOT_FOUND",
      `Workspace "${name}" not found in config.`,
      `Run \`siyuan workspace list\` to see available workspaces.`,
    );
  }

  const token = overrides.token ?? process.env["SIYUAN_CLI_TOKEN"] ?? resolveTokenSource(entry.tokenSource) ?? entry.token;

  return {
    name,
    baseUrl: entry.baseUrl,
    ...(token ? { token } : {}),
    ...(entry.tokenSource ? { tokenSource: entry.tokenSource } : {}),
  };
}
