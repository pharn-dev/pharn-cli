import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256File } from '../src/lib/hash.js';
import {
  checkModelsBlock,
  EFFORT_LEVELS,
  MODEL_ALIASES,
  MODEL_ID_RE,
  PRODUCT_STAGES,
  resolveStageModel,
  type ModelsStages,
} from '../src/lib/model-config.js';
import { readUpstreamModels } from '../src/lib/upstream-models.js';
import { useTmpDir } from './helpers.js';

// ---------------------------------------------------------------------------
// src/lib/model-config.ts is a COPY of pharn-oss's rules for the `models`
// block. This file is what keeps pharn-oss their one owner: it runs the real
// checker — pharn-oss's pharn/floor/check-model-config.mjs, vendored
// byte-for-byte — over a corpus, and fails on any verdict, RED line or
// resolution that differs from the copy's. The four value sets are read out
// of the checker's own source, so a set cannot drift either. Refreshing the
// vendored file: docs/contributing.md.
// ---------------------------------------------------------------------------

const CHECKER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/pharn-oss/check-model-config.mjs',
);

// The vendored checker, pinned: pharn-dev/pharn-oss `main` @ 767bf61
// (SKILLS_VERSION 6.22.0), where the file last changed in 8ba9308. A refresh
// changes this line in the same commit as the file.
const PINNED_SHA256 =
  '361bc3ce71d0c0b1e7caf1020ab80e7cc6ba8ee4990eff94de038baeeef82414';

function runChecker(args: string[]): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, [CHECKER, ...args], {
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout };
}

// The checker prints one `RED — <kind> failed: <detail>` line per RED.
// `[\s\S]` because a detail may quote any character but LF.
function checkerReds(stdout: string): string[] {
  return stdout.split('\n').flatMap((line) => {
    const m = /^RED — (\w+) failed: ([\s\S]*)$/.exec(line);
    return m ? [`${m[1]}: ${m[2]}`] : [];
  });
}

// pharn-oss's own root block at the pinned commit.
const UPSTREAM_BLOCK = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    spec: { model: 'opus', effort: 'high' },
    plan: { model: 'opus', effort: 'high' },
    grill: { model: 'opus', effort: 'high' },
    build: { model: 'sonnet', effort: 'high' },
    regress: { model: 'sonnet', effort: 'high' },
    verify: { model: 'sonnet', effort: 'high' },
    ship: { model: 'sonnet', effort: 'high' },
    loop: { model: 'sonnet', effort: 'high' },
    review: { model: 'opus', effort: 'high' },
    'memory-promote': { model: 'opus', effort: 'high' },
    'ac-test': { model: 'opus', effort: 'high' },
  },
};

const D = '"default":{"model":"sonnet","effort":"high"}';
const entry = (model: string, effort = '"high"'): string =>
  `{"model":${model},"effort":${effort}}`;

