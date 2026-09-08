import { spawnSync } from 'node:child_process';
import { readFileSync, readlinkSync, statSync } from 'node:fs';
import { basename } from 'pathe';
import { CliError, ExitCode } from '../../shared/errors.js';
import {
    hashCommandText,
    inspectProcessInstance,
    MAX_PROCESS_CHAIN_DEPTH,
    summarizeArgvTokens,
    type ProcessAncestry,
    type ProcessInstanceInspection,
    type ProcessNode
} from './process-tree.js';
import {
    captureWindowsAncestry,
    captureWindowsSnapshot,
    inspectWindowsAnchors
} from './windows/capture.js';

export interface CommandResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

export interface ObservationHost {
    platform: NodeJS.Platform;
    pid: number;
    run(
        command: string,
        args: string[],
        options?: { environment?: Record<string, string | undefined> }
    ): CommandResult | undefined;
    readTextFile(path: string): string | undefined;
    readSymlink(path: string): string | undefined;
    /** Distinguishes a missing process file from an unreadable one. */
    pathStatus?(path: string): 'exists' | 'missing' | 'unknown';
}

export interface ProcessScopeObservation {
    platform: NodeJS.Platform;
    anchorInspections: ProcessInstanceInspection[];
    /** Omitted when every recorded anchor was conclusively stale. */
    ancestry?: ProcessAncestry;
}

/** Binding-specific semantic boundary consumed by lifecycle code. */
export interface ProcessObserver {
    captureBindingAncestry(): ProcessAncestry;
    inspectAnchorsAndCurrentScope(
        anchors: readonly ProcessNode[]
    ): ProcessScopeObservation;
}

export function createProcessObserver(
    host: ObservationHost = createDefaultObservationHost()
): ProcessObserver {
    switch (host.platform) {
        case 'win32':
            return {
                captureBindingAncestry: () => captureWindowsAncestry(host),
                inspectAnchorsAndCurrentScope(anchors) {
                    const snapshot = captureWindowsSnapshot(host);
                    const anchorInspections = inspectWindowsAnchors(
                        snapshot,
                        anchors
                    );
                    return {
                        platform: 'win32',
                        anchorInspections,
                        ...(anchorInspections.some(
                            ({ state }) => state !== 'stale'
                        )
                            ? {
                                  ancestry: captureWindowsAncestry(
                                      host,
                                      snapshot
                                  )
                              }
                            : {})
                    };
                }
            };
        case 'linux':
            return createLinuxObserver(host);
        case 'darwin':
            return createDarwinObserver(host);
        default:
            throw new CliError(
                ExitCode.GENERAL,
                'PROCESS_TREE_UNSUPPORTED',
                `Process observation is not implemented for platform "${host.platform}".`,
                'Use --workspace or a project file for workspace selection instead of process binding.'
            );
    }
}

