/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-30 18:57:35
 * @Description  :
 * @FilePath     : /src/api/endpoints/import/importStdMd.ts
 * @LastEditTime : 2026-04-30 20:12:39
 */
import type { EndpointSchema } from '@/shared/schema.js';

/**
 * importStdMd — Import a local Markdown file (or directory) into SiYuan.
 *
 * The kernel reads the file from the local filesystem, converts images,
 * Base64, HTML img, and inter-doc links automatically, and creates a new
 * document. It never overwrites — always creates a new doc with a new ID.
 *
 * NOTE: `localPath` is a host-filesystem path, not a SiYuan path.
 * The current ResourceKind vocabulary cannot express host paths for
 * permission checks, so this field is not guarded by payloadTargets.
 */
export const schema: EndpointSchema = {
    endpoint: '/api/import/importStdMd',
    summary: 'Import local Markdown file into SiYuan. (Prefer push-md tool over using this API directly.)',
    payload: {
        type: 'object',
        required: ['notebook', 'localPath', 'toPath'],
        additionalProperties: false,
        properties: {
            notebook: {
                type: 'string',
                description: 'Target notebook ID',
                pattern: '^\\d{14}-[0-9a-z]{7}$'
            },
            localPath: {
                type: 'string',
                description: 'Absolute path to the local .md file or directory on the server filesystem'
            },
            toPath: {
                type: 'string',
                description: 'SiYuan internal path (e.g. /20251111144823-0lhpmav.sy). Use "/" for root.'
            }
        }
    },

    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'create'
    },

    guard: {
        payloadTargets: [
            { path: 'notebook', kind: 'notebook', access: 'write' }
        ]
        // localPath: host filesystem path — ResourceKind cannot express this
        // toPath: internal .sy path — ResourceKind cannot express this
    },

    cli: {
        allowSource: { localPath: ['literal', 'file', 'stdin'] },
        skipFields: ['toPath']
    },

    formatStrategy: 'direct'
};