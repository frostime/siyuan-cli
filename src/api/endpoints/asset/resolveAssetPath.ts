import type { EndpointSchema } from '@/shared/schema.js';

export const schema: EndpointSchema<string> = {
    endpoint: '/api/asset/resolveAssetPath',
    summary: 'Resolve an asset path to an absolute file path',
    description:
        'Turns a `data/`-relative asset path into the absolute path on disk, using the kernel asset resolver so notebook-local, global and encrypted-box storage layouts are all handled. `path` must start with `assets/`; append `?box=<notebook-id>` to address an encrypted notebook. If the asset is a cloud placeholder the kernel downloads it first, so the call can block.',
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
                    'siyuan-cli api asset.resolveAssetPath assets/image-20240922152051-7dpjfpv.png'
            }
        ]
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    },
    formatStrategy: 'direct'
};

/**
 * Response data type for resolveAssetPath
 */
export interface ResolveAssetPathResponse {
    code: number;
    msg: string;
    data: string;
}