const DEFAULT_CAPTURE_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export function createDefaultObservationHost(): ObservationHost {
    return {
        platform: process.platform,
        pid: process.pid,
        run(command, args, options) {
            const environment: NodeJS.ProcessEnv = { ...process.env };
            for (const [name, value] of Object.entries(
                options?.environment ?? {}
            )) {
                if (value === undefined) delete environment[name];
                else environment[name] = value;
            }
            const result = spawnSync(command, args, {
                encoding: 'utf8',
                timeout: DEFAULT_CAPTURE_TIMEOUT_MS,
                maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
                windowsHide: true,
                shell: false,
                env: environment
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
        },
        pathStatus(path) {
            try {
                statSync(path);
                return 'exists';
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                return code === 'ENOENT' || code === 'ESRCH'
                    ? 'missing'
                    : 'unknown';
            }
        }
    };
}

function createLinuxObserver(host: ObservationHost): ProcessObserver {
    const capture = (): ProcessAncestry => {
        const walked = walkAncestry(host.pid, (pid) =>
            readLinuxProcess(host, pid)
        );
        if (walked.chain.length === 0) {
            throw captureFailure(host, `cannot read /proc/${host.pid}/stat`);
        }
        return { platform: 'linux', ...walked };
    };

    return {
        captureBindingAncestry: capture,
        inspectAnchorsAndCurrentScope(anchors) {
            const anchorInspections = anchors.map((anchor) => {
                const observed = readLinuxProcess(host, anchor.pid);
                const status = host.pathStatus?.(`/proc/${anchor.pid}/stat`);
                return inspectProcessInstance(
                    anchor,
                    observed,
                    status === 'missing'
                );
            });
            return {
                platform: 'linux',
                anchorInspections,
                ...(anchorInspections.some(({ state }) => state !== 'stale')
                    ? { ancestry: capture() }
                    : {})
            };
        }
    };
}

function createDarwinObserver(host: ObservationHost): ProcessObserver {
    const capture = (): ProcessAncestry => {
        const walked = walkAncestry(host.pid, (pid) =>
            readDarwinProcess(host, pid)
        );
        if (walked.chain.length === 0) {
            throw captureFailure(host, `ps could not read process ${host.pid}`);
        }
        return { platform: 'darwin', ...walked };
    };

    return {
        captureBindingAncestry: capture,
        inspectAnchorsAndCurrentScope(anchors) {
            const anchorInspections = anchors.map((anchor) =>
                inspectProcessInstance(
                    anchor,
                    readDarwinProcess(host, anchor.pid),
                    false
                )
            );
            return {
                platform: 'darwin',
                anchorInspections,
                ...(anchorInspections.some(({ state }) => state !== 'stale')
                    ? { ancestry: capture() }
                    : {})
            };
        }
    };
}

function walkAncestry(
    startPid: number,
    readProcess: (pid: number) => ProcessNode | undefined
): Pick<ProcessAncestry, 'chain' | 'termination'> {
    const chain: ProcessNode[] = [];
    const seen = new Set<number>();
    let pid = startPid;

    while (chain.length < MAX_PROCESS_CHAIN_DEPTH) {
        if (seen.has(pid))
            return { chain, termination: { kind: 'cycle', pid } };
        seen.add(pid);
        const node = readProcess(pid);
        if (!node) {
            return {
                chain,
                termination: { kind: 'parent-missing', parentPid: pid }
            };
        }
        chain.push(node);
        if (node.ppid === 0) return { chain, termination: { kind: 'root' } };
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

function readLinuxProcess(
    host: ObservationHost,
    pid: number
): ProcessNode | undefined {
    const stat = host.readTextFile(`/proc/${pid}/stat`);
    if (!stat) return undefined;
    const parsedStat = parseLinuxStat(stat);
    if (!parsedStat) return undefined;

    const cmdline = host.readTextFile(`/proc/${pid}/cmdline`);
    const argv = cmdline ? cmdline.split('\0').filter(Boolean) : [];
    const executablePath = host.readSymlink(`/proc/${pid}/exe`);
    return {
        pid,
        ppid: parsedStat.ppid,
        ...(parsedStat.name ? { name: parsedStat.name } : {}),
        ...(executablePath ? { executablePath } : {}),
        startId: parsedStat.starttime,
        ...(argv.length
            ? {
                  commandSignature: hashCommandText(argv.join('\0')),
                  commandSummary: summarizeArgvTokens(argv)
              }
            : {})
    };
}

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
    return { ppid, name: stat.slice(open + 2, close), starttime };
}

function readDarwinProcess(
    host: ObservationHost,
    pid: number
): ProcessNode | undefined {
    const listing = host.run('ps', [
        '-o',
        'ppid=,lstart=,command=',
        '-p',
        String(pid)
    ]);
    if (!listing || listing.status !== 0) return undefined;
    const line = firstNonEmptyLine(listing.stdout);
    if (!line) return undefined;

    const tokens = line.split(/\s+/);
    const ppid = Number(tokens[0]);
    if (!Number.isFinite(ppid)) return undefined;
    const startId = tokens.slice(1, 6).join(' ');
    const commandTokens = tokens.slice(6);
    const command = commandTokens.join(' ');
    const comm = host.run('ps', ['-o', 'comm=', '-p', String(pid)]);
    const executablePath =
        comm && comm.status === 0 ? firstNonEmptyLine(comm.stdout) : undefined;
    const name =
        (executablePath ? basename(executablePath) : undefined) ??
        (commandTokens[0] ? basename(commandTokens[0]) : undefined);
    return {
        pid,
        ppid,
        ...(name ? { name } : {}),
        ...(executablePath ? { executablePath } : {}),
        ...(startId ? { startId } : {}),
        ...(command
            ? {
                  commandSignature: hashCommandText(command),
                  commandSummary: summarizeArgvTokens(commandTokens)
              }
            : {})
    };
}

function firstNonEmptyLine(text: string): string | undefined {
    return text
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean);
}

function captureFailure(host: ObservationHost, reason: string): CliError {
    return new CliError(
        ExitCode.GENERAL,
        'PROCESS_TREE_UNAVAILABLE',
        `Process ancestry capture failed: ${reason}`,
        'Use --workspace or a project file for workspace selection instead of process binding.',
        { platform: host.platform }
    );
}