// [label, the `models` value as JSON text — or null for "no `models` key"].
// JSON TEXT, not objects, so a `__proto__` key is an OWN key exactly as the
// checker's JSON.parse makes it.
const BLOCKS: [string, string | null][] = [
  ['no models key', null],
  ['models: null', 'null'],
  ['models: a number', '5'],
  ['models: a string', '"x"'],
  ['models: an array', '[]'],
  ['models: true', 'true'],
  ['models: {}', '{}'],
  ['stages: null', '{"stages":null}'],
  ['stages: an array', '{"stages":[]}'],
  ['stages: a string', '{"stages":"x"}'],
  ['stages: {}', '{"stages":{}}'],
  ["pharn-oss's own block", JSON.stringify(UPSTREAM_BLOCK)],
  [
    'the default pharn wrote from #57 to 0.6.0',
    '{"default":{"model":"sonnet-5","effort":"high"},"stages":{"plan":{"model":"opus-4-8","effort":"max"},"review":{"model":"opus-4-8","effort":"high"}}}',
  ],
  [
    'the default pharn wrote before #57',
    '{"default":{"model":"sonnet-5","effort":"high"},"stages":{"plan":{"model":"opus-4-8","effort":"max"},"review":{"model":"fable-5","effort":"max"}}}',
  ],
  ['only default', `{"stages":{${D}}}`],
  ['an unknown stage', `{"stages":{${D},"deploy":${entry('"opus"')}}}`],
  [
    'inherited names as stage keys',
    `{"stages":{${D},"constructor":${entry('"opus"')},"toString":${entry('"opus"')},"hasOwnProperty":${entry('"opus"')},"valueOf":${entry('"opus"')},"__proto__":${entry('"opus"')}}}`,
  ],
  ['default is a string', '{"stages":{"default":"sonnet"}}'],
  ['default is null', '{"stages":{"default":null}}'],
  ['default is an array', '{"stages":{"default":[]}}'],
  ['a stage is a number', `{"stages":{${D},"plan":5}}`],
  ['model missing', `{"stages":{${D},"plan":{"effort":"high"}}}`],
  ['effort missing', `{"stages":{${D},"plan":{"model":"opus"}}}`],
  ['both missing', `{"stages":{${D},"plan":{}}}`],
  ...[
    '"opus-4-8"',
    '"gpt-4"',
    '"claude-"',
    '"claude-Opus-4"',
    '"CLAUDE-opus"',
    '"claude-opus-4-8[1m]"',
    '"Opus"',
    '""',
    '5',
    'null',
    '{"x":1}',
    '["opus"]',
  ].map((model): [string, string] => [
    `model ${model}`,
    `{"stages":{${D},"plan":${entry(model)}}}`,
  ]),
  ...[
    '"sonnet"',
    '"opus"',
    '"haiku"',
    '"fable"',
    '"inherit"',
    '"claude-opus-4-8"',
    '"claude-3"',
    '"claude-x-"',
  ].map((model): [string, string] => [
    `model ${model}`,
    `{"stages":{${D},"plan":${entry(model)}}}`,
  ]),
  ...['"extreme"', '""', '"HIGH"', '3', 'null'].map(
    (effort): [string, string] => [
      `effort ${effort}`,
      `{"stages":{${D},"plan":${entry('"opus"', effort)}}}`,
    ],
  ),
  ...['"low"', '"medium"', '"high"', '"xhigh"', '"max"'].map(
    (effort): [string, string] => [
      `effort ${effort}`,
      `{"stages":{${D},"plan":${entry('"opus"', effort)}}}`,
    ],
  ),
  [
    'extra keys inside an entry',
    `{"stages":{${D},"plan":{"model":"opus","effort":"high","note":"x"}}}`,
  ],
  [
    'extra keys beside stages, a top-level default among them',
    `{"note":"x","default":{"model":"gpt-4","effort":"x"},"stages":{${D}}}`,
  ],
  [
    'every RED at once, in order',
    `{"stages":{"deploy":${entry('"opus"')},"plan":${entry('"gpt-4"', '"extreme"')},"review":"x","grill":{}}}`,
  ],
  [
    'control and format characters quoted in details',
    `{"stages":{${D},"pl\\u001ban":${entry('"opus"')},"plan":${entry('"\\u202eopus"', '"hi\\u009bgh"')}}}`,
  ],
];

// Upstream's ROOT config, as `readUpstreamModels` reads it from a clone:
// [label, the file's text — or null for "no file"].
const FILES: [string, string | null][] = [
  ['no file', null],
  ['not JSON', '{"models":'],
  ['JSON null', 'null'],
  ['a JSON array', '[]'],
  ['a JSON string', '"x"'],
  ['a JSON number', '5'],
  ['{}', '{}'],
  ['models: null', '{"models":null}'],
  ['models: {}', '{"models":{}}'],
  ["pharn-oss's own file", JSON.stringify({ models: UPSTREAM_BLOCK })],
  ['a bad block', '{"models":{"stages":{}}}'],
];

describe('the vendored checker is pharn-oss’s, unedited', () => {
  it('matches the pinned sha256', () => {
    expect(sha256File(CHECKER)).toBe(PINNED_SHA256);
  });
});

