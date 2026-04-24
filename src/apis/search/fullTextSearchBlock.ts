/*
 * @Author       : frostime
 * Copyright (c) 2026 by frostime. All Rights Reserved.
 * @Date         : 2026-04-18 13:58:17
 * @Description  :
 * @FilePath     : /src/apis/search/fullTextSearchBlock.ts
 * @LastEditTime : 2026-04-19 01:39:52
 */
import { formatRecords } from '../../core/output.js';
import type { EndpointSchema } from '../../core/schema.js';

export const schema: EndpointSchema<{
    blocks: SearchBlock[];
    docMode?: boolean;
    matchedBlockCount?: number;
    matchedRootCount?: number;
    pageCount?: number;
}> = {
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
    guard: {
        payloadTargets: [{ path: 'paths[*]', kind: 'path', access: 'read' }],
        response: {
            itemsAt: 'blocks[*]',
            fieldMap: { id: 'id', path: 'path', notebook: 'box' }
        }
    },
    format: ({ responseData }) => {
        const header = [
            `blocks=${responseData.blocks.length}`,
            responseData.matchedBlockCount !== undefined
                ? `matched=${String(responseData.matchedBlockCount)}`
                : undefined,
            responseData.pageCount !== undefined ? `pages=${String(responseData.pageCount)}` : undefined
        ]
            .filter(Boolean)
            .join(' | ');
        const body = formatRecords(responseData.blocks, {
            label: 'hits',
            keys: ['id', 'box', 'path', 'hPath', 'content', 'rootTitle']
        });
        return header ? `${header}\n${body}` : body;
    }
};

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
