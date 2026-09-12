import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<AssetStat> = {
    endpoint: '/api/asset/statAsset',
    summary: 'Stat a single asset file',
    description:
        'Reports size and timestamps for one asset. `path` is relative to the workspace `data/` directory and must start with `assets/` — a leading slash is rejected by the kernel. Append `?box=<notebook-id>` to address an encrypted notebook. Assets that are still cloud placeholders are answered from the sync index with `downloaded: false` instead of failing.',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: {
                type: 'string',
                description: 'Asset path relative to data/, e.g. assets/foo.png'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single'
    },
    cli: {
        primary: 'path',
        examples: [
            {
                command:
                    'siyuan-cli api asset.statAsset assets/image-20240922152051-7dpjfpv.png'
            }
        ]
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    formatStrategy: 'object'
};

/**
 * Asset file statistics. `created`/`updated` are Unix milliseconds.
 */
export interface AssetStat {
    size: number;
    hSize: string;
    created: number;
    hCreated: string;
    updated: number;
    hUpdated: string;
    /** Only present for cloud-deferred assets that are not downloaded locally. */
    downloaded?: boolean;
}

/**
 * Response data type for statAsset
 */
export interface StatAssetResponse {
    code: number;
    msg: string;
    data: AssetStat;
}