describe("model-config's sets are the checker's", () => {
  // The checker runs main() at import, so the block of constant declarations
  // is lifted out of its source and evaluated on its own.
  const src = readFileSync(CHECKER, 'utf8');
  const start = src.indexOf('const PRODUCT_STAGES = {');
  const end = src.indexOf('const DEFAULT_CONFIG');
  const upstream = new Function(
    `${src.slice(start, end)}; return { PRODUCT_STAGES, MODEL_ALIASES, MODEL_ID_RE, EFFORT_ENUM };`,
  )() as {
    PRODUCT_STAGES: Record<string, string>;
    MODEL_ALIASES: string[];
    MODEL_ID_RE: RegExp;
    EFFORT_ENUM: string[];
  };

  it('finds the declarations', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('product stages — the keys, in order', () => {
    expect([...PRODUCT_STAGES]).toEqual(Object.keys(upstream.PRODUCT_STAGES));
  });

  it('model aliases', () => {
    expect([...MODEL_ALIASES]).toEqual(upstream.MODEL_ALIASES);
  });

  it('the model id pattern', () => {
    expect(MODEL_ID_RE.source).toBe(upstream.MODEL_ID_RE.source);
    expect(MODEL_ID_RE.flags).toBe(upstream.MODEL_ID_RE.flags);
  });

  it('effort levels', () => {
    expect([...EFFORT_LEVELS]).toEqual(upstream.EFFORT_ENUM);
  });
});

describe('validate: the copy gives the checker’s verdict and RED lines', () => {
  const tmp = useTmpDir();
  const observedKinds = new Set<string>();

  it.each(BLOCKS)('%s', (_label, text) => {
    const file = join(tmp.path(), 'pharn.config.json');
    writeFileSync(file, text === null ? '{}' : `{"models":${text}}`);
    const value: unknown = text === null ? undefined : JSON.parse(text);

    const r = runChecker(['validate', '--config', file]);
    const upstreamReds = checkerReds(r.stdout);
    upstreamReds.forEach((red) => observedKinds.add(red.split(':')[0]!));

    const check = checkModelsBlock(value);
    expect(r.status).toBe(check.kind === 'invalid' ? 1 : 0);
    expect(
      check.kind === 'invalid'
        ? check.reds.map((red) => `${red.kind}: ${red.detail}`)
        : [],
    ).toEqual(upstreamReds);
  });

  it.each(FILES)('reading a clone whose root config is %s', (_label, text) => {
    const repo = join(tmp.path(), 'clone');
    mkdirSync(repo, { recursive: true });
    const file = join(repo, 'pharn.config.json');
    if (text !== null) writeFileSync(file, text);

    const r = runChecker(['validate', '--config', file]);
    checkerReds(r.stdout).forEach((red) =>
      observedKinds.add(red.split(':')[0]!),
    );
    const read = readUpstreamModels(repo);
    // GREEN ⇔ there is nothing to refuse: no block, or a block that passed.
    expect(r.status).toBe(read.kind === 'invalid' ? 1 : 0);
  });

  it('reading a clone whose root config is a directory', () => {
    const repo = join(tmp.path(), 'clone-dir');
    mkdirSync(join(repo, 'pharn.config.json'), { recursive: true });
    const r = runChecker([
      'validate',
      '--config',
      join(repo, 'pharn.config.json'),
    ]);
    checkerReds(r.stdout).forEach((red) =>
      observedKinds.add(red.split(':')[0]!),
    );
    expect(r.status).toBe(1);
    expect(readUpstreamModels(repo).kind).toBe('invalid');
  });

  // The corpus is only as good as its reach. Every RED kind the checker's
  // validate path can emit — read from its own red("…") call sites, minus the
  // two modes this CLI does not copy — must have been produced above.
  it('reached every RED kind the checker validates with', () => {
    const src = readFileSync(CHECKER, 'utf8');
    const kinds = new Set(
      [...src.matchAll(/\bred\(\s*"([a-z]+)"/g)].map((m) => m[1]!),
    );
    kinds.delete('resolve');
    kinds.delete('agreement');
    expect([...kinds].sort()).toEqual(
      [
        'default',
        'effort',
        'entry',
        'input',
        'json',
        'model',
        'shape',
        'stage',
      ].sort(),
    );
    for (const kind of kinds) expect(observedKinds).toContain(kind);
  });
});

describe('resolve: the copy picks what the checker picks', () => {
  const tmp = useTmpDir();
  const partial = `{"stages":{${D},"plan":${entry('"opus"', '"max"')},"review":{"model":"fable","effort":"xhigh","note":"x"}}}`;

  it.each([
    ...PRODUCT_STAGES,
    'default',
    'constructor',
    'toString',
    '__proto__',
    'bogus',
  ])('%s', (stage) => {
    for (const text of [partial, JSON.stringify(UPSTREAM_BLOCK)]) {
      const file = join(tmp.path(), 'pharn.config.json');
      writeFileSync(file, `{"models":${text}}`);
      const r = runChecker(['resolve', stage, '--config', file]);
      expect(r.status).toBe(0);
      const check = checkModelsBlock(JSON.parse(text));
      expect(check.kind).toBe('valid');
      const stages = (check as { stages: ModelsStages }).stages;
      expect(`${JSON.stringify(resolveStageModel(stages, stage))}\n`).toBe(
        r.stdout,
      );
    }
  });
});
