/**
 * Permission Engine — unified rule-list model.
 *
 * Rules are evaluated top-to-bottom; first full match wins.
 * Each rule has optional conditions (endpoint, tool, action, notebook, path)
 * and a mandatory effect (allow | deny | approval).
 * Omitted conditions act as wildcards.
 *
 * Two-phase evaluation:
 *   Phase 1 (checkEndpoint/checkTool): only caller info available, no resource.
 *     - Pure caller rules (no resource conditions) produce immediate verdicts.
 *     - If resource-qualified rules exist for this caller, defer to Phase 2.
 *   Phase 2 (checkContentRef / filterItems): full context available.
 *     - First full-match rule wins.
 *     - No match → default effect.
 *
 * Risk-auto approval is a post-processing step in guard.ts:
 *   if evaluate() returns 'allow' but the endpoint is high risk,
 *   the execution guard sends it through the approval flow.
 */
import micromatch from 'micromatch';
import type { AppConfig, ResolvedWorkspace } from '../workspace/config.js';
import {
    resolvePermissionEffect,
    type CallerContext,
    type PermissionConfig,
    type PermissionContext,
    type PermissionEffect,
    type PermissionEngineLike,
    type PermissionRule,
    type RegisteredEndpoint,
    type ResourceKind
} from './schema.js';
import { CliError, ExitCode } from './errors.js';
import type { SiyuanClient } from './client.js';

// ─── Rule cascade ────────────────────────────────────────────────────────────

/**
 * Assemble the final rule list and default effect by concatenating layers.
 * Order: project (highest priority) > workspace > defaults (lowest).
 * Fallback default is `allow` when no layer specifies `permission.default`.
 */
