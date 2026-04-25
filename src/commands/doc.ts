import { defineCommand } from 'citty';
import { CliError, ExitCode, fatalError, toCliError } from '../utils/errors.js';
import {
    formatDocsHint,
    getDocsRoot,
    listBuiltinDocs,
    readBuiltinDoc
} from '../core/docs.js';

function formatDocList(): string {
    const docs = listBuiltinDocs();
    const lines = [`Docs root: ${getDocsRoot()}`, ''];
    for (const doc of docs) {
        lines.push(doc.relPath);
        lines.push(`  Path: ${doc.absPath}`);
        lines.push(`  ${doc.summary}`);
        lines.push('');
    }
    return lines.join('\n').trimEnd();
}

const listCommand = defineCommand({
    meta: { name: 'list', description: 'List built-in docs with real file paths.' },
    run: () => {
        process.stdout.write(formatDocList() + '\n');
    }
});

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description: 'Read a built-in doc by relative path or unique basename.'
    },
    args: {
        path: {
            type: 'positional',
            description: 'Doc relative path or unique basename',
            required: true
        }
    },
    run: ({ args }) => {
        try {
            const { doc, content } = readBuiltinDoc(args.path);
            process.stdout.write(`Path: ${doc.absPath}\n\n${content}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.startsWith('DOC_NOT_FOUND\n')) {
                const target = msg.slice('DOC_NOT_FOUND\n'.length);
                fatalError(
                    new CliError(
                        ExitCode.CONFIG,
                        'DOC_NOT_FOUND',
                        `Built-in doc "${target}" not found.`,
                        'Run `siyuan doc list` to see available docs and real file paths.'
                    )
                );
            }
            if (msg.startsWith('DOC_AMBIGUOUS\n')) {
                const candidates = msg
                    .slice('DOC_AMBIGUOUS\n'.length)
                    .split('\n')
                    .filter(Boolean);
                fatalError(
                    new CliError(
                        ExitCode.CONFIG,
                        'DOC_AMBIGUOUS',
                        'Multiple built-in docs match that name.',
                        'Use one of the candidate relative paths from `siyuan doc list`.',
                        { candidates }
                    )
                );
            }
            fatalError(toCliError(e));
        }
    }
});

export const docCommand = defineCommand({
    meta: { name: 'doc', description: 'Discover and read built-in docs.' },
    subCommands: {
        list: listCommand,
        read: readCommand
    }
});

export { formatDocsHint };
