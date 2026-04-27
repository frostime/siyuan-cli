import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { CliError, ExitCode } from '../shared/errors.js';

const BUILTIN_SKILL_NAME = 'siyuan-cli';

export interface SkillTargetOptions {
    target?: string;
    local?: boolean;
    dryRun?: boolean;
}

export function resolveBuiltinSkillsDir(
    fromDir: string,
    exists: (path: string) => boolean = existsSync
): string {
    const candidates = [
        resolve(fromDir, '../skills'),
        resolve(fromDir, '../../skills'),
        resolve(fromDir, '../../../skills')
    ];

    // Prefer the first directory that contains the bundled skill payload.
    for (const candidate of candidates) {
        if (
            exists(candidate) &&
            exists(join(candidate, BUILTIN_SKILL_NAME, 'SKILL.md'))
        ) {
            return candidate;
        }
    }

    // Fallback for tests/packaging probes that only mock directory existence.
    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }

    return candidates[0]!;
}

function builtinSkillsDir(): string {
    return resolveBuiltinSkillsDir(dirname(fileURLToPath(import.meta.url)));
}

function builtinSkillDir(): string {
    return join(builtinSkillsDir(), BUILTIN_SKILL_NAME);
}

function builtinSkillFile(): string {
    return join(builtinSkillDir(), 'SKILL.md');
}


function validateSkillTargetName(name: string): void {
    if (!name || name === '.' || name === '..') {
        throw new CliError(
            ExitCode.CONFIG,
            'SKILL_TARGET_INVALID',
            `Invalid skill target: "${name || '(empty)'}".`,
            'Use a simple target name such as agents, claude, pi, or .pi.'
        );
    }
    if (/[\\/]/.test(name) || !/^[A-Za-z0-9._-]+$/.test(name)) {
        throw new CliError(
            ExitCode.CONFIG,
            'SKILL_TARGET_INVALID',
            `Invalid skill target: "${name}".`,
            'Use a simple target name such as agents, claude, pi, or .pi.'
        );
    }
}

export function normalizeSkillTargetName(target?: string): string {
    const name = (target ?? 'agents').trim();
    if (!name) return 'agents';
    validateSkillTargetName(name);
    if (name === 'agents' || name === 'claude') return name;
    return name.startsWith('.') ? name : `.${name}`;
}

export function resolveSkillTargetDir(opts: SkillTargetOptions = {}): string {
    const normalized = normalizeSkillTargetName(opts.target);
    if (normalized === 'agents') {
        if (opts.local) {
            throw new CliError(
                ExitCode.CONFIG,
                'SKILL_TARGET_INVALID',
                'Target "agents" uses the home directory shortcut.',
                'Use `--target .agents --local` for a project-local path.'
            );
        }
        return join(homedir(), '.agents', 'skills', BUILTIN_SKILL_NAME);
    }
    if (normalized === 'claude') {
        if (opts.local) {
            throw new CliError(
                ExitCode.CONFIG,
                'SKILL_TARGET_INVALID',
                'Target "claude" uses the home directory shortcut.',
                'Use `--target .claude --local` for a project-local path.'
            );
        }
        return join(homedir(), '.claude', 'skills', BUILTIN_SKILL_NAME);
    }
    const base = opts.local ? process.cwd() : homedir();
    return join(base, normalized, 'skills', BUILTIN_SKILL_NAME);
}

export function readSkill(): string {
    return readFileSync(builtinSkillFile(), 'utf-8');
}

export function installSkill(opts: SkillTargetOptions = {}) {
    const sourceDir = builtinSkillDir();
    const targetDir = resolveSkillTargetDir(opts);
    const action = existsSync(targetDir) ? 'updated' : 'installed';
    const operations = [{ op: 'copy', from: sourceDir, to: targetDir }];
    if (opts.dryRun) {
        return { target: targetDir, action, dryRun: true, operations };
    }

    mkdirSync(dirname(targetDir), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, force: true });
    return { target: targetDir, action, dryRun: false };
}

export function uninstallSkill(opts: Omit<SkillTargetOptions, 'dryRun'> = {}) {
    const targetDir = resolveSkillTargetDir(opts);
    if (!existsSync(targetDir)) {
        throw new CliError(
            ExitCode.CONFIG,
            'SKILL_TARGET_MISSING',
            `Target does not exist: ${targetDir}`
        );
    }
    rmSync(targetDir, { recursive: true, force: true });
    return { removed: targetDir };
}
