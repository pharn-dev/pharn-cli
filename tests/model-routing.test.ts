import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ROUTING,
  EFFORT_LEVELS,
  MODEL_IDS,
  ModelRoutingError,
  PIPELINE_STAGES,
  resolveStageModel,
  validateModelRouting,
} from '../src/lib/model-routing.js';
import type { ModelRouting } from '../src/types.js';

// A minimal valid routing used as a base for the resolver + accept cases.
const valid: ModelRouting = {
  default: { model: 'sonnet-5', effort: 'high' },
  stages: {
    plan: { model: 'opus-4-8', effort: 'max' },
    review: { model: 'fable-5', effort: 'max' },
  },
};

describe('validateModelRouting', () => {
  it('accepts a valid routing (default + stages) and returns it typed', () => {
    expect(validateModelRouting(valid)).toEqual(valid);
  });

  it('accepts a routing with stages omitted (default only)', () => {
    expect(
      validateModelRouting({ default: { model: 'haiku-4-5', effort: 'low' } }),
    ).toEqual({
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: {},
    });
  });

  it('accepts an empty stages object', () => {
    const out = validateModelRouting({
      default: { model: 'fable-5', effort: 'max' },
      stages: {},
    });
    expect(out.stages).toEqual({});
  });

  it('rejects an invalid model string, naming the value', () => {
    expect(() =>
      validateModelRouting({ default: { model: 'gpt-4', effort: 'high' } }),
    ).toThrow(ModelRoutingError);
    expect(() =>
      validateModelRouting({ default: { model: 'gpt-4', effort: 'high' } }),
    ).toThrow(/gpt-4/);
  });

  it('rejects an invalid effort — "medium" is not in {low, high, max}', () => {
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'medium' },
      }),
    ).toThrow(/medium/);
  });

  it('rejects an unknown stage key, naming it', () => {
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'high' },
        stages: { deploy: { model: 'sonnet-5', effort: 'low' } },
      }),
    ).toThrow(/deploy/);
  });

  it('rejects a wrong-type (non-string) model or effort — the typeof guard', () => {
    expect(() =>
      validateModelRouting({ default: { model: 123, effort: 'high' } }),
    ).toThrow(ModelRoutingError);
    expect(() =>
      validateModelRouting({ default: { model: 'sonnet-5', effort: null } }),
    ).toThrow(ModelRoutingError);
  });

  it('rejects a missing or non-object default (fail-closed)', () => {
    expect(() => validateModelRouting({})).toThrow(ModelRoutingError);
    expect(() => validateModelRouting({ default: 'sonnet-5' })).toThrow(
      ModelRoutingError,
    );
    expect(() => validateModelRouting(null)).toThrow(ModelRoutingError);
    expect(() => validateModelRouting('nope')).toThrow(ModelRoutingError);
  });

  it('rejects a non-object stages', () => {
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'high' },
        stages: ['plan'],
      }),
    ).toThrow(ModelRoutingError);
  });

  it('accepts every model id × effort level in the allowlists', () => {
    for (const model of MODEL_IDS) {
      for (const effort of EFFORT_LEVELS) {
        expect(() =>
          validateModelRouting({ default: { model, effort } }),
        ).not.toThrow();
      }
    }
  });

  it('accepts every known pipeline stage as a stages key', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(() =>
        validateModelRouting({
          default: { model: 'sonnet-5', effort: 'high' },
          stages: { [stage]: { model: 'sonnet-5', effort: 'low' } },
        }),
      ).not.toThrow();
    }
  });

  it('rejects an unknown sibling key (a typo\'d "stgaes"), naming it (BUG 2)', () => {
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'high' },
        stgaes: { build: { model: 'sonnet-5', effort: 'low' } },
      }),
    ).toThrow(/stgaes/);
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'high' },
        stgaes: {},
      }),
    ).toThrow(ModelRoutingError);
  });

  it('rejects an unknown key inside a stage entry (StageModel), naming it (BUG 2)', () => {
    expect(() =>
      validateModelRouting({
        default: { model: 'sonnet-5', effort: 'high', modol: 'x' },
      }),
    ).toThrow(/modol/);
  });
});

describe('DEFAULT_MODEL_ROUTING', () => {
  it('is itself valid (passes validateModelRouting)', () => {
    expect(() => validateModelRouting(DEFAULT_MODEL_ROUTING)).not.toThrow();
  });

  it('uses only known stage keys and model ids', () => {
    for (const stage of Object.keys(DEFAULT_MODEL_ROUTING.stages)) {
      expect(PIPELINE_STAGES).toContain(stage);
    }
    const models: string[] = [DEFAULT_MODEL_ROUTING.default.model];
    for (const entry of Object.values(DEFAULT_MODEL_ROUTING.stages)) {
      if (entry) models.push(entry.model);
    }
    for (const model of models) expect(MODEL_IDS).toContain(model);
  });
});

describe('resolveStageModel', () => {
  it('returns the stage entry when one exists', () => {
    expect(resolveStageModel(valid, 'plan')).toEqual({
      model: 'opus-4-8',
      effort: 'max',
    });
    expect(resolveStageModel(valid, 'review')).toEqual({
      model: 'fable-5',
      effort: 'max',
    });
  });

  it('falls back to default for a stage without an entry', () => {
    expect(resolveStageModel(valid, 'build')).toEqual(valid.default);
    expect(resolveStageModel(valid, 'verify')).toEqual(valid.default);
  });

  it('routes every stage to default when stages is empty (one-model config)', () => {
    const oneModel: ModelRouting = {
      default: { model: 'fable-5', effort: 'high' },
      stages: {},
    };
    for (const stage of PIPELINE_STAGES) {
      expect(resolveStageModel(oneModel, stage)).toEqual({
        model: 'fable-5',
        effort: 'high',
      });
    }
  });

  it('falls back to default when stages is absent (unvalidated routing)', () => {
    const noStages = {
      default: { model: 'sonnet-5', effort: 'high' },
    } as unknown as ModelRouting;
    expect(resolveStageModel(noStages, 'plan')).toEqual({
      model: 'sonnet-5',
      effort: 'high',
    });
  });
});
