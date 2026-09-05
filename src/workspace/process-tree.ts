/**
 * Platform-neutral process ancestry capture for process binding.
 *
 * This module owns:
 *   - the process node model: pid (identity base), ppid (ancestry relation),
 *     name / executablePath / commandSignature (role metadata), startId
 *     (platform process-start identity, best-effort);
 *   - ancestry capture per platform: Windows (one PowerShell CIM query),
 *     Linux (/proc), macOS (ps, best-effort);
 *   - pure process-instance matching and nearest-common-ancestor selection.
 *
 * Security boundary: raw command lines may contain tokens, prompts, or
 * paths. They live only inside capture functions; exported nodes carry a
 * signature hash and a redacted summary, never the raw text.
 *
 * Matching contract: PID + startId is the
 * strong process-instance identity. When startId is unavailable on either
 * side, matching degrades to PID + command signature ('pid+signature') and
 * never to bare PID. Capture failure is a structured CliError, not a
 * silent fallback.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { basename } from 'pathe';
import { CliError, ExitCode } from '../shared/errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** How confidently two same-pid observations refer to one process instance. */
export type ProcessIdentityStrength =
    | 'pid+start' // pid + platform start identity (creation time / starttime)
    | 'pid+signature'; // degraded: pid + matching command-line signature

export interface ProcessNode {
    pid: number;
    /** Parent process. Ancestry relation only — never part of the identity. */
    ppid: number;
    name?: string;
    executablePath?: string;
    /**
     * Platform process-start identity: Windows creation time (UTC ticks),
     * Linux /proc starttime, macOS ps lstart. Best-effort; when missing on
     * either side, matching degrades to the command signature.
     */
    startId?: string;
    /** Hash of the platform-normalized command line. Never contains the raw text. */
    commandSignature?: string;
    /** Redacted, truncated command-line summary for diagnostics (e.g. `current which`). */
    commandSummary?: string;
}

export interface ProcessAncestry {
    platform: NodeJS.Platform;
    /** Self first, then ancestors toward the process tree root. */
    chain: ProcessNode[];
}

export interface AncestorMatch {
    node: ProcessNode;
    strength: ProcessIdentityStrength;
}

export interface CommandResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/** Injectable OS boundary so tests can run ancestry logic against fixtures. */
export interface ProcessTreeHost {
    platform: NodeJS.Platform;
    pid: number;
    /** Run an external capture command; undefined means it could not be spawned. */
    run(command: string, args: string[]): CommandResult | undefined;
    readTextFile(path: string): string | undefined;
    readSymlink(path: string): string | undefined;
}

// ─── Instance matching ───────────────────────────────────────────────────────

export function matchProcessInstance(
    a: ProcessNode,
    b: ProcessNode
): AncestorMatch | undefined {
    if (a.pid !== b.pid) return undefined;
    if (a.startId !== undefined && b.startId !== undefined) {
        // Both sides observed a start identity: it is authoritative, so a
        // mismatch is PID reuse and must not match even if signatures agree.
        return a.startId === b.startId
            ? { node: a, strength: 'pid+start' }
            : undefined;
    }
    if (
        a.commandSignature !== undefined &&
        b.commandSignature !== undefined &&
        a.commandSignature === b.commandSignature
    ) {
        return { node: a, strength: 'pid+signature' };
    }
    // Deliberately no bare-PID fallback: an equal pid alone cannot
    // distinguish a reused PID, so a match always requires the start
    // identity or a compatible command signature.
    return undefined;
}

/**
 * First match along chainA (self-first) — the nearest shared ancestor from
 * A's perspective. Chains that share no process instance yield undefined,
 * which callers must treat as "cannot bind".
 */
export function findNearestCommonAncestor(
    chainA: readonly ProcessNode[],
    chainB: readonly ProcessNode[]
): AncestorMatch | undefined {
    for (const nodeA of chainA) {
        for (const nodeB of chainB) {
            const match = matchProcessInstance(nodeA, nodeB);
            if (match) return match;
        }
    }
    return undefined;
}

// ─── Command-line signature and redaction ────────────────────────────────────

const SUMMARY_MAX_LENGTH = 200;

/** Flag names whose values must never reach diagnostics output. */
const SECRET_FLAG_NAMES = new Set([
    'token',
    'password',
    'passwd',
    'pwd',
    'secret',
    'api-key',
    'apikey',
    'access-token',
    'auth',
    'authorization',
    'credential',
    'credentials'
]);

