/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-18 13:58:17
 * @Description  :
 * @FilePath     : /src/apis/search/fullTextSearchBlock.ts
 * @LastEditTime : 2026-04-19 01:39:52
 */
import { formatRecordArray, isRecord } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

/**
 * Search result block
 */
export interface SearchBlock {
    box: string;
    path: string;
    hPath: string;
    id: string;
    rootID: string;
    parentID: string;
    name: string;
    alias: string;
    memo: string;
    tag: string;
    content: string;
    fcontent: string;
    markdown: string;
    folded: boolean;
    type: string;
    subType: string;
    refText: string;
    refs: string[] | null;
    defID: string;
    defPath: string;
    ial: Record<string, string>;
    children: SearchBlock[] | null;
    depth: number;
    count: number;
    sort: number;
    created: string;
    updated: string;
    riffCardID: string;
    riffCardReps: number;
}

/**
 * Response data type for fullTextSearchBlock
 */
export interface FullTextSearchBlockResponse {
    code: number;
    msg: string;
    data: {
        blocks: SearchBlock[];
        docMode: boolean;
        matchedBlockCount: number;
        matchedRootCount: number;
        pageCount: number;
    };
}

export const schema: EndpointSchema = {
    endpoint: '/api/search/fullTextSearchBlock',
    summary: 'Full-text search blocks',
    payload: {
        type: 'object',
        additionalProperties: false,
        properties: {
            method: { type: 'integer', description: 'Search method' },
            groupBy: { type: 'integer', description: 'Group by method' },
            orderBy: { type: 'integer', description: 'Order by method' },
            page: { type: 'integer', description: 'Page number' },
            pageSize: { type: 'integer', description: 'Items per page' },
            paths: {
                type: 'array',
                description: 'Path filter',
                items: { type: 'string' }
            },
            query: { type: 'string', description: 'Search keyword' },
            types: {
                type: 'object',
                description: 'Block type filter',
                properties: {},
                additionalProperties: true
            }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'global',
        operation: 'search'
    },
    cli: { primary: 'query' },
    response: {
        type: 'object',
        required: ['code', 'msg', 'data'],
        properties: {
            code: { type: 'integer', description: 'status code' },
            msg: { type: 'string', description: 'status message' },
            data: {
                type: 'object',
                required: ['blocks', 'docMode', 'matchedBlockCount', 'matchedRootCount', 'pageCount'],
                properties: {
                    blocks: {
                        type: 'array',
                        description: 'search results',
                        items: { type: 'object', additionalProperties: true }
                    },
                    docMode: { type: 'boolean', description: 'document search mode' },
                    matchedBlockCount: { type: 'integer', description: 'matched block count' },
                    matchedRootCount: { type: 'integer', description: 'matched document count' },
                    pageCount: { type: 'integer', description: 'page count' }
                }
            }
        }
    },
    guard: {
        payloadTargets: [{ path: 'paths[*]', kind: 'path', access: 'read' }],
        response: {
            itemsAt: 'blocks[*]',
            fieldMap: { id: 'id', path: 'path', notebook: 'box' }
        }
    },
    format: ({ result }) => {
        if (!isRecord(result)) return JSON.stringify(result, null, 2);
        const blocks = Array.isArray(result.blocks) ? result.blocks : [];
        const header = [
            `blocks=${blocks.length}`,
            result.matchedBlockCount !== undefined
                ? `matched=${String(result.matchedBlockCount)}`
                : undefined,
            result.pageCount !== undefined ? `pages=${String(result.pageCount)}` : undefined
        ]
            .filter(Boolean)
            .join(' | ');
        const body = formatRecordArray(blocks, {
            label: 'hits',
            maxItems: 10,
            keys: ['id', 'box', 'path', 'hPath', 'content', 'rootTitle']
        });
        return header ? `${header}\n${body}` : body;
    }
};
