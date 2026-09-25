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
  it('says Claude Code applies the frontmatter, not the block', () => {
    const lines = modelsLabelLines('pharn/floor');
    expect(lines.join(' ')).toContain(
      "Claude Code applies each /pharn-* command's own model:/effort: frontmatter, not this block.",
    );
    expect(lines.join(' ')).toContain(
      'The block is the source of truth that frontmatter is held to',
    );
    expect(lines.at(-1)).toBe(
      'node pharn/floor/check-model-config.mjs agreement',
    );
    // Never routing that happens.
    expect(lines.join(' ')).not.toMatch(/rout/i);
    // Within 70 columns: a clack note box in an 80-column terminal never
    // wraps a line of it.
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(70);
  });

  it('names the checker under the install’s own floor dir', () => {
    expect(modelsCheckerCommand('.dev/floor', 'validate')).toBe(
      'node .dev/floor/check-model-config.mjs validate',
    );
  });
});
