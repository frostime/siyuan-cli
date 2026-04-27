import { formatRecords, isRecord } from '@/shared/output.js';
import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<Array<Record<string, unknown>>> = {
    endpoint: '/api/query/sql',
    summary: 'Query SiYuan database via SQL',
    description:
        'Execute SQL `select` queries. The CLI permission layer filters results by path/notebook by default.',
    payload: {
        type: 'object',
        required: ['stmt'],
        additionalProperties: false,
        properties: {
            stmt: { type: 'string', description: 'SQL query statement' }
        }
    },
    classification: {
        mode: 'read',
        surface: 'content',
        scope: 'global',
        operation: 'query'
    },
    cli: {
        primary: 'stmt',
        aliases: { stmt: 's' },
        allowSource: {
            stmt: ['literal', 'file', 'stdin']
        },
        examples: [
            { command: 'siyuan api query.sql "SELECT id FROM blocks LIMIT 5"' },
            { command: 'siyuan api query.sql --stmt @file:./query.sql' },
            { command: 'cat query.sql | siyuan api query.sql --stmt @stdin' }
        ]
    },
    guard: {
        response: {
            itemsAt: '[*]',
            fieldMap: { id: 'id', path: 'path', notebook: 'box' }
        }
    },
    format: ({ responseData }) => {
        const first = responseData.find(isRecord);
        if (!first) return formatRecords(responseData, { label: 'rows' });
        // Use actual columns from the result, preserving order
        const keys = Object.keys(first);
        return formatRecords(responseData, { label: 'rows', keys });
    }
};

/**
 * Response data type for SQL query
 */
export interface SqlQueryResponse {
    code: number;
    msg: string;
    data: Array<Record<string, unknown>>;
}