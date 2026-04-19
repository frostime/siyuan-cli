# SiYuan CLI Permission Model Refactor

## 概述

将权限模型从"5 个独立配置块 + allow/deny 列表"重构为"统一有序规则列表"。

核心变更：
- `PermissionConfig` 从 `{endpoints, tools, content, workspace, confirm}` 简化为 `{default, rules}`
- 规则顺序即优先级，首条全匹配命中生效
- 支持条件组合（endpoint + notebook + action 在同一条规则内）
- cascade 从 replace 语义简化为列表拼接
- tool → endpoint 的调用链透传 caller context
- dry-run 完整模拟权限流程并报告 `wouldConfirm`

## 涉及文件

| 文件 | 改动类型 |
|---|---|
| `src/core/schema.ts` | 新增类型 + 修改接口 |
| `src/core/config.ts` | 删除旧类型，引入新类型，简化 smoke test |
| `src/core/permission.ts` | **完全重写** |
| `src/core/guard.ts` | 透传 caller，risk-auto confirm，dry-run 调整 |
| `src/core/tools.ts` | 透传 tool id |
| `src/utils/project-config.ts` | 适配新 rules 结构 |
| `src/commands/workspace.ts` | `which` 命令适配 + diagnostics |
| `src/utils/errors.ts` | CliError 增加 details 字段 |
| `src/utils/diagnostics.ts` | **新建**：连接诊断 |

---

## Patch 1: `src/core/schema.ts` — 新增权限类型

````patch
# src/core/schema.ts
<<<<<<< SEARCH
export type InputSource = 'literal' | 'file' | 'stdin' | 'env';
=======
export type InputSource = 'literal' | 'file' | 'stdin' | 'env';

// ————— Permission rule model —————
export type PermissionEffect = 'allow' | 'deny' | 'confirm';

export interface PermissionRule {
    endpoint?: string;    // glob on endpoint id
    tool?: string;        // glob on tool id
    action?: 'read' | 'write';
    notebook?: string;    // exact match notebook id
    path?: string;        // glob on SiYuan id-based path
    // workspacePath reserved for Phase 2
    effect: PermissionEffect;
    note?: string;        // human annotation, ignored by engine
}

export interface PermissionConfig {
    default?: PermissionEffect;    // fallback when no rule matches; defaults to 'deny'
    rules?: PermissionRule[];
}

/** Context assembled at evaluation time. All fields optional — unset = wildcard. */
export interface PermissionContext {
    endpoint?: string;
    tool?: string;
    action?: 'read' | 'write';
    notebook?: string;
    path?: string;
}
>>>>>>> REPLACE
````

## Patch 2: `src/core/schema.ts` — 修改 PermissionEngineLike 接口

````patch
# src/core/schema.ts
<<<<<<< SEARCH
export interface PermissionEngineLike {
    checkEndpoint(id: string): void;
    checkTool(id: string): void;
    checkContentRef(ref: {
        kind: ResourceKind;
        value: string;
        access: 'read' | 'write';
    }): Promise<void>;
    resolveContentIds(
        ids: string[]
    ): Promise<Map<string, { notebook: string; path: string }>>;
    resolveContentId(id: string): Promise<{ notebook: string; path: string }>;
    filterItems<T>(
        items: T[],
        extract: (item: T) => { id?: string; path?: string; notebook?: string },
        access?: 'read' | 'write'
    ): { kept: T[]; removed: number; reasons: Record<string, number> };
}
=======
export interface CallerContext {
    endpoint?: string;
    tool?: string;
}

export interface PermissionEngineLike {
    checkEndpoint(id: string): void;
    checkTool(id: string): void;
    checkContentRef(
        ref: { kind: ResourceKind; value: string; access: 'read' | 'write' },
        caller?: CallerContext
    ): Promise<void>;
    resolveContentIds(
        ids: string[]
    ): Promise<Map<string, { notebook: string; path: string }>>;
    resolveContentId(id: string): Promise<{ notebook: string; path: string }>;
    filterItems<T>(
        items: T[],
        extract: (item: T) => { id?: string; path?: string; notebook?: string },
        caller?: CallerContext,
        access?: 'read' | 'write'
    ): { kept: T[]; removed: number; reasons: Record<string, number> };
    evaluate(ctx: PermissionContext): PermissionEffect;
}
>>>>>>> REPLACE
````

---

## Patch 3: `src/core/config.ts` — 删除旧类型，引入新类型

````patch
# src/core/config.ts
<<<<<<< SEARCH
import type { EndpointMode, EndpointScope, EndpointSurface } from './schema.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotebookID = string;
export type BlockID = string;
export type BlockPath = string; // SiYuan path (ID-based path of containing document)
export type WorkspacePath = string;

export interface ContentScopeRule {
    notebooks?: { deny?: NotebookID[]; allow?: NotebookID[] };
    paths?: { deny?: BlockPath[]; allow?: BlockPath[] };
}

export interface WorkspaceScopeRule {
    paths?: { deny?: WorkspacePath[]; allow?: WorkspacePath[] };
}

