import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

function resolveApprovalTemplatePath(
    fromDir: string,
    exists: (path: string) => boolean = existsSync
): string {
    const candidates = [
        resolve(fromDir, 'approval-center.html'),
        resolve(fromDir, '../../src/approval/approval-center.html')
    ];
    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }
    return candidates[0]!;
}

function getApprovalTemplatePath(): string {
    return resolveApprovalTemplatePath(dirname(fileURLToPath(import.meta.url)));
}

export function renderApprovalCenter(token: string): string {
    const template = readFileSync(getApprovalTemplatePath(), 'utf-8');
    return template.replace('__APPROVAL_TOKEN__', JSON.stringify(token));
}
