import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, join, relative, resolve } from 'pathe';

export interface BuiltinDoc {
    relPath: string;
    absPath: string;
    title: string;
    summary: string;
}

export interface ResolvedBuiltinDoc {
    doc: BuiltinDoc;
    content: string;
}

function normalizeRelPath(path: string): string {
    return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function parseDocFrontmatter(content: string): {
    title: string;
    summary: string;
} {
    const normalized = content.replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---/m.exec(normalized);
    if (!m) throw new Error('Missing doc frontmatter.');
    const block = m[1]!;
    const title = /^title:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const summary = /^summary:\s*(.+)$/m.exec(block)?.[1]?.trim();
    if (!title || !summary) {
        throw new Error('Doc frontmatter must contain title and summary.');
    }
    return {
        title: title.replace(/^"|"$/g, ''),
        summary: summary.replace(/^"|"$/g, '')
    };
}

function walkDocs(root: string, dir = root): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkDocs(root, absPath));
            continue;
        }
        if (extname(entry.name) === '.md') {
            files.push(absPath);
        }
    }
    return files;
}

function compareDocs(a: BuiltinDoc, b: BuiltinDoc): number {
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

export function resolveDocsRoot(
    fromDir: string,
    exists: (path: string) => boolean = existsSync
): string {
    const candidates = [
        resolve(fromDir, '../src/docs'),
        resolve(fromDir, '../docs'),
        resolve(fromDir, '../../src/docs')
    ];
    for (const candidate of candidates) {
        if (exists(candidate)) return candidate;
    }
    return candidates[0]!;
}

export function getDocsRoot(): string {
    return resolveDocsRoot(dirname(fileURLToPath(import.meta.url)));
}

export function listBuiltinDocs(): BuiltinDoc[] {
    const root = getDocsRoot();
    if (!existsSync(root)) return [];
    return walkDocs(root)
        .map((absPath) => {
            const relPath = normalizeRelPath(relative(root, absPath));
            const content = readFileSync(absPath, 'utf-8');
            const fm = parseDocFrontmatter(content);
            return {
                relPath,
                absPath,
                title: fm.title,
                summary: fm.summary
            } satisfies BuiltinDoc;
        })
        .sort(compareDocs);
}

export function resolveBuiltinDoc(input: string): BuiltinDoc {
    const docs = listBuiltinDocs();
    if (docs.length === 0) {
        throw new Error('No built-in docs found.');
    }

    const normalized = normalizeRelPath(input.trim());
    const directMatches = docs.filter((doc) => doc.relPath === normalized);
    if (directMatches.length === 1) return directMatches[0]!;

    const directWithoutExtMatches = extname(normalized)
        ? []
        : docs.filter((doc) => basenameWithoutExt(doc.relPath) === normalized);
    if (directWithoutExtMatches.length === 1) return directWithoutExtMatches[0]!;

    const basenameMatches = docs.filter(
        (doc) => basenameWithoutExt(doc.relPath) === basenameWithoutExt(normalized)
    );
    if (basenameMatches.length === 1) return basenameMatches[0]!;
    if (basenameMatches.length > 1) {
        throw new Error(
            `DOC_AMBIGUOUS\n${basenameMatches.map((doc) => doc.relPath).join('\n')}`
        );
    }

    throw new Error(`DOC_NOT_FOUND\n${normalized}`);
}

export function readBuiltinDoc(input: string): ResolvedBuiltinDoc {
    const doc = resolveBuiltinDoc(input);
    return {
        doc,
        content: readFileSync(doc.absPath, 'utf-8')
    };
}

export function formatDocsHint(): string {
    const root = getDocsRoot();
    return (
        `\nBuilt-in docs root\n` +
        `  ${root}\n` +
        `\nStart here\n` +
        `  siyuan doc list\n` +
        `\nBuilt-in docs\n` +
        `  ${join(root, 'README.md')}\n` +
        `  ${join(root, 'recipes', '*.md')}\n` +
        `  ${join(root, 'siyuan-guide', '*.md')}\n` +
        `  ${join(root, 'cli-usage', '*.md')}\n`
    );
}