export interface ConfirmPolicy {
    modes?: EndpointMode[];
    surfaces?: EndpointSurface[];
    scopes?: EndpointScope[];
}

export interface PermissionConfig {
    endpoints?: { deny?: string[]; allow?: string[] };
    tools?: { deny?: string[]; allow?: string[] };
    content?: {
        read?: ContentScopeRule;
        write?: ContentScopeRule;
    };
    workspace?: {
        read?: WorkspaceScopeRule;
        write?: WorkspaceScopeRule;
    };
    confirm?: ConfirmPolicy;
}
=======
import type { PermissionConfig } from './schema.js';
export type { PermissionConfig };

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotebookID = string;
export type BlockID = string;
export type BlockPath = string; // SiYuan path (ID-based path of containing document)
export type WorkspacePath = string;
>>>>>>> REPLACE
````

## Patch 4: `src/core/config.ts` — 简化 smoke test

````patch
# src/core/config.ts
<<<<<<< SEARCH
/** Soft warning helper — never throws, just writes to stderr. */
function warnPermissionSmoke(
    scope: string,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.content) return;
    for (const access of ['read', 'write'] as const) {
        const rule = permission.content[access];
        if (!rule) continue;
        for (const bucket of ['allow', 'deny'] as const) {
            for (const nb of rule.notebooks?.[bucket] ?? []) {
                if (!ID_PATTERN.test(nb)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID',
                            scope,
                            at: `content.${access}.notebooks.${bucket}`,
                            value: nb,
                            hint: 'Notebook rules take a notebook id, not an hpath.'
                        }) + '\n'
                    );
                }
            }
            for (const pathRule of rule.paths?.[bucket] ?? []) {
                // If the rule does not contain any segment matching the id pattern,
                // it almost certainly points at an hpath and will never match.
                if (!ID_SEGMENT_RE.test(pathRule)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                            scope,
                            at: `content.${access}.paths.${bucket}`,
                            value: pathRule,
                            hint: 'Path rules take an id-based SiYuan path, not an hpath.'
                        }) + '\n'
                    );
                }
            }
        }
    }
}

function runConfigSmokeTest(config: AppConfig): void {
    warnPermissionSmoke('defaults', config.defaults?.permission);
    for (const [name, ws] of Object.entries(config.workspaces)) {
        warnPermissionSmoke(`workspaces.${name}`, ws.permission);
    }
}
=======
/** Soft warning helper — never throws, just writes to stderr. */
function warnRulesSmoke(
    scope: string,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.rules) return;
    for (const [i, rule] of permission.rules.entries()) {
        if (rule.notebook && !ID_PATTERN.test(rule.notebook)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID',
                    scope,
                    at: `rules[${i}].notebook`,
                    value: rule.notebook,
                    hint: 'Notebook rules take a notebook id, not an hpath.'
                }) + '\n'
            );
        }
        if (rule.path && !ID_SEGMENT_RE.test(rule.path)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                    scope,
                    at: `rules[${i}].path`,
                    value: rule.path,
                    hint: 'Path rules take an id-based SiYuan path, not an hpath.'
                }) + '\n'
                );
        }
    }
}

function runConfigSmokeTest(config: AppConfig): void {
    warnRulesSmoke('defaults', config.defaults?.permission);
    for (const [name, ws] of Object.entries(config.workspaces)) {
        warnRulesSmoke(`workspaces.${name}`, ws.permission);
    }
}
>>>>>>> REPLACE
````

---

## Patch 5: `src/core/permission.ts` — 完全重写

````patch
# src/core/permission.ts
<<<<<<< OVERWRITE
=======
/**
 * Permission Engine — unified rule-list model.
 *
 * Rules are evaluated top-to-bottom; first full match wins.
 * Each rule has optional conditions (endpoint, tool, action, notebook, path)
 * and a mandatory effect (allow | deny | confirm).
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
 * Risk-auto confirm is a post-processing step in guard.ts:
 *   if evaluate() returns 'allow' but the endpoint's derived risk demands
 *   confirmation, the result is upgraded to 'confirm'.
 */
import micromatch from 'micromatch';
import type { AppConfig, ResolvedWorkspace } from './config.js';
import type {
    CallerContext,
    PermissionConfig,
    PermissionContext,
    PermissionEffect,
    PermissionEngineLike,
    PermissionRule,
    RegisteredEndpoint,
    ResourceKind
} from './schema.js';
import { CliError, ExitCode } from '../utils/errors.js';
import type { SiyuanClient } from './client.js';

// ─── Rule cascade ────────────────────────────────────────────────────────────

