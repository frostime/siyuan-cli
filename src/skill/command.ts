import { defineCommand } from 'citty';
import {
    formatSkillHint,
    installSkill,
    listSkillResources,
    renderSkillRead,
    uninstallSkill
} from './runtime.js';
import { fatalError, toCliError } from '../shared/errors.js';

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
        description: 'Install or replace the bundled skill at a target.'
    },
    args: {
        target: {
            type: 'string',
            description: 'Target name such as agents, claude, or .pi',
            default: 'agents'
        },
        local: {
            type: 'boolean',
            description: 'Install under the current directory instead of the home directory',
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
            const result = installSkill({
                target: args.target,
                local: args.local,
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
        description: 'Uninstall the bundled skill from a target.'
    },
    args: {
        target: {
            type: 'string',
            description: 'Target name such as agents, claude, or .pi',
            default: 'agents'
        },
        local: {
            type: 'boolean',
            description: 'Uninstall from the current directory instead of the home directory',
            default: false
        }
    },
    run: ({ args }) => {
        try {
            const result = uninstallSkill({
                target: args.target,
                local: args.local
            });
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } catch (e) {
            fatalError(toCliError(e));
        }
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
        install: installCommand,
        uninstall: uninstallCommand
    }
});
