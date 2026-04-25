/**
 * Schema guard execution — payload checking + response filtering.
 */
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type CallerContext,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import { buildPreparedApprovalRequest, requestAndWait } from '../approval/index.js';
import {
    ConfirmationRequiredError,
    ContentDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';
import type { ResolvedWorkspace } from './config.js';

const RISK_TRIGGERS_IMPLICIT_WARNING = new Set<string>([
    'elevated',
    'destructive',
    'critical'
]);

function maybeWarnImplicitWorkspace(
    entry: RegisteredEndpoint,
    workspace: ResolvedWorkspace | undefined
): void {
    if (!workspace) return;
    if (workspace.source !== 'global-current') return;
    if (!RISK_TRIGGERS_IMPLICIT_WARNING.has(entry.meta.risk)) return;
    process.stderr.write(
        JSON.stringify({
            warning: 'IMPLICIT_WORKSPACE',
            endpoint: entry.id,
            workspace: workspace.name,
            risk: entry.meta.risk,
            hint: 'Resolved from global config.current. Pass --workspace, set $SIYUAN_CLI_WORKSPACE, or add .siyuan-cli.yaml to anchor the target.'
        }) + '\n'
    );
}

export async function applyPayloadGuard(
    schema: EndpointSchema,
    payload: unknown,
    engine: PermissionEngineLike,
    access: 'read' | 'write',
    caller?: CallerContext
): Promise<void> {
    const targets = schema.guard?.payloadTargets;
    if (targets?.length) {
        for (const target of targets) {
            let values: unknown[];
            try {
                values = evaluatePointerPath(payload, target.path);
            } catch (error) {
                throw new ContentDeniedError((error as Error).message);
            }
            for (const value of values) {
                if (typeof value !== 'string') {
                    throw new ContentDeniedError(
                        `payload path "${target.path}" must resolve to string values`
                    );
                }
                await engine.checkContentRef(
                    { kind: target.kind, value, access: target.access },
                    caller
                );
            }
        }
    }
}

/**
 * Response guards operate on the unwrapped `data` returned by SiyuanClient.
 * They do not see the raw kernel envelope `{ code, msg, data }`.
 */
export async function applyResponseGuard(
    schema: EndpointSchema,
    response: unknown,
    engine: PermissionEngineLike,
    caller?: CallerContext
): Promise<unknown> {
    const guard = schema.guard;
    if (!guard) return response;
    if (guard.filterResponse) {
        return await guard.filterResponse(response, engine);
    }
    if (guard.response) {
        const { itemsAt, fieldMap } = guard.response;
        const items = evaluatePointerPath(response, itemsAt);
        const { kept, removed, reasons } = await engine.filterItems(
            items,
            (item) => {
                const i = item as Record<string, unknown>;
                return {
                    id: fieldMap.id
                        ? (i[fieldMap.id] as string | undefined)
                        : undefined,
                    path: fieldMap.path
                        ? (i[fieldMap.path] as string | undefined)
                        : undefined,
                    notebook: fieldMap.notebook
                        ? (i[fieldMap.notebook] as string | undefined)
                        : undefined
                };
            },
            caller,
            'read'
        );
        if (removed > 0) {
            const summary = Object.entries(reasons)
                .map(([r, n]) => `${n}x: ${r}`)
                .join('; ');
            process.stderr.write(
                JSON.stringify({
                    warning: 'CONTENT_FILTERED',
                    removed,
                    reasons: summary
                }) + '\n'
            );
            return runPointerFilterTerminal(response, itemsAt, () => kept);
        }
    }
    return response;
}

export interface ExecuteOptions {
    entry: RegisteredEndpoint;
    payload: unknown;
    client: SiyuanClient;
    engine: PermissionEngine;
    /** Optional — when supplied, enables IMPLICIT_WORKSPACE warning on write-like risks. */
    workspace?: ResolvedWorkspace;
    /** When called from inside a tool, carries the tool id for permission context. */
    callerTool?: string;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}

function debugPreview(schema: EndpointSchema, payload: unknown): void {
    const body = JSON.stringify(payload);
    const curl = `curl -X POST <baseUrl>${schema.endpoint} -H "Content-Type: application/json" --data ${JSON.stringify(body)}`;
    process.stderr.write(
        JSON.stringify({
            debug: { endpoint: schema.endpoint, payload, curl }
        }) + '\n'
    );
}

function isWriteLike(entry: RegisteredEndpoint): boolean {
    return (
        entry.meta.classification.mode === 'write' ||
        entry.meta.classification.mode === 'invoke'
    );
}

export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
    const {
        entry,
        payload,
        client,
        engine,
        workspace,
        callerTool,
        dryRun,
        yes,
        debug
    } = opts;
    const { schema } = entry;
    const { id } = deriveEndpointId(schema.endpoint);
    const caller: CallerContext = {
        endpoint: id,
        ...(callerTool ? { tool: callerTool } : {})
    };
    const action: 'read' | 'write' = isWriteLike(entry) ? 'write' : 'read';

    maybeWarnImplicitWorkspace(entry, workspace);

    // Phase 1: caller-level gate
    engine.checkEndpoint(id);

    // Phase 2: resource-level gate (payload targets)
    await applyPayloadGuard(schema, payload, engine, action, caller);

    if (debug) debugPreview(schema, payload);

    // Confirm: rule-based + risk-auto post-processing
    // Risk-auto: if the rule says 'allow' but risk is destructive/critical,
    // upgrade to 'confirm'. User-written 'deny' or 'confirm' are never downgraded.
    const ruleEffect = engine.evaluate({ ...caller, action });
    const wouldConfirm =
        ruleEffect === 'confirm' ||
        (ruleEffect === 'allow' && entry.meta.requiresConfirmation);

    if (dryRun && isWriteLike(entry)) {
        return {
            dryRun: true,
            endpoint: schema.endpoint,
            payload,
            wouldConfirm
        };
    }

    if (wouldConfirm && !yes) {
        if (!workspace) {
            throw new ConfirmationRequiredError(id);
        }
        await requestAndWait(
            buildPreparedApprovalRequest({
                workspaceName: workspace.name,
                entry,
                payload,
                ...(callerTool ? { callerTool } : {})
            })
        );
    }

    let response: unknown;
    if (schema.multipart) {
        const files = (schema.multipart.fileFields || []).flatMap((field) => {
            const val = (payload as Record<string, unknown>)[field];
            const paths = Array.isArray(val) ? val : [val];
            return (paths as string[]).map((p) => ({ field, path: p }));
        });
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(
            payload as Record<string, unknown>
        )) {
            if (
                !schema.multipart.fileFields.includes(k) &&
                typeof v === 'string'
            ) {
                fields[k] = v;
            }
        }
        response = await client.upload(schema.endpoint, files, fields);
    } else {
        response = await client.call(schema.endpoint, payload);
    }

    return await applyResponseGuard(schema, response, engine, caller);
}
