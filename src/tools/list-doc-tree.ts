import type { ToolSchema } from '../core/schema.js';
import { escapeSqliteLiteral } from '../utils/sql.js';

type Row = {
    id: string;
    box: string;
    path: string;
    hpath: string;
    content?: string;
};

type Node = { id: string; title: string; hpath: string; children: Node[]; unexpandedCount: number };

function buildTree(rows: Row[], rootKey: string, depth: number): Node[] {
    // `rootKey` is the childMap key to start walking from:
    //   - notebook mode: ""            (SiYuan's blocks.path is notebook-relative)
    //   - doc mode     : "/<doc-id>"   (root doc's path minus ".sy")
    const childMap = new Map<string, Row[]>();
    for (const row of rows) {
        const parentPath = row.path.includes('/')
            ? row.path.slice(0, row.path.lastIndexOf('/'))
            : '';
        if (!childMap.has(parentPath)) childMap.set(parentPath, []);
        childMap.get(parentPath)!.push(row);
    }
    function walk(parentPath: string, level: number): Node[] {
        const children = childMap.get(parentPath) ?? [];
        return children.map((r) => {
            const childKey = r.path.replace(/\.sy$/, '');
            const atLimit = depth >= 0 && level >= depth;
            const subCount = (childMap.get(childKey) ?? []).length;
            return {
                id: r.id,
                title: `${r.hpath.split('/').filter(Boolean).at(-1) ?? r.id} (${r.id})`,
                hpath: r.hpath,
                // unexpandedCount: children that exist in DB but won't be walked
                unexpandedCount: atLimit ? subCount : 0,
                children: atLimit ? [] : walk(childKey, level + 1)
            };
        });
    }
    return walk(rootKey, 1);
}

function render(nodes: Node[], prefix = '', isRoot = true): string[] {
    const lines: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const isLast = i === nodes.length - 1;
        if (isRoot) {
            // Top-level: no branch chars, just list items
            const suffix = n.unexpandedCount > 0 ? ` (+${n.unexpandedCount})` : '';
            lines.push(`- ${n.title}${suffix}`);
            lines.push(...render(n.children, '  ', false));
        } else {
            const branch = isLast ? '└─ ' : '├─ ';
            const suffix = n.unexpandedCount > 0 ? ` (+${n.unexpandedCount})` : '';
            lines.push(`${prefix}${branch}${n.title}${suffix}`);
            const childPrefix = prefix + (isLast ? '   ' : '│  ');
            lines.push(...render(n.children, childPrefix, false));
        }
    }
    return lines;
}

export const tool: ToolSchema = {
    id: 'list-doc-tree',
    summary: 'List the document tree under a notebook or document',
    tags: ['read', 'aggregate'],
    input: {
        type: 'object',
        required: ['entry'],
        additionalProperties: false,
        properties: {
            entry: {
                type: 'string',
                description: 'Notebook ID or document ID'
            },
            depth: {
                type: 'integer',
                description: 'Max depth, -1 for unlimited',
                default: 2
            },
            includeMeta: {
                type: 'boolean',
                description: 'Include meta in details',
                default: false
            }
        }
    },
    async run(ctx, input) {
        const { entry, depth } = input as {
            entry: string;
            depth?: number;
            includeMeta?: boolean;
        };
        let rootRows = await ctx.callEndpoint<Row[]>('query.sql', {
            stmt: `SELECT id, box, path, hpath FROM blocks WHERE id = '${escapeSqliteLiteral(entry)}' LIMIT 1`
        });
        let rows: Row[];
        let rootPath: string; // for display / details only
        let rootKey: string; // childMap key to start walking from
        let rootTitle: string;
        if (rootRows.length > 0) {
            const root = rootRows[0]!;
            rootPath = root.path;
            rootKey = root.path.replace(/\.sy$/, '');
            rootTitle = root.hpath.split('/').filter(Boolean).at(-1) ?? root.id;
            rows = await ctx.callEndpoint<Row[]>('query.sql', {
                stmt: `SELECT id, box, path, hpath FROM blocks WHERE type='d' AND box = '${root.box}' AND (path = '${escapeSqliteLiteral(root.path)}' OR path LIKE '${escapeSqliteLiteral(root.path).replace(/\.sy$/, '')}/%') ORDER BY path ASC`
            });
        } else {
            // Notebook mode: SiYuan's blocks.path is notebook-relative, so top-level
            // docs live under childMap[""], not childMap[`/${entry}`].
            rootPath = '/';
            rootKey = '';
            rootTitle = entry;
            rows = await ctx.callEndpoint<Row[]>('query.sql', {
                stmt: `SELECT id, box, path, hpath FROM blocks WHERE type='d' AND box = '${escapeSqliteLiteral(entry)}' ORDER BY path ASC`
            });
        }
        const tree = buildTree(rows, rootKey, depth ?? 2);
        const content = `# 文档树：${rootTitle}\n\n` + render(tree).join('\n');
        return {
            content,
            details: {
                root: { id: entry, path: rootPath, title: rootTitle },
                tree,
                stats: { nodeCount: rows.length }
            }
        };
    }
};
