import { describe, expect, it } from 'vitest';
import {
  checkModelsBlock,
  type ModelsStages,
} from '../src/lib/model-config.js';
import {
  modelsCheckerCommand,
  modelsLabelLines,
  resolvedStageLines,
} from '../src/lib/model-config-format.js';

const stagesOf = (stages: Record<string, unknown>): ModelsStages => {
  const check = checkModelsBlock({ stages });
  if (check.kind !== 'valid') throw new Error(JSON.stringify(check));
  return check.stages;
};

describe('resolvedStageLines', () => {
  it('shows every product stage, resolved, after default — aligned', () => {
    const lines = resolvedStageLines(
      stagesOf({
        default: { model: 'sonnet', effort: 'high' },
        plan: { model: 'opus', effort: 'max' },
        review: { model: 'claude-opus-4-8', effort: 'xhigh' },
      }),
    );
    expect(lines).toEqual([
      'default          sonnet · high',
      'spec             sonnet · high  (default)',
      'plan             opus · max',
      'grill            sonnet · high  (default)',
      'build            sonnet · high  (default)',
      'regress          sonnet · high  (default)',
      'verify           sonnet · high  (default)',
      'ship             sonnet · high  (default)',
      'loop             sonnet · high  (default)',
      'review           claude-opus-4-8 · xhigh',
      'memory-promote   sonnet · high  (default)',
      'ac-test          sonnet · high  (default)',
    ]);
  });

  it('marks nothing when every stage has its own entry', () => {
    const own = Object.fromEntries(
      [
        'default',
        'spec',
        'plan',
        'grill',
        'build',
        'regress',
        'verify',
        'ship',
        'loop',
        'review',
        'memory-promote',
        'ac-test',
      ].map((stage) => [stage, { model: 'opus', effort: 'high' }]),
    );
    expect(
      resolvedStageLines(stagesOf(own)).some((l) => l.includes('(default)')),
    ).toBe(false);
  });
});

describe('the label', () => {
  const lines = modelsLabelLines('pharn/floor');
  const text = lines.join(' ');

  it('names what reads the block: orchestrated routing, the model only', () => {
    expect(text).toContain('/pharn-ship and /pharn-loop read this block');
    expect(text).toContain('pick the model they request');
    expect(text).toContain('Effort is never routed');
    expect(text).toContain("a stage that runs inline uses the session's model");
  });

  it('names what does not: a direct run uses its own frontmatter, and nothing runs the check', () => {
    expect(text).toContain(
      "A stage you run directly uses its command's own model:/effort: frontmatter",
    );
    expect(text).toContain('which this block is held to');
    expect(text).toContain('Nothing runs that check automatically');
    expect(lines.at(-1)).toBe(
      'node pharn/floor/check-model-config.mjs agreement',
    );
  });

  it('no longer claims the block is never routing', () => {
    expect(text).not.toContain('not this block');
    expect(text).not.toMatch(/nothing reads this block/i);
  });

  it('claims nothing about what a stage ran on', () => {
    expect(text).not.toMatch(/\bran\b|guarantee|ensure/i);
  });

  it('keeps every line within 70 columns, so a clack note never wraps one', () => {
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(70);
  });

  it('names the checker under the install’s own floor dir', () => {
    expect(modelsCheckerCommand('.dev/floor', 'validate')).toBe(
      'node .dev/floor/check-model-config.mjs validate',
    );
  });
});
