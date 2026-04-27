/**
 * MSYS2/Cygwin path normalization.
 *
 * When running in MSYS2/Git Bash, the shell converts POSIX-style paths
 * (anything starting with `/`) into Windows paths before passing them to
 * Node.js. For example:
 *   `/`                     → `G:/Enviroment/msys2/`
 *   `/temp`                 → `G:/Enviroment/msys2/temp`
 *   `/20260417-abc/test`    → `G:/Enviroment/msys2/20260417-abc/test`
 *
 * This is disastrous for SiYuan CLI, since SiYuan paths are virtual
 * filesystem paths that always start with `/`. This module detects the
 * conversion and reverses it for fields known to be SiYuan paths.
 *
 * Detection strategy: check for `cygpath` availability (present in all
 * MSYS2/Cygwin/Git Bash environments). If `cygpath` exists, derive the
 * MSYS root via `cygpath -w /` and cache it.
 *
 * Safety: if the MSYS root is too short (just a drive root like `C:/`),
 * normalization is disabled because the false-positive risk outweighs the
 * benefit — any `C:/...` value would be incorrectly stripped.
 *
 * @module msys-path
 */

import { execSync } from 'node:child_process';

// ─── Detection ────────────────────────────────────────────────────────────────

let cachedDetected: boolean | undefined;

/**
 * Detect whether we're in an MSYS2/Cygwin/Git Bash environment.
 * Uses `cygpath` availability as the signature — it only exists in such shells.
 */
export function isMsysLike(): boolean {
  if (cachedDetected !== undefined) return cachedDetected;
  try {
    execSync('cygpath --version', {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    cachedDetected = true;
  } catch {
    cachedDetected = false;
  }
  return cachedDetected;
}

// ─── MSYS root ────────────────────────────────────────────────────────────────

let cachedRoot: string | null | undefined;

/**_driveRootRegex matches Windows drive roots like `C:/` or `D:\`. */
const DRIVE_ROOT_REGEX = /^[A-Za-z]:[\\/]$/;

/**
 * Derive the Windows path that MSYS2 maps `/` to.
 * Uses `cygpath -w /` when available (fast, <10ms).
 *
 * Safety guard: if the result is a bare drive root (e.g. `C:/`),
 * returns `null` — the false-positive risk of stripping `C:/` from
 * arbitrary string values outweighs the benefit.
 *
 * Returns `null` if not in an MSYS environment, `cygpath` is unavailable,
 * or the root is a bare drive root.
 */
export function getMsysRootWin(): string | null {
  if (cachedRoot !== undefined) return cachedRoot;

  if (!isMsysLike()) {
    cachedRoot = null;
    return null;
  }

  try {
    const result = execSync('cygpath -w /', {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
      .trim()
      .replace(/\\/g, '/');

    // Safety: refuse to use a bare drive root as prefix.
    // e.g. "C:/" — too many false positives if we strip this.
    if (DRIVE_ROOT_REGEX.test(result)) {
      cachedRoot = null;
      return null;
    }

    cachedRoot = result.endsWith('/') ? result : result + '/';
    return cachedRoot;
  } catch {
    cachedRoot = null;
    return null;
  }
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * If `value` starts with the MSYS root prefix, strip the prefix and
 * restore the leading `/`. Otherwise return `value` unchanged.
 */
export function normalizeMsysPath(value: string, msysRoot: string): string {
  if (value.toLowerCase().startsWith(msysRoot.toLowerCase())) {
    return '/' + value.slice(msysRoot.length);
  }
  return value;
}

/**
 * Resource kinds that represent SiYuan virtual paths (never local filesystem paths).
 * Only these fields should be normalized.
 */
const SIYUAN_PATH_KINDS = new Set(['path', 'workspace-path']);

/**
 * Normalize MSYS-converted path values in a payload object.
 *
 * For each field listed in `payloadTargets` whose `kind` is a SiYuan path kind,
 * if the value starts with the MSYS root prefix, strip the prefix and restore
 * the leading `/`.
 *
 * Safety guards:
 * 1. Only processes fields with `kind === 'path' | 'workspace-path'`
 * 2. Skips normalization if MSYS root is a bare drive root (too risky)
 * 3. Only modifies string values or string arrays — other types are untouched
 *
 * Mutates `payload` in-place and returns it for chaining.
 */
export function normalizePayloadPaths(
  payload: Record<string, unknown>,
  payloadTargets?: Array<{ path: string; kind: string }>
): Record<string, unknown> {
  const msysRoot = getMsysRootWin();
  if (!msysRoot || !payloadTargets?.length) return payload;

  for (const target of payloadTargets) {
    if (!SIYUAN_PATH_KINDS.has(target.kind)) continue;

    // Handle simple top-level fields and JSON Pointer paths (e.g. "paths[*]")
    const field = target.path.includes('[')
      ? target.path.split('[')[0]!
      : target.path;

    const value = payload[field]!;
    if (typeof value === 'string') {
      payload[field] = normalizeMsysPath(value, msysRoot);
    } else if (Array.isArray(value)) {
      payload[field] = value.map((v) =>
        typeof v === 'string' ? normalizeMsysPath(v, msysRoot) : v
      );
    }
  }

  return payload;
}