function hashCommandText(canonical: string): string {
    return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * Redact a token list for diagnostic display. Best-effort heuristics: the
 * value after a secret flag, `--secret=value` forms, and long random-looking
 * tokens are replaced. Single-dash short flags are left untouched because
 * their meaning is too ambiguous. The result is informational only.
 */
export function summarizeArgvTokens(argv: readonly string[]): string {
    const parts: string[] = [];
    let redactNext = false;
    for (const token of argv) {
        if (redactNext) {
            parts.push('<redacted>');
            redactNext = false;
            continue;
        }
        if (token.startsWith('--')) {
            const name = token.slice(2).toLowerCase();
            const eq = name.indexOf('=');
            if (eq === -1) {
                parts.push(token);
                if (SECRET_FLAG_NAMES.has(name)) redactNext = true;
            } else if (SECRET_FLAG_NAMES.has(name.slice(0, eq))) {
                parts.push(`--${name.slice(0, eq)}=<redacted>`);
            } else {
                parts.push(token);
            }
            continue;
        }
        if (token.startsWith('-')) {
            parts.push(token);
            continue;
        }
        parts.push(redactValueToken(token));
    }
    let summary = parts.join(' ');
    if (summary.length > SUMMARY_MAX_LENGTH) {
        summary = `${summary.slice(0, SUMMARY_MAX_LENGTH)}…`;
    }
    return summary;
}

/** Long, separator-free, alphanumeric tokens are treated as likely secrets. */
function redactValueToken(token: string): string {
    if (
        token.length >= 32 &&
        /^[A-Za-z0-9+/=_.~-]+$/.test(token) &&
        /[A-Za-z]/.test(token) &&
        /\d/.test(token)
    ) {
        return '<redacted>';
    }
    return token;
}

// ─── Capture entry point ─────────────────────────────────────────────────────

export function captureProcessAncestry(
    host: ProcessTreeHost = createDefaultProcessTreeHost()
): ProcessAncestry {
    switch (host.platform) {
        case 'win32':
            return { platform: 'win32', chain: captureWindowsAncestry(host) };
        case 'linux':
            return { platform: 'linux', chain: captureLinuxAncestry(host) };
        case 'darwin':
            return { platform: 'darwin', chain: captureDarwinAncestry(host) };
        default:
            throw new CliError(
                ExitCode.GENERAL,
                'PROCESS_TREE_UNSUPPORTED',
                `Process ancestry capture is not implemented for platform "${host.platform}".`,
                'Use --workspace or a project file for workspace selection instead of process binding.'
            );
    }
}

// ─── Default host ────────────────────────────────────────────────────────────

const DEFAULT_CAPTURE_TIMEOUT_MS = 10_000;
const MAX_CHAIN_DEPTH = 64;

export function createDefaultProcessTreeHost(): ProcessTreeHost {
    return {
        platform: process.platform,
        pid: process.pid,
        run(command, args) {
            const result = spawnSync(command, args, {
                encoding: 'utf8',
                timeout: DEFAULT_CAPTURE_TIMEOUT_MS,
                windowsHide: true,
                shell: false
            });
            if (result.error) return undefined;
            return {
                status: result.status,
                stdout: result.stdout ?? '',
                stderr: result.stderr ?? ''
            };
        },
        readTextFile(path) {
            try {
                return readFileSync(path, 'utf8');
            } catch {
                return undefined;
            }
        },
        readSymlink(path) {
            try {
                return readlinkSync(path, 'utf8');
            } catch {
                return undefined;
            }
        }
    };
}

// ─── Windows adapter (PowerShell CIM) ────────────────────────────────────────

/**
 * One CIM query walks the whole ancestry inside a single PowerShell process
 * and emits only the chain as JSON. The start PID is interpolated as a bare
 * integer and the CLI spawns powershell.exe by argv without a shell, so the
 * script cannot be influenced by caller input.
 */
const WINDOWS_CAPTURE_SCRIPT = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$startPid = __START_PID__
$procs = Get-CimInstance -ClassName Win32_Process
$map = @{}
foreach ($proc in $procs) { $map[[int]$proc.ProcessId] = $proc }
$chain = New-Object System.Collections.Generic.List[object]
$seen = @{}
$currentPid = $startPid
while ($currentPid -ne 0 -and -not $seen.ContainsKey($currentPid)) {
    $seen[$currentPid] = $true
    $proc = $map[$currentPid]
    if ($null -eq $proc) { break }
    $startId = $null
    if ($null -ne $proc.CreationDate) {
        $startId = [string]([datetime]$proc.CreationDate).ToUniversalTime().Ticks
    }
    $chain.Add([pscustomobject]@{
        pid = [int]$proc.ProcessId
        ppid = [int]$proc.ParentProcessId
        name = [string]$proc.Name
        executablePath = $proc.ExecutablePath
        commandLine = $proc.CommandLine
        startId = $startId
    })
    $currentPid = [int]$proc.ParentProcessId
}
if ($chain.Count -eq 0) { throw "process $startPid not found" }
ConvertTo-Json -InputObject ([pscustomobject]@{ chain = $chain.ToArray() }) -Compress -Depth 4`;

interface WindowsCaptureEntry {
    pid?: number;
    ppid?: number;
    name?: string | null;
    executablePath?: string | null;
    commandLine?: string | null;
    startId?: string | null;
}

function captureWindowsAncestry(host: ProcessTreeHost): ProcessNode[] {
    const script = WINDOWS_CAPTURE_SCRIPT.replace(
        '__START_PID__',
        String(host.pid)
    );
    const result = host.run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-Command',
        script
    ]);
    if (!result || result.status !== 0 || !result.stdout.trim()) {
        throw captureFailure(host, 'PowerShell CIM query failed', result?.stderr);
    }
    let parsed: { chain?: WindowsCaptureEntry[] };
    try {
        parsed = JSON.parse(result.stdout) as { chain?: WindowsCaptureEntry[] };
    } catch {
        throw captureFailure(host, 'PowerShell CIM output was not valid JSON');
    }
    const chain: ProcessNode[] = [];
    for (const entry of parsed.chain ?? []) {
        const node = toProcessNodeFromWindows(entry);
        if (!node) {
            throw captureFailure(
                host,
                'PowerShell CIM output had an invalid chain entry'
            );
        }
        chain.push(node);
    }
    const head = chain[0];
    if (chain.length === 0 || head?.pid !== host.pid) {
        throw captureFailure(host, `PowerShell CIM did not report process ${host.pid}`);
    }
    return chain;
}

function toProcessNodeFromWindows(
    entry: WindowsCaptureEntry
): ProcessNode | undefined {
    if (typeof entry.pid !== 'number' || typeof entry.ppid !== 'number') {
        return undefined;
    }
    const rawName =
        optionalText(entry.name) ?? optionalText(entry.executablePath);
    const name = rawName ? basename(rawName) : undefined;
    const executablePath = optionalText(entry.executablePath);
    const startId = optionalText(entry.startId);
    const commandLine = optionalText(entry.commandLine);
    return {
        pid: entry.pid,
        ppid: entry.ppid,
        ...(name ? { name } : {}),
        ...(executablePath ? { executablePath } : {}),
        ...(startId ? { startId } : {}),
        ...(commandLine
            ? {
                  commandSignature: hashCommandText(commandLine),
                  commandSummary: summarizeArgvTokens(commandLine.split(/\s+/))
              }
            : {})
    };
}

function optionalText(value: string | null | undefined): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ─── Linux adapter (/proc) ───────────────────────────────────────────────────

function captureLinuxAncestry(host: ProcessTreeHost): ProcessNode[] {
    const chain = walkAncestry(host.pid, (pid) => readLinuxProcess(host, pid));
    if (chain.length === 0) {
        throw captureFailure(host, `cannot read /proc/${host.pid}/stat`);
    }
    return chain;
}

/** Walk self → root, stopping on an unreadable ancestor or a PID cycle. */
function walkAncestry(
    startPid: number,
    readProcess: (pid: number) => ProcessNode | undefined
): ProcessNode[] {
    const chain: ProcessNode[] = [];
    const seen = new Set<number>();
    let pid = startPid;
    while (pid > 0 && !seen.has(pid) && chain.length < MAX_CHAIN_DEPTH) {
        seen.add(pid);
        const node = readProcess(pid);
        if (!node) break;
        chain.push(node);
        pid = node.ppid;
    }
    return chain;
}

function readLinuxProcess(
    host: ProcessTreeHost,
    pid: number
): ProcessNode | undefined {
    const stat = host.readTextFile(`/proc/${pid}/stat`);
    if (!stat) return undefined;
    const parsedStat = parseLinuxStat(stat);
    if (!parsedStat) return undefined;

    const cmdline = host.readTextFile(`/proc/${pid}/cmdline`);
    const argv = cmdline
        ? cmdline.split('\0').filter((arg) => arg.length > 0)
        : [];
    const executablePath = host.readSymlink(`/proc/${pid}/exe`);

    return {
        pid,
        ppid: parsedStat.ppid,
        ...(parsedStat.name ? { name: parsedStat.name } : {}),
        ...(executablePath ? { executablePath } : {}),
        startId: parsedStat.starttime,
        ...(argv.length > 0
            ? {
                  commandSignature: hashCommandText(argv.join('\0')),
                  commandSummary: summarizeArgvTokens(argv)
              }
            : {})
    };
}

/**
 * Parse /proc/<pid>/stat. The comm field may contain spaces and parentheses,
 * so the numeric field split must start after the final ') '.
 * After ") ", fields[0] is state, fields[1] is ppid, fields[19] is starttime.
 */
function parseLinuxStat(
    stat: string
): { ppid: number; name: string; starttime: string } | undefined {
    const open = stat.indexOf(' (');
    const close = stat.lastIndexOf(') ');
    if (open === -1 || close === -1 || close < open) return undefined;
    const fields = stat.slice(close + 2).split(' ');
    const ppid = Number(fields[1]);
    const starttime = fields[19];
    if (!Number.isFinite(ppid) || starttime === undefined) return undefined;
    return {
        ppid,
        name: stat.slice(open + 2, close),
        starttime
    };
}

// ─── macOS adapter (ps, best-effort) ─────────────────────────────────────────

function captureDarwinAncestry(host: ProcessTreeHost): ProcessNode[] {
    const chain = walkAncestry(host.pid, (pid) => readDarwinProcess(host, pid));
    if (chain.length === 0) {
        throw captureFailure(host, `ps could not read process ${host.pid}`);
    }
    return chain;
}

/**
 * Best-effort per-PID ps reads: lstart serves as the start identity and the
 * full command line feeds the signature. A failing ancestor read (already
 * exited) simply ends the chain.
 */
function readDarwinProcess(
    host: ProcessTreeHost,
    pid: number
): ProcessNode | undefined {
    const listing = host.run('ps', [
        '-o',
        'ppid=,lstart=,command=',
        '-p',
        String(pid)
    ]);
    if (!listing || listing.status !== 0) return undefined;
    const line = listing.stdout
        .split('\n')
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    if (!line) return undefined;

    const tokens = line.split(/\s+/);
    const ppid = Number(tokens[0]);
    if (!Number.isFinite(ppid)) return undefined;
    // lstart renders five whitespace-separated tokens: weekday month day time year.
    const startId = tokens.slice(1, 6).join(' ');
    const command = tokens.slice(6).join(' ');
    const comm = host.run('ps', ['-o', 'comm=', '-p', String(pid)]);
    const executablePath =
        comm && comm.status === 0 ? firstNonEmptyLine(comm.stdout) : undefined;
    const name =
        (executablePath ? basename(executablePath) : undefined) ??
        (command ? basename(command.split(/\s+/)[0] ?? '') : undefined);

    return {
        pid,
        ppid,
        ...(name ? { name } : {}),
        ...(executablePath ? { executablePath } : {}),
        ...(startId ? { startId } : {}),
        ...(command
            ? {
                  commandSignature: hashCommandText(command),
                  commandSummary: summarizeArgvTokens(command.split(/\s+/))
              }
            : {})
    };
}

function firstNonEmptyLine(text: string): string | undefined {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) return trimmed;
    }
    return undefined;
}

// ─── Capture failure reporting ───────────────────────────────────────────────

function captureFailure(
    host: ProcessTreeHost,
    reason: string,
    stderr?: string
): CliError {
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_TREE_UNAVAILABLE',
        `Process ancestry capture failed: ${reason}`,
        'Use --workspace or a project file for workspace selection instead of process binding.',
        {
            platform: host.platform,
            ...(stderr ? { stderr: truncateText(stderr, 200) } : {})
        }
    );
}

function truncateText(text: string, maxLength: number): string {
    const trimmed = text.trim();
    return trimmed.length > maxLength
        ? `${trimmed.slice(0, maxLength)}…`
        : trimmed;
}
