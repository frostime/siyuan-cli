import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { CliError, ExitCode } from '../shared/errors.js';
import { getConfigDir } from '../workspace/paths.js';

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

// ─── Skill resources (bundled docs) ─────────────────────────────────────
// Resource access is list-driven: an input path is matched against the
// enumerated resource list, never joined onto the skill dir directly, so
// traversal outside the skill dir is impossible by construction.

export interface SkillResource {
    relPath: string;
    absPath: string;
    title?: string;
    summary?: string;
}

export interface SkillFrontmatter {
    name?: string;
    description?: string;
    version?: string;
    title?: string;
    summary?: string;
}

function parseFrontmatter(content: string): {
    meta: SkillFrontmatter;
    body: string;
} {
    const normalized = content.replace(/\r\n/g, '\n');
    const block = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
    if (!block) return { meta: {}, body: content };
    const text = block[1]!;
    const read = (key: string): string | undefined => {
        const value = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim();
        return value ? value.replace(/^["']|["']$/g, '') : undefined;
    };
    const version = /^metadata:\s*\n\s+version:\s*(.+)$/m
        .exec(text)?.[1]?.trim()
        .replace(/^["']|["']$/g, '');
    return {
        meta: {
            name: read('name'),
            description: read('description'),
            version,
            title: read('title'),
            summary: read('summary')
        },
        body: normalized.slice(block[0].length)
    };
}

function walkResources(root: string, dir: string = root): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkResources(root, absPath));
            continue;
        }
        if (extname(entry.name) === '.md' && entry.name !== 'SKILL.md') {
            files.push(absPath);
        }
    }
    return files;
}

function compareResources(a: SkillResource, b: SkillResource): number {
    const rank = (relPath: string): number => {
        if (relPath === 'README.md') return 0;
        if (relPath.startsWith('recipes/')) return 1;
        return 2;
    };
    const diff = rank(a.relPath) - rank(b.relPath);
    return diff !== 0 ? diff : a.relPath.localeCompare(b.relPath);
}

function basenameWithoutExt(relPath: string): string {
    return basename(relPath, extname(relPath));
}

function skillResourceError(
    errorType: 'SKILL_RESOURCE_NOT_FOUND' | 'SKILL_RESOURCE_AMBIGUOUS',
    message: string,
    detail?: Record<string, unknown>
): CliError {
    return new CliError(
        ExitCode.CONFIG,
        errorType,
        message,
        'Run `siyuan-cli skill list` to see available resource paths.',
        detail
    );
}

export function listSkillResources(): SkillResource[] {
    const root = builtinSkillDir();
    if (!existsSync(root)) return [];
    return walkResources(root)
        .map((absPath) => {
            const relPath = relative(root, absPath).replaceAll('\\', '/');
            const { meta } = parseFrontmatter(readFileSync(absPath, 'utf-8'));
            return {
                relPath,
                absPath,
                title: meta.title,
                summary: meta.summary
            } satisfies SkillResource;
        })
        .sort(compareResources);
}

