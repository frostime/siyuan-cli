/**
 * Schema type definitions for endpoints (kernel API) and tools (business wrappers).
 *
 * Endpoint design:
 * - `classification` is the authored truth for endpoint schemas.
 * - runtime consumers read `RegisteredEndpoint.meta`.
 */

import type { PointerPath } from './pointer-path.js';

export type InputSource = 'literal' | 'file' | 'stdin' | 'env';

// ————— Permission rule model —————
export type PermissionEffect = 'allow' | 'deny' | 'approval';

/**
 * Alias table for effect values accepted at config boundaries.
 * Maps accepted synonyms to their canonical PermissionEffect.
 * Extend here to support additional aliases without touching callers.
 */
const EFFECT_ALIASES: Record<string, PermissionEffect> = {
    confirm: 'approval',
};

/**
 * Resolve a raw effect string from config/YAML to its canonical PermissionEffect.
 * Unknown values are passed through as-is (TypeScript callers are already typed).
 */
export function resolvePermissionEffect(raw: PermissionEffect | string): PermissionEffect {
    return EFFECT_ALIASES[raw] ?? (raw as PermissionEffect);
}

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
    default?: PermissionEffect;    // fallback when no rule matches; defaults to 'allow'
    rules?: PermissionRule[];
}

// ————— Behavior config model —————

export interface BehaviorConfig {
    allowYes?: boolean;              // default: true — when false, --yes is ignored
    approval?: {
        timeout?: number;            // seconds, default: 60
        autoOpen?: boolean;          // default: true — auto-open Approval Center in browser
    };
}

/** Fully resolved behavior with all fields populated. Used after merge. */
export interface ResolvedBehaviorConfig {
    allowYes: boolean;
    approval: {
        timeout: number;
        autoOpen: boolean;
    };
}

// ————— Behavior validation —————

const BEHAVIOR_KEYS = new Set(['allowYes', 'approval']);
const APPROVAL_KEYS = new Set(['timeout', 'autoOpen']);

export interface BehaviorValidationError {
    kind: 'error';
    message: string;
}
export interface BehaviorValidationWarning {
    kind: 'warning';
    key: string;
}
type BehaviorValidationResult = BehaviorValidationError | BehaviorValidationWarning;

/**
 * Validate a raw behavior value from parsed YAML.
 * Returns an array of errors and warnings. Errors are fatal; warnings are informational.
 */
export function validateBehaviorRaw(
    behavior: unknown,
    scope: string
): BehaviorValidationResult[] {
    if (behavior === undefined || behavior === null) return [];
    if (typeof behavior !== 'object' || Array.isArray(behavior)) {
        return [{ kind: 'error', message: `${scope}.behavior must be an object.` }];
    }
    const results: BehaviorValidationResult[] = [];
    const b = behavior as Record<string, unknown>;
    for (const key of Object.keys(b)) {
        if (!BEHAVIOR_KEYS.has(key)) {
            results.push({ kind: 'warning', key: `behavior.${key}` });
        }
    }
    if (b['allowYes'] !== undefined && typeof b['allowYes'] !== 'boolean') {
        results.push({ kind: 'error', message: `${scope}.behavior.allowYes must be a boolean.` });
    }
    const approval = b['approval'];
    if (approval !== undefined) {
        if (typeof approval !== 'object' || approval === null || Array.isArray(approval)) {
            results.push({ kind: 'error', message: `${scope}.behavior.approval must be an object.` });
        } else {
            const a = approval as Record<string, unknown>;
            for (const key of Object.keys(a)) {
                if (!APPROVAL_KEYS.has(key)) {
                    results.push({ kind: 'warning', key: `behavior.approval.${key}` });
                }
            }
            if (
                a['timeout'] !== undefined &&
                (typeof a['timeout'] !== 'number' || a['timeout'] < 1 || !Number.isInteger(a['timeout']))
            ) {
                results.push({ kind: 'error', message: `${scope}.behavior.approval.timeout must be a positive integer.` });
            }
            if (a['autoOpen'] !== undefined && typeof a['autoOpen'] !== 'boolean') {
                results.push({ kind: 'error', message: `${scope}.behavior.approval.autoOpen must be a boolean.` });
            }
        }
    }
    return results;
}

