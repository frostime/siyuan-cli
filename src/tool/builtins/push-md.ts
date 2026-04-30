import type { ToolSchema } from '@/shared/schema.js';
import { escapeSqliteLiteral } from '@/shared/sql.js';
import { resolve } from 'pathe';

const BANNED_CHARS_RE = /[\\/:*?"<>|]/g;

function normalizeParentHPath(hPath: string): string {
    let normalized = hPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    if (normalized !== '/' && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized === '' ? '/' : normalized;
}

export const tool: ToolSchema = {
    id: 'push-md',
    summary:
        'Push a local Markdown file to SiYuan; uses kernel import for automatic image/link handling',
    description: `Imports a local .md file into SiYuan. The kernel handles image copying,
Base64 decoding, HTML img conversion, and inter-doc link conversion automatically.

Create mode (default): imports only when the target hpath is currently unused.
If the same-name document already exists, the tool refuses and tells the caller to
either use --overwrite (delete + re-import, changes doc ID) or do fine-grained
editing via block.updateBlock / block.insertBlock / block.appendBlock.

Overwrite mode (--overwrite): requires exactly one existing target document.
If multiple documents share the target hpath, the tool refuses as ambiguous.
It checks inbound references to the existing document root AND all descendant
blocks and refuses if found.

Uses global --dry-run to preview without writing.`,
    tags: ['write'],
    input: {
        type: 'object',
        required: ['sourcePath', 'notebook', 'toPath'],
        additionalProperties: false,
        properties: {
            sourcePath: {
                type: 'string',
                description: 'Path to the local .md file (resolved relative to cwd or absolute)'
            },
            notebook: {
                type: 'string',
                description: 'Target notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            toPath: {
                type: 'string',
                description:
                    'SiYuan parent hpath. Document name derived from source filename. e.g. "/inbox" + "my-note.md" → "/inbox/my-note"'
            },
            overwrite: {
                type: 'boolean',
                description:
                    'Delete existing document at target before importing. Checks for inbound references and refuses if found.',
                default: false
            }
        }
    },
    cli: {
        primary: 'sourcePath',
        examples: [
            {
                command: 'siyuan tool push-md ./notes/hello.md --notebook 20241016135347-zlrn2cz --toPath /inbox'
            },
            {
                command: 'siyuan tool push-md ./notes/hello.md --notebook 20241016135347-zlrn2cz --toPath /inbox --overwrite true'
            }
        ]
    },

    async run(ctx, input) {
        const { sourcePath, notebook, toPath, overwrite } =
            input as { sourcePath: string; notebook: string; toPath: string; overwrite?: boolean };
        const dryRun = ctx.args.dryRun;
        const doOverwrite = overwrite ?? false;

        // ── STEP 1: Validate source file ──
        const resolved = resolve(process.cwd(), sourcePath);
        const fs = await import('node:fs/promises');
        let stat;
        try {
            stat = await fs.stat(resolved);
        } catch {
            return errorResult('file-not-found', `File not found: ${resolved}`, {
                hint: 'Check the file path.'
            });
        }
        if (!stat.isFile()) {
            return errorResult('not-a-file', `Not a file: ${resolved}. Directories not yet supported.`, {});
        }
        const ext = resolved.split('.').pop()?.toLowerCase();
        if (ext !== 'md' && ext !== 'markdown') {
            console.warn(`[push-md] Warning: file extension is .${ext}, expected .md or .markdown. Proceeding anyway.`);
        }

        // ── STEP 2: Derive target document hpath ──
        const docName = resolved.split(/[/\\]/).pop()!.replace(/\.[^.]+$/, '');
        const sanitized = docName.replace(BANNED_CHARS_RE, '-');
        const normalizedToPath = normalizeParentHPath(toPath);
        const targetHpath =
            normalizedToPath === '/' ? '/' + sanitized : normalizedToPath + '/' + sanitized;

        // ── STEP 3: Check for existing document at target hpath ──
        const existingIds: string[] = await ctx.callEndpoint('filetree.getIDsByHPath', {
            notebook,
            path: targetHpath
        });

        if (existingIds.length > 0 && !doOverwrite) {
            return errorResult('document-exists', `Document already exists at '${targetHpath}'`, {
                existingIds,
                hint: 'Use --overwrite to replace (deletes old doc, changes ID), or use block.updateBlock / block.insertBlock / block.appendBlock for in-place edits.'
            });
        }

        if (existingIds.length > 1 && doOverwrite) {
            return errorResult('ambiguous-overwrite', `Cannot overwrite '${targetHpath}': ${existingIds.length} documents share this hpath`, {
                existingIds,
                hint: 'Resolve the ambiguity first. SiYuan allows duplicate hpaths, but this tool needs exactly one target.'
            });
        }

        let existingId: string | undefined;
        if (existingIds.length === 1 && doOverwrite) {
            existingId = existingIds[0]!;

            // STEP 3a: Check inbound references for existing doc root + descendants
            const refCheck = await ctx.callEndpoint<Array<{ def_block_id: string }>>('query.sql', {
                stmt: `SELECT def_block_id FROM refs WHERE def_block_id IN (
                    SELECT id FROM blocks WHERE root_id = '${escapeSqliteLiteral(existingId)}'
                    UNION SELECT '${escapeSqliteLiteral(existingId)}'
                ) LIMIT 1`
            });
            if (refCheck.length > 0) {
                return errorResult(
                    'inbound-refs',
                    `Cannot overwrite: document ${existingId} or its child blocks have inbound references`,
                    {
                        hint: 'Other documents link to this tree. Overwriting would break those links. Remove references first, or use brute-edit / low-level block APIs for in-place content updates.'
                    }
                );
            }

            // STEP 3b: Delete existing document (skip in dry-run)
            if (!dryRun) {
                await ctx.callEndpoint('filetree.removeDocByID', { id: existingId });
            }
        }

        // ── STEP 4: Convert HPath → internal path for kernel ──
        let internalPath: string;
        if (normalizedToPath === '/') {
            internalPath = '/';
        } else {
            const parentIds: string[] = await ctx.callEndpoint('filetree.getIDsByHPath', {
                notebook,
                path: normalizedToPath
            });
            if (parentIds.length === 0) {
                return errorResult('parent-not-found', `Parent path not found: '${normalizedToPath}'`, {
                    hint: 'Create the parent folder first.'
                });
            }
            if (parentIds.length > 1) {
                return errorResult('parent-ambiguous', `Parent path is ambiguous: '${normalizedToPath}' matches multiple documents`, {
                    parentIds,
                    hint: 'Use a unique parent path.'
                });
            }
            const parentPath = await ctx.callEndpoint<{ path: string }>('filetree.getPathByID', {
                id: parentIds[0]
            });
            internalPath = parentPath.path;
        }

        // ── STEP 5: dry-run preview ──
        if (dryRun) {
            return {
                content: `DRY RUN: Would import '${resolved}' → '${targetHpath}' in notebook ${notebook}`,
                details: {
                    sourcePath: resolved,
                    targetHpath,
                    notebook,
                    action: doOverwrite ? 'replace' : 'create',
                    existingDocId: existingId ?? null,
                    internalPath,
                    dryRun: true
                }
            };
        }

        // ── STEP 6: Call guarded import endpoint ──
        await ctx.callEndpoint('import.importStdMd', {
            notebook,
            localPath: resolved,
            toPath: internalPath
        });

        // ── STEP 7: Locate created document ──
        const postIds: string[] = await ctx.callEndpoint('filetree.getIDsByHPath', {
            notebook,
            path: targetHpath
        });

        if (postIds.length === 0) {
            return errorResult('import-failed', `Import completed but no document found at '${targetHpath}'`, {
                hint: 'The kernel may have rejected the import. Check localPath restrictions.'
            });
        }

        // Take newest by created time if multiple
        let newId: string;
        if (postIds.length === 1) {
            newId = postIds[0]!;
        } else {
            const newestRows = await ctx.callEndpoint<
                Array<{ id: string; created: string }>
            >('query.sql', {
                stmt: `SELECT id, created FROM blocks WHERE id IN (${postIds.map((id) => `'${escapeSqliteLiteral(id)}'`).join(',')}) AND type = 'd' ORDER BY created DESC LIMIT 1`
            });
            if (newestRows.length === 0) {
                return errorResult('import-failed', `Import completed but no document found at '${targetHpath}'`, {});
            }
            newId = newestRows[0]!.id;
        }

        return {
            content: `Imported: ${targetHpath} (id: ${newId})`,
            details: {
                docId: newId,
                hpath: targetHpath,
                notebook,
                sourcePath: resolved,
                action: doOverwrite ? 'replaced' : 'created'
            }
        };
    }
};

function errorResult(reason: string, content: string, details: Record<string, unknown>) {
    return { content, details: { reason, ...details } };
}