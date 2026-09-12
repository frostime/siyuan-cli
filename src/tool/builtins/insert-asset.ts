import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';

const BLOCK_ID_PATTERN = /^\d{14}-[0-9a-z]{7}$/;

// Extensions the kernel renders as embedded media blocks from `![name](path)` markdown;
// everything else becomes a paragraph block with a plain link `[name](path)`.
const EMBED_EXTS = new Set([
    // image
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif', 'apng', 'ico',
    // audio
    'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus',
    // video
    'mp4', 'webm', 'mov', 'mkv', 'm4v', 'avi', 'flv', 'ogv'
]);

/**
 * Normalize a user-supplied assetsDirPath to the `assets` / `assets/<sub...>` form
 * accepted by /api/asset/upload, constrained to subdirectories of data/assets.
 * Returns null when the path escapes that contract (notebook-local dirs, parent
 * traversal, absolute paths outside the assets root).
 */
export function normalizeAssetsDirPath(raw: string): string | null {
    let p = raw.trim().replace(/\\/g, '/');
    if (p.startsWith('/')) p = p.slice(1);
    if (p === '' || /^[a-zA-Z]:/.test(p)) return null;
    const segments = p.split('/');
    if (segments[0] !== 'assets') return null;
    if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
    return segments.join('/');
}

/** How the new block is placed relative to afterBlockId. */
export type AnchorMode = 'after' | 'append';

/** A document block cannot have siblings; assets targeting a doc id append to its end. */
export function resolveAnchorMode(blockType: string | undefined): AnchorMode {
    return blockType === 'd' ? 'append' : 'after';
}

/** Strip characters that would break markdown link syntax. */
export function sanitizeLinkText(name: string): string {
    return name.replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'asset';
}

function extensionOf(p: string): string {
    return path.extname(p).slice(1).toLowerCase();
}

/**
 * Build the markdown for the new block. Embeddable media (image/audio/video)
 * uses `![name](path)` so the kernel creates the matching block type; other
 * files use a plain link inside a paragraph block.
 */
export function buildAssetMarkdown(assetPath: string, displayName: string): string {
    const name = sanitizeLinkText(displayName);
    return EMBED_EXTS.has(extensionOf(assetPath))
        ? `![${name}](${assetPath})`
        : `[${name}](${assetPath})`;
}

/**
 * Build an inline iframe block markdown for any asset path (html page, image,
 * PDF preview, ...). The kernel renders this as an `iframe` block.
 */
export function buildIframeMarkdown(assetPath: string): string {
    return `<iframe src="${assetPath}"></iframe>`;
}

/**
 * Extract the new block id from a block.insertBlock / block.appendBlock response.
 * Response data = transactions; the insert operation carries the new block id.
 */
export function extractInsertedBlockId(data: unknown): string | null {
    if (!Array.isArray(data) || data.length === 0) return null;
    const ops = (data[0] as { doOperations?: unknown } | null)?.doOperations;
    if (!Array.isArray(ops) || ops.length === 0) return null;
    const id = (ops[0] as { id?: unknown }).id;
    return typeof id === 'string' && id !== '' ? id : null;
}

interface UploadResult {
    errFiles: string[] | null;
    succMap: Record<string, string>;
}

