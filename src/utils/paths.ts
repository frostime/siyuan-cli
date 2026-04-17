/**
 * Cross-platform config directory resolution.
 * Priority: $SIYUAN_CLI_CONFIG > XDG_CONFIG_HOME/siyuan-cli > ~/.config/siyuan-cli
 *
 * Project decision: use ~/.config/siyuan-cli uniformly across platforms,
 * including Windows. `%APPDATA%` is treated as a legacy migration source only.
 */
import { basename, extname, join } from "pathe";
import { homedir } from "node:os";

export function getConfigDir(): string {
  // Explicit override. If it points to a file, return its parent directory.
  const explicit = process.env["SIYUAN_CLI_CONFIG"];
  if (explicit) {
    if (basename(explicit) === "config.yaml" || extname(explicit) === ".yaml") {
      return explicit.slice(0, explicit.length - basename(explicit).length).replace(/[\\/]$/, "");
    }
    return explicit;
  }

  // XDG (all platforms if explicitly set)
  if (process.env["XDG_CONFIG_HOME"]) {
    return join(process.env["XDG_CONFIG_HOME"], "siyuan-cli");
  }

  // Default ~/.config/siyuan-cli (all platforms)
  return join(homedir(), ".config", "siyuan-cli");
}

export function getConfigPath(configDir?: string): string {
  const explicit = process.env["SIYUAN_CLI_CONFIG"];
  if (!configDir && explicit && (basename(explicit) === "config.yaml" || extname(explicit) === ".yaml")) {
    return explicit;
  }
  return join(configDir ?? getConfigDir(), "config.yaml");
}

