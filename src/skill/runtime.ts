import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { CliError, ExitCode } from '../shared/errors.js';
import { getConfigDir } from '../workspace/paths.js';

const BUILTIN_SKILL_NAME = 'siyuan-cli';

export interface SkillInstallOptions {
    /** Omitted means a bare install: sync every recorded install location. */
    agents?: SkillAgentId[];
    /** Defaults to `global`; `project` installs into the working directory. */
    scope?: SkillScope;
    dryRun?: boolean;
    /** Override the config dir holding the install registry (tests). */
    configDir?: string;
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


// ─── Install targets ───────────────────────────────────────────────────
// Where each known agent discovers skills. Agent ids and their directories
// follow the mapping used by the `skills` installer
// (https://github.com/vercel-labs/skills), so the same names work across
// tools. `project` paths are relative to the working directory, `global`
// paths relative to the home directory; most agents share the project-level
// `.agents/skills` directory.

export const SKILL_AGENT_TARGETS = {
    agents: { project: '.agents', global: '.agents' },
    'claude-code': { project: '.claude', global: '.claude' },
    codex: { project: '.agents', global: '.codex' },
    cursor: { project: '.agents', global: '.cursor' },
    'gemini-cli': { project: '.agents', global: '.gemini' },
    'github-copilot': { project: '.agents', global: '.copilot' },
    opencode: { project: '.agents', global: '.config/opencode' },
    pi: { project: '.pi', global: '.pi/agent' }
} as const;

export type SkillAgentId = keyof typeof SKILL_AGENT_TARGETS;
export type SkillScope = 'global' | 'project';

/** Where a bare install with nothing on record puts the skill. */
export const DEFAULT_SKILL_AGENT: SkillAgentId = 'agents';

export function skillAgentIds(): SkillAgentId[] {
    return Object.keys(SKILL_AGENT_TARGETS) as SkillAgentId[];
}

/** Resolve one `--agent` value; anything off the table is an error. */
export function resolveSkillAgentId(input: string): SkillAgentId {
    const id = input.trim().toLowerCase();
    if (isSkillAgentId(id)) return id;
    throw new CliError(
        ExitCode.CONFIG,
        'SKILL_AGENT_UNKNOWN',
        `Unknown skill agent: "${input}".`,
        `Known agents: ${skillAgentIds().join(', ')}. See \`siyuan-cli skill targets\`.`
    );
}

function isSkillAgentId(value: string): value is SkillAgentId {
    return Object.hasOwn(SKILL_AGENT_TARGETS, value);
}

/** The skill directory one agent + scope installs into. */
export function resolveSkillTargetDir(
    agent: SkillAgentId = DEFAULT_SKILL_AGENT,
    scope: SkillScope = 'global'
): string {
    const entry = SKILL_AGENT_TARGETS[agent];
    const base = scope === 'project' ? process.cwd() : homedir();
    return join(base, entry[scope], 'skills', BUILTIN_SKILL_NAME);
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
    const rank = (relPath: string): number =>
        relPath.startsWith('recipes/') ? 0 : 1;
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
        'Run `siyuan-cli skill read` to see the resource manifest.',
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
        `<skill-resource ${attrs} path="${escapeAttr(resource.relPath)}"` +
        `${resource.title ? ` title="${escapeAttr(resource.title)}"` : ''}` +
        `${resource.summary ? ` description="${escapeAttr(resource.summary)}"` : ''}>\n\n` +
        `${body.trimEnd()}\n</skill-resource>\n`
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

export function installSkill(opts: SkillInstallOptions = {}) {
    const sourceDir = builtinSkillDir();
    const known = liveSkillInstalls(opts.configDir);
    const targets = installPlans(opts, known).map(({ agent, scope }) => {
        const targetDir = resolveSkillTargetDir(agent, scope);
        return {
            agent,
            scope,
            path: targetDir,
            action: existsSync(targetDir) ? ('updated' as const) : ('installed' as const),
            operations: [{ op: 'copy', from: sourceDir, to: targetDir }]
        };
    });

    if (opts.dryRun) {
        return { dryRun: true, targets };
    }

    for (const entry of targets) {
        mkdirSync(dirname(entry.path), { recursive: true });
        rmSync(entry.path, { recursive: true, force: true });
        cpSync(sourceDir, entry.path, { recursive: true, force: true });
    }
    if ((opts.scope ?? 'global') === 'global') {
        // Keep the other recorded installs; refresh the ones just written.
        const written = new Set(targets.map((entry) => entry.path));
        writeSkillInstalls(
            [
                ...known.filter((record) => !written.has(record.path)),
                ...targets.map((entry) => ({
                    agent: entry.agent,
                    path: entry.path,
                    installedAt: new Date().toISOString()
                }))
            ],
            opts.configDir
        );
    }
    return { dryRun: false, targets };
}

/** Which agent + scope an install call covers. */
function installPlans(
    opts: SkillInstallOptions,
    known: SkillInstallRecord[]
): { agent: SkillAgentId; scope: SkillScope }[] {
    const scope = opts.scope ?? 'global';
    if (opts.agents?.length) return opts.agents.map((agent) => ({ agent, scope }));
    // A bare global install keeps the machine's recorded installs in sync and
    // falls back to the default agent when nothing is on record. A bare
    // project install has no history to replay, so it uses the default agent.
    if (scope === 'global' && known.length > 0) {
        return known.map((record) => ({ agent: record.agent, scope }));
    }
    return [{ agent: DEFAULT_SKILL_AGENT, scope }];
}

export function uninstallSkill(opts: SkillInstallOptions = {}) {
    const scope = opts.scope ?? 'global';
    const agents = opts.agents?.length
        ? opts.agents
        : [DEFAULT_SKILL_AGENT];
    const targets = agents.map((agent) => {
        const targetDir = resolveSkillTargetDir(agent, scope);
        const existed = existsSync(targetDir);
        if (existed) {
            rmSync(targetDir, { recursive: true, force: true });
        }
        return {
            agent,
            scope,
            path: targetDir,
            action: existed ? ('removed' as const) : ('absent' as const)
        };
    });

    const gone = new Set(targets.map((entry) => entry.path));
    const known = readSkillInstalls(opts.configDir);
    const kept = known.filter((record) => !gone.has(record.path));
    if (kept.length !== known.length) {
        writeSkillInstalls(kept, opts.configDir);
    }
    return { targets };
}

// ─── Install registry ──────────────────────────────────────────────────
// Every global `skill install` records its location in the config dir, so a
// later bare `skill install` syncs all recorded installs (multi-agent setups)
// instead of blindly touching the default target. Project installs are
// deliberately absent: they belong to one checkout, not to the machine.
// Records are global-scope, so replaying `agent` alone re-resolves the path.

export interface SkillInstallRecord {
    agent: SkillAgentId;
    path: string;
    installedAt: string;
}

const SKILL_INSTALLS_FILE = 'skill-installs.json';

function skillInstallsPath(configDir?: string): string {
    return join(configDir ?? getConfigDir(), SKILL_INSTALLS_FILE);
}

function isInstallRecord(value: unknown): value is SkillInstallRecord {
    const record = value as Record<string, unknown> | null;
    return (
        typeof record === 'object' &&
        record !== null &&
        typeof record['path'] === 'string' &&
        typeof record['agent'] === 'string' &&
        isSkillAgentId(record['agent'])
    );
}

function liveSkillInstalls(configDir?: string): SkillInstallRecord[] {
    return readSkillInstalls(configDir).filter((record) =>
        existsSync(join(record.path, 'SKILL.md'))
    );
}

export function readSkillInstalls(configDir?: string): SkillInstallRecord[] {
    try {
        const parsed = JSON.parse(
            readFileSync(skillInstallsPath(configDir), 'utf-8')
        ) as unknown;
        const installs = isRecord(parsed) ? parsed['installs'] : null;
        return Array.isArray(installs) ? installs.filter(isInstallRecord) : [];
    } catch {
        return [];
    }
}

function writeSkillInstalls(records: SkillInstallRecord[], configDir?: string): void {
    const filePath = skillInstallsPath(configDir);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ installs: records }, null, 2) + '\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
 * Check every recorded install against the running CLI version. When nothing
 * is on record (zero-install, or an install predating the registry), probe the
 * default `agents` target instead. Returns the first problem found, else null.
 */
export function checkInstalledSkillVersion(
    cliVersion: string,
    configDir?: string
): string | null {
    const recorded = liveSkillInstalls(configDir);
    const candidates =
        recorded.length > 0
            ? recorded.map((record) => record.path)
            : [resolveSkillTargetDir(DEFAULT_SKILL_AGENT)];

    for (const targetDir of candidates) {
        const problem = installedSkillVersionProblem(targetDir, cliVersion);
        if (problem) return problem;
    }
    return null;
}

function installedSkillVersionProblem(
    targetDir: string,
    cliVersion: string
): string | null {
    const file = join(targetDir, 'SKILL.md');
    if (!existsSync(file)) {
        return `SKILL file not found at ${file}. Run \`siyuan-cli skill install\` to install it.`;
    }

    let installedVersion: string | undefined;
    try {
        installedVersion = parseSkillVersion(readFileSync(file, 'utf-8'));
    } catch {
        return `Failed to read ${file}. Run \`siyuan-cli skill install\` to reinstall.`;
    }
    if (!installedVersion) {
        return `Cannot read version from ${file}. Run \`siyuan-cli skill install\` to reinstall.`;
    }
    if (installedVersion !== cliVersion) {
        return `SKILL version mismatch: installed ${installedVersion} at ${file}, CLI ${cliVersion}. Run \`siyuan-cli skill install\` to update.`;
    }
    return null;
}

/** Version of the skill installed at `dir`, or undefined when nothing readable is there. */
function installedVersionAt(dir: string): string | undefined {
    try {
        return parseSkillVersion(readFileSync(join(dir, 'SKILL.md'), 'utf-8'));
    } catch {
        return undefined;
    }
}

/** Human-readable map of every known agent, its skill directories, and what is installed. */
export function formatSkillTargets(): string {
    const recorded = new Set(
        readSkillInstalls().map((record) => normalizeRecordPath(record.path))
    );
    const lines = ['Agents', ''];
    for (const agent of skillAgentIds()) {
        lines.push(agent);
        for (const scope of ['project', 'global'] as SkillScope[]) {
            const dir = resolveSkillTargetDir(agent, scope);
            const marks = [
                installedVersionAt(dir) ? `installed ${installedVersionAt(dir)}` : '',
                scope === 'global' && recorded.has(normalizeRecordPath(dir))
                    ? 'recorded'
                    : ''
            ].filter(Boolean);
            lines.push(
                `  ${scope}: ${dir}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`
            );
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd();
}

function normalizeRecordPath(path: string): string {
    return path.replace(/\\/g, '/');
}