export const tool: ToolSchema = {
    id: 'insert-asset',
    summary: 'Upload a local file to assets and insert it after a block',
    description: `Uploads a local file via /api/asset/upload and inserts the returned asset
after afterBlockId as a new block. Image/audio/video files become embedded media blocks
(![name](assets/...)); other files (PDF, zip, ...) become a paragraph block with a link.

assetsDirPath, when given, must normalize to data/assets or a subdirectory of it
(assets, assets/sub, /assets/sub — never notebook-local or parent paths).
When omitted the kernel default (global data/assets) is used.

If afterBlockId is a document block, the asset is appended to the end of that
document instead. Same-content uploads are deduplicated by the kernel (hash).`,
    tags: ['write'],
    classification: {
        action: 'write',
        domain: 'storage',
        concerns: ['filesystem'],
        cardinality: 'single'
    },
    input: {
        type: 'object',
        required: ['assetFile', 'afterBlockId'],
        additionalProperties: false,
        properties: {
            assetFile: {
                type: 'string',
                description: 'Local file path to upload as an asset'
            },
            afterBlockId: {
                type: 'string',
                description:
                    'Insert after this block; if it is a document id, append to the end of the document',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            assetsDirPath: {
                type: 'string',
                description:
                    'Target assets directory relative to data/, constrained to assets/ subdirectories; default: kernel default (data/assets)'
            },
            asIframe: {
                type: 'boolean',
                default: false,
                description:
                    'Force the asset into an inline iframe block instead of the type-based mapping (html page, image, PDF preview, ...)'
            }
        }
    },
    cli: {
        examples: [
            {
                command:
                    'siyuan-cli tool insert-asset --assetFile ./photo.png --afterBlockId 20240922152051-7dpjfpv',
                description: 'Upload an image and insert it after a block'
            },
            {
                command:
                    'siyuan-cli tool insert-asset --assetFile ./doc.pdf --afterBlockId 20240922152051-7dpjfpv --assetsDirPath assets/papers',
                description: 'Upload a PDF into a data/assets subdirectory'
            },
            {
                command:
                    'siyuan-cli tool insert-asset --assetFile ./photo.png --afterBlockId 20240922152051-7dpjfpv --dry-run',
                description: 'Preview target block, asset dir and markdown without uploading'
            }
        ]
    },
    run: async (ctx, input) => {
        const {
            assetFile,
            afterBlockId,
            assetsDirPath: rawAssetsDirPath,
            asIframe = false
        } = input as {
            assetFile: string;
            afterBlockId: string;
            assetsDirPath?: string;
            asIframe?: boolean;
        };

        if (typeof assetFile !== 'string' || assetFile === '') {
            throw new Error('--assetFile must be a non-empty local file path.');
        }
        if (typeof afterBlockId !== 'string' || !BLOCK_ID_PATTERN.test(afterBlockId)) {
            throw new Error(`--afterBlockId is not a valid block ID: ${String(afterBlockId)}`);
        }
        let assetsDirPath: string | undefined;
        if (rawAssetsDirPath !== undefined) {
            const normalized = normalizeAssetsDirPath(rawAssetsDirPath);
            if (normalized === null) {
                throw new Error(
                    `--assetsDirPath must be data/assets or a subdirectory of it ` +
                        `(e.g. "assets", "assets/papers"); got: ${rawAssetsDirPath}`
                );
            }
            assetsDirPath = normalized;
        }

        const fileStat = await stat(assetFile).catch(() => null);
        if (fileStat === null || !fileStat.isFile()) {
            throw new Error(`Local file not found: ${assetFile}`);
        }

        // Permission: the anchor block is both read (lookup) and write (insert) target.
        await ctx.permission.checkContentRef(
            { kind: 'id', value: afterBlockId, access: 'read' },
            { tool: 'insert-asset' }
        );
        await ctx.permission.checkContentRef(
            { kind: 'id', value: afterBlockId, access: 'write' },
            { tool: 'insert-asset' }
        );

        // Resolve the anchor block.
        const rows = await ctx.callEndpoint<{ id: string; type: string; root_id: string }[]>(
            'query.sql',
            { stmt: `SELECT id, type, root_id FROM blocks WHERE id = '${escapeSqliteLiteral(afterBlockId)}'` },
            { bypassPermission: true }
        );
        const anchor = rows[0];
        if (!anchor) {
            throw new Error(`Block not found: ${afterBlockId}`);
        }
        const mode = resolveAnchorMode(anchor.type);

        if (ctx.args.dryRun) {
            const displayName = path.basename(assetFile);
            const ext = extensionOf(assetFile);
            const blockKind = asIframe
                ? 'an inline iframe'
                : EMBED_EXTS.has(ext) ? 'an embedded-media' : 'a paragraph';
            return {
                content:
                    `[dry-run] Would upload ${assetFile} to ` +
                    `${assetsDirPath ?? 'assets (kernel default)'} and insert ${blockKind} block ` +
                    `${mode === 'append' ? 'at the end of document' : 'after'} ${afterBlockId}.`,
                details: {
                    dryRun: true,
                    assetFile,
                    afterBlockId,
                    blockType: anchor.type,
                    mode,
                    assetsDirPath: assetsDirPath ?? null,
                    displayName
                }
            };
        }

        // Upload. Pure forwarding to /api/asset/upload; kernel deduplicates by content hash.
        const uploadPayload: Record<string, unknown> = { 'file[]': [assetFile] };
        if (assetsDirPath !== undefined) uploadPayload['assetsDirPath'] = assetsDirPath;
        const upload = await ctx.callEndpoint<UploadResult>('asset.upload', uploadPayload);
        const displayName = path.basename(assetFile);
        const assetPath = upload.succMap?.[displayName];
        if (!assetPath) {
            const failed = upload.errFiles?.length
                ? `Failed files: ${upload.errFiles.join(', ')}.`
                : 'Kernel returned no asset path.';
            throw new Error(`Asset upload failed for ${displayName}. ${failed}`);
        }

        // Insert the new block.
        const markdown = asIframe
            ? buildIframeMarkdown(assetPath)
            : buildAssetMarkdown(assetPath, displayName);
        const insertPayload =
            mode === 'append'
                ? { dataType: 'markdown', data: markdown, parentID: afterBlockId }
                : { dataType: 'markdown', data: markdown, previousID: afterBlockId };
        const response = await ctx.callEndpoint<unknown>(
            mode === 'append' ? 'block.appendBlock' : 'block.insertBlock',
            insertPayload
        );
        const newBlockId = extractInsertedBlockId(response);
        if (newBlockId === null) {
            throw new Error('Asset inserted, but the new block id could not be read from the kernel response.');
        }

        return {
            content:
                `Inserted asset ${assetPath} as block ${newBlockId} ` +
                `${mode === 'append' ? 'at the end of document' : 'after'} ${afterBlockId}.`,
            details: {
                assetPath,
                newBlockId,
                afterBlockId,
                mode,
                blockType: anchor.type,
                rootId: anchor.root_id,
                assetsDirPath: assetsDirPath ?? null,
                markdown
            }
        };
    }
};
