import { basename } from 'pathe';
import { CliError, ExitCode } from '../../../shared/errors.js';
import {
    hashCommandText,
    inspectProcessInstance,
    MAX_PROCESS_CHAIN_DEPTH,
    summarizeArgvTokens,
    type ProcessAncestry,
    type ProcessInstanceInspection,
    type ProcessNode
} from '../process-tree.js';
import {
    captureOwnedMsysProcessTable,
    walkMsysProcessTable
} from './msys-process-table.js';

export interface WindowsCaptureHost {
    platform: NodeJS.Platform;
    pid: number;
    run(
        command: string,
        args: string[],
        options?: { environment?: Record<string, string | undefined> }
    ): { status: number | null; stdout: string; stderr: string } | undefined;
}

export interface WindowsProcessSnapshot {
    readonly processes: ReadonlyMap<number, ProcessNode>;
}

const WINDOWS_SNAPSHOT_SCRIPT = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$items = @(Get-CimInstance -ClassName Win32_Process | ForEach-Object {
    $startId = $null
    if ($null -ne $_.CreationDate) {
        $startId = [string]([datetime]$_.CreationDate).ToUniversalTime().Ticks
    }
    [pscustomobject]@{
        pid = [int]$_.ProcessId
        ppid = [int]$_.ParentProcessId
        name = [string]$_.Name
        executablePath = $_.ExecutablePath
        commandLine = $_.CommandLine
        startId = $startId
    }
})
ConvertTo-Json -InputObject ([pscustomobject]@{ processes = $items }) -Compress -Depth 4`;

interface WindowsSnapshotEntry {
    pid?: number;
    ppid?: number;
    name?: string | null;
    executablePath?: string | null;
    commandLine?: string | null;
    startId?: string | null;
}

/** Capture and normalize all Windows process evidence in one CIM query. */
export function captureWindowsSnapshot(
    host: WindowsCaptureHost
): WindowsProcessSnapshot {
    const result = host.run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-Command',
        WINDOWS_SNAPSHOT_SCRIPT
    ]);
    if (!result || result.status !== 0 || !result.stdout.trim()) {
        throw windowsCaptureFailure(
            'native-snapshot',
            'Windows process snapshot could not be captured',
            result
        );
    }

    let parsed: { processes?: WindowsSnapshotEntry[] };
    try {
        parsed = JSON.parse(result.stdout) as typeof parsed;
    } catch {
        throw windowsCaptureFailure(
            'native-snapshot',
            'Windows process snapshot was not valid JSON',
            result
        );
    }
    const entries = parsed.processes;
    if (!Array.isArray(entries)) {
        throw windowsCaptureFailure(
            'native-snapshot',
            'Windows process snapshot did not contain a process list'
        );
    }

    const processes = new Map<number, ProcessNode>();
    for (const entry of entries) {
        // Win32_Process includes the System Idle Process (PID 0), which cannot
        // be a persisted process identity or an ancestry node.
        if (entry.pid === 0) continue;
        const node = normalizeWindowsProcess(entry);
        if (!node || processes.has(node.pid)) {
            throw windowsCaptureFailure(
                'native-snapshot',
                'Windows process snapshot contained an invalid or duplicate entry'
            );
        }
        processes.set(node.pid, node);
    }
    if (!processes.has(host.pid)) {
        throw windowsCaptureFailure(
            'native-snapshot',
            `Windows process snapshot did not contain the current process (${host.pid})`
        );
    }
    return { processes };
}

/** Build native ancestry and conditionally replace its MSYS segment. */
export function captureWindowsAncestry(
    host: WindowsCaptureHost,
    snapshot: WindowsProcessSnapshot = captureWindowsSnapshot(host)
): ProcessAncestry {
    const native = walkNativeAncestry(snapshot, host.pid);
    const table = captureOwnedMsysProcessTable(host, host.pid);
    if (!table) return { platform: 'win32', ...native };

    const logical = walkMsysProcessTable(
        table,
        host.pid,
        MAX_PROCESS_CHAIN_DEPTH
    );
    if (logical.kind === 'not-owned') return { platform: 'win32', ...native };
    if (logical.kind === 'inconsistent') {
        return {
            platform: 'win32',
            chain: mapAvailableLogicalSegment(
                snapshot,
                logical.chain,
                native.chain
            ),
            termination: {
                kind: 'inconsistent',
                stage: 'msys-table',
                reason: logical.reason
            }
        };
    }

    const logicalNodes: ProcessNode[] = [];
    const logicalWinPids = new Set<number>();
    for (let index = 0; index < logical.chain.length; index += 1) {
        const row = logical.chain[index]!;
        if (logicalWinPids.has(row.winPid)) {
            return {
                platform: 'win32',
                chain: logicalNodes,
                termination: {
                    kind: 'inconsistent',
                    stage: 'msys-handoff',
                    reason: `multiple logical processes map to Windows PID ${row.winPid}`
                }
            };
        }
        logicalWinPids.add(row.winPid);
        const observed = snapshot.processes.get(row.winPid);
        if (!observed) {
            return {
                platform: 'win32',
                chain:
                    logicalNodes.length > 0
                        ? logicalNodes
                        : native.chain.slice(0, 1),
                termination: {
                    kind: 'inconsistent',
                    stage: 'msys-handoff',
                    reason: `logical process ${row.pid} has no Windows snapshot instance`
                }
            };
        }
        const nextRow = logical.chain[index + 1];
        logicalNodes.push({
            ...observed,
            ppid: nextRow?.winPid ?? observed.ppid
        });
        // Start-order validation applies only to native ParentProcessId edges.
        // MSYS exec may retain a logical PID while replacing its Windows process.
    }

    const handoff = logicalNodes.at(-1)!;
    const nativeTail = walkNativeAncestry(snapshot, handoff.pid);
    return {
        platform: 'win32',
        chain: [...logicalNodes.slice(0, -1), ...nativeTail.chain],
        termination: nativeTail.termination
    };
}

/** Inspect all anchors from the same snapshot used for current ancestry. */
export function inspectWindowsAnchors(
    snapshot: WindowsProcessSnapshot,
    anchors: readonly ProcessNode[]
): ProcessInstanceInspection[] {
    return anchors.map((anchor) =>
        inspectProcessInstance(anchor, snapshot.processes.get(anchor.pid), true)
    );
}

function walkNativeAncestry(
    snapshot: WindowsProcessSnapshot,
    startPid: number
): Pick<ProcessAncestry, 'chain' | 'termination'> {
    const chain: ProcessNode[] = [];
    const seen = new Set<number>();
    let pid = startPid;

    while (chain.length < MAX_PROCESS_CHAIN_DEPTH) {
        if (seen.has(pid)) {
            return { chain, termination: { kind: 'cycle', pid } };
        }
        const node = snapshot.processes.get(pid);
        if (!node) {
            return {
                chain,
                termination: { kind: 'parent-missing', parentPid: pid }
            };
        }
        seen.add(pid);
        chain.push(node);
        if (node.ppid === 0) return { chain, termination: { kind: 'root' } };

        const parent = snapshot.processes.get(node.ppid);
        if (parent && startsAfter(parent, node)) {
            return {
                chain,
                termination: {
                    kind: 'inconsistent',
                    stage: 'native',
                    reason: `parent PID ${node.ppid} identifies a newer process instance`
                }
            };
        }
        pid = node.ppid;
    }
    return {
        chain,
        termination: {
            kind: 'depth-limit',
            maxDepth: MAX_PROCESS_CHAIN_DEPTH
        }
    };
}

function mapAvailableLogicalSegment(
    snapshot: WindowsProcessSnapshot,
    rows: readonly { winPid: number }[],
    fallback: readonly ProcessNode[]
): ProcessNode[] {
    const nodes = rows
        .map((row) => snapshot.processes.get(row.winPid))
        .filter((node): node is ProcessNode => node !== undefined);
    return nodes.length > 0 ? nodes : fallback.slice(0, 1);
}

function startsAfter(parent: ProcessNode, child: ProcessNode): boolean {
    if (parent.startId === undefined || child.startId === undefined)
        return false;
    try {
        return BigInt(parent.startId) > BigInt(child.startId);
    } catch {
        return false;
    }
}

function normalizeWindowsProcess(
    entry: WindowsSnapshotEntry
): ProcessNode | undefined {
    if (
        !Number.isSafeInteger(entry.pid) ||
        !Number.isSafeInteger(entry.ppid) ||
        entry.pid === undefined ||
        entry.ppid === undefined ||
        entry.pid <= 0 ||
        entry.ppid < 0
    ) {
        return undefined;
    }
    const executablePath = optionalText(entry.executablePath);
    const rawName = optionalText(entry.name) ?? executablePath;
    const name = rawName ? basename(rawName) : undefined;
    const startId = optionalText(entry.startId);
    if (startId !== undefined && !/^\d+$/.test(startId)) return undefined;
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
                  commandSummary: summarizeArgvTokens(
                      tokenizeCommandLine(commandLine)
                  )
              }
            : {})
    };
}

function tokenizeCommandLine(commandLine: string): string[] {
    const tokens: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|\S+/g;
    for (const match of commandLine.matchAll(pattern)) {
        tokens.push(match[1] ?? match[2] ?? match[0]);
    }
    return tokens;
}

function optionalText(value: string | null | undefined): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function windowsCaptureFailure(
    stage: string,
    reason: string,
    result?: { status: number | null; stderr: string }
): CliError {
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_TREE_UNAVAILABLE',
        `Process observation failed: ${reason}.`,
        'Use --workspace or a project file for workspace selection instead of process binding.',
        {
            platform: 'win32',
            stage,
            ...(result?.status !== undefined ? { status: result.status } : {}),
            ...(result?.stderr.trim()
                ? { diagnosticSignature: hashCommandText(result.stderr.trim()) }
                : {})
        }
    );
}