/**
 * Assemble the final rule list and default effect by concatenating layers.
 * Order: project (highest priority) > workspace > defaults (lowest).
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
    ];
    const defaultEffect: PermissionEffect =
        projectPermission?.default ??
        ws?.permission?.default ??
        config.defaults?.permission?.default ??
        'deny';
    return { defaultEffect, rules };
}

export function resolveEffectivePermission(
    config: AppConfig,
    resolved: ResolvedWorkspace
): { defaultEffect: PermissionEffect; rules: PermissionRule[] } {
    return cascadePermission(
        config,
        resolved.name,
        resolved.effectivePermission
    );
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class PermissionDeniedError extends CliError {
    constructor(reason: string, ruleIndex?: number) {
        const source =
            ruleIndex !== undefined ? ` (rule #${ruleIndex})` : ' (default)';
        super(
            ExitCode.PERMISSION,
            'PERMISSION_DENIED',
            `${reason}${source}`
        );
    }
}

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

export class ConfirmationRequiredError extends CliError {
    constructor(endpoint: string) {
        super(
            ExitCode.GENERAL,
            'CONFIRMATION_REQUIRED',
            `Endpoint "${endpoint}" requires confirmation.`,
            'Re-run with --yes to confirm, or --dry-run to preview.'
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
        const resourceQualified = candidates.filter((r) =>
            hasResourceCondition(r)
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
            // allow or confirm → pass through to Phase 2 / confirm handling
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
    ): Promise<void> {
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
        // allow or confirm → pass (confirm handled in executeEndpoint)
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

    filterItems<T>(
        items: T[],
        extract: (item: T) => {
            id?: string;
            path?: string;
            notebook?: string;
        },
        caller?: CallerContext,
        access: 'read' | 'write' = 'read'
    ): FilterResult<T> {
        const kept: T[] = [];
        let removed = 0;
        const reasons: Record<string, number> = {};

        for (const item of items) {
            const fields = extract(item);
            const ctx: PermissionContext = {
                ...caller,
                action: access,
                notebook: fields.notebook,
                path: fields.path
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
                kept.push(item);
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
>>>>>>> REPLACE
````

---

## Patch 6: `src/core/guard.ts` — import 修改

````patch
# src/core/guard.ts
<<<<<<< SEARCH
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import {
    ConfirmationRequiredError,
    ContentAccessDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';
import type { ResolvedWorkspace } from './config.js';
=======
import {
    deriveEndpointId,
    evaluatePointerPath,
    runPointerFilterTerminal,
    type CallerContext,
    type EndpointSchema,
    type PermissionEngineLike,
    type RegisteredEndpoint
} from './schema.js';
import {
    ConfirmationRequiredError,
    ContentDeniedError,
    type PermissionEngine
} from './permission.js';
import type { SiyuanClient } from './client.js';
import type { ResolvedWorkspace } from './config.js';
>>>>>>> REPLACE
````

## Patch 7: `src/core/guard.ts` — applyPayloadGuard 透传 caller

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export async function applyPayloadGuard(
    schema: EndpointSchema,
    payload: unknown,
    engine: PermissionEngineLike,
    access: 'read' | 'write',
    surface?: 'meta' | 'content' | 'asset' | 'workspace' | 'runtime' | 'network'
): Promise<void> {
    const p = payload as Record<string, unknown>;
    const targets = schema.guard?.payloadTargets;
    if (targets?.length) {
        for (const target of targets) {
            let values: unknown[];
            try {
                values = evaluatePointerPath(payload, target.path);
            } catch (error) {
                throw new ContentAccessDeniedError((error as Error).message);
            }
            for (const value of values) {
                if (typeof value !== 'string') {
                    throw new ContentAccessDeniedError(
                        `payload path "${target.path}" must resolve to string values`
                    );
                }
                await engine.checkContentRef({
                    kind: target.kind,
                    value,
                    access: target.access
                });
            }
        }
        return;
    }
}
=======
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
>>>>>>> REPLACE
````

## Patch 8: `src/core/guard.ts` — applyResponseGuard 透传 caller

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export function applyResponseGuard(
    schema: EndpointSchema,
    response: unknown,
    engine: PermissionEngineLike
): unknown {
    const guard = schema.guard;
    if (!guard) return response;
    if (guard.filterResponse) {
        return guard.filterResponse(response, engine);
    }
    if (guard.response) {
        const { itemsAt, fieldMap } = guard.response;
        const items = evaluatePointerPath(response, itemsAt);
        const { kept, removed, reasons } = engine.filterItems(items, (item) => {
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
        });
=======
export function applyResponseGuard(
    schema: EndpointSchema,
    response: unknown,
    engine: PermissionEngineLike,
    caller?: CallerContext
): unknown {
    const guard = schema.guard;
    if (!guard) return response;
    if (guard.filterResponse) {
        return guard.filterResponse(response, engine);
    }
    if (guard.response) {
        const { itemsAt, fieldMap } = guard.response;
        const items = evaluatePointerPath(response, itemsAt);
        const { kept, removed, reasons } = engine.filterItems(
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
>>>>>>> REPLACE
````

## Patch 9: `src/core/guard.ts` — ExecuteOptions 增加 callerTool

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export interface ExecuteOptions {
    entry: RegisteredEndpoint;
    payload: unknown;
    client: SiyuanClient;
    engine: PermissionEngine;
    /** Optional — when supplied, enables IMPLICIT_WORKSPACE warning on write-like risks. */
    workspace?: ResolvedWorkspace;
    dryRun?: boolean;
    yes?: boolean;
    debug?: boolean;
}
=======
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
>>>>>>> REPLACE
````

