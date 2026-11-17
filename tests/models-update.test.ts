import { describe, expect, it } from 'vitest';
import { modelsRecordHash } from '../src/lib/install-records.js';
import { checkModelsBlock } from '../src/lib/model-config.js';
import * as modelsUpdate from '../src/lib/models-update.js';
import { decideModelsUpdate } from '../src/lib/models-update.js';
import type { UpstreamModels } from '../src/lib/upstream-models.js';

// The two defaults earlier pharns wrote, exactly as they wrote them. Since
// CORE-188 (0.19.x was the last CLI that converted one) they are blocks like
// any other: pharn's only when their record says so, and otherwise blocks
// pharn-oss's rules reject, kept as the user's.
const DEFAULT_057 = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' },
    review: { model: 'opus-4-8', effort: 'high' },
  },
};
const DEFAULT_024 = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' },
    review: { model: 'fable-5', effort: 'max' },
  },
};

// The checker's REDs for a model id it does not accept.
const badModel = (stage: string, model: string): string =>
  `stage "${stage}" model "${model}" is not an alias {sonnet, opus, haiku, fable, inherit} nor a claude-* id`;
const NO_DEFAULT_STAGE =
  'missing required `default` stage entry (the resolution fallback)';

// Stands in for pharn-oss's block.
const UPSTREAM = {
  stages: {
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'high' },
    review: { model: 'opus', effort: 'high' },
  },
};
const OK: UpstreamModels = { kind: 'ok', block: UPSTREAM };
const LATEST = modelsRecordHash(UPSTREAM);

// A block the user changed, already in pharn-oss's format.
const EDITED = {
  stages: {
    default: { model: 'haiku', effort: 'low' },
    review: { model: 'fable', effort: 'max' },
  },
};

const decide = (
  over: Partial<Parameters<typeof decideModelsUpdate>[0]>,
): ReturnType<typeof decideModelsUpdate> =>
  decideModelsUpdate({
    current: undefined,
    upstream: OK,
    recorded: null,
    recordsAvailable: true,
    force: false,
    ...over,
  });

// `isLegacyDefault` is gone: an old default is no longer proof of authorship
// on its own. Only its record is.
describe('isLegacyDefault', () => {
  it('knows both defaults earlier pharns wrote', () => {
    expect(Object.keys(modelsUpdate)).not.toContain('isLegacyDefault');
    for (const current of [DEFAULT_057, DEFAULT_024]) {
      // No record: the user's, kept verbatim, its REDs named.
      const unrecorded = decide({ current });
      expect(unrecorded).toMatchObject({
        outcome: 'kept',
        label: 'unrecorded',
        backup: false,
        nextRecord: null,
      });
      expect(unrecorded.next).toBe(current);
      expect(unrecorded.problems[0]).toBe(NO_DEFAULT_STAGE);
      expect(unrecorded.problems).toContain(badModel('plan', 'opus-4-8'));
      // No usable records at all: unverifiable, kept too.
      expect(decide({ current, recordsAvailable: false }).label).toBe(
        'unverifiable',
      );
    }
  });

  it('compares the block as pharn serializes it: indentation is not an edit', () => {
    const reread: unknown = JSON.parse(JSON.stringify(DEFAULT_057, null, 4));
    expect(
      decide({ current: reread, recorded: modelsRecordHash(DEFAULT_057) }),
    ).toMatchObject({ outcome: 'updated', next: UPSTREAM, nextRecord: LATEST });
  });

  it('reads a reordered or changed default as edited', () => {
    const recorded = modelsRecordHash(DEFAULT_057);
    const reordered = {
      stages: DEFAULT_057.stages,
      default: DEFAULT_057.default,
    };
    const changed = {
      ...DEFAULT_057,
      default: { model: 'sonnet-5', effort: 'low' },
    };
    for (const current of [reordered, changed]) {
      expect(decide({ current, recorded })).toMatchObject({
        outcome: 'kept',
        label: 'modified',
        nextRecord: recorded,
      });
    }
  });
});

