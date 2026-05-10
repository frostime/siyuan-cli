/**
 * Runtime guard execution — permission checks, data filtering, approval handoff,
 * endpoint call, and response filtering.
 */
import {
    deriveEndpointId,
    evaluatePointerPath,
    isHighRisk,
    runPointerFilterTerminal,
    type CallerContext,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from '../shared/schema.js';
import { buildPreparedApprovalRequest, requestAndWait } from '../approval/index.js';
import {
    ApprovalUnavailableError,
    ContentDeniedError,
    type PermissionEngine
} from '../shared/permission.js';
import type { SiyuanClient } from '../shared/client.js';
import { resolveEffectiveBehavior, type AppConfig, type ResolvedWorkspace } from '../workspace/config.js';
import type { JsonPrintExtra } from '../shared/output.js';

const RISK_TRIGGERS_IMPLICIT_WARNING = new Set<string>([
    'elevated',
    'destructive',
    'critical'
]);

function emitWarning(jsonExtra: JsonPrintExtra | undefined, warning: Record<string, unknown>): void {
    if (jsonExtra) {
        jsonExtra.warnings.push(warning);
        return;
    }
    process.stderr.write(JSON.stringify(warning) + '\n');
}

function emitNotice(jsonExtra: JsonPrintExtra | undefined, notice: Record<string, unknown>): void {
    if (jsonExtra) {
        jsonExtra.notices.push(notice);
        return;
    }
    process.stderr.write(JSON.stringify(notice) + '\n');
}

function emitDebug(jsonExtra: JsonPrintExtra | undefined, debug: Record<string, unknown>): void {
    if (jsonExtra) {
        jsonExtra.debug.push(debug);
        return;
    }
    process.stderr.write(JSON.stringify({ debug }) + '\n');
}

function maybeWarnImplicitWorkspace(
    entry: RegisteredEndpoint,
    workspace: ResolvedWorkspace | undefined,
    jsonExtra?: JsonPrintExtra
): void {
    if (!workspace) return;
    if (workspace.source !== 'global-current') return;
    if (!RISK_TRIGGERS_IMPLICIT_WARNING.has(entry.meta.risk)) return;
    emitWarning(jsonExtra, {
        warning: 'IMPLICIT_WORKSPACE',
        endpoint: entry.id,
        workspace: workspace.name,
        risk: entry.meta.risk,
        hint: 'Resolved from global config.current. Pass --workspace, set $SIYUAN_CLI_WORKSPACE, or add .siyuan-cli.yaml to anchor the target.'
    });
}

export async function applyPayloadGuard(
    schema: EndpointSchema,
    payload: unknown,
    engine: PermissionEngineLike,
    access: 'read' | 'write',
    caller?: CallerContext
): Promise<{ needsApproval: boolean }> {
    const targets = schema.guard?.payloadTargets;
    let needsApproval = false;
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
                if (value === '') continue;
                const effect = await engine.checkContentRef(
                    { kind: target.kind, value, access: target.access },
                    caller
                );
                if (effect === 'approval') needsApproval = true;
            }
        }
    }
    return { needsApproval };
}

/**
 * Response guards operate on the unwrapped `data` returned by SiyuanClient.
 * They do not see the raw kernel envelope `{ code, msg, data }`.
 */
export async function applyResponseGuard(
    schema: EndpointSchema,
    response: unknown,
    engine: PermissionEngineLike,
    caller?: CallerContext,
    jsonExtra?: JsonPrintExtra
): Promise<unknown> {
    const guard = schema.guard;
    if (!guard) return response;
    if (guard.filterResponse) {
        return await guard.filterResponse(response, engine, { caller });
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
            emitWarning(jsonExtra, {
                warning: 'CONTENT_FILTERED',
                removed,
                reasons: summary
            });
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
    /** Config for behavior resolution. */
    config: AppConfig;
    /** Optional — when supplied, enables IMPLICIT_WORKSPACE warning on write-like risks. */
    workspace?: ResolvedWorkspace;
    /** When called from inside a tool, carries the tool id for permission context. */
    callerTool?: string;
    jsonExtra?: JsonPrintExtra;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}

function debugPreview(schema: EndpointSchema, payload: unknown, jsonExtra?: JsonPrintExtra): void {
    const body = JSON.stringify(payload);
    const curl = `curl -X POST <baseUrl>${schema.endpoint} -H "Content-Type: application/json" --data ${JSON.stringify(body)}`;
    emitDebug(jsonExtra, {
        endpoint: schema.endpoint,
        payload,
        curl
    });
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
        config,
        workspace,
        callerTool,
        jsonExtra,
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

    maybeWarnImplicitWorkspace(entry, workspace, jsonExtra);

    // Phase 1: caller-level gate
    engine.checkEndpoint(id);

    // Phase 2: resource-level gate (payload targets)
    const { needsApproval: phase2NeedsApproval } = await applyPayloadGuard(schema, payload, engine, action, caller);

    if (debug) debugPreview(schema, payload, jsonExtra);

    // Approval gate: three sources can trigger approval:
    //   1. Pure-caller rule returns 'approval' (engine.evaluate with caller-only context)
    //   2. Resource-level rule returns 'approval' in Phase 2 (phase2NeedsApproval)
    //   3. Risk-auto: rule returns 'allow' but endpoint is destructive/critical
    // High risk only upgrades `allow`; explicit `deny` and `approval` are honored.
    const ruleEffect = engine.evaluate({ ...caller, action });
    const wouldRequestApproval =
        ruleEffect === 'approval' ||
        phase2NeedsApproval ||
        (ruleEffect === 'allow' && isHighRisk(entry.meta.risk));

    if (dryRun && isWriteLike(entry)) {
        return {
            dryRun: true,
            endpoint: schema.endpoint,
            payload,
            wouldRequestApproval
        };
    }

    // Resolve effective behavior: Project > Workspace > Defaults > Built-in
    const behavior = resolveEffectiveBehavior(
        config.defaults?.behavior,
        workspace?.behavior,
        workspace?.effectiveBehavior
    );
    const allowYes = behavior.allowYes;
    const effectiveYes = yes && allowYes;

    if (wouldRequestApproval && !effectiveYes) {
        // Notify when --yes was passed but ignored
        if (yes && !allowYes) {
            const source =
                workspace?.effectiveBehavior?.allowYes !== undefined
                    ? 'project'
                    : workspace?.behavior?.allowYes !== undefined
                      ? 'workspace'
                      : config?.defaults?.behavior?.allowYes !== undefined
                        ? 'defaults'
                        : 'built-in';
            emitNotice(jsonExtra, {
                notice: 'YES_BYPASSED',
                reason: 'behavior.allowYes is false, --yes ignored',
                source
            });
        }
        if (!workspace) {
            throw new ApprovalUnavailableError(id);
        }
        const timeoutSec = behavior.approval.timeout;
        const autoOpen = behavior.approval.autoOpen;
        await requestAndWait(
            buildPreparedApprovalRequest({
                workspaceName: workspace.name,
                entry,
                payload,
                ...(callerTool ? { callerTool } : {}),
                timeoutSec
            }),
            { autoOpen, jsonExtra }
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

    return await applyResponseGuard(schema, response, engine, caller, jsonExtra);
}
