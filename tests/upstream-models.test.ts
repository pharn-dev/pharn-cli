import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_UPSTREAM_CONFIG_BYTES,
  readUpstreamModels,
} from '../src/lib/upstream-models.js';
import { useTmpDir } from './helpers.js';

// pharn-oss's own models block, read out of a fetched clone's ROOT
// pharn.config.json. Its verdicts against pharn-oss's checker are pinned in
// tests/model-config-parity.test.ts; this file pins what the reader returns.

describe('readUpstreamModels', () => {
  const tmp = useTmpDir();
  const clone = (text?: string): string => {
    const repo = join(tmp.path(), 'clone');
    mkdirSync(repo, { recursive: true });
    if (text !== undefined)
      writeFileSync(join(repo, 'pharn.config.json'), text);
    return repo;
  };
  const block = {
    stages: {
      default: { model: 'sonnet', effort: 'high' },
      plan: { model: 'opus', effort: 'high', note: 'kept verbatim' },
    },
    comment: 'a key beside stages, kept verbatim',
  };

  it('is absent when the clone has no root config', () => {
    expect(readUpstreamModels(clone())).toEqual({ kind: 'absent' });
  });

  it('is absent when the config has no models block, or a null one', () => {
    expect(readUpstreamModels(clone('{"ship":{}}'))).toEqual({
      kind: 'absent',
    });
    expect(readUpstreamModels(clone('{"models":null}'))).toEqual({
      kind: 'absent',
    });
  });

  it('returns the block VERBATIM — other keys included — and nothing beside it', () => {
    const read = readUpstreamModels(
      clone(
        JSON.stringify({
          _models_stages_note: 'pharn-oss explains the block here',
          models: block,
          ship: { requireAttestation: false },
        }),
      ),
    );
    expect(read).toEqual({ kind: 'ok', block });
  });

  it('copies a block that declares no stages, as pharn-oss ships it', () => {
    expect(readUpstreamModels(clone('{"models":{}}'))).toEqual({
      kind: 'ok',
      block: {},
    });
  });

  it('refuses a block pharn-oss’s rules reject, with every reason', () => {
    const read = readUpstreamModels(
      clone(
        '{"models":{"stages":{"plan":{"model":"opus-4-8","effort":"max"}}}}',
      ),
    );
    expect(read).toEqual({
      kind: 'invalid',
      reasons: [
        'missing required `default` stage entry (the resolution fallback)',
        'stage "plan" model "opus-4-8" is not an alias {sonnet, opus, haiku, fable, inherit} nor a claude-* id',
      ],
    });
  });

  it.each([
    [
      'not JSON',
      '{"models":',
      "pharn-oss's pharn.config.json is not valid JSON",
    ],
    [
      'a JSON array',
      '[]',
      "pharn-oss's pharn.config.json is valid JSON but is not an object",
    ],
    [
      'JSON null',
      'null',
      "pharn-oss's pharn.config.json is valid JSON but is not an object",
    ],
  ])('refuses a root config that is %s', (_label, text, reason) => {
    expect(readUpstreamModels(clone(text))).toEqual({
      kind: 'invalid',
      reasons: [reason],
    });
  });

  it('never echoes the parser’s message, which can quote raw bytes', () => {
    const read = readUpstreamModels(clone('\u001b[31mRED'));
    expect(read).toEqual({
      kind: 'invalid',
      reasons: ["pharn-oss's pharn.config.json is not valid JSON"],
    });
  });

  // Review finding (REVIEW.md, P2): the checker ignores keys it does not
  // read, so a block can pass while nesting deeper than JSON.stringify can go
  // — which used to throw during an install, after the files were copied.
  it('refuses a block nested too deeply to serialize — before anything copies it', () => {
    const depth = 100_000;
    const read = readUpstreamModels(
      clone(
        `{"models":{"stages":{"default":{"model":"opus","effort":"high"}},"deep":${'['.repeat(depth)}${']'.repeat(depth)}}}`,
      ),
    );
    expect(read).toEqual({
      kind: 'invalid',
      reasons: ["pharn-oss's models block is nested too deeply to copy"],
    });
  });

  it('refuses a directory at the path', () => {
    const repo = join(tmp.path(), 'clone');
    mkdirSync(join(repo, 'pharn.config.json'), { recursive: true });
    expect(readUpstreamModels(repo)).toEqual({
      kind: 'invalid',
      reasons: ["pharn-oss's pharn.config.json is not a regular file"],
    });
  });

  it('refuses a root config larger than its cap, unread', () => {
    const big = `{"models":${JSON.stringify(block)},"pad":"${'x'.repeat(MAX_UPSTREAM_CONFIG_BYTES)}"}`;
    expect(readUpstreamModels(clone(big))).toEqual({
      kind: 'invalid',
      reasons: ["pharn-oss's pharn.config.json is larger than 1 MiB"],
    });
  });
});
