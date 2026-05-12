import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, openSync, closeSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePayload } from '../src/shared/argv.ts';
import type { EndpointSchema } from '../src/shared/schema.ts';

// ————— brute-edit: original-span application logic —————

interface PlannedReplacement {
    search: string;
    replace: string;
    start: number;
    end: number;
}

/**
 * Mirrors the brute-edit core logic: plan + apply.
 * Exported for testability; the tool itself inlines this.
 */
function planAndApply(
    markdown: string,
    pairs: Array<{ search: string; replace: string }>
): { result: string; planned: PlannedReplacement[] } | { error: string; details: Record<string, unknown> } {
    const planned: PlannedReplacement[] = [];

    for (const { search, replace } of pairs) {
        const first = markdown.indexOf(search);
        if (first === -1) {
            return { error: 'search-not-found', details: { search, hint: 'Check spelling or use a broader search.' } };
        }
        const second = markdown.indexOf(search, first + 1);
        if (second !== -1) {
            let count = 1;
            let pos = second;
            while (pos !== -1) {
                count++;
                pos = markdown.indexOf(search, pos + 1);
            }
            return {
                error: 'search-ambiguous',
                details: { search, matchCount: count, hint: 'Use a more specific search string.' }
            };
        }
        planned.push({ search, replace, start: first, end: first + search.length });
    }

    // Check overlapping ranges
    const sorted = [...planned].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.start < sorted[i - 1]!.end) {
            return {
                error: 'overlapping-replacements',
                details: {
                    conflicts: [
                        { search: sorted[i - 1]!.search, range: [sorted[i - 1]!.start, sorted[i - 1]!.end] },
                        { search: sorted[i]!.search, range: [sorted[i]!.start, sorted[i]!.end] }
                    ],
                    hint: 'Split the edit into separate calls or make the search strings non-overlapping.'
                }
            };
        }
    }

    // Apply from end to start
    let result = markdown;
    const sortedDesc = [...planned].sort((a, b) => b.start - a.start);
    for (const { replace, start, end } of sortedDesc) {
        result = result.slice(0, start) + replace + result.slice(end);
    }

    return { result, planned };
}

// ————— Tests —————

test('brute-edit: basic single replacement', () => {
    const res = planAndApply('hello world', [{ search: 'world', replace: 'there' }]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'hello there');
    assert.equal(res.planned.length, 1);
    assert.deepEqual(res.planned[0], { search: 'world', replace: 'there', start: 6, end: 11 });
});

