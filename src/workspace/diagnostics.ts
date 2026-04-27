/**
 * Connection diagnostics for workspace verify/add failures.
 *
 * Splits "why can't I reach this SiYuan kernel" into:
 *  1. URL parsing
 *  2. TCP probe          — is anything listening?
 *  3. Port owner lookup  — localhost: who owns the port?
 *  4. HTTP probe         — is the service actually SiYuan?
 *
 * Every step is best-effort and failure-safe: missing tools (lsof/ss),
 * insufficient privileges, or unsupported platforms degrade to
 * "undefined field" rather than throwing.
 */
import { createConnection } from 'node:net';
import { execSync } from 'node:child_process';

export interface TcpProbe {
    reachable: boolean;
    host: string;
    port: number;
    errorCode?: string;
    errorMsg?: string;
    elapsedMs: number;
}

export interface HttpProbe {
    ok: boolean;
    status?: number;
    contentType?: string;
    isSiyuan: boolean;
    kernelVersion?: string;
    bodyPreview?: string;
    errorCode?: string;
    errorMsg?: string;
    elapsedMs: number;
}

export interface PortOwner {
    pid: number;
    name?: string;
}

export interface ConnectionDiagnosis {
    host?: string;
    port?: number;
    isLocalhost: boolean;
    tcp?: TcpProbe;
    http?: HttpProbe;
    portOwner?: PortOwner;
    hints: string[];
}

const LOOPBACK_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0'
]);

function isLocalhost(host: string): boolean {
    return LOOPBACK_HOSTS.has(host);
}

function parseUrl(
    baseUrl: string
): { host: string; port: number } | undefined {
    try {
        const u = new URL(baseUrl);
        const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
        if (!u.hostname || Number.isNaN(port)) return undefined;
        return { host: u.hostname, port };
    } catch {
        return undefined;
    }
}

function probeTcp(
    host: string,
    port: number,
    timeoutMs = 3000
): Promise<TcpProbe> {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const socket = createConnection({ host, port });
        let settled = false;
        const finish = (r: TcpProbe) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(r);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () =>
            finish({
                reachable: true,
                host,
                port,
                elapsedMs: Date.now() - t0
            })
        );
        socket.once('timeout', () =>
            finish({
                reachable: false,
                host,
                port,
                errorCode: 'ETIMEDOUT',
                errorMsg: `TCP connect timeout after ${timeoutMs}ms`,
                elapsedMs: Date.now() - t0
            })
        );
        socket.once('error', (e: NodeJS.ErrnoException) =>
            finish({
                reachable: false,
                host,
                port,
                errorCode: e.code ?? 'UNKNOWN',
                errorMsg: e.message,
                elapsedMs: Date.now() - t0
            })
        );
    });
}

async function probeHttp(
    baseUrl: string,
    timeoutMs = 5000
): Promise<HttpProbe> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    try {
        const url = `${baseUrl.replace(/\/$/, '')}/api/system/version`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: controller.signal
        });
        const contentType = res.headers.get('content-type') ?? '';
        const text = await res.text();
        let isSiyuan = false;
        let kernelVersion: string | undefined;
        if (contentType.includes('application/json')) {
            try {
                const body = JSON.parse(text) as {
                    code?: number;
                    data?: { ver?: string } | null;
                    msg?: string;
                };
                if (
                    typeof body?.code === 'number' &&
                    ('data' in body || 'msg' in body)
                ) {
                    isSiyuan = true;
                    kernelVersion =
                        typeof body.data === 'object' &&
                        body.data !== null &&
                        typeof body.data.ver === 'string'
                            ? body.data.ver
                            : undefined;
                }
            } catch {
                /* not JSON after all */
            }
        }
        return {
            ok: res.status === 200 && isSiyuan,
            status: res.status,
            contentType,
            isSiyuan,
            kernelVersion,
            bodyPreview: text.slice(0, 200),
            elapsedMs: Date.now() - t0
        };
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        return {
            ok: false,
            isSiyuan: false,
            errorCode:
                err.name === 'AbortError'
                    ? 'ETIMEDOUT'
                    : (err.code ?? 'HTTP_ERROR'),
            errorMsg: err.message,
            elapsedMs: Date.now() - t0
        };
    } finally {
        clearTimeout(timer);
    }
}

// ─── Port owner lookup ────────────────────────────────────────────────────────

function runCommand(cmd: string): string | undefined {
    try {
        return execSync(cmd, {
            encoding: 'utf-8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore']
        });
    } catch {
        return undefined;
    }
}

