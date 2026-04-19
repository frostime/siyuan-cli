import { registry as endpointRegistry } from './registry.js';
import { loadConfig, resolveEffectiveWorkspace } from './config.js';
import { SiyuanClient } from './client.js';
import { createPermissionEngine } from './permission.js';
import { executeEndpoint } from './guard.js';
import type {
    GlobalArgs,
    ToolContext,
    ToolResult,
    ToolSchema
} from './schema.js';

export class ToolRegistry {
    private readonly map = new Map<string, ToolSchema>();

    register(tool: ToolSchema): void {
        if (this.map.has(tool.id)) {
            throw new Error(`Tool "${tool.id}" is already registered.`);
        }
        this.map.set(tool.id, tool);
    }

    get(id: string): ToolSchema | undefined {
        return this.map.get(id);
    }

    list(filter?: { tag?: string }): ToolSchema[] {
        let items = [...this.map.values()];
        if (filter?.tag) {
            items = items.filter((t) => t.tags?.includes(filter.tag as never));
        }
        return items.sort((a, b) => a.id.localeCompare(b.id));
    }
}

export const toolRegistry = new ToolRegistry();

export async function createToolContext(
    args: GlobalArgs,
    toolId?: string
): Promise<ToolContext> {
    const config = loadConfig(args.config);
    const workspace = resolveEffectiveWorkspace(config, {
        workspace: args.workspace,
        baseUrl: args.baseUrl,
        token: args.token
    });
    const client = new SiyuanClient(workspace);
    const permission = createPermissionEngine(config, workspace, client);
    if (toolId) permission.checkTool(toolId);

    const callEndpoint: ToolContext['callEndpoint'] = async <T = unknown>(
        id: string,
        payload: unknown
    ): Promise<T> => {
        const entry = endpointRegistry.get(id);
        if (!entry) throw new Error(`Endpoint "${id}" not found.`);
        return executeEndpoint({
            entry,
            payload,
            client,
            engine: permission,
            workspace,
            callerTool: toolId,
            dryRun: args.dryRun,
            yes: args.yes,
            debug: args.debug
        }) as Promise<T>;
    };

    const callEndpointRaw: ToolContext['callEndpointRaw'] = async <T = unknown>(
        id: string,
        payload: unknown
    ): Promise<T> => {
        const entry = endpointRegistry.get(id);
        if (!entry) throw new Error(`Endpoint "${id}" not found.`);
        return client.call(entry.schema.endpoint, payload) as Promise<T>;
    };

    return {
        client,
        registry: endpointRegistry,
        permission,
        callEndpoint,
        callEndpointRaw,
        logger: console,
        args
    };
}

export function renderToolResult(result: ToolResult, args: GlobalArgs): void {
    for (const warning of result.warnings ?? []) {
        process.stderr.write(`[warn] ${warning}\n`);
    }
    if (args.debug && result.meta) {
        process.stderr.write(JSON.stringify({ meta: result.meta }) + '\n');
    }
    if (args.only === 'details') {
        process.stdout.write(
            JSON.stringify(result.details ?? null, null, 2) + '\n'
        );
        return;
    }
    if (args.details) {
        process.stdout.write(
            JSON.stringify(
                { content: result.content, details: result.details ?? null },
                null,
                2
            ) + '\n'
        );
        return;
    }
    process.stdout.write(result.content + '\n');
}

export function buildToolHelp(tool: ToolSchema): string {
    const lines: string[] = [];
    lines.push(tool.summary);
    lines.push('');
    lines.push('USAGE');
    if (tool.cli?.primary)
        lines.push(`  siyuan tool ${tool.id} <${tool.cli.primary}>`);
    lines.push(`  siyuan tool ${tool.id} [--<field> <value>...]`);
    lines.push('');
    lines.push('PARAMETERS');
    const required = new Set(tool.input.required ?? []);
    for (const [field, prop] of Object.entries(tool.input.properties)) {
        const req = required.has(field) ? 'required' : 'optional';
        const primary = tool.cli?.primary === field ? ' ← primary' : '';
        lines.push(
            `  --${field}  <${prop.type ?? 'string'}>  ${req}${primary}`
        );
        if (prop.description) lines.push(`        ${prop.description}`);
    }
    lines.push('');
    lines.push('OUTPUT');
    lines.push('  default: stdout prints content only');
    lines.push('  --details: stdout prints { content, details }');
    lines.push('  --only details: stdout prints details only');
    if (tool.cli?.examples?.length) {
        lines.push('');
        lines.push('EXAMPLES');
        for (const ex of tool.cli.examples) {
            lines.push(`  ${ex.command}`);
            if (ex.description) lines.push(`      ${ex.description}`);
        }
    }
    if (tool.description) {
        lines.push('');
        lines.push('DESCRIPTION');
        lines.push(`  ${tool.description}`);
    }
    return lines.join('\n');
}
