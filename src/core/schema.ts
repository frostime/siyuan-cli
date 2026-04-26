/**
 * Schema type definitions for endpoints (kernel API) and tools (business wrappers).
 *
 * Endpoint design:
 * - `classification` is the authored truth for endpoint schemas.
 * - runtime consumers read `RegisteredEndpoint.meta`.
 */

export type InputSource = 'literal' | 'file' | 'stdin' | 'env';

// ————— Permission rule model —————
export type PermissionEffect = 'allow' | 'deny' | 'approval';

/**
 * Legacy config input accepted at config/permission boundaries only.
 * Internal engine state normalizes `confirm` to `approval`.
 */
export type LegacyPermissionEffect = 'confirm';
export type PermissionEffectInput = PermissionEffect | LegacyPermissionEffect;

export interface PermissionRule {
    endpoint?: string;    // glob on endpoint id
    tool?: string;        // glob on tool id
    action?: 'read' | 'write';
    notebook?: string;    // exact match notebook id
    path?: string;        // glob on SiYuan id-based path
    // workspacePath reserved for Phase 2
    effect: PermissionEffectInput;
    note?: string;        // human annotation, ignored by engine
}

export interface NormalizedPermissionRule extends Omit<PermissionRule, 'effect'> {
    effect: PermissionEffect;
}

export interface PermissionConfig {
    default?: PermissionEffectInput;    // fallback when no rule matches; defaults to 'allow'
    rules?: PermissionRule[];
}

export function normalizePermissionEffect(effect: PermissionEffectInput): PermissionEffect {
    return effect === 'confirm' ? 'approval' : effect;
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
export type PointerPath = string;

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
 * The real engine (src/core/permission.ts) implements this + more.
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
    /** Optional compact renderer for `siyuan api <id> --print compact`. */
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
    callEndpointRaw: <T = unknown>(id: string, payload: unknown) => Promise<T>;
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

export class PointerPathShapeError extends Error {
    constructor(path: PointerPath, message: string) {
        super(`PointerPath \"${path}\" ${message}`);
    }
}

export type PathOp =
    | { kind: 'key'; name: string }
    | { kind: 'expandArray' }
    | { kind: 'expandKey'; name: string };

export interface ShapePolicy {
    onMissingKey: 'skip' | 'throw';
    onNonArray: 'skip' | 'throw';
    onNonObject: 'skip' | 'throw';
}

export const STRICT_POINTER_POLICY: ShapePolicy = {
    onMissingKey: 'skip',
    onNonArray: 'throw',
    onNonObject: 'skip'
};

function rejectByPolicy(
    path: PointerPath,
    mode: 'skip' | 'throw',
    message: string
): void {
    if (mode === 'throw') throw new PointerPathShapeError(path, message);
}

export function compilePointerPath(path: PointerPath): PathOp[] {
    if (!path) throw new PointerPathShapeError(path, 'must not be empty');
    return path.split('.').map((part, index) => {
        if (part === '[*]') {
            if (index !== 0)
                throw new PointerPathShapeError(
                    path,
                    'may use root "[*]" only as the first segment'
                );
            return { kind: 'expandArray' };
        }
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(\[\*\])?$/.exec(part);
        if (!m)
            throw new PointerPathShapeError(
                path,
                `has invalid segment \"${part}\"`
            );
        return m[2]
            ? { kind: 'expandKey', name: m[1]! }
            : { kind: 'key', name: m[1]! };
    });
}

export function pointerPathRoot(path: PointerPath): string | undefined {
    const [first] = compilePointerPath(path);
    return first?.kind === 'key' || first?.kind === 'expandKey'
        ? first.name
        : undefined;
}

export function runPointerGet(
    root: unknown,
    ops: PathOp[],
    path: PointerPath,
    policy: ShapePolicy = STRICT_POINTER_POLICY
): unknown[] {
    let current: unknown[] = [root];
    for (const op of ops) {
        const next: unknown[] = [];
        for (const item of current) {
            if (op.kind === 'expandArray') {
                if (!Array.isArray(item)) {
                    rejectByPolicy(
                        path,
                        policy.onNonArray,
                        'expected array at root "[*]" segment'
                    );
                    continue;
                }
                next.push(...item);
                continue;
            }

            if (!item || typeof item !== 'object') {
                rejectByPolicy(
                    path,
                    policy.onNonObject,
                    `expected object before segment \"${op.name}\"`
                );
                continue;
            }
            if (!(op.name in item)) {
                rejectByPolicy(
                    path,
                    policy.onMissingKey,
                    `missing key \"${op.name}\"`
                );
                continue;
            }
            const value = (item as Record<string, unknown>)[op.name];
            if (op.kind === 'key') {
                next.push(value);
                continue;
            }
            if (!Array.isArray(value)) {
                rejectByPolicy(
                    path,
                    policy.onNonArray,
                    `expected array at segment \"${op.name}[*]\"`
                );
                continue;
            }
            next.push(...value);
        }
        current = next;
    }
    return current;
}

export function evaluatePointerPath(
    root: unknown,
    path: PointerPath,
    policy: ShapePolicy = STRICT_POINTER_POLICY
): unknown[] {
    return runPointerGet(root, compilePointerPath(path), path, policy);
}

export function isTerminalFilterCompatiblePointerPath(
    path: PointerPath
): boolean {
    const ops = compilePointerPath(path);
    const last = ops[ops.length - 1]!;
    if (last.kind === 'expandArray') {
        return ops.length === 1;
    }
    if (last.kind !== 'expandKey') {
        return false;
    }
    const prefixOps = ops.slice(0, -1);
    return !prefixOps.some(
        (op) => op.kind === 'expandArray' || op.kind === 'expandKey'
    );
}

export function runPointerFilterTerminal(
    root: unknown,
    path: PointerPath,
    filter: (items: unknown[]) => unknown[],
    policy: ShapePolicy = STRICT_POINTER_POLICY
): unknown {
    const ops = compilePointerPath(path);
    const last = ops[ops.length - 1]!;

    if (last.kind === 'expandArray') {
        if (ops.length !== 1)
            throw new PointerPathShapeError(
                path,
                'root "[*]" must be the only terminal array segment'
            );
        if (!Array.isArray(root)) {
            rejectByPolicy(
                path,
                policy.onNonArray,
                'expected array at root "[*]" segment'
            );
            return root;
        }
        return filter(root);
    }

    if (last.kind !== 'expandKey') {
        throw new PointerPathShapeError(
            path,
            'terminal filter requires an array expansion segment'
        );
    }

    const prefixOps = ops.slice(0, -1);
    if (
        prefixOps.some(
            (op) => op.kind === 'expandArray' || op.kind === 'expandKey'
        )
    ) {
        throw new PointerPathShapeError(
            path,
            'terminal filter supports only one array expansion'
        );
    }

    const parents = runPointerGet(root, prefixOps, path, policy);
    for (const parent of parents) {
        if (!parent || typeof parent !== 'object') {
            rejectByPolicy(
                path,
                policy.onNonObject,
                `expected object before terminal segment \"${last.name}[*]\"`
            );
            continue;
        }
        const arr = (parent as Record<string, unknown>)[last.name];
        if (arr === undefined) {
            rejectByPolicy(
                path,
                policy.onMissingKey,
                `missing key \"${last.name}\"`
            );
            continue;
        }
        if (!Array.isArray(arr)) {
            rejectByPolicy(
                path,
                policy.onNonArray,
                `expected array at terminal segment \"${last.name}[*]\"`
            );
            continue;
        }
        (parent as Record<string, unknown>)[last.name] = filter(arr);
    }
    return root;
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