/** Context assembled at evaluation time. All fields optional — unset = wildcard. */
export interface PermissionContext {
    endpoint?: string;
    tool?: string;
    action?: 'read' | 'write';
    notebook?: string;
    path?: string;
}

export type ToolTag = 'read' | 'write' | 'aggregate' | 'util';
export type GuardFieldKind = 'id' | 'path' | 'notebook';

export type FormatStrategy = 'direct' | 'records' | 'transaction' | 'object' | 'json';

export type EndpointMode = 'read' | 'write' | 'invoke';
export type EndpointSurface =
    | 'meta'
    | 'content'
    | 'asset'
    | 'workspace'
    | 'runtime'
    | 'network';
export type EndpointScope = 'single' | 'batch' | 'global';
export type EndpointOperation =
    | 'inspect'
    | 'search'
    | 'query'
    | 'create'
    | 'update'
    | 'delete'
    | 'move'
    | 'upload'
    | 'control';
export type RiskLabel =
    | 'safe'
    | 'sensitive'
    | 'elevated'
    | 'destructive'
    | 'critical';
export type ResourceKind = 'id' | 'notebook' | 'path' | 'workspace-path';

// ————— JSONSchema subset (we rely on ajv for validation) —————
export type JSONSchemaProperty = {
    type?:
        | 'string'
        | 'integer'
        | 'number'
        | 'boolean'
        | 'array'
        | 'object'
        | 'null';
    description?: string;
    enum?: readonly unknown[];
    default?: unknown;
    pattern?: string;
    items?: JSONSchemaProperty;
    properties?: Record<string, JSONSchemaProperty>;
    required?: readonly string[];
    additionalProperties?: boolean;
    format?: string;
};

export type JSONSchema = JSONSchemaProperty & {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
};

// ————— CLI behavior —————
export interface CliBehavior {
    /** If the payload has exactly one required string field, allow positional. */
    primary?: string;
    examples?: Array<{ command: string; description?: string }>;
    /** Short-flag aliases, e.g. { stmt: "s" }. */
    aliases?: Record<string, string>;
    /** Fields to exclude from individual CLI flags; pass them via --json instead. */
    skipFields?: string[];
    /** Allowed input sources per field. Missing entries default to ["literal"]. */
    allowSource?: Record<string, InputSource[]>;
}

// ————— Permission guard —————
export interface PayloadTargetSpec {
    path: PointerPath;
    kind: ResourceKind;
    access: 'read' | 'write';
}

export interface FilterSpec {
    /** Payload resource filter contract. */
    payloadTargets?: PayloadTargetSpec[];
    /** @deprecated Legacy payload guard — no endpoint uses this; kept for type compat only. Will be removed. */
    payload?: Record<string, GuardFieldKind>;

    /**
     * Declarative response extractor.
     * `itemsAt` is evaluated against the unwrapped `data` value returned by SiyuanClient,
     * not the raw kernel envelope `{ code, msg, data }`.
     * Examples: `blocks[*]`, `notebooks[*]`, `[*]`.
     */
    response?: {
        /** Minimal pointer syntax: `blocks[*]`, `notebooks[*]`, `[*]`. */
        itemsAt: PointerPath;
        /** Which field within each item is the id / path / notebook. */
        fieldMap: Partial<Record<GuardFieldKind, string>>;
    };

    /** Imperative fallback — called if declarative response extractor can't express the logic. */
    filterResponse?: (
        response: unknown,
        engine: PermissionEngineLike
    ) => unknown | Promise<unknown>;
}

export interface EndpointClassification {
    mode: EndpointMode;
    surface: EndpointSurface;
    scope: EndpointScope;
    operation?: EndpointOperation;
    riskOverride?: RiskLabel;
}

