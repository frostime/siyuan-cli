/**
 * Cross-platform config directory resolution.
 * Priority: $SIYUAN_CLI_CONFIG > XDG_CONFIG_HOME/siyuan-cli > ~/.config/siyuan-cli
 * Windows fallback: %APPDATA%/siyuan-cli
 */
import { join } from "pathe";
import { homedir } from "node:os";

export function getConfigDir(): string {
  // Explicit override
  if (process.env["SIYUAN_CLI_CONFIG"]) {
    return process.env["SIYUAN_CLI_CONFIG"];
  }

  // XDG (Linux/macOS)
  if (process.env["XDG_CONFIG_HOME"]) {
    return join(process.env["XDG_CONFIG_HOME"], "siyuan-cli");
  }

  // Windows APPDATA
  if (process.platform === "win32" && process.env["APPDATA"]) {
    return join(process.env["APPDATA"], "siyuan-cli");
  }

  // Default ~/.config/siyuan-cli
  return join(homedir(), ".config", "siyuan-cli");
}

export function getConfigPath(configDir?: string): string {
  return join(configDir ?? getConfigDir(), "config.yaml");
}
