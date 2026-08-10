/**
 * Workspace directory → port/baseUrl resolver.
 *
 * Algorithm (3-step):
 *   1. Read <workspaceDir>/conf/conf.json → extract serverAddrs → pick localhost port.
 *   2. POST <port>/api/system/getWorkspaceInfo → ask the kernel which workspace it runs.
 *   3. Compare the runtime workspace path with the requested directory.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'pathe';
import { resolve as resolveFsPath, win32 } from 'node:path';
import { CliError, ExitCode } from '../shared/errors.js';

export interface ResolvedPort {
    baseUrl: string;
    port: number;
    workspaceDir: string;
    verified: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(host: string, port: number): string {
    return `http://${host}:${port}`;
}

async function postJson<T = unknown>(
    url: string,
    payload: unknown,
    timeoutMs: number,
    token?: string
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (token) headers.Authorization = `Token ${token}`;
        const res = await fetch(url, {
            method: 'POST',
            headers,
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

interface GetWorkspaceInfoResponse {
    code: number;
    msg: string;
    data?: {
        workspaceDir?: string;
        siyuanVer?: string;
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
    timeoutMs: number,
    token?: string
): Promise<boolean> {
    try {
        const data = await postJson<GetWorkspaceInfoResponse>(
            `${buildUrl('127.0.0.1', port)}/api/system/getWorkspaceInfo`,
            {},
            timeoutMs,
            token
        );
        if (data.code !== 0) return false;
        const runtimeDir = data.data?.workspaceDir;
        if (!runtimeDir) return false;
        return (
            normalizeWorkspacePath(runtimeDir) ===
            normalizeWorkspacePath(expectedDir)
        );
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
    opts?: { timeoutMs?: number; token?: string }
): Promise<ResolvedPort> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // —— Step 1: read conf.json → serverAddrs ——
    let confJson: { serverAddrs?: string[] };
    try {
        const raw = readFileSync(
            resolve(workspaceDir, 'conf', 'conf.json'),
            'utf-8'
        );
        confJson = JSON.parse(raw) as typeof confJson;
    } catch (e) {
        throw new CliError(
            ExitCode.CONFIG,
            'CONF_JSON_UNREADABLE',
            `Cannot read conf.json for workspace "${workspaceDir}": ${e instanceof Error ? e.message : String(e)}`,
            'Ensure the workspace directory is accessible and SiYuan has written its configuration.'
        );
    }

    const port = parseLocalhostPort(confJson.serverAddrs);
    if (port === undefined) {
        throw new CliError(
            ExitCode.CONFIG,
            'PORT_NOT_FOUND',
            `No localhost address found in serverAddrs for workspace "${workspaceDir}".`,
            'SiYuan may not have finished initializing its network server.'
        );
    }

    // —— Step 2-3: ask the target kernel and compare its workspace path ——
    const verified = await verifyPortMatchesWorkspace(
        port,
        workspaceDir,
        timeoutMs,
        opts?.token
    );
    if (!verified) {
        throw new CliError(
            ExitCode.CONFIG,
            'WORKSPACE_VERIFY_FAILED',
            `Port ${port} does not match workspace "${workspaceDir}" at runtime.`,
            'Ensure SiYuan is running for this workspace and that its API token is valid.'
        );
    }

    return {
        baseUrl: buildUrl('127.0.0.1', port),
        port,
        workspaceDir,
        verified: true
    };
}
