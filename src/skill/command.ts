import { defineCommand } from 'citty';
import { installSkill, readSkill, uninstallSkill } from './runtime.js';
import { fatalError, toCliError } from '../shared/errors.js';

const readCommand = defineCommand({
    meta: { name: 'read', description: 'Read the bundled skill file.' },
    run: () => {
        process.stdout.write(readSkill());
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
    meta: { name: 'skill', description: 'Manage the bundled agent skill.' },
    subCommands: {
        install: installCommand,
        read: readCommand,
        uninstall: uninstallCommand
    }
});