function resolveSkillResource(input: string): { resource: SkillResource; body: string } {
    const resources = listSkillResources();
    if (resources.length === 0) {
        throw skillResourceError(
            'SKILL_RESOURCE_NOT_FOUND',
            'The bundled skill has no resource files.'
        );
    }

    const normalized = input.trim().replaceAll('\\', '/').replace(/^\.\//, '');
    const direct = resources.filter((r) => r.relPath === normalized);
    const target =
        direct.length === 1
            ? direct[0]!
            : pickByBasename(resources, normalized);
    return {
        resource: target,
        body: parseFrontmatter(readFileSync(target.absPath, 'utf-8')).body
    };
}

function pickByBasename(
    resources: SkillResource[],
    normalized: string
): SkillResource {
    const withoutExt = extname(normalized)
        ? []
        : resources.filter((r) => basenameWithoutExt(r.relPath) === normalized);
    if (withoutExt.length === 1) return withoutExt[0]!;

    const byBasename = resources.filter(
        (r) => basenameWithoutExt(r.relPath) === basenameWithoutExt(normalized)
    );
    if (byBasename.length === 1) return byBasename[0]!;
    if (byBasename.length > 1) {
        throw skillResourceError(
            'SKILL_RESOURCE_AMBIGUOUS',
            'Multiple skill resources match that name.',
            { candidates: byBasename.map((r) => r.relPath) }
        );
    }
    throw skillResourceError(
        'SKILL_RESOURCE_NOT_FOUND',
        `Skill resource "${normalized}" not found.`
    );
}

// ─── Skill read output (XML envelope) ──────────────────────────────────

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function skillMeta(): { name: string; version: string; description?: string } {
    const { meta } = parseFrontmatter(readFileSync(builtinSkillFile(), 'utf-8'));
    return {
        name: meta.name ?? BUILTIN_SKILL_NAME,
        version: meta.version ?? 'unknown',
        description: meta.description
    };
}

/**
 * Build the `skill read` output: the skill itself (with a resource manifest,
 * so agents can discover what to read next) or a single resource. The
 * envelope always carries the bundled skill version.
 */
export function renderSkillRead(path?: string): string {
    const meta = skillMeta();
    const attrs = `name="${escapeAttr(meta.name)}" version="${escapeAttr(meta.version)}"`;

    if (!path || path === 'SKILL.md') {
        const { body } = parseFrontmatter(readFileSync(builtinSkillFile(), 'utf-8'));
        const manifest = listSkillResources()
            .map(
                (r) =>
                    `    <resource path="${escapeAttr(r.relPath)}"${
                        r.summary ? ` description="${escapeAttr(r.summary)}"` : ''
                    } />`
            )
            .join('\n');
        return (
            `<skill ${attrs}${
                meta.description ? ` description="${escapeAttr(meta.description)}"` : ''
            }>\n` +
            `  <resources>\n${manifest}\n  </resources>\n\n` +
            `${body.trimEnd()}\n</skill>\n`
        );
    }

    const { resource, body } = resolveSkillResource(path);
    return (
        `<skill ${attrs} path="${escapeAttr(resource.relPath)}"` +
        `${resource.title ? ` title="${escapeAttr(resource.title)}"` : ''}` +
        `${resource.summary ? ` description="${escapeAttr(resource.summary)}"` : ''}>\n\n` +
        `${body.trimEnd()}\n</skill>\n`
    );
}

export function formatSkillHint(): string {
    const root = builtinSkillDir();
    return (
        `\nConfig dir\n` +
        `  ${getConfigDir()}\n` +
        `\nSkill root\n` +
        `  ${root}\n` +
        `\nStart here\n` +
        `  siyuan-cli skill read\n` +
        `\nResources\n` +
        `  siyuan-cli skill list\n`
    );
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

/**
 * Parse `metadata.version` from a SKILL.md YAML frontmatter block.
 * Returns undefined if the frontmatter or version field is missing.
 */
function parseSkillVersion(content: string): string | undefined {
    const match = content.match(/^---[\s\S]*?metadata:[\s\S]*?version:\s*["']?([^\s"']+)["']?[\s\S]*?---/);
    return match?.[1];
}

/**
 * Check whether the installed SKILL at the default target matches the CLI version.
 * Returns a warning string if there is a mismatch or the SKILL is missing, otherwise null.
 *
 * #TODO HINT: currently only checks `~/.agents/skills/` (default target).
 * If multi-target checking is needed, iterate over additional targets here
 * (e.g. `~/.claude/skills/`, `~/.pi/agent/skills/`).
 */
export function checkInstalledSkillVersion(cliVersion: string): string | null {
    const targetDir = resolveSkillTargetDir({ target: 'agents' });
    const targetFile = join(targetDir, 'SKILL.md');

    if (!existsSync(targetFile)) {
        return `SKILL file not found at ${targetFile}. Run \`siyuan-cli skill install\` to install it.`;
    }

    try {
        const content = readFileSync(targetFile, 'utf-8');
        const installedVersion = parseSkillVersion(content);
        if (!installedVersion) {
            return `Cannot read version from ${targetFile}. Run \`siyuan-cli skill install\` to reinstall.`;
        }
        if (installedVersion !== cliVersion) {
            return `SKILL version mismatch: installed ${installedVersion}, CLI ${cliVersion}. Run \`siyuan-cli skill install\` to update.`;
        }
    } catch {
        return `Failed to read ${targetFile}. Run \`siyuan-cli skill install\` to reinstall.`;
    }

    return null;
}
