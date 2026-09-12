import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeAssetsDirPath,
    resolveAnchorMode,
    sanitizeLinkText,
    buildAssetMarkdown,
    buildIframeMarkdown,
    extractInsertedBlockId
} from '../src/tool/builtins/insert-asset.ts';

// ————— normalizeAssetsDirPath —————

test('assetsDirPath: accepts assets root and its subdirectories', () => {
    assert.equal(normalizeAssetsDirPath('assets'), 'assets');
    assert.equal(normalizeAssetsDirPath('assets/papers'), 'assets/papers');
    assert.equal(normalizeAssetsDirPath('/assets/papers'), 'assets/papers');
    assert.equal(normalizeAssetsDirPath('assets\\papers'), 'assets/papers');
    assert.equal(normalizeAssetsDirPath('  assets/papers  '), 'assets/papers');
});

test('assetsDirPath: rejects paths outside data/assets', () => {
    assert.equal(normalizeAssetsDirPath(''), null);
    assert.equal(normalizeAssetsDirPath('foo'), null);
    assert.equal(normalizeAssetsDirPath('20231224140619-bpyuay4/assets'), null);
    assert.equal(normalizeAssetsDirPath('assets/../conf'), null);
    assert.equal(normalizeAssetsDirPath('assets/./x'), null);
    assert.equal(normalizeAssetsDirPath('assets//x'), null);
    assert.equal(normalizeAssetsDirPath('C:/assets'), null);
    assert.equal(normalizeAssetsDirPath('data/assets'), null);
});

// ————— resolveAnchorMode —————

test('anchor mode: document id appends, other blocks insert after', () => {
    assert.equal(resolveAnchorMode('d'), 'append');
    assert.equal(resolveAnchorMode('p'), 'after');
    assert.equal(resolveAnchorMode(undefined), 'after');
});

// ————— sanitizeLinkText + buildAssetMarkdown —————

test('link text: strips markdown-breaking characters', () => {
    assert.equal(sanitizeLinkText('my [notes] file'), 'my notes file');
    assert.equal(sanitizeLinkText('a\nb'), 'a b');
    assert.equal(sanitizeLinkText('   '), 'asset');
});

test('markdown: image/audio/video extensions become embedded media', () => {
    assert.equal(buildAssetMarkdown('assets/a-1.png', 'a.png'), '![a.png](assets/a-1.png)');
    assert.equal(buildAssetMarkdown('assets/b-2.mp3', 'b.mp3'), '![b.mp3](assets/b-2.mp3)');
    assert.equal(buildAssetMarkdown('assets/c-3.mp4', 'c.mp4'), '![c.mp4](assets/c-3.mp4)');
    assert.equal(buildAssetMarkdown('assets/d-4.SVG', 'd.SVG'), '![d.SVG](assets/d-4.SVG)');
});

test('markdown: non-media files become paragraph links', () => {
    assert.equal(buildAssetMarkdown('assets/e-5.pdf', 'e.pdf'), '[e.pdf](assets/e-5.pdf)');
    assert.equal(buildAssetMarkdown('assets/f-6.zip', 'f.zip'), '[f.zip](assets/f-6.zip)');
    assert.equal(buildAssetMarkdown('assets/g-7.md', 'g.md'), '[g.md](assets/g-7.md)');
});

test('iframe markdown: any asset path becomes an iframe block', () => {
    assert.equal(
        buildIframeMarkdown('assets/page-1.html'),
        '<iframe src="assets/page-1.html"></iframe>'
    );
    assert.equal(
        buildIframeMarkdown('assets/doc-2.pdf'),
        '<iframe src="assets/doc-2.pdf"></iframe>'
    );
});

// ————— extractInsertedBlockId —————

test('inserted block id: read from transaction response', () => {
    const response = [
        {
            doOperations: [{ action: 'insert', id: '20240922152051-abcd123', data: 'x' }]
        }
    ];
    assert.equal(extractInsertedBlockId(response), '20240922152051-abcd123');
});

test('inserted block id: null on malformed responses', () => {
    assert.equal(extractInsertedBlockId(null), null);
    assert.equal(extractInsertedBlockId([]), null);
    assert.equal(extractInsertedBlockId([{ doOperations: [] }]), null);
    assert.equal(extractInsertedBlockId([{ doOperations: [{ action: 'insert' }] }]), null);
});
