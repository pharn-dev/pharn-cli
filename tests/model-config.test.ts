import { describe, expect, it } from 'vitest';
import {
  checkModelsBlock,
  PRODUCT_STAGES,
  resolveStageModel,
  type ModelsStages,
} from '../src/lib/model-config.js';

// The copy's API. Its RULES are pinned to pharn-oss's checker by
// tests/model-config-parity.test.ts; this file pins the shape callers use.

const valid = (stages: Record<string, unknown>): ModelsStages => {
  const check = checkModelsBlock({ stages });
  if (check.kind !== 'valid') throw new Error(JSON.stringify(check));
  return check.stages;
};

describe('checkModelsBlock', () => {
  it('reads an absent block, and one with no stages, as nothing declared', () => {
    expect(checkModelsBlock(undefined)).toEqual({ kind: 'no-stages' });
    expect(checkModelsBlock(null)).toEqual({ kind: 'no-stages' });
    expect(checkModelsBlock({})).toEqual({ kind: 'no-stages' });
    expect(checkModelsBlock({ stages: null })).toEqual({ kind: 'no-stages' });
  });

  it('returns the stages it passed, by identity', () => {
    const stages = { default: { model: 'sonnet', effort: 'high' } };
    const check = checkModelsBlock({ stages });
    expect(check).toEqual({ kind: 'valid', stages });
    expect((check as { stages: unknown }).stages).toBe(stages);
  });

  it('collects every RED, in order, each with its kind', () => {
    const check = checkModelsBlock({
      stages: {
        deploy: { model: 'opus', effort: 'high' },
        plan: { model: 'opus-4-8', effort: 'max' },
        review: 'x',
      },
    });
    expect(check.kind).toBe('invalid');
    expect(
      (check as { reds: { kind: string }[] }).reds.map((red) => red.kind),
    ).toEqual(['default', 'stage', 'model', 'entry']);
  });

  it('names the product stages in a stage RED', () => {
    const check = checkModelsBlock({
      stages: { default: { model: 'opus', effort: 'low' }, eval: {} },
    });
    expect(check).toEqual({
      kind: 'invalid',
      reds: [
        {
          kind: 'stage',
          detail: `stage "eval" is not a product stage — expected one of {${PRODUCT_STAGES.join(', ')}} or "default"`,
        },
      ],
    });
  });

  it('refuses a shape before it reads any stage', () => {
    expect(checkModelsBlock([])).toEqual({
      kind: 'invalid',
      reds: [
        { kind: 'shape', detail: '`models` is present but is not an object' },
      ],
    });
    expect(checkModelsBlock({ stages: 'x' })).toEqual({
      kind: 'invalid',
      reds: [
        {
          kind: 'shape',
          detail: '`models.stages` is present but is not an object',
        },
      ],
    });
  });
});

describe('resolveStageModel', () => {
  const stages = valid({
    default: { model: 'sonnet', effort: 'high' },
    plan: { model: 'opus', effort: 'max', note: 'kept, ignored' },
  });

  it('picks the stage’s own entry — model and effort only', () => {
    expect(resolveStageModel(stages, 'plan')).toEqual({
      model: 'opus',
      effort: 'max',
    });
  });

  it('falls back to default for a stage without one', () => {
    expect(resolveStageModel(stages, 'review')).toEqual({
      model: 'sonnet',
      effort: 'high',
    });
  });

  it('never resolves through the prototype', () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      expect(resolveStageModel(stages, name)).toEqual({
        model: 'sonnet',
        effort: 'high',
      });
    }
  });
});