function tryGetProcessNameWindows(pid: number): string | undefined {
    const out = runCommand(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`)?.trim();
    if (!out || out.startsWith('INFO:')) return undefined;
    const m = /^"([^"]+)"/.exec(out);
    return m?.[1];
}

function probePortOwnerWindows(port: number): PortOwner | undefined {
    const out = runCommand(`netstat -ano -p TCP`);
    if (!out) return undefined;
    const re = new RegExp(
        `^\\s*TCP\\s+\\S*:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`,
        'm'
    );
    const m = re.exec(out);
    if (!m) return undefined;
    const pid = Number(m[1]);
    const name = tryGetProcessNameWindows(pid);
    return name ? { pid, name } : { pid };
}

function probePortOwnerUnix(port: number): PortOwner | undefined {
    const lsofOut = runCommand(
        `lsof -iTCP:${port} -sTCP:LISTEN -nP -Fpcn 2>/dev/null`
    )?.trim();
    if (lsofOut) {
        let pid: number | undefined;
        let name: string | undefined;
        for (const line of lsofOut.split('\n')) {
            if (line.startsWith('p')) pid = Number(line.slice(1));
            else if (line.startsWith('c') && name === undefined) {
                name = line.slice(1);
            }
        }
        if (pid !== undefined && !Number.isNaN(pid)) {
            return name ? { pid, name } : { pid };
        }
    }

    const ssOut = runCommand(
        `ss -tlnpH 'sport = :${port}' 2>/dev/null`
    )?.trim();
    if (ssOut) {
        const m = /users:\(\("([^"]+)",pid=(\d+),/.exec(ssOut);
        if (m) return { pid: Number(m[2]), name: m[1] };
    }

    return undefined;
}

function probePortOwner(port: number): PortOwner | undefined {
    return process.platform === 'win32'
        ? probePortOwnerWindows(port)
        : probePortOwnerUnix(port);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function diagnoseConnection(
    baseUrl: string
): Promise<ConnectionDiagnosis> {
    const parsed = parseUrl(baseUrl);
    if (!parsed) {
        return {
            isLocalhost: false,
            hints: [
                `Invalid baseUrl: ${baseUrl}. Expected shape: http://host:port`
            ]
        };
    }

    const { host, port } = parsed;
    const local = isLocalhost(host);
    const tcp = await probeTcp(host, port);
    const hints: string[] = [];

    if (!tcp.reachable) {
        const owner = local ? probePortOwner(port) : undefined;

        if (owner) {
            hints.push(
                `Port ${port} on ${host} is bound by pid=${owner.pid}${
                    owner.name ? ` (${owner.name})` : ''
                }, but the TCP handshake did not complete.`,
                'Check a local firewall/AV, or wait a moment if the service is still starting.'
            );
        } else if (tcp.errorCode === 'ECONNREFUSED') {
            if (local) {
                hints.push(
                    `No service is listening on ${host}:${port}.`,
                    'Start SiYuan, or run `siyuan workspace show` to confirm the configured port.'
                );
            } else {
                hints.push(
                    `Remote host ${host} refused TCP connection on port ${port}.`,
                    'Confirm the kernel is running and the port is exposed externally.'
                );
            }
        } else if (tcp.errorCode === 'ETIMEDOUT') {
            hints.push(
                `No response from ${host}:${port} within the TCP probe window.`,
                local
                    ? 'SiYuan is likely not running.'
                    : 'Check network reachability, firewall rules, or whether the remote host is up.'
            );
        } else if (
            tcp.errorCode === 'ENOTFOUND' ||
            tcp.errorCode === 'EAI_AGAIN'
        ) {
            hints.push(
                `DNS resolution failed for ${host} (${tcp.errorCode}).`,
                'Check the hostname spelling and your DNS configuration.'
            );
        } else {
            hints.push(
                `TCP connect to ${host}:${port} failed (${
                    tcp.errorCode ?? 'unknown'
                })${tcp.errorMsg ? `: ${tcp.errorMsg}` : ''}`
            );
        }

        return {
            host,
            port,
            isLocalhost: local,
            tcp,
            ...(owner ? { portOwner: owner } : {}),
            hints
        };
    }

    // TCP is up. Classify the service behind it via HTTP.
    const http = await probeHttp(baseUrl);

    if (http.ok) {
        hints.push(
            `SiYuan kernel responded at ${baseUrl}${
                http.kernelVersion ? ` (version ${http.kernelVersion})` : ''
            }. The original failure may be transient; if it recurs, re-check the token.`
        );
    } else if (http.isSiyuan) {
        if (http.status === 401) {
            hints.push(
                `SiYuan kernel at ${baseUrl} requires authentication (HTTP 401).`,
                'Check the token in `siyuan workspace show --reveal-token`, or refresh the tokenSource.'
            );
        } else {
            hints.push(
                `${baseUrl} looks like a SiYuan kernel but /api/system/version returned HTTP ${http.status}.`,
                'The kernel may still be starting up, or the API surface differs in this version.'
            );
        }
    } else if (http.status !== undefined) {
        const preview = http.bodyPreview?.replace(/\s+/g, ' ').slice(0, 120);
        const owner = local ? probePortOwner(port) : undefined;
        hints.push(
            `Port ${port} on ${host} is occupied by a non-SiYuan HTTP service (status ${http.status}, content-type ${http.contentType || 'unknown'}).`,
            ...(preview ? [`Response preview: ${preview}`] : []),
            ...(owner
                ? [
                      `Occupied by pid=${owner.pid}${
                          owner.name ? ` (${owner.name})` : ''
                      }. Stop it, or reconfigure SiYuan to use another port.`
                  ]
                : local
                  ? [
                        'Run this command with elevated privileges to identify the occupying process.'
                    ]
                  : ['Point the workspace at the correct host and port.'])
        );
        return {
            host,
            port,
            isLocalhost: local,
            tcp,
            http,
            ...(owner ? { portOwner: owner } : {}),
            hints
        };
    } else {
        hints.push(
            `TCP connect to ${host}:${port} succeeded, but the HTTP exchange failed (${http.errorCode ?? 'unknown'})${http.errorMsg ? `: ${http.errorMsg}` : ''}.`,
            'Verify the URL scheme (http vs https) — a plain-HTTP kernel cannot be reached with an https:// baseUrl, and vice versa.'
        );
    }

    return {
        host,
        port,
        isLocalhost: local,
        tcp,
        http,
        hints
    };
}
