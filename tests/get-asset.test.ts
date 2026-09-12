import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAssetPath } from '../src/tool/builtins/get-asset.ts';

test('accepts plain and doc-form asset paths', () => {
    assert.equal(normalizeAssetPath('assets/foo.png'), 'assets/foo.png');
    assert.equal(normalizeAssetPath('assets/papers/a.pdf'), 'assets/papers/a.pdf');
    assert.equal(
        normalizeAssetPath('assets/foo-20240922152051-7dpjfpv.png?box=20231224140619-bpyuay4'),
        'assets/foo-20240922152051-7dpjfpv.png'
    );
    assert.equal(normalizeAssetPath('/assets/foo.png'), 'assets/foo.png');
    assert.equal(normalizeAssetPath(' assets/foo.png '), 'assets/foo.png');
});

test('rejects paths outside the assets root', () => {
    assert.equal(normalizeAssetPath('foo.png'), null);
    assert.equal(normalizeAssetPath('20231224140619-bpyuay4/assets/foo.png'), null);
    assert.equal(normalizeAssetPath('assets/../conf/conf.json'), null);
    assert.equal(normalizeAssetPath('assets/./foo.png'), null);
    assert.equal(normalizeAssetPath('C:/assets/foo.png'), null);
    assert.equal(normalizeAssetPath('data/assets/foo.png'), null);
    assert.equal(normalizeAssetPath('assets'), null);
    assert.equal(normalizeAssetPath(''), null);
    assert.equal(normalizeAssetPath('assets/foo.png?'), 'assets/foo.png');
});