## Patch 10: `src/core/guard.ts` — 重写 executeEndpoint

````patch
# src/core/guard.ts
<<<<<<< SEARCH
export async function executeEndpoint(opts: ExecuteOptions): Promise<unknown> {
    const {
        entry,
        payload,
        client,
        engine,
        workspace,
        dryRun,
        yes,
        debug
    } = opts;
    const { schema } = entry;
    const { id } = deriveEndpointId(schema.endpoint);

    maybeWarnImplicitWorkspace(entry, workspace);
    engine.checkEndpoint(id);
    await applyPayloadGuard(
        schema,
        payload,
        engine,
        entry.meta.classification.mode === 'read' ? 'read' : 'write',
        entry.meta.classification.surface
    );

    if (debug) debugPreview(schema, payload);
    if (dryRun && isWriteLike(entry)) {
        return { dryRun: true, endpoint: schema.endpoint, payload };
    }

    if (engine.requiresConfirmation(entry) && !yes) {
        throw new ConfirmationRequiredError(id);
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

    return applyResponseGuard(schema, response, engine);
}
=======
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
        throw new ConfirmationRequiredError(id);
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

    return applyResponseGuard(schema, response, engine, caller);
}
>>>>>>> REPLACE
````

---

## Patch 11: `src/core/tools.ts` — 透传 tool id

````patch
# src/core/tools.ts
<<<<<<< SEARCH
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
            dryRun: args.dryRun,
            yes: args.yes,
            debug: args.debug
        }) as Promise<T>;
    };
=======
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
>>>>>>> REPLACE
````

---

## Patch 12: `src/utils/project-config.ts` — 适配新 import

````patch
# src/utils/project-config.ts
<<<<<<< SEARCH
import { CliError, ExitCode } from './errors.js';
import type { AppConfig, PermissionConfig } from '../core/config.js';
=======
import { CliError, ExitCode } from './errors.js';
import type { AppConfig } from '../core/config.js';
import type { PermissionConfig } from '../core/schema.js';
>>>>>>> REPLACE
````

## Patch 13: `src/utils/project-config.ts` — 适配新 smoke test

````patch
# src/utils/project-config.ts
<<<<<<< SEARCH
function warnProjectPermissionSmoke(
    location: ProjectConfigLocation,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.content) return;
    const scope = `project(${location.path})`;
    for (const access of ['read', 'write'] as const) {
        const rule = permission.content[access];
        if (!rule) continue;
        for (const bucket of ['allow', 'deny'] as const) {
            for (const nb of rule.notebooks?.[bucket] ?? []) {
                if (!ID_PATTERN.test(nb)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID',
                            scope,
                            at: `permission.content.${access}.notebooks.${bucket}`,
                            value: nb
                        }) + '\n'
                    );
                }
            }
            for (const p of rule.paths?.[bucket] ?? []) {
                if (!ID_SEGMENT_RE.test(p)) {
                    process.stderr.write(
                        JSON.stringify({
                            warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                            scope,
                            at: `permission.content.${access}.paths.${bucket}`,
                            value: p
                        }) + '\n'
                    );
                }
            }
        }
    }
}
=======
function warnProjectPermissionSmoke(
    location: ProjectConfigLocation,
    permission: PermissionConfig | undefined
): void {
    if (!permission?.rules) return;
    const scope = `project(${location.path})`;
    for (const [i, rule] of permission.rules.entries()) {
        if (rule.notebook && !ID_PATTERN.test(rule.notebook)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID',
                    scope,
                    at: `rules[${i}].notebook`,
                    value: rule.notebook
                }) + '\n'
            );
        }
        if (rule.path && !ID_SEGMENT_RE.test(rule.path)) {
            process.stderr.write(
                JSON.stringify({
                    warning: 'LIKELY_HPATH_NOT_ID_IN_PATH',
                    scope,
                    at: `rules[${i}].path`,
                    value: rule.path
                }) + '\n'
            );
        }
    }
}
>>>>>>> REPLACE
````

---

## Patch 14: `src/commands/workspace.ts` — import 修改

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
import { resolveEffectivePermission } from '../core/permission.js';
import { SiyuanClient } from '../core/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';
=======
import { resolveEffectivePermission } from '../core/permission.js';
import { SiyuanClient } from '../core/client.js';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';
import { diagnoseConnection } from '../utils/diagnostics.js';
>>>>>>> REPLACE
````

