/**
 * Workspace directory → port/baseUrl resolver.
 *
 * Algorithm (5-step):
 *   1. Probe seed port (default 6806) for /api/system/getWorkspaces.
 *   2. Match returned workspace path against target workspaceDir.
 *   3. Read <path>/conf/conf.json → extract serverAddrs → pick localhost port.
 *   4. POST <port>/api/system/getConf → verify workspaceDir consistency.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'pathe';
import { resolve as resolveFsPath, win32 } from 'node:path';
import { CliError, ExitCode } from '../shared/errors.js';

export interface ResolvedPort {
    baseUrl: string;
    port: number;
    workspaceDir: string;
    verified: boolean;
}

const DEFAULT_SEED_PORT = 6806;
const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(host: string, port: number): string {
    return `http://${host}:${port}`;
}

async function postJson<T = unknown>(
    url: string,
    payload: unknown,
    timeoutMs: number
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

interface GetWorkspacesResponse {
    code: number;
    msg: string;
    data: Array<{ path: string; closed: boolean }>;
}

interface GetConfResponse {
    code: number;
    msg: string;
    data: {
        conf?: {
            system?: { workspaceDir?: string };
            serverAddrs?: string[];
        };
    };
}

function normalizeWorkspacePath(input: string): string {
    if (/^[A-Za-z]:[\\/]/.test(input)) {
        return win32.normalize(input).toLowerCase();
    }
    return resolveFsPath(input).toLowerCase();
}

function parseLocalhostPort(addrs: string[] | undefined): number | undefined {
    if (!addrs) return undefined;
    for (const addr of addrs) {
        const m = addr.match(/127\.0\.0\.1:(\d+)/);
        if (m) {
            const p = Number(m[1]);
            if (!Number.isNaN(p)) return p;
        }
    }
    return undefined;
}

async function verifyPortMatchesWorkspace(
    port: number,
    expectedDir: string,
    timeoutMs: number
): Promise<boolean> {
    try {
        const data = await postJson<GetConfResponse>(
            `${buildUrl('127.0.0.1', port)}/api/system/getConf`,
            {},
            timeoutMs
        );
        if (data.code !== 0) return false;
        const runtimeDir = data.data?.conf?.system?.workspaceDir;
        if (!runtimeDir) return false;
        return normalizeWorkspacePath(runtimeDir) === normalizeWorkspacePath(expectedDir);
    } catch {
        return false;
    }
}

/**
 * Resolve a workspace directory to its live baseUrl/port.
 *
 * @throws CliError on any unresolvable state.
 */
export async function resolveWorkspaceDirToBaseUrl(
    workspaceDir: string,
    opts?: { seedPort?: number; timeoutMs?: number }
): Promise<ResolvedPort> {
    const targetDir = workspaceDir;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const seedPort = opts?.seedPort ?? DEFAULT_SEED_PORT;

    // —— Step 1: getWorkspaces via seed port ——
    let workspaces: GetWorkspacesResponse['data'];
    try {
        const seedResp = await postJson<GetWorkspacesResponse>(
            `${buildUrl('127.0.0.1', seedPort)}/api/system/getWorkspaces`,
            {},
            timeoutMs
        );
        if (seedResp.code !== 0) {
            throw new CliError(
                ExitCode.NETWORK,
                'SIYUAN_NOT_RUNNING',
                `Seed port ${seedPort} returned error: ${seedResp.msg}`,
                'Ensure SiYuan is running on the default port or specify --seed-port.'
            );
        }
        workspaces = seedResp.data;
    } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(
            ExitCode.NETWORK,
            'SIYUAN_NOT_RUNNING',
            `Cannot reach SiYuan on seed port ${seedPort}: ${e instanceof Error ? e.message : String(e)}`,
            'Start SiYuan or check the seed port.'
        );
    }

    // —— Step 2: match workspace path ——
    const targetNormalized = normalizeWorkspacePath(targetDir);
    const match = workspaces.find((w) => {
        const wsPath = w.path;
        return (
            normalizeWorkspacePath(wsPath) === targetNormalized ||
            basename(wsPath).toLowerCase() === basename(targetDir).toLowerCase()
        );
    });

    if (!match) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_NOT_FOUND_IN_KERNEL',
            `Workspace directory "${workspaceDir}" not found in running SiYuan instances.`,
            'Check the path or open the workspace in SiYuan first.'
        );
    }

    if (match.closed) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_CLOSED',
            `Workspace "${match.path}" is currently closed in SiYuan.`,
            'Open the workspace in SiYuan first, then retry.'
        );
    }

    const matchedPath = match.path;

    // —— Step 3: read conf.json → serverAddrs ——
    let confJson: { serverAddrs?: string[] };
    try {
        const raw = readFileSync(
            resolve(matchedPath, 'conf', 'conf.json'),
            'utf-8'
        );
        confJson = JSON.parse(raw) as typeof confJson;
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'CONF_JSON_UNREADABLE',
            `Cannot read conf.json for workspace "${matchedPath}": ${e instanceof Error ? e.message : String(e)}`,
            'Ensure the workspace directory is accessible and SiYuan has written its configuration.'
        );
    }

    const port = parseLocalhostPort(confJson.serverAddrs);
    if (port === undefined) {
        throw new CliError(
            ExitCode.CONFIG,
            'PORT_NOT_FOUND',
            `No localhost address found in serverAddrs for workspace "${matchedPath}".`,
            'SiYuan may not have finished initializing its network server.'
        );
    }

    // —— Step 4: verify via getConf ——
    const verified = await verifyPortMatchesWorkspace(port, matchedPath, timeoutMs);
    if (!verified) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_VERIFY_FAILED',
            `Port ${port} does not match workspace "${matchedPath}" at runtime.`,
            'The workspace may have moved or SiYuan may be restarting.'
        );
    }

    return {
        baseUrl: buildUrl('127.0.0.1', port),
        port,
        workspaceDir: matchedPath,
        verified: true
    };
}