export function cascadePermission(
    config: AppConfig,
    workspaceName: string,
    projectPermission?: PermissionConfig
): { defaultEffect: PermissionEffect; rules: PermissionRule[] } {
    const ws = config.workspaces[workspaceName];
    const rules: PermissionRule[] = [
        ...(projectPermission?.rules ?? []),
        ...(ws?.permission?.rules ?? []),
        ...(config.defaults?.permission?.rules ?? [])
    ].map((rule) => ({
        ...rule,
        effect: resolvePermissionEffect(rule.effect)
    }));
    const defaultEffect = resolvePermissionEffect(
        projectPermission?.default ??
            ws?.permission?.default ??
            config.defaults?.permission?.default ??
            'allow'
    );
    return { defaultEffect, rules };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class EndpointDeniedError extends CliError {
    constructor(label: string, reason: string) {
        super(
            ExitCode.PERMISSION,
            'ENDPOINT_DENIED',
            `${label} denied: ${reason}`
        );
    }
}

export class ContentDeniedError extends CliError {
    constructor(reason: string) {
        super(ExitCode.PERMISSION, 'CONTENT_DENIED', reason);
    }
}

export class BlockNotFoundError extends CliError {
    constructor(ids: string[]) {
        super(
            ExitCode.GENERAL,
            'BLOCK_NOT_FOUND',
            `Block id not found: ${ids.join(', ')}`
        );
    }
}

export class ApprovalUnavailableError extends CliError {
    constructor(endpoint: string) {
        super(
            ExitCode.GENERAL,
            'APPROVAL_UNAVAILABLE',
            `Endpoint "${endpoint}" requires approval, but no approval broker can be used without a resolved workspace.`,
            'Pass --workspace, set $SIYUAN_CLI_WORKSPACE, add .siyuan-cli.yaml, or re-run with --yes when behavior.allowYes is true.'
        );
    }
}

// ─── Matching ────────────────────────────────────────────────────────────────

function matchGlob(pattern: string, value: string): boolean {
    return micromatch.isMatch(value, pattern);
}

function hasResourceCondition(rule: PermissionRule): boolean {
    return rule.notebook !== undefined || rule.path !== undefined;
}

function matchesCaller(rule: PermissionRule, ctx: PermissionContext): boolean {
    if (rule.endpoint !== undefined) {
        if (!ctx.endpoint || !matchGlob(rule.endpoint, ctx.endpoint))
            return false;
    }
    if (rule.tool !== undefined) {
        if (!ctx.tool || !matchGlob(rule.tool, ctx.tool)) return false;
    }
    if (rule.action !== undefined) {
        if (ctx.action !== undefined && rule.action !== ctx.action)
            return false;
    }
    return true;
}

function matchesResource(
    rule: PermissionRule,
    ctx: PermissionContext
): boolean {
    if (rule.notebook !== undefined) {
        if (ctx.notebook === undefined || rule.notebook !== ctx.notebook)
            return false;
    }
    if (rule.path !== undefined) {
        if (ctx.path === undefined || !matchGlob(rule.path, ctx.path))
            return false;
    }
    return true;
}

function matchesFull(rule: PermissionRule, ctx: PermissionContext): boolean {
    return matchesCaller(rule, ctx) && matchesResource(rule, ctx);
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface FilterResult<T> {
    kept: T[];
    removed: number;
    reasons: Record<string, number>;
}

export class PermissionEngine implements PermissionEngineLike {
    private readonly rules: PermissionRule[];
    private readonly defaultEffect: PermissionEffect;
    private readonly client: SiyuanClient;
    private readonly idCache = new Map<
        string,
        { notebook: string; path: string }
    >();

    constructor(
        rules: PermissionRule[],
        defaultEffect: PermissionEffect,
        client: SiyuanClient
    ) {
        this.rules = rules;
        this.defaultEffect = defaultEffect;
        this.client = client;
    }

    // ── Core evaluation ────────────────────────────────────────────────────

    evaluate(ctx: PermissionContext): PermissionEffect {
        for (const rule of this.rules) {
            if (matchesFull(rule, ctx)) {
                return rule.effect;
            }
        }
        return this.defaultEffect;
    }

    /**
     * Like evaluate(), but also reports which rule matched and at what index.
     * Used by `permission check` command and debug output.
     */
    evaluateVerbose(
        ctx: PermissionContext
    ): {
        effect: PermissionEffect;
        ruleIndex: number | null;
        source: string;
    } {
        for (let i = 0; i < this.rules.length; i++) {
            if (matchesFull(this.rules[i]!, ctx)) {
                return {
                    effect: this.rules[i]!.effect,
                    ruleIndex: i,
                    source: 'rule'
                };
            }
        }
        return {
            effect: this.defaultEffect,
            ruleIndex: null,
            source: 'default'
        };
    }

    // ── Phase 1: caller-level gate ─────────────────────────────────────────

    /**
     * Phase 1 check for endpoints.
     *
     * Three outcomes:
     *  - A pure-caller deny rule matches → throw immediately
     *  - Resource-qualified rules exist for this caller → defer (return void)
     *  - No rules match → apply default
     */
    checkEndpoint(id: string): void {
        this._checkCaller({ endpoint: id }, `endpoint "${id}"`);
    }

    checkTool(id: string): void {
        this._checkCaller({ tool: id }, `tool "${id}"`);
    }

    private _checkCaller(ctx: PermissionContext, label: string): void {
        // Gather all rules whose caller conditions match
        const candidates = this.rules.filter((r) => matchesCaller(r, ctx));

        if (candidates.length === 0) {
            // No rules mention this caller at all → fall through to default
            if (this.defaultEffect === 'deny') {
                throw new EndpointDeniedError(
                    label,
                    'no matching rule; default deny'
                );
            }
            return;
        }

        // Separate pure-caller rules from resource-qualified ones
        const pureCaller = candidates.filter(
            (r) => !hasResourceCondition(r)
        );

        if (pureCaller.length > 0) {
            // Find the first pure-caller rule in the original order
            const firstPureIndex = this.rules.findIndex(
                (r) => matchesCaller(r, ctx) && !hasResourceCondition(r)
            );
            const firstPure = this.rules[firstPureIndex]!;
            if (firstPure.effect === 'deny') {
                throw new EndpointDeniedError(
                    label,
                    `denied by rule #${firstPureIndex}`
                );
            }
            // allow or approval → pass through to Phase 2 / approval handling
            return;
        }

        // Only resource-qualified rules matched caller → defer to Phase 2.
        // Do NOT apply default here — Phase 2 will make the final call once
        // it has resource information.
    }

    // ── Phase 2: content ref check ─────────────────────────────────────────

    async checkContentRef(
        ref: {
            kind: ResourceKind;
            value: string;
            access: 'read' | 'write';
        },
        caller?: CallerContext
    ): Promise<PermissionEffect> {
        const ctx: PermissionContext = {
            ...caller,
            action: ref.access
        };

        if (ref.kind === 'notebook') {
            ctx.notebook = ref.value;
        } else if (ref.kind === 'path') {
            ctx.path = ref.value;
        } else if (ref.kind === 'workspace-path') {
            // For now, workspace-path checks only the caller+action.
            // workspacePath condition is reserved for Phase 2.
        } else {
            // kind === 'id': resolve to {notebook, path} first
            const resolved = await this.resolveContentId(ref.value);
            ctx.notebook = resolved.notebook;
            ctx.path = resolved.path;
        }

        const { effect, ruleIndex } = this.evaluateVerbose(ctx);
        if (effect === 'deny') {
            const reason =
                ruleIndex !== null
                    ? `denied by rule #${ruleIndex}`
                    : 'denied by default policy';
            throw new ContentDeniedError(
                `${ref.kind} "${ref.value}" (access: ${ref.access}) ${reason}`
            );
        }
        // Return the effect so callers can act on 'approval' hits.
        // Response filtering ignores 'approval' (kernel already executed);
        // only the pre-execution payload guard surfaces it to the approval gate.
        return effect;
    }

    // ── ID resolution ──────────────────────────────────────────────────────

    async resolveContentIds(
        ids: string[]
    ): Promise<Map<string, { notebook: string; path: string }>> {
        const wanted = [...new Set(ids.filter(Boolean))];
        const out = new Map<string, { notebook: string; path: string }>();
        const missing: string[] = [];

        for (const id of wanted) {
            const cached = this.idCache.get(id);
            if (cached) out.set(id, cached);
            else missing.push(id);
        }

        if (missing.length > 0) {
            const quoted = missing
                .map((id) => `'${id.replace(/'/g, "''")}'`)
                .join(', ');
            const rows = await this.client.call<
                Array<{ id: string; box: string; path: string }>
            >('/api/query/sql', {
                stmt: `SELECT id, box, path FROM blocks WHERE id IN (${quoted})`
            });
            for (const row of rows) {
                const value = { notebook: row.box, path: row.path };
                this.idCache.set(row.id, value);
                out.set(row.id, value);
            }
            const trulyMissing = wanted.filter((id) => !out.has(id));
            if (trulyMissing.length > 0) {
                throw new BlockNotFoundError(trulyMissing);
            }
        }

        return out;
    }

    async resolveContentId(
        id: string
    ): Promise<{ notebook: string; path: string }> {
        const map = await this.resolveContentIds([id]);
        return map.get(id)!;
    }

    // ── Response filtering ─────────────────────────────────────────────────

    /**
     * Filter a list of items against the permission rules.
     *
     * Items may carry pre-resolved {notebook, path}, a raw {id}, or both.
     * When only `id` is present (and notebook/path are absent), the engine
     * resolves the block's containing document in bulk via SQL so that
     * notebook- and path-based rules can be applied.
     */
    async filterItems<T>(
        items: T[],
        extract: (item: T) => {
            id?: string;
            path?: string;
            notebook?: string;
        },
        caller?: CallerContext,
        access: 'read' | 'write' = 'read'
    ): Promise<FilterResult<T>> {
        // ── Step 1: collect items that need id→{notebook,path} resolution ──
        const extracted = items.map(extract);
        const unresolvedIds = [
            ...new Set(
                extracted
                    .filter((f) => f.id && !f.notebook && !f.path)
                    .map((f) => f.id!)
            )
        ];

        let resolved = new Map<string, { notebook: string; path: string }>();
        if (unresolvedIds.length > 0) {
            resolved = await this.resolveContentIds(unresolvedIds);
        }

        // ── Step 2: evaluate each item ──────────────────────────────────────
        const kept: T[] = [];
        let removed = 0;
        const reasons: Record<string, number> = {};

        for (let i = 0; i < items.length; i++) {
            const fields = extracted[i]!;

            // Prefer pre-resolved notebook/path; fall back to id resolution.
            let notebook = fields.notebook;
            let path = fields.path;
            if (!notebook && !path && fields.id) {
                const r = resolved.get(fields.id);
                notebook = r?.notebook;
                path = r?.path;
            }

            const ctx: PermissionContext = {
                ...caller,
                action: access,
                notebook,
                path
            };
            const { effect, ruleIndex } = this.evaluateVerbose(ctx);
            if (effect === 'deny') {
                removed++;
                const reason =
                    ruleIndex !== null
                        ? `rule #${ruleIndex}`
                        : 'default deny';
                reasons[reason] = (reasons[reason] ?? 0) + 1;
            } else {
                kept.push(items[i]!);
            }
        }
        return { kept, removed, reasons };
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPermissionEngine(
    config: AppConfig,
    resolved: ResolvedWorkspace,
    client: SiyuanClient
): PermissionEngine {
    const { rules, defaultEffect } = cascadePermission(
        config,
        resolved.name,
        resolved.effectivePermission
    );
    return new PermissionEngine(rules, defaultEffect, client);
}