// `convertLegacyModels` is gone: a kept block in the old format is never
// rewritten. What pharn-oss's rules reject in it is named instead.
describe('convertLegacyModels', () => {
  it('converts the old format: default moves into stages, ids become aliases', () => {
    expect(Object.keys(modelsUpdate)).not.toContain('convertLegacyModels');
    const edited = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: {
        review: { model: 'fable-5', effort: 'max', note: 'mine' },
        build: { model: 'claude-sonnet-5', effort: 'high' },
      },
    };
    const out = decide({ current: edited });
    // Nothing moves and no id is mapped: the block is kept as it is.
    expect(out.outcome).toBe('kept');
    expect(out.next).toBe(edited);
    expect(out.next).toEqual({
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: {
        review: { model: 'fable-5', effort: 'max', note: 'mine' },
        build: { model: 'claude-sonnet-5', effort: 'high' },
      },
    });
    expect(out.problems).toEqual([
      NO_DEFAULT_STAGE,
      badModel('review', 'fable-5'),
    ]);
    expect(checkModelsBlock(out.next).kind).toBe('invalid');
  });

  it('maps all four ids the old CLI knew', () => {
    const out = decide({
      current: {
        stages: {
          default: { model: 'sonnet-5', effort: 'high' },
          plan: { model: 'opus-4-8', effort: 'high' },
          review: { model: 'fable-5', effort: 'high' },
          build: { model: 'haiku-4-5', effort: 'high' },
        },
      },
    });
    // Each of the four is now a RED of its own, left for the user to replace.
    expect(out.problems).toEqual([
      badModel('default', 'sonnet-5'),
      badModel('plan', 'opus-4-8'),
      badModel('review', 'fable-5'),
      badModel('build', 'haiku-4-5'),
    ]);
  });

  it('creates stages for a default with none, or with a null one', () => {
    for (const block of [
      { default: { model: 'sonnet-5', effort: 'high' } },
      { default: { model: 'sonnet-5', effort: 'high' }, stages: null },
    ]) {
      // No stages are created: pharn-oss reads the block as declaring none.
      const out = decide({ current: block });
      expect(out.next).toBe(block);
      expect(checkModelsBlock(out.next).kind).toBe('no-stages');
      expect(out.problems).toEqual([]);
    }
  });

  it('leaves a default that cannot move where it is, and names it', () => {
    const taken = {
      default: { model: 'opus-4-8', effort: 'max' },
      stages: { default: { model: 'sonnet', effort: 'high' } },
    };
    // pharn-oss reads only `stages.default`: the top-level one stays, and the
    // block passes its rules.
    const out = decide({ current: taken });
    expect(out.next).toBe(taken);
    expect(out.problems).toEqual([]);

    const notAnObject = {
      default: { model: 'opus-4-8', effort: 'max' },
      stages: ['x'],
    };
    expect(decide({ current: notAnObject }).problems).toEqual([
      '`models.stages` is present but is not an object',
    ]);
  });

  it('copies what has no mapping verbatim — never guesses', () => {
    const block = {
      default: { model: 'gpt-4', effort: 'extreme' },
      stages: { deploy: { model: 'opus-4-8', effort: 'high' }, plan: 'x' },
    };
    const out = decide({ current: block });
    expect(out.next).toEqual({
      default: { model: 'gpt-4', effort: 'extreme' },
      stages: { deploy: { model: 'opus-4-8', effort: 'high' }, plan: 'x' },
    });
    expect(out.problems).toHaveLength(3);
  });

  it('returns a block with nothing to convert unchanged — the same object', () => {
    for (const block of [EDITED, null, 5, 'x', []]) {
      expect(decide({ current: block }).next).toBe(block);
    }
    expect(decide({ current: undefined }).next).toBe(UPSTREAM);
  });

  it('keeps a `__proto__` stage key as data', () => {
    const block: unknown = JSON.parse(
      '{"default":{"model":"opus-4-8","effort":"max"},"stages":{"__proto__":{"model":"sonnet-5","effort":"high"}}}',
    );
    const out = decide({ current: block });
    expect(out.next).toBe(block);
    const stages = (out.next as { stages: object }).stages;
    expect(Object.getPrototypeOf(stages)).toBe(Object.prototype);
    expect(Object.hasOwn(stages, '__proto__')).toBe(true);
    expect(out.problems[0]).toBe(NO_DEFAULT_STAGE);
    expect(out.problems[1]).toMatch(
      /^stage "__proto__" is not a product stage/,
    );
  });
});

