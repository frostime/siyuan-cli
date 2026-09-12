import type { ToolSchema } from '@/shared/schema.js';
import { isRecord } from '@/shared/output.js';
import {
    assertOutFileWritable,
    writeDownloadedFile
} from '@/shared/download-output.js';
import type { DownloadResult } from '@/shared/client.js';

/**
 * Normalize an asset path to the `assets/<name>` form. Accepts the shapes
 * asset paths appear in documents, including the `?box=<id>` query suffix
 * emitted by asset.getDocAssets. Returns null for anything outside the
 * assets root (notebook paths, parent traversal, absolute paths, drive letters).
 */
export function normalizeAssetPath(raw: string): string | null {
    let p = raw.trim().replace(/\\/g, '/');
    const queryStart = p.indexOf('?');
    if (queryStart >= 0) p = p.slice(0, queryStart);
    if (p.startsWith('/')) p = p.slice(1);
    if (p === '' || /^[a-zA-Z]:/.test(p)) return null;
    const segments = p.split('/');
    if (segments[0] !== 'assets') return null;
    if (segments.length < 2 || segments.some((s) => s === '' || s === '.' || s === '..')) {
        return null;
    }
    return segments.join('/');
}

export const tool: ToolSchema = {
    id: 'get-asset',
    summary: 'Download a workspace asset to a local file',
    description: `Fetches an asset (assets/...) through /api/file/getFile and routes the
bytes to their destination: textual content prints, binary content goes to a temp file
(path and sha256 printed); --outFile chooses the destination (overwrite requires --yes).

assetPath accepts the forms asset paths appear in documents, including a trailing
?box=<id> query (ignored — the kernel resolves the asset itself). Cloud-sync placeholder
assets are downloaded to local storage first. Encrypted-box assets are refused by the
kernel. For non-asset workspace files use api file.getFile directly.`,
    tags: ['read'],
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single'
    },
    input: {
        type: 'object',
        required: ['assetPath'],
        additionalProperties: false,
        properties: {
            assetPath: {
                type: 'string',
                description:
                    'Asset path as it appears in documents, e.g. assets/foo.png or assets/foo.png?box=<notebook-id>'
            },
            outFile: {
                type: 'string',
                description:
                    'Save output to this file (overwrite requires --yes); without it, binary content goes to a temp file'
            }
        }
    },
    cli: {
        examples: [
            {
                command:
                    'siyuan-cli tool get-asset --assetPath assets/foo-20240922152051-7dpjfpv.png',
                description: 'Binary asset → temp file, path and sha256 printed'
            },
            {
                command:
                    'siyuan-cli tool get-asset --assetPath assets/foo-20240922152051-7dpjfpv.png --outFile ./foo.png',
                description: 'Save the asset to a local path (overwrite requires --yes)'
            },
            {
                command:
                    'siyuan-cli tool get-asset --assetPath assets/note.md --dry-run',
                description: 'Preview resolved path without transferring'
            }
        ]
    },
    run: async (ctx, input) => {
        const { assetPath: rawAssetPath, outFile } = input as {
            assetPath: string;
            outFile?: string;
        };

        if (typeof rawAssetPath !== 'string' || rawAssetPath === '') {
            throw new Error('--assetPath must be a non-empty asset path.');
        }
        const assetPath = normalizeAssetPath(rawAssetPath);
        if (assetPath === null) {
            throw new Error(
                `--assetPath must be an asset path starting with assets/ ` +
                    `(e.g. "assets/foo.png"); got: ${rawAssetPath}`
            );
        }

        if (outFile !== undefined) {
            assertOutFileWritable(outFile, ctx.args.yes === true);
        }

        const result = await ctx.callEndpoint('file.getFile', {
            path: `data/${assetPath}`
        });

        if (isRecord(result) && result['dryRun'] === true) {
            return {
                content:
                    `[dry-run] Would fetch ${assetPath} ` +
                    `${outFile ? `and save to ${outFile}` : '(output routed by content type)'}.`,
                details: {
                    dryRun: true,
                    assetPath,
                    kernelPath: `data/${assetPath}`,
                    outFile: outFile ?? null
                }
            };
        }

        const output = await writeDownloadedFile({
            download: result as DownloadResult,
            fileName: assetPath,
            kernelPath: assetPath,
            outFile,
            jsonMode: ctx.args.print === 'json'
        });
        return { content: output.compact, details: output.data };
    }
};
