import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readUpstreamModels } from '../src/lib/upstream-models.js';
import { UpstreamManifestError } from '../src/lib/upstream-manifest.js';
import { useTmpDir } from './helpers.js';
import {
  MANIFEST,
  manifestTree,
  upstreamTree,
  writeTree,
} from './support/harness.js';

// pharn-oss's own models block: the `models.defaults` of a fetched clone's
// pharn-install.json. Its verdicts against pharn-oss's checker are pinned in
// tests/model-config-parity.test.ts; this file pins what the reader returns.

describe('readUpstreamModels', () => {
  const tmp = useTmpDir();
  // A sealed clone whose manifest declares `defaults` (left out when
  // undefined); `rootConfig` replaces the tree's root pharn.config.json.
  const clone = (defaults: unknown, rootConfig?: string): string => {
    const tree = manifestTree('7.21.0', (m) => {
      m.models.defaults = defaults;
    });
    if (rootConfig !== undefined) tree['pharn.config.json'] = rootConfig;
    return writeTree(join(tmp.path(), 'clone'), tree);
  };
  const block = {
    stages: {
      default: { model: 'sonnet', effort: 'high' },
      plan: { model: 'opus', effort: 'high', note: 'kept verbatim' },
    },
    comment: 'a key beside stages, kept verbatim',
  };

  it('is absent when the manifest declares no models.defaults', () => {
    expect(readUpstreamModels(clone(undefined))).toEqual({ kind: 'absent' });
  });

  it('is absent when models.defaults is null', () => {
    expect(readUpstreamModels(clone(null))).toEqual({ kind: 'absent' });
  });

  it('returns the block VERBATIM — other keys included — and nothing beside it', () => {
    expect(readUpstreamModels(clone(block))).toEqual({ kind: 'ok', block });
  });

  it('copies a block that declares no stages, as pharn-oss ships it', () => {
    expect(readUpstreamModels(clone({}))).toEqual({ kind: 'ok', block: {} });
  });

  it('refuses a block pharn-oss’s rules reject, with every reason', () => {
    const read = readUpstreamModels(
      clone({ stages: { plan: { model: 'opus-4-8', effort: 'max' } } }),
    );
    expect(read).toEqual({
      kind: 'invalid',
      reasons: [
        'missing required `default` stage entry (the resolution fallback)',
        'stage "plan" model "opus-4-8" is not an alias {sonnet, opus, haiku, fable, inherit} nor a claude-* id',
      ],
    });
  });

  it('never reads the root pharn.config.json', () => {
    // Not JSON, or not an object: neither matters, the manifest decides.
    expect(readUpstreamModels(clone(undefined, '{"models":'))).toEqual({
      kind: 'absent',
    });
    expect(readUpstreamModels(clone(block, '[]'))).toEqual({
      kind: 'ok',
      block,
    });
  });

  // Review finding (REVIEW.md, P2): the checker ignores keys it does not
  // read, so a block can pass while nesting deeper than JSON.stringify can go
  // — which used to throw during an install, after the files were copied.
  it('refuses a block nested too deeply to serialize — before anything copies it', () => {
    const depth = 100_000;
    const deep = `{"stages":{"default":{"model":"opus","effort":"high"}},"deep":${'['.repeat(depth)}${']'.repeat(depth)}}`;
    const tree = manifestTree('7.21.0', (m) => {
      m.models.defaults = '__DEEP__';
    });
    // JSON.stringify could not build this document, so it is spliced in.
    tree[MANIFEST] = tree[MANIFEST]!.replace('"__DEEP__"', deep);
    const read = readUpstreamModels(writeTree(join(tmp.path(), 'deep'), tree));
    expect(read).toEqual({
      kind: 'invalid',
      reasons: ["pharn-oss's models block is nested too deeply to copy"],
    });
  });

  it('refuses a clone without pharn-install.json instead of reading its root config', () => {
    const repo = writeTree(join(tmp.path(), 'old'), upstreamTree('7.20.0'));
    expect(() => readUpstreamModels(repo)).toThrow(UpstreamManifestError);
  });
});

describe('readUpstreamModels — from pharn-install.json (CORE-194)', () => {
  const tmp = useTmpDir();
  const repo = (tree: Record<string, string>): string =>
    writeTree(join(tmp.path(), 'r'), tree);
  const declared = {
    stages: { default: { model: 'haiku', effort: 'low' } },
  };

  it('takes models.defaults over the root config', () => {
    const tree = manifestTree('7.20.0', (m) => {
      m.models.defaults = declared;
    });
    expect(readUpstreamModels(repo(tree))).toEqual({
      kind: 'ok',
      block: declared,
    });
  });

  it('absent or null defaults → absent, even when the root config has a block', () => {
    const tree = manifestTree('7.20.0', (m) => {
      m.models.defaults = null;
    });
    expect(readUpstreamModels(repo(tree))).toEqual({ kind: 'absent' });
  });

  it('holds the declared defaults to the same gate', () => {
    const tree = manifestTree('7.20.0', (m) => {
      m.models.defaults = { stages: { plan: { model: 'gpt', effort: 'low' } } };
    });
    const got = readUpstreamModels(repo(tree));
    expect(got.kind).toBe('invalid');
    expect(got.kind === 'invalid' && got.reasons.join('\n')).toMatch(
      /missing required `default`/,
    );
  });
});
