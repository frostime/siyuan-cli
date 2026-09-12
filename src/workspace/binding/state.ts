import { createHash, randomBytes } from 'node:crypto';
import {
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { basename, dirname, join } from 'pathe';
import { getProcessBindingDir } from '../paths.js';
import type { AncestryTermination, ProcessNode } from './process-tree.js';

export interface PendingProbeRecord {
    nonce: string;
    workspace: string;
    selfPid: number;
    chain: ProcessNode[];
    /** Absent on pending records created before termination was persisted. */
    termination?: AncestryTermination;
    cwd?: string;
    createdAt: string;
}

/** This shape remains compatible with confirmed records created before N5. */
export interface ProcessBindingRecord {
    workspace: string;
    anchor: ProcessNode;
    boundAt: string;
    cwd?: string;
}

export type StateFile<T> =
    | { status: 'valid'; fileName: string; record: T }
    | {
          status: 'invalid';
          fileName: string;
          reason: 'invalid-json' | 'invalid-shape';
      }
    | {
          status: 'unreadable';
          fileName: string;
          errorCode?: string;
      };

const PENDING_NONCE_PATTERN = /^[0-9a-f]{32}$/;

export function isPendingNonce(value: string): boolean {
    return PENDING_NONCE_PATTERN.test(value);
}

export function readPendingFile(
    nonce: string
): StateFile<PendingProbeRecord> | undefined {
    assertPendingNonce(nonce);
    return readStateFile(pendingDir(), `${nonce}.json`, parsePendingProbe);
}

export function listPendingFiles(): StateFile<PendingProbeRecord>[] {
    return listStateFiles(pendingDir(), parsePendingProbe);
}

export function writePendingFile(record: PendingProbeRecord): void {
    assertPendingNonce(record.nonce);
    writeJsonAtomic(join(pendingDir(), `${record.nonce}.json`), record);
}

export function deletePendingRecord(nonce: string): void {
    assertPendingNonce(nonce);
    deleteStateFile(pendingDir(), `${nonce}.json`);
}

export function deletePendingFile(fileName: string): void {
    deleteStateFile(pendingDir(), fileName);
}

export function listBindingFiles(): StateFile<ProcessBindingRecord>[] {
    return listStateFiles(bindingsDir(), parseProcessBinding);
}

/** Returns the compatible filename written for this anchor. */
export function writeBindingFile(record: ProcessBindingRecord): string {
    const fileName = bindingFileName(record.anchor);
    writeJsonAtomic(join(bindingsDir(), fileName), record);
    return fileName;
}

export function deleteBindingFile(fileName: string): void {
    deleteStateFile(bindingsDir(), fileName);
}

function pendingDir(): string {
    return join(getProcessBindingDir(), 'pending');
}

function bindingsDir(): string {
    return join(getProcessBindingDir(), 'bindings');
}

function bindingFileName(anchor: ProcessNode): string {
    const canonical = JSON.stringify({
        pid: anchor.pid,
        startId: anchor.startId ?? null,
        commandSignature: anchor.commandSignature ?? null
    });
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `${sanitizeKey(`${anchor.pid}-${hash.slice(0, 16)}`)}.json`;
}

function sanitizeKey(key: string): string {
    return key.replace(/[^A-Za-z0-9._-]/g, '-');
}

function assertPendingNonce(nonce: string): void {
    if (!isPendingNonce(nonce)) {
        throw new TypeError(
            'Pending nonce must be 32 lowercase hexadecimal characters.'
        );
    }
}

function readStateFile<T>(
    directory: string,
    fileName: string,
    parseRecord: (value: unknown) => T | undefined
): StateFile<T> | undefined {
    let text: string;
    try {
        text = readFileSync(join(directory, fileName), 'utf8');
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return undefined;
        return {
            status: 'unreadable',
            fileName,
            ...(code ? { errorCode: code } : {})
        };
    }

    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return { status: 'invalid', fileName, reason: 'invalid-json' };
    }
    const record = parseRecord(value);
    return record
        ? { status: 'valid', fileName, record }
        : { status: 'invalid', fileName, reason: 'invalid-shape' };
}

function listStateFiles<T>(
    directory: string,
    parseRecord: (value: unknown) => T | undefined
): StateFile<T>[] {
    let names: string[];
    try {
        names = readdirSync(directory)
            .filter((name) => name.endsWith('.json'))
            .sort();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }

    const files: StateFile<T>[] = [];
    for (const fileName of names) {
        const file = readStateFile(directory, fileName, parseRecord);
        // A file may disappear after enumeration; that is conclusive absence,
        // unlike an existing entry that could not be read.
        if (file) files.push(file);
    }
    return files;
}

function deleteStateFile(directory: string, fileName: string): void {
    if (basename(fileName) !== fileName) {
        throw new Error('State deletion requires a file name, not a path.');
    }
    rmSync(join(directory, fileName), { force: true });
}

function writeJsonAtomic(filePath: string, value: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
        writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
        renameSync(temporaryPath, filePath);
    } finally {
        rmSync(temporaryPath, { force: true });
    }
}

function parsePendingProbe(value: unknown): PendingProbeRecord | undefined {
    if (!isRecord(value) || !isProcessNodeArray(value['chain']))
        return undefined;
    const termination = value['termination'];
    if (termination !== undefined && !isAncestryTermination(termination)) {
        return undefined;
    }
    if (
        typeof value['nonce'] !== 'string' ||
        !isPendingNonce(value['nonce']) ||
        !isNonEmptyString(value['workspace']) ||
        !isPositiveInteger(value['selfPid']) ||
        !isIsoDate(value['createdAt']) ||
        !isOptionalString(value['cwd'])
    ) {
        return undefined;
    }
    return value as unknown as PendingProbeRecord;
}

function parseProcessBinding(value: unknown): ProcessBindingRecord | undefined {
    if (
        !isRecord(value) ||
        !isNonEmptyString(value['workspace']) ||
        !isProcessNode(value['anchor']) ||
        !isIsoDate(value['boundAt']) ||
        !isOptionalString(value['cwd'])
    ) {
        return undefined;
    }
    return value as unknown as ProcessBindingRecord;
}

function isProcessNodeArray(value: unknown): value is ProcessNode[] {
    return (
        Array.isArray(value) && value.length > 0 && value.every(isProcessNode)
    );
}

function isProcessNode(value: unknown): value is ProcessNode {
    if (!isRecord(value)) return false;
    return (
        isPositiveInteger(value['pid']) &&
        Number.isSafeInteger(value['ppid']) &&
        Number(value['ppid']) >= 0 &&
        isOptionalString(value['name']) &&
        isOptionalString(value['executablePath']) &&
        isOptionalString(value['startId']) &&
        isOptionalString(value['commandSignature']) &&
        isOptionalString(value['commandSummary'])
    );
}

function isAncestryTermination(value: unknown): value is AncestryTermination {
    if (!isRecord(value) || typeof value['kind'] !== 'string') return false;
    switch (value['kind']) {
        case 'root':
            return true;
        case 'parent-missing':
            return isPositiveInteger(value['parentPid']);
        case 'cycle':
            return isPositiveInteger(value['pid']);
        case 'depth-limit':
            return isPositiveInteger(value['maxDepth']);
        case 'inconsistent':
            return (
                (value['stage'] === 'native' ||
                    value['stage'] === 'msys-table' ||
                    value['stage'] === 'msys-handoff') &&
                isNonEmptyString(value['reason'])
            );
        default:
            return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isPositiveInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) > 0;
}

function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