## Patch 15: `src/commands/workspace.ts` — which 命令适配

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();
            const resolved = resolveEffectiveWorkspace(
                config,
                {},
                args.cwd ?? process.cwd()
            );
            const effectivePerm = resolveEffectivePermission(config, resolved);
            const permissionSummary = {
                hasEndpointsRule: !!effectivePerm.endpoints,
                hasToolsRule: !!effectivePerm.tools,
                hasContentRead: !!effectivePerm.content?.read,
                hasContentWrite: !!effectivePerm.content?.write,
                hasWorkspaceRead: !!effectivePerm.workspace?.read,
                hasWorkspaceWrite: !!effectivePerm.workspace?.write,
                hasConfirmPolicy: !!effectivePerm.confirm
            };
            out({
                workspace: resolved.name,
                source: resolved.source,
                baseUrl: resolved.baseUrl,
                hasToken: !!resolved.token,
                projectConfigPath: resolved.projectConfigPath ?? null,
                permissionOverriddenByProject: !!resolved.effectivePermission,
                permission: permissionSummary
            });
        })
=======
    run: ({ args }) =>
        tryRun(async () => {
            const config = loadConfig();
            const resolved = resolveEffectiveWorkspace(
                config,
                {},
                args.cwd ?? process.cwd()
            );
            const effectivePerm = resolveEffectivePermission(config, resolved);
            out({
                workspace: resolved.name,
                source: resolved.source,
                baseUrl: resolved.baseUrl,
                hasToken: !!resolved.token,
                projectConfigPath: resolved.projectConfigPath ?? null,
                permissionOverriddenByProject: !!resolved.effectivePermission,
                permission: {
                    default: effectivePerm.defaultEffect,
                    ruleCount: effectivePerm.rules.length,
                    rules: effectivePerm.rules.map((r, i) => ({
                        index: i,
                        ...r
                    }))
                }
            });
        })
>>>>>>> REPLACE
````

## Patch 16: `src/commands/workspace.ts` — add 命令接入诊断

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
            // Verify connectivity unless skipped
            if (!args['skip-verify']) {
                const verifyConfig = {
                    ...config,
                    workspaces: { ...config.workspaces, [args.name]: entry },
                    current: args.name
                };
                const resolved = resolveWorkspace(verifyConfig, {
                    workspace: args.name
                });
                const client = new SiyuanClient(resolved);
                const ping = await client.ping();
                if (!ping.ok) {
                    throw new CliError(
                        ExitCode.NETWORK,
                        'VERIFY_FAILED',
                        `Cannot connect to ${args.url}: ${ping.message}`,
                        'Use --skip-verify to add without checking, or fix the URL/token.'
                    );
                }
            }
=======
            // Verify connectivity unless skipped
            if (!args['skip-verify']) {
                const verifyConfig = {
                    ...config,
                    workspaces: { ...config.workspaces, [args.name]: entry },
                    current: args.name
                };
                const resolved = resolveWorkspace(verifyConfig, {
                    workspace: args.name
                });
                const client = new SiyuanClient(resolved);
                const ping = await client.ping();
                if (!ping.ok) {
                    const diagnosis = await diagnoseConnection(args.url);
                    const hint =
                        diagnosis.hints.length > 0
                            ? diagnosis.hints.join(' | ')
                            : 'Use --skip-verify to add without checking, or fix the URL/token.';
                    throw new CliError(
                        ExitCode.NETWORK,
                        'VERIFY_FAILED',
                        `Cannot connect to ${args.url}: ${ping.message}`,
                        hint,
                        { diagnosis }
                    );
                }
            }
>>>>>>> REPLACE
````

## Patch 17: `src/commands/workspace.ts` — verify 命令接入诊断

````patch
# src/commands/workspace.ts
<<<<<<< SEARCH
            if (args.all) {
                const results: unknown[] = [];
                for (const [name, ws] of Object.entries(config.workspaces)) {
                    const t0 = Date.now();
                    const client = new SiyuanClient(ws);
                    const ping = await client.ping();
                    results.push({
                        workspace: name,
                        baseUrl: ws.baseUrl,
                        ok: ping.ok,
                        version: ping.version,
                        message: ping.message,
                        elapsedMs: Date.now() - t0
                    });
                }
                out(results);
                return;
            }

            const resolved = resolveWorkspace(config, { workspace: args.name });
            const t0 = Date.now();
            const client = new SiyuanClient(resolved);
            const ping = await client.ping();
            const result = {
                ok: ping.ok,
                workspace: resolved.name,
                baseUrl: resolved.baseUrl,
                version: ping.version,
                message: ping.message,
                elapsedMs: Date.now() - t0
            };

            if (!ping.ok) {
                process.stderr.write(
                    JSON.stringify({ error: 'VERIFY_FAILED', ...result }) + '\n'
                );
                process.exit(ExitCode.NETWORK);
            }

            out(result);
