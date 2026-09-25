import { describe, expect, it } from 'vitest';
import { modelsRecordHash } from '../src/lib/install-records.js';
import { checkModelsBlock } from '../src/lib/model-config.js';
import {
  convertLegacyModels,
  decideModelsUpdate,
  isLegacyDefault,
  modelsMigrationPending,
  needsModelsConversion,
} from '../src/lib/models-update.js';
import type { UpstreamModels } from '../src/lib/upstream-models.js';

// The two defaults earlier pharns wrote, exactly as they wrote them.
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

describe('isLegacyDefault', () => {
  it('knows both defaults earlier pharns wrote', () => {
    expect(isLegacyDefault(DEFAULT_057)).toBe(true);
    expect(isLegacyDefault(DEFAULT_024)).toBe(true);
  });

  it('compares the block as pharn serializes it: indentation is not an edit', () => {
    const reread: unknown = JSON.parse(JSON.stringify(DEFAULT_057, null, 4));
    expect(isLegacyDefault(reread)).toBe(true);
  });

  it('reads a reordered or changed default as edited', () => {
    expect(
      isLegacyDefault({
        stages: DEFAULT_057.stages,
        default: DEFAULT_057.default,
      }),
    ).toBe(false);
    expect(
      isLegacyDefault({
        ...DEFAULT_057,
        default: { model: 'sonnet-5', effort: 'low' },
      }),
    ).toBe(false);
    expect(isLegacyDefault(undefined)).toBe(false);
    expect(isLegacyDefault(UPSTREAM)).toBe(false);
  });
});

describe('convertLegacyModels', () => {
  it('converts the old format: default moves into stages, ids become aliases', () => {
    const edited = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: {
        review: { model: 'fable-5', effort: 'max', note: 'mine' },
        build: { model: 'claude-sonnet-5', effort: 'high' },
      },
    };
    const out = convertLegacyModels(edited);
    expect(out.block).toEqual({
      stages: {
        default: { model: 'haiku', effort: 'low' },
        review: { model: 'fable', effort: 'max', note: 'mine' },
        build: { model: 'claude-sonnet-5', effort: 'high' },
      },
    });
    // `default` comes first, as pharn-oss writes it.
    expect(Object.keys((out.block as { stages: object }).stages)[0]).toBe(
      'default',
    );
    expect(out.changes).toEqual([
      'moved `models.default` into `models.stages.default`',
      'stage "default" model "haiku-4-5" → "haiku"',
      'stage "review" model "fable-5" → "fable"',
    ]);
    expect(out.leftovers).toEqual([]);
    // The result is a block pharn-oss's rules accept.
    expect(checkModelsBlock(out.block).kind).toBe('valid');
    // The input is not mutated.
    expect(edited.default.model).toBe('haiku-4-5');
  });

  it('maps all four ids the old CLI knew', () => {
    const out = convertLegacyModels({
      stages: {
        default: { model: 'sonnet-5', effort: 'high' },
        plan: { model: 'opus-4-8', effort: 'high' },
        review: { model: 'fable-5', effort: 'high' },
        build: { model: 'haiku-4-5', effort: 'high' },
      },
    });
    expect(out.block).toEqual({
      stages: {
        default: { model: 'sonnet', effort: 'high' },
        plan: { model: 'opus', effort: 'high' },
        review: { model: 'fable', effort: 'high' },
        build: { model: 'haiku', effort: 'high' },
      },
    });
  });

  it('creates stages for a default with none, or with a null one', () => {
    for (const block of [
      { default: { model: 'sonnet-5', effort: 'high' } },
      { default: { model: 'sonnet-5', effort: 'high' }, stages: null },
    ]) {
      expect(convertLegacyModels(block).block).toEqual({
        stages: { default: { model: 'sonnet', effort: 'high' } },
      });
    }
  });

  it('leaves a default that cannot move where it is, and names it', () => {
    const taken = convertLegacyModels({
      default: { model: 'opus-4-8', effort: 'max' },
      stages: { default: { model: 'sonnet-5', effort: 'high' } },
    });
    expect(taken.block).toEqual({
      default: { model: 'opus-4-8', effort: 'max' },
      stages: { default: { model: 'sonnet', effort: 'high' } },
    });
    expect(taken.leftovers).toEqual([
      '`models.default` was left where it is: `models.stages.default` is already set, and pharn-oss reads only that one',
    ]);

    const notAnObject = convertLegacyModels({
      default: { model: 'opus-4-8', effort: 'max' },
      stages: ['x'],
    });
    expect(notAnObject.block).toEqual({
      default: { model: 'opus-4-8', effort: 'max' },
      stages: ['x'],
    });
    expect(notAnObject.changes).toEqual([]);
    expect(notAnObject.leftovers).toEqual([
      '`models.default` was left where it is: `models.stages` is not an object, so it cannot move into it',
    ]);
  });

  it('copies what has no mapping verbatim — never guesses', () => {
    const out = convertLegacyModels({
      default: { model: 'gpt-4', effort: 'extreme' },
      stages: { deploy: { model: 'opus-4-8', effort: 'high' }, plan: 'x' },
    });
    expect(out.block).toEqual({
      stages: {
        default: { model: 'gpt-4', effort: 'extreme' },
        deploy: { model: 'opus', effort: 'high' },
        plan: 'x',
      },
    });
  });

  it('returns a block with nothing to convert unchanged — the same object', () => {
    for (const block of [UPSTREAM, EDITED, null, 5, 'x', [], undefined]) {
      const out = convertLegacyModels(block);
      expect(out.block).toBe(block);
      expect(out.changes).toEqual([]);
    }
  });

  it('keeps a `__proto__` stage key as data', () => {
    const block: unknown = JSON.parse(
      '{"default":{"model":"opus-4-8","effort":"max"},"stages":{"__proto__":{"model":"sonnet-5","effort":"high"}}}',
    );
    const out = convertLegacyModels(block);
    const stages = (out.block as { stages: object }).stages;
    expect(Object.getPrototypeOf(stages)).toBe(Object.prototype);
    expect(Object.hasOwn(stages, '__proto__')).toBe(true);
    expect(Object.keys(stages)).toEqual(['default', '__proto__']);
  });
});

