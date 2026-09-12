/**
 * Output routing for downloaded file bytes — decides where the content goes and what
 * the caller sees. Shared by download-capable endpoints (`file.getFile`)
 * and tools that wrap them (`get-asset`).
 *
 * Behavior matrix:
 * - text content  → --outFile: write file; no --outFile: print to stdout
 *   (json mode: embed as data.content when small, else fall back to temp file)
 * - binary content → --outFile: stream to file; no --outFile: write to a
 *   temp file under <os tmp>/siyuan-cli/assets and print the path + a hint
 * - overwriting an existing --outFile target requires --yes
 * - json output never embeds bytes; it reports savedTo/content + metadata
 */
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'pathe';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { CliError, ExitCode } from './errors.js';
import type { DownloadResult } from './client.js';

/** Text content at or below this size is embedded in --print json envelopes. */
export const TEXT_EMBED_LIMIT = 1024 * 1024;

/** SiYuan asset filenames end with `-<14 digits>-<7 alnum>` before the extension. */
const NODE_ID_SUFFIX = /-\d{14}-[0-9a-z]{7}(?=\.[^.]*$|$)/;

const TEXTUAL_MIME_TYPES = new Set([
    'application/json',
    'application/xml',
    'application/yaml',
    'application/javascript',
    'image/svg+xml'
]);

export interface DownloadOutputResult {
    compact: string;
    /** Structured data for --print json mode; never contains raw bytes. */
    data: {
        savedTo?: string;
        tempFile?: boolean;
        content?: string;
        size: number;
        contentType: string;
        sha256: string;
        path?: string;
    };
}

export function parseMimeType(contentType: string): string {
    const mime = contentType.split(';')[0]?.trim().toLowerCase();
    return mime || 'application/octet-stream';
}

export function isTextualContentType(contentType: string): boolean {
    const mime = parseMimeType(contentType);
    return mime.startsWith('text/') || TEXTUAL_MIME_TYPES.has(mime);
}

export function stripNodeIdSuffix(fileName: string): string {
    return fileName.replace(NODE_ID_SUFFIX, '');
}

export function formatByteSize(size: number): string {
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unit = 'B';
    for (const next of units) {
        if (value < 1024) break;
        value /= 1024;
        unit = next;
    }
    return `${value.toFixed(1)} ${unit}`;
}

/** The original extension is kept — many consumers key on it. */
export function buildTempAssetPath(fileName: string, baseDir: string, rand: string): string {
    const stem = stripNodeIdSuffix(basename(fileName));
    const ext = extname(stem);
    const name = `${stem.slice(0, stem.length - ext.length)}-${rand}${ext}`;
    return resolve(baseDir, 'siyuan-cli', 'assets', name);
}

export function assertOutFileWritable(outFile: string | undefined, yes: boolean): void {
    if (!outFile || yes) return;
    if (existsSync(outFile)) {
        throw new CliError(
            ExitCode.GENERAL,
            'OUT_FILE_EXISTS',
            `Output file already exists: ${outFile}`,
            'Pass --yes to overwrite it, or choose another --outFile path.'
        );
    }
}

export interface DownloadOutputOptions {
    download: DownloadResult;
    /** Kernel-side path or original file name — used for temp naming and details. */
    fileName: string;
    /** Kernel path the file was requested with, echoed in json details. */
    kernelPath?: string;
    outFile?: string;
    /** Whether the caller will print a --print json envelope. */
    jsonMode: boolean;
    textEmbedLimit?: number;
}

/**
 * Route downloaded bytes to their destination and produce the CLI output.
 * File writes are streamed (constant memory); sha256 is computed on the fly.
 */
export async function writeDownloadedFile(opts: DownloadOutputOptions): Promise<DownloadOutputResult> {
    const { download, fileName, outFile, jsonMode } = opts;
    const embedLimit = opts.textEmbedLimit ?? TEXT_EMBED_LIMIT;
    const contentType = parseMimeType(download.contentType);
    const textual = isTextualContentType(contentType);
    const pathDetails = opts.kernelPath ? { path: opts.kernelPath } : {};

    if (outFile) {
        const { savedTo, size, sha256 } = await streamToFile(download.body, resolve(outFile));
        return {
            compact: `Saved to ${savedTo} (${formatByteSize(size)}, ${contentType}) — sha256 ${shortHash(sha256)}`,
            data: { savedTo, size, contentType, sha256, ...pathDetails }
        };
    }

    if (textual) {
        const bytes = await download.arrayBuffer();
        const meta = {
            size: bytes.byteLength,
            contentType,
            sha256: sha256Hex(bytes),
            ...pathDetails
        };
        if (!jsonMode || bytes.byteLength <= embedLimit) {
            const content = new TextDecoder().decode(bytes);
            return { compact: content, data: { content, ...meta } };
        }
        // json mode, oversized text: keep the envelope small, point at a temp file.
        const savedTo = await writeTempFile(bytes, fileName);
        return {
            compact: tempFileNotice(savedTo, bytes.byteLength, contentType, sha256Hex(bytes)),
            data: { savedTo, tempFile: true, ...meta }
        };
    }

    // Binary without --outFile → temp file, output doubles as the hint.
    const tempPath = buildTempAssetPath(fileName, tmpdir(), randomBytes(4).toString('hex'));
    const { savedTo, size, sha256 } = await streamToFile(download.body, tempPath);
    return {
        compact: tempFileNotice(savedTo, size, contentType, sha256),
        data: { savedTo, tempFile: true, size, contentType, sha256, ...pathDetails }
    };
}

/** Hex sha256 of a byte buffer. */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function tempFileNotice(savedTo: string, size: number, contentType: string, sha256: string): string {
    return (
        `Binary content saved to: ${savedTo}\n` +
        `(size ${formatByteSize(size)}, ${contentType}, sha256 ${shortHash(sha256)})\n` +
        `Temp file may be cleaned by the OS; pass --outFile to keep it at a chosen path.`
    );
}

function shortHash(sha256: string): string {
    return `${sha256.slice(0, 4)}…${sha256.slice(-4)}`;
}

async function streamToFile(
    body: ReadableStream<Uint8Array> | null,
    dest: string
): Promise<{ savedTo: string; size: number; sha256: string }> {
    mkdirSync(dirname(dest), { recursive: true });
    const hash = createHash('sha256');
    let size = 0;
    const ws = createWriteStream(dest);
    if (body) {
        const tap = new PassThrough();
        tap.on('data', (chunk: Buffer) => {
            hash.update(chunk);
            size += chunk.length;
        });
        await pipeline(Readable.fromWeb(body as never), tap, ws);
    }
    return { savedTo: dest, size, sha256: hash.digest('hex') };
}

async function writeTempFile(bytes: Uint8Array, fileName: string): Promise<string> {
    const tempPath = buildTempAssetPath(fileName, tmpdir(), randomBytes(4).toString('hex'));
    mkdirSync(dirname(tempPath), { recursive: true });
    await writeFile(tempPath, bytes);
    return tempPath;
}