export interface DerivedMeta {
    classification: EndpointClassification;
    tags: string[];
    risk: RiskLabel;
}

export function isHighRisk(risk: RiskLabel): boolean {
    return risk === 'destructive' || risk === 'critical';
}

/**
 * Minimal shape of the permission engine that schema guards need.
 * The real engine (src/shared/permission.ts) implements this + more.
 */
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
    ): Promise<{ kept: T[]; removed: number; reasons: Record<string, number> }>;
    evaluate(ctx: PermissionContext): PermissionEffect;
}

// ————— EndpointSchema —————
export interface EndpointSchema<TResponseData = unknown> {
    /** The only authoritative identity — e.g. "/api/query/sql". */
    endpoint: string;
    summary: string;
    description?: string;
    payload: JSONSchema;

    /** Authored endpoint classification. */
    classification: EndpointClassification;

    minKernelVersion?: string;
    deprecated?: { replacement?: string; removeAt?: string; reason?: string };
    /** For endpoints that use multipart/form-data instead of JSON body. */
    multipart?: { fileFields: string[] };
    cli?: CliBehavior;
    guard?: FilterSpec;
    /** Pre-built compact format strategy. Ignored when `format` is present. */
    formatStrategy?: FormatStrategy;
    /** Optional compact renderer for `siyuan api <id> --print compact`. Takes precedence over formatStrategy. */
    format?: (ctx: EndpointFormatContext<TResponseData>) => string;
}

/** Derived, normalized view of EndpointSchema (produced by the registry). */
export interface RegisteredEndpoint {
    schema: EndpointSchema;
    id: string;
    group: string;
    name: string;
    meta: DerivedMeta;
}

export interface EndpointFormatContext<T = unknown> {
    endpoint: RegisteredEndpoint;
    payload: unknown;
    responseData: T;
    args: GlobalArgs;
}

// ————— ToolSchema —————
export interface ToolResult {
    content: string;
    details?: unknown;
    warnings?: string[];
    meta?: { elapsedMs?: number; filteredCount?: number; truncated?: boolean };
}

export interface ToolContext {
    client: unknown;
    registry: unknown;
    permission: PermissionEngineLike;
    callEndpoint: <T = unknown>(id: string, payload: unknown) => Promise<T>;
    callEndpointRaw: <T = unknown>(endpoint: string, payload: unknown) => Promise<T>;
    logger: unknown;
    args: GlobalArgs;
}

export interface GlobalArgs {
    workspace?: string;
    baseUrl?: string;
    token?: string;
    format?: 'json' | 'pretty' | 'yaml';
    print?: 'compact' | 'json';
    debug?: boolean;
    dryRun?: boolean;
    config?: string;
    yes?: boolean;
}

export interface ToolSchema {
    id: string; // kebab-case
    summary: string;
    description?: string;
    tags?: ToolTag[];
    input: JSONSchema;
    output?: JSONSchemaProperty;
    cli?: CliBehavior;
    run: (ctx: ToolContext, input: unknown) => Promise<ToolResult>;
}

// ————— Helpers —————
export function deriveEndpointId(endpoint: string): {
    id: string;
    group: string;
    name: string;
} {
    const m = /^\/api\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)$/.exec(endpoint);
    if (!m) {
        throw new Error(
            `Invalid endpoint "${endpoint}": expected shape /api/<group>/<name>`
        );
    }
    const group = m[1]!;
    const name = m[2]!;
    return { id: `${group}.${name}`, group, name };
}

// Re-export pointer-path symbols for backward compatibility
export type { PointerPath, PathOp, ShapePolicy } from './pointer-path.js';
export {
    PointerPathShapeError,
    STRICT_POINTER_POLICY,
    compilePointerPath,
    pointerPathRoot,
    runPointerGet,
    evaluatePointerPath,
    isTerminalFilterCompatiblePointerPath,
    runPointerFilterTerminal
} from './pointer-path.js';