// `needsModelsConversion` is gone, and with it every signal that held a run
// open for a conversion: the decision carries no conversion at all.
describe('needsModelsConversion', () => {
  it('is true while something would convert, false once nothing would', () => {
    expect(Object.keys(modelsUpdate)).not.toContain('needsModelsConversion');
    for (const current of [DEFAULT_057, UPSTREAM, undefined]) {
      const out = decide({ current });
      expect(out).not.toHaveProperty('conversion');
      expect(out).not.toHaveProperty('replacedLegacyDefault');
    }
  });

  it('does not hold the gate open for a default that cannot move', () => {
    const block = {
      default: { model: 'haiku', effort: 'low' },
      stages: { default: { model: 'sonnet', effort: 'high' } },
    };
    // Recorded as pharn's: a plain row-3 update, nothing else.
    expect(
      decide({ current: block, recorded: modelsRecordHash(block) }),
    ).toMatchObject({ outcome: 'updated', next: UPSTREAM, problems: [] });
  });
});

describe('decideModelsUpdate — the per-file rows, over the block', () => {
  it('row 1: no block → pharn-oss’s is written (restored)', () => {
    expect(decide({ current: undefined })).toMatchObject({
      outcome: 'restored',
      next: UPSTREAM,
      nextRecord: LATEST,
      backup: false,
    });
  });

  it('row 2: already pharn-oss’s → nothing to do, record refreshed', () => {
    expect(decide({ current: structuredClone(UPSTREAM) })).toMatchObject({
      outcome: 'ok',
      next: UPSTREAM,
      nextRecord: LATEST,
    });
  });

  it('row 3: a default an earlier pharn wrote → replaced, with no records at all', () => {
    for (const current of [DEFAULT_057, DEFAULT_024]) {
      // Without records an old default is no longer proof enough: kept.
      expect(
        decide({ current, recorded: null, recordsAvailable: false }),
      ).toMatchObject({
        outcome: 'kept',
        label: 'unverifiable',
        next: current,
        nextRecord: null,
        backup: false,
      });
      // Its record still proves it pharn's: replaced.
      expect(
        decide({ current, recorded: modelsRecordHash(current) }),
      ).toMatchObject({
        outcome: 'updated',
        next: UPSTREAM,
        nextRecord: LATEST,
        backup: false,
      });
    }
  });

  it('row 3: still the block pharn recorded writing → replaced', () => {
    const previous = { stages: { default: { model: 'opus', effort: 'low' } } };
    expect(
      decide({ current: previous, recorded: modelsRecordHash(previous) }),
    ).toMatchObject({
      outcome: 'updated',
      label: null,
      next: UPSTREAM,
      nextRecord: LATEST,
    });
  });

  const STALE = modelsRecordHash({ stages: {} });
  it.each([
    ['modified', { recorded: STALE }, STALE],
    ['unrecorded', { recorded: null }, null],
    ['unverifiable', { recordsAvailable: false }, null],
  ] as const)(
    'rows 4-6: %s → the user’s block is KEPT',
    (label, over, carried) => {
      const out = decide({ current: EDITED, ...over });
      expect(out).toMatchObject({
        outcome: 'kept',
        label,
        next: EDITED,
        backup: false,
        problems: [],
      });
      // The previous record is carried forward, never a fresh one.
      expect(out.nextRecord).toBe(carried);
    },
  );

  it('--force: the user’s block is replaced, after a backup', () => {
    expect(
      decide({
        current: EDITED,
        recorded: modelsRecordHash({ stages: {} }),
        force: true,
      }),
    ).toMatchObject({
      outcome: 'forced',
      label: 'modified',
      next: UPSTREAM,
      nextRecord: LATEST,
      backup: true,
    });
  });

  it('--force over an old default is a plain update — nothing to back up', () => {
    // Recorded as pharn's: a plain update.
    expect(
      decide({
        current: DEFAULT_057,
        recorded: modelsRecordHash(DEFAULT_057),
        force: true,
      }),
    ).toMatchObject({ outcome: 'updated', backup: false });
    // Unrecorded, it is the user's: forced, after a backup.
    expect(decide({ current: DEFAULT_057, force: true })).toMatchObject({
      outcome: 'forced',
      label: 'unrecorded',
      next: UPSTREAM,
      backup: true,
    });
  });

  it('a kept block in the old format is CONVERTED, not reset', () => {
    const edited = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: { review: { model: 'fable-5', effort: 'max' } },
    };
    const out = decide({ current: edited });
    expect(out.outcome).toBe('kept');
    // Not reset, and no longer converted: kept exactly as it is.
    expect(out.next).toBe(edited);
    expect(out.problems).toEqual([
      NO_DEFAULT_STAGE,
      badModel('review', 'fable-5'),
    ]);
    expect(out.nextRecord).toBeNull();
  });

  it('what cannot be converted is left as is, and named', () => {
    const current = {
      default: { model: 'gpt-4', effort: 'high' },
      stages: { plan: { model: 'opus-4-8', effort: 'max' } },
    };
    const out = decide({ current });
    expect(out.next).toEqual({
      default: { model: 'gpt-4', effort: 'high' },
      stages: { plan: { model: 'opus-4-8', effort: 'max' } },
    });
    expect(out.problems).toEqual([
      NO_DEFAULT_STAGE,
      badModel('plan', 'opus-4-8'),
    ]);
  });

  it('names a default that could not move, before the checker’s REDs', () => {
    const out = decide({
      current: {
        default: { model: 'opus-4-8', effort: 'max' },
        stages: { default: { model: 'sonnet', effort: 'high' }, x: {} },
      },
    });
    // Only the checker's REDs now: a top-level `default` is not one.
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(/^stage "x" is not a product stage/);
  });

  it('keeps an explicit null as the user’s choice', () => {
    expect(decide({ current: null })).toMatchObject({
      outcome: 'kept',
      label: 'unrecorded',
      next: null,
      problems: [],
    });
  });

  it('no block upstream: the user’s block stays, converted if old', () => {
    const recorded = modelsRecordHash({ stages: {} });
    expect(
      decide({ current: undefined, upstream: { kind: 'absent' }, recorded }),
    ).toMatchObject({
      outcome: 'upstream-absent',
      next: undefined,
      nextRecord: recorded,
      problems: [],
    });
    // An old-format block stays verbatim, its REDs named, its record carried.
    const edited = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: { review: { model: 'fable-5', effort: 'max' } },
    };
    const out = decide({
      current: edited,
      upstream: { kind: 'absent' },
      recorded,
    });
    expect(out.outcome).toBe('upstream-absent');
    expect(out.next).toBe(edited);
    expect(out.problems).toEqual([
      NO_DEFAULT_STAGE,
      badModel('review', 'fable-5'),
    ]);
    expect(out.nextRecord).toBe(recorded);
  });

  // A block that was pharn's must stay pharn's while pharn-oss's block is
  // unusable — or once it is usable again, the block would be kept as the
  // user's forever.
  it('a block that was pharn’s stays pharn’s across the conversion', () => {
    const unusable: UpstreamModels[] = [
      { kind: 'absent' },
      { kind: 'invalid', reasons: ['x'] },
    ];
    const recorded = modelsRecordHash(DEFAULT_057);
    for (const upstream of unusable) {
      const out = decide({ current: DEFAULT_057, upstream, recorded });
      expect(out.next).toBe(DEFAULT_057);
      expect(out.nextRecord).toBe(recorded);
      // …so the next run, with pharn-oss's block back, replaces it.
      expect(
        decide({ current: out.next, recorded: out.nextRecord }),
      ).toMatchObject({ outcome: 'updated', next: UPSTREAM });
    }
    // A block pharn recorded writing keeps its record unchanged.
    const upstreamRecord = modelsRecordHash(UPSTREAM);
    expect(
      decide({
        current: structuredClone(UPSTREAM),
        upstream: { kind: 'absent' },
        recorded: upstreamRecord,
      }).nextRecord,
    ).toBe(upstreamRecord);
  });

  it('a block upstream this pharn will not apply: named, and yours stays', () => {
    const out = decide({
      current: EDITED,
      upstream: {
        kind: 'invalid',
        reasons: ['stage "deploy" is not a product stage'],
      },
      force: true,
    });
    expect(out).toMatchObject({
      outcome: 'upstream-invalid',
      next: EDITED,
      backup: false,
      upstreamReasons: ['stage "deploy" is not a product stage'],
    });
  });
});
