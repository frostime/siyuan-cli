/**
 * SiyuanClient — HTTP wrapper for SiYuan kernel API.
 * All kernel APIs are POST /api/<endpoint> + JSON body.
 * See design.md §2 for interface contract.
 */
import { CliError, ExitCode } from './errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClientConfig {
    baseUrl: string;
    token?: string;
    timeoutMs?: number;
}

export interface KernelResponse<T = unknown> {
    code: number; // 0 = success
    msg: string;
    data: T;
}

export interface PingResult {
    ok: boolean;
    version?: string;
    message?: string;
}

/** Result of SiyuanClient.download() — raw file bytes plus file metadata. */
export interface DownloadResult {
    /** Raw Content-Type header value (may include charset), or a fallback. */
    contentType: string;
    /** Raw response body stream; null only for empty responses. */
    body: ReadableStream<Uint8Array> | null;
    /** Convenience full read for small content (e.g. text printing). */
    arrayBuffer(): Promise<Uint8Array>;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class SiyuanClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly timeoutMs: number;

    constructor(config: ClientConfig) {
        // Normalize: strip trailing slash
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.token = config.token;
        this.timeoutMs = config.timeoutMs ?? 10_000;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private buildHeaders(
        extra?: Record<string, string>
    ): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...extra
        };
        if (this.token) {
            headers['Authorization'] = `Token ${this.token}`;
        }
        return headers;
    }

    private url(endpoint: string): string {
        // endpoint is like "/api/query/sql" — already has leading slash
        return `${this.baseUrl}${endpoint}`;
    }

    private async fetchJson<T>(
        endpoint: string,
        init: RequestInit
    ): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let res: Response;
        try {
            res = await fetch(this.url(endpoint), {
                ...init,
                signal: controller.signal
            });
        } catch (e) {
            clearTimeout(timer);
            // Map fetch errors to CliError
            if (e instanceof Error && e.name === 'AbortError') {
                throw new CliError(
                    ExitCode.NETWORK,
                    'ETIMEDOUT',
                    `Request to ${this.url(endpoint)} timed out after ${this.timeoutMs}ms`,
                    'Check your baseUrl or network.'
                );
            }
            const cause = e instanceof Error ? e : new Error(String(e));
            // ECONNREFUSED surfaces as a TypeError in fetch
            throw new CliError(
                ExitCode.NETWORK,
                'ECONNREFUSED',
                `Cannot connect to ${this.baseUrl}: ${cause.message}`,
                'Is SiYuan running?'
            );
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 401) {
            throw new CliError(
                ExitCode.AUTH,
                'UNAUTHORIZED',
                `Authentication failed for ${this.baseUrl}`,
                'Check your token with `siyuan-cli workspace show --reveal-token`.'
            );
        }

        const body = (await res.json()) as KernelResponse<T>;

        if (body.code !== 0) {
            throw new CliError(
                ExitCode.GENERAL,
                'KERNEL_ERROR',
                `Kernel returned error (code ${body.code}): ${body.msg}`
            );
        }

        return body.data;
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /**
     * Call a kernel JSON API.
     * endpoint: "/api/query/sql"
     * Returns response.data on success; throws CliError on failure.
     */
    async call<T = unknown>(endpoint: string, payload: unknown): Promise<T> {
        return this.fetchJson<T>(endpoint, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(payload)
        });
    }

    /**
     * Upload files via multipart/form-data.
     * files: [{ field: "file[]", path: "/abs/path/to/file.png" }]
     */
    async upload<T = unknown>(
        endpoint: string,
        files: Array<{ field: string; path: string }>,
        fields?: Record<string, string>
    ): Promise<T> {
        const { createReadStream } = await import('node:fs');
        const { basename } = await import('node:path');

        const form = new FormData();

        for (const { field, path } of files) {
            // Node 20+ supports Blob from streams via readFileSync; use Buffer for simplicity
            const { readFileSync } = await import('node:fs');
            const buf = readFileSync(path);
            const blob = new Blob([buf]);
            form.append(field, blob, basename(path));
        }

        if (fields) {
            for (const [k, v] of Object.entries(fields)) {
                form.append(k, v);
            }
        }

        const headers: Record<string, string> = {};
        if (this.token) headers['Authorization'] = `Token ${this.token}`;
        // Do NOT set Content-Type — fetch sets it with boundary automatically

        return this.fetchJson<T>(endpoint, {
            method: 'POST',
            headers,
            body: form
        });
    }

    /**
     * Download a file via a raw-byte endpoint (e.g. /api/file/getFile).
     * On success the kernel answers HTTP 200 with the raw file bytes and a
     * file-describing Content-Type; on failure with the standard JSON error
     * envelope (HTTP 202). The timeout covers only the headers — body
     * streaming is not capped, so large files can take as long as they need.
     */
    async download(
        endpoint: string,
        payload: unknown
    ): Promise<DownloadResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let res: Response;
        try {
            res = await fetch(this.url(endpoint), {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } catch (e) {
            // Same fetch-failure mapping as fetchJson
            if (e instanceof Error && e.name === 'AbortError') {
                throw new CliError(
                    ExitCode.NETWORK,
                    'ETIMEDOUT',
                    `Request to ${this.url(endpoint)} timed out after ${this.timeoutMs}ms`,
                    'Check your baseUrl or network.'
                );
            }
            const cause = e instanceof Error ? e : new Error(String(e));
            throw new CliError(
                ExitCode.NETWORK,
                'ECONNREFUSED',
                `Cannot connect to ${this.baseUrl}: ${cause.message}`,
                'Is SiYuan running?'
            );
        } finally {
            // Headers-only timeout: a slow but steady body transfer is normal for files.
            clearTimeout(timer);
        }

        if (res.status === 401) {
            throw new CliError(
                ExitCode.AUTH,
                'UNAUTHORIZED',
                `Authentication failed for ${this.baseUrl}`,
                'Check your token with `siyuan-cli workspace show --reveal-token`.'
            );
        }

        if (res.status !== 200) {
            // Kernel error paths answer with the standard JSON envelope.
            let code: number | string = res.status;
            let msg: string = res.statusText;
            try {
                const envelope = (await res.json()) as KernelResponse<unknown>;
                if (envelope && typeof envelope.code === 'number') {
                    code = envelope.code;
                    msg = envelope.msg;
                }
            } catch {
                // Non-JSON error body — fall back to status text.
            }
            throw new CliError(
                ExitCode.GENERAL,
                'KERNEL_ERROR',
                `Kernel returned error (status ${res.status}, code ${code}): ${msg}`
            );
        }

        return {
            contentType: res.headers.get('content-type') ?? 'application/octet-stream',
            body: res.body,
            arrayBuffer: async () => new Uint8Array(await res.arrayBuffer())
        };
    }

    /**
     * Lightweight connectivity check via GET /api/system/version.
     */
    async ping(): Promise<PingResult> {
        try {
            const data = await this.call<{ ver: string }>(
                '/api/system/version',
                {}
            );
            return { ok: true, version: data.ver };
        } catch (e) {
            if (e instanceof CliError) {
                return { ok: false, message: e.message };
            }
            return { ok: false, message: String(e) };
        }
    }
}