test('brute-edit: multiple non-overlapping replacements', () => {
    const res = planAndApply('foo bar baz', [
        { search: 'foo', replace: 'one' },
        { search: 'baz', replace: 'three' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'one bar three');
});

test('brute-edit: original-span model — later replacement does not match introduced text', () => {
    // "foo bar" → "bar baz" (NOT "baz bar" as sequential .replace would produce)
    const res = planAndApply('foo bar', [
        { search: 'foo', replace: 'bar' },
        { search: 'bar', replace: 'baz' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'bar baz');
});

test('brute-edit: search-not-found', () => {
    const res = planAndApply('hello world', [{ search: 'missing', replace: 'x' }]);
    assert.equal(res.error, 'search-not-found');
});

test('brute-edit: search-ambiguous (multiple matches)', () => {
    const res = planAndApply('abc abc xyz', [{ search: 'abc', replace: 'def' }]);
    if (!('error' in res)) assert.fail('Expected error');
    assert.equal(res.error, 'search-ambiguous');
    if ('details' in res) assert.equal((res.details as Record<string, unknown>).matchCount, 2);
});

test('brute-edit: overlapping ranges rejected', () => {
    // "foobar" — "foo" and "obar" overlap at "o"
    const res = planAndApply('foobar', [
        { search: 'foo', replace: 'one' },
        { search: 'obar', replace: 'two' }
    ]);
    if (!('error' in res)) assert.fail('Expected error');
    assert.equal(res.error, 'overlapping-replacements');
});

test('brute-edit: adjacent (non-overlapping) ranges succeed', () => {
    // "foo bar" — "foo" ends at 3, " bar" starts at 3 — not overlapping
    const res = planAndApply('foo bar', [
        { search: 'foo', replace: 'hello' },
        { search: ' bar', replace: ' world' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'hello world');
});

test('brute-edit: empty replacements okay', () => {
    const res = planAndApply('hello world', [{ search: ' world', replace: '' }]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'hello');
});

test('brute-edit: sequential-like replacements with non-conflicting searches still work', () => {
    // Original: "alpha beta gamma"
    // Replace "alpha" → "delta" and "beta" → "epsilon"
    const res = planAndApply('alpha beta gamma', [
        { search: 'alpha', replace: 'delta' },
        { search: 'beta', replace: 'epsilon' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'delta epsilon gamma');
});

test('brute-edit: three replacements applied end-to-start', () => {
    const res = planAndApply('a b c', [
        { search: 'a', replace: 'A' },
        { search: 'b', replace: 'B' },
        { search: 'c', replace: 'C' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'A B C');
});

test('brute-edit: replacement introduces text that looks like a search string but is not matched', () => {
    // Replace "foo" with "bar" — "bar" is in original, should still match original position
    const res = planAndApply('foo bar', [
        { search: 'foo', replace: 'baz' },
        { search: 'bar', replace: 'qux' }
    ]);
    if ('error' in res) assert.fail(`Unexpected error: ${res.error}`);
    assert.equal(res.result, 'baz qux');
});

const bruteEditSchemaForSourceTest: EndpointSchema = {
    endpoint: '/api/tool/brute-edit',
    summary: 'Brute edit',
    payload: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
            id: { type: 'string' },
            replacements: { type: 'string' },
            overwrite: { type: 'string' },
            check: { type: 'boolean', default: false },
            maxSize: { type: 'integer', default: 51200 }
        }
    },
    classification: {
        mode: 'write',
        surface: 'content',
        scope: 'single',
        operation: 'update'
    },
    cli: {
        primary: 'id',
        allowSource: {
            replacements: ['literal', 'file', 'stdin'],
            overwrite: ['literal', 'file', 'stdin']
        }
    }
};

test('brute-edit: replacements can be sourced from stdin', () => {
    const schema = bruteEditSchemaForSourceTest;

    const dir = mkdtempSync(join(tmpdir(), 'siyuan-cli-stdin-'));
    const stdinFile = join(dir, 'stdin.txt');
    writeFileSync(stdinFile, '[{"search":"foo","replace":"bar"}]', 'utf8');

    const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalFd = Object.getOwnPropertyDescriptor(process.stdin, 'fd');
    const fd = openSync(stdinFile, 'r');

    try {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
        Object.defineProperty(process.stdin, 'fd', { value: fd, configurable: true });

        const payload = parsePayload({
            schema,
            args: {
                id: '20260507131852-5604q2q',
                replacements: '@stdin'
            }
        });

        assert.equal(payload.id, '20260507131852-5604q2q');
        assert.equal(payload.replacements, '[{"search":"foo","replace":"bar"}]');
        assert.equal(payload.maxSize, 51200);
    } finally {
        closeSync(fd);
        if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY);
        else delete (process.stdin as { isTTY?: boolean }).isTTY;
        if (originalFd) Object.defineProperty(process.stdin, 'fd', originalFd);
        else delete (process.stdin as { fd?: number }).fd;
        rmSync(dir, { recursive: true, force: true });
    }
});

test('brute-edit: replacements can be sourced from file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'siyuan-cli-file-'));
    const replacementsFile = join(dir, 'replacements.json');
    writeFileSync(replacementsFile, '[{"search":"foo","replace":"bar"}]', 'utf8');

    try {
        const payload = parsePayload({
            schema: bruteEditSchemaForSourceTest,
            args: {
                id: '20260507131852-5604q2q',
                replacements: `@file:${replacementsFile}`
            }
        });

        assert.equal(payload.id, '20260507131852-5604q2q');
        assert.equal(payload.replacements, '[{"search":"foo","replace":"bar"}]');
        assert.equal(payload.maxSize, 51200);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('brute-edit: overwrite can be sourced from file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'siyuan-cli-overwrite-file-'));
    const markdownFile = join(dir, 'doc.md');
    writeFileSync(markdownFile, '# Title\n\nBody', 'utf8');

    try {
        const payload = parsePayload({
            schema: bruteEditSchemaForSourceTest,
            args: {
                id: '20260507131852-5604q2q',
                overwrite: `@file:${markdownFile}`
            }
        });

        assert.equal(payload.id, '20260507131852-5604q2q');
        assert.equal(payload.overwrite, '# Title\n\nBody');
        assert.equal(payload.check, false);
        assert.equal(payload.maxSize, 51200);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

