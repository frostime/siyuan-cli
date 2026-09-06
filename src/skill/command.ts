import { defineCommand } from 'citty';
import {
    formatSkillTargets,
    installSkill,
    listSkillResources,
    renderSkillRead,
    resolveSkillAgentId,
    uninstallSkill,
    type SkillAgentId,
    type SkillScope
} from './runtime.js';
import { CliError, ExitCode, fatalError, toCliError } from '../shared/errors.js';

/** `--agent a --agent b` and `--agent a,b` both mean two agents. */
function parseSkillAgents(value: unknown): SkillAgentId[] | undefined {
    const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
    const names = raw
        .flatMap((entry) => String(entry).split(','))
        .map((name) => name.trim())
        .filter(Boolean);
    return names.length > 0 ? names.map(resolveSkillAgentId) : undefined;
}

/**
 * 0.16 named install locations with `--target`/`--local`. Both are unknown
 * flags to citty, so without this guard they would be silently ignored and the
 * call would degrade into a bare install. Remove after one release.
 */
function assertNoRemovedFlags(command: string, args: Record<string, unknown>): void {
    for (const removed of ['target', 'local']) {
        if (!(removed in args)) continue;
        throw new CliError(
            ExitCode.CONFIG,
            'SKILL_FLAG_REMOVED',
            `\`skill ${command} --${removed}\` was replaced by --agent <id> plus --global/--project.`,
            'Use `--agent agents|claude-code|codex|cursor|gemini-cli|github-copilot|opencode|pi` or `--project`; see `siyuan-cli skill targets`.'
        );
    }
}

function parseSkillScope(args: Record<string, unknown>): SkillScope {
    const global = Boolean(args['global']);
    const project = Boolean(args['project']);
    if (global && project) {
        throw new CliError(
            ExitCode.CONFIG,
            'SKILL_SCOPE_CONFLICT',
            '--global and --project cannot be combined.',
            'Pick one scope, or omit both for a global install.'
        );
    }
    return project ? 'project' : 'global';
}

function formatSkillList(): string {
    const resources = listSkillResources();
    const lines = [`${resources.length} resources`, ''];
    for (const resource of resources) {
        lines.push(resource.relPath);
        lines.push(`  Path: ${resource.absPath}`);
        lines.push(`  ${resource.summary ?? resource.title ?? ''}`);
        lines.push('');
    }
    return lines.join('\n').trimEnd();
}

const listCommand = defineCommand({
    meta: {
        name: 'list',
        description: 'List the bundled skill resources with summaries.'
    },
    run: () => {
        process.stdout.write(formatSkillList() + '\n');
    }
});

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read the bundled skill (with a resource manifest), or one resource file.'
    },
    args: {
        path: {
            type: 'positional',
            description: 'Resource path or unique basename; omit to read the skill itself',
            required: false
        }
    },
    run: ({ args }) => {
        try {
            process.stdout.write(renderSkillRead(args.path));
        } catch (e) {
            fatalError(toCliError(e));
        }
    }
});

const installCommand = defineCommand({
    meta: {
        name: 'install',
        description: 'Install or update the bundled skill for one or more agents.'
    },
    args: {
        agent: {
            type: 'string',
            description:
                'Agent id such as agents, claude-code, or pi; repeatable. Omit to sync every recorded install.',
            required: false
        },
        global: {
            type: 'boolean',
            description: 'Install under the home directory (default)',
            default: false
        },
        project: {
            type: 'boolean',
            description:
                'Install under the current directory; never recorded, so bare installs skip it',
            default: false
        },
        'dry-run': {
            type: 'boolean',
            description: 'Preview installation',
            default: false
        }
    },
    run: ({ args }) => {
        try {
            assertNoRemovedFlags('install', args);
            const result = installSkill({
                agents: parseSkillAgents(args.agent),
                scope: parseSkillScope(args),
                dryRun: args['dry-run']
            });
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } catch (e) {
            fatalError(toCliError(e));
        }
    }
});

const uninstallCommand = defineCommand({
    meta: {
        name: 'uninstall',
        description: 'Remove the bundled skill from one or more agents.'
    },
    args: {
        agent: {
            type: 'string',
            description: 'Agent id such as agents, claude-code, or pi; repeatable',
            required: false
        },
        global: {
            type: 'boolean',
            description: 'Remove from the home directory (default)',
            default: false
        },
        project: {
            type: 'boolean',
            description: 'Remove from the current directory',
            default: false
        }
    },
    run: ({ args }) => {
        try {
            assertNoRemovedFlags('uninstall', args);
            const result = uninstallSkill({
                agents: parseSkillAgents(args.agent),
                scope: parseSkillScope(args)
            });
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } catch (e) {
            fatalError(toCliError(e));
        }
    }
});

const targetsCommand = defineCommand({
    meta: {
        name: 'targets',
        description: 'Show where each known agent loads skills from, and what is installed.'
    },
    run: () => {
        process.stdout.write(formatSkillTargets() + '\n');
    }
});

export const skillCommand = defineCommand({
    meta: {
        name: 'skill',
        description: 'Read and manage the bundled agent skill.'
    },
    subCommands: {
        list: listCommand,
        read: readCommand,
        targets: targetsCommand,
        install: installCommand,
        uninstall: uninstallCommand
    }
});
