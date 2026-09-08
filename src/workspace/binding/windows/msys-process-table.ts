export interface MsysCommandResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

export interface MsysCommandHost {
    run(
        command: string,
        args: string[],
        options?: { environment?: Record<string, string | undefined> }
    ): MsysCommandResult | undefined;
}

export interface MsysProcessEntry {
    /** PID and PPID belong only to the MSYS logical process table. */
    pid: number;
    ppid: number;
    /** Native Windows PID used to join to the authoritative snapshot. */
    winPid: number;
    defunct: boolean;
}

export interface MsysProcessTable {
    entries: MsysProcessEntry[];
    /** Non-empty rows that did not satisfy the advertised numeric columns. */
    malformedRows: number;
}

export type MsysLogicalWalk =
    | { kind: 'not-owned' }
    | { kind: 'complete'; chain: MsysProcessEntry[] }
    | {
          kind: 'inconsistent';
          chain: MsysProcessEntry[];
          reason: string;
      };

const REQUIRED_COLUMNS = ['PID', 'PPID', 'WINPID'] as const;

/**
 * Try the PATH-selected ps. A non-MSYS ps or a table owned by another MSYS
 * installation is absence of the optional capability, not a capture error.
 */
export function captureOwnedMsysProcessTable(
    host: MsysCommandHost,
    currentWinPid: number
): MsysProcessTable | undefined {
    const result = host.run('ps', ['-e', '-l'], {
        environment: { COLUMNS: '4096' }
    });
    if (!result || result.status !== 0 || !result.stdout.trim())
        return undefined;

    const table = parseMsysProcessTable(result.stdout);
    if (!table) return undefined;
    const owners = table.entries.filter(
        (entry) => entry.winPid === currentWinPid
    );
    return owners.length > 0 ? table : undefined;
}

/** Parse Git ps 3.4 and MSYS2 ps 3.6 tables by named columns, never offsets. */
export function parseMsysProcessTable(
    output: string
): MsysProcessTable | undefined {
    const lines = output.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => {
        const columns = splitColumns(line);
        return REQUIRED_COLUMNS.every((required) => columns.includes(required));
    });
    if (headerIndex === -1) return undefined;

    const header = splitColumns(lines[headerIndex]!);
    const pidIndex = header.indexOf('PID');
    const ppidIndex = header.indexOf('PPID');
    const winPidIndex = header.indexOf('WINPID');
    const entries: MsysProcessEntry[] = [];
    let malformedRows = 0;

    for (const line of lines.slice(headerIndex + 1)) {
        const columns = splitColumns(line);
        if (columns.length === 0) continue;

        const parsed = parseProcessRow(
            columns,
            pidIndex,
            ppidIndex,
            winPidIndex
        );
        if (parsed) entries.push(parsed);
        else malformedRows += 1;
    }
    return { entries, malformedRows };
}

/** Walk from the current native PID to the outermost represented MSYS process. */
export function walkMsysProcessTable(
    table: MsysProcessTable,
    currentWinPid: number,
    maxDepth = 64
): MsysLogicalWalk {
    const owners = table.entries.filter(
        (entry) => entry.winPid === currentWinPid
    );
    if (owners.length === 0) return { kind: 'not-owned' };
    if (owners.length !== 1) {
        return {
            kind: 'inconsistent',
            chain: [],
            reason: 'multiple rows claim the current Windows PID'
        };
    }

    const byPid = new Map<number, MsysProcessEntry>();
    const duplicatePids = new Set<number>();
    for (const entry of table.entries) {
        if (byPid.has(entry.pid)) duplicatePids.add(entry.pid);
        else byPid.set(entry.pid, entry);
    }

    const chain: MsysProcessEntry[] = [];
    const seen = new Set<number>();
    let current = owners[0]!;
    while (chain.length < maxDepth) {
        if (current.defunct) {
            return {
                kind: 'inconsistent',
                chain,
                reason: `logical process ${current.pid} is defunct`
            };
        }
        if (duplicatePids.has(current.pid)) {
            return {
                kind: 'inconsistent',
                chain,
                reason: `logical PID ${current.pid} is duplicated`
            };
        }
        if (seen.has(current.pid)) {
            return {
                kind: 'inconsistent',
                chain,
                reason: `logical ancestry contains a cycle at PID ${current.pid}`
            };
        }

        seen.add(current.pid);
        chain.push(current);
        if (current.ppid === 0 || current.ppid === 1) {
            return { kind: 'complete', chain };
        }
        const parent = byPid.get(current.ppid);
        if (!parent) {
            return {
                kind: 'inconsistent',
                chain,
                reason: table.malformedRows
                    ? `logical parent ${current.ppid} is missing from an incomplete table`
                    : `logical parent ${current.ppid} is missing`
            };
        }
        current = parent;
    }

    return {
        kind: 'inconsistent',
        chain,
        reason: `logical ancestry exceeded depth ${maxDepth}`
    };
}

function parseProcessRow(
    columns: string[],
    pidIndex: number,
    ppidIndex: number,
    winPidIndex: number
): MsysProcessEntry | undefined {
    const direct = numericColumns(columns, pidIndex, ppidIndex, winPidIndex);
    const shifted =
        direct ??
        (isOptionalStatusPrefix(columns[0])
            ? numericColumns(
                  columns,
                  pidIndex + 1,
                  ppidIndex + 1,
                  winPidIndex + 1
              )
            : undefined);
    if (!shifted) return undefined;

    const [pid, ppid, winPid] = shifted;
    if (pid <= 0 || ppid < 0 || winPid <= 0) return undefined;
    return {
        pid,
        ppid,
        winPid,
        defunct:
            columns.some((column) => column.toLowerCase() === '<defunct>') ||
            columns[0] === 'Z'
    };
}

function numericColumns(
    columns: string[],
    pidIndex: number,
    ppidIndex: number,
    winPidIndex: number
): [number, number, number] | undefined {
    const values = [
        columns[pidIndex],
        columns[ppidIndex],
        columns[winPidIndex]
    ];
    if (!values.every((value) => value !== undefined && /^\d+$/.test(value))) {
        return undefined;
    }
    const numbers = values.map(Number);
    return numbers.every(Number.isSafeInteger)
        ? (numbers as [number, number, number])
        : undefined;
}

function isOptionalStatusPrefix(value: string | undefined): boolean {
    return value !== undefined && /^[A-Za-z<][A-Za-z+<]*$/.test(value);
}

function splitColumns(line: string): string[] {
    return line.trim().split(/\s+/).filter(Boolean);
}