=======
            if (args.all) {
                const results: unknown[] = [];
                for (const [name, ws] of Object.entries(config.workspaces)) {
                    const t0 = Date.now();
                    const client = new SiyuanClient(ws);
                    const ping = await client.ping();
                    const diagnosis = ping.ok
                        ? undefined
                        : await diagnoseConnection(ws.baseUrl);
                    results.push({
                        workspace: name,
                        baseUrl: ws.baseUrl,
                        ok: ping.ok,
                        version: ping.version,
                        message: ping.message,
                        elapsedMs: Date.now() - t0,
                        ...(diagnosis ? { diagnosis } : {})
                    });
                }
                out(results);
                return;
            }

            const resolved = resolveWorkspace(config, { workspace: args.name });
            const t0 = Date.now();
            const client = new SiyuanClient(resolved);
            const ping = await client.ping();
            const diagnosis = ping.ok
                ? undefined
                : await diagnoseConnection(resolved.baseUrl);
            const result = {
                ok: ping.ok,
                workspace: resolved.name,
                baseUrl: resolved.baseUrl,
                version: ping.version,
                message: ping.message,
                elapsedMs: Date.now() - t0,
                ...(diagnosis ? { diagnosis } : {})
            };

            if (!ping.ok) {
                process.stderr.write(
                    JSON.stringify({ error: 'VERIFY_FAILED', ...result }) + '\n'
                );
                process.exit(ExitCode.NETWORK);
            }

            out(result);
>>>>>>> REPLACE
````

---

## Patch 18: `src/utils/errors.ts` — CliError 增加 details 字段

````patch
# src/utils/errors.ts
<<<<<<< SEARCH
export interface CliErrorJson {
    error: string;
    message: string;
    hint?: string;
}

export class CliError extends Error {
    constructor(
        public readonly code: ExitCodeValue,
        public readonly errorType: string,
        message: string,
        public readonly hint?: string
    ) {
        super(message);
        this.name = 'CliError';
    }

    toJson(): CliErrorJson {
        return {
            error: this.errorType,
            message: this.message,
            ...(this.hint ? { hint: this.hint } : {})
        };
    }
}
=======
export interface CliErrorJson {
    error: string;
    message: string;
    hint?: string;
    details?: unknown;
}

export class CliError extends Error {
    constructor(
        public readonly code: ExitCodeValue,
        public readonly errorType: string,
        message: string,
        public readonly hint?: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'CliError';
    }

    toJson(): CliErrorJson {
        return {
            error: this.errorType,
            message: this.message,
            ...(this.hint ? { hint: this.hint } : {}),
            ...(this.details !== undefined ? { details: this.details } : {})
        };
    }
}
>>>>>>> REPLACE
````

---

## Patch 19: `src/utils/diagnostics.ts` — 新建连接诊断模块

````patch
# src/utils/diagnostics.ts
<<<<<<< CREATE
=======
/**
 * Connection diagnostics for workspace verify/add failures.
 *
 * Splits "why can't I reach this SiYuan kernel" into:
 *  1. URL parsing
 *  2. TCP probe          — is anything listening?
 *  3. Port owner lookup  — localhost: who owns the port?
 *  4. HTTP probe         — is the service actually SiYuan?
 *
 * Every step is best-effort and failure-safe: missing tools (lsof/ss),
 * insufficient privileges, or unsupported platforms degrade to
 * "undefined field" rather than throwing.
 */
import { createConnection } from 'node:net';
import { execSync } from 'node:child_process';

export interface TcpProbe {
    reachable: boolean;
    host: string;
    port: number;
    errorCode?: string;
    errorMsg?: string;
    elapsedMs: number;
}

export interface HttpProbe {
    ok: boolean;
    status?: number;
    contentType?: string;
    isSiyuan: boolean;
    kernelVersion?: string;
    bodyPreview?: string;
    errorCode?: string;
    errorMsg?: string;
    elapsedMs: number;
}

export interface PortOwner {
    pid: number;
    name?: string;
}

export interface ConnectionDiagnosis {
    host?: string;
    port?: number;
    isLocalhost: boolean;
    tcp?: TcpProbe;
    http?: HttpProbe;
    portOwner?: PortOwner;
    hints: string[];
}

const LOOPBACK_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0'
]);

function isLocalhost(host: string): boolean {
    return LOOPBACK_HOSTS.has(host);
}

function parseUrl(
    baseUrl: string
): { host: string; port: number } | undefined {
    try {
        const u = new URL(baseUrl);
        const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
        if (!u.hostname || Number.isNaN(port)) return undefined;
        return { host: u.hostname, port };
    } catch {
        return undefined;
    }
}

function probeTcp(
    host: string,
    port: number,
    timeoutMs = 3000
): Promise<TcpProbe> {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const socket = createConnection({ host, port });
        let settled = false;
        const finish = (r: TcpProbe) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(r);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () =>
            finish({
                reachable: true,
                host,
                port,
                elapsedMs: Date.now() - t0
            })
        );
        socket.once('timeout', () =>
            finish({
                reachable: false,
                host,
                port,
                errorCode: 'ETIMEDOUT',
                errorMsg: `TCP connect timeout after ${timeoutMs}ms`,
                elapsedMs: Date.now() - t0
            })
        );
        socket.once('error', (e: NodeJS.ErrnoException) =>
            finish({
                reachable: false,
                host,
                port,
                errorCode: e.code ?? 'UNKNOWN',
                errorMsg: e.message,
                elapsedMs: Date.now() - t0
            })
        );
    });
}

