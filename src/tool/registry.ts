import { registry as endpointRegistry } from '../api/registry.js';
import { loadConfig, materializeWorkspace, resolveEffectiveWorkspace } from '../workspace/config.js';
import { SiyuanClient } from '../shared/client.js';
import { createPermissionEngine } from '../shared/permission.js';
import { executeEndpoint } from '../api/guard.js';
import { createJsonPrintExtra, preparePrintedOutput, type JsonPrintExtra } from '../shared/output.js';
import type {
    GlobalArgs,
    ToolContext,
    ToolResult,
    ToolSchema
} from '../shared/schema.js';

export class ToolRegistry {
    private readonly map = new Map<string, ToolSchema>();
    private readonly extensionIds = new Set<string>();

    register(tool: ToolSchema): void {
        if (this.map.has(tool.id)) {
            throw new Error(`Tool "${tool.id}" is already registered.`);
        }
        this.map.set(tool.id, tool);
    }

    registerExtension(tool: ToolSchema): boolean {
        const existing = this.map.get(tool.id);
        if (existing && !this.extensionIds.has(tool.id)) {
            console.warn(
                `[ext] Skipping extension "${tool.id}": conflicts with builtin`
            );
            return false;
        }
        this.map.set(tool.id, tool);
        this.extensionIds.add(tool.id);
        return true;
    }

    get(id: string): ToolSchema | undefined {
        return this.map.get(id);
    }

    isExtension(id: string): boolean {
        return this.extensionIds.has(id);
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
    toolId?: string,
    jsonExtra?: JsonPrintExtra
): Promise<ToolContext> {
    const config = loadConfig(args.config);
    const workspace = resolveEffectiveWorkspace(config, {
        workspace: args.workspace,
        baseUrl: args.baseUrl,
        token: args.token
    });
    const materialized = await materializeWorkspace(workspace);
    const client = new SiyuanClient(materialized);
    const permission = createPermissionEngine(config, workspace, client);
    if (toolId) permission.checkTool(toolId);

    /**
     * Call an endpoint through the full guard pipeline.
     * Includes: payload validation → permission check (Phase 1+2) → approval gate
     * → dry-run short-circuit → kernel call → response filtering.
     * Threads `callerTool` for tool-scoped permission rules.
     *
     * Use for any call a user could make directly. Respects --dry-run, --yes, --debug.
     */
    const callEndpoint: ToolContext['callEndpoint'] = async <T = unknown>(
        id: string,
        payload: unknown,
        opts?: { bypassPermission?: boolean }
    ): Promise<T> => {
        const entry = endpointRegistry.get(id);
        if (!entry) throw new Error(`Endpoint "${id}" not found.`);
        return executeEndpoint({
            entry,
            payload,
            client,
            engine: permission,
            config,
            workspace,
            callerTool: toolId,
            jsonExtra,
            dryRun: args.dryRun,
            yes: args.yes,
            debug: args.debug,
            bypassPermission: opts?.bypassPermission
        }) as Promise<T>;
    };

    /**
     * Call an endpoint directly, bypassing all guards.
     * Skips: payload validation, permission check, approval, dry-run, debug.
     * Use ONLY for internal read probes (e.g. SQL lookup to resolve an id)
     * where re-entering the guard pipeline would hurt UX.
     *
     * ⚠ No permission enforcement. Think before reaching for this.
     */
    const callEndpointRaw: ToolContext['callEndpointRaw'] = async <T = unknown>(
        endpoint: string,
        payload: unknown
    ): Promise<T> => {
        return client.call(endpoint, payload) as Promise<T>;
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

export function renderToolResult(
    result: ToolResult,
    args: GlobalArgs,
    jsonExtra = args.print === 'json' ? createJsonPrintExtra() : undefined
): void {
    for (const warning of result.warnings ?? []) {
        if (jsonExtra) {
            jsonExtra.warnings.push({ warning });
        } else {
            process.stderr.write(`[warn] ${warning}\n`);
        }
    }
    if (jsonExtra && result.meta) {
        jsonExtra.meta = result.meta;
    } else if (args.debug && result.meta) {
        process.stderr.write(JSON.stringify({ meta: result.meta }) + '\n');
    }
    const rendered = preparePrintedOutput({
        print: args.print,
        details: result.details ?? null,
        compact: result.content,
        jsonExtra
    });
    process.stdout.write(rendered.stdout + '\n');
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

    // Input sources
    const allowSource = tool.cli?.allowSource;
    if (allowSource && Object.keys(allowSource).length > 0) {
        lines.push('INPUT SOURCES');
        for (const [field, sources] of Object.entries(allowSource)) {
            lines.push(`  ${field}: ${sources.join(' | ')}`);
        }
        lines.push('');
    }

    lines.push('OUTPUT');
    lines.push('  default: --print compact → stdout prints content');
    lines.push('  --print json: stdout prints { ok, data, extra } envelope JSON');
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
