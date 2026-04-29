/**
 * Pointer-path mini-DSL — parse, traverse, and filter JSON-like structures.
 *
 * Syntax: dot-separated path segments with optional array expansion.
 *   - `blocks[*]`    → expand array at key "blocks"
 *   - `[*]`          → expand root array
 *   - `blocks[*].id` → expand array, then read key "id" from each item
 */

export type PointerPath = string;

export class PointerPathShapeError extends Error {
    constructor(path: PointerPath, message: string) {
        super(`PointerPath "${path}" ${message}`);
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
                `has invalid segment "${part}"`
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
                    `expected object before segment "${op.name}"`
                );
                continue;
            }
            if (!(op.name in item)) {
                rejectByPolicy(
                    path,
                    policy.onMissingKey,
                    `missing key "${op.name}"`
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
                    `expected array at segment "${op.name}[*]"`
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
                `expected object before terminal segment "${last.name}[*]"`
            );
            continue;
        }
        const arr = (parent as Record<string, unknown>)[last.name];
        if (arr === undefined) {
            rejectByPolicy(
                path,
                policy.onMissingKey,
                `missing key "${last.name}"`
            );
            continue;
        }
        if (!Array.isArray(arr)) {
            rejectByPolicy(
                path,
                policy.onNonArray,
                `expected array at terminal segment "${last.name}[*]"`
            );
            continue;
        }
        (parent as Record<string, unknown>)[last.name] = filter(arr);
    }
    return root;
}