async function probeHttp(
    baseUrl: string,
    timeoutMs = 5000
): Promise<HttpProbe> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    try {
        const url = `${baseUrl.replace(/\/$/, '')}/api/system/version`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: controller.signal
        });
        const contentType = res.headers.get('content-type') ?? '';
        const text = await res.text();
        let isSiyuan = false;
        let kernelVersion: string | undefined;
        if (contentType.includes('application/json')) {
            try {
                const body = JSON.parse(text) as {
                    code?: number;
                    data?: { ver?: string } | null;
                    msg?: string;
                };
                if (
                    typeof body?.code === 'number' &&
                    ('data' in body || 'msg' in body)
                ) {
                    isSiyuan = true;
                    kernelVersion =
                        typeof body.data === 'object' &&
                        body.data !== null &&
                        typeof body.data.ver === 'string'
                            ? body.data.ver
                            : undefined;
                }
            } catch {
                /* not JSON after all */
            }
        }
        return {
            ok: res.status === 200 && isSiyuan,
            status: res.status,
            contentType,
            isSiyuan,
            kernelVersion,
            bodyPreview: text.slice(0, 200),
            elapsedMs: Date.now() - t0
        };
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        return {
            ok: false,
            isSiyuan: false,
            errorCode:
                err.name === 'AbortError'
                    ? 'ETIMEDOUT'
                    : (err.code ?? 'HTTP_ERROR'),
            errorMsg: err.message,
            elapsedMs: Date.now() - t0
        };
    } finally {
        clearTimeout(timer);
    }
}

// ─── Port owner lookup ────────────────────────────────────────────────────────

function runCommand(cmd: string): string | undefined {
    try {
        return execSync(cmd, {
            encoding: 'utf-8',
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'ignore']
        });
    } catch {
        return undefined;
    }
}