describe('modelsMigrationPending — what re-opens update’s early return', () => {
  it('is pending while the block needs converting', () => {
    expect(modelsMigrationPending(DEFAULT_057, null)).toBe(true);
    expect(
      modelsMigrationPending(DEFAULT_057, modelsRecordHash(UPSTREAM)),
    ).toBe(true);
    expect(modelsMigrationPending(UPSTREAM, null)).toBe(false);
    expect(modelsMigrationPending(undefined, null)).toBe(false);
  });

  // Review finding (REVIEW.md, P5): a block pharn recorded writing can only be
  // pharn-oss's own, which update never converts — so it must not hold the
  // gate open, or a convertible upstream block would re-open it forever.
  it('is not pending for the block pharn recorded writing', () => {
    const upstreamShaped = { default: { model: 'sonnet', effort: 'high' } };
    expect(needsModelsConversion(upstreamShaped)).toBe(true);
    expect(
      modelsMigrationPending(upstreamShaped, modelsRecordHash(upstreamShaped)),
    ).toBe(false);
  });
});

describe('needsModelsConversion', () => {
  it('is true while something would convert, false once nothing would', () => {
    expect(needsModelsConversion(DEFAULT_057)).toBe(true);
    expect(
      needsModelsConversion({ stages: { plan: { model: 'opus-4-8' } } }),
    ).toBe(true);
    const converted = convertLegacyModels(DEFAULT_057).block;
    expect(needsModelsConversion(converted)).toBe(false);
    expect(needsModelsConversion(UPSTREAM)).toBe(false);
    expect(needsModelsConversion(undefined)).toBe(false);
  });

  it('does not hold the gate open for a default that cannot move', () => {
    expect(
      needsModelsConversion({
        default: { model: 'haiku', effort: 'low' },
        stages: { default: { model: 'sonnet', effort: 'high' } },
      }),
    ).toBe(false);
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
      expect(
        decide({ current, recorded: null, recordsAvailable: false }),
      ).toMatchObject({
        outcome: 'updated',
        replacedLegacyDefault: true,
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
      replacedLegacyDefault: false,
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
        conversion: null,
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
    expect(decide({ current: DEFAULT_057, force: true })).toMatchObject({
      outcome: 'updated',
      backup: false,
    });
  });

  it('a kept block in the old format is CONVERTED, not reset', () => {
    const edited = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: { review: { model: 'fable-5', effort: 'max' } },
    };
    const out = decide({ current: edited });
    expect(out.outcome).toBe('kept');
    expect(out.next).toEqual({
      stages: {
        default: { model: 'haiku', effort: 'low' },
        review: { model: 'fable', effort: 'max' },
      },
    });
    expect(out.conversion?.changes).toHaveLength(3);
    expect(out.problems).toEqual([]);
    expect(out.nextRecord).toBeNull();
  });

  it('what cannot be converted is left as is, and named', () => {
    const out = decide({
      current: {
        default: { model: 'gpt-4', effort: 'high' },
        stages: { plan: { model: 'opus-4-8', effort: 'max' } },
      },
    });
    expect(out.next).toEqual({
      stages: {
        default: { model: 'gpt-4', effort: 'high' },
        plan: { model: 'opus', effort: 'max' },
      },
    });
    expect(out.problems).toEqual([
      'stage "default" model "gpt-4" is not an alias {sonnet, opus, haiku, fable, inherit} nor a claude-* id',
    ]);
  });

  it('names a default that could not move, before the checker’s REDs', () => {
    const out = decide({
      current: {
        default: { model: 'opus-4-8', effort: 'max' },
        stages: { default: { model: 'sonnet', effort: 'high' }, x: {} },
      },
    });
    expect(out.problems[0]).toMatch(/^`models.default` was left where it is/);
    expect(out.problems[1]).toMatch(/^stage "x" is not a product stage/);
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
      conversion: null,
    });
    // Not pharn's (it matches no record and no old default): converted, and
    // its record — none of its own — is carried.
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
    expect(out.next).toEqual({
      stages: {
        default: { model: 'haiku', effort: 'low' },
        review: { model: 'fable', effort: 'max' },
      },
    });
    expect(out.nextRecord).toBe(recorded);
  });

  // Review finding (REVIEW.md, P5): converting an old default must not erase
  // the evidence that pharn wrote it — or once pharn-oss's block is usable
  // again, the converted default would be kept as the user's forever.
  it('a block that was pharn’s stays pharn’s across the conversion', () => {
    const unusable: UpstreamModels[] = [
      { kind: 'absent' },
      { kind: 'invalid', reasons: ['x'] },
    ];
    for (const upstream of unusable) {
      const out = decide({ current: DEFAULT_057, upstream, recorded: null });
      const converted = {
        stages: {
          default: { model: 'sonnet', effort: 'high' },
          plan: { model: 'opus', effort: 'max' },
          review: { model: 'opus', effort: 'high' },
        },
      };
      expect(out.next).toEqual(converted);
      expect(out.nextRecord).toBe(modelsRecordHash(converted));
      // …so the next run, with pharn-oss's block back, replaces it.
      expect(
        decide({ current: out.next, recorded: out.nextRecord }),
      ).toMatchObject({ outcome: 'updated', next: UPSTREAM });
    }
    // A block pharn recorded writing keeps its record unchanged.
    const recorded = modelsRecordHash(UPSTREAM);
    expect(
      decide({
        current: structuredClone(UPSTREAM),
        upstream: { kind: 'absent' },
        recorded,
      }).nextRecord,
    ).toBe(recorded);
  });

  it('a block upstream this pharn will not apply: named, and yours stays', () => {
    const out = decide({
      current: EDITED,
      upstream: {
        kind: 'invalid',
        reasons: ['stage "triage" is not a product stage'],
      },
      force: true,
    });
    expect(out).toMatchObject({
      outcome: 'upstream-invalid',
      next: EDITED,
      backup: false,
      upstreamReasons: ['stage "triage" is not a product stage'],
    });
  });
});
