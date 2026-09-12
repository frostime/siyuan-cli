import type { EndpointSchema } from '@/shared/schema.js';

/** Minimal shape of the HTTP client this transport strategy relies on. */
interface SiyuanClientLike {
    download(endpoint: string, payload: unknown): Promise<unknown>;
}

export const schema: EndpointSchema = {
    endpoint: '/api/file/getFile',
    summary: 'Get file under workspace directory',
    description:
        'Reads a file under the workspace. `path` is relative to the workspace ROOT, so content files need the `data/` prefix (e.g. `data/assets/foo.png`) — `assets/...` alone resolves outside data/ and fails with 404. On success the response body is the raw file bytes (Content-Type describes the file); on failure the kernel answers with the standard JSON error envelope. Textual content (text/*, JSON, XML, YAML, JavaScript, SVG) prints to stdout; binary content is written to a temp file unless --outFile is given (overwriting requires --yes). Cloud-sync placeholder assets are downloaded to local storage first. Encrypted-box paths are refused by the kernel.',
    payload: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
            path: {
                type: 'string',
                description: 'File path relative to workspace root, e.g. data/assets/foo.png'
            }
        }
    },
    classification: {
        action: 'read',
        domain: 'storage',
        cardinality: 'single',
    },
    // Raw file bytes on success (HTTP 200), standard JSON error envelope on
    // failure (HTTP 202). Output routing (temp file / --outFile / stdout)
    // lives in the command layer (download-output).
    transport: ({ client, payload }) =>
        (client as SiyuanClientLike).download('/api/file/getFile', payload),
    cli: {
        primary: 'path',
        examples: [
            {
                command: 'siyuan-cli api file.getFile data/assets/foo-20240922152051-7dpjfpv.png'
            },
            {
                command:
                    'siyuan-cli api file.getFile data/assets/foo-20240922152051-7dpjfpv.png --outFile ./foo.png',
                description: 'Save binary content to a local file (overwrite requires --yes)'
            }
        ]
    },
    guard: {
        payloadTargets: [
            { path: 'path', kind: 'workspace-path', access: 'read' }
        ]
    }
};