function tryGetProcessNameWindows(pid: number): string | undefined {
    const out = runCommand(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`)?.trim();
    if (!out || out.startsWith('INFO:')) return undefined;
    const m = /^"([^"]+)"/.exec(out);
    return m?.[1];
}

function probePortOwnerWindows(port: number): PortOwner | undefined {
    const out = runCommand(`netstat -ano -p TCP`);
    if (!out) return undefined;
    const re = new RegExp(
        `^\\s*TCP\\s+\\S*:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`,
        'm'
    );
    const m = re.exec(out);
    if (!m) return undefined;
    const pid = Number(m[1]);
    const name = tryGetProcessNameWindows(pid);
    return name ? { pid, name } : { pid };
}

function probePortOwnerUnix(port: number): PortOwner | undefined {
    const lsofOut = runCommand(
        `lsof -iTCP:${port} -sTCP:LISTEN -nP -Fpcn 2>/dev/null`
    )?.trim();
    if (lsofOut) {
        let pid: number | undefined;
        let name: string | undefined;
        for (const line of lsofOut.split('\n')) {
            if (line.startsWith('p')) pid = Number(line.slice(1));
            else if (line.startsWith('c') && name === undefined) {
                name = line.slice(1);
            }
        }
        if (pid !== undefined && !Number.isNaN(pid)) {
            return name ? { pid, name } : { pid };
        }
    }

    const ssOut = runCommand(
        `ss -tlnpH 'sport = :${port}' 2>/dev/null`
    )?.trim();
    if (ssOut) {
        const m = /users:\(\("([^"]+)",pid=(\d+),/.exec(ssOut);
        if (m) return { pid: Number(m[2]), name: m[1] };
    }

    return undefined;
}

function probePortOwner(port: number): PortOwner | undefined {
    return process.platform === 'win32'
        ? probePortOwnerWindows(port)
        : probePortOwnerUnix(port);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function diagnoseConnection(
    baseUrl: string
): Promise<ConnectionDiagnosis> {
    const parsed = parseUrl(baseUrl);
    if (!parsed) {
        return {
            isLocalhost: false,
            hints: [
                `Invalid baseUrl: ${baseUrl}. Expected shape: http://host:port`
            ]
        };
    }

    const { host, port } = parsed;
    const local = isLocalhost(host);
    const tcp = await probeTcp(host, port);
    const hints: string[] = [];

    if (!tcp.reachable) {
        const owner = local ? probePortOwner(port) : undefined;

        if (owner) {
            hints.push(
                `Port ${port} on ${host} is bound by pid=${owner.pid}${
                    owner.name ? ` (${owner.name})` : ''
                }, but the TCP handshake did not complete.`,
                'Check a local firewall/AV, or wait a moment if the service is still starting.'
            );
        } else if (tcp.errorCode === 'ECONNREFUSED') {
            if (local) {
                hints.push(
                    `No service is listening on ${host}:${port}.`,
                    'Start SiYuan, or run `siyuan workspace show` to confirm the configured port.'
                );
            } else {
                hints.push(
                    `Remote host ${host} refused TCP connection on port ${port}.`,
                    'Confirm the kernel is running and the port is exposed externally.'
                );
            }
        } else if (tcp.errorCode === 'ETIMEDOUT') {
            hints.push(
                `No response from ${host}:${port} within the TCP probe window.`,
                local
                    ? 'SiYuan is likely not running.'
                    : 'Check network reachability, firewall rules, or whether the remote host is up.'
            );
        } else if (
            tcp.errorCode === 'ENOTFOUND' ||
            tcp.errorCode === 'EAI_AGAIN'
        ) {
            hints.push(
                `DNS resolution failed for ${host} (${tcp.errorCode}).`,
                'Check the hostname spelling and your DNS configuration.'
            );
        } else {
            hints.push(
                `TCP connect to ${host}:${port} failed (${
                    tcp.errorCode ?? 'unknown'
                })${tcp.errorMsg ? `: ${tcp.errorMsg}` : ''}`
            );
        }

        return {
            host,
            port,
            isLocalhost: local,
            tcp,
            ...(owner ? { portOwner: owner } : {}),
            hints
        };
    }

    // TCP is up. Classify the service behind it via HTTP.
    const http = await probeHttp(baseUrl);

    if (http.ok) {
        hints.push(
            `SiYuan kernel responded at ${baseUrl}${
                http.kernelVersion ? ` (version ${http.kernelVersion})` : ''
            }. The original failure may be transient; if it recurs, re-check the token.`
        );
    } else if (http.isSiyuan) {
        if (http.status === 401) {
            hints.push(
                `SiYuan kernel at ${baseUrl} requires authentication (HTTP 401).`,
                'Check the token in `siyuan workspace show --reveal-token`, or refresh the tokenSource.'
            );
        } else {
            hints.push(
                `${baseUrl} looks like a SiYuan kernel but /api/system/version returned HTTP ${http.status}.`,
                'The kernel may still be starting up, or the API surface differs in this version.'
            );
        }
    } else if (http.status !== undefined) {
        const preview = http.bodyPreview?.replace(/\s+/g, ' ').slice(0, 120);
        const owner = local ? probePortOwner(port) : undefined;
        hints.push(
            `Port ${port} on ${host} is occupied by a non-SiYuan HTTP service (status ${http.status}, content-type ${http.contentType || 'unknown'}).`,
            ...(preview ? [`Response preview: ${preview}`] : []),
            ...(owner
                ? [
                      `Occupied by pid=${owner.pid}${
                          owner.name ? ` (${owner.name})` : ''
                      }. Stop it, or reconfigure SiYuan to use another port.`
                  ]
                : local
                  ? [
                        'Run this command with elevated privileges to identify the occupying process.'
                    ]
                  : ['Point the workspace at the correct host and port.'])
        );
        return {
            host,
            port,
            isLocalhost: local,
            tcp,
            http,
            ...(owner ? { portOwner: owner } : {}),
            hints
        };
    } else {
        hints.push(
            `TCP connect to ${host}:${port} succeeded, but the HTTP exchange failed (${http.errorCode ?? 'unknown'})${http.errorMsg ? `: ${http.errorMsg}` : ''}.`,
            'Verify the URL scheme (http vs https) — a plain-HTTP kernel cannot be reached with an https:// baseUrl, and vice versa.'
        );
    }

    return {
        host,
        port,
        isLocalhost: local,
        tcp,
        http,
        hints
    };
}
>>>>>>> REPLACE
````

---

## 配置迁移示例

### 旧配置

```yaml
permission:
  endpoints:
    allow: ["query.*", "block.get*", "filetree.list*"]
    deny:  ["system.exit"]
  tools:
    allow: ["resolve-path", "list-doc-tree"]
    deny:  ["append-content"]
  content:
    read:
      notebooks:
        allow: ["20260101215354-j0c5gvk"]
      paths:
        allow: ["/journal/**"]
        deny:  ["/journal/private/**"]
    write:
      notebooks:
        deny: ["20260101215354-j0c5gvk"]
  confirm:
    modes: [write, invoke]
```

### 等价新配置

```yaml
permission:
  default: deny

  rules:
    # 硬拒绝
    - endpoint: "system.exit"
      effect: deny

    # 读操作白名单
    - endpoint: "query.*"
      action: read
      effect: allow
    - endpoint: "block.get*"
      action: read
      effect: allow
    - endpoint: "filetree.list*"
      action: read
      effect: allow

    # 工具白名单
    - tool: "resolve-path"
      effect: allow
    - tool: "list-doc-tree"
      effect: allow

    # 笔记本级: 特定 notebook 可读, 但 private 路径除外
    - notebook: "20260101215354-j0c5gvk"
      path: "/journal/private/**"
      action: read
      effect: deny
    - notebook: "20260101215354-j0c5gvk"
      path: "/journal/**"
      action: read
      effect: allow

    # 笔记本级: 禁写
    - notebook: "20260101215354-j0c5gvk"
      action: write
      effect: deny

    # 全局写确认
    - action: write
      effect: confirm
```
