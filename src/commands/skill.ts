import { defineCommand } from 'citty';
import {
    installSkill,
    listBuiltinSkills,
    readSkill,
    uninstallSkill
} from '../core/skills.js';

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List builtin skills.' },
    run: () => {
        process.stdout.write(
            JSON.stringify(listBuiltinSkills(), null, 2) + '\n'
        );
    }
});

const readCommand = defineCommand({
    meta: { name: 'read', description: 'Read a builtin skill file.' },
    args: {
        path: {
            type: 'positional',
            description: 'Skill name or relative file path',
            required: true
        }
    },
    run: ({ args }) => {
        const rel = args.path.includes('/')
            ? args.path
            : `${args.path}/SKILL.md`;
        process.stdout.write(readSkill(rel));
    }
});

const installCommand = defineCommand({
    meta: { name: 'install', description: 'Install a builtin skill.' },
    args: {
        name: { type: 'positional', description: 'Skill name', required: true },
        target: {
            type: 'string',
            description:
                'Install target: agents | claude | claude-project | custom',
            default: 'agents'
        },
        dest: {
            type: 'string',
            description: 'Destination directory for custom target'
        },
        force: {
            type: 'boolean',
            description: 'Overwrite existing target',
            default: false
        },
        'dry-run': {
            type: 'boolean',
            description: 'Preview installation',
            default: false
        }
    },
    run: ({ args }) => {
        const result = installSkill(args.name, {
            target: args.target,
            dest: args.dest,
            force: args.force,
            dryRun: args['dry-run']
        });
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
});

const uninstallCommand = defineCommand({
    meta: {
        name: 'uninstall',
        description: 'Uninstall a builtin skill from target.'
    },
    args: {
        name: { type: 'positional', description: 'Skill name', required: true },
        target: {
            type: 'string',
            description: 'Target: agents | claude | claude-project | custom',
            default: 'agents'
        },
        dest: {
            type: 'string',
            description: 'Destination directory for custom target'
        }
    },
    run: ({ args }) => {
        const result = uninstallSkill(args.name, {
            target: args.target,
            dest: args.dest
        });
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
});

export const skillCommand = defineCommand({
    meta: { name: 'skill', description: 'Manage builtin agent skills.' },
    subCommands: {
        list: listCommand,
        read: readCommand,
        install: installCommand,
        uninstall: uninstallCommand
    }
});
